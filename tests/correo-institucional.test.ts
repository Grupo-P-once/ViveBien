import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { NEGOCIO } from '../src/lib/config/negocio'
import { CUENTA_PROPIETARIO } from '../src/lib/config/negocio-interno'
import { CORREO_CONTACTO, mailtoDe } from '../src/lib/contacto'

/**
 * D-76 — el correo INSTITUCIONAL de VIVE BIEN es `informes@vivebienn.com`.
 *
 * Hay dos clases de correo y no se mezclan:
 *   · el INSTITUCIONAL (`NEGOCIO.email`): el que el negocio publica y al que llegan los avisos del equipo;
 *   · el de la CUENTA del propietario (`NEGOCIO.cuentaPropietario`, `joseponcer@vivebienn.com`): es un usuario del sistema.
 *     Existe y es legítimo (siembra, atribución de Telegram, pruebas de roles), pero NO es contacto público.
 *
 * Por eso esta guardia NO prohíbe «joseponcer@…» en todo el código: prohíbe que se use como contacto público,
 * y que el institucional vuelva a cambiar por accidente o se escriba a mano fuera de la fuente única.
 */

const RAIZ = join(__dirname, '..', 'src')
const FUENTE = 'lib/config/negocio.ts'
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8')

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return archivos(p)
    return /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}
/** El código sin comentarios (los comentarios sí pueden citar direcciones). */
const codigo = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const TODOS = archivos(RAIZ)
const fuera = TODOS.filter((p) => relative(RAIZ, p).split('\\').join('/') !== FUENTE)

describe('la dirección oficial', () => {
  it('es informes@vivebienn.com, en un solo sitio', () => {
    expect(NEGOCIO.email).toBe('informes@vivebienn.com')
    expect(CORREO_CONTACTO).toBe('informes@vivebienn.com')
    expect(mailtoDe()).toBe('mailto:informes@vivebienn.com')
    expect(mailtoDe('Hola mundo')).toBe('mailto:informes@vivebienn.com?subject=Hola%20mundo')
  })

  it('no está escrita a mano fuera de la fuente única (ni ella ni el remitente antiguo)', () => {
    const culpables = fuera
      .filter((p) => /informes@vivebienn\.com|avisos@vivebienn\.com/.test(codigo(readFileSync(p, 'utf8'))))
      .map((p) => relative(RAIZ, p))
    expect(culpables).toEqual([])
  })

  it('el remitente de los correos automáticos es el institucional (dominio verificado en Resend)', () => {
    expect(NEGOCIO.remitente).toBe('Vive Bien <informes@vivebienn.com>')
    for (const f of ['lib/aviso-lead.ts', 'lib/citas/enviar.ts', 'lib/invitacion-correo.ts']) {
      expect(codigo(leer(f)), f).toMatch(/process\.env\.RESEND_FROM \|\| NEGOCIO\.remitente/)
    }
  })

  it('quien responda a un correo de citas habla con VIVE BIEN (reply_to institucional)', () => {
    const enviar = codigo(leer('lib/citas/enviar.ts'))
    expect(enviar).toMatch(/reply_to: NEGOCIO\.email/)
    // …sin tocar a quién va dirigido ni el contenido: el destinatario sigue siendo la persona de la cita.
    expect(enviar).toMatch(/to: \[opts\.para\]/)
    expect(enviar).toMatch(/subject: opts\.asunto/)
    expect(enviar).toMatch(/html: opts\.html/)
  })
})

