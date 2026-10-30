import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CaracteristicasFicha from '@/components/CaracteristicasFicha'
import CamposCaracteristicas from '@/components/publicador/CamposCaracteristicas'

/** Lo que pinta la ficha pública y lo que ofrece el editor, renderizado de verdad (sin navegador): agrupado, sin vacíos, por tipo y operación. */

const car = (c: Record<string, unknown>) => ({ caracteristicas: { v: 1, ...c } })
const ficha = (p: Record<string, unknown>) => renderToStaticMarkup(createElement(CaracteristicasFicha, { propiedad: p }))

describe('ficha pública', () => {
  it('sin características no pinta nada (una ficha antigua queda igual)', () => {
    expect(ficha({ tipo: 'casa', operacion: 'venta', extras: {} })).toBe('')
    expect(ficha({ tipo: 'casa', operacion: 'venta', extras: null })).toBe('')
  })
  it('agrupa, escribe los valores y no enseña campos vacíos', () => {
    const html = ficha({
      tipo: 'oficina', operacion: 'renta',
      extras: car({ privados: 2, salas_juntas: 1, recepcion: true, piso: 0, servicios: ['fibra_optica', 'agua'], amueblado: 'semi', deposito_meses: 2, elevador: false }),
    })
    expect(html).toContain('Características')
    for (const t of ['Espacios y distribución', 'Servicios', 'Condiciones de renta', 'Privados u oficinas cerradas', 'Planta baja', 'Fibra óptica', 'Semiamueblado', '2 meses']) expect(html).toContain(t)
    expect(html).not.toContain('Hay elevador')            // false = no se enseña
    expect(html).not.toContain('Seguridad')               // grupo sin datos: fuera
    expect(html).toContain('Datos declarados por quien publica')
  })
  it('lo de renta no aparece en una venta ni lo que no aplica al tipo', () => {
    const html = ficha({ tipo: 'casa', operacion: 'venta', extras: car({ estacionamientos: 2, mascotas: 'permitidas', deposito_meses: 1, privados: 3 }) })
    expect(html).toContain('Estacionamientos')
    for (const t of ['Mascotas', 'Depósito', 'Condiciones de renta', 'Privados']) expect(html).not.toContain(t)
  })
  it('escapa el texto libre (giro) y no lo interpreta como HTML', () => {
    const html = ficha({ tipo: 'comercial', operacion: 'venta', extras: car({ giro: '<img src=x onerror=alert(1)>' }) })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('campos del editor', () => {
  const editor = (tipo: string, operacion: string, grupos: string[], extras: unknown = {}) =>
    renderToStaticMarkup(createElement(CamposCaracteristicas, { tipo, operacion, extras, grupos: grupos as never, onChange: () => {} }))
  it('oficina: ofrece privados, salas de juntas y recepción, no niveles ni mascotas', () => {
    const html = editor('oficina', 'renta', ['espacios', 'renta'])
    for (const t of ['Privados u oficinas cerradas', 'Salas de juntas', 'Tiene recepción', 'Amueblado', 'Depósito (meses de renta)']) expect(html).toContain(t)
    for (const t of ['Niveles o plantas', 'Mascotas', 'Frente (m)']) expect(html).not.toContain(t)
  })
  it('casa en venta: sin condiciones de renta', () => {
    expect(editor('casa', 'venta', ['renta'])).toBe('')
    expect(editor('casa', 'venta', ['espacios'])).toContain('Niveles o plantas')
  })
  it('«comercial» (vocabulario del sitio) ofrece lo del local', () => {
    expect(editor('comercial', 'venta', ['espacios'])).toContain('Giro del local')
  })
  it('muestra lo ya guardado (reabrir) y abre el grupo que tiene datos', () => {
    const html = editor('oficina', 'venta', ['espacios', 'servicios'], car({ privados: 4, servicios: ['agua'] }))
    expect(html).toContain('value="4"')
    expect(html).toMatch(/<details[^>]*open[^>]*>[\s\S]*Servicios/)
    expect(html).toMatch(/checked/)
  })
})
