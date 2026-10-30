import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import CaracteristicasFicha from '@/components/CaracteristicasFicha'
import CamposCaracteristicas from '@/components/publicador/CamposCaracteristicas'
import {
  DEFINICIONES, amenidadesEstructuradas, amenidadesParaFicha, definicionesDeAmenidad, gruposVisibles, validarCaracteristicas,
} from '../src/lib/caracteristicas'

/**
 * R8.4 · AMENIDADES y CARACTERÍSTICAS son conceptos distintos. Amenidades = instalaciones o servicios del inmueble o del desarrollo
 * (alberca, gimnasio, casa club, elevador, vigilancia, áreas comunes). Características = atributos propios del inmueble y de su tipo
 * (plantas, recámaras, superficies, estado). «Admite mascotas» es una CONDICIÓN de renta, no una amenidad.
 * Lo guardado NO cambia: ninguna clave se elimina ni se renombra (compatibilidad con las propiedades existentes).
 */
const leer = (r: string) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const car = (c: Record<string, unknown>) => ({ caracteristicas: { v: 1, ...c } })

// Las claves que ya existen en la base: si una desaparece o se renombra, una propiedad publicada perdería ese dato.
const CLAVES_PERSISTIDAS = ['m_terreno', 'm_utiles', 'niveles', 'piso', 'elevador', 'estacionamientos', 'privados', 'salas_juntas', 'recepcion', 'frente', 'fondo', 'forma', 'topografia', 'acceso', 'exteriores', 'interiores', 'giro', 'esquina', 'estacionamientos_cubiertos', 'puestos', 'sala_espera', 'vitrina', 'mezanine', 'unidades', 'm_oficinas', 'patio_maniobras_m2', 'rampas', 'resistencia_piso', 'bardeado', 'parque_industrial', 'desarrollo', 'amenidades_comunes', 'equipamiento', 'kva', 'antiguedad_anos', 'estado_general', 'servicios', 'seguridad', 'accesibilidad', 'mascotas', 'amueblado', 'deposito_meses', 'plazo_minimo_meses', 'disponible_desde', 'servicios_incluidos']

describe('compatibilidad: nada de lo guardado se pierde', () => {
  it('todas las claves persistidas siguen definidas, con su mismo nombre', () => {
    const hoy = new Set(DEFINICIONES.map((d) => d.clave))
    for (const k of CLAVES_PERSISTIDAS) expect(hoy.has(k), k).toBe(true)
  })
  it('un anuncio con amenidades estructuradas guardadas sigue validando tal cual (mismas claves y valores)', () => {
    const r = validarCaracteristicas({ elevador: true, seguridad: ['vigilancia_24h', 'caseta'], amenidades_comunes: ['alberca_comun', 'gimnasio'] }, 'departamento', 'venta')
    expect(r.errores).toEqual([])
    expect(r.valor).toMatchObject({ elevador: true, seguridad: ['vigilancia_24h', 'caseta'], amenidades_comunes: ['alberca_comun', 'gimnasio'] })
  })
  it('las opciones de «mascotas» conservan sus valores guardados (solo cambia el texto)', () => {
    const m = DEFINICIONES.find((d) => d.clave === 'mascotas')
    expect(m?.forma === 'enum' && m.opciones.map(([v]) => v)).toEqual(['permitidas', 'con_restricciones', 'no_permitidas', 'consultar'])
  })
})

describe('cada concepto en su lugar', () => {
  it('amenidades estructuradas = elevador, seguridad y amenidades comunes; todo lo demás es característica', () => {
    expect(DEFINICIONES.filter((d) => d.concepto === 'amenidad').map((d) => d.clave).sort()).toEqual(['amenidades_comunes', 'elevador', 'seguridad'])
  })
  it('«Admite mascotas» es una condición de renta (grupo «renta»), no una amenidad', () => {
    const m = DEFINICIONES.find((d) => d.clave === 'mascotas')!
    expect(m.etiqueta).toBe('Admite mascotas')
    expect(m.concepto).toBeUndefined()
    expect(m.grupo).toBe('renta')
  })
  it('la ficha NO enseña amenidades bajo «Características» ni al revés', () => {
    const p = { tipo: 'departamento', operacion: 'venta', extras: car({ niveles: 2, elevador: true, seguridad: ['caseta'], amenidades_comunes: ['gimnasio'], estacionamientos: 1, antiguedad_anos: 5 }) }
    const claves = gruposVisibles(p).flatMap((g) => [...g.items.map((i) => i.clave), ...g.listas.map((l) => l.clave)])
    for (const a of ['elevador', 'seguridad', 'amenidades_comunes']) expect(claves).not.toContain(a)
    expect(claves).toContain('estacionamientos')
    expect(claves).toContain('antiguedad_anos')
    expect(amenidadesEstructuradas(p).sort()).toEqual(['Caseta de acceso', 'Elevador', 'Gimnasio'].sort())
  })
  it('la ficha de Características no contiene el texto de las amenidades', () => {
    const html = renderToStaticMarkup(createElement(CaracteristicasFicha, { propiedad: { tipo: 'departamento', operacion: 'venta', extras: car({ elevador: true, seguridad: ['caseta'], estacionamientos: 2 }) } }))
    expect(html).toContain('Características')
    expect(html).toContain('Estacionamientos')
    expect(html).not.toMatch(/Hay elevador|Elevador|Caseta|Seguridad/)
  })
  it('«Admite mascotas» sale en la ficha como condición de renta y no en una venta', () => {
    const renta = renderToStaticMarkup(createElement(CaracteristicasFicha, { propiedad: { tipo: 'casa', operacion: 'renta', extras: car({ mascotas: 'permitidas' }) } }))
    expect(renta).toContain('Condiciones de renta')
    expect(renta).toContain('Admite mascotas')
    expect(renta).toContain('Sí, se permiten')
    const venta = renderToStaticMarkup(createElement(CaracteristicasFicha, { propiedad: { tipo: 'casa', operacion: 'venta', extras: car({ mascotas: 'permitidas' }) } }))
    expect(venta).not.toContain('mascotas')
  })
})

