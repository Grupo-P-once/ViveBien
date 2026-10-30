import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * ADMIN — modalidad y permisos de un publicador (ADR-0013, fase ADMIN).
 *
 * Las rutas son las de producción y el perfil se calcula con el código real
 * (`resolverPerfil`); sólo la base, la bitácora y los flags están simulados.
 * Se prueba lo que importa de seguridad: quién puede, a quién, con qué motivo,
 * qué queda escrito, y que sin huella no hay cambio.
 */

type Fila = Record<string, unknown>

const mundo = vi.hoisted(() => ({
  sesion: null as null | { uid: string; email: string; fila: Record<string, unknown> },
  usuarios: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ filtros: Array<[string, unknown]>; cambios: Record<string, unknown> }>,
  auditoria: [] as Array<Record<string, unknown>>,
  denegados: [] as string[],
  sinMigracion28: false,
  rpcFalla: false,
  sinFuncion: false,
  conflictoForzado: false,
  ultimoSuper: false,
  rpcLlamadas: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  flags: { citasEnLinea: false } as Record<string, boolean>,
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')

  const cadena = () => {
    const filtros: Array<[string, unknown]> = []
    let columnas = '*'
    let cambios: Record<string, unknown> | null = null
    let contar = false
    const filas = () => mundo.usuarios.filter((f) => filtros.every(([k, v]) => (k === '__in' ? (v as { c: string; l: unknown[] }).l.includes(f[(v as { c: string }).c]) : f[k] === v)))
    const falla28 = () => mundo.sinMigracion28 && /tipo_publicador|permisos_override/.test(columnas)
    const c: Record<string, unknown> = {}
    c.select = (cols?: string, opts?: { count?: string }) => { if (cols) columnas = cols; if (opts?.count) contar = true; return c }
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    c.in = (k: string, l: unknown[]) => { filtros.push(['__in', { c: k, l }]); return c }
    c.order = () => c
    c.limit = () => c
    c.update = (f: Record<string, unknown>) => { cambios = f; return c }
    c.maybeSingle = async () => (falla28() ? { data: null, error: { message: 'column does not exist' } } : { data: filas()[0] ? { ...filas()[0] } : null, error: null })
    c.upsert = async (f: Record<string, unknown>) => {
      mundo.updates.push({ filtros: [], cambios: f })
      const fila = mundo.usuarios.find((u) => u.uid === f.uid)
      if (fila) Object.assign(fila, f)
      return { error: null }
    }
    c.then = (r: (v: unknown) => unknown) => {
      if (cambios) {
        mundo.updates.push({ filtros: [...filtros], cambios })
        for (const f of filas()) Object.assign(f, cambios)
        return r({ data: null, error: null })
      }
      if (falla28()) return r({ data: null, error: { message: 'column does not exist' } })
      return r({ data: filas(), error: null, count: filas().length })
    }
    void contar
    return c
  }

  const autorizar = () => real.crearAutorizador({
    verificar: async () => (mundo.sesion ? { uid: mundo.sesion.uid, email: mundo.sesion.email, emailVerified: true } : null),
    perfil: async (u) => real.resolverPerfil(u, mundo.sesion!.fila),
    denegado: async () => {},
  })
  return {
    ...real,
    supabaseAdmin: () => ({
      from: () => cadena(),
    rpc: async (fn: string, a: Record<string, unknown>) => {
      mundo.rpcLlamadas.push({ fn, args: a })
      if (mundo.sinFuncion) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
      if (mundo.rpcFalla) return { data: null, error: { code: 'XX000', message: 'boom' } } // falla (p. ej. la bitácora): NO queda nada
      if (fn === 'usuario_cambiar_rol_estado') {
        // `usuario_cambiar_rol_estado` (migración 31): rol y/o estado + bitácora, todo o nada. Misma semántica, simulada.
        const f = mundo.usuarios.find((u) => u.uid === a.p_uid)
        if (!f) return { data: { resultado: 'no_existe' }, error: null }
        if (mundo.ultimoSuper) return { data: null, error: { code: 'P0001', message: 'ultimo_super_admin: no se puede dejar el sistema sin Super Admin activo' } }
        if (mundo.conflictoForzado || f.rol !== a.p_antes_rol || f.estado !== a.p_antes_estado) return { data: { resultado: 'conflicto' }, error: null }
        const au = a.p_audit as { actor_uid: string; actor_email: string; actor_rol: string; accion: string; antes: unknown; despues: unknown }
        const cambios: Record<string, unknown> = {}
        if (a.p_rol) cambios.rol = a.p_rol
        if (a.p_estado) cambios.estado = a.p_estado
        Object.assign(f, cambios)
        mundo.updates.push({ filtros: [['uid', a.p_uid]], cambios })
        mundo.auditoria.push({ actor: { uid: au.actor_uid, email: au.actor_email, rol: au.actor_rol }, accion: au.accion, entidad: 'usuarios', entidadId: a.p_uid, antes: au.antes, despues: au.despues })
        return { data: { resultado: 'ok' }, error: null }
      }
      const f = mundo.usuarios.find((u) => u.uid === a.p_uid)
      if (!f) return { data: { resultado: 'no_existe' }, error: null }
      if (f.rol !== 'publicador') return { data: { resultado: 'no_publicador' }, error: null }
      const igual = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null)
      if (mundo.conflictoForzado || !igual(f.tipo_publicador, a.p_antes_tipo) || !igual(f.permisos_override, a.p_antes_overrides)) {
        return { data: { resultado: 'conflicto' }, error: null }
      }
      const au = a.p_audit as { actor_uid: string; actor_email: string; actor_rol: string; accion: string; antes: unknown; despues: unknown }
      const cambios = { tipo_publicador: a.p_tipo, permisos_override: a.p_overrides }
      Object.assign(f, cambios)
      mundo.updates.push({ filtros: [['uid', a.p_uid]], cambios })
      mundo.auditoria.push({ actor: { uid: au.actor_uid, email: au.actor_email, rol: au.actor_rol }, accion: au.accion, entidad: 'usuarios', entidadId: a.p_uid, antes: au.antes, despues: au.despues })
      return { data: { resultado: 'ok' }, error: null }
    },
    }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar()(req, (p) => puede(p, permiso), permiso),
    requireAdmin: (req: Request) => autorizar()(req, (p) => puede(p, 'panel.admin'), 'panel.admin'),
    registrarIntentoDenegado: async (_p: unknown, _r: unknown, que: string) => { mundo.denegados.push(que) },
  }
})

vi.mock('@/lib/auditoria', () => ({
  registrar: async (e: Record<string, unknown>) => { mundo.auditoria.push(e) },
}))
vi.mock('@/lib/firebase', () => ({ auth: {} })) // `sesion.tsx` (que define ErrorDePeticion) importa Firebase
vi.mock('@/lib/invitaciones', () => ({ aplicarInvitacion: async () => null }))
vi.mock('@/lib/config/flags-servidor', () => ({
  flagEncendido: async (f: string) => mundo.flags[f] === true,
  leerFlags: async () => mundo.flags,
}))

