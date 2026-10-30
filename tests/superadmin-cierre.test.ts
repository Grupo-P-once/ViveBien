import { describe, it, expect } from 'vitest'
import { decidirCambioDeEstado, decidirCambioDeRol, CUENTA_ELIMINADA } from '../src/lib/acceso/roles'
import { decidirCambioDePermisos } from '../src/lib/acceso/capacidades'
import { construirActividad, type FuentesActividad } from '../src/lib/admin/actividad'
import { puede } from '../src/lib/acceso/permisos'

/** Cierre funcional de SUPER_ADMIN: cuenta eliminada intocable, flags en Actividad, ADMIN ≠ SUPER_ADMIN. */

const yo = (superAdmin: boolean) => ({ uid: 'yo', superAdmin })
const motivo = 'motivo suficientemente largo'
const eliminada = (rol: string) => ({ uid: 'x', rol, estado: 'eliminada', esUltimoSuperAdmin: false })

describe('una cuenta eliminada no se modifica', () => {
  it.each([true, false])('rol (superAdmin=%s): 409', (sa) => {
    expect(decidirCambioDeRol({ actor: yo(sa), objetivo: eliminada('cliente'), nuevo: 'publicador', motivo })).toEqual({ ok: false, status: 409, motivo: CUENTA_ELIMINADA })
  })
  it.each([true, false])('estado, incluso «activo» (superAdmin=%s): 409, no se resucita', (sa) => {
    expect(decidirCambioDeEstado({ actor: yo(sa), objetivo: eliminada('cliente'), nuevo: 'activo' })).toMatchObject({ ok: false, status: 409 })
    expect(decidirCambioDeEstado({ actor: yo(sa), objetivo: eliminada('publicador'), nuevo: 'suspendido' })).toMatchObject({ ok: false, status: 409 })
  })
  it('permisos de un publicador eliminado: 409', () => {
    expect(decidirCambioDePermisos({ actor: { uid: 'yo' }, objetivo: eliminada('publicador'), motivo })).toMatchObject({ ok: false, status: 409 })
  })
  it('una cuenta activa o suspendida sigue pudiéndose reactivar', () => {
    const susp = { uid: 'x', rol: 'cliente', estado: 'suspendido', esUltimoSuperAdmin: false }
    expect(decidirCambioDeEstado({ actor: yo(false), objetivo: susp, nuevo: 'activo' }).ok).toBe(true)
  })
  it('sin `estado` en el objetivo (llamadas antiguas) no cambia nada', () => {
    expect(decidirCambioDeEstado({ actor: yo(false), objetivo: { uid: 'x', rol: 'cliente', esUltimoSuperAdmin: false }, nuevo: 'suspendido' }).ok).toBe(true)
  })
})

describe('ADMIN vs SUPER_ADMIN (matriz)', () => {
  const admin = { rol: 'admin', superAdmin: false }
  const sup = { rol: 'admin', superAdmin: true }
  it('módulos y roles de admin: sólo super admin', () => {
    expect(puede(admin, 'configuracion.flags')).toBe(false)
    expect(puede(sup, 'configuracion.flags')).toBe(true)
    expect(puede(admin, 'usuarios.roles_admin')).toBe(false)
    expect(puede(sup, 'usuarios.roles_admin')).toBe(true)
  })
  it('admin gestiona usuarios pero no toca a un admin ni a un super admin', () => {
    for (const rol of ['admin', 'super_admin']) {
      const o = { uid: 'x', rol, estado: 'activo', esUltimoSuperAdmin: false }
      expect(decidirCambioDeEstado({ actor: yo(false), objetivo: o, nuevo: 'suspendido' })).toMatchObject({ ok: false, status: 403 })
      expect(decidirCambioDeRol({ actor: yo(false), objetivo: o, nuevo: 'cliente', motivo })).toMatchObject({ ok: false, status: 403 })
    }
    expect(decidirCambioDeRol({ actor: yo(false), objetivo: { uid: 'x', rol: 'cliente', estado: 'activo', esUltimoSuperAdmin: false }, nuevo: 'admin', motivo })).toMatchObject({ ok: false, status: 403 })
  })
  it('el último super admin activo no se degrada ni se suspende (ni siquiera por otro super admin)', () => {
    const o = { uid: 'x', rol: 'super_admin', estado: 'activo', esUltimoSuperAdmin: true }
    expect(decidirCambioDeRol({ actor: yo(true), objetivo: o, nuevo: 'admin', motivo })).toMatchObject({ ok: false, status: 409 })
    expect(decidirCambioDeEstado({ actor: yo(true), objetivo: o, nuevo: 'suspendido' })).toMatchObject({ ok: false, status: 409 })
  })
})

describe('Actividad: cambios de módulos y de rol', () => {
  const base: FuentesActividad = { leads: [], solicitudes: [], contactos: [], usuarios: [{ uid: 'u1', nombre: null, email: 'b@correo.com', creado_en: null }], propiedades: [], invitaciones: [], auditoria: [] }
  it('un flag encendido o apagado sale con su nombre y SIN el motivo', () => {
    const items = construirActividad({ ...base, auditoria: [
      { id: 1, accion: 'configuracion.flag', entidad_id: 'citasEnLinea', antes: { valor: false }, despues: { valor: true, motivo: 'texto interno secreto' }, creado_en: '2026-10-01T10:00:00Z' },
      { id: 2, accion: 'configuracion.flag', entidad_id: 'citasEnLinea', antes: { valor: true }, despues: { valor: false, motivo: 'otro motivo interno' }, creado_en: '2026-10-02T10:00:00Z' },
    ] })
    expect(items.map((i) => i.tipo)).toEqual(['modulo-cambio', 'modulo-cambio'])
    expect(items[0].titulo).toMatch(/^Módulo apagado: /)
    expect(items[1].titulo).toMatch(/^Módulo encendido: /)
    expect(JSON.stringify(items)).not.toMatch(/secreto|motivo interno/)
  })
  it('rol/estado ya no se rotula «permisos»; un cambio de permisos sí', () => {
    const items = construirActividad({ ...base, auditoria: [
      { id: 3, accion: 'usuario.editar', entidad_id: 'u1', antes: { rol: 'admin' }, despues: { rol: 'super_admin', motivo: 'x' }, creado_en: '2026-10-03T10:00:00Z' },
      { id: 4, accion: 'usuario.editar', entidad_id: 'u1', antes: { tipo_publicador: 'publicador' }, despues: { tipo_publicador: 'asociado' }, creado_en: '2026-10-02T10:00:00Z' },
    ] })
    expect(items[0].titulo).toBe('Cambio de rol o estado: b@correo.com')
    expect(items[0].detalle).toBe('rol: Administrador → Super Admin')
    expect(items[1].titulo).toBe('Cambio de permisos: b@correo.com')
  })
})
