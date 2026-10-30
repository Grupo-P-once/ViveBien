import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { sanearContenido } from '@/lib/sanear-propiedad'
import { definicionesPara, etiquetaSubtipo, etiquetasTarjeta, gruposVisibles, validarCaracteristicas } from '@/lib/caracteristicas'
import { SUBTIPOS, TIPOS } from '@/lib/esquemas/propiedad'
import { aHref, coincide, describir, mismaBusqueda, normalizarFiltros } from '@/lib/busquedas'
import CaracteristicasFicha from '@/components/CaracteristicasFicha'

/**
 * Ampliación de características y subtipos (16-oct-2026), tras revisar cómo describen sus anuncios los portales mexicanos
 * (naves, locales, terrenos, oficinas, casas y departamentos). Llama a las funciones REALES del servidor y del sitio.
 */
const sanear = (entrada: Record<string, unknown>, actuales: Record<string, unknown> | null = null) => sanearContenido(entrada, { moderador: false, actuales, nube: null })
const car = (c: Record<string, unknown>) => ({ caracteristicas: { v: 1, ...c } })
const claves = (tipo: string, op = 'venta') => definicionesPara(tipo, op).map((d) => d.clave)

describe('subtipos por tipo (esquema)', () => {
  it('oficina: consultorio, corporativa, compartida y comercial; terreno: residencial, comercial, industrial, campestre, mixto, agrícola', () => {
    expect(SUBTIPOS.oficina.map((s) => s.valor)).toEqual(['consultorio', 'corporativa', 'compartida', 'comercial'])
    expect(SUBTIPOS.terreno.map((s) => s.valor)).toEqual(['residencial', 'comercial', 'industrial', 'campestre', 'mixto', 'agricola'])
  })
  it('cada subtipo es válido para su tipo y el servidor rechaza uno de otro tipo', () => {
    for (const t of TIPOS) for (const s of SUBTIPOS[t]) expect(sanear({ tipo: t, subtipo: s.valor }).errores, `${t}/${s.valor}`).toEqual([])
    expect(sanear({ tipo: 'oficina', subtipo: 'industrial' }).errores.length).toBeGreaterThan(0)
    expect(sanear({ tipo: 'terreno', subtipo: 'consultorio' }).errores.length).toBeGreaterThan(0)
    expect(sanear({ tipo: 'nave', subtipo: 'compartida' }).errores.length).toBeGreaterThan(0)
  })
  it('«comercial» (vocabulario del sitio) usa los subtipos de local', () => {
    expect(sanear({ tipo: 'comercial', subtipo: 'esquina' }).errores).toEqual([])
    expect(etiquetaSubtipo('comercial', 'esquina')).toBe('Local en esquina')
  })
  it('la etiqueta de un subtipo antiguo o ajeno al tipo es null (no se enseña basura)', () => {
    expect(etiquetaSubtipo('casa', 'raro')).toBeNull()
    expect(etiquetaSubtipo('oficina', 'industrial')).toBeNull()
    expect(etiquetaSubtipo('oficina', null)).toBeNull()
  })
})

describe('características nuevas: dónde aplican', () => {
  it('naves y bodegas: kVA, patio de maniobras, oficinas, rampas, resistencia del piso, parque industrial, equipamiento', () => {
    for (const t of ['nave', 'bodega']) for (const k of ['kva', 'patio_maniobras_m2', 'm_oficinas', 'rampas', 'resistencia_piso', 'parque_industrial', 'equipamiento', 'esquina']) expect(claves(t), `${t}/${k}`).toContain(k)
    expect(claves('casa')).not.toContain('kva')
    expect(claves('oficina')).not.toContain('patio_maniobras_m2')
  })
  it('terreno: bardeado, esquina, parque industrial, desarrollo, kVA; no equipamiento', () => {
    for (const k of ['bardeado', 'esquina', 'parque_industrial', 'desarrollo', 'kva', 'frente', 'fondo', 'forma', 'topografia', 'acceso']) expect(claves('terreno')).toContain(k)
    expect(claves('terreno')).not.toContain('equipamiento')
  })
  it('oficina (consultorio, corporativa, compartida): puestos, sala de espera, equipamiento, techados', () => {
    for (const k of ['puestos', 'sala_espera', 'equipamiento', 'estacionamientos_cubiertos', 'privados', 'salas_juntas', 'recepcion']) expect(claves('oficina')).toContain(k)
    expect(claves('oficina')).not.toContain('vitrina')
  })
  it('local: aparador, mezanine, esquina, equipamiento; casa/departamento: amenidades comunes, desarrollo, techados', () => {
    for (const k of ['vitrina', 'mezanine', 'esquina', 'equipamiento', 'giro']) expect(claves('comercial')).toContain(k)
    for (const t of ['casa', 'departamento']) for (const k of ['amenidades_comunes', 'desarrollo', 'estacionamientos_cubiertos']) expect(claves(t)).toContain(k)
    expect(claves('edificio')).toContain('unidades')
    expect(claves('casa')).not.toContain('unidades')
  })
})