import { CAPACIDADES, DEFAULTS_POR_TIPO, capacidadesEfectivas, compactarOverrides, mismosOverrides } from '../src/lib/acceso/capacidades'
import {
  ETIQUETA_TIPO, FICHAS, GRUPOS, ORDEN_DE_GRUPOS, cambiosEfectivos, capacidadesDelGrupo, cuerpoDeGuardado, cuerpoDePermisos, filaDePermiso,
} from '../src/lib/admin/permisos'
import { servidorDePrueba } from '../src/lib/admin/vista-previa-permisos'
import { GET as lista, PATCH as cambiar } from '../src/app/api/admin/usuarios/route'
import { GET as detalle } from '../src/app/api/admin/usuarios/[uid]/route'
import { PATCH as guardarPerfil } from '../src/app/api/usuarios/me/route'

// ── Fixtures ──────────────────────────────────────────────────

const usuario = (uid: string, rol: string, extra: Fila = {}): Fila => ({
  uid, rol, estado: 'activo', nombre: `Nombre ${uid}`, email: `${uid.toLowerCase()}@ejemplo.test`, telefono: '4770000000', whatsapp: null,
  completitud: 80, creado_en: '2026-09-01T00:00:00Z', ultimo_acceso: null, ...extra,
})

const comoSesion = (uid: string, rol: string) => { mundo.sesion = { uid, email: `${uid.toLowerCase()}@ejemplo.test`, fila: { rol, estado: 'activo' } } }

const R = (url: string, metodo = 'GET', cuerpo?: unknown) => new Request(`https://vivebienn.com${url}`, {
  method: metodo,
  headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
  ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
})
const ctx = (uid: string) => ({ params: Promise.resolve({ uid }) })
const patch = (cuerpo: Record<string, unknown>) => cambiar(R('/api/admin/usuarios', 'PATCH', cuerpo))
const MOTIVO = 'Alta como asociado según el acuerdo firmado'
const fila = (uid: string) => mundo.usuarios.find((u) => u.uid === uid)!

beforeEach(() => {
  mundo.updates = []; mundo.auditoria = []; mundo.denegados = []
  mundo.sinMigracion28 = false; mundo.rpcFalla = false; mundo.sinFuncion = false; mundo.conflictoForzado = false; mundo.ultimoSuper = false; mundo.rpcLlamadas = []
  mundo.flags = { citasEnLinea: false }
  comoSesion('ADM', 'admin')
  mundo.usuarios = [
    usuario('ADM', 'admin'),
    usuario('SUP', 'super_admin'),
    usuario('P1', 'publicador', { tipo_publicador: 'publicador', permisos_override: {} }),
    usuario('P2', 'publicador', { tipo_publicador: 'asociado', permisos_override: { mostrar_telefono: true } }),
    usuario('CLI', 'cliente', { tipo_publicador: 'publicador', permisos_override: {} }),
  ]
})

// ── Acceso ─────────────────────────────────────────────────────

describe('quién entra a la administración de permisos', () => {
  const rutas = async () => ({
    lista: (await lista(R('/api/admin/usuarios'))).status,
    detalle: (await detalle(R('/api/admin/usuarios/P1'), ctx('P1'))).status,
    cambio: (await patch({ uid: 'P1', tipo_publicador: 'asociado', motivo: MOTIVO })).status,
  })

  it('un admin entra a las tres', async () => {
    expect(await rutas()).toEqual({ lista: 200, detalle: 200, cambio: 200 })
  })

  it('un super admin también', async () => {
    comoSesion('SUP', 'super_admin')
    expect(await rutas()).toEqual({ lista: 200, detalle: 200, cambio: 200 })
  })

  for (const [nombre, uid, rol] of [['un CLIENTE', 'CLI', 'cliente'], ['un PUBLICADOR', 'P1', 'publicador'], ['un ASOCIADO', 'P2', 'publicador']] as const) {
    it(`${nombre} recibe 403 en las tres y no se escribe nada`, async () => {
      comoSesion(uid, rol)
      mundo.usuarios.find((u) => u.uid === uid)!.tipo_publicador = nombre === 'un ASOCIADO' ? 'asociado' : 'publicador'
      const r = await rutas()
      expect(r).toEqual({ lista: 403, detalle: 403, cambio: 403 })
      expect(mundo.updates).toHaveLength(0)
      expect(mundo.auditoria).toHaveLength(0)
    })
  }

  it('sin sesión: 401 en las tres', async () => {
    mundo.sesion = null
    expect(await rutas()).toEqual({ lista: 401, detalle: 401, cambio: 401 })
  })

  it('una cuenta suspendida (aunque sea admin) no entra', async () => {
    mundo.sesion = { uid: 'ADM', email: 'adm@ejemplo.test', fila: { rol: 'admin', estado: 'suspendido' } }
    expect((await lista(R('/api/admin/usuarios'))).status).toBe(403)
  })
})

// ── Lectura ────────────────────────────────────────────────────

describe('lo que enseña la lista y la ficha', () => {
  it('la lista trae la modalidad sólo de los publicadores', async () => {
    const j = await (await lista(R('/api/admin/usuarios'))).json()
    const por = (uid: string) => j.usuarios.find((u: { uid: string }) => u.uid === uid)
    expect(por('P1').tipoPublicador).toBe('publicador')
    expect(por('P2').tipoPublicador).toBe('asociado')
    expect(por('CLI')).not.toHaveProperty('tipoPublicador')
    expect(por('ADM')).not.toHaveProperty('tipoPublicador')
    expect(j.permisosDisponibles).toBe(true)
  })

  it('la ficha de un publicador trae modalidad, overrides y permisos EFECTIVOS calculados por el servidor', async () => {
    const j = await (await detalle(R('/api/admin/usuarios/P2'), ctx('P2'))).json()
    expect(j.permisos.tipoPublicador).toBe('asociado')
    expect(j.permisos.overrides).toEqual({ mostrar_telefono: true })
    expect(j.permisos.efectivos).toEqual(capacidadesEfectivas({ rol: 'publicador', tipo: 'asociado', overrides: { mostrar_telefono: true } }))
    expect(j.permisos.efectivos.mostrar_telefono).toBe(true)
    expect(j.permisos.efectivos.publicar_sin_revision).toBe(true)
    expect(j.permisos.disponibles).toBe(true)
  })

  it('la ficha dice que las citas en línea están desactivadas (y cuando se activen, que están activas)', async () => {
    expect((await (await detalle(R('/api/admin/usuarios/P1'), ctx('P1'))).json()).citasEnLinea).toBe(false)
    mundo.flags.citasEnLinea = true
    expect((await (await detalle(R('/api/admin/usuarios/P1'), ctx('P1'))).json()).citasEnLinea).toBe(true)
  })

  it('la ficha de un cliente o un admin no trae permisos de publicador (aunque su fila diga otra cosa)', async () => {
    for (const uid of ['CLI', 'ADM', 'SUP']) {
      const j = await (await detalle(R(`/api/admin/usuarios/${uid}`), ctx(uid))).json()
      expect(j.permisos, uid).toBeNull()
    }
  })

  it('un uid que no existe o es absurdo da 404, sin revelar nada', async () => {
    expect((await detalle(R('/api/admin/usuarios/NOPE'), ctx('NOPE'))).status).toBe(404)
    expect((await detalle(R('/api/admin/usuarios/x'), ctx('x'.repeat(200)))).status).toBe(404)
    expect((await detalle(R('/api/admin/usuarios/'), ctx(''))).status).toBe(404)
  })

  it('con la migración 28 sin aplicar: se dice y se enseñan los valores MÁS restrictivos (falla cerrado)', async () => {
    mundo.sinMigracion28 = true
    const l = await (await lista(R('/api/admin/usuarios'))).json()
    expect(l.permisosDisponibles).toBe(false)
    const j = await (await detalle(R('/api/admin/usuarios/P2'), ctx('P2'))).json()
    expect(j.permisos.disponibles).toBe(false)
    expect(j.permisos.tipoPublicador).toBe('publicador') // aunque la fila diga asociado: no se pudo leer
    expect(j.permisos.efectivos.publicar_sin_revision).toBe(false)
    expect(j.permisos.efectivos.mostrar_telefono).toBe(false)
  })
})

