import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { papelDe, PERMISOS, puede, type Papel, type Permiso } from '../src/lib/acceso/permisos'
import { decidirCambioDeEstado, decidirCambioDeRol, decidirInvitacion } from '../src/lib/acceso/roles'
import { CAMPOS_RESERVADOS } from '../src/lib/publicacion'

/**
 * Fase 2 del PRD v2.0 (V-1.1.79): roles, permisos y Super Admin.
 * Incluye los casos del §60 del prompt maestro que aplican hoy.
 */
const SRC = join(__dirname, '..', 'src')
const leer = (p: string) => readFileSync(join(SRC, p), 'utf8')

function archivos(dir: string, filtro: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return archivos(p, filtro)
    return filtro.test(n) ? [p] : []
  })
}

const cliente = { rol: 'cliente' }
const publicador = { rol: 'publicador' }
const admin = { rol: 'admin', superAdmin: false }
const superAdmin = { rol: 'admin', superAdmin: true }

describe('catálogo de permisos', () => {
  it('el papel sale del rol efectivo y de superAdmin', () => {
    expect(papelDe(cliente)).toBe('cliente')
    expect(papelDe(publicador)).toBe('publicador')
    expect(papelDe(admin)).toBe('admin')
    expect(papelDe(superAdmin)).toBe('super_admin')
    expect(papelDe({ rol: 'inventado' })).toBe('cliente')
  })

  it('cada papel tiene al menos lo del anterior (cliente ⊂ publicador ⊂ admin ⊂ super_admin)', () => {
    const orden: Papel[] = ['cliente', 'publicador', 'admin', 'super_admin']
    for (const [permiso, papeles] of Object.entries(PERMISOS)) {
      const primero = Math.min(...(papeles as readonly Papel[]).map((p) => orden.indexOf(p)))
      for (let i = primero; i < orden.length; i++) {
        expect(papeles, `${permiso} debería incluir ${orden[i]}`).toContain(orden[i])
      }
    }
  })

  it('matriz: quién puede qué', () => {
    const tabla: [Permiso, boolean, boolean, boolean, boolean][] = [
      //                               cliente publicador admin super
      ['cuenta.propia',                true,   true,      true,  true],
      ['propiedad.gestionar_propias',  false,  true,      true,  true],
      ['panel.admin',                  false,  false,     true,  true],
      ['usuarios.gestionar',           false,  false,     true,  true],
      ['usuarios.roles_admin',         false,  false,     false, true],
      ['configuracion.flags',          false,  false,     false, true],
      ['seo.ver',                      false,  false,     false, true],
      ['contabilidad.ver',             false,  false,     false, true],
      ['contabilidad.registrar',       false,  false,     false, true],
    ]
    for (const [permiso, c, p, a, s] of tabla) {
      expect([puede(cliente, permiso), puede(publicador, permiso), puede(admin, permiso), puede(superAdmin, permiso)], permiso)
        .toEqual([c, p, a, s])
    }
  })
})

describe('Super Admin (D-13) — el rol vive en la tabla (V-1.1.81)', () => {
  const usuario = (email: string, emailVerified = true) => ({ uid: 'u1', email, emailVerified })

  it('super_admin en la tabla: rol efectivo admin + superAdmin', async () => {
    const { resolverPerfil } = await import('../src/lib/auth-server')
    expect(resolverPerfil(usuario('jemilianoponceperez@gmail.com'), { rol: 'super_admin' })).toMatchObject({ rol: 'admin', superAdmin: true })
  })

  it('el correo, por sí solo, no da nada (ni verificado)', async () => {
    const { resolverPerfil } = await import('../src/lib/auth-server')
    expect(resolverPerfil(usuario('joseponcer@vivebienn.com'), { rol: 'cliente' })).toMatchObject({ rol: 'cliente', superAdmin: false })
    expect(resolverPerfil(usuario('joseponcer@vivebienn.com'), null)).toMatchObject({ rol: 'cliente', superAdmin: false })
  })

  it('la suspensión se respeta también para un Super Admin', async () => {
    const { resolverPerfil } = await import('../src/lib/auth-server')
    expect(resolverPerfil(usuario('a@b.com'), { rol: 'super_admin', estado: 'suspendido' }).estado).toBe('suspendido')
  })
})

