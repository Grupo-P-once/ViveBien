import { describe, expect, it } from 'vitest'
import { paraLaBase, validarAgenda } from '../src/lib/citas/agenda'

/**
 * D-11: cada responsable carga su disponibilidad REAL. Estas pruebas fijan qué se acepta y qué no, con el mismo criterio que las
 * restricciones de las tablas, para que el error llegue como un mensaje claro y no como una violación de la base.
 */

const AHORA = new Date('2026-11-05T18:00:00Z')
const base = () => ({
  horario: [{ dia: 1, desde: '09:00', hasta: '18:00' }, { dia: 6, desde: '10:00', hasta: '14:00' }],
  ajustes: { duracionMin: 60, margenMin: 15, anticipacionHoras: 2, ventanaDias: 30, confirmacion: 'manual' },
  bloqueos: [] as unknown[],
})
const dice = (r: ReturnType<typeof validarAgenda>) => (r.ok ? 'ok' : r.error)

describe('validarAgenda', () => {
  it('acepta una agenda normal y la devuelve ordenada', () => {
    const e = base(); e.horario = [{ dia: 6, desde: '10:00', hasta: '14:00' }, { dia: 1, desde: '14:00', hasta: '18:00' }, { dia: 1, desde: '09:00', hasta: '13:00' }]
    const r = validarAgenda(e, AHORA)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor.horario.map((b) => `${b.dia}@${b.desde}`)).toEqual(['1@09:00', '1@14:00', '6@10:00'])
  })

  it('rechaza lo que no es una agenda', () => {
    for (const mal of [null, undefined, 5, 'x', [], { }]) expect(validarAgenda(mal, AHORA).ok, JSON.stringify(mal)).toBe(false)
  })

  it('NO acepta un horario vacío: «sin filas» significaría «usa el horario por defecto», horas que la persona nunca eligió', () => {
    const e = base(); e.horario = []
    expect(dice(validarAgenda(e, AHORA))).toMatch(/Agrega al menos un horario/)
  })

  it('valida día, formato de hora y orden; no admite empalmes ni duplicados', () => {
    const con = (b: unknown) => { const e = base(); e.horario = [b as never]; return dice(validarAgenda(e, AHORA)) }
    expect(con({ dia: 7, desde: '09:00', hasta: '10:00' })).toMatch(/día/)
    expect(con({ dia: -1, desde: '09:00', hasta: '10:00' })).toMatch(/día/)
    expect(con({ dia: 1.5, desde: '09:00', hasta: '10:00' })).toMatch(/día/)
    expect(con({ dia: 1, desde: '9:00', hasta: '10:00' })).toMatch(/formato/)
    expect(con({ dia: 1, desde: '09:00', hasta: '24:00' })).toMatch(/formato/)
    expect(con({ dia: 1, desde: '09:60', hasta: '10:00' })).toMatch(/formato/)
    expect(con({ dia: 1, desde: '10:00', hasta: '10:00' })).toMatch(/posterior/)
    expect(con({ dia: 1, desde: '11:00', hasta: '10:00' })).toMatch(/posterior/)
    expect(con('lunes')).toMatch(/no es válido/)
    const empalme = base(); empalme.horario = [{ dia: 1, desde: '09:00', hasta: '13:00' }, { dia: 1, desde: '12:00', hasta: '16:00' }]
    expect(dice(validarAgenda(empalme, AHORA))).toMatch(/se empalman/)
    const igual = base(); igual.horario = [{ dia: 1, desde: '09:00', hasta: '13:00' }, { dia: 1, desde: '09:00', hasta: '10:00' }]
    expect(dice(validarAgenda(igual, AHORA))).toMatch(/empalman|misma hora/)
    // Mismo horario en días distintos: sí.
    const dias = base(); dias.horario = [{ dia: 1, desde: '09:00', hasta: '13:00' }, { dia: 2, desde: '09:00', hasta: '13:00' }]
    expect(validarAgenda(dias, AHORA).ok).toBe(true)
  })

  it('dos horarios pegados (uno termina cuando empieza el otro) no se empalman', () => {
    const e = base(); e.horario = [{ dia: 1, desde: '09:00', hasta: '13:00' }, { dia: 1, desde: '13:00', hasta: '18:00' }]
    expect(validarAgenda(e, AHORA).ok).toBe(true)
  })

  it('limita el número de horarios y de bloqueos', () => {
    const muchos = base(); muchos.horario = Array.from({ length: 29 }, (_, i) => ({ dia: i % 7, desde: `0${i % 7}:00`.slice(-5), hasta: '20:00' }))
    expect(dice(validarAgenda(muchos, AHORA))).toMatch(/Demasiados horarios/)
    const bl = base(); bl.bloqueos = Array.from({ length: 61 }, (_, i) => ({ desde: `2027-01-01T0${i % 9}:00:00Z`, hasta: '2027-01-02T00:00:00Z' }))
    expect(dice(validarAgenda(bl, AHORA))).toMatch(/Demasiados bloqueos/)
  })

  it('cada ajuste respeta los límites de la base', () => {
    const con = (cambio: Record<string, unknown>) => { const e = base(); Object.assign(e.ajustes, cambio); return dice(validarAgenda(e, AHORA)) }
    expect(con({ duracionMin: 14 })).toMatch(/duración/); expect(con({ duracionMin: 241 })).toMatch(/duración/); expect(con({ duracionMin: '60' })).toMatch(/duración/)
    expect(con({ margenMin: -1 })).toMatch(/traslado/); expect(con({ margenMin: 121 })).toMatch(/traslado/)
    expect(con({ anticipacionHoras: 169 })).toMatch(/anticipación/); expect(con({ anticipacionHoras: -1 })).toMatch(/anticipación/)
    expect(con({ ventanaDias: 0 })).toMatch(/días hacia adelante/); expect(con({ ventanaDias: 181 })).toMatch(/días hacia adelante/)
    expect(con({ confirmacion: 'siempre' })).toMatch(/cómo se confirman/)
    expect(con({ duracionMin: 15, margenMin: 0, anticipacionHoras: 0, ventanaDias: 1, confirmacion: 'automatica' })).toBe('ok')
    expect(con({ duracionMin: 240, margenMin: 120, anticipacionHoras: 168, ventanaDias: 180 })).toMatch(/Ningún horario alcanza|ok/)
  })

  it('exige que al menos un horario alcance para una visita completa', () => {
    const e = base(); e.horario = [{ dia: 1, desde: '09:00', hasta: '09:30' }]
    expect(dice(validarAgenda(e, AHORA))).toMatch(/Ningún horario alcanza/)
  })

  it('bloqueos: fechas válidas, final posterior, no más de un año, motivo corto; lo que ya terminó no se guarda', () => {
    const con = (b: unknown) => { const e = base(); e.bloqueos = [b]; return validarAgenda(e, AHORA) }
    expect(dice(con({ desde: 'ayer', hasta: '2027-01-02T00:00:00Z' }))).toMatch(/fechas/)
    expect(dice(con({ desde: '2027-01-02T00:00:00Z', hasta: '2027-01-01T00:00:00Z' }))).toMatch(/posterior/)
    expect(dice(con({ desde: '2027-01-01T00:00:00Z', hasta: '2029-01-01T00:00:00Z' }))).toMatch(/un año/)
    expect(dice(con({ desde: '2027-01-01T00:00:00Z', hasta: '2027-01-02T00:00:00Z', motivo: 'x'.repeat(201) }))).toMatch(/motivo/)
    expect(dice(con({ desde: '2027-01-01T00:00:00Z', hasta: '2027-01-02T00:00:00Z', motivo: 5 }))).toMatch(/motivo/)
    expect(dice(con(null))).toMatch(/bloqueo/)
    const pasado = con({ desde: '2026-10-01T00:00:00Z', hasta: '2026-10-05T00:00:00Z' })
    expect(pasado.ok && pasado.valor.bloqueos).toEqual([])
    const vigente = con({ desde: '2026-11-05T12:00:00Z', hasta: '2026-11-10T00:00:00Z', motivo: '  Vacaciones  ' })
    expect(vigente.ok && vigente.valor.bloqueos).toEqual([{ desde: '2026-11-05T12:00:00.000Z', hasta: '2026-11-10T00:00:00.000Z', motivo: 'Vacaciones' }])
  })

  it('un bloqueo sin `bloqueos` en el cuerpo equivale a ninguno', () => {
    const e = base() as Record<string, unknown>; delete e.bloqueos
    const r = validarAgenda(e, AHORA)
    expect(r.ok && r.valor.bloqueos).toEqual([])
  })

  it('paraLaBase usa los nombres de columna de la base', () => {
    const r = validarAgenda(base(), AHORA)
    if (!r.ok) throw new Error('debía ser válida')
    expect(paraLaBase(r.valor).ajustes).toEqual({ duracion_min: 60, margen_min: 15, anticipacion_horas: 2, ventana_dias: 30, confirmacion: 'manual' })
    expect(paraLaBase(r.valor).horario[0]).toEqual({ dia: 1, desde: '09:00', hasta: '18:00' })
  })
})
