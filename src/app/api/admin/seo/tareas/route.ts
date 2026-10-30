import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import { frenarAsync, TOPES } from '@/lib/limites'
import { cuerpoJson, respuestaDeErrorBase } from '@/lib/seo/db'
import { validarCambioDeTarea, validarTarea } from '@/lib/seo/persistencia'

/** «Qué hacer» del apartado SEO: la lista de tareas con evidencia (solo Super Admin). Persistencia de la Fase C (migración 37). */
export const dynamic = 'force-dynamic'

const COLUMNAS = 'id, titulo, detalle, area, prioridad, estado, evidencia, creada_por, creada_en, actualizada_en, resuelta_en'

export async function GET(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`seo-lectura:${auth.perfil?.uid ?? 'anon'}`, TOPES.seoLectura)
  if (frenado) return frenado
  const { data, error } = await supabaseAdmin().from('seo_tareas').select(COLUMNAS).order('creada_en', { ascending: false }).limit(200)
  if (error) return respuestaDeErrorBase(error, 'tareas')
  return NextResponse.json({ tareas: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error || !auth.perfil) return auth.error
  const frenado = await frenarAsync(`seo-escritura:${auth.perfil.uid}`, TOPES.seoEscritura)
  if (frenado) return frenado
  const v = validarTarea(await cuerpoJson(req))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data, error } = await supabaseAdmin().from('seo_tareas').insert({ ...v.valor, creada_por: auth.perfil.email ?? auth.perfil.uid }).select(COLUMNAS).single()
  if (error) return respuestaDeErrorBase(error, 'tareas')
  await registrar({ actor: auth.perfil, accion: 'seo.tarea.crear', entidad: 'seo_tareas', entidadId: data.id, despues: { titulo: v.valor.titulo, area: v.valor.area, prioridad: v.valor.prioridad } })
  return NextResponse.json({ tarea: data }, { status: 201 })
}

export async function PATCH(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error || !auth.perfil) return auth.error
  const frenado = await frenarAsync(`seo-escritura:${auth.perfil.uid}`, TOPES.seoEscritura)
  if (frenado) return frenado
  const v = validarCambioDeTarea(await cuerpoJson(req))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const ahora = new Date().toISOString()
  const cerrada = v.valor.estado === 'hecha' || v.valor.estado === 'descartada'
  const { data, error } = await supabaseAdmin().from('seo_tareas')
    .update({ estado: v.valor.estado, actualizada_en: ahora, resuelta_en: cerrada ? ahora : null })
    .eq('id', v.valor.id).select(COLUMNAS)
  if (error) return respuestaDeErrorBase(error, 'tareas')
  if (!data || data.length === 0) return NextResponse.json({ error: 'No existe esa tarea.' }, { status: 404 })
  await registrar({ actor: auth.perfil, accion: 'seo.tarea.estado', entidad: 'seo_tareas', entidadId: v.valor.id, despues: { estado: v.valor.estado } })
  return NextResponse.json({ tarea: data[0] })
}
