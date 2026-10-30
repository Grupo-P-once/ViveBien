import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { enlaceTelefono, enlaceWhatsApp, HORARIO_TEXTO, NEGOCIO } from '../src/lib/config/negocio'

/**
 * DAT-03 (V-1.1.77): los datos del negocio viven en `src/lib/config/negocio.ts`
 * y en ningún otro sitio. Esta prueba falla si alguien vuelve a escribir el
 * teléfono, el correo, la dirección, las redes o el id de GA4 a mano.
 */
const RAIZ = join(__dirname, '..', 'src')
const FUENTE = 'lib/config/negocio.ts'

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return archivos(p)
    return /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

// Formas en que aparecían (con y sin espacios, con y sin lada).
const PROHIBIDOS: [string, RegExp][] = [
  ['teléfono', /477\s?811\s?6501|4778116501/],
  ['correo', /informes@vivebienn\.com|avisos@vivebienn\.com/],
  ['dirección', /Campestre 2910/],
  ['código postal', /\b37358\b(?!, México)/],
  ['Facebook', /facebook\.com\/profile\.php\?id=61582687400323/],
  ['Instagram', /instagram\.com\/vive_bien_mx/],
  ['GA4', /G-7TQQEQ97S2|G-BKCPFJVTG5/],
]

describe('datos del negocio en un solo lugar', () => {
  const lista = archivos(RAIZ).filter((p) => relative(RAIZ, p).replace(/\\/g, '/') !== FUENTE)

  it('se revisa el código de verdad', () => {
    expect(lista.length).toBeGreaterThan(50)
  })

  for (const [que, patron] of PROHIBIDOS) {
    it(`el ${que} no está escrito fuera de ${FUENTE}`, () => {
      const culpables = lista
        .filter((p) =>
          readFileSync(p, 'utf8')
            .split('\n')
            // Los comentarios que lo citan de ejemplo no cuentan.
            .some((l) => patron.test(l) && !/^\s*(\/\/|\*)/.test(l)),
        )
        .map((p) => relative(RAIZ, p))
      expect(culpables).toEqual([])
    })
  }

  it('los enlaces usan el número oficial', () => {
    expect(enlaceTelefono()).toBe('tel:+524778116501')
    expect(enlaceWhatsApp()).toBe('https://wa.me/524778116501')
    expect(enlaceWhatsApp('Hola, ¿sigue disponible?')).toBe(
      'https://wa.me/524778116501?text=Hola%2C%20%C2%BFsigue%20disponible%3F',
    )
  })

  it('las tres formas del teléfono son el mismo número', () => {
    const digitos = (s: string) => s.replace(/\D/g, '')
    expect(digitos(NEGOCIO.telefono)).toBe(NEGOCIO.whatsapp)
    expect(digitos(NEGOCIO.telefonoInternacional)).toBe(NEGOCIO.whatsapp)
    expect(NEGOCIO.whatsapp.endsWith(digitos(NEGOCIO.telefonoVisible))).toBe(true)
  })

  it('el horario se lee igual que antes en el pie y en «Nosotros»', () => {
    expect(HORARIO_TEXTO).toBe('Lun – Vie: 9:00 – 17:30 | Sáb – Dom: Cerrado')
  })
})
