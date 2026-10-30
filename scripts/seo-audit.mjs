#!/usr/bin/env node
/**
 * Auditoría de SEO contra un sitio que ya está en pie.
 *
 *     npm run seo:audit                    → contra producción
 *     npm run seo:audit -- http://localhost:3000
 *
 * Existe por una razón concreta: durante semanas el sitio sirvió una canónica
 * equivocada en todas sus páginas, el proyecto compilaba sin un solo error, y
 * nadie podía verlo. `next build` comprueba que el código es válido; no
 * comprueba lo que el servidor acaba diciéndole a Google.
 *
 * Por eso esto no mira el repositorio: descarga el HTML y lee lo que hay.
 */

const BASE = (process.argv[2] || 'https://vivebienn.com').replace(/\/+$/, '')

const RUTAS_FIJAS = [
  '/', '/propiedades', '/nosotros', '/valuador', '/contacto',
  '/terminos', '/privacidad',
]

const rojo = (t) => `\x1b[31m${t}\x1b[0m`
const verde = (t) => `\x1b[32m${t}\x1b[0m`
const ambar = (t) => `\x1b[33m${t}\x1b[0m`

const fallos = []
const avisos = []

function saca(html, re) {
  const m = html.match(re)
  return m ? m[1] : null
}

async function pide(ruta) {
  const url = `${BASE}${ruta}`
  const res = await fetch(url, { redirect: 'manual' })
  const html = res.status === 200 ? await res.text() : ''
  return { url, ruta, status: res.status, html }
}

function revisa(p) {
  const { ruta, status, html } = p
  if (status !== 200) {
    fallos.push(`${ruta} → HTTP ${status}`)
    return null
  }

  const titulo = saca(html, /<title>([^<]*)<\/title>/)
  const desc = saca(html, /<meta name="description" content="([^"]*)"/)
  const canon = saca(html, /<link rel="canonical" href="([^"]*)"/)
  const robots = saca(html, /<meta name="robots" content="([^"]*)"/)
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)]

  if (!titulo) fallos.push(`${ruta} → sin <title>`)
  else if (titulo.length > 65) avisos.push(`${ruta} → title de ${titulo.length} caracteres (se recorta en el resultado)`)

  if (!desc) fallos.push(`${ruta} → sin meta description`)
  else if (desc.length > 165) avisos.push(`${ruta} → description de ${desc.length} caracteres`)

  // El fallo que originó este script: canónica que no es la propia página.
  //
  // Se compara la RUTA, no la URL entera: la canónica siempre lleva el dominio
  // de producción, también cuando se audita en local, y comparar orígenes haría
  // que en `localhost` fallaran las 14 páginas por un motivo que no es real.
  if (!canon) fallos.push(`${ruta} → sin canonical`)
  else {
    const suya = new URL(canon).pathname.replace(/\/$/, '') || '/'
    const debe = ruta.replace(/\/$/, '') || '/'
    if (suya !== debe) fallos.push(`${ruta} → canonical apunta a ${canon}`)
  }

  if (h1.length === 0) avisos.push(`${ruta} → sin <h1>`)
  else if (h1.length > 1) avisos.push(`${ruta} → ${h1.length} <h1> en la misma página`)

  // JSON-LD: que exista es la mitad; que sea JSON válido es la otra.
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]) } catch { fallos.push(`${ruta} → JSON-LD inválido`) }
  }

  const sinAlt = [...html.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/g)].length
  if (sinAlt) avisos.push(`${ruta} → ${sinAlt} <img> sin alt`)

  return { ruta, titulo, desc, canon, robots }
}

const main = async () => {
  console.log(`\nAUDITORÍA SEO — ${BASE}\n${'='.repeat(46)}`)

  // El sitemap manda: si una URL está ahí, es que se le pide a Google que la
  // indexe, así que es exactamente la lista que hay que revisar.
  let delSitemap = []
  try {
    const res = await fetch(`${BASE}/sitemap.xml`)
    if (!res.ok) fallos.push(`/sitemap.xml → HTTP ${res.status}`)
    else {
      const xml = await res.text()
      // Se queda con la ruta y descarta el origen: en local el sitemap sigue
      // emitiendo el dominio de producción, y compararlo tal cual daba URLs
      // como `http://localhost:3000https://vivebienn.com`.
      delSitemap = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((m) => new URL(m[1]).pathname || '/')
    }
  } catch (e) {
    fallos.push(`/sitemap.xml → no se pudo leer: ${e.message}`)
  }

  const rutas = [...new Set([...RUTAS_FIJAS, ...delSitemap])]
  const paginas = []
  for (const r of rutas) {
    const p = await pide(r)
    const dato = revisa(p)
    if (dato) paginas.push(dato)
  }

  // Duplicados: dos páginas con el mismo título compiten entre ellas.
  for (const campo of ['titulo', 'desc', 'canon']) {
    const vistos = new Map()
    for (const p of paginas) {
      if (!p[campo]) continue
      const antes = vistos.get(p[campo])
      if (antes) fallos.push(`${campo} repetido entre ${antes} y ${p.ruta}`)
      else vistos.set(p[campo], p.ruta)
    }
  }

  // Una URL en el sitemap con `noindex` es una contradicción: se pide indexar
  // y se prohíbe a la vez.
  for (const p of paginas) {
    if (delSitemap.includes(p.ruta) && p.robots?.includes('noindex')) {
      fallos.push(`${p.ruta} → está en el sitemap y lleva noindex`)
    }
  }

  // Un 404 tiene que responder 404. Que responda 200 con un texto de error es
  // lo que Google llama «soft 404» y lo indexa como si fuera contenido.
  const inventada = await pide('/propiedades/esto-no-existe-auditoria')
  if (inventada.status !== 404) {
    fallos.push(`una propiedad inexistente responde ${inventada.status}, debería ser 404`)
  }

  const robotsTxt = await fetch(`${BASE}/robots.txt`)
  if (!robotsTxt.ok) fallos.push(`/robots.txt → HTTP ${robotsTxt.status}`)

  console.log(`\nPáginas revisadas: ${paginas.length}`)
  console.log(`URLs en el sitemap: ${delSitemap.length}`)

  console.log(`\nErrores: ${fallos.length ? rojo(fallos.length) : verde('0')}`)
  fallos.forEach((f) => console.log(`  ${rojo('✗')} ${f}`))

  console.log(`\nAvisos: ${avisos.length ? ambar(avisos.length) : verde('0')}`)
  avisos.forEach((a) => console.log(`  ${ambar('!')} ${a}`))

  console.log()
  // Salida distinta de cero para que sirva en un hook o en CI.
  process.exit(fallos.length ? 1 : 0)
}

main().catch((e) => {
  console.error(rojo(`La auditoría no pudo completarse: ${e.message}`))
  process.exit(2)
})