// ── Cambiar modalidad y overrides ──────────────────────────────

describe('cambiar la modalidad', () => {
  it('pasa a un publicador a ASOCIADO y la bitácora trae quién, a quién, antes, después y motivo', async () => {
    const r = await patch({ uid: 'P1', tipo_publicador: 'asociado', motivo: MOTIVO })
    expect(r.status).toBe(200)
    expect(fila('P1').tipo_publicador).toBe('asociado')
    expect(mundo.auditoria).toHaveLength(1)
    const a = mundo.auditoria[0] as { actor: { uid: string; email: string }; accion: string; entidad: string; entidadId: string; antes: Fila; despues: Fila }
    expect(a.actor.uid).toBe('ADM') // quién
    expect(a.entidad).toBe('usuarios')
    expect(a.entidadId).toBe('P1') // a quién
    expect(a.accion).toBe('usuario.editar')
    expect(a.antes).toMatchObject({ tipo_publicador: 'publicador', permisos_override: {}, objetivo: { uid: 'P1', rol: 'publicador' } })
    expect(a.despues).toMatchObject({ tipo_publicador: 'asociado', permisos_override: {}, motivo: MOTIVO, objetivo: { uid: 'P1' } })
    // y lo EFECTIVO, para que la bitácora se entienda sin recalcular nada
    expect((a.antes.capacidades as Record<string, boolean>).publicar_sin_revision).toBe(false)
    expect((a.despues.capacidades as Record<string, boolean>).publicar_sin_revision).toBe(true)
  })

  it('de ASOCIADO a PUBLICADOR apaga lo premium', async () => {
    await patch({ uid: 'P2', tipo_publicador: 'publicador', motivo: 'Fin del acuerdo de asociado' })
    expect(fila('P2').tipo_publicador).toBe('publicador')
    const a = mundo.auditoria[0] as { despues: { capacidades: Record<string, boolean> } }
    expect(a.despues.capacidades.publicar_sin_revision).toBe(false)
    expect(a.despues.capacidades.recibir_citas).toBe(false)
  })

  it('rechaza una modalidad que no existe', async () => {
    expect((await patch({ uid: 'P1', tipo_publicador: 'premium', motivo: MOTIVO })).status).toBe(400)
    expect(mundo.updates).toHaveLength(0)
  })

  it('lo que sólo cambia el nombre de la modalidad pero deja lo mismo no se escribe ni se audita (no hay cambio)', async () => {
    const r = await patch({ uid: 'P1', tipo_publicador: 'publicador', motivo: MOTIVO })
    expect(r.status).toBe(400)
    expect(mundo.updates).toHaveLength(0)
    expect(mundo.auditoria).toHaveLength(0)
  })
})

describe('overrides individuales', () => {
  it('enciende una capacidad: queda guardada, se audita antes/después y cambia lo efectivo', async () => {
    const r = await patch({ uid: 'P1', permisos: { recibir_citas: true, aceptar_citas: true }, motivo: 'Atiende sus propias citas por acuerdo' })
    expect(r.status).toBe(200)
    expect(fila('P1').permisos_override).toEqual({ recibir_citas: true, aceptar_citas: true })
    const a = mundo.auditoria[0] as { antes: Fila; despues: Fila }
    expect(a.antes.permisos_override).toEqual({})
    expect(a.despues.permisos_override).toEqual({ recibir_citas: true, aceptar_citas: true })
    expect((a.despues.capacidades as Record<string, boolean>).aceptar_citas).toBe(true)
    expect((a.antes.capacidades as Record<string, boolean>).aceptar_citas).toBe(false)
  })

  it('`null` vuelve al valor de la modalidad y quita el override', async () => {
    await patch({ uid: 'P2', permisos: { mostrar_telefono: null }, motivo: 'Se retira el permiso de teléfono' })
    expect(fila('P2').permisos_override).toEqual({})
  })

  it('NO guarda redundancias: un override igual al default de la modalidad no se escribe', async () => {
    // P1 (publicador): recibir_solicitudes ya es true por defecto; ver_datos_interesado ya es false.
    const r = await patch({ uid: 'P1', permisos: { recibir_solicitudes: true, ver_datos_interesado: false, aceptar_citas: true }, motivo: 'Ajuste de prueba con redundancias' })
    expect(r.status).toBe(200)
    expect(fila('P1').permisos_override).toEqual({ aceptar_citas: true }) // sólo lo que se aparta del default
  })

  it('al cambiar de modalidad se limpian los overrides que pasan a ser el default de la nueva', async () => {
    // P2 es asociado con mostrar_telefono: true (se aparta del default). Pasa a publicador y se le pide también mostrar_telefono: false → ya es el default.
    mundo.usuarios.find((u) => u.uid === 'P2')!.permisos_override = { publicar_sin_revision: false }
    await patch({ uid: 'P2', tipo_publicador: 'publicador', motivo: 'Pasa a la modalidad normal' })
    // publicar_sin_revision: false ya es el default del publicador normal → se compacta
    expect(fila('P2').permisos_override).toEqual({})
  })

  it('un cambio sin efecto (todo igual) da 400, no escribe y no ensucia la bitácora', async () => {
    const r = await patch({ uid: 'P2', permisos: { mostrar_telefono: true }, motivo: 'Lo mismo que ya tiene' })
    expect(r.status).toBe(400)
    expect(mundo.updates).toHaveLength(0)
    expect(mundo.auditoria).toHaveLength(0)
  })

  it('rechaza permisos desconocidos (incluida «contacto_publico», que NO existe), valores que no son booleanos y formas raras', async () => {
    expect((await patch({ uid: 'P1', permisos: { contacto_publico: true }, motivo: MOTIVO })).status).toBe(400)
    expect((await patch({ uid: 'P1', permisos: { poder_total: true }, motivo: MOTIVO })).status).toBe(400)
    expect((await patch({ uid: 'P1', permisos: { aceptar_citas: 'sí' }, motivo: MOTIVO })).status).toBe(400)
    expect((await patch({ uid: 'P1', permisos: ['aceptar_citas'], motivo: MOTIVO })).status).toBe(400)
    expect((await patch({ uid: 'P1', permisos: null, motivo: MOTIVO })).status).toBe(400)
    expect(mundo.updates).toHaveLength(0)
  })

  it('el cambio de permisos va aparte de rol y estado (400 si se mezclan)', async () => {
    expect((await patch({ uid: 'P1', permisos: { recibir_citas: true }, rol: 'cliente', motivo: MOTIVO })).status).toBe(400)
    expect((await patch({ uid: 'P1', tipo_publicador: 'asociado', estado: 'suspendido', motivo: MOTIVO })).status).toBe(400)
    expect(mundo.updates).toHaveLength(0)
  })
})

