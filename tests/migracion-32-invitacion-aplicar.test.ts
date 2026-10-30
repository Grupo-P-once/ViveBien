import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 32 (E-30) — `invitacion_aplicar`: aplicar el rol y aceptar la invitación en UNA transacción.
 * Contra Postgres real (PGlite). Es la regla DE VERDAD; `invitaciones-aceptacion.test.ts` prueba la orquestación de la ruta.
 *
 * Se demuestra: identidad por IGUALDAD del correo normalizado (nunca patrón); solo correo verificado; cuenta nueva →
 * se crea con el rol invitado; cuenta existente → solo SUBE (rango mayor), nunca baja ni iguala; «aceptada» SOLO con el
 * rol escrito (si algo falla no queda nada); bitácora `aplicada` / `omitida` (con motivo, una vez por hora); sin cruces
 * entre invitaciones; y que solo `service_role` puede ejecutarla.
 */

const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')

const BASE = `
  create role anon; create role authenticated; create role service_role;
  create table public.usuarios (
    uid text primary key, email text, rol text not null default 'cliente' check (rol in ('cliente','publicador','admin','super_admin')),
    estado text not null default 'activo' check (estado in ('activo','suspendido','pendiente','eliminada')),
    check (email is not null or estado = 'eliminada'));
  create table public.invitaciones (
    id bigint generated always as identity primary key, email text not null, nombre text,
    rol text not null check (rol in ('cliente','publicador','admin','super_admin')),
    estado text not null default 'pendiente' check (estado in ('pendiente','aceptada','cancelada')),
    invitado_por text not null, creado_en timestamptz not null default now(), enviado_en timestamptz,
    aceptada_en timestamptz, aceptada_por text);
  create unique index invitaciones_email_pendiente on public.invitaciones (lower(email)) where estado = 'pendiente';
  create table public.audit_logs (
    id bigint generated always as identity primary key, actor_uid text not null, actor_email text, actor_rol text,
    accion text not null, entidad text not null, entidad_id text, antes jsonb, despues jsonb, creado_en timestamptz not null default now());
`

const INVITADO = 'joseponcep@gp-once.com'
const PRIMERA = 'joseponcer@vivebienn.com'

let d: PGlite
beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  await d.exec(sql('32-invitacion-aplicar-atomica.sql'))
})
afterAll(async () => { await d.close() })

async function limpiar() {
  await d.exec(`drop trigger if exists falla_usuarios on public.usuarios; drop trigger if exists falla_invitaciones on public.invitaciones;
    drop trigger if exists falla_audit on public.audit_logs;
    truncate public.usuarios, public.invitaciones, public.audit_logs restart identity;`)
}
const invitar = (email: string, rol: string, estado = 'pendiente') =>
  d.query(`insert into public.invitaciones (email, rol, estado, invitado_por) values ($1,$2,$3,'seed')`, [email, rol, estado])
const cuenta = (uid: string, email: string | null, rol = 'cliente', estado = 'activo') =>
  d.query(`insert into public.usuarios (uid, email, rol, estado) values ($1,$2,$3,$4)`, [uid, email, rol, estado])
const aplicar = async (uid: string, email: string | null, verificado = true) =>
  (await d.query<{ r: { resultado: string; motivo?: string; rol?: string; antes?: string | null } }>(
    `select public.invitacion_aplicar($1,$2,$3) as r`, [uid, email, verificado])).rows[0].r
const rol = async (uid: string) => (await d.query<{ rol: string }>(`select rol from public.usuarios where uid=$1`, [uid])).rows[0]?.rol
const inv = async (email: string) => (await d.query<{ estado: string; aceptada_por: string | null }>(`select estado, aceptada_por from public.invitaciones where email=$1`, [email])).rows[0]
const acciones = async () => (await d.query<{ accion: string; despues: Record<string, unknown> }>(`select accion, despues from public.audit_logs order by id`)).rows

describe('1 · cuenta nueva + invitación super_admin', () => {
  it('crea la cuenta con el rol invitado, acepta la invitación y deja la bitácora, todo junto', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin')
    expect(await aplicar('U-PEPE', INVITADO)).toMatchObject({ resultado: 'aplicada', rol: 'super_admin', antes: null })
    expect(await rol('U-PEPE')).toBe('super_admin')
    expect(await inv(INVITADO)).toMatchObject({ estado: 'aceptada', aceptada_por: 'U-PEPE' })
    expect((await acciones()).map((a) => a.accion)).toEqual(['invitacion.aplicada'])
  })
})

