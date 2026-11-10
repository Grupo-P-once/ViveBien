import { describe, expect, it } from 'vitest'

/**
 * Lo nuevo del modelo v2 de citas (5-nov-2026) que no cubren las pruebas de la base ni las de reglas:
 *   · a quién le toca atender las citas de una propiedad (D-1);
 *   · los avisos de la bandeja: el propietario se entera sin datos del interesado (D-1).
 * La ruta de tareas (D-4) está en `citas-tareas.test.ts`, que simula el servicio; aquí NO se simula nada del servicio.
 */

import { responsableDeCitas } from '../src/lib/citas/servicio'
import { avisoDeEvento } from '../src/lib/citas/enviar'

/** Un cliente de Supabase mínimo y de mentira: solo lo que usa `responsableDeCitas`. */
function dbFalso(tablas: Record<string, Array<Record<string, unknown>>>) {
  const fabrica = (nombre: string) => {
    let filas = [...(tablas[nombre] ?? [])]
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.in = (col: string, vals: unknown[]) => { filas = filas.filter((f) => vals.includes(f[col])); return b }
    b.eq = (col: string, val: unknown) => { filas = filas.filter((f) => f[col] === val); return b }
    b.limit = () => b
    b.maybeSingle = async () => ({ data: filas[0] ?? null, error: null })
    b.then = (res: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: filas, error: null }).then(res)
    return b
  }
  return { from: fabrica } as never
}

