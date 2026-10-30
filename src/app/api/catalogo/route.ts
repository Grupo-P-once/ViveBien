import { NextResponse } from 'next/server'
import { conMetricas } from '@/lib/http-metricas'
import { avisar } from '@/lib/alertas'
import { clienteServidor } from '@/lib/supabase-servidor'
import { SELECT_PUBLICO } from '@/lib/propiedad-publica'
import { esVisibleAlPublico } from '@/lib/visibilidad-publica'
import { adjuntarAsesor, type CuentaParaAsesor } from '@/lib/asesor-publico'
import { coincide, filtrosDeUrl, type Filtros, type PropiedadBuscable } from '@/lib/busquedas'
import { aplicarCondiciones, condicionesDb, LIMITE_CATALOGO } from '@/lib/catalogo-consulta'
import type { Cond } from '@/lib/filtros-mas'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { contar } from '@/lib/metricas'

/**
 * GET /api/catalogo — el catálogo público, con red de seguridad.
 *
 * El 2026-09-10 Supabase devolvió 504 y la página pública se quedó en «0
 * disponibles». Las propiedades seguían ahí; lo que falló fue poder
 * preguntar. Un visitante que ve un catálogo vacío concluye que la
 * inmobiliaria no tiene inventario y se va.
 *
 * Cambiar de proveedor de base de datos no arregla eso: cualquier base
 * alojada se cae. Lo que lo arregla es **no depender de que esté viva para
 * enseñar lo que ya sabíamos**.
 *
 * Dos capas:
 *
 *  1. **Caché corta del borde** (`s-maxage=20`, SIN stale-while-revalidate): la respuesta se
 *     reutiliza 20 s y luego se consulta de verdad. Antes era `revalidate = 300` (ISR): tras un rato sin visitas, o justo después de editar una propiedad, la primera
 *     persona recibía una copia VIEJA (se midió una de 705 s) y veía «las tarjetas de antes» (incidente 27-oct-2026). Con esto lo más viejo que se ve es 20 s.
 *  2. **Última copia buena en memoria**: si la consulta falla, se devuelve lo
 *     último que sí funcionó, marcado como `desactualizado` para que la
 *     interfaz pueda decirlo. Enseñar datos de hace diez minutos es
 *     infinitamente mejor que enseñar cero — **siempre que se diga**.
 *
 * La copia en memoria vive por instancia y se pierde en cada despliegue. No
 * es una base de datos de repuesto: es un amortiguador.
 */

// Sin `revalidate` (ISR): su stale-while-revalidate servía copias viejas sin límite. Una prueba (tests/catalogo-frescura.test.ts) lo vigila.
export const dynamic = 'force-dynamic'

const CACHE_BORDE = 'public, max-age=0, s-maxage=20'
/** La copia en memoria solo se sirve si es reciente: una de hace horas enseñaría un inventario que ya no existe. */
const EDAD_MAXIMA_DE_LA_COPIA_MS = 60 * 60 * 1000

type Fila = Record<string, unknown>

/** Última respuesta buena. Sobrevive entre peticiones en la misma instancia. */
let ultimaBuena: { datos: Fila[]; cuando: number; truncado: boolean } | null = null

function clienteLectura() {
  return clienteServidor(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'publico',
  )
}

/**
 * «Publicado por»: añade `asesor` a cada anuncio (un asociado, o `null` = VIVE BIEN). El dueño y el perfil NO son públicos (RLS), así que se
 * leen aquí, en el servidor, y a la respuesta solo llegan el nombre y la foto del ASOCIADO (lib/asesor-publico.ts: nunca uid, correo ni
 * teléfono). Falla CERRADO: si cualquiera de las dos lecturas falla o tarda, se devuelve el catálogo SIN la clave `asesor` y la tarjeta no
 * pinta nada (mejor que atribuir un anuncio a quien no es). Nunca tumba el catálogo.
 */
async function conAsesores(visibles: Fila[]): Promise<Fila[]> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !clave) return visibles
    const db = clienteServidor(url, clave, 'publico')
    const leer = async () => {
      // Dueños de LAS FILAS DEVUELTAS (no de las 500 más nuevas): una consulta filtrada trae propiedades antiguas y, sin esto, se atribuirían a VIVE BIEN. En tandas para no pasar el largo de URL.
      const ids = visibles.map((v) => String(v.id))
      const duenos = new Map<string, string | null>()
      for (let i = 0; i < ids.length; i += 80) {
        const { data: duenosFilas, error } = await db.from('propiedades').select('id, owner_id').in('id', ids.slice(i, i + 80))
        if (error) throw new Error(error.message)
        for (const f of (duenosFilas ?? []) as Array<{ id: string; owner_id: string | null }>) duenos.set(String(f.id), f.owner_id ?? null)
      }
      const uids = [...new Set([...duenos.values()].filter((u): u is string => Boolean(u)))].slice(0, 300)
      const cuentas = new Map<string, CuentaParaAsesor>()
      if (uids.length) {
        const { data: cs, error: e2 } = await db.from('usuarios').select('uid, nombre, foto_url, rol, tipo_publicador, permisos_override, estado').in('uid', uids)
        if (e2) throw new Error(e2.message)
        for (const c of (cs ?? []) as Array<CuentaParaAsesor & { uid: string }>) cuentas.set(c.uid, c)
      }
      return adjuntarAsesor(visibles as Array<Fila & { id: unknown }>, duenos, cuentas, process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) as Fila[]
    }
    return await Promise.race([
      leer(),
      new Promise<never>((_, rechaza) => setTimeout(() => rechaza(new Error('tiempo agotado')), 4000)),
    ])
  } catch (err) {
    console.error('[catalogo] sin datos de asesor (se sirve sin ellos):', err instanceof Error ? err.message.slice(0, 120) : 'error')
    return visibles
  }
}

