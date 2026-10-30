import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { sanearContenido } from '@/lib/sanear-propiedad'
import { DEFINICIONES } from '@/lib/caracteristicas'
import VistaPreviaAnuncio from '@/components/VistaPreviaAnuncio'

/**
 * `extras` se lee en PÚBLICO (SELECT_PUBLICO). Estas pruebas fijan que las escrituras NUEVAS no pueden meter datos privados o legales,
 * y que la vista previa del publicador enseña lo mismo que enseñará el sitio (subtipo y datos clave).
 */
const sanear = (entrada: Record<string, unknown>) => sanearContenido(entrada, { moderador: false, actuales: { tipo: 'casa', operacion: 'venta', extras: {} }, nube: null })

describe('nada privado ni legal puede entrar por las escrituras nuevas', () => {
  const PRIVADAS = ['telefono', 'whatsapp', 'correo', 'email', 'nombre_propietario', 'notas_internas', 'notas', 'documentos', 'escritura', 'clave_catastral', 'uso_de_suelo', 'uso_suelo', 'regimen_propiedad', 'aval', 'requisitos_renta', 'comprobante_ingresos', 'curp', 'rfc', 'password', 'token']
  for (const clave of PRIVADAS) {
    it(`«${clave}» se rechaza (dentro de caracteristicas y suelta en extras)`, () => {
      expect(sanear({ extras: { caracteristicas: { v: 1, [clave]: 'x' } } }).errores.length).toBeGreaterThan(0)
      expect(sanear({ extras: { [clave]: 'x' } }).errores.length).toBeGreaterThan(0)
    })
  }
  it('el catálogo de claves permitidas no contiene ninguna de esas palabras', () => {
    const claves = DEFINICIONES.map((d) => d.clave)
    for (const p of PRIVADAS) expect(claves, p).not.toContain(p)
    expect(claves.some((c) => /tel|mail|nota|docu|escritura|catastr|aval|curp|rfc|suelo|regimen/.test(c))).toBe(false)
  })
  it('el texto libre permitido (giro) es corto y sólo ahí', () => {
    const texto = DEFINICIONES.filter((d) => d.forma === 'texto')
    expect(texto.map((d) => d.clave)).toEqual(['giro'])
    expect(sanearContenido({ tipo: 'comercial', extras: { caracteristicas: { v: 1, giro: 'x'.repeat(81) } } }, { moderador: false, actuales: null, nube: null }).errores.length).toBeGreaterThan(0)
  })
})

describe('vista previa del publicador', () => {
  const html = (p: Record<string, unknown>) => renderToStaticMarkup(createElement(VistaPreviaAnuncio, p as never))
  it('enseña subtipo, baños con medio baño, estacionamientos y etiquetas de renta', () => {
    const h = html({ titulo: 'Consultorio en torre médica', tipo: 'oficina', subtipo: 'consultorio', operacion: 'renta', precio: 9000, metros: 45, banos: 1.5, descripcion: '',
      extras: { caracteristicas: { v: 1, estacionamientos: 2, amueblado: 'si', piso: 2 } }, fotos: [] })
    for (const t of ['Consultorio', '1 baño y medio', '2 est', 'Amueblado', '/ mes']) expect(h).toContain(t)
  })
  it('sin datos no inventa nada y marca lo que falta', () => {
    const h = html({ tipo: 'casa', operacion: 'venta', fotos: [] })
    expect(h).toContain('Falta el precio')
    expect(h).not.toContain('data-etiquetas-caracteristicas')
  })
  it('ya no usa el gris que no pasaba el contraste', () => {
    expect(html({ titulo: 'x', ubicacion: 'León', precio: 1, mantenimiento: 100, fotos: [] }).toLowerCase()).not.toContain('#8b95a3')
  })
})
