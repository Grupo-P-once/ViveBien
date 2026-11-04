import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbCorreo } from '../src/lib/correo/enviar'
import { entornoCorreo, type EntornoCorreo } from '../src/lib/correo/config'

process.env.CORREO_ENVIO = '1'

// El permiso de ver los datos del interesado vive en la cuenta del dueño: aquí se controla desde cada prueba.
let cuentasDeCitas: Map<string, { rol: string; capacidades?: Record<string, boolean> }> = new Map()
vi.mock('../src/lib/citas/asesores', () => ({ cuentasDeCitas: async () => cuentasDeCitas }))

import {
  avisarBajaDeCuenta, avisarConsultaRecibida, avisarContactoWhatsApp, avisarDisponibilidadDeFavorita, avisarEstatusPropiedad, avisarInvitacion, avisarNuevoInteresado, avisarPropiedad,
  estatusAvisable, MAX_AVISOS_DE_DISPONIBILIDAD, personaVerificada,
} from '../src/lib/correo/eventos-cuenta'

/** Correos de EVENTOS (4-nov-2026): solo al correo VERIFICADO de la cuenta destinataria, una vez por hecho, sin tumbar nada. */
const ENV: EntornoCorreo = { transaccional: true, marketing: false, resendKey: 're_clave_de_prueba', secreto: '', webhookSecret: '', remitente: null, remitenteMarketing: null }

type Fila = Record<string, unknown>
let datos: Record<string, Fila[]>
let reservas: Array<Record<string, unknown>>
let enviados: Array<{ to: string[]; subject: string; html: string }>

/** Doble de la base: `from(...)` encadenable y esperable, y `rpc` que reserva el cupo. */
function crearDb(): DbCorreo {
  return {
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      if (fn === 'correo_reservar_envio') { reservas.push(args); return { data: { accion: 'enviar', id: reservas.length }, error: null } }
      return { data: null, error: null }
    },
    from: (t: string) => {
      let filas = datos[t] ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { filas = filas.filter((f) => f[c] === v); return q },
        in: (c: string, vs: unknown[]) => { filas = filas.filter((f) => vs.includes(f[c])); return q },
        limit: () => q,
        order: () => q,
        maybeSingle: async () => ({ data: filas[0] ?? null, error: null }),
        then: (ok: (r: unknown) => unknown) => ok({ data: filas, error: null }),
      }
      return q
    },
  }
}
const opciones = () => ({ entorno: ENV, fetch: (async (_u: string, i: RequestInit) => { enviados.push(JSON.parse(String(i.body))); return new Response('{"id":"re_1"}', { status: 200 }) }) as unknown as typeof fetch })

const DUENO = { uid: 'u-dueno', email: 'Dueno@Ejemplo.test', nombre: 'Dora Dueña', estado: 'activo', email_verificado: true, email_verificado_para: 'dueno@ejemplo.test' }
const PROP = { id: 'p-1', owner_id: 'u-dueno', titulo: 'Casa de prueba', folio: 'VB-0042', tipo: 'casa', operacion: 'venta', precio: 2_000_000, moneda: 'MXN', ciudad: 'León', completitud: 85, fotos: [] }