describe('2 y 3 · cuenta existente + invitación de rango SUPERIOR', () => {
  it('2 · cliente → super_admin', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin'); await cuenta('U-PEPE', INVITADO, 'cliente')
    expect(await aplicar('U-PEPE', INVITADO)).toMatchObject({ resultado: 'aplicada', rol: 'super_admin', antes: 'cliente' })
    expect(await rol('U-PEPE')).toBe('super_admin')
    expect((await inv(INVITADO)).estado).toBe('aceptada')
  })

  it.each([['publicador', 'admin'], ['publicador', 'super_admin'], ['admin', 'super_admin'], ['cliente', 'publicador']])(
    '3 · %s → %s', async (actual, invitado) => {
      await limpiar(); await invitar('a@x.test', invitado); await cuenta('U-A', 'a@x.test', actual)
      expect(await aplicar('U-A', 'a@x.test')).toMatchObject({ resultado: 'aplicada', rol: invitado, antes: actual })
      expect(await rol('U-A')).toBe(invitado)
      expect((await inv('a@x.test')).estado).toBe('aceptada')
    })
})

describe('4 · una invitación NUNCA baja ni iguala un rol', () => {
  it.each([['admin', 'publicador'], ['admin', 'cliente'], ['publicador', 'publicador'], ['super_admin', 'admin'], ['super_admin', 'super_admin'], ['cliente', 'cliente']])(
    'cuenta %s + invitación %s: el rol no cambia, la invitación sigue pendiente y queda `rol_ya_suficiente`', async (actual, invitado) => {
      await limpiar(); await invitar('a@x.test', invitado); await cuenta('U-A', 'a@x.test', actual)
      expect(await aplicar('U-A', 'a@x.test')).toMatchObject({ resultado: 'omitida', motivo: 'rol_ya_suficiente' })
      expect(await rol('U-A')).toBe(actual)
      expect((await inv('a@x.test')).estado).toBe('pendiente')
      expect((await acciones()).map((a) => a.accion)).toEqual(['invitacion.omitida'])
    })

  it('cuentas suspendidas o eliminadas no se tocan (`cuenta_no_activa`)', async () => {
    await limpiar(); await invitar('a@x.test', 'admin'); await cuenta('U-A', 'a@x.test', 'cliente', 'suspendido')
    expect(await aplicar('U-A', 'a@x.test')).toMatchObject({ resultado: 'omitida', motivo: 'cuenta_no_activa' })
    expect(await rol('U-A')).toBe('cliente')
    expect((await inv('a@x.test')).estado).toBe('pendiente')
  })
})

describe('5, 6, 7 y 13 · identidad: SOLO el correo exacto, normalizado', () => {
  it('5 · un correo distinto no consume la invitación', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin')
    expect(await aplicar('U-X', 'alguien@otro.test')).toMatchObject({ resultado: 'omitida', motivo: 'invitacion_no_encontrada' })
    expect(await rol('U-X')).toBeUndefined()
    expect(await inv(INVITADO)).toMatchObject({ estado: 'pendiente', aceptada_por: null })
  })

  it('6 · comparación EXACTA: `_` y `%` NO son comodines; prefijos y sufijos tampoco coinciden', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin')
    for (const [i, c] of ['jose_oncep@gp-once.com', 'joseponcep@gp-once.co', 'joseponcep@gp-once.com.mx', 'xjoseponcep@gp-once.com', 'jose%@gp-once.com', '%@gp-once.com', '_@gp-once.com'].entries()) {
      expect(await aplicar(`U-${i}`, c), c).toMatchObject({ resultado: 'omitida', motivo: 'invitacion_no_encontrada' })
    }
    expect(await inv(INVITADO)).toMatchObject({ estado: 'pendiente', aceptada_por: null })
  })

  it('7b · una invitación ANTIGUA guardada con espacios o mayúsculas también se encuentra (igualdad entre correos normalizados)', async () => {
    await limpiar(); await invitar('  JosePoncep@GP-Once.com ', 'super_admin')
    expect(await aplicar('U-PEPE', INVITADO)).toMatchObject({ resultado: 'aplicada', rol: 'super_admin' })
    expect((await d.query<{ estado: string }>(`select estado from public.invitaciones`)).rows[0].estado).toBe('aceptada')
  })

  it('7 · mayúsculas y espacios se normalizan (trim + minúsculas)', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin')
    expect(await aplicar('U-PEPE', '  JosePoncep@GP-Once.COM  ')).toMatchObject({ resultado: 'aplicada' })
    expect(await rol('U-PEPE')).toBe('super_admin')
  })

  it('13 · dos invitaciones de correos distintos no se cruzan', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin'); await invitar(PRIMERA, 'admin')
    expect(await aplicar('U-PRIMERA', PRIMERA)).toMatchObject({ resultado: 'aplicada', rol: 'admin' })
    expect(await inv(INVITADO)).toMatchObject({ estado: 'pendiente' })
    expect(await aplicar('U-PEPE', INVITADO)).toMatchObject({ resultado: 'aplicada', rol: 'super_admin' })
    expect(await rol('U-PRIMERA')).toBe('admin')
    expect(await rol('U-PEPE')).toBe('super_admin')
  })
})

