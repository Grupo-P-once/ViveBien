import { NextResponse } from 'next/server'
import { clienteServidor } from '@/lib/supabase-servidor'
import { esVisibleAlPublico } from '@/lib/visibilidad-publica'
import { frenar, origenDe, TOPES } from '@/lib/limites'
import { estimar, grupoDeTipo, type Anuncio } from '@/lib/valuador/estimar'
import { validarEntrada } from '@/lib/valuador/validar'

/**
 * /api/valuador — estimación ORIENTATIVA de mercado con los comparables del catálogo público (ver `lib/valuador/estimar.ts`).
 *
 *  · GET  → colonias de León con anuncios (para el buscador del paso 1) y cuántos anuncios hay por tipo y operación (para decir, antes de
 *           pedir datos, si hay base para estimar). Sin datos personales: solo columnas públicas.
 *  · POST → valida la entrada EN EL SERVIDOR (la validación del navegador no es una frontera), lee los comparables y responde con el rango,
 *           la confianza, los comparables y lo que falta. No escribe nada, no guarda la consulta y no pide ni recibe datos de contacto.
 *
 * Falla cerrado: si la base no responde se contesta 503 sin cifra (nunca una estimación con datos a medias).
 */

export const dynamic = 'force-dynamic'

const COLUMNAS = 'id, slug, titulo, tipo, operacion, precio, moneda, colonia, ciudad, metros, recamaras, banos, estatus, estado_pub'

async function leerAnuncios(): Promise<Anuncio[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !clave) throw new Error('sin configuración de lectura')
  const db = clienteServidor(url, clave, 'publico')
  const { data, error } = await db.from('propiedades').select(COLUMNAS).order('created_at', { ascending: false }).limit(1000)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Anuncio[]).filter((a) => esVisibleAlPublico(a))
}

export async function GET(req: Request) {
  const frenado = frenar(`valuador-lista:${origenDe(req)}`, TOPES.valuador)
  if (frenado) return frenado
  try {
    const anuncios = await leerAnuncios()
    const colonias = new Map<string, { nombre: string; n: number }>()
    const conteo: Record<string, number> = {}
    for (const a of anuncios) {
      const g = grupoDeTipo(a.tipo)
      const op = (a.operacion ?? '').toString().toLowerCase()
      if (g && (op === 'venta' || op === 'renta')) conteo[`${op}:${g}`] = (conteo[`${op}:${g}`] ?? 0) + 1
      const c = (a.colonia ?? '').trim()
      if (!c) continue
      const k = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      const previo = colonias.get(k)
      colonias.set(k, { nombre: previo?.nombre ?? c, n: (previo?.n ?? 0) + 1 })
    }
    return NextResponse.json({ colonias: [...colonias.values()].sort((x, y) => y.n - x.n || x.nombre.localeCompare(y.nombre, 'es')), conteo })
  } catch (err) {
    console.error('[valuador] lista:', err instanceof Error ? err.message.slice(0, 120) : 'error')
    return NextResponse.json({ colonias: [], conteo: {}, error: 'No pudimos consultar el catálogo ahora.' }, { status: 503 })
  }
}

export async function POST(req: Request) {
  const frenado = frenar(`valuador:${origenDe(req)}`, TOPES.valuador)
  if (frenado) return frenado
  let cuerpo: unknown
  try { cuerpo = await req.json() } catch { return NextResponse.json({ error: 'La solicitud no es válida.' }, { status: 400 }) }
  const v = validarEntrada(cuerpo)
  if (!v.ok) return NextResponse.json({ error: v.error, campo: v.campo }, { status: 400 })
  try {
    const anuncios = await leerAnuncios()
    const resultado = estimar(v.entrada, anuncios)
    return NextResponse.json({
      entrada: v.entrada, resultado, fecha: new Date().toISOString(),
      aviso: 'Estimación orientativa de mercado basada en precios de oferta de VIVE BIEN. No es un avalúo oficial, hipotecario ni certificado.',
    })
  } catch (err) {
    console.error('[valuador] estimación:', err instanceof Error ? err.message.slice(0, 120) : 'error')
    return NextResponse.json({ error: 'No pudimos consultar el catálogo ahora. Inténtalo de nuevo en un momento.' }, { status: 503 })
  }
}