// ── Motivo ─────────────────────────────────────────────────────

describe('el motivo es obligatorio (mínimo 10 caracteres)', () => {
  for (const [nombre, motivo] of [['ausente', undefined], ['vacío', ''], ['sólo espacios', '          '], ['de 9 caracteres', '123456789'], ['de 9 con espacios alrededor', '   123456789   ']] as const) {
    it(`motivo ${nombre}: 400, nada se escribe, nada se audita`, async () => {
      const r = await patch({ uid: 'P1', tipo_publicador: 'asociado', ...(motivo === undefined ? {} : { motivo }) })
      expect(r.status).toBe(400)
      expect(fila('P1').tipo_publicador).toBe('publicador')
      expect(mundo.updates).toHaveLength(0)
      expect(mundo.auditoria).toHaveLength(0)
    })
  }

  it('motivo de exactamente 10 caracteres: pasa', async () => {
    expect((await patch({ uid: 'P1', tipo_publicador: 'asociado', motivo: '1234567890' })).status).toBe(200)
  })

  it('un motivo que no es texto no cuenta', async () => {
    expect((await patch({ uid: 'P1', tipo_publicador: 'asociado', motivo: { x: 'abcdefghijklm' } })).status).toBe(400)
    expect((await patch({ uid: 'P1', tipo_publicador: 'asociado', motivo: 12345678901234 })).status).toBe(400)
  })
})

// ── Autoescalamiento, IDOR, rol ────────────────────────────────

describe('seguridad: nadie se da permisos ni toca lo que no debe', () => {
  it('un admin no cambia SUS PROPIOS permisos (400), ni siendo publicador a la vez', async () => {
    mundo.usuarios.push(usuario('ADM2', 'publicador', { tipo_publicador: 'publicador', permisos_override: {} }))
    mundo.sesion = { uid: 'ADM2', email: 'adm2@ejemplo.test', fila: { rol: 'admin', estado: 'activo' } }
    expect((await patch({ uid: 'ADM2', tipo_publicador: 'asociado', motivo: MOTIVO })).status).toBe(400)
    expect(mundo.updates).toHaveLength(0)
  })

  it('un publicador que llama a la API de permisos sobre sí mismo: 403 y queda en la bitácora de seguridad', async () => {
    comoSesion('P1', 'publicador')
    const r = await patch({ uid: 'P1', tipo_publicador: 'asociado', permisos: { publicar_sin_revision: true, ver_datos_interesado: true }, motivo: MOTIVO })
    expect(r.status).toBe(403)
    expect(fila('P1').tipo_publicador).toBe('publicador')
    expect(fila('P1').permisos_override).toEqual({})
  })

  it('un publicador no modifica a OTRO usuario por la API directa (IDOR por uid): 403', async () => {
    comoSesion('P1', 'publicador')
    expect((await patch({ uid: 'P2', permisos: { mostrar_telefono: false }, motivo: MOTIVO })).status).toBe(403)
    expect((await patch({ uid: 'CLI', tipo_publicador: 'asociado', motivo: MOTIVO })).status).toBe(403)
    expect(mundo.updates).toHaveLength(0)
  })

  it('un publicador no se eleva por su propio perfil: /api/usuarios/me ignora modalidad, permisos y rol', async () => {
    comoSesion('P1', 'publicador')
    const r = await guardarPerfil(R('/api/usuarios/me', 'PATCH', { nombre: 'Ana', tipo_publicador: 'asociado', permisos_override: { publicar_sin_revision: true }, permisos: { ver_datos_interesado: true } }))
    for (const u of mundo.updates) {
      expect(u.cambios).not.toHaveProperty('tipo_publicador')
      expect(u.cambios).not.toHaveProperty('permisos_override')
    }
    expect(fila('P1').tipo_publicador).toBe('publicador')
    expect(fila('P1').permisos_override).toEqual({})
    void r
  })

  it('no se le ponen permisos a un cliente ni a un admin (409): primero el rol, que es otra operación', async () => {
    expect((await patch({ uid: 'CLI', tipo_publicador: 'asociado', motivo: MOTIVO })).status).toBe(409)
    expect((await patch({ uid: 'SUP', permisos: { recibir_citas: true }, motivo: MOTIVO })).status).toBe(409)
    expect(fila('CLI').tipo_publicador).toBe('publicador')
  })

  it('un uid que no existe: 404; sin uid: 400', async () => {
    expect((await patch({ uid: 'FANTASMA', tipo_publicador: 'asociado', motivo: MOTIVO })).status).toBe(404)
    expect((await patch({ tipo_publicador: 'asociado', motivo: MOTIVO })).status).toBe(400)
    expect((await patch({ uid: 12345, tipo_publicador: 'asociado', motivo: MOTIVO })).status).toBe(400)
  })

  it('un admin (no super) NO puede dar el rol de admin: 403; un super admin sí, con motivo', async () => {
    expect((await patch({ uid: 'P1', rol: 'admin', motivo: 'Lo quiero como administrador' })).status).toBe(403)
    expect(fila('P1').rol).toBe('publicador')
    comoSesion('SUP', 'super_admin')
    expect((await patch({ uid: 'P1', rol: 'admin', motivo: 'Lo quiero como administrador' })).status).toBe(200)
  })

  it('un admin sí puede pasar a alguien de cliente a publicador y de vuelta (cambio de rol permitido) y queda auditado', async () => {
    expect((await patch({ uid: 'CLI', rol: 'publicador' })).status).toBe(200)
    expect(fila('CLI').rol).toBe('publicador')
    const a = mundo.auditoria.at(-1) as { antes: Fila; despues: Fila }
    expect(a.antes).toMatchObject({ rol: 'cliente' })
    expect(a.despues).toMatchObject({ rol: 'publicador' })
  })

  it('un cliente o un publicador no cambian roles: 403', async () => {
    for (const [uid, rol] of [['CLI', 'cliente'], ['P1', 'publicador']] as const) {
      comoSesion(uid, rol)
      expect((await patch({ uid: 'P2', rol: 'cliente' })).status).toBe(403)
    }
    expect(fila('P2').rol).toBe('publicador')
  })

  it('el cuerpo no puede inventar quién actúa: `actor`, `actor_uid` y `superAdmin` del body no cuentan', async () => {
    comoSesion('P1', 'publicador')
    const r = await patch({ uid: 'P1', tipo_publicador: 'asociado', motivo: MOTIVO, actor: 'ADM', actor_uid: 'ADM', superAdmin: true, rol_actor: 'admin' })
    expect(r.status).toBe(403)
  })
})

// ── Auditoría obligatoria ─────────────────────────────────────