describe('8 y 9 · ATOMICIDAD: nunca «aceptada» sin el rol aplicado', () => {
  const rompe = (tabla: string, nombre: string, cuando: string) => d.exec(`
    create or replace function public.${nombre}_f() returns trigger language plpgsql as $$ begin raise exception 'fallo simulado en ${tabla}'; end $$;
    create trigger ${nombre} before ${cuando} on public.${tabla} for each row execute function public.${nombre}_f();`)

  it('8 · si no se puede escribir el rol (cuenta nueva) no queda cuenta, ni «aceptada», ni bitácora', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin')
    await rompe('usuarios', 'falla_usuarios', 'insert or update')
    await expect(aplicar('U-PEPE', INVITADO)).rejects.toThrow(/fallo simulado/)
    await d.exec('drop trigger falla_usuarios on public.usuarios')
    expect(await rol('U-PEPE')).toBeUndefined()
    expect(await inv(INVITADO)).toMatchObject({ estado: 'pendiente', aceptada_por: null })
    expect(await acciones()).toHaveLength(0)
  })

  it('8b · si no se puede escribir el rol (cuenta existente) el rol anterior se conserva y la invitación sigue pendiente', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin'); await cuenta('U-PEPE', INVITADO, 'publicador')
    await rompe('usuarios', 'falla_usuarios', 'update')
    await expect(aplicar('U-PEPE', INVITADO)).rejects.toThrow(/fallo simulado/)
    await d.exec('drop trigger falla_usuarios on public.usuarios')
    expect(await rol('U-PEPE')).toBe('publicador')
    expect((await inv(INVITADO)).estado).toBe('pendiente')
  })

  it('9 · si falla la ACEPTACIÓN, el rol recién escrito se revierte (todo o nada)', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin'); await cuenta('U-PEPE', INVITADO, 'publicador')
    await rompe('invitaciones', 'falla_invitaciones', 'update')
    await expect(aplicar('U-PEPE', INVITADO)).rejects.toThrow(/fallo simulado/)
    await d.exec('drop trigger falla_invitaciones on public.invitaciones')
    expect(await rol('U-PEPE')).toBe('publicador')
    expect((await inv(INVITADO)).estado).toBe('pendiente')
    expect(await acciones()).toHaveLength(0)
  })

  it('9b · si falla la bitácora, tampoco queda el rol ni «aceptada»', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin')
    await rompe('audit_logs', 'falla_audit', 'insert')
    await expect(aplicar('U-PEPE', INVITADO)).rejects.toThrow(/fallo simulado/)
    await d.exec('drop trigger falla_audit on public.audit_logs')
    expect(await rol('U-PEPE')).toBeUndefined()
    expect((await inv(INVITADO)).estado).toBe('pendiente')
  })
})

