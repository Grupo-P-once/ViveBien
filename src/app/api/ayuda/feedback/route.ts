import { NextResponse } from 'next/server'
import { conMetricas } from '@/lib/http-metricas'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { clienteServidor } from '@/lib/supabase-servidor'

/**
 * POST /api/ayuda/feedback — «¿te sirvió este artículo?».
 *
 * Anónimo a propósito: no se guarda uid, ni correo, ni IP. Saber si un
 * artículo sirve no requiere saber quién lo leyó, y guardar de más es
 * guardar un problema.
 *
 * Se escribe con la clave de SERVICIO (desde la migración 61 `anon` ya no puede insertar en `knowledge_feedback`): sólo se acepta
 * sobre un artículo público y publicado, y eso lo comprueba esta ruta.
 *
 * ─────────────────────────────────────────────────────────────
 * DEFENSA EN CAPAS CONTRA EL ABUSO (E-35 / QA-003, D-62)
 *
 * Es una escritura anónima: la única frontera real son los topes. Capas, de más barata a más cara:
 *   1. tope por origen en total (`TOPES.feedback`), ANTES de leer nada;
 *   2. tamaño del cuerpo acotado (4 KB): se corta la lectura al pasarse, no se carga un cuerpo enorme en memoria;
 *   3. forma del id del artículo (letras, números, `-` y `_`, hasta 64): nada raro llega a la consulta;
 *   4. tope por origen Y artículo (`TOPES.feedbackArticulo`): una sola persona no puede inflar la puntuación de UN artículo;
 *   5. el comentario se recorta a 500 caracteres y la ruta (no el RLS) decide qué artículos aceptan opiniones; además la base ya no
 *      acepta inserciones directas con la clave pública (migración 61).
 *
 * Limitación honesta: los contadores viven en la memoria de cada instancia salvo que se configure un almacén compartido (Upstash, ver
 * `lib/limites-almacen.ts`). Con varias instancias el tope real puede multiplicarse; por eso las capas 2, 3 y 5 no dependen del contador.
 * ─────────────────────────────────────────────────────────────
 */
const MAX_CUERPO_BYTES = 4096
const ID_ARTICULO = /^[A-Za-z0-9_-]{1,64}$/
const SIN_CACHE = { 'Cache-Control': 'no-store' }

/**
 * El 429 sale de `frenarAsync` con `Retry-After`; aquí se le añade `Cache-Control: no-store` (Codex E-35, P3) SIN tocar el helper, para no
 * cambiar la respuesta de ninguna de las otras rutas limitadas.
 */
function sinCache(r: NextResponse): NextResponse {
  r.headers.set('Cache-Control', 'no-store')
  return r
}

/** Lee el cuerpo como texto, pero se rinde (null) en cuanto supera el tope: no se acumula un cuerpo enorme. */
async function leerAcotado(req: Request): Promise<string | null> {
  const declarado = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declarado) && declarado > MAX_CUERPO_BYTES) return null
  if (!req.body) return ''
  const lector = req.body.getReader()
  const trozos: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_CUERPO_BYTES) { await lector.cancel().catch(() => {}); return null }
    trozos.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(trozos))
}

async function recibirFeedback(req: Request) {
  const origen = origenDe(req)
  // R-03 / QA-003 (D-62): antes de leer el cuerpo y antes de escribir. Anónimo + escribe en la base = necesita tope.
  const frenado = await frenarAsync(`feedback:${origen}`, TOPES.feedback)
  if (frenado) return sinCache(frenado)

  const texto = await leerAcotado(req)
  if (texto === null) return NextResponse.json({ error: 'El mensaje es demasiado grande.' }, { status: 413, headers: SIN_CACHE })

  let cuerpo: Record<string, unknown> = {}
  try { cuerpo = JSON.parse(texto) as Record<string, unknown> } catch { /* cuerpo vacío o roto: cae en el 400 de abajo */ }
  const articuloId = typeof cuerpo.articuloId === 'string' && ID_ARTICULO.test(cuerpo.articuloId) ? cuerpo.articuloId : null
  const util = typeof cuerpo.util === 'boolean' ? cuerpo.util : null
  if (!articuloId || util === null) {
    return NextResponse.json({ error: 'Falta el artículo o la respuesta.' }, { status: 400, headers: SIN_CACHE })
  }

  const porArticulo = await frenarAsync(`feedback:${origen}:${articuloId}`, TOPES.feedbackArticulo)
  if (porArticulo) return sinCache(porArticulo)

  const comentario = typeof cuerpo.comentario === 'string'
    ? cuerpo.comentario.trim().slice(0, 500) || null
    : null

  // Clave de SERVICIO, no la anónima (migración 61): la clave anónima viaja en el navegador y con ella cualquiera podía insertar directo
  // en PostgREST saltándose TODOS los topes de arriba (relleno de la base; el plan gratuito pasa a solo lectura al llenarse). Al saltarse
  // el RLS, la regla «solo artículos públicos y publicados» ya no la aplica la política: se comprueba aquí con una lectura previa.
  const db = clienteServidor(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, 'api',
  )
  const articulo = await db.from('knowledge_articles').select('id')
    .eq('id', articuloId).eq('ambito', 'publica').eq('estado', 'PUBLICADO').maybeSingle()
  // Sin respuesta distinta para «no existe» y «no es público»: no se le revela a nadie qué ids existen.
  if (articulo.error || !articulo.data) return NextResponse.json({ guardado: false }, { status: 200, headers: SIN_CACHE })
  const { error } = await db.from('knowledge_feedback')
    .insert({ articulo_id: articuloId, util, comentario })

  // Que no se pueda guardar la opinión no es motivo para romperle la página
  // a nadie: se agradece igual y se sigue.
  if (error) return NextResponse.json({ guardado: false }, { status: 200, headers: SIN_CACHE })
  return NextResponse.json({ guardado: true }, { headers: SIN_CACHE })
}

export const POST = conMetricas('feedback', recibirFeedback)
