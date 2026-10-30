import { NextResponse } from 'next/server'
import { exigir } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { auditarPagina, auditarSitio, resumir } from '@/lib/seo/auditoria'
import { resolverOrigen } from '@/lib/seo/origen'
import { rastrear } from '@/lib/seo/rastreador'
import { SITIO } from '@/lib/sitio'

/**
 * Auditoría técnica del sitio público (panel SEO, solo Super Admin).
 *
 * Rastrea el PROPIO sitio (o producción) con ritmo limitado, respetando robots.txt, y devuelve los hallazgos. Solo lectura: no envía formularios, no crea
 * leads, no escribe nada. `alcance=rapida` revisa ~25 páginas; `completa`, hasta 80. El origen solo puede ser el propio despliegue o producción.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error) return auth.error

  const frenado = await frenarAsync(`seo-rastreo:${auth.perfil?.uid ?? 'anon'}`, TOPES.seoRastreo)
  if (frenado) return frenado

  const url = new URL(req.url)
  const o = resolverOrigen(req, url.searchParams.get('origen'), SITIO)
  if ('error' in o) return NextResponse.json({ error: o.error }, { status: 400 })
  const maxPaginas = url.searchParams.get('alcance') === 'rapida' ? 25 : 80

  try {
    const r = await rastrear({ origen: o.origen, maxPaginas, porSegundo: 2 })
    const hallazgos = [...r.paginas.flatMap(auditarPagina), ...auditarSitio(r.paginas)]
    const orden = { critica: 0, alta: 1, media: 2, baja: 3 } as const
    hallazgos.sort((a, b) => orden[a.gravedad] - orden[b.gravedad] || a.ruta.localeCompare(b.ruta))
    return NextResponse.json({
      origen: o.origen, cual: o.cual, alcance: maxPaginas === 25 ? 'rapida' : 'completa', generado: new Date().toISOString(), duracionMs: r.duracionMs,
      resumen: resumir(hallazgos, r.paginas), hallazgos,
      paginas: r.paginas.map((p) => ({ ruta: p.ruta, estado: p.estado, redireccion: p.redireccion, ms: Math.round(p.ms), enSitemap: p.enSitemap, titulo: p.hechos?.titulo ?? null, noindex: p.hechos?.noindex ?? false, jsonld: p.jsonld?.tipos ?? [] })),
      omitidas: r.omitidas, sitemaps: r.sitemaps,
    })
  } catch (e) {
    console.error('seo/auditoria', e)
    return NextResponse.json({ error: 'No se pudo completar la auditoría.' }, { status: 502 })
  }
}
