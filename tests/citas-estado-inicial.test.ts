import { describe, expect, it } from 'vitest'
import { estadoInicialDeCita } from '../src/lib/citas/estados'

/**
 * D-8 (decidida por el dueño el 5-nov-2026): si el responsable se agenda a sí mismo en un horario disponible, sin requerir la autorización
 * de otra persona, la cita se confirma automáticamente; de lo contrario queda pendiente. Regresión de la regla (antes sin prueba directa).
 */
const base = { creador: 'cliente' as const, paraOtro: false, clienteUid: 'u-cli', asesorUid: 'u-ase', confirmacion: 'manual' as const }

describe('D-8 · estado con el que nace una cita', () => {
  it('el responsable que se agenda a sí mismo: CONFIRMADA, sin autorización de nadie', () => {
    expect(estadoInicialDeCita({ ...base, clienteUid: 'u-ase', asesorUid: 'u-ase' })).toBe('CONFIRMED')
  })
  it('un miembro del equipo / asociado / publicador que visita una propiedad que atiende OTRA persona: PENDIENTE', () => {
    expect(estadoInicialDeCita({ ...base, clienteUid: 'u-pub', asesorUid: 'u-ase' })).toBe('REQUESTED')
  })
  it('un cliente corriente: PENDIENTE (solo la confirmación válida aparta el horario)', () => {
    expect(estadoInicialDeCita(base)).toBe('REQUESTED')
  })
  it('un cliente cuando el responsable eligió confirmación automática: CONFIRMADA', () => {
    expect(estadoInicialDeCita({ ...base, confirmacion: 'automatica' })).toBe('CONFIRMED')
  })
  it('lo que el equipo registra PARA otra persona: por confirmar por ella, nunca confirmada de golpe', () => {
    for (const creador of ['asesor', 'admin'] as const) {
      expect(estadoInicialDeCita({ ...base, creador, paraOtro: true })).toBe('PENDING_CONFIRMATION')
      expect(estadoInicialDeCita({ ...base, creador, paraOtro: true, confirmacion: 'automatica' })).toBe('PENDING_CONFIRMATION')
    }
  })
  it('agendar «para otro» con el mismo uid de cliente y asesor NO cuenta como agendarse a sí mismo', () => {
    // paraOtro implica que lo registra el equipo (creador asesor/admin); un creador cliente con paraOtro no es un caso válido, pero no debe confirmarse.
    expect(estadoInicialDeCita({ ...base, paraOtro: true, clienteUid: 'u-ase', asesorUid: 'u-ase' })).toBe('REQUESTED')
  })
})
