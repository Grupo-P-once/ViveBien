import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Revisión de Codex (6-nov-2026), hallazgo ALTO confirmado: el historial de `GET /api/citas/[id]` solo se recortaba para el cliente y para el publicador
 * que atiende; el PROPIETARIO (dueño que no atiende la cita, D-1) recibía los eventos `NOTE_UPDATED` y los `datos` completos (notas, nombres). Aquí se prueba
 * cada papel contra el MISMO historial lleno de datos que no debe salir.
 */
const estado = vi.hoisted(() => ({ papel: 'propietario' as string, rol: 'publicador' as string }))
const HISTORIAL = [
  { tipo: 'CREATED', estado_antes: null, estado_despues: 'REQUESTED', actor_rol: 'cliente', via: 'panel', datos: { inicio: 'I', fin: 'F', tipo: 'solicitada', nota_interna: 'SECRETO-INTERNO', cliente_nombre: 'Ana Pérez' }, creado_en: '2026-11-01T00:00:00Z' },
  { tipo: 'NOTE_UPDATED', estado_antes: 'REQUESTED', estado_despues: 'REQUESTED', actor_rol: 'asesor', via: 'panel', datos: { notas_internas: 'SECRETO-INTERNO' }, creado_en: '2026-11-01T01:00:00Z' },
  { tipo: 'CANCELLED', estado_antes: 'CONFIRMED', estado_despues: 'CANCELLED', actor_rol: 'cliente', via: 'panel', datos: { motivo: 'Cambio de planes', telefono: '4771234567' }, creado_en: '2026-11-01T02:00:00Z' },
]
vi.mock('@/lib/auth-server', () => ({
  exigir: async () => ({ perfil: { uid: 'u1', rol: estado.rol, superAdmin: false, estado: 'activo' } }),
  supabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: HISTORIAL, error: null }) }) }) }) }),
  }),
}))
vi.mock('@/lib/citas/servicio', () => ({
  getAppointment: async () => ({ id: '11111111-1111-4111-8111-111111111111', papel: estado.papel }),
}))

const ID = '11111111-1111-4111-8111-111111111111'
async function leer() {
  const { GET } = await import('../src/app/api/citas/[id]/route')
  const r = await GET(new Request(`https://vivebienn.com/api/citas/${ID}`), { params: Promise.resolve({ id: ID }) })
  expect(r.status).toBe(200)
  return (await r.json()) as { historial: Array<{ tipo: string; datos: Record<string, unknown> }> }
}
beforeEach(() => { estado.papel = 'propietario'; estado.rol = 'publicador' })

describe('historial de una cita: lo que sale según el papel', () => {
  for (const [papel, rol] of [['propietario', 'publicador'], ['cliente', 'cliente'], ['asesor', 'publicador']] as const) {
    it(`${papel}${rol === 'publicador' && papel === 'asesor' ? ' (publicador que atiende)' : ''}: sin notas internas ni datos personales; solo horarios y motivo`, async () => {
      estado.papel = papel; estado.rol = rol
      const { historial } = await leer()
      const texto = JSON.stringify(historial)
      expect(historial.map((e) => e.tipo)).not.toContain('NOTE_UPDATED')
      expect(texto).not.toContain('SECRETO-INTERNO')
      expect(texto).not.toContain('Ana Pérez')
      expect(texto).not.toContain('4771234567')
      expect(historial.find((e) => e.tipo === 'CANCELLED')?.datos).toEqual({ motivo: 'Cambio de planes' })
      expect(historial.find((e) => e.tipo === 'CREATED')?.datos).toEqual({ inicio: 'I', fin: 'F' })
    })
  }
  it('el equipo (admin y asesor del equipo) sí ve el historial completo', async () => {
    for (const [papel, rol] of [['admin', 'admin'], ['asesor', 'admin']] as const) {
      estado.papel = papel; estado.rol = rol
      const { historial } = await leer()
      expect(historial.map((e) => e.tipo)).toContain('NOTE_UPDATED')
      expect(JSON.stringify(historial)).toContain('SECRETO-INTERNO')
    }
  })
})
