import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Migración 46: fecha de cierre de las operaciones de comisión, contra Postgres real (PGlite). */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
let d: PGlite
const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);
  insert into public.propiedades values ('p1');
  create table public.audit_logs (id bigserial primary key, actor_uid text, actor_email text, actor_rol text, accion text, entidad text, entidad_id text, antes jsonb, despues jsonb);
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to service_role;
  grant all on all sequences in schema public to service_role;
`
const audit = JSON.stringify({ actor_uid: 'u-admin', actor_email: 'admin@vb.mx', actor_rol: 'admin', accion: 'x', antes: {}, despues: {} })
const dias = (n: number) => `(current_date + ${n})::text`
const datos = (extra: Record<string, unknown> = {}, clave = 'op-46-0001') => JSON.stringify({
  propiedad_id: 'p1', tipo: 'venta', base_centavos: 500_000_000, regla_version: 'v', total_centavos: 17_500_000, vivebien_centavos: 17_500_000,
  colaborador_centavos: 0, colaborador_retenido_centavos: 0, reparto_estado: 'no_aplica', retencion: 'sin_colaborador', atribuible: false,
  clave_idempotencia: clave, creado_por: 'asesor@vb.mx', ...extra,
})
const registrar = async (json: string) => (await d.query<{ r: { resultado: string; id?: string } }>(`select public.comision_operacion_registrar('${json.replace(/'/g, "''")}'::jsonb, '${audit}'::jsonb) as r`)).rows[0].r
const falla = (q: string) => d.query(q).then(() => null, (e: Error) => e.message)

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  for (const f of ['38-propiedad-interno.sql', '43-origen-acreditacion-y-operaciones.sql']) await d.exec(sql(f))
  // Una operación creada ANTES de la 46 (sin fecha de cierre).
  await d.exec("insert into public.comision_operaciones (propiedad_id, tipo, base_centavos, regla_version, total_centavos, vivebien_centavos, colaborador_centavos, colaborador_retenido_centavos, reparto_estado, atribuible, clave_idempotencia, creado_por) values ('p1','renta',100000,'v',100000,100000,0,0,'no_aplica',false,'op-vieja-0001','asesor@vb.mx')")
  await d.exec(sql('46-comision-fecha-de-cierre.sql'))
})
afterAll(async () => { await d.close() })