describe('10, 11 y 12 · invitación inexistente, sin verificar, ya aceptada', () => {
  it('10 · sin invitación: no crea nada', async () => {
    await limpiar()
    expect(await aplicar('U-X', 'sin.invitacion@x.test')).toMatchObject({ resultado: 'omitida', motivo: 'invitacion_no_encontrada' })
    expect(await rol('U-X')).toBeUndefined()
    expect(await acciones()).toHaveLength(0)        // lo normal no llena la bitácora
  })

  it('11 · correo SIN verificar: no se aplica ni se consume; se audita UNA vez por hora; al verificar, sube', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin')
    for (let i = 0; i < 3; i += 1) expect(await aplicar('U-PEPE', INVITADO, false)).toMatchObject({ resultado: 'omitida', motivo: 'email_no_verificado' })
    expect(await rol('U-PEPE')).toBeUndefined()
    expect((await inv(INVITADO)).estado).toBe('pendiente')
    expect((await acciones()).filter((a) => a.accion === 'invitacion.omitida')).toHaveLength(1)
    expect((await acciones())[0].despues).toMatchObject({ motivo: 'email_no_verificado' })
    expect(await aplicar('U-PEPE', INVITADO, true)).toMatchObject({ resultado: 'aplicada' })
    expect(await rol('U-PEPE')).toBe('super_admin')
  })

  it('12 · ya aceptada: no se vuelve a aplicar (ni a otra cuenta con ese correo)', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin', 'aceptada')
    expect(await aplicar('U-NUEVO', INVITADO)).toMatchObject({ resultado: 'omitida', motivo: 'invitacion_no_encontrada' })
    expect(await rol('U-NUEVO')).toBeUndefined()
  })

  it('una invitación cancelada tampoco se aplica', async () => {
    await limpiar(); await invitar(INVITADO, 'admin', 'cancelada')
    expect(await aplicar('U-PEPE', INVITADO)).toMatchObject({ resultado: 'omitida', motivo: 'invitacion_no_encontrada' })
  })

  it('sin correo o sin uid: no se hace nada', async () => {
    await limpiar(); await invitar(INVITADO, 'admin')
    expect(await aplicar('U-X', null)).toMatchObject({ resultado: 'omitida', motivo: 'sin_correo' })
    expect(await aplicar('', INVITADO)).toMatchObject({ resultado: 'omitida', motivo: 'sin_correo' })
    expect(await aplicar('U-X', '   ')).toMatchObject({ resultado: 'omitida', motivo: 'sin_correo' })
  })
})

describe('14 y 15 · el caso reportado', () => {
  it('14 · sesión joseponcer@vivebienn.com con una invitación para joseponcep@gp-once.com: NO consume, NO cambia', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin'); await cuenta('U-PRIMERA', PRIMERA, 'cliente')
    expect(await aplicar('U-PRIMERA', PRIMERA)).toMatchObject({ resultado: 'omitida', motivo: 'invitacion_no_encontrada' })
    expect(await rol('U-PRIMERA')).toBe('cliente')
    expect(await inv(INVITADO)).toMatchObject({ estado: 'pendiente', aceptada_por: null })
  })

  it('15 · la misma invitación con la sesión de joseponcep@gp-once.com: la consume y asigna super_admin', async () => {
    await limpiar(); await invitar(INVITADO, 'super_admin'); await cuenta('U-PRIMERA', PRIMERA, 'cliente')
    await aplicar('U-PRIMERA', PRIMERA)
    expect(await aplicar('U-PEPE', INVITADO)).toMatchObject({ resultado: 'aplicada', rol: 'super_admin' })
    expect(await rol('U-PEPE')).toBe('super_admin')
    expect(await inv(INVITADO)).toMatchObject({ estado: 'aceptada', aceptada_por: 'U-PEPE' })
    expect(await rol('U-PRIMERA')).toBe('cliente')
  })

  it('el UID no es la identidad: otro uid con el correo invitado también sube SI su correo verificado coincide (y solo ese)', async () => {
    await limpiar(); await invitar(INVITADO, 'admin')
    expect(await aplicar('U-CUALQUIERA', 'otro@x.test')).toMatchObject({ resultado: 'omitida' })
    expect(await rol('U-CUALQUIERA')).toBeUndefined()
  })
})

describe('permisos y reversa', () => {
  it('solo `service_role` puede ejecutarla; la función es `security invoker` con `search_path` vacío', async () => {
    const f = (await d.query<{ definer: boolean; cfg: string[]; anon: boolean; auth: boolean; svc: boolean }>(`
      select p.prosecdef as definer, p.proconfig as cfg,
             has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
             has_function_privilege('service_role', p.oid, 'execute') as svc
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'invitacion_aplicar'`)).rows[0]
    expect(f).toMatchObject({ definer: false, anon: false, auth: false, svc: true })
    expect(f.cfg.join(',')).toMatch(/search_path=""/)
  })

  it('la reversa la quita sin tocar datos', async () => {
    const e = new PGlite()
    await e.exec(BASE)
    await e.exec(sql('32-invitacion-aplicar-atomica.sql'))
    await e.exec(`insert into public.invitaciones (email, rol, invitado_por) values ('a@x.test','admin','seed')`)
    await e.exec(sql('32-invitacion-aplicar-atomica.REVERTIR.sql'))
    expect((await e.query(`select 1 from pg_proc where proname = 'invitacion_aplicar'`)).rows).toHaveLength(0)
    expect((await e.query(`select count(*)::int as n from public.invitaciones`)).rows[0]).toMatchObject({ n: 1 })
    await e.close()
  })
})
