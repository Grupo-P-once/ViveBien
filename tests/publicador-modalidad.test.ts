import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PUBLICADOR / ASOCIADO — modalidad + permisos por usuario (ADR-0013).
 *
 * El rol de seguridad es uno (`publicador`); la modalidad (`publicador` |
 * `asociado`) sólo pone los valores por defecto, y el admin puede encender o
 * apagar cada capacidad por usuario. El perfil se calcula con el código REAL
 * (`resolverPerfil`): estas pruebas no imitan la regla, la recorren.
 */

const mundo = vi.hoisted(() => ({
  sesion: { uid: 'A', email: 'a@ejemplo.test', fila: { rol: 'publicador', estado: 'activo' } as Record<string, unknown> },
  usuarios: [] as Array<Record<string, unknown>>,
  props: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ tabla: string; filtros: Array<[string, unknown]>; cambios: Record<string, unknown> }>,
  auditoria: [] as Array<Record<string, unknown>>,
  sinMigracion28: false,
}))

const COMPLETA = {
  titulo: 'Casa en León', descripcion: 'Una casa muy bonita con jardín amplio.', ubicacion: 'León, Gto.',
  precio: 2_500_000, tipo: 'casa', operacion: 'venta', metros: 180,
  fotos: ['1', '2', '3', '4', '5', '6', '7', '8'].map((n) => `https://res.cloudinary.com/x/${n}.jpg`),
}
const propiedad = (id: string, owner: string, estado: string) => ({ id, owner_id: owner, estado_pub: estado, estatus: 'disponible', ...COMPLETA })

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const cadena = (tabla: string) => {
    const filtros: Array<[string, unknown]> = []
    let columnas = '*'
    let cambios: Record<string, unknown> | null = null
    const c: Record<string, unknown> = {}
    const filas = () => (tabla === 'propiedades' ? mundo.props : tabla === 'usuarios' ? mundo.usuarios : [])
      .filter((f) => filtros.every(([k, v]) => f[k] === v))
    c.select = (cols?: string) => { if (cols) columnas = cols; return c }
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    c.order = () => c
    c.update = (f: Record<string, unknown>) => { cambios = f; return c }
    c.upsert = async (f: Record<string, unknown>) => {
      mundo.updates.push({ tabla, filtros: [], cambios: f })
      const fila = mundo.usuarios.find((u) => u.uid === f.uid)
      if (tabla === 'usuarios' && fila) Object.assign(fila, f)
      return { error: null }
    }
    c.maybeSingle = async () => {
      if (mundo.sinMigracion28 && /tipo_publicador|permisos_override/.test(columnas)) {
        return { data: null, error: { message: 'column usuarios.tipo_publicador does not exist' } }
      }
      return { data: filas()[0] ?? null, error: null }
    }
    c.then = (r: (v: unknown) => unknown) => {
      if (cambios) {
        mundo.updates.push({ tabla, filtros: [...filtros], cambios })
        // PostgREST evalúa el filtro ANTES de escribir y devuelve las filas afectadas (así se detecta 0 filas = conflicto).
        const afectadas = filas()
        for (const f of afectadas) Object.assign(f, cambios)
        return r({ data: afectadas, error: null })
      }
      return r({ data: filas(), error: null, count: 1 })
    }
    return c
  }
  const autorizar = () => real.crearAutorizador({
    verificar: async () => ({ uid: mundo.sesion.uid, email: mundo.sesion.email, emailVerified: true }),
    // El perfil lo calcula el código REAL: rol y modalidad salen de la «fila».
    perfil: async (u) => real.resolverPerfil(u, mundo.sesion.fila),
    denegado: async () => {},
  })
  return {
    ...real,
    supabaseAdmin: () => ({
      from: (t: string) => cadena(t),
      // `usuario_cambiar_permisos` (migración 28): cambio + bitácora en UNA transacción. Misma semántica, simulada.
      rpc: async (_fn: string, a: Record<string, unknown>) => {
        // `propiedad_cambiar_estado` (migración 33): el mismo doble que usan las pruebas de las rutas de propiedades.
        if (_fn === 'propiedad_cambiar_estado') return propiedadCambiarEstado(mundo.props, mundo.auditoria, a as never)
        const f = mundo.usuarios.find((u) => u.uid === a.p_uid)
        if (!f) return { data: { resultado: 'no_existe' }, error: null }
        if (f.rol !== 'publicador') return { data: { resultado: 'no_publicador' }, error: null }
        const igual = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null)
        if (!igual(f.tipo_publicador, a.p_antes_tipo) || !igual(f.permisos_override, a.p_antes_overrides)) return { data: { resultado: 'conflicto' }, error: null }
        const au = a.p_audit as { actor_uid: string; actor_email: string; actor_rol: string; accion: string; antes: unknown; despues: unknown }
        const cambios = { tipo_publicador: a.p_tipo, permisos_override: a.p_overrides }
        Object.assign(f, cambios)
        mundo.updates.push({ tabla: 'usuarios', filtros: [['uid', a.p_uid]], cambios })
        mundo.auditoria.push({ actor: { uid: au.actor_uid, email: au.actor_email, rol: au.actor_rol }, accion: au.accion, entidad: 'usuarios', entidadId: a.p_uid, antes: au.antes, despues: au.despues })
        return { data: { resultado: 'ok' }, error: null }
      },
    }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar()(req, (p) => puede(p, permiso), permiso),
    requireAdmin: (req: Request) => autorizar()(req, (p) => puede(p, 'panel.admin'), 'panel.admin'),
    registrarIntentoDenegado: async () => {},
  }
})
vi.mock('@/lib/auditoria', () => ({
  registrar: async (e: Record<string, unknown>) => { mundo.auditoria.push(e) },
}))
vi.mock('@/lib/alertas', () => ({ avisar: async () => {} }))
vi.mock('@/lib/config/flags-servidor', () => import('./dobles/flags-portal')) // R8.6: portal abierto por defecto
vi.mock('@/lib/refrescar', () => ({ refrescarCatalogo: () => {} }))
vi.mock('@/lib/asignar-slug', () => ({ asignarSlugAlPublicar: async () => null, nombrarSiEstaPublicada: async () => {} }))
vi.mock('@/lib/invitaciones', () => ({ aplicarInvitacion: async () => null }))

