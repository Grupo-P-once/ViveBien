/**
 * Verificación de la base tras una caída o un reinicio.
 *
 *   node scripts/verificar-base.mjs
 *
 * Existe porque «la base volvió» no es lo mismo que «la base volvió bien». Tras
 * un reinicio conviene comprobar tres cosas, y ninguna se ve abriendo el sitio:
 *
 *  1. **Que responde**, y en cuánto.
 *  2. **Que el RLS sigue cerrado.** Un catálogo público y datos personales
 *     privados. Esto costó cinco meses de exposición una vez (E-01): no se da
 *     por supuesto.
 *  3. **Que los datos siguen ahí.** Cuántas filas hay en cada tabla.
 *
 * Sólo LEE. No escribe ni borra nada: se puede correr las veces que haga falta
 * sin riesgo, que es justo lo que se quiere de algo que se ejecuta mientras
 * algo está roto.
 *
 * Usa la anon key a propósito — la misma que ve cualquier visitante. Así prueba
 * lo que de verdad importa: qué puede leer un desconocido.
 */

import { readFileSync } from 'node:fs'

function leerEnv() {
  const env = {}
  try {
    // `\r?\n` y no `\n`: el archivo tiene finales de Windows, y el `.` de la
    // regex no consume `\r`, así que ninguna línea encajaba.
    for (const linea of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = linea.match(/^([A-Z_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].trim()
    }
  } catch {
    console.error('No se encontró .env.local. Córrelo desde la raíz del proyecto.')
    process.exit(1)
  }
  return env
}

const env = leerEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!URL || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local')
  process.exit(1)
}

/** Lo que un visitante anónimo DEBE poder leer, y lo que NO. */
const TABLAS = [
  { tabla: 'propiedades', publica: true,  nota: 'el catálogo' },
  { tabla: 'leads', publica: false, nota: 'datos personales' },
  { tabla: 'contactos', publica: false, nota: 'datos personales' },
  { tabla: 'solicitudes_contacto', publica: false, nota: 'datos personales' },
  { tabla: 'usuarios', publica: false, nota: 'cuentas' },
  { tabla: 'favoritos', publica: false, nota: 'actividad privada' },
  { tabla: 'audit_logs', publica: false, nota: 'auditoría' },
]

async function consultar(tabla) {
  const t0 = Date.now()
  try {
    const res = await fetch(`${URL}/rest/v1/${tabla}?select=*&limit=1000`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(20000),
    })
    const ms = Date.now() - t0
    const texto = await res.text()
    let filas = null
    try { const j = JSON.parse(texto); if (Array.isArray(j)) filas = j.length } catch { /* html de error */ }
    return { status: res.status, ms, filas, cuerpo: texto.slice(0, 80) }
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, filas: null, cuerpo: e.message }
  }
}

console.log(`\n  Verificando ${URL.replace(/^https:\/\//, '')}\n`)

let fallos = 0
let caida = false

for (const { tabla, publica, nota } of TABLAS) {
  const r = await consultar(tabla)

  // 5xx o sin respuesta: la base no está. No tiene sentido juzgar el RLS.
  if (r.status === 0 || r.status >= 500) {
    caida = true
    console.log(`  ✗ ${tabla.padEnd(22)} NO RESPONDE (${r.status || 'sin conexión'}, ${r.ms} ms)`)
    fallos++
    continue
  }

  if (publica) {
    if (r.status === 200 && r.filas !== null) {
      console.log(`  ✓ ${tabla.padEnd(22)} legible, ${r.filas} filas · ${r.ms} ms   (${nota})`)
    } else {
      console.log(`  ✗ ${tabla.padEnd(22)} DEBERÍA SER PÚBLICA y da ${r.status}`)
      fallos++
    }
  } else {
    // Con RLS cerrado, PostgREST devuelve 200 con [] — NO un error. Un 200 con
    // filas es la señal de alarma: el mismo fallo de E-01.
    if (r.status === 200 && r.filas && r.filas > 0) {
      console.log(`  ✗ ${tabla.padEnd(22)} ⚠️ EXPUESTA: ${r.filas} filas legibles con la anon key   (${nota})`)
      fallos++
    } else {
      console.log(`  ✓ ${tabla.padEnd(22)} cerrada   (${nota})`)
    }
  }
}

console.log('')
if (caida) {
  console.log('  La base todavía no responde. Si ya reiniciaste, espera unos minutos y vuelve a correrlo.\n')
  process.exit(2)
}
if (fallos > 0) {
  console.log(`  ${fallos} problema(s). Revisar antes de dar la base por buena.\n`)
  process.exit(1)
}
console.log('  Todo en orden: la base responde, el catálogo es público y los datos personales están cerrados.\n')