describe('las superficies públicas leen el institucional', () => {
  const PUBLICAS: Array<[string, RegExp]> = [
    ['components/Footer.tsx', /CORREO_CONTACTO/],
    ['app/contacto/page-client.tsx', /CORREO_CONTACTO/],
    ['app/privacidad/page.tsx', /CORREO_CONTACTO/],
    ['app/terminos/page.tsx', /CORREO_CONTACTO/],
    ['app/error.tsx', /CORREO_CONTACTO/],
    ['lib/seo.ts', /email: NEGOCIO\.email/],
  ]
  for (const [archivo, patron] of PUBLICAS) {
    it(`${archivo} usa la fuente única`, () => expect(codigo(leer(archivo))).toMatch(patron))
  }

  it('ninguna superficie pública usa la cuenta del propietario como contacto', () => {
    // Las direcciones INTERNAS viven en `negocio-interno.ts` (fuera de `NEGOCIO`, que viaja en el JS público). Sólo las importan
    // la siembra del administrador y el respaldo de Telegram.
    const lectores = fuera
      .filter((p) => /negocio-interno/.test(codigo(readFileSync(p, 'utf8'))))
      .map((p) => relative(RAIZ, p).split('\\').join('/'))
      .sort()
    expect(lectores).toEqual(['app/admin/seed/page.tsx', 'app/api/telegram/webhook/route.ts'])
  })

  it('`NEGOCIO` (que se descarga en el navegador) ya no contiene ninguna dirección personal', () => {
    expect(JSON.stringify(NEGOCIO)).not.toMatch(/joseponce[rp]@|@gp-once\.com/)
    expect(codigo(leer('lib/config/negocio.ts'))).not.toMatch(/joseponce[rp]@|@gp-once\.com/)
  })

  it('ninguna dirección personal sale en el código de las páginas', () => {
    const paginas = fuera.filter((p) => /[\\/]app[\\/](?!api[\\/]).*\.tsx$/.test(p) || /components[\\/](Footer|Header)\.tsx$/.test(p))
    const culpables = paginas
      .filter((p) => /joseponce[rp]@|@gp-once\.com/.test(codigo(readFileSync(p, 'utf8'))))
      .map((p) => relative(RAIZ, p))
    expect(culpables).toEqual([])
  })
})

describe('la cuenta del propietario NO cambia (es un usuario, no un contacto)', () => {
  it('sigue siendo joseponcer@vivebienn.com', () => {
    expect(CUENTA_PROPIETARIO).toBe('joseponcer@vivebienn.com')
  })

  it('la siembra y el respaldo de Telegram reconocen a la CUENTA, no al contacto institucional', () => {
    const seed = codigo(leer('app/admin/seed/page.tsx'))
    expect(seed).toMatch(/ADMIN_EMAIL: string = CUENTA_PROPIETARIO/)
    expect(seed).not.toMatch(/CORREO_CONTACTO/)
    expect(codigo(leer('app/api/telegram/webhook/route.ts'))).toMatch(/TELEGRAM_OWNER_EMAIL \|\| CUENTA_PROPIETARIO/)
  })

  it('los avisos de nuevos interesados llegan SÓLO al buzón institucional (informes@), no a la cuenta del propietario', () => {
    // Buzón verificado por el propietario el 8-oct-2026: la copia transitoria a la cuenta del propietario YA NO existe.
    const aviso = codigo(leer('lib/aviso-lead.ts'))
    expect(aviso).toMatch(/to: \[CORREO_CONTACTO\]/)
    expect(aviso).not.toMatch(/negocio-interno|COPIA_INTERNA_AVISOS|CUENTA_PROPIETARIO|joseponce[rp]@/)
    expect(codigo(leer('lib/config/negocio-interno.ts'))).not.toMatch(/COPIA_INTERNA_AVISOS/)
    expect(fuera.filter((p) => /COPIA_INTERNA_AVISOS/.test(codigo(readFileSync(p, 'utf8'))))).toEqual([])
  })

  it('el correo que escribe una persona al registrarse NO se toca: no hay sustitución de correos de usuario', () => {
    for (const f of ['components/RegisterModal.tsx', 'app/contacto/page-client.tsx']) {
      expect(codigo(leer(f)), f).not.toMatch(/email:\s*(CORREO_CONTACTO|NEGOCIO\.email)/)
    }
  })
})

describe('el Centro de Ayuda no escribe direcciones a mano', () => {
  it('ningún contenido de ayuda (migraciones 27–35) lleva un correo del dominio', () => {
    const sql = readdirSync(join(__dirname, '..', 'supabase')).filter((n) => /^(27|29|30|35)-ayuda|^27-centro/.test(n) && !/REVERTIR/.test(n))
    expect(sql.length).toBeGreaterThan(2)
    for (const n of sql) expect(readFileSync(join(__dirname, '..', 'supabase', n), 'utf8'), n).not.toMatch(/[\w.]+@(vivebienn|gp-once)\./)
  })
})