describe('migración 46 — fecha de cierre', () => {
  it('se puede correr dos veces y la operación anterior queda sin fecha', async () => {
    await d.exec(sql('46-comision-fecha-de-cierre.sql'))
    const f = (await d.query<{ fecha_cierre: string | null }>("select fecha_cierre::text from public.comision_operaciones where clave_idempotencia = 'op-vieja-0001'")).rows[0]
    expect(f.fecha_cierre).toBeNull()
  })
  it('registrar sin fecha sigue funcionando (compatibilidad con lo ya desplegado)', async () => {
    expect((await registrar(datos({}, 'op-46-sin-fecha'))).resultado).toBe('ok')
  })
  it('registrar con fecha de cierre la guarda', async () => {
    const r = await registrar(datos({ fecha_cierre: '2026-10-20' }, 'op-46-con-fecha'))
    expect(r.resultado).toBe('ok')
    const f = (await d.query<{ fecha_cierre: string }>(`select fecha_cierre::text from public.comision_operaciones where id = '${r.id}'`)).rows[0]
    expect(f.fecha_cierre).toBe('2026-10-20')
  })
  it('hoy y mañana valen; pasado mañana (futuro) y fechas antes del 2000 o con basura, no', async () => {
    const hoy = (await d.query<{ h: string }>(`select ${dias(0)} h`)).rows[0].h
    const man = (await d.query<{ h: string }>(`select ${dias(1)} h`)).rows[0].h
    const pas = (await d.query<{ h: string }>(`select ${dias(2)} h`)).rows[0].h
    expect((await registrar(datos({ fecha_cierre: hoy }, 'op-46-hoy'))).resultado).toBe('ok')
    expect((await registrar(datos({ fecha_cierre: man }, 'op-46-man'))).resultado).toBe('ok')
    for (const [i, malo] of [pas, '1999-12-31', 'ayer', '2026-13-45', 12345].entries()) {
      expect(await falla(`select public.comision_operacion_registrar('${datos({ fecha_cierre: malo }, 'op-46-mala-' + i)}'::jsonb, '${audit}'::jsonb)`)).toMatch(/cambio_invalido/)
    }
  })
  it('guarda la copia de la propiedad (folio, título, precio de lista) y no se puede editar', async () => {
    const r = await registrar(datos({ fecha_cierre: '2026-10-22', propiedad_folio: 'VB-2026-00001', propiedad_titulo: 'Oficina de prueba', precio_lista_centavos: 520_000_000 }, 'op-46-copia'))
    expect(r.resultado).toBe('ok')
    const f = (await d.query<{ propiedad_folio: string; propiedad_titulo: string; precio_lista_centavos: string }>(`select propiedad_folio, propiedad_titulo, precio_lista_centavos::text from public.comision_operaciones where id = '${r.id}'`)).rows[0]
    expect(f).toEqual({ propiedad_folio: 'VB-2026-00001', propiedad_titulo: 'Oficina de prueba', precio_lista_centavos: '520000000' })
    await expect(d.exec(`update public.comision_operaciones set propiedad_titulo = 'Otro' where id = '${r.id}'`)).rejects.toThrow(/no se edita/)
    await expect(d.exec(`update public.comision_operaciones set precio_lista_centavos = 1 where id = '${r.id}'`)).rejects.toThrow(/no se edita/)
  })
  it('rechaza un precio de lista no positivo o un folio demasiado largo', async () => {
    expect(await falla(`select public.comision_operacion_registrar('${datos({ precio_lista_centavos: 0 }, 'op-46-lista-0')}'::jsonb, '${audit}'::jsonb)`)).toMatch(/cambio_invalido/)
    expect(await falla(`select public.comision_operacion_registrar('${datos({ propiedad_folio: 'x'.repeat(41) }, 'op-46-folio-largo')}'::jsonb, '${audit}'::jsonb)`)).toMatch(/cambio_invalido/)
  })
  it('un reintento con la misma clave sigue siendo idempotente', async () => {
    const a = await registrar(datos({ fecha_cierre: '2026-10-21' }, 'op-46-idem'))
    const b = await registrar(datos({ fecha_cierre: '2026-10-21' }, 'op-46-idem'))
    expect(b).toMatchObject({ resultado: 'repetida', id: a.id })
  })
  it('la fecha de cierre no se edita: ni con el permiso original', async () => {
    await expect(d.exec("update public.comision_operaciones set fecha_cierre = '2026-01-01' where clave_idempotencia = 'op-46-con-fecha'")).rejects.toThrow(/no se edita/)
    await expect(d.exec("update public.comision_operaciones set fecha_cierre = '2026-01-01' where clave_idempotencia = 'op-vieja-0001'")).rejects.toThrow(/no se edita/)
  })
  it('la reversa quita la columna y deja las funciones como en la 43', async () => {
    await d.exec(sql('46-comision-fecha-de-cierre.REVERTIR.sql'))
    const c = (await d.query<{ n: string }>("select count(*) n from information_schema.columns where table_name = 'comision_operaciones' and column_name = 'fecha_cierre'")).rows[0]
    expect(Number(c.n)).toBe(0)
    const c2 = (await d.query<{ n: string }>("select count(*) n from information_schema.columns where table_name = 'comision_operaciones' and column_name in ('propiedad_folio','propiedad_titulo','precio_lista_centavos')")).rows[0]
    expect(Number(c2.n)).toBe(0)
    expect((await registrar(datos({}, 'op-46-post-reversa'))).resultado).toBe('ok')
    expect(await falla(`select public.comision_operacion_registrar('${datos({ fecha_cierre: '2026-10-20' }, 'op-46-post-reversa-2')}'::jsonb, '${audit}'::jsonb)`)).toMatch(/cambio_invalido/)
  })
})
