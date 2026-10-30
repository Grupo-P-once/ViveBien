import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Migración 47: porcentaje pactado, reparto, gastos y motivo del ajuste de las operaciones de comisión, contra Postgres real (PGlite). */
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
const datos = (extra: Record<string, unknown> = {}, clave = 'op-47-0001') => JSON.stringify({
  propiedad_id: 'p1', tipo: 'venta', base_centavos: 300_000_000, regla_version: 'v', total_centavos: 12_000_000, vivebien_centavos: 6_000_000,
  colaborador_centavos: 6_000_000, colaborador_retenido_centavos: 0, reparto_estado: 'liberable', retencion: null, atribuible: true, atribucion_ref: 'cita:1',
  clave_idempotencia: clave, creado_por: 'asesor@vb.mx', ...extra,
})
const llamar = (json: string) => `select public.comision_operacion_registrar('${json.replace(/'/g, "''")}'::jsonb, '${audit}'::jsonb) r`
const registrar = async (json: string) => (await d.query<{ r: { resultado: string; id?: string } }>(llamar(json))).rows[0].r
const falla = (json: string) => d.query(llamar(json)).then(() => null, (e: Error) => e.message)

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  for (const f of ['38-propiedad-interno.sql', '43-origen-acreditacion-y-operaciones.sql']) await d.exec(sql(f))
  await d.exec("insert into public.comision_operaciones (propiedad_id, tipo, base_centavos, regla_version, total_centavos, vivebien_centavos, colaborador_centavos, colaborador_retenido_centavos, reparto_estado, atribuible, clave_idempotencia, creado_por) values ('p1','venta',100000000,'v',3500000,3500000,0,0,'no_aplica',false,'op-vieja-0047','asesor@vb.mx')")
  await d.exec(sql('46-comision-fecha-de-cierre.sql'))
  await d.exec(sql('47-comision-ajustes-y-gastos.sql'))
})
afterAll(async () => { await d.close() })

