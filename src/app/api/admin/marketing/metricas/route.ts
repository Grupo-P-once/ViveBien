import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { entornoCorreo, entornoDeCupo } from '@/lib/correo/config'
import { BIBLIOTECA } from '@/lib/correo/biblioteca'
import { calcular, datosDeDemostracion, DEFINICIONES, diaLocal, NO_DISPONIBLES, rangoDeUltimosDias, validarRango, ZONA, type FilaBaja, type FilaEnvio, type FiltroGrupo, type Rango } from '@/lib/correo/metricas'

/**
 * Resultados de correo del panel «Marketing · Correos». SOLO LECTURA y SOLO AGREGADOS: no lee direcciones (ni siquiera la huella), nombres ni listas de personas.
 *  · Datos REALES: del libro `correo_envios` y de las bajas de `correo_suscriptores` de ESTA base. En producción sólo cuentan los envíos de la rebanada
 *    'produccion'; en un Preview/staging sólo los de 'pruebas' (envíos SIMULADOS, ninguno salió por Resend) y así se rotulan. Nunca se rotula staging como producción.
 *  · `demo=1` (sólo fuera de producción) devuelve datos SINTÉTICOS calculados con el mismo código; van aparte y rotulados, jamás mezclados con los reales.
 * La autoridad es esta ruta (`correo.ver`); la pantalla sólo presenta.
 */
export const dynamic = 'force-dynamic'

const DIAS_PERMITIDOS = new Set([7, 30, 90])
const TIPO = /^[a-z0-9_.-]{1,60}$/
const PAGINA = 1000
const MAX_PAGINAS = 10
const DIA_MS = 86_400_000

type Pagina = { data: unknown[] | null; error: unknown }

/** Lee por páginas (PostgREST corta en 1000 filas). Devuelve `null` si la tabla no existe (migración sin aplicar). */
async function leer(consulta: (a: number, b: number) => PromiseLike<Pagina>): Promise<{ filas: Record<string, unknown>[]; truncado: boolean } | null> {
  const filas: Record<string, unknown>[] = []
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const r = await consulta(p * PAGINA, p * PAGINA + PAGINA - 1)
    if (r.error || !r.data) return p === 0 ? null : { filas, truncado: true }
    filas.push(...(r.data as Record<string, unknown>[]))
    if (r.data.length < PAGINA) return { filas, truncado: false }
  }
  return { filas, truncado: true }
}

