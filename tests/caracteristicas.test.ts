import { describe, expect, it } from 'vitest'
import { sanearContenido } from '@/lib/sanear-propiedad'
import {
  CLAVE_EXTRAS, DEFINICIONES, VERSION_CARACTERISTICAS, definicionesPara, etiquetaSuperficie, etiquetasTarjeta, gruposVisibles,
  leerCaracteristicas, podarCaracteristicas, textoBanos, tipoBase, validarCaracteristicas,
} from '@/lib/caracteristicas'
import { TIPOS } from '@/lib/esquemas/propiedad'

/**
 * Características por tipo y operación (oficinas y demás): validación REAL del módulo y del saneo que usan las rutas de alta y edición.
 * Aquí no hay dobles: se llama a `sanearContenido` y a `validarCaracteristicas` tal como los usa el servidor.
 */

const sanear = (entrada: Record<string, unknown>, actuales: Record<string, unknown> | null = null, moderador = false) =>
  sanearContenido(entrada, { moderador, actuales, nube: null })
const car = (c: Record<string, unknown>) => ({ [CLAVE_EXTRAS]: { v: VERSION_CARACTERISTICAS, ...c } })

describe('catálogo de características', () => {
  it('toda clave es única y toda definición aplica al menos a un tipo del esquema (o al vocabulario del editor)', () => {
    const claves = DEFINICIONES.map((d) => d.clave)
    expect(new Set(claves).size).toBe(claves.length)
    for (const d of DEFINICIONES) for (const t of d.tipos) expect((TIPOS as readonly string[]).includes(t)).toBe(true)
  })
  it('«comercial» y «depto» (vocabulario del editor y del sitio) aplican igual que «local» y «departamento»', () => {
    expect(tipoBase('comercial')).toBe('local')
    expect(tipoBase('depto')).toBe('departamento')
    expect(definicionesPara('comercial', 'venta').map((d) => d.clave)).toEqual(definicionesPara('local', 'venta').map((d) => d.clave))
  })
  it('lo de renta sólo aplica en renta', () => {
    expect(definicionesPara('casa', 'venta').some((d) => d.clave === 'mascotas')).toBe(false)
    expect(definicionesPara('casa', 'renta').some((d) => d.clave === 'mascotas')).toBe(true)
    expect(definicionesPara('casa', 'temporada').some((d) => d.clave === 'deposito_meses')).toBe(false)
  })
  it('oficina tiene privados, salas de juntas y recepción; casa no', () => {
    const of = definicionesPara('oficina', 'venta').map((d) => d.clave)
    expect(of).toEqual(expect.arrayContaining(['privados', 'salas_juntas', 'recepcion', 'm_utiles', 'piso', 'elevador', 'estacionamientos']))
    expect(definicionesPara('casa', 'venta').some((d) => d.clave === 'privados')).toBe(false)
  })
})

describe('validarCaracteristicas', () => {
  it('acepta valores válidos y los normaliza (números como número, listas sin repetidos)', () => {
    const r = validarCaracteristicas({ estacionamientos: '2', servicios: ['agua', 'agua', 'luz'], elevador: true }, 'oficina', 'venta')
    expect(r.errores).toEqual([])
    expect(r.valor).toEqual({ v: 1, estacionamientos: 2, servicios: ['agua', 'luz'], elevador: true })
  })
  it('vacío no se guarda (ni null, ni "", ni [])', () => {
    const r = validarCaracteristicas({ estacionamientos: '', servicios: [], piso: null }, 'oficina', 'venta')
    expect(r).toEqual({ valor: null, errores: [] })
  })
  const rechazos: [string, Record<string, unknown>, string, string][] = [
    ['clave inventada', { inventada: 1 }, 'casa', 'venta'],
    ['clave heredada del prototipo de Object', { __proto__: 1, constructor: 1 }, 'casa', 'venta'],
    ['entero con decimales', { estacionamientos: 1.5 }, 'casa', 'venta'],
    ['negativo', { estacionamientos: -1 }, 'casa', 'venta'],
    ['fuera de rango', { niveles: 99 }, 'casa', 'venta'],
    ['texto donde va número', { estacionamientos: 'dos' }, 'casa', 'venta'],
    ['booleano como texto', { elevador: 'true' }, 'departamento', 'venta'],
    ['enum desconocido', { estado_general: 'perfecto' }, 'casa', 'venta'],
    ['lista con opción desconocida', { servicios: ['agua', 'piscina'] }, 'casa', 'venta'],
    ['lista que no es lista', { servicios: 'agua' }, 'casa', 'venta'],
    ['opción que no aplica a este tipo (alberca en departamento)', { exteriores: ['alberca'] }, 'departamento', 'venta'],
    ['no aplica al tipo (privados en casa)', { privados: 3 }, 'casa', 'venta'],
    ['no aplica a la operación (mascotas en venta)', { mascotas: 'permitidas' }, 'casa', 'venta'],
    ['no aplica al tipo (mascotas en oficina rentada)', { mascotas: 'permitidas' }, 'oficina', 'renta'],
    ['fecha imposible', { disponible_desde: '2026-02-31' }, 'casa', 'renta'],
    ['fecha con formato libre', { disponible_desde: '1 de marzo' }, 'casa', 'renta'],
    ['texto demasiado largo', { giro: 'x'.repeat(81) }, 'local', 'venta'],
    ['versión desconocida', { v: 2 }, 'casa', 'venta'],
    ['objeto donde va un valor', { niveles: { a: 1 } }, 'casa', 'venta'],
  ]
  for (const [nombre, entrada, tipo, op] of rechazos) {
    it(`rechaza: ${nombre}`, () => {
      const r = validarCaracteristicas(entrada, tipo, op)
      expect(r.errores.length).toBeGreaterThan(0)
      expect(r.valor).toBeNull()
    })
  }
  it('rechaza un objeto que no lo es', () => {
    expect(validarCaracteristicas('hola', 'casa', 'venta').errores.length).toBeGreaterThan(0)
    expect(validarCaracteristicas([1], 'casa', 'venta').errores.length).toBeGreaterThan(0)
  })
})