describe('lista de amenidades de la ficha: dos datos que se leen por separado y solo se juntan para mostrar', () => {
  it('une etiquetas libres y estructuradas sin repetir (sin importar mayúsculas ni acentos)', () => {
    const p = { tipo: 'departamento', operacion: 'venta', extras: car({ elevador: true, amenidades_comunes: ['gimnasio', 'alberca_comun'] }) }
    expect(amenidadesParaFicha(p, ['Alberca', 'elevador', 'Casa club'])).toEqual(['Alberca', 'elevador', 'Casa club', 'Gimnasio'])
  })
  it('sin ninguna amenidad no hay lista; las etiquetas libres solas siguen funcionando', () => {
    expect(amenidadesParaFicha({ tipo: 'casa', operacion: 'venta', extras: {} }, [])).toEqual([])
    expect(amenidadesParaFicha({ tipo: 'casa', operacion: 'venta', extras: null }, ['Jardín'])).toEqual(['Jardín'])
  })
  it('una amenidad estructurada que no aplica al tipo no se enseña (un terreno no tiene elevador)', () => {
    expect(amenidadesEstructuradas({ tipo: 'terreno', operacion: 'venta', extras: car({ elevador: true }) })).toEqual([])
    expect(definicionesDeAmenidad('terreno', 'venta').map((d) => d.clave)).toEqual(['seguridad'])
  })
})

describe('el editor: cada concepto en su sección', () => {
  const props = { tipo: 'departamento', operacion: 'venta', extras: {}, grupos: ['espacios', 'condiciones', 'servicios', 'seguridad', 'accesibilidad'] as never, onChange: () => {} }
  it('«Características» no ofrece las amenidades (elevador, seguridad, amenidades comunes)', () => {
    const html = renderToStaticMarkup(createElement(CamposCaracteristicas, props))
    expect(html).not.toMatch(/Hay elevador|Amenidades comunes|Seguridad y vigilancia/)

    expect(html).toContain('Estacionamientos')
  })
  it('«Amenidades» ofrece las amenidades estructuradas bajo su propio título', () => {
    const html = renderToStaticMarkup(createElement(CamposCaracteristicas, { ...props, concepto: 'amenidad', grupos: ['espacios', 'seguridad'] as never }))
    expect(html).toContain('Amenidades del inmueble o del conjunto')
    expect(html).toMatch(/Hay elevador/)
    expect(html).toMatch(/Amenidades comunes/)
    expect(html).toMatch(/Seguridad y vigilancia/)
    expect(html).not.toContain('Estacionamientos')
  })
  it('el asistente monta las amenidades estructuradas junto a las etiquetas, y la ficha pública usa la lista unida', () => {
    const editor = leer('src/app/publicador/propiedades/[id]/editar/page.tsx')
    expect(editor).toContain('concepto="amenidad"')
    expect(editor.indexOf('concepto="amenidad"')).toBeLessThan(editor.indexOf('<Campo etiqueta="Amenidades"'))
    const ficha = leer('src/app/propiedades/[id]/page-client.tsx')
    expect(ficha).toContain('amenidadesParaFicha(prop, prop.amenidades)')
    expect(ficha).not.toMatch(/Amenidades y Caracter/)
  })
  it('el vocabulario público es el mismo en la ficha, el filtro y la comparación: «Admite mascotas»', () => {
    for (const r of ['src/app/propiedades/page-client.tsx', 'src/app/comparar/page-client.tsx', 'src/lib/caracteristicas.ts']) expect(leer(r), r).toContain('Admite mascotas')
    for (const r of ['src/app/propiedades/page-client.tsx', 'src/lib/caracteristicas.ts']) expect(leer(r), r).not.toContain('Acepta mascotas')
  })
})