describe('cambios de rol y de estado (tarea 02.02)', () => {
  const yo = (superAdmin: boolean) => ({ uid: 'yo', superAdmin })
  const a = (rol: string, esUltimoSuperAdmin = false) => ({ uid: 'otro', rol, esUltimoSuperAdmin })
  const motivo = 'Se incorpora al equipo de atención'

  it('§60.2 un admin no puede hacer admin ni super admin a nadie', () => {
    expect(decidirCambioDeRol({ actor: yo(false), objetivo: a('cliente'), nuevo: 'admin', motivo })).toMatchObject({ ok: false, status: 403 })
    expect(decidirCambioDeRol({ actor: yo(false), objetivo: a('publicador'), nuevo: 'super_admin', motivo })).toMatchObject({ ok: false, status: 403 })
  })

  it('un admin no puede quitarle el admin a otro', () => {
    expect(decidirCambioDeRol({ actor: yo(false), objetivo: a('admin'), nuevo: 'cliente', motivo })).toMatchObject({ ok: false, status: 403 })
    expect(decidirCambioDeRol({ actor: yo(false), objetivo: a('super_admin'), nuevo: 'admin', motivo })).toMatchObject({ ok: false, status: 403 })
  })

  it('un Super Admin sí, pero con motivo', () => {
    expect(decidirCambioDeRol({ actor: yo(true), objetivo: a('cliente'), nuevo: 'admin' })).toMatchObject({ ok: false, status: 400 })
    expect(decidirCambioDeRol({ actor: yo(true), objetivo: a('cliente'), nuevo: 'admin', motivo: 'porque sí' })).toMatchObject({ ok: false, status: 400 })
    expect(decidirCambioDeRol({ actor: yo(true), objetivo: a('cliente'), nuevo: 'admin', motivo }).ok).toBe(true)
    expect(decidirCambioDeRol({ actor: yo(true), objetivo: a('admin'), nuevo: 'super_admin', motivo }).ok).toBe(true)
    expect(decidirCambioDeRol({ actor: yo(true), objetivo: a('super_admin'), nuevo: 'admin', motivo }).ok).toBe(true)
  })

  it('cliente ↔ publicador lo sigue haciendo cualquier admin, sin motivo', () => {
    expect(decidirCambioDeRol({ actor: yo(false), objetivo: a('cliente'), nuevo: 'publicador' }).ok).toBe(true)
    expect(decidirCambioDeRol({ actor: yo(false), objetivo: a('publicador'), nuevo: 'cliente' }).ok).toBe(true)
  })

  it('nadie se cambia a sí mismo (ni el rol ni el estado)', () => {
    const yoMismo = { uid: 'yo', rol: 'super_admin', esUltimoSuperAdmin: false }
    expect(decidirCambioDeRol({ actor: yo(true), objetivo: yoMismo, nuevo: 'cliente', motivo })).toMatchObject({ ok: false, status: 400 })
    expect(decidirCambioDeEstado({ actor: yo(true), objetivo: yoMismo, nuevo: 'suspendido' })).toMatchObject({ ok: false, status: 400 })
  })

  it('el último Super Admin activo no se degrada ni se suspende', () => {
    expect(decidirCambioDeRol({ actor: yo(true), objetivo: a('super_admin', true), nuevo: 'admin', motivo })).toMatchObject({ ok: false, status: 409 })
    expect(decidirCambioDeEstado({ actor: yo(true), objetivo: a('super_admin', true), nuevo: 'suspendido' })).toMatchObject({ ok: false, status: 409 })
    // Reactivarlo sí.
    expect(decidirCambioDeEstado({ actor: yo(true), objetivo: a('super_admin', true), nuevo: 'activo' }).ok).toBe(true)
  })

  it('roles que no existen, fuera', () => {
    expect(decidirCambioDeRol({ actor: yo(true), objetivo: a('cliente'), nuevo: 'root', motivo })).toMatchObject({ ok: false, status: 400 })
  })

  it('suspender a un admin: sólo Super Admin', () => {
    expect(decidirCambioDeEstado({ actor: yo(false), objetivo: a('admin'), nuevo: 'suspendido' })).toMatchObject({ ok: false, status: 403 })
    expect(decidirCambioDeEstado({ actor: yo(true), objetivo: a('admin'), nuevo: 'suspendido' }).ok).toBe(true)
    expect(decidirCambioDeEstado({ actor: yo(false), objetivo: a('cliente'), nuevo: 'suspendido' }).ok).toBe(true)
  })

  it('invitar como admin o super admin es darlo: sólo Super Admin', () => {
    expect(decidirInvitacion({ actor: yo(false), rol: 'admin' })).toMatchObject({ ok: false, status: 403 })
    expect(decidirInvitacion({ actor: yo(false), rol: 'super_admin' })).toMatchObject({ ok: false, status: 403 })
    expect(decidirInvitacion({ actor: yo(true), rol: 'admin' }).ok).toBe(true)
    expect(decidirInvitacion({ actor: yo(true), rol: 'super_admin' }).ok).toBe(true)
    expect(decidirInvitacion({ actor: yo(false), rol: 'publicador' }).ok).toBe(true)
    expect(decidirInvitacion({ actor: yo(true), rol: 'root' })).toMatchObject({ ok: false, status: 400 })
  })
})