describe('sanearContenido · características', () => {
  it('guarda sólo el espacio «caracteristicas» dentro de extras y conserva claves históricas', () => {
    const r = sanear(
      { extras: { viejo: { a: 1 }, ...car({ estacionamientos: 2 }) } },
      { tipo: 'casa', operacion: 'venta', extras: { viejo: { a: 1 } } },
    )
    expect(r.errores).toEqual([])
    expect(r.datos.extras).toEqual({ viejo: { a: 1 }, caracteristicas: { v: 1, estacionamientos: 2 } })
  })
  it('una clave NUEVA en extras no se acepta del cliente', () => {
    const r = sanear({ extras: { secreto: 'x', ...car({}) } }, { tipo: 'casa', operacion: 'venta', extras: {} })
    expect(r.errores.join(' ')).toMatch(/secreto/)
    expect(r.datos.extras).toBeUndefined()
  })
  it('una clave histórica que el cliente CAMBIA tampoco', () => {
    const r = sanear({ extras: { viejo: 2 } }, { tipo: 'casa', operacion: 'venta', extras: { viejo: 1 } })
    expect(r.errores.join(' ')).toMatch(/viejo/)
  })
  it('si el cliente omite las claves históricas, no se pierden', () => {
    const r = sanear({ extras: car({ niveles: 2 }) }, { tipo: 'casa', operacion: 'venta', extras: { viejo: { a: 1 } } })
    expect(r.errores).toEqual([])
    expect(r.datos.extras).toEqual({ viejo: { a: 1 }, caracteristicas: { v: 1, niveles: 2 } })
  })
  it('extras vacío borra sólo las características, no la historia', () => {
    const r = sanear({ extras: null }, { tipo: 'casa', operacion: 'venta', extras: { viejo: 1, ...car({ niveles: 2 }) } })
    expect(r.datos.extras).toEqual({ viejo: 1 })
  })
  it('usa el tipo/operación de ESTA petición cuando vienen juntos', () => {
    // oficina + renta + mascotas: mascotas no aplica a oficina → error; con casa sí
    expect(sanear({ tipo: 'oficina', operacion: 'renta', extras: car({ mascotas: 'permitidas' }) }).errores.length).toBeGreaterThan(0)
    expect(sanear({ tipo: 'casa', operacion: 'renta', extras: car({ mascotas: 'permitidas' }) }).errores).toEqual([])
  })
  it('usa el tipo/operación ya guardados cuando la petición sólo trae extras', () => {
    expect(sanear({ extras: car({ privados: 4 }) }, { tipo: 'oficina', operacion: 'renta', extras: {} }).errores).toEqual([])
    expect(sanear({ extras: car({ privados: 4 }) }, { tipo: 'casa', operacion: 'renta', extras: {} }).errores.length).toBeGreaterThan(0)
  })
  it('«comercial» (editor) acepta lo de local', () => {
    expect(sanear({ tipo: 'comercial', extras: car({ giro: 'Cafetería', frente: 6 }) }).errores).toEqual([])
  })
  it('al pasar de renta a venta sin tocar extras, lo de renta se quita y lo demás queda', () => {
    const actuales = { tipo: 'casa', operacion: 'renta', extras: { viejo: 1, ...car({ mascotas: 'permitidas', deposito_meses: 1, estacionamientos: 2 }) } }
    const r = sanear({ operacion: 'venta' }, actuales)
    expect(r.errores).toEqual([])
    expect(r.datos.extras).toEqual({ viejo: 1, caracteristicas: { v: 1, estacionamientos: 2 } })
  })
  it('al cambiar de tipo, lo que ya no aplica se quita (privados de oficina al volverse casa)', () => {
    const r = sanear({ tipo: 'casa' }, { tipo: 'oficina', operacion: 'venta', extras: car({ privados: 3, estacionamientos: 1 }) })
    expect(r.datos.extras).toEqual({ caracteristicas: { v: 1, estacionamientos: 1 } })
  })
  it('si nada cambia no toca extras', () => {
    const r = sanear({ operacion: 'venta' }, { tipo: 'casa', operacion: 'renta', extras: { viejo: 1 } })
    expect(r.datos.extras).toBeUndefined()
  })
  it('extras demasiado grande se rechaza', () => {
    const grande = { viejo: 'x'.repeat(21_000) }
    const r = sanear({ extras: grande }, { tipo: 'casa', operacion: 'venta', extras: grande })
    expect(r.errores.join(' ')).toMatch(/grande/)
  })
  it('subtipos: oficina admite consultorio y corporativa; uno inventado se rechaza', () => {
    expect(sanear({ tipo: 'oficina', subtipo: 'consultorio' }).errores).toEqual([])
    expect(sanear({ tipo: 'oficina', subtipo: 'corporativa' }).errores).toEqual([])
    expect(sanear({ tipo: 'oficina', subtipo: 'palacio' }).errores.length).toBeGreaterThan(0)
    // un subtipo histórico ya guardado no bloquea
    expect(sanear({ subtipo: 'raro' }, { tipo: 'oficina', subtipo: 'raro' }).errores).toEqual([])
  })
  it('lo mismo para publicador y moderador', () => {
    for (const m of [false, true]) expect(sanear({ tipo: 'casa', extras: { x: 1 } }, null, m).errores.length).toBeGreaterThan(0)
  })
})

