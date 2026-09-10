import { describe, it, expect } from 'vitest'
import {
  calcularCompletitudPerfil,
  faltantesPerfil,
  puedePublicar,
  PERFIL_MINIMO,
} from '../src/lib/perfil'

const PUBLICADOR_COMPLETO = {
  nombre: 'Ana Ruiz',
  telefono: '4771234567',
  whatsapp: '4771234567',
  zonas: ['Campestre'],
  foto_url: 'https://res.cloudinary.com/x/y.jpg',
  biografia: 'Ocho años en el poniente de León.',
}

describe('completitud del perfil', () => {
  it('un perfil vacio vale 0', () => {
    expect(calcularCompletitudPerfil({}, 'publicador')).toBe(0)
    expect(calcularCompletitudPerfil({}, 'cliente')).toBe(0)
  })

  it('un publicador completo llega a 100', () => {
    expect(calcularCompletitudPerfil(PUBLICADOR_COMPLETO, 'publicador')).toBe(100)
  })

  it('no pasa de 100 aunque sobren campos', () => {
    const p = { ...PUBLICADOR_COMPLETO, inmobiliaria: 'X', busca_zona: 'Y' }
    expect(calcularCompletitudPerfil(p, 'publicador')).toBe(100)
  })

  it('los tres imprescindibles del publicador ya superan el minimo', () => {
    const p = { nombre: 'Ana', telefono: '477', whatsapp: '477' }
    expect(calcularCompletitudPerfil(p, 'publicador')).toBeGreaterThanOrEqual(PERFIL_MINIMO)
  })

  it('pide cosas distintas segun el rol', () => {
    const soloNombre = { nombre: 'Ana' }
    // Un cliente no tiene que dar WhatsApp ni zonas: no publica nada.
    expect(calcularCompletitudPerfil(soloNombre, 'cliente'))
      .toBeGreaterThan(calcularCompletitudPerfil(soloNombre, 'publicador'))
  })

  it('una cadena de espacios no cuenta como valor', () => {
    expect(calcularCompletitudPerfil({ nombre: '   ' }, 'cliente')).toBe(0)
  })

  it('un array vacio no cuenta como valor', () => {
    const p = { ...PUBLICADOR_COMPLETO, zonas: [] }
    expect(calcularCompletitudPerfil(p, 'publicador')).toBeLessThan(100)
  })

  it('un presupuesto de 0 no cuenta', () => {
    expect(calcularCompletitudPerfil({ presupuesto_max: 0 }, 'cliente')).toBe(0)
  })
})

describe('faltantes', () => {
  it('nombra lo que falta en el idioma del usuario', () => {
    const falta = faltantesPerfil({ nombre: 'Ana' }, 'publicador')
    expect(falta).toContain('Teléfono')
    expect(falta).toContain('WhatsApp')
    expect(falta).not.toContain('Tu nombre')
  })

  it('un perfil completo no tiene faltantes', () => {
    expect(faltantesPerfil(PUBLICADOR_COMPLETO, 'publicador')).toEqual([])
  })
})

describe('candado de publicacion', () => {
  it('sin contacto no se publica', () => {
    const r = puedePublicar({ nombre: 'Ana' }, 'publicador')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/WhatsApp/)
  })

  it('con los imprescindibles se publica aunque el porcentaje no sea 100', () => {
    const p = { nombre: 'Ana', telefono: '4771234567', whatsapp: '4771234567' }
    expect(calcularCompletitudPerfil(p, 'publicador')).toBeLessThan(100)
    expect(puedePublicar(p, 'publicador').ok).toBe(true)
  })

  it('las zonas suman al porcentaje pero no bloquean', () => {
    const { zonas: _fuera, ...sinZonas } = PUBLICADOR_COMPLETO
    expect(puedePublicar(sinZonas, 'publicador').ok).toBe(true)
  })

  it('un admin nunca queda bloqueado por su perfil', () => {
    expect(puedePublicar({}, 'admin').ok).toBe(true)
  })

  it('el motivo explica la consecuencia, no solo el campo', () => {
    const r = puedePublicar({}, 'publicador')
    if (!r.ok) expect(r.motivo).toMatch(/a quién escribir/)
  })
})
