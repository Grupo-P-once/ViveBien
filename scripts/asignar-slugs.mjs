#!/usr/bin/env node
/**
 * Darle nombre público a las propiedades publicadas que viven en una URL fea.
 *
 *     npm run slugs              → simulacro: enseña qué haría, no escribe nada
 *     npm run slugs -- --aplicar → escribe, guardando antes un respaldo
 *     npm run slugs -- --aplicar --solo=id1,id2 → sólo esas propiedades
 *
 * ─────────────────────────────────────────────────────────────
 * QUÉ ARREGLA
 *
 * Cinco propiedades publicadas viven en direcciones como
 * `/propiedades/propiedad-sin-titulo-d52n`, porque su id se generó a partir del
 * título de relleno que ponía el panel al pulsar «Nueva propiedad».
 *
 * El id NO se toca —`fotos` lo referencia con una clave foránea, y eventos,
 * favoritos y el bot de Telegram lo usan—. Se rellena la columna `slug`
 * (migración 10). La ficha sigue respondiendo por el id viejo y redirige de
 * forma permanente al nombre nuevo, así que nada de lo ya enlazado se rompe.
 * ─────────────────────────────────────────────────────────────
 *
 * Importa `slugUnico` del propio sitio (Node ejecuta TypeScript de forma
 * nativa desde la versión 23): el nombre que calcula este script y el que
 * calcula la web al publicar salen de la misma función y no pueden divergir.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { slugUnico, idPresentable } from '../src/lib/slug.ts'
import { lugarDe } from '../src/lib/ubicacion.ts'

const APLICAR = process.argv.includes('--aplicar')
// Un nombre público no se cambia después sin romper su propia dirección, así
// que a veces conviene aplicar sólo los que ya están bien y esperar por el
// resto (p. ej. un título con una errata que quedaría fija en la URL).
const SOLO = (process.argv.find((a) => a.startsWith('--solo=')) ?? '')
  .slice('--solo='.length).split(',').map((s) => s.trim()).filter(Boolean)

function env() {
  const texto = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const vars = {}
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return vars
}

const E = env()
const URL_BASE = E.NEXT_PUBLIC_SUPABASE_URL
const CLAVE = E.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !CLAVE) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  // Aquí sí se sale a la fuerza: todavía no hay ninguna conexión abierta.
  process.exit(2)
}

const cabeceras = {
  apikey: CLAVE,
  Authorization: `Bearer ${CLAVE}`,
  'Content-Type': 'application/json',
}

async function rest(ruta, opciones = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { ...opciones, headers: { ...cabeceras, ...opciones.headers } })
  const texto = await res.text()
  const cuerpo = texto ? JSON.parse(texto) : null
  return { ok: res.ok, status: res.status, cuerpo }
}

const main = async () => {
  const lectura = await rest('propiedades?select=*&order=created_at.asc')
  if (!lectura.ok) {
    console.error('No se pudo leer propiedades:', lectura.cuerpo)
    process.exitCode = 2
    return
  }
  const todas = lectura.cuerpo

  if (todas.length && !('slug' in todas[0])) {
    console.error('\nLa columna `slug` no existe todavía.')
    console.error('Aplica primero supabase/10-slug-publico.sql en el editor SQL de Supabase.\n')
    process.exitCode = 3
    return
  }

  // Nombres ya ocupados: slugs de otras propiedades Y todos los ids. Un slug
  // igual al id de otra propiedad la dejaría inaccesible por su dirección de
  // siempre, porque la ficha busca primero por slug.
  const ocupados = new Set([
    ...todas.map((p) => p.slug).filter(Boolean),
    ...todas.map((p) => p.id),
  ])

  const plan = []
  for (const p of todas) {
    if (p.estado_pub !== 'publicada') continue
    if (SOLO.length && !SOLO.includes(p.id)) continue
    if (p.slug) continue
    if (idPresentable(p.id)) continue

    const slug = slugUnico(
      { titulo: p.titulo, tipo: p.tipo, operacion: p.operacion, ciudad: lugarDe(p).ciudad },
      p.id,
    )
    if (!slug) {
      plan.push({ id: p.id, slug: null, motivo: 'faltan tipo, operación y título' })
      continue
    }
    if (ocupados.has(slug)) {
      plan.push({ id: p.id, slug: null, motivo: `«${slug}» ya está en uso` })
      continue
    }
    ocupados.add(slug)
    plan.push({ id: p.id, slug, titulo: p.titulo })
  }

  console.log(`\n${APLICAR ? 'APLICANDO' : 'SIMULACRO (no se escribe nada)'}\n`)
  if (!plan.length) {
    console.log('No hay nada que hacer: todas las publicadas tienen nombre público o un id presentable.\n')
    return
  }
  for (const x of plan) {
    if (x.slug) console.log(`  /propiedades/${x.id}\n    → /propiedades/${x.slug}\n`)
    else console.log(`  /propiedades/${x.id}\n    ✗ se queda como está: ${x.motivo}\n`)
  }

  if (!APLICAR) {
    console.log('Para escribirlo: npm run slugs -- --aplicar\n')
    return
  }

  // Respaldo antes de tocar nada, como en la migración de fotos: si algo sale
  // mal se sabe exactamente qué había y qué se escribió.
  const marca = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const respaldo = new URL(`./respaldo-slugs-${marca}.json`, import.meta.url)
  writeFileSync(respaldo, JSON.stringify({ fecha: new Date().toISOString(), plan }, null, 2))
  console.log(`Respaldo: ${respaldo.pathname}\n`)

  let bien = 0
  for (const x of plan.filter((y) => y.slug)) {
    // `slug=is.null`: no pisar un nombre que se haya puesto mientras tanto.
    const r = await rest(`propiedades?id=eq.${encodeURIComponent(x.id)}&slug=is.null`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ slug: x.slug }),
    })
    const escrito = Array.isArray(r.cuerpo) && r.cuerpo[0]?.slug === x.slug
    console.log(`  ${escrito ? '✓' : '✗'} ${x.id}${escrito ? '' : `  (${r.status} ${JSON.stringify(r.cuerpo).slice(0, 120)})`}`)
    if (escrito) bien++
  }
  console.log(`\n${bien} de ${plan.filter((y) => y.slug).length} escritos.\n`)
  // `exitCode` y no `process.exit()`: en Windows, salir a la fuerza con
  // conexiones todavía cerrándose revienta libuv («UV_HANDLE_CLOSING»).
  process.exitCode = bien === plan.filter((y) => y.slug).length ? 0 : 1
}

main().catch((e) => {
  console.error('Fallo:', e.message)
  process.exitCode = 2
})
