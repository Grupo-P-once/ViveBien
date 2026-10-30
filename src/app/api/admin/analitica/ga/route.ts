import { NextResponse } from 'next/server'
import { exigir } from '@/lib/auth-server'
import { NEGOCIO } from '@/lib/config/negocio'
import { frenarAsync, TOPES } from '@/lib/limites'
import { ALCANCE_ANALYTICS, leerConfigGsc, tokenDeAcceso } from '@/lib/seo/gsc'
import { causaDelError, consultarGa4 } from '@/lib/seo/ga4'
import { validarPeriodo } from '@/lib/seo/persistencia'

/**
 * Google Analytics 4 dentro del panel (solo Super Admin; mismo permiso que el apartado SEO). Solo lectura. Sin claves: identidad federada de Vercel.
 * Sin configuración responde 200 con `configurado: false` y los NOMBRES de lo que falta; si Google rechaza, dice QUÉ hay que hacer (API apagada o
 * falta dar acceso a la cuenta de servicio), sin enseñar nada interno.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`seo-lectura:${auth.perfil?.uid ?? 'anon'}`, TOPES.seoLectura)
  if (frenado) return frenado

  const dias = validarPeriodo(new URL(req.url).searchParams.get('dias') ?? 28)
  if (!dias) return NextResponse.json({ error: 'Rango no válido (7, 28 o 90 días).' }, { status: 400 })

  const cfg = leerConfigGsc(process.env)
  if (!cfg.ok) return NextResponse.json({ configurado: false, faltan: cfg.faltan })
  const tokenOidc = req.headers.get('x-vercel-oidc-token') ?? process.env.VERCEL_OIDC_TOKEN
  if (!tokenOidc) return NextResponse.json({ configurado: false, faltan: ['token OIDC de Vercel (solo existe en un despliegue)'] })
  const propiedad = process.env.GA4_PROPERTY_ID?.trim() || NEGOCIO.ga4Propiedad

  try {
    const acceso = await tokenDeAcceso(cfg.config, tokenOidc, fetch, ALCANCE_ANALYTICS)
    const resumen = await consultarGa4(acceso, propiedad, dias)
    return NextResponse.json({ configurado: true, generado: new Date().toISOString(), propiedad, ...resumen })
  } catch (e) {
    const causa = causaDelError(e)
    console.error('analitica/ga', causa.codigo, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: causa.ayuda, codigo: causa.codigo }, { status: 502 })
  }
}