describe('sin huella no hay cambio', () => {
  it('cambio y bitácora van en UNA sola operación atómica: si falla (p. ej. la bitácora) 503 y NO queda nada', async () => {
    mundo.rpcFalla = true
    const antes = JSON.stringify([fila('P2').tipo_publicador, fila('P2').permisos_override])
    const r = await patch({ uid: 'P2', tipo_publicador: 'publicador', permisos: { recibir_citas: true }, motivo: 'Cambio que no debe quedar sin huella' })
    expect(r.status).toBe(503)
    expect(JSON.stringify([fila('P2').tipo_publicador, fila('P2').permisos_override])).toBe(antes)
    expect(mundo.auditoria).toHaveLength(0)
    expect(mundo.updates).toHaveLength(0) // ni un update suelto que haya que «deshacer» después
  })

  it('la ruta NO actualiza la cuenta por separado: sólo llama a la función transaccional (una llamada)', async () => {
    await patch({ uid: 'P1', tipo_publicador: 'asociado', motivo: MOTIVO })
    expect(mundo.rpcLlamadas).toHaveLength(1)
    expect(mundo.rpcLlamadas[0].fn).toBe('usuario_cambiar_permisos')
    // todo lo escrito pasó por la función, que lo escribe junto con su bitácora
    expect(mundo.updates).toHaveLength(1)
    expect(mundo.auditoria).toHaveLength(1)
  })

  it('concurrencia: si otro administrador cambió la cuenta mientras se editaba, 409 y no se pisa nada', async () => {
    const antes = JSON.stringify([fila('P1').tipo_publicador, fila('P1').permisos_override])
    mundo.conflictoForzado = true
    const r = await patch({ uid: 'P1', tipo_publicador: 'asociado', motivo: MOTIVO })
    expect(r.status).toBe(409)
    expect((await r.json()).codigo).toBe('conflicto')
    expect(JSON.stringify([fila('P1').tipo_publicador, fila('P1').permisos_override])).toBe(antes)
    expect(mundo.auditoria).toHaveLength(0)
  })

  it('concurrencia real: dos cambios seguidos sobre lo mismo leído — el segundo, con lo que ya cambió, da conflicto', async () => {
    // El primero cambia P1; un segundo PATCH que ya no coincide con lo guardado no se aplica.
    expect((await patch({ uid: 'P1', tipo_publicador: 'asociado', motivo: MOTIVO })).status).toBe(200)
    const llamada = mundo.rpcLlamadas[0].args
    // se reenvía EXACTAMENTE la misma llamada con el «antes» ya viejo
    const { supabaseAdmin } = await import('../src/lib/auth-server')
    const r = await supabaseAdmin().rpc('usuario_cambiar_permisos', llamada) as { data: { resultado: string } }
    expect(r.data.resultado).toBe('conflicto')
    expect(mundo.auditoria).toHaveLength(1) // el segundo no dejó huella ni cambió nada
  })

  it('la ruta manda a la función lo guardado TAL CUAL (crudo), para que una basura previa en el JSON no cause conflictos falsos', async () => {
    mundo.usuarios.find((u) => u.uid === 'P1')!.permisos_override = { poder_inventado: true, recibir_citas: true }
    const r = await patch({ uid: 'P1', permisos: { mostrar_foto: true }, motivo: 'Habilitar la foto del perfil' })
    expect(r.status).toBe(200)
    expect(mundo.rpcLlamadas[0].args.p_antes_overrides).toEqual({ poder_inventado: true, recibir_citas: true })
    expect(mundo.rpcLlamadas[0].args.p_overrides).toEqual({ recibir_citas: true, mostrar_foto: true }) // la basura no se propaga
  })

  it('con la función de la migración 28 ausente: 503 con el mensaje de la migración, nada cambia', async () => {
    mundo.sinFuncion = true
    const r = await patch({ uid: 'P1', tipo_publicador: 'asociado', motivo: MOTIVO })
    expect(r.status).toBe(503)
    expect((await r.json()).error).toMatch(/migración 28/)
    expect(fila('P1').tipo_publicador).toBe('publicador')
    expect(mundo.auditoria).toHaveLength(0)
  })

  it('cada cambio aceptado deja EXACTAMENTE una fila de bitácora con actor, afectado, antes, después y motivo', async () => {
    await patch({ uid: 'P1', permisos: { ver_datos_interesado: true }, motivo: 'Necesita atender sin intermediarios' })
    expect(mundo.auditoria).toHaveLength(1)
    const a = mundo.auditoria[0] as { actor: { uid: string }; entidadId: string; antes: Fila; despues: Fila }
    expect(a.actor.uid).toBe('ADM')
    expect(a.entidadId).toBe('P1')
    expect(a.antes.permisos_override).toEqual({})
    expect(a.despues.permisos_override).toEqual({ ver_datos_interesado: true })
    expect(a.despues.motivo).toBe('Necesita atender sin intermediarios')
  })

  it('un cambio rechazado (403, 400, 404, 409) NO deja fila de bitácora de cambio', async () => {
    await patch({ uid: 'P1', tipo_publicador: 'asociado', motivo: 'corto' })
    await patch({ uid: 'NOPE', tipo_publicador: 'asociado', motivo: MOTIVO })
    await patch({ uid: 'CLI', tipo_publicador: 'asociado', motivo: MOTIVO })
    expect(mundo.auditoria).toHaveLength(0)
  })

  it('con la migración 28 sin aplicar: 503, nada escrito, nada auditado (falla cerrado)', async () => {
    mundo.sinMigracion28 = true
    const r = await patch({ uid: 'P1', tipo_publicador: 'asociado', motivo: MOTIVO })
    expect(r.status).toBe(503)
    expect(mundo.updates).toHaveLength(0)
    expect(mundo.auditoria).toHaveLength(0)
  })
})

// ── Capacidades: citas, perfil y contacto ─────────────────────

describe('capacidades efectivas desde la administración', () => {
  const efectivos = async (uid: string) => (await (await detalle(R(`/api/admin/usuarios/${uid}`), ctx(uid))).json()).permisos.efectivos as Record<string, boolean>

  it('citas: apagar «recibir citas» apaga las otras cuatro aunque sus overrides sigan encendidos', async () => {
    await patch({ uid: 'P2', permisos: { recibir_citas: false }, motivo: 'Deja de atender citas por ahora' })
    const e = await efectivos('P2')
    for (const c of ['recibir_citas', 'aceptar_citas', 'rechazar_citas', 'reprogramar_citas', 'cancelar_citas']) expect(e[c], c).toBe(false)
  })

  it('citas: las cinco acciones se encienden y apagan una por una', async () => {
    await patch({ uid: 'P2', permisos: { cancelar_citas: false, reprogramar_citas: false }, motivo: 'Sólo acepta o rechaza solicitudes' })
    const e = await efectivos('P2')
    expect(e.aceptar_citas).toBe(true)
    expect(e.rechazar_citas).toBe(true)
    expect(e.cancelar_citas).toBe(false)
    expect(e.reprogramar_citas).toBe(false)
  })

  it('datos del interesado: independiente de las citas, apagado por defecto en AMBAS modalidades', async () => {
    expect((await efectivos('P1')).ver_datos_interesado).toBe(false)
    expect((await efectivos('P2')).ver_datos_interesado).toBe(false)
    await patch({ uid: 'P2', permisos: { ver_datos_interesado: true }, motivo: 'Atiende a sus propios clientes' })
    const e = await efectivos('P2')
    expect(e.ver_datos_interesado).toBe(true)
    expect(e.recibir_citas).toBe(true) // lo demás no se movió
  })

  it('identidad y contacto se administran POR SEPARADO: mostrar teléfono no muestra nombre, ni al revés', async () => {
    // P2 (asociado): nombre y perfil sí, teléfono sí por override. Se quita sólo el nombre.
    await patch({ uid: 'P2', permisos: { mostrar_nombre: false }, motivo: 'Prefiere no aparecer con su nombre' })
    let e = await efectivos('P2')
    expect(e.mostrar_nombre).toBe(false)
    expect(e.mostrar_telefono).toBe(true) // el contacto no se movió
    // Y a un publicador normal se le habilita sólo el WhatsApp: no se enciende ninguna identidad.
    await patch({ uid: 'P1', permisos: { mostrar_whatsapp: true }, motivo: 'Su WhatsApp es el canal de contacto' })
    e = await efectivos('P1')
    expect(e.mostrar_whatsapp).toBe(true)
    for (const c of ['mostrar_perfil', 'mostrar_nombre', 'mostrar_foto', 'mostrar_telefono', 'mostrar_email']) expect(e[c], c).toBe(false)
  })

  it('no se expone nada por defecto: un publicador normal recién creado no muestra identidad ni contacto', async () => {
    const e = await efectivos('P1')
    for (const c of ['mostrar_perfil', 'mostrar_nombre', 'mostrar_foto', 'mostrar_telefono', 'mostrar_whatsapp', 'mostrar_email']) expect(e[c], c).toBe(false)
  })

  it('publicación: «publicar sin revisión» y «corregir lo publicado» son dos permisos distintos', async () => {
    await patch({ uid: 'P1', permisos: { publicar_sin_revision: true }, motivo: 'Publica con confianza, sin revisar' })
    const e = await efectivos('P1')
    expect(e.publicar_sin_revision).toBe(true)
    expect(e.editar_publicadas).toBe(false)
  })
})