describe('D-1 · a quién le toca atender las citas de una propiedad', () => {
  const usuarios = [
    { uid: 'equipo1', rol: 'admin', estado: 'activo', creado_en: '2026-09-01T00:00:00Z' },
    { uid: 'equipo2', rol: 'super_admin', estado: 'activo', creado_en: '2026-08-01T00:00:00Z' },
    { uid: 'pub', rol: 'publicador', estado: 'activo', creado_en: '2026-10-01T00:00:00Z', tipo_publicador: 'publicador', permisos_override: {} },
    { uid: 'aso', rol: 'publicador', estado: 'activo', creado_en: '2026-10-02T00:00:00Z', tipo_publicador: 'asociado', permisos_override: {} },
    { uid: 'aso-sin-citas', rol: 'publicador', estado: 'activo', creado_en: '2026-10-03T00:00:00Z', tipo_publicador: 'asociado', permisos_override: { recibir_citas: false } },
    { uid: 'cli', rol: 'cliente', estado: 'activo', creado_en: '2026-10-04T00:00:00Z' },
  ]
  const conEquipo = (uid: string | null) => dbFalso({ usuarios, configuracion: uid ? [{ clave: 'citas', valor: { responsable_equipo_uid: uid } }] : [] })

  it('el dueño del equipo atiende sus propias propiedades', async () => {
    expect(await responsableDeCitas(conEquipo('equipo2'), { owner_id: 'equipo1', responsable_citas_uid: null })).toBe('equipo1')
  })

  it('las propiedades de un PUBLICADOR las atiende VIVE BIEN: el responsable del equipo, no el publicador', async () => {
    expect(await responsableDeCitas(conEquipo('equipo2'), { owner_id: 'pub', responsable_citas_uid: null })).toBe('equipo2')
  })

  it('un ASOCIADO atiende las suyas (tiene `recibir_citas` por defecto)', async () => {
    expect(await responsableDeCitas(conEquipo('equipo2'), { owner_id: 'aso', responsable_citas_uid: null })).toBe('aso')
  })

  it('un asociado a quien un admin le quitó `recibir_citas` deja de atenderlas: pasa al equipo', async () => {
    expect(await responsableDeCitas(conEquipo('equipo2'), { owner_id: 'aso-sin-citas', responsable_citas_uid: null })).toBe('equipo2')
  })

  it('un responsable ASIGNADO por un admin manda sobre el dueño (propiedades «asignadas» al asociado)', async () => {
    expect(await responsableDeCitas(conEquipo('equipo2'), { owner_id: 'pub', responsable_citas_uid: 'aso' })).toBe('aso')
    expect(await responsableDeCitas(conEquipo('equipo2'), { owner_id: 'equipo1', responsable_citas_uid: 'equipo2' })).toBe('equipo2')
  })

  it('un asignado que NO puede atender (cliente, publicador sin permiso) se salta: no se inventa un responsable', async () => {
    expect(await responsableDeCitas(conEquipo('equipo2'), { owner_id: 'pub', responsable_citas_uid: 'cli' })).toBe('equipo2')
    expect(await responsableDeCitas(conEquipo('equipo2'), { owner_id: 'pub', responsable_citas_uid: 'pub' })).toBe('equipo2')
  })

  // Decisión 7 (10-nov-2026): sin responsable del equipo configurado, atiende el TITULAR AUTOMÁTICO (admin activo más antiguo; Super Admin solo si no hay admins).
  it('sin responsable del equipo configurado, la propiedad de un publicador la atiende el ADMIN activo más antiguo (no el Super Admin, que es independiente)', async () => {
    expect(await responsableDeCitas(conEquipo(null), { owner_id: 'pub', responsable_citas_uid: null })).toBe('equipo1')
    expect(await responsableDeCitas(conEquipo(null), { owner_id: null, responsable_citas_uid: null })).toBe('equipo1')
  })

  it('el titular automático es el admin ACTIVO más antiguo: uno suspendido no sirve y el empate se desempata por uid', async () => {
    const con = (extra: Array<Record<string, unknown>>) => dbFalso({ usuarios: [...usuarios, ...extra], configuracion: [] })
    // un admin más antiguo pero SUSPENDIDO no es titular
    expect(await responsableDeCitas(con([{ uid: 'adm-viejo-suspendido', rol: 'admin', estado: 'suspendido', creado_en: '2026-01-01T00:00:00Z' }]), { owner_id: 'pub', responsable_citas_uid: null })).toBe('equipo1')
    // un admin activo más antiguo SÍ gana
    expect(await responsableDeCitas(con([{ uid: 'adm-viejo', rol: 'admin', estado: 'activo', creado_en: '2026-01-01T00:00:00Z' }]), { owner_id: 'pub', responsable_citas_uid: null })).toBe('adm-viejo')
    // mismo instante: desempata el uid (orden estable)
    expect(await responsableDeCitas(con([{ uid: 'adm-a', rol: 'admin', estado: 'activo', creado_en: '2026-09-01T00:00:00Z' }]), { owner_id: 'pub', responsable_citas_uid: null })).toBe('adm-a')
  })

  it('el Super Admin atiende SOLO si no hay ningún admin activo; y si no hay ni él, falla CERRADO (sin asesor)', async () => {
    const sinAdmins = dbFalso({ usuarios: usuarios.filter((u) => u.uid !== 'equipo1'), configuracion: [] })
    expect(await responsableDeCitas(sinAdmins, { owner_id: 'pub', responsable_citas_uid: null })).toBe('equipo2')
    const nadie = dbFalso({ usuarios: usuarios.filter((u) => u.rol !== 'admin' && u.rol !== 'super_admin'), configuracion: [] })
    expect(await responsableDeCitas(nadie, { owner_id: 'pub', responsable_citas_uid: null })).toBeNull()
    expect(await responsableDeCitas(nadie, { owner_id: null, responsable_citas_uid: null })).toBeNull()
  })

  it('un responsable de equipo mal configurado (un cliente, un uid inexistente o un valor raro) no sirve: cae al titular automático', async () => {
    expect(await responsableDeCitas(conEquipo('cli'), { owner_id: 'pub', responsable_citas_uid: null })).toBe('equipo1')
    expect(await responsableDeCitas(conEquipo('no-existe'), { owner_id: 'pub', responsable_citas_uid: null })).toBe('equipo1')
    expect(await responsableDeCitas(dbFalso({ usuarios, configuracion: [{ clave: 'citas', valor: { responsable_equipo_uid: 42 } }] }), { owner_id: 'pub', responsable_citas_uid: null })).toBe('equipo1')
  })

  it('el responsable del equipo CONFIGURADO manda sobre el titular automático, y el dueño que atiende manda sobre ambos', async () => {
    expect(await responsableDeCitas(conEquipo('equipo2'), { owner_id: 'pub', responsable_citas_uid: null })).toBe('equipo2')
    expect(await responsableDeCitas(conEquipo(null), { owner_id: 'aso', responsable_citas_uid: null })).toBe('aso')
  })

  it('si la lectura de usuarios falla, el titular automático falla cerrado (null), no inventa a nadie', async () => {
    const config = dbFalso({ configuracion: [] }) as unknown as { from: (t: string) => unknown }
    const roto = { from: (t: string) => (t === 'configuracion' ? config.from(t) : { select: () => ({ in: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: 'x' } }) }) }) }) }) } as never
    expect(await responsableDeCitas(roto, { owner_id: null, responsable_citas_uid: null })).toBeNull()
  })
})

