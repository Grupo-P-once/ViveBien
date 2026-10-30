import { describe, expect, it } from 'vitest'
import { PRODUCCION, verificarEntornoStaging } from '../scripts/qa/entorno-staging'

/** R-12/R-14 (D-62): la guarda del entorno de staging se niega a dejar correr QA con escrituras contra producción. */
const BUENO = {
  ENTORNO_QA: 'staging',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-staging',
  SUPABASE_SERVICE_ROLE_KEY: 'service-staging',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'vivebien-qa',
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'vivebien-qa',
  TELEGRAM_BOT_TOKEN: 'mock',
}

describe('verificarEntornoStaging', () => {
  it('un entorno de staging propio y con avisos simulados es apto', () => {
    expect(verificarEntornoStaging(BUENO)).toEqual([])
  })
  it('se niega si falta la declaración explícita de staging', () => {
    expect(verificarEntornoStaging({ ...BUENO, ENTORNO_QA: undefined }).join(' ')).toMatch(/ENTORNO_QA/)
    expect(verificarEntornoStaging({ ...BUENO, ENTORNO_QA: 'produccion' }).join(' ')).toMatch(/ENTORNO_QA/)
  })
  it('se niega ante CADA identificador de producción', () => {
    const casos: Array<[Record<string, string>, RegExp]> = [
      [{ NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCCION.supabaseRef}.supabase.co` }, /Supabase|SUPABASE/],
      [{ NEXT_PUBLIC_FIREBASE_PROJECT_ID: PRODUCCION.firebaseProject }, /FIREBASE/],
      [{ FIREBASE_PROJECT_ID: PRODUCCION.firebaseProject }, /FIREBASE/],
      [{ NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: PRODUCCION.cloudinary }, /CLOUDINARY/],
      [{ NEXT_PUBLIC_SITE_URL: 'https://vivebienn.com' }, /PRODUCCIÓN/],
    ]
    for (const [parche, re] of casos) expect(verificarEntornoStaging({ ...BUENO, ...parche }).join(' '), JSON.stringify(parche)).toMatch(re)
  })
  it('se niega si hay credenciales reales de aviso (mandarían mensajes de verdad); «mock» o vacío sí vale', () => {
    for (const k of ['TELEGRAM_BOT_TOKEN', 'RESEND_API_KEY', 'WHATSAPP_TOKEN']) {
      expect(verificarEntornoStaging({ ...BUENO, [k]: '123456:ABC-real' }).join(' '), k).toContain(k)
      expect(verificarEntornoStaging({ ...BUENO, [k]: '' })).toEqual([])
    }
    expect(verificarEntornoStaging({ ...BUENO, CRON_SECRET: 'el-de-produccion' }).join(' ')).toMatch(/CRON_SECRET/)
  })
  it('falta de variables propias → se niega (no hereda las de producción por omisión)', () => {
    expect(verificarEntornoStaging({ ENTORNO_QA: 'staging' }).length).toBeGreaterThanOrEqual(4)
  })
  it('no imprime valores: los mensajes solo nombran la variable', () => {
    const msg = verificarEntornoStaging({ ...BUENO, TELEGRAM_BOT_TOKEN: '999999:SECRETO-NO-SE-IMPRIME' }).join(' ')
    expect(msg).not.toContain('SECRETO-NO-SE-IMPRIME')
  })
})
