import { describe, it, expect } from 'vitest'
import { aCsv, celdaCsv, conteosPorTipo, filtrarRegistros, kpisRegistros, nombreArchivoCsv, type Registro } from '../src/lib/admin/registros'
import { etiquetaTipoRegistro } from '../src/lib/admin/panel-config'
import { fechaCorta } from '../src/lib/admin/formato'

const AHORA = new Date('2026-09-17T18:00:00.000Z')
const DIA = 86_400_000
const hace = (dias: number) => new Date(AHORA.getTime() - dias * DIA).toISOString()

const R = (p: Partial<Registro>): Registro => ({
  id: 'x', tipo: 'interesado', nombre: null, email: null, telefono: null, mensaje: null,
  propiedad: null, fuente: 'leads', consentimiento: null, creado: hace(1), ...p,
})

describe('indicadores de registros', () => {
  const registros = [
    R({ id: '1', tipo: 'propiedad', nombre: 'Ana López', telefono: '4778108559', propiedad: 'nave-mandujano', creado: hace(1) }),
    R({ id: '2', tipo: 'cuenta', nombre: 'Beto Ruiz', email: 'beto@correo.com', creado: hace(3) }),
    R({ id: '3', tipo: 'valuacion', nombre: 'Carla', telefono: '4771234567', creado: hace(12) }),
    R({ id: '4', tipo: 'interesado', nombre: 'Viejo', creado: hace(120) }),
  ]
  const kpis = kpisRegistros(registros, AHORA)
  const kpi = (clave: string) => kpis.find((k) => k.clave === clave)!

  it('el total se compara con cuántos había hace 30 días', () => {
    expect(kpi('total').valor).toBe(4)
    // Antes de los últimos 30 días sólo existía uno: de 1 a 4 es +300 %.
    expect(kpi('total').variacion).toEqual({ tipo: 'porcentaje', valor: 300 })
    expect(kpi('total').nota).toBe('vs. hace 30 días')
  })

  it('«nuevos esta semana» cuenta la semana y la compara con la anterior', () => {
    // Últimos 7 días: los de hace 1 y 3 días. Semana anterior (día 7 al 14): el de hace 12.
    expect(kpi('semana').valor).toBe(2)
    expect(kpi('semana').variacion).toEqual({ tipo: 'porcentaje', valor: 100 })
    expect(kpi('semana').nota).toBe('vs. semana anterior')
  })

  it('sin nada antes de esta semana, no hay semana anterior con la que comparar', () => {
    const solo = [R({ id: 'a', creado: hace(1) }), R({ id: 'b', creado: hace(2) })]
    const k = kpisRegistros(solo, AHORA).find((x) => x.clave === 'semana')!
    expect(k.variacion).toEqual({ tipo: 'sin-comparacion', motivo: 'sin-historial' })
  })

  it('con historial pero una semana anterior en cero, lo dice sin porcentaje', () => {
    const lista = [R({ id: 'a', creado: hace(1) }), R({ id: 'viejo', creado: hace(60) })]
    const k = kpisRegistros(lista, AHORA).find((x) => x.clave === 'semana')!
    expect(k.variacion).toEqual({ tipo: 'sin-comparacion', motivo: 'anterior-en-cero' })
  })

  it('cuenta los que dejaron teléfono y los que preguntaron por una propiedad', () => {
    expect(kpi('telefono').valor).toBe(2)
    expect(kpi('interes').valor).toBe(1)
  })

  it('la línea del total es acumulada y termina en el total del período', () => {
    const l = kpi('total').linea.actual
    expect(l[l.length - 1]).toBe(3)
    expect(l.every((v, i) => i === 0 || (v as number) >= (l[i - 1] as number))).toBe(true)
  })
})

describe('filtros de la tabla', () => {
  const registros = [
    R({ id: '1', tipo: 'propiedad', nombre: 'Ana López', telefono: '4778108559', creado: hace(1) }),
    R({ id: '2', tipo: 'cuenta', nombre: 'Beto Ruiz', email: 'BETO@correo.com', creado: hace(40) }),
    R({ id: '3', tipo: 'cuenta', nombre: 'Carla Méndez', creado: hace(2) }),
  ]

  it('por tipo', () => {
    expect(filtrarRegistros(registros, { tipo: 'cuenta', texto: '', dias: null }, AHORA).map((r) => r.id)).toEqual(['2', '3'])
  })

  it('por texto, sin importar acentos ni mayúsculas', () => {
    expect(filtrarRegistros(registros, { tipo: 'todos', texto: 'mendez', dias: null }, AHORA).map((r) => r.id)).toEqual(['3'])
    expect(filtrarRegistros(registros, { tipo: 'todos', texto: 'beto@CORREO.com', dias: null }, AHORA).map((r) => r.id)).toEqual(['2'])
  })

  it('por teléfono, aunque se escriba con formato', () => {
    expect(filtrarRegistros(registros, { tipo: 'todos', texto: '(477) 810-8559', dias: null }, AHORA).map((r) => r.id)).toEqual(['1'])
  })

  it('por antigüedad', () => {
    expect(filtrarRegistros(registros, { tipo: 'todos', texto: '', dias: 30 }, AHORA).map((r) => r.id)).toEqual(['1', '3'])
  })

  it('cuenta por tipo para las pestañas', () => {
    expect(conteosPorTipo(registros)).toEqual({ propiedad: 1, cuenta: 2 })
  })
})

describe('exportar a CSV', () => {
  it('una fórmula de Excel dentro de un nombre deja de ser fórmula', () => {
    // Si alguien escribe esto en un formulario del sitio, Excel lo ejecutaría.
    expect(celdaCsv('=HYPERLINK("http://malo")')).toBe('"\'=HYPERLINK(""http://malo"")"')
    expect(celdaCsv('+52 477')).toBe('"\'+52 477"')
    expect(celdaCsv('Ana López')).toBe('"Ana López"')
  })

  it('las comillas se duplican y los saltos de línea se aplanan', () => {
    expect(celdaCsv('dijo "sí"')).toBe('"dijo ""sí"""')
    expect(celdaCsv('linea1\nlinea2')).toBe('"linea1 linea2"')
  })

  it('lleva BOM, cabecera y una fila por registro', () => {
    const csv = aCsv(
      [R({ id: '1', tipo: 'visita', nombre: 'Ana', telefono: '4778108559', consentimiento: '2026-09-16', creado: '2026-09-16T18:00:00Z' })],
      etiquetaTipoRegistro,
      fechaCorta,
    )
    expect(csv.startsWith('﻿"Tipo","Nombre"')).toBe(true)
    const filas = csv.trimEnd().split('\r\n')
    expect(filas).toHaveLength(2)
    expect(filas[1]).toContain('"Quiere visitar"')
    expect(filas[1]).toContain('"aceptado 2026-09-16"')
  })

  it('quien no dio consentimiento sale como «sin registrar», no vacío', () => {
    const csv = aCsv([R({ consentimiento: null })], etiquetaTipoRegistro, fechaCorta)
    expect(csv).toContain('"sin registrar"')
  })

  it('el archivo lleva la fecha de León', () => {
    expect(nombreArchivoCsv(new Date('2026-09-18T03:00:00Z'))).toBe('registros-vivebien-2026-09-17.csv')
  })
})
