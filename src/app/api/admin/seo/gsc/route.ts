import { NextResponse } from 'next/server'
import { exigir } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { consultarRendimiento, DIMENSIONES, leerConfigGsc, tokenDeAcceso, type DimensionGsc } from '@/lib/seo/gsc'

/**
 * Rendimiento de Search Console EN VIVO (Fase B del apartado SEO, solo Super Admin). Solo lectura. Sin claves: identidad federada con el token OIDC de Vercel
 * (ver `lib/seo/gsc.ts`). Si falta configuración responde 200 con `configurado: false` y los NOMBRES de lo que falta: el panel sigue funcionando con CSV.
 */
export const dynamic = 'force-dynamic'

const DIAS = [7, 28, 90] as const

export async function GET(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`seo-lectura:${auth.perfil?.uid ?? 'anon'}`, TOPES.seoLectura)
  if (frenado) return frenado

  const q = new URL(req.url).searchParams
  const dimension = (q.get('dimension') ?? 'query') as DimensionGsc
  const dias = Number(q.get('dias') ?? 28)
  if (!DIMENSIONES.includes(dimension)) return NextResponse.json({ error: 'Dimensión no válida.' }, { status: 400 })
  if (!(DIAS as readonly number[]).includes(dias)) return NextResponse.json({ error: 'Rango no válido (7, 28 o 90 días).' }, { status: 400 })

  const cfg = leerConfigGsc(process.env)
  if (!cfg.ok) return NextResponse.json({ configurado: false, faltan: cfg.faltan })

  // Vercel entrega el token de ESTA ejecución en la cabecera; en local (`vercel env pull`) llega por variable de entorno.
  const tokenOidc = req.headers.get('x-vercel-oidc-token') ?? process.env.VERCEL_OIDC_TOKEN
  if (!tokenOidc) return NextResponse.json({ configurado: false, faltan: ['token OIDC de Vercel (solo existe en un despliegue)'] })

  try {
    const acceso = await tokenDeAcceso(cfg.config, tokenOidc)
    const r = await consultarRendimiento(acceso, cfg.config.sitio, { dimension, dias })
    return NextResponse.json({ configurado: true, generado: new Date().toISOString(), dimension, ...r })
  } catch (e) {
    console.error('seo/gsc', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'No se pudo consultar Search Console. Revisa que la cuenta de servicio sea usuaria de la propiedad.' }, { status: 502 })
  }
}
