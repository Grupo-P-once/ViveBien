import { describe, it, expect } from 'vitest'
import { filtrarUsuarios, kpisUsuarios, motivoBloqueo, type UsuarioPanel } from '../src/lib/admin/usuarios'

const AHORA = new Date('2026-09-17T18:00:00.000Z')
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString()

const U = (p: Partial<UsuarioPanel>): UsuarioPanel => ({
  uid: 'u', email: 'x@correo.com', nombre: null, telefono: null, rol: 'cliente', estado: 'activo',
  completitud: 50, creado_en: hace(2), ...p,
})

describe('indicadores de usuarios', () => {
  const usuarios = [
    U({ uid: '1', nombre: 'Jose Emiliano Ponce', email: 'jemilianoponceperez@gmail.com', rol: 'admin', creado_en: hace(120) }),
    U({ uid: '2', nombre: 'Héctor Méndez', email: 'hector.mendez@gmail.com', rol: 'publicador', creado_en: hace(3) }),
    U({ uid: '3', nombre: 'Ana López', email: 'ana@correo.com', rol: 'cliente', estado: 'suspendido', creado_en: hace(1) }),
  ]
  const kpis = kpisUsuarios(usuarios, AHORA)
  const kpi = (clave: string) => kpis.find((k) => k.clave === clave)!

  it('el total se compara con cuántos había hace 30 días', () => {
    expect(kpi('total').valor).toBe(3)
    expect(kpi('total').variacion).toEqual({ tipo: 'porcentaje', valor: 200 })
  })

  it('de los roles y estados no hay histórico: no se inventa una comparación', () => {
    expect(kpi('admins').variacion).toBeNull()
    expect(kpi('activos').variacion).toBeNull()
    expect(kpi('suspendidos').variacion).toBeNull()
  })

  it('la nota se refiere al total, no al propio número', () => {
    // Con un administrador de cuatro usuarios decía «de 1 usuario».
    expect(kpi('admins').nota).toBe('de 3 usuarios')
  })

  it('cuenta administradores, activos y suspendidos', () => {
    expect(kpi('admins').valor).toBe(1)
    expect(kpi('activos').valor).toBe(2)
    expect(kpi('suspendidos').valor).toBe(1)
  })

  it('sin suspendidos, lo dice en palabras', () => {
    const k = kpisUsuarios([U({ uid: 'a' })], AHORA).find((x) => x.clave === 'suspendidos')!
    expect(k.nota).toBe('ninguna cuenta suspendida')
  })

  it('la línea del total arranca de los que ya existían', () => {
    const l = kpi('total').linea!.actual
    expect(l[l.length - 1]).toBe(3)
    expect(l[0]).toBeGreaterThanOrEqual(1)
  })
})

describe('filtros de usuarios', () => {
  const usuarios = [
    U({ uid: '1', nombre: 'Jose Emiliano Ponce', email: 'jemiliano@gmail.com', rol: 'admin', telefono: '4778108559' }),
    U({ uid: '2', nombre: 'Héctor Méndez', email: 'hector@gmail.com', rol: 'publicador' }),
    U({ uid: '3', nombre: 'Ana López', email: 'ana@correo.com', estado: 'suspendido' }),
  ]

  it('por rol y por estado', () => {
    expect(filtrarUsuarios(usuarios, { texto: '', rol: 'publicador', estado: 'todos' }).map((u) => u.uid)).toEqual(['2'])
    expect(filtrarUsuarios(usuarios, { texto: '', rol: 'todos', estado: 'suspendido' }).map((u) => u.uid)).toEqual(['3'])
  })

  it('por nombre sin acentos, por correo y por teléfono con formato', () => {
    expect(filtrarUsuarios(usuarios, { texto: 'hector', rol: 'todos', estado: 'todos' }).map((u) => u.uid)).toEqual(['2'])
    expect(filtrarUsuarios(usuarios, { texto: 'ana@', rol: 'todos', estado: 'todos' }).map((u) => u.uid)).toEqual(['3'])
    expect(filtrarUsuarios(usuarios, { texto: '(477) 810-8559', rol: 'todos', estado: 'todos' }).map((u) => u.uid)).toEqual(['1'])
  })
})

describe('quién no se puede cambiar', () => {
  it('la propia cuenta, para no quedarse fuera por error', () => {
    expect(motivoBloqueo(U({ esYo: true }))).toContain('tu propia cuenta')
  })

  it('el último Super Admin activo (V-1.1.81; antes: «quien esté en ADMIN_EMAILS»)', () => {
    expect(motivoBloqueo(U({ rol: 'super_admin', ultimoSuperAdmin: true }), true)).toContain('único Super Admin')
  })

  it('un administrador, si quien mira no es Super Admin', () => {
    expect(motivoBloqueo(U({ rol: 'admin' }), false)).toContain('Sólo un Super Admin')
    expect(motivoBloqueo(U({ rol: 'super_admin' }), false)).toContain('Sólo un Super Admin')
    expect(motivoBloqueo(U({ rol: 'admin' }), true)).toBeNull()
  })

  it('el texto ya no habla de ADMIN_EMAILS', () => {
    for (const u of [U({ esYo: true }), U({ rol: 'super_admin', ultimoSuperAdmin: true }), U({ rol: 'admin' })]) {
      expect(motivoBloqueo(u, true) ?? '').not.toContain('ADMIN_EMAILS')
      expect(motivoBloqueo(u, false) ?? '').not.toContain('ADMIN_EMAILS')
    }
  })

  it('el resto sí', () => {
    expect(motivoBloqueo(U({}))).toBeNull()
  })
})

describe('«Administradores» cuenta admin y super admin (V-1.1.81)', () => {
  it('con un super admin y un admin, dice 2', () => {
    const lista = [U({ uid: 'a', rol: 'super_admin' }), U({ uid: 'b', rol: 'admin' }), U({ uid: 'c', rol: 'cliente' })]
    const k = kpisUsuarios(lista, AHORA).find((x) => x.clave === 'admins')!
    expect(k.valor).toBe(2)
    expect(k.nota).toBe('de 3 usuarios')
  })

  it('el caso de la pantalla: un solo usuario, super admin, ya no dice 0', () => {
    const lista = [U({ uid: 'a', rol: 'super_admin' }), U({ uid: 'b', rol: 'publicador' }), U({ uid: 'c', rol: 'cliente' })]
    expect(kpisUsuarios(lista, AHORA).find((x) => x.clave === 'admins')!.valor).toBe(1)
  })
})
