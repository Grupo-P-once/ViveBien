import { describe, expect, it } from 'vitest'
import { rendimientoPorPropiedad, totalesDe, TEXTO_SENAL } from '../src/lib/analitica-propiedades'
import type { FilaEvento } from '../src/lib/analitica'

/** Rendimiento por propiedad (24-oct-2026): cuenta bien, compara con el periodo anterior y NO inventa diagnósticos con pocos datos. */

const HOY = new Date('2026-10-24T12:00:00Z')
const dias = (n: number) => new Date(HOY.getTime() - n * 86_400_000).toISOString()
const ev = (nombre: string, propiedad_id: string, datos: Record<string, unknown> | null = null, sesion = 's'): FilaEvento => ({ nombre, propiedad_id, datos, creado_en: dias(1), sesion })
const vistas = (id: string, n: number) => Array.from({ length: n }, (_, i) => ev('property_view', id, null, `s${i}`))
const prop = (id: string, extra: object = {}) => ({ id, folio: `VB-${id}`, titulo: `Casa ${id}`, tipo: 'casa', operacion: 'venta', precio: 1_000_000, estado_pub: 'publicada', publicada_en: dias(60), vistas: 0, ...extra })
const base = { eventosAnteriores: [], contactos: [], favoritos: [], hoy: HOY }

describe('conteos', () => {
  it('cuenta vistas, clics de tarjeta y contactos por canal de CADA propiedad, sin mezclarlas', () => {
    const r = rendimientoPorPropiedad({
      ...base, props: [prop('a'), prop('b')],
      eventos: [...vistas('a', 12), ...vistas('b', 3), ev('property_card_click', 'a'), ev('property_card_click', 'a'), ev('property_card_click', 'b'),
        ev('property_contact_click', 'a', { canal: 'whatsapp', lugar: 'tarjeta' }), ev('property_contact_click', 'a', { canal: 'telefono' }), ev('property_contact_click', 'a', { canal: 'correo' }), ev('property_contact_click', 'b', { canal: 'whatsapp' })],
    })
    const a = r.find((x) => x.id === 'a')!, b = r.find((x) => x.id === 'b')!
    expect(a).toMatchObject({ vistas: 12, tarjeta: 2, whatsapp: 1, telefono: 1, correo: 1, contactos: 3 })
    expect(b).toMatchObject({ vistas: 3, tarjeta: 1, whatsapp: 1, telefono: 0, contactos: 1 })
  })
  it('suma solicitudes y guardadas, y calcula los contactos por cada 100 vistas (clics + solicitudes)', () => {
    const r = rendimientoPorPropiedad({
      ...base, props: [prop('a')], eventos: [...vistas('a', 20), ev('property_contact_click', 'a', { canal: 'whatsapp' })],
      contactos: [{ fecha: dias(2), propiedad_id: 'a' }, { fecha: dias(3), propiedad_id: 'a' }, { fecha: dias(3), propiedad_id: 'otra' }],
      favoritos: [{ propiedad_id: 'a' }, { propiedad_id: 'a' }, { propiedad_id: null }],
    })[0]
    expect(r.solicitudes).toBe(2); expect(r.guardadas).toBe(2)
    expect(r.contactosPor100).toBe(15)        // (1 clic + 2 solicitudes) / 20 vistas
  })
  it('sin vistas no hay tasa (no se divide entre cero) y un canal desconocido no cuenta como contacto', () => {
    const r = rendimientoPorPropiedad({ ...base, props: [prop('a')], eventos: [ev('property_contact_click', 'a', { canal: 'otro' })] })[0]
    expect(r.contactosPor100).toBeNull(); expect(r.contactos).toBe(0)
  })
  it('ignora eventos sin propiedad y de otros nombres', () => {
    const r = rendimientoPorPropiedad({ ...base, props: [prop('a')], eventos: [{ nombre: 'property_view', propiedad_id: null, datos: null, creado_en: dias(1), sesion: 'x' }, ev('search_performed', 'a')] })[0]
    expect(r.vistas).toBe(0)
  })
})

describe('cambio contra el periodo anterior', () => {
  it('sube, baja, y es null si antes no había vistas', () => {
    const r = rendimientoPorPropiedad({ ...base, props: [prop('a'), prop('b'), prop('c')], eventos: [...vistas('a', 15), ...vistas('b', 5), ...vistas('c', 4)], eventosAnteriores: [...vistas('a', 10), ...vistas('b', 10)] })
    expect(r.find((x) => x.id === 'a')?.cambioVistas).toBe(50)
    expect(r.find((x) => x.id === 'b')?.cambioVistas).toBe(-50)
    expect(r.find((x) => x.id === 'c')?.cambioVistas).toBeNull()
  })
})

