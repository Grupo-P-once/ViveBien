import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DOCUMENTOS, fechaDeVersion, sanearAceptacionLegal, estadoLegal, VERSIONES, RUTA_DOCUMENTO } from '../src/lib/aceptacion-legal'

const leer = (...r: string[]) => readFileSync(path.join(__dirname, '..', ...r), 'utf8')

describe('versiones = lo que dicen las páginas publicadas', () => {
  it('Términos y Aviso: la versión coincide con «Última actualización» de su página', () => {
    expect(leer('src', 'app', 'terminos', 'page.tsx')).toContain(`Última actualización: ${fechaDeVersion(VERSIONES.terminos)}`)
    expect(leer('src', 'app', 'privacidad', 'page.tsx')).toContain(`Última actualización: ${fechaDeVersion(VERSIONES.privacidad)}`)
  })
  it('los enlaces apuntan a las páginas que existen', () => {
    expect(RUTA_DOCUMENTO).toEqual({ terminos: '/terminos', privacidad: '/privacidad' })
    expect(leer('src', 'app', 'terminos', 'page.tsx').length).toBeGreaterThan(100)
    expect(leer('src', 'app', 'privacidad', 'page.tsx').length).toBeGreaterThan(100)
  })
  it('fechaDeVersion escribe la fecha como la página', () => {
    expect(fechaDeVersion('2026-10-22')).toBe('22 de octubre de 2026')
    expect(fechaDeVersion('2026-09-11')).toBe('11 de septiembre de 2026')
    expect(fechaDeVersion('basura')).toBe('basura')
  })
})

describe('estadoLegal', () => {
  const ok = (documento: string, version: string) => ({ documento, version })
  it('apagado o equipo: no se pide nada', () => {
    expect(estadoLegal({ flagEncendida: false, esEquipo: false, aceptadas: [] })).toMatchObject({ requerida: false, pendientes: [] })
    expect(estadoLegal({ flagEncendida: true, esEquipo: true, aceptadas: [] })).toMatchObject({ requerida: false, pendientes: [] })
  })
  it('encendido y sin nada aceptado: faltan los dos', () => {
    const e = estadoLegal({ flagEncendida: true, esEquipo: false, aceptadas: [] })
    expect(e.requerida).toBe(true)
    expect(e.pendientes).toEqual(['terminos', 'privacidad'])
    expect(e.documentos.map((d) => d.fecha)).toEqual(['10 de noviembre de 2026', '11 de noviembre de 2026'])
  })
  it('solo cuenta la versión VIGENTE de cada documento', () => {
    expect(estadoLegal({ flagEncendida: true, esEquipo: false, aceptadas: [ok('terminos', VERSIONES.terminos)] }).pendientes).toEqual(['privacidad'])
    expect(estadoLegal({ flagEncendida: true, esEquipo: false, aceptadas: [ok('terminos', '2025-01-01'), ok('privacidad', VERSIONES.privacidad)] }).pendientes).toEqual(['terminos'])
    expect(estadoLegal({ flagEncendida: true, esEquipo: false, aceptadas: [ok('privacidad', '2026-09-11'), ok('terminos', '2026-04-06')] }).pendientes).toEqual(['terminos', 'privacidad'])
    expect(estadoLegal({ flagEncendida: true, esEquipo: false, aceptadas: DOCUMENTOS.map((d) => ok(d, VERSIONES[d])) }).pendientes).toEqual([])
  })
})

describe('sanearAceptacionLegal', () => {
  const versiones = { ...VERSIONES }
  it('exige documentos y la versión vigente', () => {
    expect(sanearAceptacionLegal({}).ok).toBe(false)
    expect(sanearAceptacionLegal(null).ok).toBe(false)
    expect(sanearAceptacionLegal({ documentos: [], versiones }).ok).toBe(false)
    expect(sanearAceptacionLegal({ documentos: ['contrato'], versiones }).ok).toBe(false)
    expect(sanearAceptacionLegal({ documentos: ['terminos'], versiones })).toEqual({ ok: true, documentos: ['terminos'] })
    expect(sanearAceptacionLegal({ documentos: ['terminos', 'privacidad', 'terminos'], versiones })).toEqual({ ok: true, documentos: ['terminos', 'privacidad'] })
  })
  it('si la versión que vio cambió, 409 version_cambio (no se acepta lo que no leyó)', () => {
    const r = sanearAceptacionLegal({ documentos: ['terminos'], versiones: { ...versiones, terminos: '2025-01-01' } })
    expect(r).toMatchObject({ ok: false, codigo: 'version_cambio' })
    expect(sanearAceptacionLegal({ documentos: ['terminos'] })).toMatchObject({ ok: false, codigo: 'version_cambio' })
  })
})

describe('guardias de código', () => {
  it('las páginas legales publicadas no muestran «undefined» ni marcas sin resolver (25-oct-2026: el correo dentro de una negrita salió como «undefined»)', () => {
    for (const pagina of ['terminos', 'privacidad']) {
      const t = leer('src', 'app', pagina, 'page.tsx')
      expect(t).not.toMatch(/undefined|\u0001|\u0002/)
      expect(t).toContain('{CORREO_CONTACTO}')
    }
  })
  it('el envío exige la aceptación legal antes de lo de comisión, con falla cerrada', () => {
    const t = leer('src', 'app', 'api', 'propiedades', '[id]', 'estado', 'route.ts')
    expect(t).toContain('requiere_aceptacion_legal')
    expect(t).toContain('legal_no_disponible')
    expect(t.indexOf('estadoDeAceptacionLegal(perfil)')).toBeLessThan(t.indexOf('estadoDeOrigen(perfil, id)'))
  })
  it('la lectura es solo con el módulo encendido y no depende de la modalidad ni de sin_comision', () => {
    const t = leer('src', 'lib', 'aceptacion-legal-servidor.ts')
    expect(t).toContain('flags.legalAcceptance')
    expect(t).not.toMatch(/sin_comision|tipo_publicador|tipoPublicador/)
  })
  it('la ruta pide sesión y está entre las privadas (no-store)', () => {
    expect(leer('src', 'app', 'api', 'legal', 'aceptacion', 'route.ts')).toContain("exigir(req, 'propiedad.gestionar_propias')")
    expect(leer('next.config.ts')).toContain('"/api/legal/:path*"')
  })
})
