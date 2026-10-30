/**
 * Ponerle nombre público a las propiedades publicadas que se quedaron sin él
 * (V-1.1.84).
 *
 * Existe porque el panel clásico publicaba escribiendo directo en la tabla,
 * sin pasar por `/api/propiedades/[id]/estado`, y dos terrenos quedaron en
 * `/propiedades/propiedad-sin-titulo-…`. El agujero ya está tapado en el
 * código; esto arregla lo que quedó de antes.
 *
 * Usa la MISMA función que la aplicación (`asignarSlugAlPublicar`), así que el
 * nombre es idéntico al que habría puesto al publicar, con sus comprobaciones
 * de choque. No toca nada más: sólo rellena `slug` donde está vacío.
 *
 *   node_modules/.bin/vite-node scripts/nombrar-publicadas.mts            (ensayo)
 *   node_modules/.bin/vite-node scripts/nombrar-publicadas.mts --aplicar  (de verdad)
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { asignarSlugAlPublicar } from '../src/lib/asignar-slug'
import { idPresentable } from '../src/lib/slug'

for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = linea.indexOf('=')
  if (i > 0 && !linea.trim().startsWith('#')) {
    const clave = linea.slice(0, i).trim()
    if (!process.env[clave]) process.env[clave] = linea.slice(i + 1).trim()
  }
}

const aplicar = process.argv.includes('--aplicar')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const { data, error } = await db
  .from('propiedades')
  .select('id, slug, titulo, tipo, operacion, ubicacion, ciudad, estado_pub')
  .eq('estado_pub', 'publicada')
if (error) throw new Error(error.message)

const sinNombre = (data ?? []).filter((p) => {
  const nombre = (p.slug ?? '').trim() || p.id
  return !idPresentable(nombre)
})

console.log(`Publicadas: ${data?.length ?? 0} · sin nombre presentable: ${sinNombre.length}`)
for (const p of sinNombre) console.log(`  · ${p.id} — «${p.titulo}»`)

if (!sinNombre.length) process.exit(0)
if (!aplicar) {
  console.log('\nEnsayo: no se escribió nada. Repite con --aplicar.')
  process.exit(0)
}

for (const p of sinNombre) {
  const ruta = await asignarSlugAlPublicar(db, p as Record<string, unknown>)
  console.log(`  ${p.id} → ${ruta}`)
}