import {
  CAPACIDADES, DEFAULTS_POR_TIPO, capacidadDeAccionDeCita, capacidadesEfectivas,
  normalizarOverrides, tieneCapacidad, tipoDe,
} from '../src/lib/acceso/capacidades'
import { resolverPerfil } from '../src/lib/auth-server'
import { puedeEditarAnuncio, puedeTransicionar, destinoDePublicacion } from '../src/lib/publicacion'
import { propiedadCambiarEstado } from './dobles/propiedad-cambiar-estado'
import { POST as cambiarEstado } from '../src/app/api/propiedades/[id]/estado/route'
import { PATCH as editarPropiedad } from '../src/app/api/admin/propiedades/[id]/route'
import { PATCH as editarUsuario } from '../src/app/api/admin/usuarios/route'
import { PATCH as guardarPerfil } from '../src/app/api/usuarios/me/route'

const R = (url: string, cuerpo?: unknown, metodo = 'POST') =>
  new Request(`https://vivebienn.com${url}`, {
    method: metodo,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const comoPublicador = (extra: Record<string, unknown> = {}) => ({ uid: 'A', email: 'a@ejemplo.test', fila: { rol: 'publicador', estado: 'activo', ...extra } })
const comoAdmin = () => ({ uid: 'ADM', email: 'adm@vivebienn.com', fila: { rol: 'admin', estado: 'activo' } })

beforeEach(() => {
  mundo.sesion = comoPublicador()
  mundo.sinMigracion28 = false
  mundo.updates = []
  mundo.auditoria = []
  mundo.usuarios = [
    { uid: 'A', email: 'a@ejemplo.test', rol: 'publicador', estado: 'activo', nombre: 'Ana', telefono: '4771112233', whatsapp: '4771112233', tipo_publicador: 'publicador', permisos_override: {} },
    { uid: 'B', email: 'b@ejemplo.test', rol: 'publicador', estado: 'activo', nombre: 'Beto', telefono: '4774445566', whatsapp: '4774445566', tipo_publicador: 'asociado', permisos_override: {} },
    { uid: 'C', email: 'c@ejemplo.test', rol: 'cliente', estado: 'activo', nombre: 'Cora', tipo_publicador: 'publicador', permisos_override: {} },
    { uid: 'ADM', email: 'adm@vivebienn.com', rol: 'admin', estado: 'activo', nombre: 'Admin' },
  ]
  mundo.props = [propiedad('pA', 'A', 'borrador'), propiedad('pA-rev', 'A', 'en_revision'), propiedad('pA-pub', 'A', 'publicada'), propiedad('pB', 'B', 'borrador')]
})

// ───────────────────────────────────────────────────────────────
describe('el modelo: modalidad → defaults → overrides', () => {
  it('PUBLICADOR normal: sin publicar solo, sin citas, sin datos del interesado, sin contacto público', () => {
    const c = capacidadesEfectivas({ rol: 'publicador', tipo: 'publicador' })
    for (const apagada of ['publicar_sin_revision', 'recibir_citas', 'aceptar_citas', 'rechazar_citas', 'reprogramar_citas', 'cancelar_citas',
      'ver_datos_interesado', 'mostrar_perfil', 'mostrar_nombre', 'mostrar_foto', 'mostrar_telefono', 'mostrar_whatsapp', 'mostrar_email'] as const) {
      expect(c[apagada], apagada).toBe(false)
    }
    expect(c.recibir_solicitudes).toBe(true) // se le avisa, sin datos personales (ADR-0006)
  })

  it('ASOCIADO: publica sin revisión, atiende citas y tiene perfil; teléfono y datos del interesado, no', () => {
    const c = capacidadesEfectivas({ rol: 'publicador', tipo: 'asociado' })
    for (const prendida of ['publicar_sin_revision', 'recibir_solicitudes', 'recibir_citas', 'aceptar_citas', 'rechazar_citas',
      'reprogramar_citas', 'cancelar_citas', 'mostrar_perfil'] as const) {
      expect(c[prendida], prendida).toBe(true)
    }
    // «Recibir solicitud» NO es «ver sus datos»: permiso aparte, apagado también aquí.
    expect(c.ver_datos_interesado).toBe(false)
    expect(c.mostrar_telefono).toBe(false)
    expect(c.mostrar_whatsapp).toBe(false)
    expect(c.mostrar_email).toBe(false)
  })

  it('un override enciende una capacidad premium a un PUBLICADOR…', () => {
    const c = capacidadesEfectivas({ rol: 'publicador', tipo: 'publicador', overrides: { recibir_citas: true, aceptar_citas: true, mostrar_whatsapp: true } })
    expect(c.aceptar_citas).toBe(true)
    expect(c.mostrar_whatsapp).toBe(true)
    expect(c.publicar_sin_revision).toBe(false) // lo demás sigue como la modalidad
  })

  it('…y apaga una a un ASOCIADO', () => {
    const c = capacidadesEfectivas({ rol: 'publicador', tipo: 'asociado', overrides: { publicar_sin_revision: false, mostrar_perfil: false } })
    expect(c.publicar_sin_revision).toBe(false)
    expect(c.mostrar_perfil).toBe(false)
    expect(c.recibir_citas).toBe(true)
  })

  it('las acciones de cita dependen de `recibir_citas`: sin ella no hay aceptar/rechazar/reprogramar/cancelar', () => {
    const c = capacidadesEfectivas({ rol: 'publicador', tipo: 'asociado', overrides: { recibir_citas: false } })
    for (const k of ['aceptar_citas', 'rechazar_citas', 'reprogramar_citas', 'cancelar_citas'] as const) expect(c[k], k).toBe(false)
    // y aceptar sin recibir no se «cuela» por override
    const d = capacidadesEfectivas({ rol: 'publicador', tipo: 'publicador', overrides: { aceptar_citas: true } })
    expect(d.aceptar_citas).toBe(false)
  })

  it('las cinco capacidades de citas son independientes entre sí', () => {
    const c = capacidadesEfectivas({ rol: 'publicador', tipo: 'asociado', overrides: { cancelar_citas: false, reprogramar_citas: false } })
    expect(c.aceptar_citas).toBe(true)
    expect(c.rechazar_citas).toBe(true)
    expect(c.cancelar_citas).toBe(false)
    expect(c.reprogramar_citas).toBe(false)
  })

  it('un cliente o un admin no tienen capacidades de publicador, diga lo que diga la fila', () => {
    for (const rol of ['cliente', 'admin']) {
      const c = capacidadesEfectivas({ rol, tipo: 'asociado', overrides: { publicar_sin_revision: true } })
      expect(Object.values(c).every((v) => v === false), rol).toBe(true)
    }
  })

  it('falla cerrado: modalidad rara → publicador; overrides basura se descartan', () => {
    expect(tipoDe('premium')).toBe('publicador')
    expect(tipoDe(undefined)).toBe('publicador')
    expect(normalizarOverrides({ publicar_sin_revision: 'true', inventada: true, aceptar_citas: 1, mostrar_perfil: true })).toEqual({ mostrar_perfil: true })
    expect(normalizarOverrides([true])).toEqual({})
    expect(normalizarOverrides('x')).toEqual({})
    expect(capacidadesEfectivas({ rol: 'publicador', tipo: 'otra', overrides: 'x' })).toEqual(DEFAULTS_POR_TIPO.publicador)
  })

  it('el perfil real: la columna `tipo_publicador` de un CLIENTE no le da nada', () => {
    const p = resolverPerfil({ uid: 'C', email: 'c@x.test', emailVerified: true }, { rol: 'cliente', estado: 'activo', tipo_publicador: 'asociado', permisos_override: { publicar_sin_revision: true } })
    expect(p.rol).toBe('cliente')
    expect(tieneCapacidad(p, 'publicar_sin_revision')).toBe(false)
  })

  it('el perfil real: un publicador asociado trae sus capacidades; sin la fila de modalidad vale la normal', () => {
    const a = resolverPerfil({ uid: 'B', email: 'b@x.test', emailVerified: true }, { rol: 'publicador', estado: 'activo', tipo_publicador: 'asociado' })
    expect(tieneCapacidad(a, 'publicar_sin_revision')).toBe(true)
    const sin = resolverPerfil({ uid: 'A', email: 'a@x.test', emailVerified: true }, { rol: 'publicador', estado: 'activo' })
    expect(tieneCapacidad(sin, 'publicar_sin_revision')).toBe(false)
  })

  it('un perfil sin capacidades calculadas (mock, perfil viejo) no tiene ninguna', () => {
    expect(tieneCapacidad({ rol: 'publicador' }, 'publicar_sin_revision')).toBe(false)
    expect(tieneCapacidad({ rol: 'admin', capacidades: { publicar_sin_revision: true } }, 'publicar_sin_revision')).toBe(false)
  })

  it('el catálogo no tiene duplicados y cada modalidad define TODAS las capacidades', () => {
    expect(new Set(CAPACIDADES).size).toBe(CAPACIDADES.length)
    for (const t of ['publicador', 'asociado'] as const) {
      expect(Object.keys(DEFAULTS_POR_TIPO[t]).sort()).toEqual([...CAPACIDADES].sort())
    }
  })
})

describe('citas: cada acción exige su propia capacidad', () => {
  it('mapa acción → capacidad (el estado distingue rechazar de cancelar)', () => {
    expect(capacidadDeAccionDeCita('confirmar', 'REQUESTED')).toBe('aceptar_citas')
    expect(capacidadDeAccionDeCita('proponer', 'CONFIRMED')).toBe('reprogramar_citas')
    expect(capacidadDeAccionDeCita('cancelar', 'REQUESTED')).toBe('rechazar_citas')
    expect(capacidadDeAccionDeCita('cancelar', 'PENDING_CONFIRMATION')).toBe('rechazar_citas')
    expect(capacidadDeAccionDeCita('cancelar', 'CONFIRMED')).toBe('cancelar_citas')
    expect(capacidadDeAccionDeCita('vencer', 'REQUESTED')).toBeNull()
    expect(capacidadDeAccionDeCita('corregir', 'COMPLETED')).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────
describe('publicar sin revisión: sólo con la capacidad, y sólo borrador → publicada', () => {
  it('reglas puras', () => {
    expect(puedeTransicionar('borrador', 'publicada', 'publicador', false).ok).toBe(false)
    expect(puedeTransicionar('borrador', 'publicada', 'publicador', true).ok).toBe(true)
    // sin revisión no es sin reglas:
    expect(puedeTransicionar('en_revision', 'publicada', 'publicador', true).ok).toBe(false)
    expect(puedeTransicionar('rechazada', 'publicada', 'publicador', true).ok).toBe(false)
    expect(puedeTransicionar('cambios_solicitados', 'publicada', 'publicador', true).ok).toBe(false)
    expect(puedeTransicionar('publicada', 'borrador', 'publicador', true).ok).toBe(false)
    // un cliente no se beneficia de la bandera
    expect(puedeTransicionar('borrador', 'publicada', 'cliente', true).ok).toBe(false)
    expect(destinoDePublicacion('borrador', false, true)).toBe('publicada')
    expect(destinoDePublicacion('borrador', false, false)).toBe('en_revision')
    // editar lo ya publicado es OTRA capacidad (`editar_publicadas`); lo que está en revisión, nunca
    expect(puedeEditarAnuncio('publicada', false, true)).toBe(true)
    expect(puedeEditarAnuncio('publicada', false, false)).toBe(false)
    expect(puedeEditarAnuncio('en_revision', false, true)).toBe(false)
    expect(puedeEditarAnuncio('borrador', false, false)).toBe(true)
    expect(puedeEditarAnuncio('en_revision', true, false)).toBe(true) // admin
  })

  it('ASOCIADO publica su borrador (200) y queda dicho en la bitácora que fue sin revisión', async () => {
    mundo.sesion = comoPublicador({ tipo_publicador: 'asociado' })
    const r = await cambiarEstado(R('/x', { estado: 'publicada' }), ctx('pA'))
    expect(r.status).toBe(200)
    expect(mundo.props.find((p) => p.id === 'pA')!.estado_pub).toBe('publicada')
    const a = mundo.auditoria.find((e) => e.accion === 'propiedad.publicada')!
    expect(a.despues).toMatchObject({ estado_pub: 'publicada', sinRevision: true, tipoPublicador: 'asociado' })
  })

  it('PUBLICADOR normal no publica directo (403) y no cambia nada', async () => {
    const r = await cambiarEstado(R('/x', { estado: 'publicada' }), ctx('pA'))
    expect(r.status).toBe(403)
    expect(mundo.props.find((p) => p.id === 'pA')!.estado_pub).toBe('borrador')
  })

  it('PUBLICADOR con override `publicar_sin_revision` sí publica (modalidad ≠ autorización)', async () => {
    mundo.sesion = comoPublicador({ tipo_publicador: 'publicador', permisos_override: { publicar_sin_revision: true } })
    expect((await cambiarEstado(R('/x', { estado: 'publicada' }), ctx('pA'))).status).toBe(200)
  })

  it('ASOCIADO con la capacidad apagada por un admin ya no publica solo', async () => {
    mundo.sesion = comoPublicador({ tipo_publicador: 'asociado', permisos_override: { publicar_sin_revision: false } })
    expect((await cambiarEstado(R('/x', { estado: 'publicada' }), ctx('pA'))).status).toBe(403)
  })

  it('ASOCIADO no se aprueba lo que está en revisión (403): sin revisión previa no es saltarse una en curso', async () => {
    mundo.sesion = comoPublicador({ tipo_publicador: 'asociado' })
    expect((await cambiarEstado(R('/x', { estado: 'publicada' }), ctx('pA-rev'))).status).toBe(403)
  })

  it('ASOCIADO tampoco publica lo de otro (IDOR → 403)', async () => {
    mundo.sesion = comoPublicador({ tipo_publicador: 'asociado' })
    const r = await cambiarEstado(R('/x', { estado: 'publicada' }), ctx('pB'))
    expect(r.status).toBe(403)
    expect(mundo.props.find((p) => p.id === 'pB')!.estado_pub).toBe('borrador')
  })

  it('ASOCIADO sin perfil de contacto completo no publica (400): la regla de contacto sigue', async () => {
    mundo.sesion = comoPublicador({ tipo_publicador: 'asociado' })
    mundo.usuarios.find((u) => u.uid === 'A')!.whatsapp = null
    const r = await cambiarEstado(R('/x', { estado: 'publicada' }), ctx('pA'))
    expect(r.status).toBe(400)
  })

  it('ASOCIADO edita lo suyo ya publicado; el PUBLICADOR normal, no (409)', async () => {
    mundo.sesion = comoPublicador({ tipo_publicador: 'asociado' })
    expect((await editarPropiedad(R('/x', { descripcion: 'Corregida' }, 'PATCH'), ctx('pA-pub'))).status).toBe(200)
    mundo.sesion = comoPublicador()
    expect((await editarPropiedad(R('/x', { descripcion: 'Otra' }, 'PATCH'), ctx('pA-pub'))).status).toBe(409)
  })

  it('«publicar sin revisión» NO da «editar lo publicado»: son capacidades independientes (hallazgo Codex)', async () => {
    mundo.sesion = comoPublicador({ tipo_publicador: 'publicador', permisos_override: { publicar_sin_revision: true } })
    expect((await editarPropiedad(R('/x', { descripcion: 'x' }, 'PATCH'), ctx('pA-pub'))).status).toBe(409)
    // y al revés: un asociado al que se le apaga `editar_publicadas` no corrige lo publicado
    mundo.sesion = comoPublicador({ tipo_publicador: 'asociado', permisos_override: { editar_publicadas: false } })
    expect((await editarPropiedad(R('/x', { descripcion: 'x' }, 'PATCH'), ctx('pA-pub'))).status).toBe(409)
  })

  it('lo que está EN REVISIÓN no lo edita nadie con capacidades, ni un asociado (409): es lo que mira el equipo', async () => {
    mundo.sesion = comoPublicador({ tipo_publicador: 'asociado' })
    expect((await editarPropiedad(R('/x', { descripcion: 'x' }, 'PATCH'), ctx('pA-rev'))).status).toBe(409)
    expect(mundo.updates.filter((u) => u.tabla === 'propiedades')).toHaveLength(0)
  })

  it('ASOCIADO no edita lo ajeno ni escribe campos protegidos (dueño, folio, estado)', async () => {
    mundo.sesion = comoPublicador({ tipo_publicador: 'asociado' })
    expect((await editarPropiedad(R('/x', { descripcion: 'x' }, 'PATCH'), ctx('pB'))).status).toBe(403)
    await editarPropiedad(R('/x', { descripcion: 'ok', owner_id: 'B', folio: 'VB-2026-99999', estado_pub: 'publicada', slug: 'mio' }, 'PATCH'), ctx('pA'))
    const c = mundo.updates.find((u) => u.tabla === 'propiedades')!.cambios
    for (const k of ['owner_id', 'folio', 'estado_pub', 'slug']) expect(c, k).not.toHaveProperty(k)
  })
})

// ───────────────────────────────────────────────────────────────
describe('el publicador no se da permisos ni modalidad', () => {
  it('PATCH /api/usuarios/me con tipo_publicador / permisos / rol: nada de eso se escribe', async () => {
    const r = await guardarPerfil(R('/api/usuarios/me', {
      nombre: 'Ana', tipo_publicador: 'asociado', tipoPublicador: 'asociado', permisos_override: { publicar_sin_revision: true },
      permisos: { publicar_sin_revision: true }, capacidades: { publicar_sin_revision: true },
    }, 'PATCH'))
    expect(r.status).toBe(200)
    for (const u of mundo.updates) {
      for (const k of ['tipo_publicador', 'permisos_override', 'permisos', 'capacidades', 'tipoPublicador']) expect(u.cambios, k).not.toHaveProperty(k)
    }
    expect(mundo.usuarios.find((u) => u.uid === 'A')!.tipo_publicador).toBe('publicador')
    // y la respuesta lo dice: se ignoró, no se fingió que se guardó
    const j = await r.json()
    expect(j.tipoPublicador).toBe('publicador')
    expect(j.capacidades.publicar_sin_revision).toBe(false)
  })

  it('PATCH /me con rol=publicador/asociado/admin: 403', async () => {
    for (const rol of ['asociado', 'admin', 'super_admin']) {
      expect((await guardarPerfil(R('/api/usuarios/me', { rol }, 'PATCH'))).status, rol).toBe(403)
    }
  })

  it('un publicador (aunque sea ASOCIADO) no llega a la API de permisos: 403', async () => {
    mundo.sesion = comoPublicador({ tipo_publicador: 'asociado' })
    const r = await editarUsuario(R('/api/admin/usuarios', { uid: 'A', tipo_publicador: 'asociado', motivo: 'me lo doy yo solo' }, 'PATCH'))
    expect(r.status).toBe(403)
    expect(mundo.updates.filter((u) => u.tabla === 'usuarios')).toHaveLength(0)
  })

  it('un cliente tampoco: 403', async () => {
    mundo.sesion = { uid: 'C', email: 'c@ejemplo.test', fila: { rol: 'cliente', estado: 'activo' } }
    expect((await editarUsuario(R('/api/admin/usuarios', { uid: 'A', permisos: { publicar_sin_revision: true }, motivo: 'intento de cliente' }, 'PATCH'))).status).toBe(403)
  })
})

describe('el admin gestiona modalidad y permisos por usuario (auditado)', () => {
  const cambiar = (cuerpo: Record<string, unknown>) => editarUsuario(R('/api/admin/usuarios', { uid: 'A', motivo: 'Alta como asociado según acuerdo', ...cuerpo }, 'PATCH'))
  const fila = (uid: string) => mundo.usuarios.find((u) => u.uid === uid)!

  beforeEach(() => { mundo.sesion = comoAdmin() })

  it('pasa a un publicador a ASOCIADO y queda en la bitácora, con antes, después y motivo', async () => {
    const r = await cambiar({ tipo_publicador: 'asociado' })
    expect(r.status).toBe(200)
    expect(fila('A').tipo_publicador).toBe('asociado')
    const e = mundo.auditoria.find((a) => a.accion === 'usuario.editar')!
    expect(e.entidadId).toBe('A')
    expect(e.antes).toMatchObject({ tipo_publicador: 'publicador', permisos_override: {} })
    expect(e.despues).toMatchObject({ tipo_publicador: 'asociado', motivo: 'Alta como asociado según acuerdo' })
  })

  it('enciende y apaga capacidades sueltas; `null` vuelve al valor de la modalidad', async () => {
    expect((await cambiar({ permisos: { recibir_citas: true, aceptar_citas: true, mostrar_whatsapp: true } })).status).toBe(200)
    expect(fila('A').permisos_override).toEqual({ recibir_citas: true, aceptar_citas: true, mostrar_whatsapp: true })
    expect((await cambiar({ permisos: { aceptar_citas: null, mostrar_whatsapp: false } })).status).toBe(200)
    // `mostrar_whatsapp: false` ya es el default de la modalidad: no se guarda (sin redundancias, fase ADMIN).
    expect(fila('A').permisos_override).toEqual({ recibir_citas: true })
  })

  it('un cambio de permisos efectivo se refleja en lo que el servidor decide (de punta a punta)', async () => {
    await cambiar({ permisos: { publicar_sin_revision: true } })
    mundo.sesion = comoPublicador({ ...(fila('A') as object) } as Record<string, unknown>)
    expect((await cambiarEstado(R('/x', { estado: 'publicada' }), ctx('pA'))).status).toBe(200)
  })

  it('exige motivo (≥ 10 caracteres)', async () => {
    const r = await editarUsuario(R('/api/admin/usuarios', { uid: 'A', tipo_publicador: 'asociado' }, 'PATCH'))
    expect(r.status).toBe(400)
    expect(fila('A').tipo_publicador).toBe('publicador')
  })

  it('rechaza una modalidad o un permiso inexistentes, y valores que no sean booleanos', async () => {
    expect((await cambiar({ tipo_publicador: 'premium' })).status).toBe(400)
    expect((await cambiar({ permisos: { poder_total: true } })).status).toBe(400)
    expect((await cambiar({ permisos: { aceptar_citas: 'sí' } })).status).toBe(400)
    expect((await cambiar({ permisos: ['aceptar_citas'] })).status).toBe(400)
    expect(fila('A').permisos_override).toEqual({})
  })

  it('no se le ponen permisos de publicador a un cliente (409): primero el rol, que es otra operación', async () => {
    const r = await editarUsuario(R('/api/admin/usuarios', { uid: 'C', tipo_publicador: 'asociado', motivo: 'a ver si cuela' }, 'PATCH'))
    expect(r.status).toBe(409)
    expect(fila('C').tipo_publicador).toBe('publicador')
  })

  it('nadie se cambia sus propios permisos (400), ni siendo admin', async () => {
    mundo.usuarios.push({ uid: 'ADM2', email: 'x@vivebienn.com', rol: 'publicador', estado: 'activo' })
    mundo.sesion = { uid: 'ADM2', email: 'x@vivebienn.com', fila: { rol: 'admin', estado: 'activo' } }
    const r = await editarUsuario(R('/api/admin/usuarios', { uid: 'ADM2', permisos: { publicar_sin_revision: true }, motivo: 'me lo doy a mí mismo' }, 'PATCH'))
    expect(r.status).toBe(400)
  })

  it('con la migración 28 sin aplicar responde 503 en vez de fingir, y no escribe', async () => {
    mundo.sinMigracion28 = true
    expect((await cambiar({ tipo_publicador: 'asociado' })).status).toBe(503)
    expect(mundo.updates.filter((u) => u.tabla === 'usuarios')).toHaveLength(0)
  })
})