beforeEach(() => {
  datos = { usuarios: [DUENO], propiedades: [PROP], favoritos: [], preferencias_notificacion: [] }
  reservas = []
  enviados = []
  cuentasDeCitas = new Map()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('personaVerificada: a quién se le puede escribir', () => {
  it('cuenta activa con correo verificado: sí, con el correo normalizado', async () => {
    expect(await personaVerificada(crearDb(), 'u-dueno')).toEqual({ uid: 'u-dueno', correo: 'dueno@ejemplo.test', nombre: 'Dora Dueña' })
    datos.usuarios = [{ ...DUENO, email: ' DUENO@ejemplo.test ', email_verificado_para: 'Dueno@Ejemplo.test' }] // mayúsculas y espacios no cuentan como otra dirección
    expect((await personaVerificada(crearDb(), 'u-dueno'))?.correo).toBe('dueno@ejemplo.test')
  })
  it.each([
    ['sin verificar', { email_verificado: false }],
    ['sin la marca (migración 69 sin aplicar)', { email_verificado: undefined }],
    ['cuenta suspendida', { estado: 'suspendido' }],
    ['cuenta eliminada', { estado: 'eliminada' }],
    ['correo vacío', { email: '' }],
    ['el correo de la cuenta cambió después de verificarse', { email: 'nuevo@ejemplo.test' }],
    ['sin registro de qué dirección se verificó', { email_verificado_para: null }],
    ['verificó otra dirección', { email_verificado_para: 'otra@ejemplo.test' }],
  ])('%s: nunca', async (_n, cambio) => {
    datos.usuarios = [{ ...DUENO, ...cambio }]
    expect(await personaVerificada(crearDb(), 'u-dueno')).toBeNull()
  })
  it('sin uid o con una cuenta que no existe: nunca', async () => {
    expect(await personaVerificada(crearDb(), null)).toBeNull()
    expect(await personaVerificada(crearDb(), 'otro')).toBeNull()
  })
})

describe('propiedad: recibida, en revisión, publicada y rechazada', () => {
  it('en revisión: al DUEÑO (no a quien dispara), con clave por hecho y sin duplicar el reintento', async () => {
    const r = await avisarPropiedad(crearDb(), { evento: 'en_revision', prop: PROP, version: '2026-11-04T19:00:00.000Z' }, opciones())
    expect(r.estado).toBe('enviado')
    expect(enviados).toHaveLength(1)
    expect(enviados[0].to).toEqual(['dueno@ejemplo.test'])
    expect(enviados[0].subject).toContain('revisión')
    expect(reservas[0].p_clave).toBe('propiedad/p-1/en_revision/2026-11-04T19:00:00.000Z')
    expect(reservas[0].p_tipo).toBe('propiedad_en_revision')
  })
  it('una nueva fecha de envío es otro hecho (otra clave); la de «recibida» es única por propiedad', async () => {
    await avisarPropiedad(crearDb(), { evento: 'en_revision', prop: PROP, version: 'v1' }, opciones())
    await avisarPropiedad(crearDb(), { evento: 'en_revision', prop: PROP, version: 'v2' }, opciones())
    await avisarPropiedad(crearDb(), { evento: 'recibida', prop: PROP, version: 'cualquiera' }, opciones())
    expect(reservas.map((x) => x.p_clave)).toEqual(['propiedad/p-1/en_revision/v1', 'propiedad/p-1/en_revision/v2', 'propiedad/p-1/recibida'])
  })
  it('publicada y rechazada usan su plantilla; el motivo del revisor llega al dueño', async () => {
    await avisarPropiedad(crearDb(), { evento: 'publicada', prop: PROP, version: 'v1' }, opciones())
    await avisarPropiedad(crearDb(), { evento: 'rechazada', prop: PROP, version: 'v2', motivo: 'Faltan fotos de la fachada.' }, opciones())
    await avisarPropiedad(crearDb(), { evento: 'cambios_solicitados', prop: PROP, version: 'v3', motivo: 'Ajusta el precio.' }, opciones())
    expect(reservas.map((x) => x.p_tipo)).toEqual(['propiedad_aprobada', 'propiedad_rechazada', 'propiedad_rechazada'])
    expect(enviados[1].html).toContain('Faltan fotos de la fachada.')
    expect(enviados[2].html).toContain('Ajusta el precio.')
  })
  it('dueño sin verificar, suspendido o sin dueño: no sale nada y no se reserva cupo', async () => {
    datos.usuarios = [{ ...DUENO, email_verificado: false }]
    expect((await avisarPropiedad(crearDb(), { evento: 'publicada', prop: PROP, version: 'v' }, opciones())).estado).toBe('omitido')
    datos.usuarios = [DUENO]
    expect((await avisarPropiedad(crearDb(), { evento: 'publicada', prop: { ...PROP, owner_id: null }, version: 'v' }, opciones())).estado).toBe('omitido')
    expect(enviados).toEqual([])
    expect(reservas).toEqual([])
  })
  it('apagado por la compuerta o por la bandera transaccional: no sale nada', async () => {
    const r = await avisarPropiedad(crearDb(), { evento: 'publicada', prop: PROP, version: 'v' }, { ...opciones(), entorno: { ...ENV, transaccional: false } })
    expect(r).toEqual({ estado: 'omitido', motivo: 'transaccional_apagado' })
    expect(enviados).toEqual([])
  })
})

describe('consultas', () => {
  it('confirmación: solo al correo VERIFICADO de la sesión, nunca al del formulario', async () => {
    const r = await avisarConsultaRecibida(crearDb(), { solicitudId: 9, propiedadId: 'p-1', correo: 'Sesion@Ejemplo.test', verificado: true, nombre: 'Sara' }, opciones())
    expect(r.estado).toBe('enviado')
    expect(enviados[0].to).toEqual(['sesion@ejemplo.test'])
    expect(reservas[0].p_clave).toBe('consulta/9')
    expect(enviados[0].html).toContain('VIVE BIEN')
    expect((await avisarConsultaRecibida(crearDb(), { solicitudId: 10, propiedadId: 'p-1', correo: 'sesion@ejemplo.test', verificado: false }, opciones())).estado).toBe('omitido')
    expect((await avisarConsultaRecibida(crearDb(), { solicitudId: 11, propiedadId: 'no-existe', correo: 'sesion@ejemplo.test', verificado: true }, opciones())).estado).toBe('omitido')
  })
  it('nuevo interesado: solo al dueño PUBLICADOR con ver_datos_interesado; sin el permiso, o si es del equipo, no sale', async () => {
    cuentasDeCitas = new Map([['u-dueno', { rol: 'publicador', capacidades: {} }]])
    expect((await avisarNuevoInteresado(crearDb(), { solicitudId: 5, propiedadId: 'p-1', canal: 'formulario' }, opciones())).motivo).toBe('sin_permiso_para_ver_interesado')
    cuentasDeCitas = new Map([['u-dueno', { rol: 'admin' }]])
    expect((await avisarNuevoInteresado(crearDb(), { solicitudId: 5, propiedadId: 'p-1', canal: 'formulario' }, opciones())).estado).toBe('omitido')
    expect(enviados).toEqual([])
    cuentasDeCitas = new Map([['u-dueno', { rol: 'publicador', capacidades: { ver_datos_interesado: true } }]])
    const r = await avisarNuevoInteresado(crearDb(), { solicitudId: 5, propiedadId: 'p-1', canal: 'formulario' }, opciones())
    expect(r.estado).toBe('enviado')
    expect(enviados[0].to).toEqual(['dueno@ejemplo.test'])
    expect(reservas[0].p_clave).toBe('consulta/5/dueno')
    // El correo no lleva datos de la persona que consultó: no se le pasa ninguno.
    expect(enviados[0].html).not.toMatch(/@ejemplo\.invalid|telefono|Teléfono:/)
  })
  it('WhatsApp: una vez por persona y propiedad, con los datos de VIVE BIEN y nunca los del dueño', async () => {
    const r = await avisarContactoWhatsApp(crearDb(), { uid: 'u-cli', propiedadId: 'p-1', correo: 'cli@ejemplo.test', verificado: true }, opciones())
    expect(r.estado).toBe('enviado')
    expect(reservas[0].p_clave).toBe('whatsapp/u-cli/p-1')
    expect(enviados[0].html).toContain('477 811 6501')
    expect(enviados[0].html).toContain('VB-0042')
    expect((await avisarContactoWhatsApp(crearDb(), { uid: 'u-cli', propiedadId: 'p-1', correo: 'cli@ejemplo.test', verificado: false }, opciones())).estado).toBe('omitido')
  })
})

describe('baja de cuenta e invitaciones', () => {
  it('baja: al correo verificado de la sesión, una vez por cuenta', async () => {
    const r = await avisarBajaDeCuenta(crearDb(), { uid: 'u-1', correo: 'Ex@Ejemplo.test', verificado: true, nombre: 'Ex' }, opciones())
    expect(r.estado).toBe('enviado')
    expect(reservas[0].p_clave).toBe('baja/u-1/titular')
    expect(enviados[0].to).toEqual(['ex@ejemplo.test'])
    expect((await avisarBajaDeCuenta(crearDb(), { uid: 'u-1', correo: 'ex@ejemplo.test', verificado: false }, opciones())).estado).toBe('omitido')
  })
  it('invitación aceptada o cancelada: a quien invitó, no a quien hizo la acción', async () => {
    expect((await avisarInvitacion(crearDb(), { invitacionId: 3, estado: 'aceptada', correoInvitado: 'nuevo@ejemplo.test', rol: 'publicador', invitadoPor: 'u-dueno', actorUid: 'u-nuevo' }, opciones())).estado).toBe('enviado')
    expect(reservas[0].p_clave).toBe('invitacion/3/aceptada')
    expect(enviados[0].to).toEqual(['dueno@ejemplo.test'])
    expect((await avisarInvitacion(crearDb(), { invitacionId: 4, estado: 'cancelada', correoInvitado: 'x@ejemplo.test', rol: 'admin', invitadoPor: 'u-dueno', actorUid: 'u-dueno' }, opciones())).estado).toBe('omitido')
    expect((await avisarInvitacion(crearDb(), { invitacionId: 5, estado: 'cancelada', correoInvitado: 'x@ejemplo.test', rol: 'admin', invitadoPor: null }, opciones())).estado).toBe('omitido')
  })
})

describe('estatus y disponibilidad', () => {
  it('solo pausada, vendida, rentada y disponible avisan (eliminada no)', () => {
    for (const e of ['pausada', 'vendida', 'rentada', 'disponible']) expect(estatusAvisable(e)).toBe(true)
    for (const e of ['eliminada', '', null, undefined, 'otra']) expect(estatusAvisable(e)).toBe(false)
  })
  it('estatus de la propiedad: al dueño, una vez por cambio', async () => {
    const r = await avisarEstatusPropiedad(crearDb(), { prop: PROP, estatus: 'vendida', version: '2026-11-04T20:00:00.000Z' }, opciones())
    expect(r.estado).toBe('enviado')
    expect(reservas[0].p_clave).toBe('propiedad/p-1/estatus/vendida/2026-11-04T20:00:00.000Z')
    expect(enviados[0].subject).toContain('vendida')
  })
  it('disponibilidad: solo a quien guardó la propiedad Y activó los avisos, con correo verificado y sin el dueño', async () => {
    datos.usuarios = [DUENO, { uid: 'u-a', email: 'a@ejemplo.test', nombre: 'A', estado: 'activo', email_verificado: true, email_verificado_para: 'a@ejemplo.test' }, { uid: 'u-b', email: 'b@ejemplo.test', nombre: 'B', estado: 'activo', email_verificado: true, email_verificado_para: 'b@ejemplo.test' }, { uid: 'u-c', email: 'c@ejemplo.test', nombre: 'C', estado: 'activo', email_verificado: false, email_verificado_para: 'c@ejemplo.test' }]
    datos.favoritos = [{ uid: 'u-a', propiedad_id: 'p-1' }, { uid: 'u-b', propiedad_id: 'p-1' }, { uid: 'u-c', propiedad_id: 'p-1' }, { uid: 'u-dueno', propiedad_id: 'p-1' }]
    datos.preferencias_notificacion = [{ uid: 'u-a', correo_precio: true }, { uid: 'u-c', correo_precio: true }, { uid: 'u-dueno', correo_precio: true }]
    const r = await avisarDisponibilidadDeFavorita(crearDb(), { prop: PROP, estatus: 'vendida', version: 'v1' }, opciones())
    expect(r).toEqual({ enviados: 1, omitidos: 1 }) // u-c quiere avisos pero no tiene el correo verificado; u-b no los activó; el dueño se excluye
    expect(enviados.map((e) => e.to[0])).toEqual(['a@ejemplo.test'])
    expect(reservas[0].p_clave).toBe('favorita/p-1/vendida/v1/u-a')
  })
  it(`nunca más de ${MAX_AVISOS_DE_DISPONIBILIDAD} personas por cambio`, async () => {
    const quienes = Array.from({ length: MAX_AVISOS_DE_DISPONIBILIDAD + 20 }, (_, i) => `u-${i}`)
    datos.usuarios = quienes.map((uid) => ({ uid, email: `${uid}@ejemplo.test`, nombre: uid, estado: 'activo', email_verificado: true, email_verificado_para: `${uid}@ejemplo.test` }))
    datos.favoritos = quienes.map((uid) => ({ uid, propiedad_id: 'p-1' }))
    datos.preferencias_notificacion = quienes.map((uid) => ({ uid, correo_precio: true }))
    const r = await avisarDisponibilidadDeFavorita(crearDb(), { prop: PROP, estatus: 'pausada', version: 'v1' }, opciones())
    expect(r.enviados).toBe(MAX_AVISOS_DE_DISPONIBILIDAD)
  })
})

describe('la configuración de ejemplo no cambia: todo sigue apagado por omisión', () => {
  it('sin variables, ningún correo de evento sale', () => {
    expect(entornoCorreo({}).transaccional).toBe(false)
  })
})
