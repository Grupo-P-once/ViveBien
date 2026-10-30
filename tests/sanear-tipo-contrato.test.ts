import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sanearContenido } from '@/lib/sanear-propiedad'

/**
 * Contrato del campo `tipo` entre el EDITOR y el SERVIDOR (E-48, 16-oct-2026).
 *
 * El 400 de «Local comercial»: el editor y el sitio llaman `comercial` a ese tipo, pero el servidor sólo admitía los de `TIPOS`
 * (`local`), y nadie lo vio porque el E2E del publicador simula la API y ninguna prueba ejercitaba `tipo`. Estas pruebas llaman a la
 * función REAL de saneo (la que usan las rutas de alta y de edición) y comprueban, además, cada opción que ofrece el selector del editor.
 * No unifican `comercial`/`local` ni añaden `oficina` al formulario: eso son decisiones aparte.
 */

const MOD = [false, true] as const // publicador / moderador (admin): las dos rutas pasan por el mismo saneo
const tipoDe = (tipo: unknown, actuales: Record<string, unknown> | null = null, moderador = false) =>
  sanearContenido({ tipo }, { moderador, actuales, nube: null })

describe('tipo: lo que acepta el servidor', () => {
  for (const moderador of MOD) {
    const quien = moderador ? 'moderador' : 'publicador'

    it(`${quien}: «comercial» se acepta en un alta nueva y se guarda TAL CUAL (no se convierte a «local»)`, () => {
      const r = tipoDe('comercial', null, moderador)
      expect(r.errores).toEqual([])
      expect(r.datos.tipo).toBe('comercial')
    })

    it(`${quien}: «local» y «oficina» se aceptan en un alta nueva`, () => {
      for (const t of ['local', 'oficina']) {
        const r = tipoDe(t, null, moderador)
        expect(r.errores, t).toEqual([])
        expect(r.datos.tipo, t).toBe(t)
      }
    })

    it(`${quien}: un valor inventado se sigue rechazando, con el campo en el mensaje`, () => {
      for (const t of ['cualquier cosa', 'Comercial', 'COMERCIAL', 'local ', '<script>', 5, {}]) {
        const r = tipoDe(t, null, moderador)
        expect(r.errores.length, String(t)).toBeGreaterThan(0)
        expect(r.errores.join(' ')).toMatch(/Tipo de inmueble/)
        expect(r.datos.tipo).toBeUndefined()
      }
    })
  }

  it('un anuncio que era «casa» puede pasar a «comercial»; y el vacío lo deja en null', () => {
    expect(tipoDe('comercial', { tipo: 'casa' }).errores).toEqual([])
    expect(tipoDe('', { tipo: 'casa' }).datos.tipo).toBeNull()
  })
})

describe('tipo: filas antiguas', () => {
  it('una fila guardada como «comercial» se puede volver a guardar igual y cambiar a «local»', () => {
    expect(tipoDe('comercial', { tipo: 'comercial' })).toMatchObject({ errores: [], datos: { tipo: 'comercial' } })
    expect(tipoDe('local', { tipo: 'comercial' })).toMatchObject({ errores: [], datos: { tipo: 'local' } })
  })

  it('un valor viejo fuera de las listas sigue valiendo SI no se toca (datos viejos), pero no se acepta como valor nuevo', () => {
    expect(tipoDe('depto', { tipo: 'depto' }).errores).toEqual([])
    expect(tipoDe('depto', { tipo: 'casa' }).errores.length).toBeGreaterThan(0)
  })
})

describe('contrato con el selector del editor', () => {
  const fuente = readFileSync(join(process.cwd(), 'src/app/publicador/propiedades/[id]/editar/page.tsx'), 'utf8')
  const bloque = /const TIPOS\s*=\s*\[([\s\S]*?)\n\]/.exec(fuente)?.[1] ?? ''
  const opciones = [...bloque.matchAll(/\bv:\s*'([^']+)'/g)].map((m) => m[1])

  it('se pudo leer el selector del editor (si cambia de forma, esta prueba lo avisa en vez de pasar en vacío)', () => {
    expect(opciones.length).toBeGreaterThanOrEqual(5)
    expect(opciones).toContain('comercial')
  })

  it('el servidor acepta CADA opción que el editor ofrece, en alta nueva, para publicador y moderador', () => {
    for (const moderador of MOD) {
      for (const v of opciones) {
        const r = tipoDe(v, null, moderador)
        expect(r.errores, `${v} (${moderador ? 'moderador' : 'publicador'})`).toEqual([])
        expect(r.datos.tipo).toBe(v)
      }
    }
  })
})
