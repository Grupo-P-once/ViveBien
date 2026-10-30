/**
 * Borrar los borradores de prueba que quedaron de los ensayos del asistente y
 * de Telegram (V-1.1.84, autorizado por el dueño el 22-sep).
 *
 * Qué borra, y sólo eso: propiedades en `borrador` + `eliminada` (ya estaban
 * dadas de baja) cuyo título es nulo, «Propiedad sin título» o «Borrador desde
 * Telegram». Nada publicado, nada con favoritos, solicitudes, citas o leads
 * (se comprueba antes y se aborta si aparece alguno).
 *
 * Deja respaldo en `docs/limpiezas/` ANTES de borrar. La bitácora
 * (`audit_logs`) no se toca: es el registro de lo que pasó.
 *
 *   rolldown scripts/limpiar-borradores-de-prueba.mts --format esm --platform node \
 *     --external @supabase/supabase-js -o scripts/.tmp.mjs && node scripts/.tmp.mjs
 *   (añade --aplicar para borrar de verdad)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = linea.indexOf('=')
  if (i > 0 && !linea.trim().startsWith('#')) {
    const clave = linea.slice(0, i).trim()
    if (!process.env[clave]) process.env[clave] = linea.slice(i + 1).trim()
  }
}

const aplicar = process.argv.includes('--aplicar')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const TITULOS_DE_PRUEBA = ['Propiedad sin título', 'Borrador desde Telegram']

const { data: todas, error } = await db
  .from('propiedades')
  .select('*')
  .eq('estado_pub', 'borrador')
  .eq('estatus', 'eliminada')
if (error) throw new Error(error.message)

const basura = (todas ?? []).filter((p) => p.titulo === null || TITULOS_DE_PRUEBA.includes(p.titulo))
console.log(`Borradores dados de baja: ${todas?.length ?? 0} · de prueba: ${basura.length}`)
for (const p of basura) console.log(`  · ${p.id} (${p.folio}) — ${p.titulo ?? 'sin título'}`)
if (!basura.length) process.exit(0)

const ids = basura.map((p) => p.id as string)

// Nadie los está usando: si algo cuelga de ellos, no se borra nada.
const ataduras = await Promise.all(
  (['favoritos', 'solicitudes_contacto', 'citas', 'leads'] as const).map(async (t) => {
    const { count } = await db.from(t).select('*', { count: 'exact', head: true }).in('propiedad_id', ids)
    return [t, count ?? 0] as const
  }),
)
const conAtaduras = ataduras.filter(([, n]) => n > 0)
if (conAtaduras.length) {
  console.error('ABORTADO, hay datos colgando:', conAtaduras.map(([t, n]) => `${t}: ${n}`).join(', '))
  process.exit(1)
}

const fecha = new Date().toISOString().slice(0, 10)
const destino = `docs/limpiezas/${fecha}-borradores-de-prueba.json`
mkdirSync('docs/limpiezas', { recursive: true })
const { data: fotos } = await db.from('fotos').select('*').in('propiedad_id', ids)
writeFileSync(destino, JSON.stringify({ fecha, criterio: 'borrador + eliminada + título de prueba', propiedades: basura, fotos: fotos ?? [] }, null, 2))
console.log(`\nRespaldo: ${destino} (${basura.length} propiedades, ${fotos?.length ?? 0} fotos)`)

if (!aplicar) {
  console.log('Ensayo: no se borró nada. Repite con --aplicar.')
  process.exit(0)
}

const borradoFotos = await db.from('fotos').delete().in('propiedad_id', ids)
if (borradoFotos.error) throw new Error(borradoFotos.error.message)
const borrado = await db.from('propiedades').delete().in('id', ids)
if (borrado.error) throw new Error(borrado.error.message)

const { count } = await db.from('propiedades').select('*', { count: 'exact', head: true })
console.log(`Borradas ${ids.length}. Quedan ${count} propiedades.`)
console.log('Nota: las imágenes que hubiera en Cloudinary no se tocan (no las referencia nadie).')