// ── Piezas puras de la pantalla ────────────────────────────────

describe('la pantalla enseña tres capas, y todo permiso real tiene su fila', () => {
  it('toda capacidad del catálogo tiene ficha y grupo, y aparece en UN solo grupo', () => {
    const vistas: string[] = []
    for (const g of ORDEN_DE_GRUPOS) {
      expect(GRUPOS[g].titulo).toBeTruthy()
      for (const c of capacidadesDelGrupo(g)) vistas.push(c)
    }
    expect([...vistas].sort()).toEqual([...CAPACIDADES].sort())
    expect(new Set(vistas).size).toBe(vistas.length)
    for (const c of CAPACIDADES) {
      expect(FICHAS[c].etiqueta.length, c).toBeGreaterThan(3)
      expect(FICHAS[c].descripcion.length, c).toBeGreaterThan(10)
    }
  })

  it('NO se inventan capacidades: no existe «contacto_publico» y la pantalla sólo conoce las del catálogo', () => {
    expect(CAPACIDADES).not.toContain('contacto_publico' as never)
    expect(Object.keys(FICHAS).sort()).toEqual([...CAPACIDADES].sort())
  })

  it('identidad y contacto son grupos distintos', () => {
    expect(capacidadesDelGrupo('identidad')).toEqual(['mostrar_perfil', 'mostrar_nombre', 'mostrar_foto'])
    expect(capacidadesDelGrupo('contacto')).toEqual(['mostrar_telefono', 'mostrar_whatsapp', 'mostrar_email'])
  })

  it('los datos personales están marcados como sensibles', () => {
    const sensibles = CAPACIDADES.filter((c) => FICHAS[c].sensible).sort()
    expect(sensibles).toEqual(['mostrar_email', 'mostrar_telefono', 'mostrar_whatsapp', 'ver_datos_interesado'])
  })

  it('lo que hoy no tiene efecto se dice en la ficha y no se promete (las demás sí tienen efecto hoy)', () => {
    const sin = CAPACIDADES.filter((c) => FICHAS[c].sinEfectoHoy).sort()
    expect(sin).toEqual(['mostrar_email', 'mostrar_foto', 'mostrar_telefono', 'mostrar_whatsapp', 'recibir_solicitudes', 'sin_comision'])
  })

  it('filaDePermiso separa default, override y efectivo', () => {
    const f = filaDePermiso('asociado', { publicar_sin_revision: false, mostrar_telefono: true }, 'publicar_sin_revision')
    expect(f).toMatchObject({ defecto: true, override: false, efectivo: false })
    const g = filaDePermiso('asociado', { mostrar_telefono: true }, 'mostrar_telefono')
    expect(g).toMatchObject({ defecto: false, override: true, efectivo: true })
    const h = filaDePermiso('publicador', {}, 'aceptar_citas')
    expect(h).toMatchObject({ defecto: false, override: null, efectivo: false })
  })

  it('filaDePermiso explica por qué una acción de cita está apagada aunque se haya pedido encendida', () => {
    const f = filaDePermiso('publicador', { aceptar_citas: true }, 'aceptar_citas')
    expect(f).toMatchObject({ override: true, efectivo: false, bloqueadaPor: 'recibir_citas' })
    expect(filaDePermiso('publicador', { aceptar_citas: true, recibir_citas: true }, 'aceptar_citas')).toMatchObject({ efectivo: true, bloqueadaPor: null })
  })

  it('cambiosEfectivos enseña antes → después sólo de lo que de verdad cambia', () => {
    const c = cambiosEfectivos({ tipo: 'publicador', overrides: {} }, { tipo: 'asociado', overrides: {} })
    expect(c.map((x) => x.capacidad)).toContain('publicar_sin_revision')
    expect(c.every((x) => x.de !== x.a)).toBe(true)
    expect(cambiosEfectivos({ tipo: 'publicador', overrides: {} }, { tipo: 'publicador', overrides: { recibir_solicitudes: true } })).toEqual([])
  })

  it('cuerpoDePermisos manda sólo lo que cambió y usa null para volver al default', () => {
    const deseados = Object.fromEntries(CAPACIDADES.map((c) => [c, null])) as Record<(typeof CAPACIDADES)[number], boolean | null>
    deseados.mostrar_telefono = true // ya lo tenía: no se manda
    deseados.recibir_citas = true // nuevo
    // `mostrar_foto` tenía override y se pide volver al default → null
    const cuerpo = cuerpoDePermisos({ mostrar_telefono: true, mostrar_foto: false }, deseados)
    expect(cuerpo).toEqual({ recibir_citas: true, mostrar_foto: null })
  })

  it('compactarOverrides y mismosOverrides', () => {
    expect(compactarOverrides('asociado', { publicar_sin_revision: true, mostrar_telefono: true })).toEqual({ mostrar_telefono: true })
    expect(compactarOverrides('publicador', { publicar_sin_revision: true })).toEqual({ publicar_sin_revision: true })
    expect(compactarOverrides('premium', { recibir_solicitudes: true, x: true })).toEqual({})
    expect(mismosOverrides({ a: 1, mostrar_foto: true }, { mostrar_foto: true })).toBe(true)
    expect(mismosOverrides({ mostrar_foto: true }, { mostrar_foto: false })).toBe(false)
    expect(mismosOverrides({}, { mostrar_foto: true })).toBe(false)
  })

  it('la pantalla no repite la tabla de defaults: se leen de DEFAULTS_POR_TIPO (una sola fuente)', () => {
    for (const t of ['publicador', 'asociado'] as const) {
      for (const c of CAPACIDADES) expect(filaDePermiso(t, {}, c).defecto).toBe(DEFAULTS_POR_TIPO[t][c])
    }
    expect(ETIQUETA_TIPO).toEqual({ publicador: 'Publicador', asociado: 'Asociado' })
  })
})