describe('migración 47 — ajustes y gastos', () => {
  it('se puede correr dos veces; lo anterior queda sin ajustes y con gastos vacíos', async () => {
    await d.exec(sql('47-comision-ajustes-y-gastos.sql'))
    const f = (await d.query<{ comision_bp: number | null; gastos: unknown }>("select comision_bp, gastos from public.comision_operaciones where clave_idempotencia = 'op-vieja-0047'")).rows[0]
    expect(f.comision_bp).toBeNull()
    expect(f.gastos).toEqual([])
  })
  it('registrar sin campos nuevos sigue funcionando (compatibilidad)', async () => {
    expect((await registrar(datos({}, 'op-47-sin-nuevos'))).resultado).toBe('ok')
  })
  it('guarda porcentaje, reparto, motivo y gastos tal cual', async () => {
    const gastos = [{ concepto: 'Fotografía', monto_centavos: 150_000 }, { concepto: 'Publicidad', monto_centavos: 250_000 }]
    const r = await registrar(datos({ comision_bp: 400, colaborador_bp: 5000, ajuste_motivo: 'Se negoció 4 % con el propietario', gastos }, 'op-47-completa'))
    expect(r.resultado).toBe('ok')
    const f = (await d.query<{ comision_bp: number; colaborador_bp: number; ajuste_motivo: string; gastos: unknown }>(`select comision_bp, colaborador_bp, ajuste_motivo, gastos from public.comision_operaciones where id = '${r.id}'`)).rows[0]
    expect(f).toEqual({ comision_bp: 400, colaborador_bp: 5000, ajuste_motivo: 'Se negoció 4 % con el propietario', gastos })
  })
  it('una renta guarda sus meses en centésimas', async () => {
    const r = await registrar(datos({ tipo: 'renta', base_centavos: 2_000_000, total_centavos: 3_000_000, vivebien_centavos: 3_000_000, colaborador_centavos: 0, reparto_estado: 'no_aplica', renta_meses_cent: 150, ajuste_motivo: 'Mes y medio por contrato a dos años' }, 'op-47-renta'))
    expect(r.resultado).toBe('ok')
  })
  it('rechaza porcentajes y meses fuera de rango, reparto > 100 % y motivo demasiado corto', async () => {
    const casos: Array<Record<string, unknown>> = [{ comision_bp: 49 }, { comision_bp: 1501 }, { renta_meses_cent: 24 }, { renta_meses_cent: 301 }, { colaborador_bp: 10001 }, { colaborador_bp: -1 }, { ajuste_motivo: 'corto' }, { ajuste_motivo: 'x'.repeat(301) }]
    for (const [i, c] of casos.entries()) expect(await falla(datos(c, 'op-47-rango-' + i))).toMatch(/cambio_invalido/)
  })
  it('rechaza gastos mal formados: no arreglo, demasiados, sin concepto, concepto largo, monto 0, monto decimal, texto o claves extra', async () => {
    const g = (x: unknown) => ({ gastos: x })
    const casos: Array<Record<string, unknown>> = [
      g({ concepto: 'Foto', monto_centavos: 100 }), g('hola'),
      g(Array.from({ length: 11 }, () => ({ concepto: 'x', monto_centavos: 100 }))),
      g([{ concepto: '', monto_centavos: 100 }]), g([{ concepto: '  ', monto_centavos: 100 }]), g([{ concepto: 'x'.repeat(81), monto_centavos: 100 }]),
      g([{ concepto: 'Foto', monto_centavos: 0 }]), g([{ concepto: 'Foto', monto_centavos: 1.5 }]), g([{ concepto: 'Foto', monto_centavos: '100' }]),
      g([{ concepto: 'Foto', monto_centavos: -5 }]), g([{ concepto: 'Foto' }]), g([{ concepto: 'Foto', monto_centavos: 100, extra: 'x' }]), g(['Foto']),
    ]
    for (const [i, c] of casos.entries()) expect(await falla(datos(c, 'op-47-gasto-' + i)), JSON.stringify(c).slice(0, 80)).toMatch(/cambio_invalido/)
  })
  it('rechaza gastos mayores que la parte de VIVE BIEN; con exactamente la parte, vale', async () => {
    expect(await falla(datos({ gastos: [{ concepto: 'Todo', monto_centavos: 6_000_001 }] }, 'op-47-exceso'))).toMatch(/cambio_invalido/)
    expect((await registrar(datos({ gastos: [{ concepto: 'Todo', monto_centavos: 6_000_000 }] }, 'op-47-justo'))).resultado).toBe('ok')
  })
  it('lo nuevo no se edita: ni el porcentaje, ni el reparto, ni el motivo, ni los gastos', async () => {
    for (const set of ["comision_bp = 500", "colaborador_bp = 1", "ajuste_motivo = 'otro motivo distinto'", "gastos = '[]'::jsonb"]) {
      await expect(d.exec(`update public.comision_operaciones set ${set} where clave_idempotencia = 'op-47-completa'`)).rejects.toThrow(/no se edita/)
    }
  })
  it('un reintento con la misma clave es idempotente y no duplica gastos', async () => {
    const x = datos({ gastos: [{ concepto: 'Foto', monto_centavos: 100 }] }, 'op-47-idem')
    const a = await registrar(x)
    const b = await registrar(x)
    expect(b).toMatchObject({ resultado: 'repetida', id: a.id })
  })
  it('la reversa quita lo nuevo, deja la 46 y las operaciones siguen registrándose', async () => {
    await d.exec(sql('47-comision-ajustes-y-gastos.REVERTIR.sql'))
    const c = (await d.query<{ n: string }>("select count(*) n from information_schema.columns where table_name = 'comision_operaciones' and column_name in ('comision_bp','renta_meses_cent','colaborador_bp','ajuste_motivo','gastos')")).rows[0]
    expect(Number(c.n)).toBe(0)
    const f = (await d.query<{ n: string }>("select count(*) n from information_schema.columns where table_name = 'comision_operaciones' and column_name = 'fecha_cierre'")).rows[0]
    expect(Number(f.n)).toBe(1)
    expect((await registrar(datos({ fecha_cierre: '2026-10-20' }, 'op-47-post-reversa'))).resultado).toBe('ok')
    expect(await falla(datos({ comision_bp: 400 }, 'op-47-post-reversa-2'))).toMatch(/cambio_invalido/)
  })
})
