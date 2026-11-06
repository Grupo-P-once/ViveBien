import { describe, expect, it } from 'vitest'
import { correoAbandonado } from '../src/lib/citas/enviar'

/** Revisión de Codex (6-nov-2026): un correo «pendiente» cuyo proceso murió no debe quedar así para siempre (el recordatorio se perdería tras 5 intentos). */
const ahora = new Date('2026-11-10T12:00:00.000Z')
const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString()

describe('correoAbandonado', () => {
  it('«pendiente» reciente: alguien lo está mandando, no se toca', () => {
    expect(correoAbandonado('pendiente', hace(1), ahora)).toBe(false)
    expect(correoAbandonado('pendiente', hace(10), ahora)).toBe(false)   // justo en el límite: aún no
  })
  it('«pendiente» de hace más de 10 minutos: abandonado, un solo proceso puede tomarlo', () => {
    expect(correoAbandonado('pendiente', hace(11), ahora)).toBe(true)
    expect(correoAbandonado('pendiente', hace(600), ahora)).toBe(true)
  })
  it('enviado o en error nunca son «abandonados» (los resuelve el flujo de reintento / duplicado)', () => {
    expect(correoAbandonado('enviado', hace(600), ahora)).toBe(false)
    expect(correoAbandonado('error', hace(600), ahora)).toBe(false)
  })
  it('una fecha ilegible no se toma por abandonada (falla cerrado: no se manda dos veces)', () => {
    expect(correoAbandonado('pendiente', 'no-es-fecha', ahora)).toBe(false)
  })
})