describe('la autorización nunca depende del nombre de la modalidad', () => {
  const archivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n)
      return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
    })

  it('ningún archivo de src compara la modalidad con «asociado» (se autoriza con tieneCapacidad / capacidadesEfectivas)', () => {
    const culpables = archivos(path.join(__dirname, '..', 'src')).filter((f) => /(===|!==|==|!=)\s*['"]asociado['"]|['"]asociado['"]\s*(===|!==)/.test(readFileSync(f, 'utf8')))
    expect(culpables).toEqual([])
  })

  it('la pantalla de administración no decide nada por su cuenta: sólo llama a la API y pinta lo que el servidor calcula', () => {
    const ui = readFileSync(path.join(__dirname, '..', 'src/components/admin/usuarios/PermisosPublicador.tsx'), 'utf8')
    expect(ui).toContain("'/api/admin/usuarios'")
    expect(ui).not.toMatch(/tieneCapacidad|atiendeCitas|puedeActuarEnCita/)
  })
})

// ── Contrato pantalla ↔ API ───────────────────────────────────

describe('lo que la pantalla manda es lo que la ruta REAL entiende', () => {
  type Cap = (typeof CAPACIDADES)[number]
  const sinDeseos = () => Object.fromEntries(CAPACIDADES.map((c) => [c, null])) as Record<Cap, boolean | null>
  const mandar = (o: { uid: string; tipoInicial: 'publicador' | 'asociado'; tipo: 'publicador' | 'asociado'; ov: Record<string, boolean>; deseados: Record<Cap, boolean | null>; motivo?: string }) =>
    patch(cuerpoDeGuardado({ uid: o.uid, motivo: o.motivo ?? '  Ajuste pedido por la dirección  ', tipoInicial: o.tipoInicial, tipo: o.tipo, overridesIniciales: o.ov, deseados: o.deseados }))

  it('el cuerpo trae sólo uid, motivo (recortado) y lo que cambió: nada de rol, estado ni capacidades calculadas', () => {
    const d = sinDeseos(); d.aceptar_citas = true
    const b = cuerpoDeGuardado({ uid: 'P1', motivo: '  Ajuste pedido por la dirección  ', tipoInicial: 'publicador', tipo: 'asociado', overridesIniciales: {}, deseados: d })
    expect(Object.keys(b).sort()).toEqual(['motivo', 'permisos', 'tipo_publicador', 'uid'])
    expect(b.motivo).toBe('Ajuste pedido por la dirección')
    expect(b.permisos).toEqual({ aceptar_citas: true })
    expect(cuerpoDeGuardado({ uid: 'P1', motivo: 'x'.repeat(10), tipoInicial: 'publicador', tipo: 'publicador', overridesIniciales: {}, deseados: sinDeseos() })).toEqual({ uid: 'P1', motivo: 'x'.repeat(10) })
  })

  it('cambiar sólo la modalidad: la ruta lo acepta y el servidor calcula los efectivos', async () => {
    const r = await mandar({ uid: 'P1', tipoInicial: 'publicador', tipo: 'asociado', ov: {}, deseados: sinDeseos() })
    expect(r.status).toBe(200)
    expect(fila('P1').tipo_publicador).toBe('asociado')
    const j = await (await detalle(R('/api/admin/usuarios/P1'), ctx('P1'))).json()
    expect(j.permisos.efectivos.publicar_sin_revision).toBe(true)
  })

  it('un override encendido y otro devuelto al default (null) se aplican como la pantalla los pidió', async () => {
    const d = sinDeseos(); d.ver_datos_interesado = true; d.mostrar_telefono = null // P2 ya tenía mostrar_telefono: true → se pide volver al default
    const r = await mandar({ uid: 'P2', tipoInicial: 'asociado', tipo: 'asociado', ov: { mostrar_telefono: true }, deseados: d })
    expect(r.status).toBe(200)
    expect(fila('P2').permisos_override).toEqual({ ver_datos_interesado: true })
  })

  it('modalidad y override a la vez, con un override que la nueva modalidad vuelve redundante', async () => {
    const d = sinDeseos(); d.publicar_sin_revision = true // al pasar a asociado ya es true por defecto
    const r = await mandar({ uid: 'P1', tipoInicial: 'publicador', tipo: 'asociado', ov: {}, deseados: d })
    expect(r.status).toBe(200)
    expect(fila('P1').permisos_override).toEqual({}) // no se guarda la redundancia
  })

  it('sin ningún cambio la pantalla ni siquiera permite enviar; si se enviara, la ruta contesta 400', async () => {
    const r = await mandar({ uid: 'P1', tipoInicial: 'publicador', tipo: 'publicador', ov: {}, deseados: sinDeseos() })
    expect(r.status).toBe(400)
  })

  it('el motivo se manda recortado y la ruta lo guarda recortado en la bitácora', async () => {
    await mandar({ uid: 'P1', tipoInicial: 'publicador', tipo: 'asociado', ov: {}, deseados: sinDeseos(), motivo: '   Alta por acuerdo firmado   ' })
    expect((mundo.auditoria[0] as { despues: { motivo: string } }).despues.motivo).toBe('Alta por acuerdo firmado')
  })
})

