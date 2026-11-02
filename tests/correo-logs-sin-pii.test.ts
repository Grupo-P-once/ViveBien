import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { avisarDeLead } from '../src/lib/aviso-lead'
import { enviarInvitacion } from '../src/lib/invitacion-correo'

/**
 * MKT-60 / revisión de Semgrep (2-nov-2026): los registros de la plataforma (Vercel) no deben llevar datos personales. Dos avisos de
 * «sin clave del proveedor» imprimían el nombre y el teléfono de un contacto y el correo de una persona invitada. Esta prueba captura TODO
 * lo que los emisores escriben en consola y exige que no aparezca ningún dato de la persona.
 */
const NOMBRE = 'Zulema Quintanilla-Prueba'
const TELEFONO = '4779998877'
const CORREO = 'invitada.secreta@ejemplo.invalid'
const LEAD = { nombre: NOMBRE, telefono: TELEFONO, email: 'zulema.q@ejemplo.invalid', mensaje: 'Hola', origen: 'contacto' }
let salida: string[]

beforeEach(() => {
  salida = []
  const guardar = (...a: unknown[]) => { salida.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')) }
  vi.spyOn(console, 'warn').mockImplementation(guardar)
  vi.spyOn(console, 'error').mockImplementation(guardar)
  vi.spyOn(console, 'log').mockImplementation(guardar)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const sinDatos = () => {
  const t = salida.join('\n')
  for (const dato of [NOMBRE, 'Quintanilla', TELEFONO, CORREO, 'zulema.q@', 'secreta@']) expect(t).not.toContain(dato)
}

describe('los registros de los emisores no llevan datos personales', () => {
  it('sin RESEND_API_KEY, el aviso de contacto deja rastro SIN nombre ni teléfono', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    expect(await avisarDeLead(LEAD)).toMatchObject({ enviado: false, motivo: 'sin-configurar' })
    expect(salida.join('\n')).toMatch(/\[aviso-lead\] sin RESEND_API_KEY/) // sigue dejando rastro de que se perdió un aviso
    sinDatos()
  })

  it('sin RESEND_API_KEY, la invitación deja rastro SIN el correo de la persona invitada', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    expect(await enviarInvitacion({ email: CORREO, rol: 'publicador', invitadoPor: 'jefe@ejemplo.invalid' })).toMatchObject({ enviado: false, motivo: 'sin-configurar' })
    expect(salida.join('\n')).toMatch(/\[invitacion\] sin RESEND_API_KEY/)
    sinDatos()
  })

  it('con la compuerta apagada y con clave, ninguno de los dos escribe datos personales', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_clave_de_prueba_falsa')
    vi.stubEnv('CORREO_ENVIO', '')
    vi.stubGlobal('fetch', async () => { throw new Error('no debe llamarse al proveedor') })
    await avisarDeLead(LEAD)
    await enviarInvitacion({ email: CORREO, rol: 'publicador', invitadoPor: 'jefe@ejemplo.invalid' })
    sinDatos()
  })
})