interface ConstructorCatalogo { filter(columna: string, operador: string, valor: unknown): ConstructorCatalogo; or(expresion: string): ConstructorCatalogo }

/** La consulta pública al catálogo, con las condiciones en el WHERE (antes del `limit`). Con `conds` vacío es la consulta de siempre. */
async function consultarCatalogo(conds: Cond[]): Promise<Fila[]> {
  const base = clienteLectura().from('propiedades').select(SELECT_PUBLICO).order('created_at', { ascending: false })
  const filtrada = aplicarCondiciones(base as unknown as ConstructorCatalogo, conds) as unknown as typeof base
  const consulta = filtrada.limit(LIMITE_CATALOGO)
  return Promise.race([
    consulta.then(({ data, error }) => {
      if (error) throw new Error(error.message)
      return (data ?? []) as Fila[]
    }),
    new Promise<never>((_, rechaza) => setTimeout(() => rechaza(new Error('tiempo agotado')), 8000)),
  ])
}

/**
 * GET /api/catalogo?<filtros> — «Más filtros» y los filtros de siempre EN LA CONSULTA (28-oct-2026).
 *
 *  1. Los filtros van en el WHERE: la base filtra ANTES del `limit(500)`; una coincidencia fuera de las 500 más nuevas no se pierde en silencio.
 *  2. Lo que la base solo puede dar como superconjunto (texto con acentos) lo deja EXACTO `coincide`, la misma regla del navegador y de las alertas.
 *  3. Si el filtro en la consulta falla (valor no admitido, error de sintaxis de PostgREST…), NO se muestra un error ni se arma una consulta a medias: se consulta sin filtros de base
 *     y se filtra aquí (`degradado: true`, sin caché). El resultado es correcto; solo está sujeto al límite de 500.
 *  4. `truncado: true` = la base devolvió el límite completo: puede haber más coincidencias de las mostradas. Hoy no hay paginación (propuesta aparte).
 *  5. Si la base no responde: la última copia buena, refinada con los filtros y marcada `desactualizado`; sin copia, 503 (nunca una lista vacía con 200).
 */
