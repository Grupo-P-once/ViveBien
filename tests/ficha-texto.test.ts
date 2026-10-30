import { describe, it, expect } from 'vitest'
import { leerFicha, primerHueco } from '../src/lib/ficha-texto'

const FICHA_NAVE = `
FICHA TÉCNICA — NAVE INDUSTRIAL
Ubicación: Blvd. San Juan Bosco 1200, Parque Industrial, León, Gto.
Operación: Renta
Superficie: 1,450 m2
Altura libre: 9.5 m
Andenes: 4
Precio: $118,180 MXN mensuales
Incluye oficinas y patio de maniobras.
`

const FICHA_CASA = `
Casa en venta
Dirección: Tzula Los Castillos 45, León
Recámaras: 4
Baños completos: 3.5
Superficie 450 m²
Precio 5 millones
`

describe('leerFicha', () => {
  it('lee una ficha de nave completa', () => {
    const { campos, reconocido } = leerFicha(FICHA_NAVE)
    expect(campos).toMatchObject({
      tipo: 'nave',
      operacion: 'renta',
      metros: 1450,
      altura_libre: 9.5,
      andenes: 4,
      precio: 118180,
    })
    expect(String(campos.ubicacion)).toContain('San Juan Bosco')
    expect(reconocido).toContain('superficie')
  })

  it('lee una ficha de casa', () => {
    const { campos } = leerFicha(FICHA_CASA)
    expect(campos).toMatchObject({
      tipo: 'casa',
      operacion: 'venta',
      recamaras: 4,
      banos: 3.5,
      metros: 450,
      precio: 5000000,
    })
  })

  it('el texto completo queda de descripción: nada se descarta en silencio', () => {
    const { campos } = leerFicha(FICHA_CASA)
    expect(String(campos.descripcion)).toContain('Tzula Los Castillos')
  })

  it('una ficha vacía no inventa nada', () => {
    expect(leerFicha('')).toEqual({ campos: {}, reconocido: [] })
    expect(leerFicha('   ').campos).toEqual({})
  })

  it('no confunde la altura de un edificio de 120 m con la altura libre', () => {
    expect(leerFicha('Edificio de altura 120').campos.altura_libre).toBeUndefined()
  })

  it('acepta la etiqueta antes o después del número', () => {
    expect(leerFicha('3 recámaras y 2 baños').campos).toMatchObject({ recamaras: 3, banos: 2 })
    expect(leerFicha('Recámaras: 3 Baños: 2').campos).toMatchObject({ recamaras: 3, banos: 2 })
  })
})

describe('primerHueco', () => {
  it('salta directo a las fotos si la ficha traía todo', () => {
    const { campos } = leerFicha(FICHA_NAVE)
    expect(primerHueco({ ...campos, titulo: 'Nave con andenes' })).toBe('fotos')
  })
  it('pregunta lo primero que falte, en el orden del asistente', () => {
    expect(primerHueco({})).toBe('operacion')
    expect(primerHueco({ operacion: 'venta' })).toBe('tipo')
    expect(primerHueco({ operacion: 'venta', tipo: 'casa', ubicacion: 'x', metros: 10 })).toBe('precio')
  })
})