async function contar(tabla: string, filtro?: (q: any) => any): Promise<number | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const q = supabaseAdmin().from(tabla).select('*', { count: 'exact', head: true })
    const r = await (filtro ? filtro(q) : q)
    return r.error || typeof r.count !== 'number' ? null : r.count
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const auth = await exigir(req, 'correo.ver')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`marketing-lectura:${auth.perfil.uid}`, TOPES.marketingPanel)
  if (frenado) return frenado

  const q = new URL(req.url).searchParams
  const ahora = new Date()
  const enProduccion = entornoDeCupo() === 'produccion'

  const dias = q.get('dias')
  let rango: Rango
  if (q.get('desde') || q.get('hasta')) {
    rango = { desde: q.get('desde') ?? '', hasta: q.get('hasta') ?? '' }
    const v = validarRango(rango, ahora)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  } else {
    const n = dias === null ? 30 : Number(dias)
    if (!DIAS_PERMITIDOS.has(n)) return NextResponse.json({ error: 'El periodo debe ser de 7, 30 o 90 días, o un rango de fechas.' }, { status: 400 })
    rango = rangoDeUltimosDias(n, ahora)
  }

  const tipo = q.get('tipo') || null
  if (tipo !== null && !TIPO.test(tipo)) return NextResponse.json({ error: 'Tipo de correo no válido.' }, { status: 400 })
  const grupo = (q.get('grupo') ?? 'todos') as FiltroGrupo
  if (!['todos', 'servicio', 'promocional'].includes(grupo)) return NextResponse.json({ error: 'Grupo no válido.' }, { status: 400 })
  const campana = q.get('campana')
  if (campana !== null && campana !== '' && campana !== 'todas') return NextResponse.json({ error: 'Todavía no existen campañas: no se puede filtrar por campaña.' }, { status: 400 })
  const demo = q.get('demo') === '1'
  if (demo && enProduccion) return NextResponse.json({ error: 'Los datos de demostración no existen en producción.' }, { status: 400 })

  const filtro = { ...rango, tipo, grupo }
  const cabeceras = { 'Cache-Control': 'private, no-store' }
  const comun = { generado: ahora.toISOString(), zona: ZONA, hoy: diaLocal(ahora), definiciones: DEFINICIONES, noDisponibles: NO_DISPONIBLES, nombresDeTipo: Object.fromEntries(BIBLIOTECA.map((t) => [t.id, t.nombre])) }

  if (demo) {
    const d = datosDeDemostracion(rango)
    return NextResponse.json({
      ...comun,
      origen: { tipo: 'demostracion', entorno: 'preview_staging', descripcion: 'DATOS DE DEMOSTRACIÓN: valores sintéticos generados por el sistema. No son envíos reales ni de esta base.' },
      fuentes: { webhookConfigurado: null, eventosDelProveedor: null, truncado: false },
      resultado: calcular(d.filas, d.bajas, filtro),
    }, { headers: cabeceras })
  }

  const entornoDatos = enProduccion ? 'produccion' : 'pruebas'
  const origen = enProduccion
    ? { tipo: 'real', entorno: 'produccion', descripcion: 'Base de producción: envíos reales por Resend.' }
    : { tipo: 'real', entorno: 'preview_staging', descripcion: 'Base de pruebas (staging) de este Preview: los envíos registrados aquí son SIMULADOS (ninguno salió por Resend) y NO son datos de producción.' }

  // Margen de un día a cada lado: el filtro por día se aplica después, en la zona de VIVE BIEN.
  const desdeIso = new Date(Date.parse(`${rango.desde}T00:00:00Z`) - DIA_MS).toISOString()
  const hastaIso = new Date(Date.parse(`${rango.hasta}T00:00:00Z`) + 2 * DIA_MS).toISOString()
  const envios = await leer((a, b) => supabaseAdmin().from('correo_envios').select('categoria, tipo, estado, creado_en').eq('entorno', entornoDatos).gte('creado_en', desdeIso).lt('creado_en', hastaIso).order('id', { ascending: true }).range(a, b) as unknown as PromiseLike<Pagina>)
  if (!envios) {
    return NextResponse.json({ ...comun, origen, disponible: false, motivo: 'libro_sin_migracion', explicacion: 'La migración del libro de correo no está aplicada en esta base: no hay resultados que mostrar.' }, { headers: cabeceras })
  }
  const filasEnvio: FilaEnvio[] = envios.filas.map((f) => ({ categoria: String(f.categoria), tipo: String(f.tipo), estado: String(f.estado), momento: String(f.creado_en) }))

  const bajasLeidas = await leer((a, b) => supabaseAdmin().from('correo_suscriptores').select('baja_en').eq('estado', 'baja').gte('baja_en', desdeIso).lt('baja_en', hastaIso).order('baja_en', { ascending: true }).range(a, b) as unknown as PromiseLike<Pagina>)
  const filasBaja: FilaBaja[] = (bajasLeidas?.filas ?? []).map((f) => ({ baja_en: String(f.baja_en) }))
  const [antes, vigentes, eventos] = await Promise.all([
    contar('correo_suscriptores', (c) => c.eq('estado', 'baja').lt('baja_en', desdeIso)),
    contar('correo_suscriptores', (c) => c.eq('estado', 'baja')),
    contar('correo_webhook_vistos'),
  ])

  return NextResponse.json({
    ...comun,
    origen,
    disponible: true,
    fuentes: { webhookConfigurado: Boolean(entornoCorreo().webhookSecret), eventosDelProveedor: eventos, truncado: envios.truncado || (bajasLeidas?.truncado ?? false) },
    resultado: calcular(filasEnvio, { filas: filasBaja, acumuladasAntes: antes ?? 0, vigentes: vigentes ?? 0 }, filtro),
  }, { headers: cabeceras })
}
