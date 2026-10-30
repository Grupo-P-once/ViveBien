import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import { frenarAsync, TOPES } from '@/lib/limites'
import { cuerpoJson, respuestaDeErrorBase } from '@/lib/seo/db'
import { esUuid, validarPrompt } from '@/lib/seo/persistencia'

/**
 * Registro manual de preguntas a asistentes de IA y de si VIVE BIEN aparece citada (solo Super Admin). No hay scraping ni «puntajes de visibilidad»:
 * solo lo que una persona observó, con fecha. Persistencia de la Fase C (migración 37).
 */
export const dynamic = 'force-dynamic'

const COLUMNAS = 'id, prompt, motor, aparece, cita_url, nota, observado_en, creado_por, creado_en'

export async function GET(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`seo-lectura:${auth.perfil?.uid ?? 'anon'}`, TOPES.seoLectura)
  if (frenado) return frenado
  const { data, error } = await supabaseAdmin().from('seo_prompts_ia').select(COLUMNAS).order('observado_en', { ascending: false }).order('creado_en', { ascending: false }).limit(200)
  if (error) return respuestaDeErrorBase(error, 'prompts')
  return NextResponse.json({ prompts: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error || !auth.perfil) return auth.error
  const frenado = await frenarAsync(`seo-escritura:${auth.perfil.uid}`, TOPES.seoEscritura)
  if (frenado) return frenado
  const v = validarPrompt(await cuerpoJson(req))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data, error } = await supabaseAdmin().from('seo_prompts_ia').insert({ ...v.valor, creado_por: auth.perfil.email ?? auth.perfil.uid }).select(COLUMNAS).single()
  if (error) return respuestaDeErrorBase(error, 'prompts')
  await registrar({ actor: auth.perfil, accion: 'seo.prompt.crear', entidad: 'seo_prompts_ia', entidadId: data.id, despues: { motor: v.valor.motor, aparece: v.valor.aparece } })
  return NextResponse.json({ prompt: data }, { status: 201 })
}

export async function DELETE(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error || !auth.perfil) return auth.error
  const frenado = await frenarAsync(`seo-escritura:${auth.perfil.uid}`, TOPES.seoEscritura)
  if (frenado) return frenado
  const id = new URL(req.url).searchParams.get('id')
  if (!esUuid(id)) return NextResponse.json({ error: 'Identificador no válido.' }, { status: 400 })
  // Se lee antes de borrar para poder decir «no existe» y para la bitácora (PostgREST responde 204 aunque no borre nada).
  const db = supabaseAdmin()
  const previo = await db.from('seo_prompts_ia').select('id, motor, aparece').eq('id', id).maybeSingle()
  if (previo.error) return respuestaDeErrorBase(previo.error, 'prompts')
  if (!previo.data) return NextResponse.json({ error: 'No existe ese registro.' }, { status: 404 })
  const { error } = await db.from('seo_prompts_ia').delete().eq('id', id)
  if (error) return respuestaDeErrorBase(error, 'prompts')
  await registrar({ actor: auth.perfil, accion: 'seo.prompt.borrar', entidad: 'seo_prompts_ia', entidadId: id, antes: previo.data })
  return NextResponse.json({ ok: true })
}