async function leerFiltrado(req: Request, filtros: Filtros): Promise<Response> {
  const frenado = await frenarAsync(`catalogo-filtrado:${origenDe(req)}`, TOPES.catalogoFiltrado)
  if (frenado) return frenado
  const ahora = Date.now()
  const { conds, imposible } = condicionesDb(filtros, ahora)
  const exacta = (lista: Fila[]) => lista.filter(esVisibleAlPublico).filter((p) => coincide(p as unknown as PropiedadBuscable, filtros, ahora))

  // Un término de «Características» que no existe en el catálogo no puede tener resultados: ni siquiera se consulta.
  if (imposible) {
    return NextResponse.json({ propiedades: [], desactualizado: false, consultado: new Date(ahora).toISOString(), filtrado: true, truncado: false, degradado: false }, { headers: { 'Cache-Control': CACHE_BORDE } })
  }
  try {
    let datos: Fila[]
    let degradado = false
    try {
      datos = await consultarCatalogo(conds)
    } catch (e) {
      degradado = true
      contar('catalogo.filtro_degradado')
      console.error('[catalogo] el filtro en la consulta falló; se filtra en el servidor:', e instanceof Error ? e.message.slice(0, 120) : 'error')
      datos = await consultarCatalogo([])   // si TAMBIÉN falla, la base no responde: lo atiende el `catch` de abajo
    }
    const visibles = await conAsesores(exacta(datos))
    return NextResponse.json({
      propiedades: visibles, desactualizado: false, consultado: new Date(ahora).toISOString(), filtrado: true, truncado: datos.length >= LIMITE_CATALOGO, degradado,
    }, { headers: { 'Cache-Control': degradado ? 'no-store' : CACHE_BORDE } })
  } catch (err) {
    const motivo = err instanceof Error ? err.message : 'error desconocido'
    console.error('[catalogo] la consulta filtrada falló:', motivo)
    void avisar({
      nivel: 'critico', titulo: 'La base de datos no responde',
      datos: { Detalle: motivo.slice(0, 110), Sirviendo: ultimaBuena && Date.now() - ultimaBuena.cuando <= EDAD_MAXIMA_DE_LA_COPIA_MS ? 'la última copia guardada (filtrada)' : 'nada' },
      accion: 'Revisar Supabase: supabase.com/dashboard/project/uztssyrheqdhtoheecgf', clave: 'base-caida',
    })
    if (ultimaBuena && Date.now() - ultimaBuena.cuando <= EDAD_MAXIMA_DE_LA_COPIA_MS) {
      return NextResponse.json(
        { propiedades: exacta(ultimaBuena.datos), desactualizado: true, consultado: new Date(ultimaBuena.cuando).toISOString(), motivo, filtrado: true, truncado: ultimaBuena.truncado, degradado: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return NextResponse.json({ error: 'No se pudo consultar el catálogo.', motivo }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

async function leerCatalogo(req?: Request) {
  // «Más filtros» (28-oct-2026): con filtros reconocidos en la URL, la consulta lleva el WHERE. Sin ellos, TODO sigue exactamente igual que antes.
  const filtros = req ? filtrosDeUrl(new URL(req.url).searchParams) : null
  if (req && filtros) return leerFiltrado(req, filtros)
  try {
    // Un tiempo límite propio: sin esto, un Supabase que tarda 30 s deja la
    // página cargando 30 s. Mejor fallar rápido y servir la copia.
    // `limit` y no sin tope: OTLI documentó que sus consultas sin LIMIT sobre
    // el historial de conversaciones acabaron en cinco minutos de latencia con
    // tres clientes a la vez. Aquí hay dos propiedades, así que hoy da igual —
    // y por eso mismo es el momento de ponerlo, antes de que importe.
    //
    // V-1.1.77: columnas públicas explícitas (SELECT_PUBLICO). El rol anónimo
    // ya no puede leer las internas (dueño, WhatsApp, notas de moderación…),
    // así que un `select('*')` fallaría. Una prueba vigila que la lista
    // contenga lo que la ficha y el listado usan.
    const consulta = clienteLectura()
      .from('propiedades')
      .select(SELECT_PUBLICO)
      .order('created_at', { ascending: false })
      .limit(500)

    const datos = await Promise.race([
      consulta.then(({ data, error }) => {
        if (error) throw new Error(error.message)
        return (data ?? []) as Fila[]
      }),
      new Promise<never>((_, rechaza) =>
        setTimeout(() => rechaza(new Error('tiempo agotado')), 8000),
      ),
    ])

    // Sólo lo aprobado Y comercialmente visible (no pausada ni archivada). RLS sólo
    // mira `estado_pub`; la regla completa vive en un solo lugar (D-59).
    const visibles = await conAsesores(datos.filter(esVisibleAlPublico))

    ultimaBuena = { datos: visibles, cuando: Date.now(), truncado: datos.length >= LIMITE_CATALOGO }   // el tope se mide ANTES de quitar lo no visible

    return NextResponse.json({
      propiedades: visibles,
      desactualizado: false,
      consultado: new Date().toISOString(),
      // Si la base devolvió el límite completo, puede haber más propiedades de las mostradas (hoy no hay paginación; ver el plan de «Más filtros»).
      truncado: datos.length >= LIMITE_CATALOGO,
    }, { headers: { 'Cache-Control': CACHE_BORDE } })
  } catch (err) {
    const motivo = err instanceof Error ? err.message : 'error desconocido'
    console.error('[catalogo] la consulta falló:', motivo)

    // Al grupo de alertas: si la base no responde, el catálogo se queda con la
    // copia vieja —o vacío— y nadie se entera hasta que un cliente lo dice.
    void avisar({
      nivel: 'critico',
      titulo: 'La base de datos no responde',
      datos: { Detalle: motivo.slice(0, 110), Sirviendo: ultimaBuena && Date.now() - ultimaBuena.cuando <= EDAD_MAXIMA_DE_LA_COPIA_MS ? 'la última copia guardada' : 'nada' },
      accion: 'Revisar Supabase: supabase.com/dashboard/project/uztssyrheqdhtoheecgf',
      clave: 'base-caida',
    })

    if (ultimaBuena && Date.now() - ultimaBuena.cuando <= EDAD_MAXIMA_DE_LA_COPIA_MS) {
      return NextResponse.json(
        {
          propiedades: ultimaBuena.datos,
          desactualizado: true,
          consultado: new Date(ultimaBuena.cuando).toISOString(),
          motivo,
        },
        // No cachear una respuesta degradada: la siguiente petición debe
        // volver a intentarlo de verdad.
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    // Sin copia previa no hay nada que servir. Se dice con un código de
    // error, no con una lista vacía y un 200: un 200 con `[]` es
    // indistinguible de «no hay propiedades», y eso es justo la mentira
    // que se está corrigiendo.
    return NextResponse.json(
      { error: 'No se pudo consultar el catálogo.', motivo },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

// E-38: latencia y estados (2xx/4xx/5xx) en las métricas de la instancia; una excepción deja una línea de error saneada.
export const GET = conMetricas('catalogo', leerCatalogo)