describe('señales: dicen qué revisar, pero solo con datos suficientes', () => {
  const sitio = [...vistas('top', 30), ...vistas('medio', 12), ...vistas('flojo', 2)]   // 44 vistas en el sitio: ya hay datos para opinar
  const props = [prop('top'), prop('medio'), prop('flojo'), prop('cero'), prop('nueva', { publicada_en: dias(2) })]
  const senal = (id: string, evs = sitio, ps = props) => rendimientoPorPropiedad({ ...base, props: ps, eventos: evs }).find((x) => x.id === id)!.senal

  it('con pocas vistas en todo el sitio NADIE recibe diagnóstico', () => {
    const pocos = [...vistas('a', 5), ...vistas('b', 2)]
    for (const id of ['a', 'b']) expect(rendimientoPorPropiedad({ ...base, props: [prop('a'), prop('b')], eventos: pocos }).find((x) => x.id === id)!.senal).toBe('pocos_datos')
  })
  it('una propiedad con muchas vistas y ningún contacto → revisar precio o fotos', () => { expect(senal('top')).toBe('sin_contacto') })
  it('con contactos va bien', () => { expect(senal('top', [...sitio, ev('property_contact_click', 'top', { canal: 'whatsapp' })])).toBe('bien') })
  it('sin ninguna vista en el periodo y con tiempo publicada → sin_vistas', () => { expect(senal('cero')).toBe('sin_vistas') })
  it('una publicada hace menos de 7 días es «nueva», no «sin vistas»', () => { expect(senal('nueva')).toBe('nueva') })
  it('muy por debajo de la mediana, con tiempo publicada → poca visibilidad', () => { expect(senal('flojo')).toBe('poca_visibilidad') })
  it('un borrador o una en revisión es «sin publicar» (no se le juzga)', () => {
    const r = rendimientoPorPropiedad({ ...base, props: [prop('b1', { estado_pub: 'borrador' }), prop('p1')], eventos: sitio, todas: true })
    expect(r.find((x) => x.id === 'b1')?.senal).toBe('sin_publicar')
    expect(TEXTO_SENAL.sin_publicar).toMatch(/publicada/)
  })
  it('todas las señales tienen su texto en palabras', () => {
    for (const s of ['pocos_datos', 'nueva', 'sin_vistas', 'sin_contacto', 'poca_visibilidad', 'bien', 'sin_publicar'] as const) expect(TEXTO_SENAL[s].length).toBeGreaterThan(5)
  })
})

describe('qué propiedades se listan', () => {
  it('por defecto: las publicadas y cualquiera con actividad; con `todas`, todas las que se pasen', () => {
    const props = [prop('pub'), prop('borr', { estado_pub: 'borrador' }), prop('borr2', { estado_pub: 'borrador' })]
    const ev1 = [ev('property_view', 'borr2')]
    expect(rendimientoPorPropiedad({ ...base, props, eventos: ev1 }).map((x) => x.id).sort()).toEqual(['borr2', 'pub'])
    expect(rendimientoPorPropiedad({ ...base, props, eventos: ev1, todas: true }).map((x) => x.id).sort()).toEqual(['borr', 'borr2', 'pub'])
  })
  it('ordena por vistas y luego por clics de tarjeta', () => {
    const r = rendimientoPorPropiedad({ ...base, props: [prop('a'), prop('b'), prop('c')], eventos: [...vistas('b', 5), ...vistas('c', 5), ev('property_card_click', 'c')] })
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('totalesDe', () => {
  it('suma el sitio, cuenta las que no tienen ninguna vista y calcula contactos por 100 vistas', () => {
    const r = rendimientoPorPropiedad({ ...base, props: [prop('a'), prop('b')], eventos: [...vistas('a', 10), ev('property_contact_click', 'a', { canal: 'telefono' })], contactos: [{ fecha: dias(1), propiedad_id: 'a' }] })
    expect(totalesDe(r)).toMatchObject({ propiedades: 2, vistas: 10, contactos: 1, solicitudes: 1, sinVistas: 1, contactosPor100: 20 })
    expect(totalesDe([]).contactosPor100).toBeNull()
  })
})

describe('compartidas y citas', () => {
  it('cuenta las veces compartida por modo y por propiedad', () => {
    const r = rendimientoPorPropiedad({ ...base, props: [prop('a'), prop('b')], eventos: [ev('property_share', 'a', { canal: 'nativo' }), ev('property_share', 'a', { canal: 'copiado' }), ev('property_share', 'a', { canal: 'copiado' }), ev('property_share', 'b', { canal: 'raro' })] })
    expect(r.find((x) => x.id === 'a')).toMatchObject({ compartidas: 3, compartidasNativo: 1, compartidasCopiado: 2 })
    expect(r.find((x) => x.id === 'b')?.compartidas).toBe(0)       // un modo desconocido no cuenta
    expect(totalesDe(r).compartidas).toBe(3)
  })
  it('cuenta las citas por estado solo si se pasan; si no, quedan en 0', () => {
    const citas = [{ propiedad_id: 'a', estado: 'CONFIRMED' }, { propiedad_id: 'a', estado: 'RESCHEDULED' }, { propiedad_id: 'a', estado: 'COMPLETED' }, { propiedad_id: 'a', estado: 'REQUESTED' }, { propiedad_id: null, estado: 'CONFIRMED' }]
    const con = rendimientoPorPropiedad({ ...base, props: [prop('a')], eventos: [], citas })[0]
    expect(con).toMatchObject({ citas: 4, citasConfirmadas: 2, citasCompletadas: 1 })
    const sin = rendimientoPorPropiedad({ ...base, props: [prop('a')], eventos: [] })[0]
    expect(sin).toMatchObject({ citas: 0, citasConfirmadas: 0, citasCompletadas: 0 })
    expect(totalesDe([con]).citas).toBe(4)
  })
})
