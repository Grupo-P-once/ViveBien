import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Migración 50: cuentas de gasto editables (con bitácora) y registro de reportes quincenales enviados, contra Postgres real (PGlite). */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
let d: PGlite
const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);
  create table public.audit_logs (id bigserial primary key, actor_uid text, actor_email text, actor_rol text, accion text, entidad text, entidad_id text, antes jsonb, despues jsonb);
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to service_role;
  alter default privileges in schema public grant all on sequences to service_role;
  grant all on all tables in schema public to service_role;
  grant all on all sequences in schema public to service_role;
`
const audit = JSON.stringify({ actor_uid: 'u-super', actor_email: 'super@vb.mx', actor_rol: 'super_admin', accion: 'contabilidad.cuenta_cambiada', antes: { nombre: 'Meta Ads' }, despues: { nombre: 'Meta Ads MX' } })
const q = (j: unknown) => JSON.stringify(j).replace(/'/g, "''")
const cuenta = async (o: Record<string, unknown>) => (await d.query<{ r: { resultado: string; id: string } }>(`select public.contab_cuenta_registrar('${q(o)}'::jsonb, '${audit}'::jsonb) r`)).rows[0].r
const cambiar = async (id: string, c: unknown) => (await d.query<{ r: Record<string, unknown> }>(`select public.contab_cuenta_cambiar('${id}'::uuid, '${q(c)}'::jsonb, '${audit}'::jsonb) r`)).rows[0].r
const cambiarFalla = (id: string, c: unknown) => d.query(`select public.contab_cuenta_cambiar('${id}'::uuid, '${q(c)}'::jsonb, '${audit}'::jsonb)`).then(() => null, (e: Error) => e.message)
const fila = async (id: string) => (await d.query<{ nombre: string; categoria: string; identificador: string | null; notas: string | null; activa: boolean }>(`select nombre, categoria, identificador, notas, activa from public.contab_cuentas where id = '${id}'`)).rows[0]
const reservar = async (desde: string, hasta: string, origen = 'cron') => (await d.query<{ r: { resultado: string } }>(`select public.contab_reporte_reservar('quincenal', '${desde}', '${hasta}', '${origen}') r`)).rows[0].r.resultado
const marcar = async (desde: string, hasta: string) => (await d.query<{ r: { resultado: string } }>(`select public.contab_reporte_marcar_enviado('quincenal', '${desde}', '${hasta}') r`)).rows[0].r.resultado
const priv = async (rol: string, p: string) => (await d.query<{ t: boolean }>(`select has_table_privilege('${rol}', 'public.contab_reportes_enviados', '${p}') t`)).rows[0].t

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  for (const f of ['38-propiedad-interno.sql', '43-origen-acreditacion-y-operaciones.sql', '48-contabilidad-comisiones.sql', '50-contabilidad-cuentas-editables-y-reportes.sql']) await d.exec(sql(f))
})
afterAll(async () => { await d.close() })

describe('migración 50 — cuentas editables', () => {
  it('se puede correr dos veces', async () => { await d.exec(sql('50-contabilidad-cuentas-editables-y-reportes.sql')) })
  it('cambia nombre, tipo, identificador y notas, deja bitácora y el historial no se toca', async () => {
    const a = await cuenta({ nombre: 'Meta Ads', categoria: 'publicidad_digital', identificador: '33839', creado_por: 'super@vb.mx' })
    expect((await cambiar(a.id, { nombre: '  Meta Ads MX ', categoria: 'software_suscripciones', identificador: '40001', notas: 'Cuenta nueva' })).resultado).toBe('ok')
    expect(await fila(a.id)).toEqual({ nombre: 'Meta Ads MX', categoria: 'software_suscripciones', identificador: '40001', notas: 'Cuenta nueva', activa: true })
    expect((await cambiar(a.id, { identificador: null })).resultado).toBe('ok')
    expect((await fila(a.id)).identificador).toBeNull()
    expect(Number((await d.query<{ n: string }>(`select count(*) n from public.audit_logs where entidad = 'contab_cuentas' and entidad_id = '${a.id}'`)).rows[0].n)).toBe(3) // el alta y los dos cambios
  })
  it('un nombre + identificador que ya usa otra cuenta responde ya_existe y no cambia nada', async () => {
    const a = await cuenta({ nombre: 'Lonas El Juanito', categoria: 'publicidad_impresa', creado_por: 'super@vb.mx' })
    const b = await cuenta({ nombre: 'Lonas La Esquina', categoria: 'publicidad_impresa', creado_por: 'super@vb.mx' })
    expect((await cambiar(b.id, { nombre: 'lonas el juanito' })).resultado).toBe('ya_existe')
    expect((await fila(b.id)).nombre).toBe('Lonas La Esquina')
    expect((await fila(a.id)).nombre).toBe('Lonas El Juanito')
  })
  it('rechaza lo mal formado: tipos, categoría inexistente, nombre corto, correos, números largos, claves ajenas', async () => {
    const a = await cuenta({ nombre: 'Gasolina', categoria: 'transporte', creado_por: 'super@vb.mx' })
    const casos: unknown[] = [{ nombre: 5 }, { categoria: 'inventada' }, { nombre: 'x' }, { nombre: 'ana@correo.mx' }, { identificador: 'ana@correo.mx' }, { nombre: 'Tarjeta 4111111111111111' }, { activa: 'si' }, { creado_por: 'otro@vb.mx' }, { id: '00000000-0000-0000-0000-000000000000' }]
    for (const c of casos) expect(String(await cambiarFalla(a.id, c)), JSON.stringify(c)).toMatch(/cambio_invalido|violates check/)
    expect(await fila(a.id)).toMatchObject({ nombre: 'Gasolina', categoria: 'transporte' })
    await expect(d.query(`select public.contab_cuenta_cambiar('${a.id}'::uuid, '${q({ nombre: 'Combustible' })}'::jsonb, '{}'::jsonb)`)).rejects.toThrow(/auditoria_incompleta/)
  })
  it('una cuenta que no existe responde no_existe; seguir sin borrar ni vaciar ni cambiar quién la creó', async () => {
    expect((await cambiar('00000000-0000-0000-0000-000000000000', { nombre: 'Algo' })).resultado).toBe('no_existe')
    const a = await cuenta({ nombre: 'Papelería', categoria: 'oficina', creado_por: 'super@vb.mx' })
    await expect(d.exec(`delete from public.contab_cuentas where id = '${a.id}'`)).rejects.toThrow(/no se borra/)
    await expect(d.exec(`update public.contab_cuentas set creado_por = 'otro@vb.mx' where id = '${a.id}'`)).rejects.toThrow(/no cambian/)
    await expect(d.exec('truncate public.contab_cuentas')).rejects.toThrow()
  })
})

describe('migración 50 — reportes quincenales enviados', () => {
  it('nadie salvo el servidor la toca, y el servidor no borra ni vacía', async () => {
    for (const rol of ['anon', 'authenticated']) for (const p of ['select', 'insert', 'update', 'delete']) expect(await priv(rol, p), `${rol} ${p}`).toBe(false)
    expect([await priv('service_role', 'select'), await priv('service_role', 'insert'), await priv('service_role', 'update')]).toEqual([true, true, true])
    for (const p of ['delete', 'truncate']) expect(await priv('service_role', p), p).toBe(false)
  })
  it('reservar → enviar → un segundo intento ya no manda', async () => {
    expect(await reservar('2026-10-01', '2026-10-15')).toBe('ok')
    expect(await reservar('2026-10-01', '2026-10-15')).toBe('en_curso')
    expect(await marcar('2026-10-01', '2026-10-15')).toBe('ok')
    expect(await reservar('2026-10-01', '2026-10-15')).toBe('ya_enviado')
    expect(await marcar('2026-10-01', '2026-10-15')).toBe('no_reservado')
  })
  it('una reserva que quedó colgada más de 10 minutos se puede volver a tomar', async () => {
    expect(await reservar('2026-09-16', '2026-09-30')).toBe('ok')
    await d.exec(`update public.contab_reportes_enviados set reservado_en = now() - interval '11 minutes' where desde = '2026-09-16'`)
    expect(await reservar('2026-09-16', '2026-09-30', 'manual')).toBe('ok')
    expect(await marcar('2026-09-16', '2026-09-30')).toBe('ok')
  })
  it('lo enviado no se modifica ni se borra ni se vacía; fechas al revés se rechazan', async () => {
    await expect(d.exec(`update public.contab_reportes_enviados set estado = 'reservado', enviado_en = null where desde = '2026-10-01'`)).rejects.toThrow(/no se modifica/)
    await expect(d.exec(`update public.contab_reportes_enviados set desde = '2026-01-01' where desde = '2026-10-01'`)).rejects.toThrow(/no se modifica/)
    await expect(d.exec(`delete from public.contab_reportes_enviados`)).rejects.toThrow(/no se borra/)
    await expect(d.exec('truncate public.contab_reportes_enviados')).rejects.toThrow(/no se vacía/)
    await expect(d.query(`select public.contab_reporte_reservar('quincenal', '2026-11-15', '2026-11-01', 'cron')`)).rejects.toThrow(/cambio_invalido/)
    await expect(d.query(`select public.contab_reporte_reservar('semanal', '2026-11-01', '2026-11-07', 'cron')`)).rejects.toThrow(/cambio_invalido/)
  })
})
