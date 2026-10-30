import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import { frenarAsync, TOPES } from '@/lib/limites'
import { cuerpoJson, respuestaDeErrorBase } from '@/lib/seo/db'
import { consultarRendimiento, leerConfigGsc, tokenDeAcceso } from '@/lib/seo/gsc'
import { armarFoto, validarPeriodo } from '@/lib/seo/persistencia'

/**
 * Historial de cifras de Search Console (solo Super Admin). «Guardar foto» pide a Google las cifras DESDE EL SERVIDOR y las guarda: el navegador solo elige
 * el periodo (7, 28 o 90 días), nunca manda números. Persistencia de la Fase C (migración 37).
 */
export const dynamic = 'force-dynamic'

const COLUMNAS = 'id, tomado_en, periodo_dias, rango_desde, rango_hasta, clics, impresiones, ctr, posicion, top_consultas, top_paginas, creado_por'

export async function GET(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`seo-lectura:${auth.perfil?.uid ?? 'anon'}`, TOPES.seoLectura)
  if (frenado) return frenado
  const { data, error } = await supabaseAdmin().from('seo_historial').select(COLUMNAS).order('tomado_en', { ascending: false }).limit(60)
  if (error) return respuestaDeErrorBase(error, 'historial')
  return NextResponse.json({ fotos: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error || !auth.perfil) return auth.error
  const frenado = await frenarAsync(`seo-escritura:${auth.perfil.uid}`, TOPES.seoEscritura)
  if (frenado) return frenado
  const dias = validarPeriodo((await cuerpoJson(req) as { dias?: unknown } | null)?.dias ?? 28)
  if (!dias) return NextResponse.json({ error: 'Periodo no válido (7, 28 o 90 días).' }, { status: 400 })

  const cfg = leerConfigGsc(process.env)
  if (!cfg.ok) return NextResponse.json({ configurado: false, faltan: cfg.faltan }, { status: 409 })
  const tokenOidc = req.headers.get('x-vercel-oidc-token') ?? process.env.VERCEL_OIDC_TOKEN
  if (!tokenOidc) return NextResponse.json({ configurado: false, faltan: ['token OIDC de Vercel (solo existe en un despliegue)'] }, { status: 409 })

  let foto
  try {
    const acceso = await tokenDeAcceso(cfg.config, tokenOidc)
    const [fechas, consultas, paginas] = await Promise.all(
      (['date', 'query', 'page'] as const).map((dimension) => consultarRendimiento(acceso, cfg.config.sitio, { dimension, dias })),
    )
    foto = { rango: fechas.rango, ...armarFoto(fechas.filas, consultas.filas, paginas.filas) }
  } catch (e) {
    console.error('seo/historial', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'No se pudo consultar Search Console. Revisa que la cuenta de servicio sea usuaria de la propiedad.' }, { status: 502 })
  }

  const { rango, ...cifras } = foto
  const { data, error } = await supabaseAdmin().from('seo_historial')
    .insert({ periodo_dias: dias, rango_desde: rango.desde, rango_hasta: rango.hasta, ...cifras, creado_por: auth.perfil.email ?? auth.perfil.uid })
    .select(COLUMNAS).single()
  if (error) return respuestaDeErrorBase(error, 'historial')
  await registrar({ actor: auth.perfil, accion: 'seo.historial.foto', entidad: 'seo_historial', entidadId: data.id, despues: { periodo_dias: dias, clics: cifras.clics, impresiones: cifras.impresiones } })
  return NextResponse.json({ foto: data }, { status: 201 })
}
