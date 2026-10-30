/**
 * `robots.txt` y sitemap: lectura y reglas. Código puro.
 * Las reglas de coincidencia son las del estándar de Google: gana la regla más específica (la más larga); a igual longitud, «Allow» gana a «Disallow».
 * `*` es comodín y `$` marca el final de la URL.
 */

export type GrupoRobots = { agentes: string[]; permite: string[]; niega: string[]; retraso: number | null }
export type Robots = { grupos: GrupoRobots[]; sitemaps: string[] }

export function leerRobots(texto: string): Robots {
  const grupos: GrupoRobots[] = []
  const sitemaps: string[] = []
  let actual: GrupoRobots | null = null
  let ultimaFueAgente = false
  for (const bruta of texto.replace(/^﻿/, '').split(/\r?\n/)) {
    const linea = bruta.replace(/#.*$/, '').trim()
    if (!linea) continue
    const i = linea.indexOf(':')
    if (i < 0) continue
    const clave = linea.slice(0, i).trim().toLowerCase()
    const valor = linea.slice(i + 1).trim()
    if (clave === 'sitemap') { if (valor) sitemaps.push(valor); continue }
    if (clave === 'user-agent') {
      if (!actual || !ultimaFueAgente) { actual = { agentes: [], permite: [], niega: [], retraso: null }; grupos.push(actual) }
      actual.agentes.push(valor.toLowerCase())
      ultimaFueAgente = true
      continue
    }
    ultimaFueAgente = false
    if (!actual) continue
    if (clave === 'allow') actual.permite.push(valor)
    else if (clave === 'disallow') actual.niega.push(valor)
    else if (clave === 'crawl-delay') { const n = Number(valor); if (Number.isFinite(n)) actual.retraso = n }
  }
  return { grupos, sitemaps }
}

function aRegex(patron: string): RegExp {
  const fin = patron.endsWith('$')
  const cuerpo = (fin ? patron.slice(0, -1) : patron).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + cuerpo + (fin ? '$' : ''))
}

/** El grupo que manda para un agente: el de nombre más específico que lo contiene; si no, «*». */
function grupoPara(r: Robots, agente: string): GrupoRobots | null {
  const a = agente.toLowerCase()
  let mejor: { g: GrupoRobots; largo: number } | null = null
  for (const g of r.grupos) for (const nombre of g.agentes) {
    if (nombre === '*') { if (!mejor) mejor = { g, largo: 0 } ; continue }
    if (a.includes(nombre) && (!mejor || nombre.length > mejor.largo)) mejor = { g, largo: nombre.length }
  }
  return mejor?.g ?? null
}

export function puedeRastrear(r: Robots, agente: string, ruta: string): boolean {
  const g = grupoPara(r, agente)
  if (!g) return true
  let mejor = { largo: -1, permite: true }
  for (const [lista, permite] of [[g.permite, true], [g.niega, false]] as const) {
    for (const p of lista) {
      if (p === '') continue                      // «Disallow:» vacío = todo permitido
      if (aRegex(p).test(ruta) && (p.length > mejor.largo || (p.length === mejor.largo && permite))) mejor = { largo: p.length, permite }
    }
  }
  return mejor.permite
}

/** Rastreadores que conviene mirar (buscadores clásicos y de IA). Es información, no una recomendación de bloquear o permitir. */
export const RASTREADORES = [
  { agente: 'Googlebot', tipo: 'Buscador (Google)' },
  { agente: 'Bingbot', tipo: 'Buscador (Bing)' },
  { agente: 'Google-Extended', tipo: 'IA de Google: entrenamiento y grounding (no afecta a Search)' },
  { agente: 'GPTBot', tipo: 'IA de OpenAI: entrenamiento' },
  { agente: 'OAI-SearchBot', tipo: 'OpenAI: búsqueda de ChatGPT' },
  { agente: 'ChatGPT-User', tipo: 'OpenAI: visitas pedidas por una persona' },
  { agente: 'ClaudeBot', tipo: 'IA de Anthropic: entrenamiento' },
  { agente: 'PerplexityBot', tipo: 'Perplexity: búsqueda' },
  { agente: 'CCBot', tipo: 'Common Crawl' },
] as const

export function estadoRastreadores(r: Robots, rutasClave: string[] = ['/', '/propiedades', '/blog']) {
  return RASTREADORES.map((x) => {
    const resultados = rutasClave.map((ruta) => puedeRastrear(r, x.agente, ruta))
    const estado = resultados.every(Boolean) ? 'permitido' : resultados.some(Boolean) ? 'parcial' : 'bloqueado'
    return { ...x, estado } as { agente: string; tipo: string; estado: 'permitido' | 'parcial' | 'bloqueado' }
  })
}

export type EntradaSitemap = { loc: string; lastmod: string | null }
export type Sitemap = { tipo: 'urlset' | 'index' | 'desconocido'; urls: EntradaSitemap[]; hijos: string[] }

export function leerSitemap(xml: string): Sitemap {
  const etiqueta = (bloque: string, nombre: string) => new RegExp(`<${nombre}>\\s*([\\s\\S]*?)\\s*</${nombre}>`, 'i').exec(bloque)?.[1]?.trim() ?? null
  const decod = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  if (/<sitemapindex\b/i.test(xml)) {
    const hijos = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)].map((m) => etiqueta(m[1], 'loc')).filter((x): x is string => !!x).map(decod)
    return { tipo: 'index', urls: [], hijos }
  }
  if (/<urlset\b/i.test(xml)) {
    const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((m) => ({ loc: etiqueta(m[1], 'loc'), lastmod: etiqueta(m[1], 'lastmod') })).filter((u): u is { loc: string; lastmod: string | null } => !!u.loc).map((u) => ({ loc: decod(u.loc), lastmod: u.lastmod }))
    return { tipo: 'urlset', urls, hijos: [] }
  }
  return { tipo: 'desconocido', urls: [], hijos: [] }
}
