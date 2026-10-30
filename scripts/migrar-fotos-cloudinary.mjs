/**
 * Copia las fotos a la cuenta nueva de Cloudinary y actualiza la base.
 *
 *   node scripts/migrar-fotos-cloudinary.mjs            (ensayo: no toca nada)
 *   node scripts/migrar-fotos-cloudinary.mjs --aplicar  (de verdad)
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ
 *
 * Las 32 fotos publicadas viven en la cuenta anterior (`dd9b29y6r`), a la que
 * ya no se tiene acceso. Hoy responden, pero cuelgan de una cuenta ajena: el
 * día que desaparezca, el catálogo se queda sin imágenes y **no hay copia**.
 *
 * CÓMO, sin romper nada:
 *
 *  1. **Antes de escribir nada** se guarda un respaldo con las direcciones
 *     actuales, en `scripts/respaldo-fotos-<fecha>.json`. Deshacer es volver a
 *     poner ese archivo.
 *  2. Cada foto se sube a la cuenta nueva **por URL** —Cloudinary la descarga
 *     él mismo— y se **comprueba que la copia responde 200** antes de dar la
 *     dirección por buena.
 *  3. Sólo cuando TODAS las fotos de una propiedad están copiadas se actualiza
 *     esa propiedad. Media galería migrada sería peor que ninguna.
 *  4. Lo que ya está en la cuenta nueva se salta: se puede correr dos veces.
 * ─────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync } from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')

function env() {
  const e = {}
  for (const linea of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z_]+)=(.*)$/)
    if (m) e[m[1]] = m[2].trim()
  }
  return e
}

const E = env()
const SB = E.NEXT_PUBLIC_SUPABASE_URL
const SK = E.SUPABASE_SERVICE_ROLE_KEY
const NUBE = E.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const PRESET = E.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

if (!SB || !SK || !NUBE || !PRESET) {
  console.error('Faltan variables en .env.local (Supabase o Cloudinary).')
  process.exit(1)
}

const cabeceras = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' }

async function leer(tabla, query) {
  const res = await fetch(`${SB}/rest/v1/${tabla}?${query}`, { headers: cabeceras })
  if (!res.ok) throw new Error(`${tabla}: ${res.status} ${await res.text()}`)
  return res.json()
}

/**
 * Dónde va cada imagen: `vivebien/<tipo>/<id>`, igual que lo que usan ahora el
 * asistente y el bot (ver `src/lib/fotos.ts`). Antes todo caía en una sola
 * carpeta con nombres aleatorios y no había forma de saber qué foto era de qué
 * anuncio.
 */
function segmento(v, porDefecto) {
  const s = String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return s || porDefecto
}

function carpetaDe(propiedadId, tipo, clase = 'fotos') {
  const base = `vivebien/${segmento(tipo, 'sin-tipo')}/${segmento(propiedadId, 'sin-id')}`
  return clase === 'planos' ? `${base}/planos` : base
}

/** Sube una imagen a la cuenta nueva a partir de su dirección actual. */
async function copiar(url, carpeta) {
  const fd = new FormData()
  fd.append('file', url)
  fd.append('upload_preset', PRESET)
  // Esta cuenta usa carpetas dinámicas: `folder` se ignora. La ruta va en el
  // public_id (para que la URL sea legible) y en asset_folder (para el panel).
  const nombre = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  fd.append('public_id', `${carpeta}/${nombre}`)
  fd.append('asset_folder', carpeta)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${NUBE}/image/upload`, { method: 'POST', body: fd })
  const j = await res.json().catch(() => ({}))
  if (!j.secure_url) throw new Error(j?.error?.message ?? `respuesta inesperada (${res.status})`)

  // Que Cloudinary diga que la subió no basta: se comprueba que se ve.
  const prueba = await fetch(j.secure_url, { method: 'GET' })
  if (!prueba.ok) throw new Error(`la copia no responde (${prueba.status})`)

  return j.secure_url
}

/** Ya está en su sitio: cuenta nueva Y dentro de la carpeta que le toca. */
const enSuSitio = (u, carpeta) =>
  typeof u === 'string' && u.includes(`/${NUBE}/`) && u.includes(`/${carpeta}/`)

/* ── 1. Qué hay ────────────────────────────────────────────── */

const propiedades = await leer('propiedades', 'select=id,tipo,fotos,planos')
const filasFotos = await leer('fotos', 'select=id,propiedad_id,url,pie,orden,es_principal')

// Cada imagen con la carpeta que le corresponde. Un Map y no un Set: la misma
// URL en dos propiedades distintas iría a dos carpetas distintas.
const porCopiar = new Map()
const carpetaDeProp = new Map()

for (const p of propiedades) {
  const fotos = carpetaDe(p.id, p.tipo)
  const planos = carpetaDe(p.id, p.tipo, 'planos')
  carpetaDeProp.set(p.id, { fotos, planos })
  for (const u of p.fotos ?? []) if (!enSuSitio(u, fotos)) porCopiar.set(u, fotos)
  for (const u of p.planos ?? []) if (!enSuSitio(u, planos)) porCopiar.set(u, planos)
}
for (const f of filasFotos) {
  const c = carpetaDeProp.get(f.propiedad_id)?.fotos ?? 'vivebien/sin-tipo/sin-id'
  if (!enSuSitio(f.url, c)) porCopiar.set(f.url, c)
}

const todas = porCopiar

console.log(`\n  Cuenta destino: ${NUBE} · preset: ${PRESET}`)
console.log(`  Propiedades: ${propiedades.length} · filas en \`fotos\`: ${filasFotos.length}`)
console.log(`  Imágenes por copiar: ${todas.size}\n`)

