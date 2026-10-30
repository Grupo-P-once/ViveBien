import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { AREAS, armarFoto, ESTADOS, MOTORES, PERIODOS, PRIORIDADES, validarCambioDeTarea, validarPeriodo, validarPrompt, validarTarea } from '../src/lib/seo/persistencia'

/** Fase C del apartado SEO (23-oct-2026): lo que el navegador propone se valida en el servidor; las cifras las calcula el servidor. */

describe('catálogos = reglas de la migración 37', () => {
  const sql = readFileSync(path.join(__dirname, '..', 'supabase', '37-seo-historial-tareas-prompts.sql'), 'utf8')
  const lista = (re: RegExp) => [...(sql.match(re)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
  it('áreas, prioridades, estados, motores y periodos son los mismos en el código y en el SQL', () => {
    expect(lista(/area[^\n]*check \(area in \(([^)]*)\)/)).toEqual([...AREAS])
    expect(lista(/prioridad[^\n]*check \(prioridad in \(([^)]*)\)/)).toEqual([...PRIORIDADES])
    expect(lista(/estado[^\n]*check \(estado in \(([^)]*)\)/)).toEqual([...ESTADOS])
    expect(lista(/motor[^\n]*check \(motor in \(([^)]*)\)/)).toEqual([...MOTORES])
    expect((sql.match(/periodo_dias in \(([^)]*)\)/)?.[1] ?? '').split(',').map((n) => Number(n.trim()))).toEqual([...PERIODOS])
  })
})

describe('validarTarea', () => {
  it('acepta una tarea mínima con valores por defecto y recorta espacios', () => {
    expect(validarTarea({ titulo: '  Agregar h1 al catálogo  ' })).toEqual({ ok: true, valor: { titulo: 'Agregar h1 al catálogo', detalle: null, area: 'tecnico', prioridad: 'media', evidencia: null } })
  })
  it('rechaza títulos cortos o largos, áreas y prioridades fuera de catálogo y textos pasados de largo', () => {
    expect(validarTarea({ titulo: 'ab' }).ok).toBe(false)
    expect(validarTarea({ titulo: 'x'.repeat(201) }).ok).toBe(false)
    expect(validarTarea({ titulo: 'titulo valido', area: 'magia' }).ok).toBe(false)
    expect(validarTarea({ titulo: 'titulo valido', prioridad: 'urgente' }).ok).toBe(false)
    expect(validarTarea({ titulo: 'titulo valido', detalle: 'x'.repeat(1001) }).ok).toBe(false)
    expect(validarTarea({ titulo: 'titulo valido', evidencia: 'x'.repeat(501) }).ok).toBe(false)
    expect(validarTarea(null).ok).toBe(false)
  })
  it('ignora campos que no son suyos (no se puede mandar estado, creada_por ni id)', () => {
    const r = validarTarea({ titulo: 'titulo valido', estado: 'hecha', creada_por: 'otro@x.com', id: 'x' })
    expect(r.ok && Object.keys(r.valor).sort()).toEqual(['area', 'detalle', 'evidencia', 'prioridad', 'titulo'])
  })
  it('quita caracteres de control', () => {
    const r = validarTarea({ titulo: 'titulo\u0000 valido\u0007' })
    expect(r.ok && r.valor.titulo).toBe('titulo valido')
  })
})

describe('validarCambioDeTarea', () => {
  const id = '3f2a8a5e-1b2c-4d3e-8f90-a1b2c3d4e5f6'
  it('acepta un UUID y un estado del catálogo', () => expect(validarCambioDeTarea({ id, estado: 'hecha' })).toEqual({ ok: true, valor: { id, estado: 'hecha' } }))
  it('rechaza ids que no son UUID (nada de inyectar filtros) y estados inventados', () => {
    expect(validarCambioDeTarea({ id: "1' or '1'='1", estado: 'hecha' }).ok).toBe(false)
    expect(validarCambioDeTarea({ id, estado: 'borrada' }).ok).toBe(false)
  })
})

describe('validarPrompt', () => {
  const hoy = new Date('2026-10-23T12:00:00Z')
  const base = { prompt: 'mejores naves industriales en León', motor: 'chatgpt', aparece: false }
  it('acepta una observación mínima con fecha de hoy', () => {
    expect(validarPrompt(base, hoy)).toEqual({ ok: true, valor: { ...base, cita_url: null, nota: null, observado_en: '2026-10-23' } })
  })
  it('exige motor del catálogo y un «aparece» verdadero o falso (no texto)', () => {
    expect(validarPrompt({ ...base, motor: 'bing' }, hoy).ok).toBe(false)
    expect(validarPrompt({ ...base, aparece: 'si' }, hoy).ok).toBe(false)
    expect(validarPrompt({ ...base, prompt: 'hola' }, hoy).ok).toBe(false)
  })
  it('la URL citada debe ser https; ni http ni javascript:', () => {
    expect(validarPrompt({ ...base, cita_url: 'https://vivebienn.com/blog' }, hoy).ok).toBe(true)
    expect(validarPrompt({ ...base, cita_url: 'http://vivebienn.com' }, hoy).ok).toBe(false)
    expect(validarPrompt({ ...base, cita_url: 'javascript:alert(1)' }, hoy).ok).toBe(false)
    expect(validarPrompt({ ...base, cita_url: 'no es url' }, hoy).ok).toBe(false)
  })
  it('la fecha debe existir y no ser futura', () => {
    expect(validarPrompt({ ...base, observado_en: '2026-10-20' }, hoy).ok).toBe(true)
    expect(validarPrompt({ ...base, observado_en: '2026-10-24' }, hoy).ok).toBe(false)
    expect(validarPrompt({ ...base, observado_en: '2026-02-30' }, hoy).ok).toBe(false)
    expect(validarPrompt({ ...base, observado_en: 'ayer' }, hoy).ok).toBe(false)
  })
})

describe('validarPeriodo', () => {
  it('solo 7, 28 o 90', () => {
    expect(validarPeriodo('28')).toBe(28); expect(validarPeriodo(7)).toBe(7); expect(validarPeriodo(90)).toBe(90)
    expect(validarPeriodo(30)).toBeNull(); expect(validarPeriodo('x')).toBeNull(); expect(validarPeriodo(undefined)).toBeNull()
  })
})

describe('armarFoto', () => {
  const f = (clave: string, clics: number, impresiones: number, posicion: number) => ({ clave, clics, impresiones, ctr: impresiones ? (clics / impresiones) * 100 : 0, posicion })
  it('suma clics e impresiones de las fechas, calcula CTR y pondera la posición por impresiones', () => {
    const r = armarFoto([f('2026-10-18', 1, 100, 10), f('2026-10-19', 3, 100, 20)], [f('valuador', 0, 16, 9.2)], [f('/', 8, 95, 4.4)])
    expect(r.clics).toBe(4); expect(r.impresiones).toBe(200)
    expect(r.ctr).toBe(2)
    expect(r.posicion).toBe(15)
    expect(r.top_consultas).toEqual([{ clave: 'valuador', clics: 0, impresiones: 16, ctr: 0, posicion: 9.2 }])
  })
  it('sin datos devuelve ceros, no NaN', () => {
    expect(armarFoto([], [], [])).toEqual({ clics: 0, impresiones: 0, ctr: 0, posicion: 0, top_consultas: [], top_paginas: [] })
  })
  it('el top es de 10 ordenado por clics y luego impresiones', () => {
    const muchas = Array.from({ length: 15 }, (_, i) => f(`c${i}`, i, 100, 5))
    const r = armarFoto([], muchas, [])
    expect(r.top_consultas).toHaveLength(10)
    expect(r.top_consultas[0].clave).toBe('c14')
  })
})