describe('validación de lo nuevo (servidor)', () => {
  it('acepta valores correctos de una nave y los guarda tipados', () => {
    const r = sanear({ tipo: 'nave', subtipo: 'en_parque', operacion: 'renta', extras: car({ kva: 3000, patio_maniobras_m2: 12540, m_oficinas: 331, rampas: 1, resistencia_piso: 6.5, parque_industrial: true, equipamiento: ['contra_incendio', 'planta_emergencia'], plazo_minimo_meses: 60 }) })
    expect(r.errores).toEqual([])
    expect(r.datos.extras).toEqual({ caracteristicas: { v: 1, kva: 3000, patio_maniobras_m2: 12540, m_oficinas: 331, rampas: 1, resistencia_piso: 6.5, parque_industrial: true, equipamiento: ['contra_incendio', 'planta_emergencia'], plazo_minimo_meses: 60 } })
  })
  const malos: [string, Record<string, unknown>][] = [
    ['kVA decimal', { tipo: 'nave', extras: car({ kva: 12.5 }) }],
    ['kVA en una casa', { tipo: 'casa', extras: car({ kva: 100 }) }],
    ['resistencia fuera de rango', { tipo: 'nave', extras: car({ resistencia_piso: 500 }) }],
    ['patio negativo', { tipo: 'nave', extras: car({ patio_maniobras_m2: -3 }) }],
    ['equipamiento inexistente', { tipo: 'oficina', extras: car({ equipamiento: ['jacuzzi'] }) }],
    ['puestos en una casa', { tipo: 'casa', extras: car({ puestos: 4 }) }],
    ['unidades 0', { tipo: 'edificio', extras: car({ unidades: 0 }) }],
    ['desarrollo inexistente', { tipo: 'casa', extras: car({ desarrollo: 'isla' }) }],
    ['amenidad común inexistente', { tipo: 'departamento', extras: car({ amenidades_comunes: ['helipuerto'] }) }],
    ['techados sin total', { tipo: 'casa', extras: car({ estacionamientos_cubiertos: 2 }) }],
    ['techados más que el total', { tipo: 'casa', extras: car({ estacionamientos: 1, estacionamientos_cubiertos: 2 }) }],
    ['vitrina en una oficina', { tipo: 'oficina', extras: car({ vitrina: true }) }],
  ]
  for (const [n, cuerpo] of malos) it(`rechaza: ${n}`, () => expect(sanear(cuerpo).errores.length).toBeGreaterThan(0))
  it('techados ≤ total se acepta', () => {
    expect(validarCaracteristicas({ estacionamientos: 3, estacionamientos_cubiertos: 2 }, 'casa', 'venta').errores).toEqual([])
    expect(validarCaracteristicas({ estacionamientos: 2, estacionamientos_cubiertos: 2 }, 'casa', 'venta').errores).toEqual([])
  })
})

describe('lectura pública', () => {
  it('la ficha enseña «Tipo específico» y los datos nuevos sin vacíos', () => {
    const html = renderToStaticMarkup(createElement(CaracteristicasFicha, { propiedad: { tipo: 'oficina', subtipo: 'compartida', operacion: 'renta', extras: car({ puestos: 12, sala_espera: true, equipamiento: ['cocineta', 'aire_acondicionado'], estacionamientos: 4, estacionamientos_cubiertos: 2 }) } }))
    for (const t of ['Tipo específico', 'Oficina compartida o coworking', 'Puestos de trabajo', 'Tiene sala de espera', 'Cocineta', 'Estacionamientos techados']) expect(html).toContain(t)
  })
  it('una ficha con sólo subtipo muestra «Tipo específico»; sin datos ni subtipo no pinta nada', () => {
    expect(gruposVisibles({ tipo: 'terreno', subtipo: 'industrial', operacion: 'venta', extras: {} })[0]!.items[0]).toMatchObject({ etiqueta: 'Tipo específico', valor: 'Terreno industrial' })
    expect(gruposVisibles({ tipo: 'terreno', subtipo: null, operacion: 'venta', extras: {} })).toEqual([])
  })
  it('la tarjeta lleva el subtipo primero', () => {
    expect(etiquetasTarjeta({ tipo: 'oficina', subtipo: 'consultorio', operacion: 'venta', extras: car({ estacionamientos: 1 }) })).toEqual(['Consultorio', '1 estacionamiento'])
  })
})

describe('filtro por subtipo (catálogo y búsquedas guardadas)', () => {
  const lista = [
    { tipo: 'oficina', subtipo: 'consultorio', operacion: 'venta' }, { tipo: 'oficina', subtipo: 'compartida', operacion: 'renta' },
    { tipo: 'terreno', subtipo: 'industrial', operacion: 'venta' }, { tipo: 'terreno', subtipo: 'comercial', operacion: 'venta' }, { tipo: 'oficina', subtipo: null, operacion: 'venta' },
  ]
  const buscar = (f: Record<string, unknown>) => lista.filter((p) => coincide(p, normalizarFiltros(f) ?? {}))
  it('sólo cuenta con un tipo elegido y filtra por el subtipo exacto', () => {
    expect(buscar({ tipo: 'oficina', sub: 'consultorio' })).toEqual([lista[0]])
    expect(buscar({ tipo: 'oficina', sub: 'compartida', op: 'renta' })).toEqual([lista[1]])
    expect(buscar({ tipo: 'terreno', sub: 'industrial' })).toEqual([lista[2]])
    expect(buscar({ sub: 'consultorio' }).length).toBe(lista.length)           // sin tipo se ignora (no deja el catálogo en cero)
    expect(buscar({ tipo: 'oficina', sub: 'coworking' })).toEqual([])         // un subtipo inexistente no encuentra nada
  })
  it('se rechaza basura y viaja en la URL, la descripción y la comparación de búsquedas', () => {
    expect(normalizarFiltros({ tipo: 'oficina', sub: '<script>' })).toEqual({ tipo: 'oficina' })
    const f = normalizarFiltros({ tipo: 'oficina', sub: 'consultorio' })!
    expect(aHref(f)).toBe('/propiedades?tipo=oficina&sub=consultorio')
    expect(describir(f)).toBe('Oficinas · consultorio')
    expect(mismaBusqueda(f, normalizarFiltros({ tipo: 'oficina', sub: 'compartida' })!)).toBe(false)
  })
})