describe('una sola función autoriza (ADR-0004)', () => {
  it('requireAdmin es el permiso panel.admin, y requireRole pasa por el mismo autorizar', () => {
    const codigo = leer('lib/auth-server.ts')
    expect(codigo).toMatch(/export async function requireAdmin[\s\S]*?return exigir\(req, 'panel\.admin'\)/)
    expect(codigo).toMatch(/export async function requireRole[\s\S]*?return autorizar\(/)
    expect(codigo).toMatch(/export async function exigir[\s\S]*?return autorizar\(/)
  })

  it('§60.1 ninguna ruta de /api/admin responde sin exigir sesión y permiso', () => {
    const rutas = archivos(join(SRC, 'app/api/admin'), /^route\.ts$/)
    expect(rutas.length).toBeGreaterThan(10)
    const sinCandado: string[] = []
    for (const p of rutas) {
      const codigo = readFileSync(p, 'utf8')
      const manejadores = (codigo.match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? []).length
      const candados = (codigo.match(/await (requireAdmin|requireRole|exigir)\(req/g) ?? []).length
      if (candados < manejadores) sinCandado.push(relative(SRC, p))
    }
    expect(sinCandado).toEqual([])
  })

  it('§60.3 un cliente no se da otro rol a sí mismo', () => {
    const me = leer('app/api/usuarios/me/route.ts')
    expect(me).toMatch(/const ROLES_ELEGIBLES: Rol\[\] = \['cliente'\]/)
    // …y un admin (de lista o de tabla) no se degrada al guardar su perfil.
    expect(me).toMatch(/if \(perfil\.rol !== 'admin'\) cambios\.rol = body\.rol/)
  })

  it('§60.4 un publicador no cambia el dueño, el estado publicado ni los contadores', () => {
    for (const c of ['owner_id', 'estado_pub', 'publicada_en', 'vistas', 'contactos_n', 'whatsapp', 'telefono']) {
      expect(CAMPOS_RESERVADOS, c).toContain(c)
    }
  })

  it('§60.5 quien no es admin sólo ve sus propios leads y solicitudes', () => {
    // V-1.1.80: la condición pasó al catálogo (leads.ver_todos = admin y super admin).
    // V-1.1.9x: la condición se calcula una vez (`verTodos`) porque también decide el DTO de columnas.
    expect(leer('app/api/leads/route.ts')).toMatch(/const verTodos = puede\(perfil, 'leads\.ver_todos'\)[\s\S]*if \(!verTodos\)/)
    // V-1.1.82: el equipo va por su rama; el resto, sólo lo suyo con el DTO de cliente.
    expect(leer('app/api/contacto/route.ts')).toMatch(/if \(puede\(perfil, 'leads\.ver_todos'\)\)/)
    expect(leer('app/api/contacto/route.ts')).toMatch(/\.eq\('cliente_uid', perfil\.uid\)/)
  })

  it('§60.20 los intentos denegados quedan en la bitácora como seguridad.denegado', () => {
    const codigo = leer('lib/auth-server.ts')
    expect(codigo).toMatch(/accion: 'seguridad\.denegado'/)
    expect(codigo).toMatch(/if \(!decide\(perfil\)\) \{\s*await d\.denegado\(perfil, req, que\)/)
    expect(codigo).toMatch(/crearAutorizador\(\{ verificar: verifyIdToken, perfil: getPerfil, denegado: registrarDenegado \}\)/)
  })
})

describe('migración 20 — rol super_admin (ensayo en PGlite)', () => {
  let db: PGlite
  const sql = (n: string) => readFileSync(join(__dirname, '..', 'supabase', n), 'utf8')

  beforeAll(async () => {
    db = await PGlite.create()
    await db.exec(`
      create table public.usuarios (uid text primary key, rol text not null default 'cliente',
        constraint usuarios_rol_check check (rol = any (array['cliente','publicador','admin'])));
      insert into public.usuarios values ('a','admin'), ('p','publicador'), ('c','cliente');
    `)
  })
  afterAll(async () => { await db?.close() })

  it('antes: super_admin no cabe', async () => {
    await expect(db.exec(`insert into public.usuarios values ('s','super_admin')`)).rejects.toThrow()
  })

  it('se aplica dos veces sin romper y sin tocar filas', async () => {
    await db.exec(sql('20-rol-super-admin.sql'))
    await db.exec(sql('20-rol-super-admin.sql'))
    const r = await db.query<{ uid: string; rol: string }>('select uid, rol from public.usuarios order by uid')
    expect(r.rows).toEqual([{ uid: 'a', rol: 'admin' }, { uid: 'c', rol: 'cliente' }, { uid: 'p', rol: 'publicador' }])
  })

  it('después: super_admin cabe; lo inventado, no', async () => {
    await db.exec(`insert into public.usuarios values ('s','super_admin')`)
    await expect(db.exec(`insert into public.usuarios values ('x','root')`)).rejects.toThrow()
  })

  it('la reversión exige quitar antes los super_admin', async () => {
    await expect(db.exec(sql('20-rol-super-admin.REVERTIR.sql'))).rejects.toThrow()
    await db.exec(`update public.usuarios set rol = 'admin' where rol = 'super_admin'`)
    await db.exec(sql('20-rol-super-admin.REVERTIR.sql'))
    await expect(db.exec(`insert into public.usuarios values ('s2','super_admin')`)).rejects.toThrow()
  })
})

describe('SEC-08: la lista de administradores no viaja al navegador', () => {
  it('ningún archivo lee NEXT_PUBLIC_ADMIN_EMAILS', () => {
    const culpables = archivos(SRC, /\.(ts|tsx)$/)
      .filter((p) => readFileSync(p, 'utf8').split('\n')
        .some((l) => /NEXT_PUBLIC_ADMIN_EMAILS/.test(l) && !/^\s*(\/\/|\*)/.test(l)))
      .map((p) => relative(SRC, p))
    expect(culpables).toEqual([])
  })
})

describe('migración 21 — el rol sólo en la base (ensayo en PGlite)', () => {
  let db: PGlite
  const sql = (n: string) => readFileSync(join(__dirname, '..', 'supabase', n), 'utf8')

  beforeAll(async () => {
    db = await PGlite.create()
    await db.exec(`
      create role anon; create role authenticated;
      create table public.usuarios (uid text primary key, email text, rol text not null default 'cliente',
        estado text not null default 'activo',
        constraint usuarios_rol_check check (rol = any (array['cliente','publicador','admin','super_admin'])));
      create table public.invitaciones (id bigint generated always as identity primary key, email text not null,
        nombre text, rol text not null, estado text not null default 'pendiente', invitado_por text not null,
        creado_en timestamptz not null default now(), aceptada_en timestamptz, aceptada_por text,
        constraint invitaciones_rol_check check (rol = any (array['cliente','publicador','admin'])));
      create unique index invitaciones_email_pendiente on public.invitaciones (lower(email)) where estado = 'pendiente';
      insert into public.usuarios (uid, email, rol) values
        ('j', 'jemilianoponceperez@gmail.com', 'admin'), ('p', 'pub@x.com', 'publicador'), ('c', 'cli@x.com', 'cliente');
    `)
  })
  afterAll(async () => { await db?.close() })

  it('se aplica dos veces sin duplicar nada', async () => {
    await db.exec(sql('21-roles-solo-en-la-base.sql'))
    await db.exec(sql('21-roles-solo-en-la-base.sql'))
    const u = await db.query<{ uid: string; rol: string }>('select uid, rol from public.usuarios order by uid')
    expect(u.rows).toEqual([{ uid: 'c', rol: 'cliente' }, { uid: 'j', rol: 'super_admin' }, { uid: 'p', rol: 'publicador' }])
    const i = await db.query<{ email: string; rol: string }>(`select email, rol from public.invitaciones where estado = 'pendiente' order by email`)
    expect(i.rows).toEqual([
      { email: 'joseponcep@gp-once.com', rol: 'super_admin' },
      { email: 'joseponcer@vivebienn.com', rol: 'super_admin' },
    ])
  })

  it('el único Super Admin no se degrada, no se suspende y no se borra', async () => {
    await expect(db.exec(`update public.usuarios set rol = 'admin' where uid = 'j'`)).rejects.toThrow(/ultimo_super_admin/)
    await expect(db.exec(`update public.usuarios set estado = 'suspendido' where uid = 'j'`)).rejects.toThrow(/ultimo_super_admin/)
    await expect(db.exec(`delete from public.usuarios where uid = 'j'`)).rejects.toThrow(/ultimo_super_admin/)
  })

  it('con otro Super Admin activo, sí; y el que queda vuelve a estar protegido', async () => {
    await db.exec(`update public.usuarios set rol = 'super_admin' where uid = 'p'`)
    await db.exec(`update public.usuarios set rol = 'admin' where uid = 'j'`)
    await expect(db.exec(`update public.usuarios set rol = 'cliente' where uid = 'p'`)).rejects.toThrow(/ultimo_super_admin/)
  })

  it('los demás cambios no se ven afectados', async () => {
    await db.exec(`update public.usuarios set rol = 'publicador' where uid = 'c'`)
    await db.exec(`update public.usuarios set estado = 'suspendido' where uid = 'c'`)
  })

  it('las invitaciones ya admiten super_admin, y nada inventado', async () => {
    await db.exec(`insert into public.invitaciones (email, rol, invitado_por) values ('nuevo@x.com', 'super_admin', 'prueba')`)
    await expect(db.exec(`insert into public.invitaciones (email, rol, invitado_por) values ('otro@x.com', 'root', 'prueba')`)).rejects.toThrow()
  })
})
