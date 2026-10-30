import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 31 — cambios sensibles de SUPER_ADMIN en UNA transacción.
 *
 * En PGlite (Postgres real, en memoria). Se demuestra:
 *   · `configuracion_cambiar_flag`: cambia SÓLO esa clave (no reescribe las demás), sube la
 *     versión, detecta conflicto, rechaza claves inventadas y deja la bitácora completa;
 *   · `usuario_cambiar_rol_estado`: rol y/o estado, con motivo obligatorio al dar o quitar el
 *     nivel de admin, y el candado del último super admin aborta TODO (cambio y huella);
 *   · ATOMICIDAD: si la bitácora falla, el cambio no queda;
 *   · sólo `service_role` puede ejecutarlas; la reversa las quita.
 */

const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')

const BASE = `
  create role anon; create role authenticated; create role service_role;
  create table public.usuarios (uid text primary key, rol text not null default 'cliente' check (rol in ('cliente','publicador','admin','super_admin')), estado text not null default 'activo');
  create table public.configuracion (
    clave text primary key, valor jsonb not null check (jsonb_typeof(valor) = 'object'),
    version integer not null default 1, actualizado_por text, actualizado_en timestamptz not null default now());
  create table public.audit_logs (
    id bigint generated always as identity primary key, actor_uid text not null, actor_email text, actor_rol text,
    accion text not null, entidad text not null, entidad_id text, antes jsonb, despues jsonb, creado_en timestamptz not null default now());
  -- el candado de la migración 21, en versión mínima: no se degrada al ÚLTIMO super admin activo
  create function public.proteger_ultimo_super_admin() returns trigger language plpgsql as $$
  begin
    if old.rol = 'super_admin' and old.estado = 'activo'
       and (new.rol <> 'super_admin' or new.estado <> 'activo')
       and (select count(*) from public.usuarios where rol = 'super_admin' and estado = 'activo') <= 1 then
      raise exception 'ultimo_super_admin: no se puede dejar el sistema sin Super Admin activo';
    end if;
    return new;
  end $$;
  create trigger usuarios_ultimo_super_admin before update on public.usuarios
    for each row execute function public.proteger_ultimo_super_admin();
  insert into public.usuarios (uid, rol) values ('SUP','super_admin'), ('ADM','admin'), ('PUB','publicador'), ('CLI','cliente');
  insert into public.configuracion (clave, valor) values ('flags', '{"portalCliente": true, "citasEnLinea": false, "marketingHub": false}');
`

async function nueva(): Promise<PGlite> {
  const d = new PGlite()
  await d.exec(BASE)
  await d.exec(sql('31-superadmin-mutaciones-atomicas.sql'))
  return d
}

const AUDIT = (extra: Record<string, unknown> = {}, motivo: unknown = 'Apertura interna para revisar') => JSON.stringify({
  actor_uid: 'SUP', actor_email: 'sup@x.test', actor_rol: 'admin', accion: 'configuracion.flag',
  antes: { valor: false }, despues: { valor: true, motivo }, ...extra,
})

const flag = async (d: PGlite, o: { flag?: string; antes?: boolean | null; a?: boolean | null; audit?: string } = {}) =>
  (await d.query<{ r: { resultado: string } }>(`select public.configuracion_cambiar_flag($1,$2,$3,$4::jsonb) as r`,
    [o.flag ?? 'citasEnLinea', o.antes === undefined ? false : o.antes, o.a === undefined ? true : o.a, o.audit ?? AUDIT()])).rows[0].r.resultado

const rol = async (d: PGlite, o: { uid: string; antesRol: string; antesEstado?: string; rol?: string | null; estado?: string | null; audit?: string }) =>
  (await d.query<{ r: { resultado: string } }>(`select public.usuario_cambiar_rol_estado($1,$2,$3,$4,$5,$6::jsonb) as r`,
    [o.uid, o.antesRol, o.antesEstado ?? 'activo', o.rol ?? null, o.estado ?? null, o.audit ?? AUDIT({ accion: 'usuario.editar', antes: { rol: o.antesRol }, despues: { rol: o.rol } })])).rows[0].r.resultado