describe('el servidor de prueba de la vista previa no se desvía de la ruta real', () => {
  const fijo = servidorDePrueba('normal', 'ok')
  const enFijo = async (cuerpo: Record<string, unknown>) => {
    try { await fijo('/api/admin/usuarios', { method: 'PATCH', body: JSON.stringify(cuerpo) }); return 200 } catch (e) { return (e as { estado: number }).estado }
  }
  const M = 'Motivo suficientemente largo'
  const escenarios: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ['motivo corto', { uid: 'P1', tipo_publicador: 'asociado', motivo: 'corto' }, { uid: 'p-ana', tipo_publicador: 'asociado', motivo: 'corto' }],
    ['sin motivo', { uid: 'P1', tipo_publicador: 'asociado' }, { uid: 'p-ana', tipo_publicador: 'asociado' }],
    ['modalidad inválida', { uid: 'P1', tipo_publicador: 'premium', motivo: M }, { uid: 'p-ana', tipo_publicador: 'premium', motivo: M }],
    ['permiso desconocido', { uid: 'P1', permisos: { poder_total: true }, motivo: M }, { uid: 'p-ana', permisos: { poder_total: true }, motivo: M }],
    ['sin cambios', { uid: 'P1', tipo_publicador: 'publicador', motivo: M }, { uid: 'p-ana', tipo_publicador: 'publicador', motivo: M }],
    ['override redundante', { uid: 'P1', permisos: { recibir_solicitudes: true }, motivo: M }, { uid: 'p-ana', permisos: { recibir_solicitudes: true }, motivo: M }],
    ['cuenta de cliente', { uid: 'CLI', tipo_publicador: 'asociado', motivo: M }, { uid: 'c-cora', tipo_publicador: 'asociado', motivo: M }],
    ['uid inexistente', { uid: 'NOPE', tipo_publicador: 'asociado', motivo: M }, { uid: 'NOPE', tipo_publicador: 'asociado', motivo: M }],
    ['cambio válido', { uid: 'P1', tipo_publicador: 'asociado', motivo: M }, { uid: 'p-ana', tipo_publicador: 'asociado', motivo: M }],
  ]
  for (const [nombre, real, prueba] of escenarios) {
    it(`${nombre}: misma respuesta en la ruta real y en la vista previa`, async () => {
      const esperado = (await patch(real)).status
      expect(await enFijo(prueba), nombre).toBe(esperado)
    })
  }

  it('la propia cuenta: 400 en las dos', async () => {
    mundo.usuarios.find((u) => u.uid === 'ADM')!.rol = 'publicador' // aunque fuera publicador, no puede editarse
    expect((await patch({ uid: 'ADM', tipo_publicador: 'asociado', motivo: M })).status).toBe(400)
    expect(await enFijo({ uid: 'a-yo', tipo_publicador: 'asociado', motivo: M })).toBe(400)
  })

  it('en la vista previa los permisos efectivos salen de la misma función que usa el servidor', async () => {
    const r = await fijo('/api/admin/usuarios/p-beto') as { permisos: { efectivos: Record<string, boolean>; tipoPublicador: string; overrides: Record<string, boolean> } }
    expect(r.permisos.efectivos).toEqual(capacidadesEfectivas({ rol: 'publicador', tipo: r.permisos.tipoPublicador, overrides: r.permisos.overrides }))
  })

  it('la vista previa sólo existe con `next dev`: en producción y en Vercel responde 404', () => {
    for (const f of ['src/app/vista-previa/admin/usuarios/page.tsx', 'src/app/vista-previa/admin/usuarios/[uid]/page.tsx']) {
      const t = readFileSync(path.join(__dirname, '..', f), 'utf8')
      expect(t, f).toMatch(/if \(!vistaPreviaPermitida\(\)\) notFound\(\)/)
    }
  })

  it('los enlaces del panel real no sacan de la vista previa (si no, pediría datos reales con tu sesión)', () => {
    const t = readFileSync(path.join(__dirname, '..', 'src/components/admin/VistaPreviaAdmin.tsx'), 'utf8')
    expect(t).toMatch(/startsWith\('\/admin'\)/)
    expect(t).toMatch(/startsWith\('\/api'\)/)
    expect(t).toMatch(/e\.preventDefault\(\)/)
    expect(t).toMatch(/router\.push\(`\/vista-previa\$\{href\}\$\{window\.location\.search\}`\)/)
  })

  it('la ficha vive bajo /admin: sin permiso, el marco del panel no pinta la pantalla ni pide nada', () => {
    const shell = readFileSync(path.join(__dirname, '..', 'src/components/admin/AdminShell.tsx'), 'utf8')
    expect(shell).toMatch(/estado === 'sin-permiso'/)
    // los hijos (la pantalla) sólo se pintan en la rama final, ya con sesión y permiso `panel.admin`
    expect(shell.indexOf('{children}')).toBeGreaterThan(shell.indexOf("'sin-permiso'"))
    expect(shell).toMatch(/puede\([^)]*'panel\.admin'\)/)
  })
})

// ── SUPER_ADMIN: rol y estado, en una sola operación atómica ──

describe('dar y quitar roles / suspender: una operación atómica con huella (D-49)', () => {
  const MOT = 'Entra al equipo de atención'

  it('el cambio de rol pasa por la función transaccional (una sola llamada) con el «antes» leído y la huella completa', async () => {
    comoSesion('SUP', 'super_admin')
    expect((await patch({ uid: 'P1', rol: 'admin', motivo: MOT })).status).toBe(200)
    expect(mundo.rpcLlamadas).toHaveLength(1)
    const a = mundo.rpcLlamadas[0].args as { p_uid: string; p_antes_rol: string; p_antes_estado: string; p_rol: string; p_estado: unknown; p_audit: { actor_uid: string; accion: string; antes: Record<string, unknown>; despues: Record<string, unknown> } }
    expect(mundo.rpcLlamadas[0].fn).toBe('usuario_cambiar_rol_estado')
    expect(a).toMatchObject({ p_uid: 'P1', p_antes_rol: 'publicador', p_antes_estado: 'activo', p_rol: 'admin', p_estado: null })
    expect(a.p_audit).toMatchObject({ actor_uid: 'SUP', accion: 'usuario.editar' })
    expect(a.p_audit.antes).toMatchObject({ rol: 'publicador', estado: 'activo', objetivo: { uid: 'P1' } })
    expect(a.p_audit.despues).toMatchObject({ rol: 'admin', motivo: MOT })
    expect(fila('P1').rol).toBe('admin')
  })

  it('la ruta NO hace update por su cuenta ni usa la bitácora «sin garantía»: todo pasa por la función', () => {
    const t = readFileSync(path.join(__dirname, '..', 'src/app/api/admin/usuarios/route.ts'), 'utf8')
    expect(t).not.toMatch(/\.from\('usuarios'\)\s*\.update/)
    expect(t).not.toMatch(/import \{ registrar/)
    expect(t).toContain("rpc('usuario_cambiar_rol_estado'")
  })

  it('suspender y reactivar también pasan por la función y quedan auditados', async () => {
    expect((await patch({ uid: 'CLI', estado: 'suspendido' })).status).toBe(200)
    expect(fila('CLI').estado).toBe('suspendido')
    expect((mundo.auditoria[0] as { despues: { estado: string } }).despues.estado).toBe('suspendido')
    expect((await patch({ uid: 'CLI', estado: 'activo' })).status).toBe(200)
    expect(mundo.auditoria).toHaveLength(2)
  })

  it('si la función falla (p. ej. la bitácora): 503 y NO queda ningún cambio', async () => {
    comoSesion('SUP', 'super_admin')
    mundo.rpcFalla = true
    const r = await patch({ uid: 'P1', rol: 'admin', motivo: MOT })
    expect(r.status).toBe(503)
    expect(fila('P1').rol).toBe('publicador')
    expect(mundo.auditoria).toHaveLength(0)
  })

  it('con la migración 31 sin aplicar: 503 con el mensaje de la migración, y nada cambia', async () => {
    mundo.sinFuncion = true
    const r = await patch({ uid: 'CLI', estado: 'suspendido' })
    expect(r.status).toBe(503)
    expect((await r.json()).error).toMatch(/migración 31/)
    expect(fila('CLI').estado).toBe('activo')
  })

  it('CONCURRENCIA: si otro cambió la cuenta mientras se editaba, 409 `conflicto` y no se pisa nada', async () => {
    mundo.conflictoForzado = true
    const r = await patch({ uid: 'CLI', estado: 'suspendido' })
    expect(r.status).toBe(409)
    expect((await r.json()).codigo).toBe('conflicto')
    expect(fila('CLI').estado).toBe('activo')
    expect(mundo.auditoria).toHaveLength(0)
  })

  it('el candado del último Super Admin se traduce a 409 y no deja cambio ni huella', async () => {
    comoSesion('SUP', 'super_admin')
    mundo.usuarios.push(usuario('SUP2', 'super_admin'))
    mundo.ultimoSuper = true
    const r = await patch({ uid: 'SUP2', rol: 'admin', motivo: 'Intento de degradar al último' })
    expect(r.status).toBe(409)
    expect(fila('SUP2').rol).toBe('super_admin')
    expect(mundo.auditoria).toHaveLength(0)
  })

  it('dar el rol de admin sin motivo (o con motivo corto) lo rechaza la API antes de llamar a la base', async () => {
    comoSesion('SUP', 'super_admin')
    expect((await patch({ uid: 'P1', rol: 'admin' })).status).toBe(400)
    expect((await patch({ uid: 'P1', rol: 'admin', motivo: 'corto' })).status).toBe(400)
    expect(mundo.rpcLlamadas).toHaveLength(0)
  })
})
