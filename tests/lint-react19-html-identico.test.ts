import { createHash } from 'node:crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

/**
 * LINT-1 (2-nov-2026) — PRUEBA DE CARACTERIZACIÓN. Al sacar los componentes definidos DENTRO del render (regla `react-hooks/static-components`)
 * a nivel de módulo, el HTML que producen Términos, Privacidad y la Vista previa del anuncio NO puede cambiar ni una letra. Los hashes de abajo
 * se calcularon con el código ANTERIOR a la limpieza (commit 5bda322); la prueba debe pasar igual antes y después.
 * Header y Footer (componentes de cliente con sesión) se sustituyen por marcadores: no forman parte de lo que se limpia.
 */
vi.mock('@/components/Header', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))

const huella = (html: string) => createHash('sha256').update(html).digest('hex').slice(0, 24)

describe('el HTML de las páginas legales y de la vista previa no cambia con la limpieza de lint', () => {
  it('Términos y Condiciones: texto y marcado idénticos', async () => {
    const { default: Terminos } = await import('../src/app/terminos/page')
    const html = renderToStaticMarkup(createElement(Terminos))
    expect(html.length).toBeGreaterThan(5000)
    expect({ largo: html.length, huella: huella(html) }).toEqual(GOLDEN.terminos)
  })

  it('Aviso de Privacidad: texto y marcado idénticos', async () => {
    const { default: Privacidad } = await import('../src/app/privacidad/page')
    const html = renderToStaticMarkup(createElement(Privacidad))
    expect(html.length).toBeGreaterThan(5000)
    expect({ largo: html.length, huella: huella(html) }).toEqual(GOLDEN.privacidad)
  })

  it('Vista previa del anuncio: vacía (todos los huecos) y completa', async () => {
    const { default: Vista } = await import('../src/components/VistaPreviaAnuncio')
    const vacia = renderToStaticMarkup(createElement(Vista, {}))
    const completa = renderToStaticMarkup(createElement(Vista, {
      titulo: 'Casa en Jardines del Moral', precio: 3_450_000, mantenimiento: 1200, operacion: 'renta', tipo: 'casa',
      colonia: 'Jardines del Moral', ciudad: 'León', metros: 180, recamaras: 3, banos: 2, fotos: ['https://ejemplo.invalid/a.jpg'],
      extras: { caracteristicas: { estacionamientos: 2, amueblado: true } },
    }))
    expect(vacia).toContain('Falta el precio')
    expect(completa).toContain('/ mes')
    expect({ vacia: [vacia.length, huella(vacia)], completa: [completa.length, huella(completa)] }).toEqual(GOLDEN.vista)
  })
})

// Se rellenan con la salida de la primera corrida sobre 5bda322 (ver `LINT-1` en Obsidian).
const GOLDEN = {
  // 3-nov-2026: publicación de la versión aprobada por el abogado: la fecha visible pasó de «22 de octubre de 2026» a «3 de noviembre de 2026» (+1 carácter). Era 16239 / a6e70381e1d74809281184c1.
  // 6-nov-2026: se añadió el sistema de citas (borrador sujeto a aprobación del abogado, versión 2026-11-06): subsección «Citas para visitar una propiedad» en la sección 5 y fecha visible. Era 16240 / e25e55e74a2b69bb4453fc23.
  // 10-nov-2026: la cancelación con .ics del cliente se menciona en «Avisos» y la fecha visible (versión 2026-11-10, borrador sujeto a aprobación del abogado). Era 18970 / 138d33f104c1cf44e5022aed.
  terminos: { largo: 19101, huella: '298cfa199d68473bf5c05e19' },
  // Privacidad: 19865 / 5b4689d21f3284e3683862a8 era el texto de la limpieza de lint (323098c). El 3-nov-2026 se alineó DELIBERADAMENTE el Aviso con el producto real
  // (consulta sin anunciante, analítica con elección, proveedores, encabezado); desde entonces esta es la referencia: cualquier cambio posterior debe ser a propósito.
  // 3-nov-2026 (segunda alineación): se añadió el párrafo de datos de propietarios, representantes y agentes que aporta quien publica (pantalla de origen, en vivo).
  // Misma publicación (solo cambia la fecha visible). Era 21933 / 9009395b0c62ef9654742f74.
  // 4-nov-2026: sección 7 dice qué borra de verdad el proceso diario y qué no (cuentas, consultas, formularios y datos de propietarios: sin borrado automático). Era 21934 / 28525a2361cd327138d46f64.
  // 6-nov-2026: se añadió el sistema de citas (datos, finalidades, quién atiende una cita, proveedores, conservación y aviso simplificado) y la fecha visible; borrador sujeto a aprobación del abogado. Era 22186 / f22aedd3ee971b3e11f4564c.
  // 10-nov-2026: la persona asociada propietaria ve nombre/teléfono/notas, el equipo ve quién hizo cada cambio y la fecha visible (versión 2026-11-10, borrador sujeto a aprobación del abogado). Era 25688 / 79e49f98d2e998dfe1a495fd.
  // 11-nov-2026: finalidad secundaria «propiedades por correo» (consentimiento tácito con oposición desde el 1-dic-2026), aviso corto de formularios y fecha visible (versión 2026-11-11). Era 26187 / 82ef25f8ecbe87d5c7cd0ff5.
  privacidad: { largo: 26573, huella: 'c2cef7ca65e2b01749215538' },
  vista: { vacia: [1542, '3e9aec9a7dd433947f70cf9c'], completa: [1671, 'bb0ae8ee6f77aa2dba096a35'] },
} as { terminos: { largo: number; huella: string }; privacidad: { largo: number; huella: string }; vista: { vacia: [number, string]; completa: [number, string] } }
