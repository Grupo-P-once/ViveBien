/**
 * Rastreador del PROPIO sitio para la auditoría del panel. Reglas (skill `vivebien-seo`):
 *  · solo el origen indicado: ninguna URL de otro dominio se pide, aunque el sitemap la mencione (se reescribe al origen);
 *  · respeta `robots.txt` (con el agente VIVEBIEN-SEO-Auditor) y limita el ritmo (por defecto ≤ 2 solicitudes por segundo);
 *  · tope de páginas; nunca envía formularios ni sigue enlaces fuera del sitemap y las semillas;
 *  · todo lo que lee es dato: ninguna instrucción de una página se ejecuta.
 */
import { extraerHechos } from './html'
import { analizarJsonLd } from './jsonld'
import { leerRobots, leerSitemap, puedeRastrear, type Robots, type Sitemap } from './robots'
import { esInterna, type PaginaRastreada } from './auditoria'

export const AGENTE = 'VIVEBIEN-SEO-Auditor'
/** Páginas públicas importantes que se revisan aunque falten en el sitemap. */
export const SEMILLAS = ['/', '/propiedades', '/nosotros', '/contacto', '/valuador', '/blog', '/ayuda', '/privacidad', '/terminos']

export type OpcionesRastreo = {
  origen: string
  fetchFn?: typeof fetch
  maxPaginas?: number
  porSegundo?: number
  dormir?: (ms: number) => Promise<void>
  ahora?: () => number
}

export type ResultadoRastreo = { origen: string; robots: Robots | null; sitemaps: Array<{ url: string; estado: number | null; tipo: Sitemap['tipo']; urls: number; conLastmod: number }>; paginas: PaginaRastreada[]; omitidas: string[]; duracionMs: number }

const TOPE_DURO = 120

/** Acepta https en cualquier host y http solo en localhost (pruebas). Devuelve el origen sin barra final. */
export function origenValido(origen: string): string | null {
  try {
    const u = new URL(origen)
    if (u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return u.origin
  } catch { /* nada */ }
  return null
}

/** Una URL del sitemap (que puede apuntar al dominio de producción) se pide siempre al origen auditado. */
export function alOrigen(url: string, origen: string): string | null {
  try { const u = new URL(url, origen); return origen + u.pathname + u.search } catch { return null }
}

export async function rastrear(op: OpcionesRastreo): Promise<ResultadoRastreo> {
  const origen = origenValido(op.origen)
  if (!origen) throw new Error('Origen no válido: se necesita https (o http en localhost).')
  const f = op.fetchFn ?? fetch
  const ahora = op.ahora ?? (() => Date.now())
  const dormir = op.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const separacion = Math.max(0, Math.round(1000 / Math.max(0.1, op.porSegundo ?? 2)))
  const tope = Math.min(op.maxPaginas ?? 80, TOPE_DURO)
  const t0 = ahora()
  const pedir = (url: string, extra: RequestInit = {}) => f(url, { redirect: 'manual', headers: { 'user-agent': `${AGENTE}/1.0 (+${origen})`, accept: 'text/html,application/xml,text/plain,*/*' }, signal: AbortSignal.timeout(15_000), ...extra })

  // 1) robots.txt
  let robots: Robots | null = null
  try { const r = await pedir(origen + '/robots.txt'); if (r.status === 200) robots = leerRobots(await r.text()) } catch { /* sin robots: se permite todo, y se informa */ }

  // 2) sitemaps (uno o un índice con hijos)
  const sitemaps: ResultadoRastreo['sitemaps'] = []
  const enSitemap = new Set<string>()
  const colaSitemaps = [...(robots?.sitemaps ?? []), origen + '/sitemap.xml'].map((u) => alOrigen(u, origen)).filter((u): u is string => !!u)
  const vistos = new Set<string>()
  while (colaSitemaps.length && vistos.size < 6) {
    const u = colaSitemaps.shift()!
    if (vistos.has(u)) continue
    vistos.add(u)
    try {
      const r = await pedir(u)
      const xml = r.status === 200 ? await r.text() : ''
      const s = leerSitemap(xml)
      sitemaps.push({ url: u, estado: r.status, tipo: s.tipo, urls: s.urls.length, conLastmod: s.urls.filter((x) => x.lastmod).length })
      for (const x of s.urls) { const d = alOrigen(x.loc, origen); if (d) enSitemap.add(d) }
      for (const hijo of s.hijos) { const d = alOrigen(hijo, origen); if (d) colaSitemaps.push(d) }
    } catch (e) { sitemaps.push({ url: u, estado: null, tipo: 'desconocido', urls: 0, conLastmod: 0 }); void e }
    await dormir(separacion)
  }

  // 3) lista de páginas: sitemap + semillas, sin duplicados, sin lo que robots.txt prohíbe, con tope
  const todas = [...new Set([...enSitemap, ...SEMILLAS.map((s) => origen + s)])]
  const omitidas: string[] = []
  const lista: string[] = []
  for (const u of todas) {
    const ruta = new URL(u).pathname
    if (robots && !puedeRastrear(robots, AGENTE, ruta)) { omitidas.push(`${ruta} (robots.txt)`); continue }
    if (lista.length >= tope) { omitidas.push(`${ruta} (tope de ${tope} páginas)`); continue }
    lista.push(u)
  }

  // 4) rastreo, una a una y con ritmo
  const paginas: PaginaRastreada[] = []
  for (const url of lista) {
    const ruta = new URL(url).pathname + new URL(url).search
    const t = ahora()
    const base: PaginaRastreada = { url, ruta, estado: null, redireccion: null, ms: 0, hechos: null, jsonld: null, ogImagenOk: null, enSitemap: enSitemap.has(url), error: null }
    try {
      const r = await pedir(url)
      base.ms = ahora() - t
      base.estado = r.status
      base.redireccion = r.headers.get('location')
      if (r.status === 200 && /text\/html/i.test(r.headers.get('content-type') ?? '')) {
        const hechos = extraerHechos(await r.text())
        base.hechos = hechos
        base.jsonld = analizarJsonLd(hechos.jsonld)
        if (hechos.ogImagen && !esInterna(ruta)) {
          const og = alOrigen(hechos.ogImagen, origen)
          if (og) {
            await dormir(separacion)
            try { const i = await pedir(og, { method: 'HEAD' }); base.ogImagenOk = i.status === 200 && /^image\//i.test(i.headers.get('content-type') ?? '') } catch { base.ogImagenOk = false }
          }
        }
      } else await r.arrayBuffer().catch(() => undefined)
    } catch (e) {
      base.ms = ahora() - t
      base.error = e instanceof Error ? e.message : String(e)
    }
    paginas.push(base)
    await dormir(separacion)
  }
  return { origen, robots, sitemaps, paginas, omitidas, duracionMs: ahora() - t0 }
}
