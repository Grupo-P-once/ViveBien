import { describe, expect, it } from 'vitest'
import { claveDeBusqueda, correoDeAlertas, correoLegal, notificacionesDeBusqueda, notificacionesLegales, nuevasParaAviso, tocaAvisar, type BusquedaParaAviso } from '../src/lib/avisos-cliente'
import type { FilaPropiedadPortal } from '../src/lib/portal/tarjeta'

/** El motor de las alertas del cliente: qué se avisa, cuándo y cómo viaja en el correo. Código puro. */
const AHORA = Date.parse('2026-10-28T15:00:00Z')
const hace = (dias: number) => new Date(AHORA - dias * 86_400_000).toISOString()
const prop = (id: string, sobre: Partial<FilaPropiedadPortal> = {}): FilaPropiedadPortal => ({
  id, titulo: `Casa ${id}`, tipo: 'casa', operacion: 'venta', precio: 3_000_000, precio_incluye_iva: false, moneda: 'MXN', ubicacion: 'Cañada del Refugio', colonia: 'Cañada del Refugio', ciudad: 'León',
  metros: 200, recamaras: 3, banos: 2, altura_libre: null, andenes: null, estatus: 'disponible', estado_pub: 'publicada', slug: `casa-${id}`, fotos: [], publicada_en: hace(1), created_at: hace(1), ...sobre,
})
const busqueda = (sobre: Partial<BusquedaParaAviso> = {}): BusquedaParaAviso => ({ id: 7, uid: 'u1', nombre: 'Casa en León', filtros: { op: 'venta', tipo: 'casa' }, alertas: true, frecuencia: 'diaria', creado_en: hace(10), avisada_en: null, ...sobre })

describe('qué es «nuevo» para una búsqueda', () => {
  it('lo que coincide y salió DESPUÉS de guardar la búsqueda', () => {
    const r = nuevasParaAviso(busqueda(), [prop('a'), prop('b', { operacion: 'renta' }), prop('c', { tipo: 'terreno' })])
    expect(r.map((p) => p.id)).toEqual(['a'])
  })
  it('lo publicado ANTES de guardar la búsqueda no es nuevo', () => {
    expect(nuevasParaAviso(busqueda({ creado_en: hace(2) }), [prop('vieja', { publicada_en: hace(5), created_at: hace(5) })])).toEqual([])
  })
  it('lo avisado ya (antes del último aviso) no se repite; solo lo posterior', () => {
    const b = busqueda({ avisada_en: hace(1.5) })
    const r = nuevasParaAviso(b, [prop('antes', { publicada_en: hace(3), created_at: hace(3) }), prop('despues', { publicada_en: hace(1), created_at: hace(1) })])
    expect(r.map((p) => p.id)).toEqual(['despues'])
  })
  it('nada pausado, vendido, rentado, eliminado ni sin publicar', () => {
    const r = nuevasParaAviso(busqueda(), [prop('p', { estatus: 'pausada' }), prop('v', { estatus: 'vendida' }), prop('r', { estatus: 'rentada' }), prop('e', { estatus: 'eliminada' }), prop('b', { estado_pub: 'borrador' }), prop('ok')])
    expect(r.map((p) => p.id)).toEqual(['ok'])
  })
  it('de la más nueva a la más vieja', () => {
    const r = nuevasParaAviso(busqueda(), [prop('x', { publicada_en: hace(4), created_at: hace(4) }), prop('y', { publicada_en: hace(1), created_at: hace(1) }), prop('z', { publicada_en: hace(2), created_at: hace(2) })])
    expect(r.map((p) => p.id)).toEqual(['y', 'z', 'x'])
  })
  it('respeta los filtros de precio y zona igual que el buscador', () => {
    const b = busqueda({ filtros: { op: 'venta', tipo: 'casa', pmax: 2_500_000, zona: 'Silao' } })
    expect(nuevasParaAviso(b, [prop('caro'), prop('silao', { precio: 2_000_000, ubicacion: 'Silao', colonia: 'Centro', ciudad: 'Silao' })]).map((p) => p.id)).toEqual(['silao'])
  })
})

describe('cuándo toca avisar', () => {
  it('apagada nunca; diaria siempre', () => {
    expect(tocaAvisar({ alertas: false, frecuencia: 'diaria', avisada_en: null }, AHORA)).toBe(false)
    expect(tocaAvisar({ alertas: true, frecuencia: 'diaria', avisada_en: hace(0.1) }, AHORA)).toBe(true)
  })
  it('semanal: la primera vez, y luego solo cuando pasó ~una semana', () => {
    expect(tocaAvisar({ alertas: true, frecuencia: 'semanal', avisada_en: null }, AHORA)).toBe(true)
    expect(tocaAvisar({ alertas: true, frecuencia: 'semanal', avisada_en: hace(3) }, AHORA)).toBe(false)
    expect(tocaAvisar({ alertas: true, frecuencia: 'semanal', avisada_en: hace(6.9) }, AHORA)).toBe(true)
  })
})

