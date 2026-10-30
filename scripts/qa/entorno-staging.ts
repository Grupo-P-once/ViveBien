/**
 * Barrera del entorno de STAGING / QA autenticado (R-12 · R-14, D-62).
 *
 * Una prueba que crea cuentas, propiedades o leads de QA JAMÁS debe correr contra los servicios de producción. Esta guarda se ejecuta antes de
 * cualquier prueba de staging (QA autenticado, concurrencia por HTTP, carga con escrituras) y se NIEGA si alguna variable apunta a producción
 * o si hay credenciales reales de notificación (se mandarían avisos de verdad). No lee ni imprime valores: solo compara y reporta el nombre
 * de la variable.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/qa/entorno-staging.ts            (usa process.env)
 *
 * Producción (identificadores NO secretos, públicos en el navegador): Supabase `uztssyrheqdhtoheecgf`, Firebase `vivebien-84685`,
 * Cloudinary `zwsi9aar`, dominio `vivebienn.com`.
 */
import { pathToFileURL } from 'node:url'

export const PRODUCCION = {
  supabaseRef: 'uztssyrheqdhtoheecgf',
  firebaseProject: 'vivebien-84685',
  cloudinary: 'zwsi9aar',
  dominios: ['vivebienn.com', 'www.vivebienn.com'],
} as const

type Env = Record<string, string | undefined>

/** Devuelve los problemas encontrados (vacío = el entorno es seguro para QA con escrituras). */
export function verificarEntornoStaging(env: Env): string[] {
  const p: string[] = []
  const v = (k: string) => (env[k] ?? '').trim()
  const requerida = (k: string) => { if (!v(k)) p.push(`${k}: falta (staging necesita su propio valor)`) }

  if (v('ENTORNO_QA') !== 'staging') p.push('ENTORNO_QA debe ser exactamente «staging» (decisión consciente de usar un entorno de pruebas)')

  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID']) requerida(k)

  const supa = v('NEXT_PUBLIC_SUPABASE_URL')
  if (supa.includes(PRODUCCION.supabaseRef)) p.push('NEXT_PUBLIC_SUPABASE_URL apunta al proyecto de PRODUCCIÓN')
  if (/localhost|127\.0\.0\.1/.test(supa) === false && !/^https:\/\/[a-z0-9]{20}\.supabase\.co/.test(supa) && supa) p.push('NEXT_PUBLIC_SUPABASE_URL no parece un proyecto de Supabase ni una réplica local')
  if (v('NEXT_PUBLIC_FIREBASE_PROJECT_ID') === PRODUCCION.firebaseProject) p.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID es el de PRODUCCIÓN (se crearían cuentas reales)')
  if (v('FIREBASE_PROJECT_ID') === PRODUCCION.firebaseProject) p.push('FIREBASE_PROJECT_ID es el de PRODUCCIÓN')
  if (v('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME') === PRODUCCION.cloudinary) p.push('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME es la nube de PRODUCCIÓN (se subirían fotos reales)')

  for (const k of Object.keys(env)) {
    const val = v(k)
    if (!val) continue
    if (PRODUCCION.dominios.some((d) => val.includes(d)) && /URL|HOST|ORIGIN|BASE|DOMINIO/i.test(k)) p.push(`${k} apunta al dominio de PRODUCCIÓN`)
  }

  // Avisos reales: solo se admiten ausentes o «mock».
  for (const k of ['TELEGRAM_BOT_TOKEN', 'RESEND_API_KEY', 'WHATSAPP_TOKEN']) {
    const val = v(k)
    if (val && val !== 'mock') p.push(`${k} tiene un valor real: en staging debe estar vacío o «mock» (mandaría avisos de verdad)`)
  }
  if (v('CRON_SECRET') && v('CRON_SECRET') !== 'mock') p.push('CRON_SECRET: no se reutiliza el de producción en staging')

  return p
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problemas = verificarEntornoStaging(process.env)
  if (problemas.length) {
    console.error('ENTORNO NO APTO PARA QA CON ESCRITURAS:')
    for (const x of problemas) console.error('  ✗', x)
    process.exit(2)
  }
  console.log('Entorno de staging verificado: ningún servicio de producción a la vista.')
}
