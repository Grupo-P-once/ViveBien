import { describe, expect, it, vi } from 'vitest'

/**
 * 6-nov-2026 — «los correos de citas quedan activos y sirviendo»: cada acción que puede cambiar una cita produce un evento y ese evento produce su correo
 * (o está en la lista EXPLÍCITA de eventos que no mandan correo). Si alguien añade una acción nueva sin su aviso, esta prueba falla.
 */
vi.mock('@/lib/auth-server', () => ({ supabaseAdmin: () => ({}), exigir: async () => ({ error: null }) }))

import { EVENTO_DE } from '../src/lib/citas/servicio'
import { planDeCorreos, type CitaParaPlan } from '../src/lib/citas/correos'
import { ACCIONES } from '../src/lib/citas/estados'

const SIN_CORREO = new Set(['COMPLETED', 'NO_SHOW', 'CORRECTED'])   // resultado interno de la visita: nadie recibe correo por marcarla
const cita = (o: Partial<CitaParaPlan> = {}): CitaParaPlan => ({ estado: 'REQUESTED', cliente_uid: 'cli', asesor_uid: 'ase', propuesta_por: 'asesor', ...o })

describe('cobertura de correos de citas', () => {
  it('toda acción de persona (menos «vencer», que es del sistema) tiene su evento', () => {
    for (const a of ACCIONES) if (a !== 'vencer') expect(EVENTO_DE[a], `la acción «${a}» no tiene evento`).toBeTruthy()
  })
  it('cada evento produce al menos un correo, salvo los internos declarados', () => {
    for (const [accion, evento] of Object.entries(EVENTO_DE)) {
      const planes = planDeCorreos(evento as never, cita(), 'ase')
      if (SIN_CORREO.has(evento!)) expect(planes, `«${accion}» (${evento}) no debe mandar correo`).toEqual([])
      else expect(planes.length, `«${accion}» (${evento}) no manda ningún correo`).toBeGreaterThan(0)
    }
  })
  it('crear y expirar (la tarea) también mandan correo', () => {
    expect(planDeCorreos('CREATED', cita(), 'cli').length).toBeGreaterThan(0)
    expect(planDeCorreos('EXPIRED', cita(), null).length).toBeGreaterThan(0)
  })
  it('ningún correo planeado ofrece acciones por enlace (D-3)', () => {
    for (const evento of [...Object.values(EVENTO_DE), 'CREATED', 'EXPIRED']) {
      for (const m of planDeCorreos(evento as never, cita(), 'ase')) expect(m.acciones, `${evento} → ${m.tipo}`).toEqual([])
    }
  })
})
