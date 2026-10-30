import { describe, it, expect } from 'vitest'
import { columnaFaltante, escribirTolerante, plegar, desplegar } from '../src/lib/columnas'

/** Una tabla falsa que sólo tiene ciertas columnas, y responde como PostgREST. */
function tablaCon(columnas: string[]) {
  const escritas: Record<string, unknown>[] = []
  const escribir = async (fila: Record<string, unknown>) => {
    const sobra = Object.keys(fila).find((k) => !columnas.includes(k))
    if (sobra) {
      return { error: { message: `Could not find the '${sobra}' column of 'leads' in the schema cache` } }
    }
    escritas.push(fila)
    return { error: null }
  }
  return { escribir, escritas }
}

describe('columnaFaltante', () => {
  it('lee el mensaje de PostgREST', () => {
    expect(columnaFaltante("Could not find the 'lat' column of 'propiedades' in the schema cache")).toBe('lat')
  })
  it('lee el mensaje de Postgres', () => {
    expect(columnaFaltante('column "consentimiento_version" of relation "leads" does not exist')).toBe('consentimiento_version')
  })
  it('no inventa una columna en otros errores', () => {
    expect(columnaFaltante('duplicate key value violates unique constraint')).toBeNull()
    expect(columnaFaltante(null)).toBeNull()
  })
})

describe('escribirTolerante', () => {
  it('EL FALLO: con TRES columnas ausentes, el lead se guarda igual', async () => {
    const t = tablaCon(['nombre', 'telefono', 'mensaje'])
    const r = await escribirTolerante(t.escribir, {
      nombre: 'Ana', telefono: '+524771234567', mensaje: 'Hola',
      interes: 'Casa', origen: 'contacto', consentimiento_version: '2026-09',
    })
    expect(r.error).toBeNull()
    expect(r.omitidas).toEqual(['interes', 'origen', 'consentimiento_version'])
    expect(t.escritas).toHaveLength(1)
  })

  it('pliega lo quitado en el campo indicado en vez de tirarlo', async () => {
    const t = tablaCon(['nombre', 'mensaje'])
    await escribirTolerante(t.escribir,
      { nombre: 'Ana', mensaje: 'Hola', origen: 'contacto', consentimiento_version: '2026-09' },
      { plegarEn: 'mensaje' })
    expect(t.escritas[0].mensaje).toBe('Hola\n[origen] contacto\n[consentimiento_version] 2026-09')
  })

  it('pliega aunque el mensaje venga vacío, y no pliega valores nulos', async () => {
    const t = tablaCon(['nombre', 'mensaje'])
    await escribirTolerante(t.escribir,
      { nombre: 'Ana', mensaje: null, interes: null, origen: 'ficha' },
      { plegarEn: 'mensaje' })
    expect(t.escritas[0].mensaje).toBe('[origen] ficha')
  })

  it('las dos columnas del mapa: lat y lng', async () => {
    const t = tablaCon(['titulo'])
    const r = await escribirTolerante(t.escribir, { titulo: 'Nave', lat: 21.1, lng: -101.6 })
    expect(r).toEqual({ error: null, omitidas: ['lat', 'lng'] })
    expect(t.escritas[0]).toEqual({ titulo: 'Nave' })
  })

  it('un error que no es de columna se devuelve tal cual, sin reintentar', async () => {
    let llamadas = 0
    const r = await escribirTolerante(async () => {
      llamadas++
      return { error: { message: 'duplicate key value' } }
    }, { a: 1 })
    expect(r.error).toBe('duplicate key value')
    expect(llamadas).toBe(1)
  })

  it('no se queda en bucle si falta el propio campo donde se pliega', async () => {
    const t = tablaCon(['nombre'])
    const r = await escribirTolerante(t.escribir, { nombre: 'Ana', mensaje: 'x' }, { plegarEn: 'mensaje' })
    expect(r.error).toMatch(/mensaje/)
  })
})

describe('desplegar', () => {
  it('es lo inverso de plegar', () => {
    const t = plegar(plegar('Busco nave\ncon andén', 'interes', 'Nave'), 'origen', 'contacto')
    expect(desplegar(t)).toEqual({
      texto: 'Busco nave\ncon andén',
      campos: { interes: 'Nave', origen: 'contacto' },
    })
  })
  it('un mensaje sólo con campos plegados queda en null', () => {
    expect(desplegar('[origen] portada').texto).toBeNull()
  })
  it('un corchete escrito por el visitante a media línea no se toma por campo', () => {
    expect(desplegar('Me interesa [la casa] grande').campos).toEqual({})
  })
  it('con `solo`, una línea del visitante tipo «[urgente] …» se queda en el texto', () => {
    const t = plegar('[urgente] llámenme hoy', 'origen', 'contacto')
    expect(desplegar(t, ['origen', 'interes'])).toEqual({
      texto: '[urgente] llámenme hoy',
      campos: { origen: 'contacto' },
    })
  })
  it('si el visitante falsifica un campo, gana el del servidor, que va al final', () => {
    const t = plegar('[consentimiento_version] falso', 'consentimiento_version', '2026-09')
    expect(desplegar(t, ['consentimiento_version']).campos.consentimiento_version).toBe('2026-09')
  })
  it('un salto de línea dentro del valor no rompe el formato', () => {
    expect(desplegar(plegar('', 'interes', 'uno\ndos')).campos.interes).toBe('uno dos')
  })
})
