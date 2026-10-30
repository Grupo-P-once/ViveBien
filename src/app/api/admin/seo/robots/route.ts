import { NextResponse } from 'next/server'
import { exigir } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { resolverOrigen } from '@/lib/seo/origen'
import { rastrear } from '@/lib/seo/rastreador'
import { estadoRastreadores } from '@/lib/seo/robots'
import { SITIO } from '@/lib/sitio'

/** robots.txt y sitemap del sitio (panel SEO, solo Super Admin). Lectura ligera: no rastrea páginas. */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`seo-lectura:${auth.perfil?.uid ?? 'anon'}`, TOPES.seoLectura)
  if (frenado) return frenado

  const o = resolverOrigen(req, new URL(req.url).searchParams.get('origen'), SITIO)
  if ('error' in o) return NextResponse.json({ error: o.error }, { status: 400 })
  try {
    const r = await rastrear({ origen: o.origen, maxPaginas: 0, porSegundo: 5 })
    return NextResponse.json({
      origen: o.origen, cual: o.cual, generado: new Date().toISOString(),
      robots: r.robots ? { grupos: r.robots.grupos, sitemaps: r.robots.sitemaps } : null,
      rastreadores: r.robots ? estadoRastreadores(r.robots) : [],
      sitemaps: r.sitemaps,
    })
  } catch (e) {
    console.error('seo/robots', e)
    return NextResponse.json({ error: 'No se pudo leer robots.txt ni el sitemap.' }, { status: 502 })
  }
}
