import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { fotoParaCompartir } from '../src/lib/medios/optimizar'
import { descripcionDe } from '../src/lib/seo-propiedad'

/**
 * Vista previa al compartir un enlace (27-oct-2026).
 *  · INICIO: la tarjeta de VIVE BIEN va CENTRADA en la imagen. WhatsApp/Telegram recortan al cuadrado central: una tarjeta pegada a la esquina (como estaba) se perdía.
 *  · PROPIEDADES: la portada (primera foto) viaja como JPEG 1200×630 ligero. Antes era la foto ORIGINAL de Cloudinary (1.5–2.5 MB) y WhatsApp la descartaba: el enlace salía sin imagen.
 */
const CLOUD = 'https://res.cloudinary.com/zwsi9aar/image/upload/v1789326825/vivebien/nave/propiedad-sin-titulo-d52n/mu06zppz-04no5v.jpg'

describe('fotoParaCompartir', () => {
  it('pide a Cloudinary un JPEG 1200×630 recortado con inteligencia y de calidad automática', () => {
    const u = fotoParaCompartir(CLOUD)!
    expect(u).toContain('/image/upload/c_fill,g_auto,w_1200,h_630,f_jpg,q_auto:good/v1789326825/')
    expect(u).not.toContain('f_auto') // un rastreador puede recibir WebP/AVIF que no entiende
  })
  it('lo que no es de Cloudinary, o ya viene transformado, se devuelve igual; sin foto, null', () => {
    expect(fotoParaCompartir('https://otro.mx/foto.jpg')).toBe('https://otro.mx/foto.jpg')
    const ya = 'https://res.cloudinary.com/zwsi9aar/image/upload/w_400,f_auto/v1/a/b.jpg'
    expect(fotoParaCompartir(ya)).toBe(ya)
    expect(fotoParaCompartir(null)).toBeNull()
    expect(fotoParaCompartir('')).toBeNull()
  })
})

describe('la descripción de la vista previa de una propiedad', () => {
  it('no lleva emojis, **negritas**, # ni enlaces ni barras del texto del dueño', () => {
    const d = descripcionDe({ tipo: 'casa', operacion: 'venta', precio: 6300000, metros: 375, ubicacion: 'Cañada del Refugio, León, Guanajuato', ciudad: 'León', estado_dir: 'Guanajuato',
      descripcion: '🏡 **CASA EN VENTA | CAÑADA DEL REFUGIO SUR, LEÓN, GTO.** Descubre una residencia ✨ https://maps.app.goo.gl/abc' })
    expect(d).not.toMatch(/\*\*|🏡|✨|https?:|\|/)
    expect(d).toContain('CASA EN VENTA')
    expect(d.length).toBeLessThanOrEqual(158)
  })
})

describe('la imagen de inicio', () => {
  it('mide 1200×630, pesa poco y su tarjeta blanca está en el CENTRO (a salvo del recorte cuadrado), no en una esquina', async () => {
    const img = sharp('public/og/inicio.jpg')
    const m = await img.metadata()
    expect([m.width, m.height, m.format]).toEqual([1200, 630, 'jpeg'])
    const { data, info } = await sharp('public/og/inicio.jpg').raw().toBuffer({ resolveWithObject: true })
    const px = (x: number, y: number) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]] }
    const blanco = (c: number[]) => c.every((v) => v > 235)
    expect(blanco(px(340, 150))).toBe(true)   // esquina superior izquierda DENTRO de la tarjeta (cuadrado central: x de 285 a 915)
    expect(blanco(px(860, 480))).toBe(true)   // esquina inferior derecha dentro de la tarjeta
    expect(blanco(px(60, 560))).toBe(false)   // donde estaba la tarjeta antigua: ahora es foto
  })
  it('las páginas siguen declarando /og/inicio.jpg y la ficha usa la portada optimizada con la tarjeta como respaldo', () => {
    expect(readFileSync('src/app/page.tsx', 'utf8')).toContain("imagen: '/og/inicio.jpg'")
    const f = readFileSync('src/app/propiedades/[id]/page.tsx', 'utf8')
    expect(f).toContain('fotoParaCompartir(data.fotos?.[0])')
    expect(f).toContain("portada || '/og/inicio.jpg'")
    expect(f).not.toContain("|| '/logo_transparent.png'")
  })
})