const flags = async (d: PGlite) => (await d.query<{ valor: Record<string, boolean>; version: number }>(`select valor, version from public.configuracion where clave='flags'`)).rows[0]
const usuario = async (d: PGlite, uid: string) => (await d.query<{ rol: string; estado: string }>(`select rol, estado from public.usuarios where uid=$1`, [uid])).rows[0]
const nAudit = async (d: PGlite) => (await d.query<{ n: number }>(`select count(*)::int as n from public.audit_logs`)).rows[0].n

let db: PGlite
beforeAll(async () => { db = await nueva() }, 60_000)
afterAll(async () => { await db?.close() })

describe('la migración', () => {
  it('es idempotente (create or replace) y se revierte', async () => {
    await expect(db.exec(sql('31-superadmin-mutaciones-atomicas.sql'))).resolves.toBeDefined()
    const d = await nueva()
    await d.exec(sql('31-superadmin-mutaciones-atomicas.REVERTIR.sql'))
    const { rows } = await d.query<{ n: number }>(`select count(*)::int as n from pg_proc where proname in ('configuracion_cambiar_flag','usuario_cambiar_rol_estado')`)
    expect(rows[0].n).toBe(0)
    await d.close()
  }, 60_000)

  it('sólo el servidor las ejecuta (anon y authenticated no; service_role sí) y no son security definer', async () => {
    const q = async (rol: string, firma: string) => (await db.query<{ ok: boolean }>(`select has_function_privilege($1, $2, 'execute') as ok`, [rol, firma])).rows[0].ok
    const F1 = 'public.configuracion_cambiar_flag(text,boolean,boolean,jsonb)'
    const F2 = 'public.usuario_cambiar_rol_estado(text,text,text,text,text,jsonb)'
    for (const f of [F1, F2]) {
      expect(await q('anon', f)).toBe(false)
      expect(await q('authenticated', f)).toBe(false)
      expect(await q('service_role', f)).toBe(true)
    }
    const { rows } = await db.query<{ prosecdef: boolean }>(`select prosecdef from pg_proc where proname in ('configuracion_cambiar_flag','usuario_cambiar_rol_estado')`)
    expect(rows.every((r) => !r.prosecdef)).toBe(true)
  })
})

describe('configuracion_cambiar_flag', () => {
  it('ok: cambia SÓLO esa clave, sube la versión y deja la bitácora completa', async () => {
    const d = await nueva()
    expect(await flag(d)).toBe('ok')
    const f = await flags(d)
    expect(f.valor).toEqual({ portalCliente: true, citasEnLinea: true, marketingHub: false }) // las otras claves intactas
    expect(f.version).toBe(2)
    const { rows } = await d.query<Record<string, unknown>>(`select * from public.audit_logs`)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actor_uid: 'SUP', accion: 'configuracion.flag', entidad: 'configuracion', entidad_id: 'citasEnLinea' })
    expect(rows[0].despues).toMatchObject({ valor: true, motivo: 'Apertura interna para revisar' })
    await d.close()
  }, 60_000)

  it('CONCURRENCIA: dos super admins cambian módulos DISTINTOS a la vez y no se pisan', async () => {
    const d = await nueva()
    // los dos leyeron el mismo JSON; cada uno cambia una clave distinta
    expect(await flag(d, { flag: 'citasEnLinea', antes: false, a: true })).toBe('ok')
    expect(await flag(d, { flag: 'marketingHub', antes: false, a: true, audit: AUDIT({ antes: { valor: false } }) })).toBe('ok')
    expect((await flags(d)).valor).toEqual({ portalCliente: true, citasEnLinea: true, marketingHub: true }) // el segundo NO borró el primero
    await d.close()
  }, 60_000)

  it('CONCURRENCIA: si otro ya cambió ESE módulo, `conflicto` y no se escribe nada', async () => {
    const d = await nueva()
    expect(await flag(d)).toBe('ok')
    const antes = await flags(d)
    expect(await flag(d)).toBe('conflicto') // el segundo todavía creía que estaba apagado
    expect(await flags(d)).toEqual(antes)
    expect(await nAudit(d)).toBe(1)
    await d.close()
  }, 60_000)

  it('no inventa módulos: una clave que no está en el JSON → flag_desconocido, sin cambios', async () => {
    const d = await nueva()
    expect(await flag(d, { flag: 'poderTotal' })).toBe('flag_desconocido')
    expect((await flags(d)).valor).not.toHaveProperty('poderTotal')
    expect(await nAudit(d)).toBe(0)
    await d.close()
  }, 60_000)

  it('sin la fila de configuración → no_existe', async () => {
    const d = await nueva()
    await d.exec(`delete from public.configuracion`)
    expect(await flag(d)).toBe('no_existe')
    await d.close()
  }, 60_000)

  it('rechaza un cambio inválido (a lo mismo, o con nulos) y una huella incompleta, sin tocar nada', async () => {
    const d = await nueva()
    const base = JSON.parse(AUDIT())
    await expect(flag(d, { antes: false, a: false })).rejects.toThrow()
    await expect(flag(d, { antes: null })).rejects.toThrow()
    await expect(flag(d, { a: null })).rejects.toThrow()
    for (const audit of [
      { ...base, antes: undefined }, { ...base, despues: { valor: true } }, { ...base, despues: { valor: true, motivo: '123456789' } },
      { ...base, despues: { valor: true, motivo: ['abcdefghij', 'klm'] } }, { ...base, despues: { valor: true, motivo: '\t'.repeat(12) } },
      { ...base, actor_uid: '  ' }, { ...base, accion: '' },
    ]) await expect(flag(d, { audit: JSON.stringify(audit) })).rejects.toThrow()
    await expect(flag(d, { audit: 'null' })).rejects.toThrow()
    expect(await flags(d)).toEqual({ valor: { portalCliente: true, citasEnLinea: false, marketingHub: false }, version: 1 })
    expect(await nAudit(d)).toBe(0)
    await d.close()
  }, 90_000)

  it('ATOMICIDAD: si la bitácora falla DESPUÉS de cambiar el módulo, el módulo no cambia', async () => {
    const d = await nueva()
    await d.exec(`create function public.rompe() returns trigger language plpgsql as $$ begin raise exception 'bitacora_caida'; end $$;
                  create trigger romper before insert on public.audit_logs for each row execute function public.rompe();`)
    await expect(flag(d)).rejects.toThrow(/bitacora_caida/)
    expect(await flags(d)).toEqual({ valor: { portalCliente: true, citasEnLinea: false, marketingHub: false }, version: 1 })
    await d.close()
  }, 60_000)
})