describe('D-1 · los avisos de la bandeja', () => {
  it('«Solicitud enviada» al cliente, «Nueva solicitud» al responsable y un aviso sin datos al propietario', () => {
    expect(avisoDeEvento('CREATED', 'REQUESTED', 'cliente')?.titulo).toBe('Solicitud de cita enviada')
    expect(avisoDeEvento('CREATED', 'REQUESTED', 'asesor')?.titulo).toBe('Nueva solicitud de cita')
    expect(avisoDeEvento('CREATED', 'REQUESTED', 'propietario')?.titulo).toBe('Nueva solicitud en tu propiedad')
  })

  it('aceptada y rechazada: el cliente se entera de las dos, con el motivo si lo hubo', () => {
    expect(avisoDeEvento('CONFIRMED', 'CONFIRMED', 'cliente')?.titulo).toBe('Cita confirmada')
    expect(avisoDeEvento('REJECTED', 'REJECTED', 'cliente')).toEqual({ titulo: 'Solicitud de cita rechazada', extra: 'motivo' })
    expect(avisoDeEvento('REJECTED', 'REJECTED', 'asesor')).toBeNull()
    expect(avisoDeEvento('CANCELLED', 'CANCELLED', 'cliente')).toEqual({ titulo: 'Cita cancelada', extra: 'motivo' })
  })

  it('el propietario se entera de lo que cambia en SU propiedad, pero no de las negociaciones de horario ni de lo que expira', () => {
    expect(avisoDeEvento('CONFIRMED', 'CONFIRMED', 'propietario')?.titulo).toBe('Se confirmó una cita en tu propiedad')
    expect(avisoDeEvento('REJECTED', 'REJECTED', 'propietario')?.titulo).toBe('Se rechazó una solicitud en tu propiedad')
    expect(avisoDeEvento('CANCELLED', 'CANCELLED', 'propietario')?.titulo).toBe('Se canceló una cita en tu propiedad')
    expect(avisoDeEvento('RESCHEDULE_ACCEPTED', 'RESCHEDULED', 'propietario')?.titulo).toBe('Cambió el horario de una cita en tu propiedad')
    for (const e of ['RESCHEDULE_PROPOSED', 'RESCHEDULE_REJECTED', 'RESCHEDULE_WITHDRAWN', 'EXPIRED'] as const) {
      expect(avisoDeEvento(e, 'REQUESTED', 'propietario'), e).toBeNull()
    }
  })

  it('ningún aviso para el propietario lleva «extra» de motivo con datos del interesado: el motivo solo va al cliente y al equipo', () => {
    for (const e of ['CREATED', 'CONFIRMED', 'REJECTED', 'RESCHEDULE_ACCEPTED', 'CANCELLED'] as const) {
      const a = avisoDeEvento(e, e === 'CREATED' ? 'REQUESTED' : 'CONFIRMED', 'propietario')
      if (a) expect(a.extra, e).toBeUndefined()
    }
  })
})