describe('lectura y presentación', () => {
  it('leerCaracteristicas ignora basura sin reventar', () => {
    expect(leerCaracteristicas(null)).toEqual({})
    expect(leerCaracteristicas('x')).toEqual({})
    expect(leerCaracteristicas({ caracteristicas: { inventada: 1, niveles: 2, servicios: [1] } })).toEqual({ niveles: 2 })
  })
  it('gruposVisibles no enseña vacíos ni lo que no aplica al tipo/operación actuales', () => {
    const p = { tipo: 'casa', operacion: 'venta', extras: car({ estacionamientos: 2, mascotas: 'permitidas', servicios: ['agua'] }) }
    const g = gruposVisibles(p)
    const planos = g.flatMap((x) => [...x.items.map((i) => i.clave), ...x.listas.map((l) => l.clave)])
    expect(planos).toEqual(expect.arrayContaining(['estacionamientos', 'servicios']))
    expect(planos).not.toContain('mascotas')   // era de renta y el anuncio ya es de venta
    expect(gruposVisibles({ tipo: 'casa', operacion: 'venta', extras: {} })).toEqual([])
  })
  it('textos: antigüedad 0 = a estrenar, piso 0 = planta baja, depósito en meses', () => {
    const g = gruposVisibles({ tipo: 'departamento', operacion: 'renta', extras: car({ antiguedad_anos: 0, piso: 0, deposito_meses: 2 }) })
    const t = Object.fromEntries(g.flatMap((x) => x.items).map((i) => [i.clave, i.valor]))
    expect(t).toMatchObject({ antiguedad_anos: 'A estrenar', piso: 'Planta baja', deposito_meses: '2 meses' })
  })
  it('baños: enteros y medios baños con una sola representación', () => {
    expect(textoBanos(1)).toBe('1 baño')
    expect(textoBanos(2)).toBe('2 baños')
    expect(textoBanos(2.5)).toBe('2 baños y medio')
    expect(textoBanos(0.5)).toBe('Medio baño')
    expect(textoBanos(0)).toBeNull()
    expect(textoBanos(null)).toBeNull()
  })
  it('podarCaracteristicas conserva lo aplicable y filtra opciones de listas', () => {
    expect(podarCaracteristicas({ v: 1, exteriores: ['jardin', 'balcon'] }, 'casa', 'venta')).toEqual({ v: 1, exteriores: ['jardin'] })
    expect(podarCaracteristicas({ v: 1, privados: 2 }, 'casa', 'venta')).toEqual({})
  })
  it('etiquetas de tarjeta: pocas y sólo las que tienen sentido', () => {
    const e = etiquetasTarjeta({ tipo: 'departamento', operacion: 'renta', extras: car({ estacionamientos: 1, amueblado: 'si', mascotas: 'permitidas', antiguedad_anos: 0 }) })
    expect(e.length).toBeLessThanOrEqual(3)
    expect(e).toContain('1 estacionamiento')
    expect(etiquetasTarjeta({ tipo: 'casa', operacion: 'venta', extras: car({ amueblado: 'si' }) })).toEqual([])
  })
  it('la etiqueta de «metros» depende del tipo (el dato histórico no cambia)', () => {
    expect(etiquetaSuperficie('terreno')).toBe('Superficie del terreno')
    expect(etiquetaSuperficie('oficina')).toBe('Superficie construida')
    expect(etiquetaSuperficie('comercial')).toBe('Superficie construida')
  })
})