if (todas.size === 0) {
  console.log('  No hay nada que migrar: todo está ya en la cuenta nueva.\n')
  process.exit(0)
}

if (!APLICAR) {
  console.log('  ENSAYO. No se ha tocado nada. Para hacerlo de verdad:')
  console.log('    node scripts/migrar-fotos-cloudinary.mjs --aplicar\n')
  process.exit(0)
}

/* ── 2. Respaldo ANTES de nada ─────────────────────────────── */

const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const respaldo = `scripts/respaldo-fotos-${sello}.json`
writeFileSync(respaldo, JSON.stringify({ propiedades, fotos: filasFotos }, null, 2), 'utf8')
console.log(`  Respaldo guardado en ${respaldo}\n`)

/* ── 3. Copiar ─────────────────────────────────────────────── */

const nueva = new Map()
let fallos = 0

for (const [url, carpeta] of porCopiar) {
  const corto = url.split('/upload/')[1] ?? url
  try {
    const destino = await copiar(url, carpeta)
    nueva.set(url, destino)
    console.log(`  ✓ ${corto.slice(0, 42)} → ${carpeta}`)
  } catch (e) {
    fallos++
    console.log(`  ✗ ${corto.slice(0, 60)} — ${e.message}`)
  }
}

if (fallos > 0) {
  console.log(`\n  ${fallos} imagen(es) no se pudieron copiar. NO se toca la base:`)
  console.log('  una galería a medias es peor que dejarlo como está.\n')
  process.exit(1)
}

/* ── 4. Actualizar, propiedad por propiedad ────────────────── */

async function escribir(tabla, filtro, cuerpo) {
  const res = await fetch(`${SB}/rest/v1/${tabla}?${filtro}`, {
    method: 'PATCH',
    headers: { ...cabeceras, Prefer: 'return=minimal' },
    body: JSON.stringify(cuerpo),
  })
  if (!res.ok) throw new Error(`${tabla}: ${res.status} ${await res.text()}`)
}

for (const p of propiedades) {
  const fotos = (p.fotos ?? []).map((u) => nueva.get(u) ?? u)
  const planos = (p.planos ?? []).map((u) => nueva.get(u) ?? u)
  const cambia =
    JSON.stringify(fotos) !== JSON.stringify(p.fotos ?? []) ||
    JSON.stringify(planos) !== JSON.stringify(p.planos ?? [])
  if (!cambia) continue
  await escribir('propiedades', `id=eq.${encodeURIComponent(p.id)}`, { fotos, planos })
  console.log(`  · ${p.id}: ${fotos.length} fotos actualizadas`)
}

for (const f of filasFotos) {
  const destino = nueva.get(f.url)
  if (!destino) continue
  await escribir('fotos', `id=eq.${f.id}`, { url: destino })
}

console.log(`\n  Listo: ${nueva.size} imágenes copiadas a ${NUBE} y la base actualizada.`)
console.log(`  Si algo se ve mal, el respaldo está en ${respaldo}\n`)
