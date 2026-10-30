import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync } from '@/lib/limites'
import { RUTA_DE_ADJUNTO } from '@/lib/contabilidad-externas'
import { tipoDeArchivo, TOPE_DE_ADJUNTO } from '@/lib/contabilidad-adjuntos'

/**
 * /api/admin/contabilidad/adjuntos — comprobantes (nota, recibo, transferencia) en un bucket PRIVADO de Supabase Storage. SOLO Super Admin. Migración 55.
 *  POST (`contabilidad.registrar`) multipart, campo `archivo` → { ruta, bytes }. PDF, JPG, PNG o WEBP de hasta 4 MB; el tipo se decide por los PRIMEROS BYTES del archivo (no por su nombre ni
 *        por lo que diga el navegador). El nombre real del archivo NO se conserva: la ruta es AAAA/uuid.ext.
 *  GET  (`contabilidad.ver`) ?ruta=AAAA/uuid.ext → 302 a una dirección firmada de 2 minutos; con `&formato=json` devuelve `{ url }` (la pantalla la abre en otra pestaña, porque un enlace
 *        normal no puede llevar la sesión). Sin ruta válida, 404. Nunca hay dirección pública.
 * Es opcional en todos los flujos: si no hay bucket (o falla la subida), la comisión o la constancia se registran igual.
 */
const BUCKET = 'contabilidad-adjuntos'
const SIN_ALMACEN = () => NextResponse.json({ error: 'El almacén de comprobantes todavía no está disponible. Puedes registrar sin adjuntar y agregarlo después.', codigo: 'sin_almacen' }, { status: 503 })

export async function POST(req: Request) {
  const auth = await exigir(req, 'contabilidad.registrar')
  if (auth.error) return auth.error
  const { perfil } = auth
  const frenado = await frenarAsync(`contab-adjunto:${perfil.uid}`, { maximo: 30, ventanaMs: 60 * 60 * 1000 })
  if (frenado) return frenado
  const forma = await req.formData().catch(() => null)
  const archivo = forma?.get('archivo')
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Elige un archivo.' }, { status: 400 })
  if (archivo.size === 0) return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 })
  if (archivo.size > TOPE_DE_ADJUNTO) return NextResponse.json({ error: 'El archivo pesa más de 4 MB. Comprímelo o sube una foto más ligera.' }, { status: 413 })
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const tipo = tipoDeArchivo(bytes)
  if (!tipo) return NextResponse.json({ error: 'Solo se aceptan PDF, JPG, PNG o WEBP.' }, { status: 415 })
  const ruta = `${new Date().getUTCFullYear()}/${randomUUID()}.${tipo.extension}`
  if (!RUTA_DE_ADJUNTO.test(ruta)) return NextResponse.json({ error: 'No se pudo preparar el archivo.' }, { status: 500 })
  const subida = await supabaseAdmin().storage.from(BUCKET).upload(ruta, bytes, { contentType: tipo.mime, upsert: false })
  if (subida.error) return SIN_ALMACEN()
  return NextResponse.json({ ok: true, ruta, bytes: bytes.byteLength }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function GET(req: Request) {
  const auth = await exigir(req, 'contabilidad.ver')
  if (auth.error) return auth.error
  const q = new URL(req.url).searchParams
  const ruta = q.get('ruta') ?? ''
  if (!RUTA_DE_ADJUNTO.test(ruta)) return NextResponse.json({ error: 'Ese archivo no existe.' }, { status: 404 })
  const firma = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(ruta, 120)
  if (firma.error || !firma.data?.signedUrl) return NextResponse.json({ error: 'Ese archivo no existe.' }, { status: 404 })
  if (q.get('formato') === 'json') return NextResponse.json({ url: firma.data.signedUrl }, { headers: { 'Cache-Control': 'private, no-store' } })
  return NextResponse.redirect(firma.data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store' } })
}