describe('usuario_cambiar_rol_estado', () => {
  it('ok: da el rol de admin con motivo y deja UNA fila de bitácora con quién, a quién, antes, después y motivo', async () => {
    const d = await nueva()
    const audit = JSON.stringify({ actor_uid: 'SUP', actor_email: 'sup@x.test', actor_rol: 'admin', accion: 'usuario.editar',
      antes: { rol: 'publicador', estado: 'activo' }, despues: { rol: 'admin', motivo: 'Entra al equipo de atención' } })
    expect(await rol(d, { uid: 'PUB', antesRol: 'publicador', rol: 'admin', audit })).toBe('ok')
    expect(await usuario(d, 'PUB')).toEqual({ rol: 'admin', estado: 'activo' })
    const { rows } = await d.query<Record<string, unknown>>(`select * from public.audit_logs`)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actor_uid: 'SUP', entidad: 'usuarios', entidad_id: 'PUB', accion: 'usuario.editar' })
    expect(rows[0].despues).toMatchObject({ rol: 'admin', motivo: 'Entra al equipo de atención' })
    await d.close()
  }, 60_000)

  it('dar o quitar el nivel de admin SIN motivo textual no se hace (de cliente→admin, admin→cliente), pero cliente↔publicador no lo exige', async () => {
    const d = await nueva()
    const sinMotivo = JSON.stringify({ actor_uid: 'SUP', accion: 'usuario.editar', antes: { rol: 'x' }, despues: { rol: 'y' } })
    await expect(rol(d, { uid: 'CLI', antesRol: 'cliente', rol: 'admin', audit: sinMotivo })).rejects.toThrow()
    await expect(rol(d, { uid: 'ADM', antesRol: 'admin', rol: 'cliente', audit: sinMotivo })).rejects.toThrow()
    const corto = JSON.stringify({ actor_uid: 'SUP', accion: 'usuario.editar', antes: {}, despues: { motivo: 'corto' } })
    await expect(rol(d, { uid: 'CLI', antesRol: 'cliente', rol: 'admin', audit: corto })).rejects.toThrow()
    expect(await usuario(d, 'CLI')).toEqual({ rol: 'cliente', estado: 'activo' })
    expect(await usuario(d, 'ADM')).toEqual({ rol: 'admin', estado: 'activo' })
    // cliente → publicador no es nivel admin: no exige motivo
    expect(await rol(d, { uid: 'CLI', antesRol: 'cliente', rol: 'publicador', audit: sinMotivo })).toBe('ok')
    await d.close()
  }, 90_000)

  it('suspender / reactivar (sólo estado) funciona y se audita', async () => {
    const d = await nueva()
    expect(await rol(d, { uid: 'CLI', antesRol: 'cliente', estado: 'suspendido', audit: AUDIT({ accion: 'usuario.editar', antes: { estado: 'activo' }, despues: { estado: 'suspendido' } }) })).toBe('ok')
    expect(await usuario(d, 'CLI')).toEqual({ rol: 'cliente', estado: 'suspendido' })
    expect(await nAudit(d)).toBe(1)
    await d.close()
  }, 60_000)

  it('CONCURRENCIA: si la cuenta ya no es como se leyó → conflicto, sin cambios ni bitácora', async () => {
    const d = await nueva()
    await d.exec(`update public.usuarios set estado = 'suspendido' where uid = 'CLI'`)
    expect(await rol(d, { uid: 'CLI', antesRol: 'cliente', antesEstado: 'activo', rol: 'publicador' })).toBe('conflicto')
    expect(await usuario(d, 'CLI')).toEqual({ rol: 'cliente', estado: 'suspendido' })
    expect(await nAudit(d)).toBe(0)
    await d.close()
  }, 60_000)

  it('no_existe, y un cambio vacío (rol y estado nulos) se rechaza', async () => {
    const d = await nueva()
    expect(await rol(d, { uid: 'NOPE', antesRol: 'cliente', rol: 'publicador' })).toBe('no_existe')
    await expect(rol(d, { uid: 'CLI', antesRol: 'cliente' })).rejects.toThrow()
    await d.close()
  }, 60_000)

  it('el candado del ÚLTIMO super admin aborta TODO: ni cambio ni huella', async () => {
    const d = await nueva()
    const audit = JSON.stringify({ actor_uid: 'ADM', accion: 'usuario.editar', antes: { rol: 'super_admin' }, despues: { rol: 'admin', motivo: 'Intento de dejar el sistema sin super admin' } })
    await expect(rol(d, { uid: 'SUP', antesRol: 'super_admin', rol: 'admin', audit })).rejects.toThrow(/ultimo_super_admin/)
    expect(await usuario(d, 'SUP')).toEqual({ rol: 'super_admin', estado: 'activo' })
    expect(await nAudit(d)).toBe(0)
    await d.close()
  }, 60_000)

  it('ATOMICIDAD: si la bitácora falla después de cambiar el rol, el rol no cambia', async () => {
    const d = await nueva()
    await d.exec(`create function public.rompe() returns trigger language plpgsql as $$ begin raise exception 'bitacora_caida'; end $$;
                  create trigger romper before insert on public.audit_logs for each row execute function public.rompe();`)
    await expect(rol(d, { uid: 'CLI', antesRol: 'cliente', rol: 'publicador' })).rejects.toThrow(/bitacora_caida/)
    expect(await usuario(d, 'CLI')).toEqual({ rol: 'cliente', estado: 'activo' })
    await d.close()
  }, 60_000)

  it('huella incompleta (sin actor, acción, antes o después) → no hay cambio', async () => {
    const d = await nueva()
    for (const audit of [
      { actor_uid: '', accion: 'a', antes: {}, despues: {} }, { actor_uid: 'x', accion: ' ', antes: {}, despues: {} },
      { actor_uid: 'x', accion: 'a', despues: {} }, { actor_uid: 'x', accion: 'a', antes: {} }, { actor_uid: 'x', accion: 'a', antes: 'x', despues: {} },
    ]) await expect(rol(d, { uid: 'CLI', antesRol: 'cliente', rol: 'publicador', audit: JSON.stringify(audit) })).rejects.toThrow()
    expect(await usuario(d, 'CLI')).toEqual({ rol: 'cliente', estado: 'activo' })
    expect(await nAudit(d)).toBe(0)
    await d.close()
  }, 60_000)
})