describe('notificaciones de una búsqueda', () => {
  it('una por propiedad, con clave estable (repetir la tarea no duplica) y enlace del propio sitio', () => {
    const n = notificacionesDeBusqueda(busqueda(), [prop('a')])
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ uid: 'u1', tipo: 'busqueda_nueva', busqueda_id: 7, propiedad_id: 'a', clave: claveDeBusqueda(7, 'a') })
    expect(n[0].enlace).toMatch(/^\/propiedades\//)
    expect(n[0].titulo).toContain('Casa en León')
    expect(n[0].cuerpo).toContain('$3,000,000')
    expect(claveDeBusqueda(7, 'a')).toBe(notificacionesDeBusqueda(busqueda(), [prop('a')])[0].clave)
  })
  it('un título larguísimo o raro no rompe los topes de la tabla', () => {
    const n = notificacionesDeBusqueda(busqueda({ nombre: 'x'.repeat(400) }), [prop('a', { titulo: 'y'.repeat(900) })])[0]
    expect(n.titulo.length).toBeLessThanOrEqual(160)
    expect(n.cuerpo.length).toBeLessThanOrEqual(600)
  })
})

describe('aviso por cambio de Términos / Aviso de Privacidad', () => {
  const vigentes = { terminos: '2026-11-01', privacidad: '2026-10-22' }
  it('avisa a quien aceptó una versión ANTERIOR; no a quien ya aceptó la vigente ni a quien nunca aceptó', () => {
    const n = notificacionesLegales(vigentes, [
      { uid: 'viejo', documento: 'terminos', version: '2026-10-22' },
      { uid: 'al-dia', documento: 'terminos', version: '2026-11-01' },
      { uid: 'al-dia', documento: 'privacidad', version: '2026-10-22' },
      { uid: 'otro-doc', documento: 'contrato-raro', version: '1' },
    ])
    expect(n.map((x) => [x.uid, x.clave])).toEqual([['viejo', 'legal:terminos:2026-11-01']])
    expect(n[0]).toMatchObject({ tipo: 'legal', enlace: '/terminos' })
  })
  it('si aceptó una antigua Y la vigente, no se le avisa', () => {
    expect(notificacionesLegales(vigentes, [{ uid: 'a', documento: 'terminos', version: '2026-10-22' }, { uid: 'a', documento: 'terminos', version: '2026-11-01' }])).toEqual([])
  })
})

describe('correos', () => {
  const base = { sitio: 'https://vivebienn.com', urlBaja: 'https://vivebienn.com/api/avisos/baja?t=abc', urlPreferencias: 'https://vivebienn.com/portal/configuracion' }
  it('resumen: un correo con todas las búsquedas, baja en un clic y razón de recibirlo', () => {
    const c = correoDeAlertas({ nombre: 'Ana', ...base, grupos: [{ busquedaNombre: 'Casa en León', href: '/propiedades', items: [{ titulo: 'Casa a', cuerpo: '$3,000,000', url: 'https://vivebienn.com/propiedades/a' }, { titulo: 'Casa b', cuerpo: '$2,000,000', url: 'https://vivebienn.com/propiedades/b' }] }] })
    expect(c.asunto).toBe('Hay 2 propiedades nuevas para tus búsquedas en Vive Bien')
    expect(c.texto).toContain(base.urlBaja); expect(c.html).toContain(base.urlBaja)
    expect(c.texto).toContain('Recibes este correo porque activaste los avisos')
  })
  it('un solo hallazgo va en singular', () => {
    expect(correoDeAlertas({ ...base, grupos: [{ busquedaNombre: 'x', href: '/', items: [{ titulo: 't', cuerpo: 'c', url: 'https://vivebienn.com/propiedades/a' }] }] }).asunto).toBe('Hay 1 propiedad nueva para tu búsqueda en Vive Bien')
  })
  it('NADA del texto de otras personas se interpreta como HTML (títulos, nombres de búsqueda y de la persona)', () => {
    const malo = '<script>alert(1)</script><img src=x onerror=alert(2)>'
    const c = correoDeAlertas({ nombre: malo, ...base, grupos: [{ busquedaNombre: malo, href: '/', items: [{ titulo: malo, cuerpo: malo, url: 'https://vivebienn.com/propiedades/a?x="><script>' }] }] })
    expect(c.html).not.toContain('<script>'); expect(c.html).not.toContain('<img src=x')
    expect(c.html).toContain('&lt;script&gt;')
  })
  it('correo legal: texto y HTML con el aviso y el enlace al documento', () => {
    const avisos = notificacionesLegales({ terminos: '2026-11-01' }, [{ uid: 'u', documento: 'terminos', version: '2026-10-22' }])
    const c = correoLegal({ nombre: 'Ana', avisos, sitio: 'https://vivebienn.com', urlPreferencias: base.urlPreferencias })
    expect(c.asunto).toBe('Actualizamos el Términos y Condiciones')
    expect(c.texto).toContain('https://vivebienn.com/terminos')
    expect(c.html).toContain('href="https://vivebienn.com/terminos"')
  })
})
