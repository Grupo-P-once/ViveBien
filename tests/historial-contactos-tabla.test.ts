import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { estaDisponible, filasDeHistorial, type PropiedadDeHistorial } from '../src/lib/contactos-cliente'
import { mensajeDeInformes, textoDeInformes } from '../src/lib/whatsapp-propiedad'

/** Historial en tabla (fecha, canal, ID, nombre, estatus, enlace) y mensaje de WhatsApp con nombre + ID + enlace (28-oct-2026). */
const P = (id: string, o: Partial<PropiedadDeHistorial> = {}): PropiedadDeHistorial => ({ id, slug: `casa-${id}`, titulo: `Casa ${id}`, folio: `VB-2026-0000${id}`, estado_pub: 'publicada', estatus: 'disponible', ...o })
const mapa = (...ps: PropiedadDeHistorial[]) => new Map(ps.map((p) => [p.id, p]))
const contacto = (id: number, propiedad_id: string, canal: string, creado_en: string, titulo = `Casa ${propiedad_id}`, folio: string | null = `VB-2026-0000${propiedad_id}`) => ({ id, propiedad_id, propiedad_titulo: titulo, propiedad_folio: folio, canal, creado_en })

describe('qué es «disponible»', () => {
  it('publicada y sin estatus de baja', () => {
    expect(estaDisponible(P('1'))).toBe(true)
    for (const estatus of ['vendida', 'rentada', 'pausada', 'eliminada']) expect(estaDisponible(P('1', { estatus })), estatus).toBe(false)
    expect(estaDisponible(P('1', { estado_pub: 'borrador' }))).toBe(false)
    expect(estaDisponible(null)).toBe(false)
  })
})

describe('las filas del historial', () => {
  const props = mapa(P('1'), P('2', { estatus: 'vendida' }), P('3', { estado_pub: 'borrador', titulo: 'BORRADOR SECRETO', folio: 'VB-SECRETO' }))
  const filas = filasDeHistorial(
    [contacto(1, '1', 'whatsapp', '2026-10-28T10:00:00Z'), contacto(2, '1', 'telefono', '2026-10-27T10:00:00Z'), contacto(3, '1', 'correo', '2026-10-26T10:00:00Z'), contacto(4, '2', 'whatsapp', '2026-10-25T10:00:00Z'), contacto(5, 'borrada', 'whatsapp', '2026-10-24T10:00:00Z', 'Casa vieja', 'VB-2026-00009')],
    [{ id: 'c1', propiedad_id: '1', creada_en: '2026-10-29T10:00:00Z' }, { id: 'c2', propiedad_id: '3', creada_en: '2026-10-23T10:00:00Z' }, { id: 'c3', propiedad_id: null, creada_en: '2026-10-22T10:00:00Z' }],
    props,
  )
  it('una fila por contacto o cita, de la más reciente a la más antigua; una cita sin propiedad no sale', () => {
    expect(filas.map((f) => f.canal)).toEqual(['cita', 'whatsapp', 'telefono', 'correo', 'whatsapp', 'whatsapp', 'cita'])
    expect(filas.map((f) => f.creadoEn)).toEqual([...filas.map((f) => f.creadoEn)].sort().reverse())
  })
  it('cada fila trae ID (folio), nombre, estatus y enlace', () => {
    expect(filas[1]).toMatchObject({ canal: 'whatsapp', folio: 'VB-2026-00001', nombre: 'Casa 1', disponible: true, ruta: '/propiedades/casa-1' })
  })
  it('vendida → «no disponible»; ya no existe → «no disponible» con enlace que dará 404 (por id); el enlace SIEMPRE existe', () => {
    expect(filas.find((f) => f.clave === 'c4')).toMatchObject({ disponible: false, ruta: '/propiedades/casa-2' })   // vendida: la ficha sigue pública (D-59), el enlace la abre
    expect(filas.find((f) => f.clave === 'c5')).toMatchObject({ disponible: false, nombre: 'Casa vieja', ruta: '/propiedades/borrada' })
    for (const f of filas) expect(f.ruta).toMatch(/^\/propiedades\/[^/]+$/)
  })
  it('una cita de una propiedad no publicada NO enseña su título ni folio actuales (podría ser un borrador)', () => {
    const c = filas.find((f) => f.canal === 'cita' && f.ruta === '/propiedades/3')!
    expect(c).toMatchObject({ disponible: false, folio: null, nombre: 'Propiedad que ya no está publicada' })
    expect(JSON.stringify(filas)).not.toContain('SECRETO')
  })
})

describe('el mensaje de WhatsApp', () => {
  const p = { id: 'uuid-1', slug: 'casa-en-canada-n8tl', titulo: 'Casa en Cañada del Refugio', folio: 'VB-2026-00003' }
  it('«Hola, quiero más información sobre {nombre} (ID {folio}): {enlace}»', () => {
    expect(mensajeDeInformes(p, 'https://vivebienn.com')).toBe('Hola, quiero más información sobre Casa en Cañada del Refugio (ID VB-2026-00003): https://vivebienn.com/propiedades/casa-en-canada-n8tl')
  })
  it('sin folio no deja paréntesis vacíos; sin slug el enlace usa el id; sin título arma un nombre, nunca el id', () => {
    const m = mensajeDeInformes({ id: 'abc', tipo: 'casa', operacion: 'venta' }, 'https://x.mx')
    expect(m).toBe('Hola, quiero más información sobre Casa en venta: https://x.mx/propiedades/abc')
    expect(m).not.toContain('()')
  })
  it('va codificado para ?text=', () => { expect(textoDeInformes(p, 'https://x.mx')).toBe(encodeURIComponent(mensajeDeInformes(p, 'https://x.mx'))) })
  it('BARRERA: la ficha, el catálogo, la tarjeta y el listado usan ESTE mensaje (no uno propio solo con el nombre)', () => {
    for (const f of ['src/app/propiedades/[id]/page-client.tsx', 'src/components/catalogo/TarjetaCompacta.tsx', 'src/components/PropertyCard.tsx', 'src/app/propiedades/page-client.tsx']) {
      const s = readFileSync(f, 'utf8')
      expect(s, f).toContain('textoDeInformes(')
      expect(s, f).not.toContain('Hola, me interesa la propiedad:')
    }
  })
})
