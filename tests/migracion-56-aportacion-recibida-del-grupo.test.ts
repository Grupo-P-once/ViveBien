import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Migración 56: «aportación recibida de una empresa del grupo» (entra, no es ingreso). Contra Postgres real (PGlite). */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);
  insert into public.propiedades values ('p1');
  create table public.audit_logs (id bigserial primary key, actor_uid text, actor_email text, actor_rol text, accion text, entidad text, entidad_id text, antes jsonb, despues jsonb);
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
`
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
const audit = JSON.stringify({ actor_uid: 'u-super', actor_email: 'super@vb.mx', actor_rol: 'super_admin', accion: 'contabilidad.x', antes: {}, despues: {} })
let d: PGlite
let n = 0
const q = async <T = Record<string, unknown>>(consulta: string): Promise<T[]> => { await d.exec('set role service_role'); try { return (await d.query<T>(consulta)).rows } finally { await d.exec('reset role') } }
const mov = (extra: Record<string, unknown>) => ({ fecha: '2026-10-26', clase: 'aportacion_recibida_grupo', monto_centavos: 1_500_000, concepto: 'Aportación de ANDAX a VIVE BIEN', clave_idempotencia: `mov-56-${++n}-abcdefgh`, creado_por: 'super@vb.mx', ...extra })
const reg = async (o: Record<string, unknown>) => (await q<{ r: Record<string, unknown> }>(`select public.contab_movimiento_registrar(${lit(JSON.stringify(o))}::jsonb, ${lit(audit)}::jsonb) r`))[0].r
const falla = (o: Record<string, unknown>) => q(`select public.contab_movimiento_registrar(${lit(JSON.stringify(o))}::jsonb, ${lit(audit)}::jsonb)`).then(() => null, (e: Error) => e.message)

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  for (const f of ['38-propiedad-interno.sql', '43-origen-acreditacion-y-operaciones.sql', '46-comision-fecha-de-cierre.sql', '47-comision-ajustes-y-gastos.sql', '48-contabilidad-comisiones.sql', '53-contabilidad-aportaciones-al-grupo.sql', '56-contabilidad-aportacion-recibida-del-grupo.sql']) await d.exec(sql(f))
})
afterAll(async () => { await d.close() })

describe('migración 56 — aportación recibida de una empresa del grupo', () => {
  it('se puede correr dos veces', async () => { await d.exec(sql('56-contabilidad-aportacion-recibida-del-grupo.sql')) })
  it('se registra como ENTRADA con su categoría fija y deja bitácora; no es un ingreso extra', async () => {
    const r = await reg(mov({}))
    expect(r.resultado).toBe('ok')
    const f = (await q<{ clase: string; sentido: string; categoria: string }>(`select clase, sentido, categoria from public.contab_movimientos where id = '${r.id}'`))[0]
    expect(f).toEqual({ clase: 'aportacion_recibida_grupo', sentido: 'entra', categoria: 'aportacion_recibida_grupo' })
    expect(Number((await q<{ n: string }>(`select count(*) n from public.audit_logs where entidad = 'contab_movimientos' and entidad_id = '${r.id}'`))[0].n)).toBe(1)
  })
  it('un gasto no puede usar esa categoría y la categoría que mande el navegador se ignora', async () => {
    expect(String(await falla(mov({ clase: 'gasto', categoria: 'aportacion_recibida_grupo' })))).toMatch(/cambio_invalido/)
    expect((await reg(mov({ categoria: 'oficina' }))).resultado).toBe('ok')
    expect((await q<{ categoria: string }>(`select categoria from public.contab_movimientos order by creado_en desc limit 1`))[0].categoria).toBe('aportacion_recibida_grupo')
  })
  it('no admite devolución, pero sí anulación con motivo y por el monto completo (el contra-asiento SALE)', async () => {
    const r = await reg(mov({}))
    expect((await reg({ ...mov({ clase: 'devolucion', monto_centavos: 100 }), reverso_de: r.id, motivo: 'Prueba de devolución' })).resultado).toBe('no_aplica')
    expect((await reg({ ...mov({ clase: 'anulacion', monto_centavos: 100 }), reverso_de: r.id, motivo: 'Se registró por error' })).resultado).toBe('monto_distinto')
    const a = await reg({ ...mov({ clase: 'anulacion', monto_centavos: 1_500_000 }), reverso_de: r.id, motivo: 'Se registró por error' })
    expect(a.resultado).toBe('ok')
    expect((await q<{ sentido: string }>(`select sentido from public.contab_movimientos where id = '${a.id}'`))[0].sentido).toBe('sale')
  })
  it('las otras clases siguen igual (aportación que SALE)', async () => {
    const r = await reg(mov({ clase: 'aportacion_grupo' }))
    expect((await q<{ sentido: string }>(`select sentido from public.contab_movimientos where id = '${r.id}'`))[0].sentido).toBe('sale')
  })
  it('la reversa deja la base como estaba antes de la 56', async () => {
    const fresca = new PGlite()
    await fresca.exec(BASE)
    for (const f of ['38-propiedad-interno.sql', '43-origen-acreditacion-y-operaciones.sql', '46-comision-fecha-de-cierre.sql', '47-comision-ajustes-y-gastos.sql', '48-contabilidad-comisiones.sql', '53-contabilidad-aportaciones-al-grupo.sql', '56-contabilidad-aportacion-recibida-del-grupo.sql', '56-contabilidad-aportacion-recibida-del-grupo.REVERTIR.sql']) await fresca.exec(sql(f))
    await fresca.exec('set role service_role')
    await expect(fresca.query(`insert into public.contab_movimientos (fecha, sentido, clase, monto_centavos, categoria, concepto, clave_idempotencia, creado_por) values ('2026-10-26', 'entra', 'aportacion_recibida_grupo', 100, 'aportacion_recibida_grupo', 'x', 'clave-prueba-1', 'a@b.mx')`)).rejects.toThrow()
    await fresca.close()
  })
})
