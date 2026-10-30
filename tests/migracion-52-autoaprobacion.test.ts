import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { calcularComision } from '../src/lib/comision-calculo'

/** Migración 52: el Super Admin puede confirmar el cobro de la operación que él mismo registró (con motivo, marcada «autoaprobada»); cualquier otro rol, no. Contra Postgres real (PGlite). */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);
  insert into public.propiedades values ('p1'), ('p2'), ('p3');
  create table public.audit_logs (id bigserial primary key, actor_uid text, actor_email text, actor_rol text, accion text, entidad text, entidad_id text, antes jsonb, despues jsonb);
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
`
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
const audit = (rol: string, email: string, accion = 'comision.operacion_confirmada') => JSON.stringify({ actor_uid: 'u-x', actor_email: email, actor_rol: rol, accion, antes: { estado: 'registrada' }, despues: { estado: 'confirmada' } })
let d: PGlite
const q = async <T = Record<string, unknown>>(consulta: string): Promise<T[]> => { await d.exec('set role service_role'); try { return (await d.query<T>(consulta)).rows } finally { await d.exec('reset role') } }
function datos(clave: string, propiedad: string, creadoPor: string) {
  const c = calcularComision({ operacion: 'renta', baseCentavos: 8_000_000, colaborador: { participa: false, acreditacion: 'pendiente', atribuible: true } })
  if (!c.ok) throw new Error('cálculo')
  return { propiedad_id: propiedad, tipo: 'renta', base_centavos: c.baseCentavos, regla_version: c.regla, total_centavos: c.totalCentavos, vivebien_centavos: c.viveBienCentavos, colaborador_centavos: 0, colaborador_retenido_centavos: 0, retencion: c.retencion, reparto_estado: 'no_aplica', atribuible: true, atribucion_ref: 'cita:abc-123', clave_idempotencia: clave, creado_por: creadoPor }
}
const registrar = async (clave: string, propiedad: string, por: string) =>
  (await q<{ r: { id: string } }>(`select public.comision_operacion_registrar(${lit(JSON.stringify(datos(clave, propiedad, por)))}::jsonb, ${lit(audit('admin', por, 'comision.operacion_registrada'))}::jsonb) as r`))[0].r.id
const confirmar = async (id: string, a: string) => (await q<{ r: { resultado: string; autoaprobada?: boolean } }>(`select public.comision_operacion_cambiar_estado('${id}', 'registrada', 'confirmada', 'Cobro recibido en la cuenta de VIVE BIEN', ${lit(a)}::jsonb) as r`))[0].r

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  await d.exec(sql('38-propiedad-interno.sql'))
  await d.exec('grant all on all tables in schema public to service_role')
  await d.exec(sql('43-origen-acreditacion-y-operaciones.sql'))
  await d.exec(sql('52-comision-autoaprobacion-super-admin.sql'))
})
afterAll(async () => { await d.close() })

describe('migración 52 — autoaprobación del Super Admin', () => {
  it('se puede correr dos veces', async () => { await d.exec(sql('52-comision-autoaprobacion-super-admin.sql')) })

  it('un admin que no es Super Admin NO confirma la que él registró', async () => {
    const id = await registrar('op-52-admin-0001', 'p1', 'admin@vb.mx')
    expect((await confirmar(id, audit('admin', 'ADMIN@vb.mx'))).resultado).toBe('autoaprobacion')
    expect((await q<{ estado: string }>(`select estado from public.comision_operaciones where id = '${id}'`))[0].estado).toBe('registrada')
  })

  it('el Super Admin sí confirma la suya: queda confirmada, con quién y con motivo, y la bitácora la marca «autoaprobada»', async () => {
    const id = await registrar('op-52-super-0001', 'p2', 'super@vb.mx')
    expect(await confirmar(id, audit('super_admin', 'SUPER@vb.mx'))).toMatchObject({ resultado: 'ok', autoaprobada: true })
    const f = (await q<{ estado: string; estado_por: string; estado_motivo: string }>(`select estado, estado_por, estado_motivo from public.comision_operaciones where id = '${id}'`))[0]
    expect(f).toMatchObject({ estado: 'confirmada', estado_por: 'SUPER@vb.mx', estado_motivo: 'Cobro recibido en la cuenta de VIVE BIEN' })
    const b = (await q<{ despues: Record<string, unknown>; actor_rol: string }>(`select despues, actor_rol from public.audit_logs where entidad = 'comision_operaciones' and entidad_id = '${id}' and accion = 'comision.operacion_confirmada'`))
    expect(b).toHaveLength(1)
    expect(b[0].despues).toMatchObject({ estado: 'confirmada', autoaprobada: true })
    expect(b[0].actor_rol).toBe('super_admin')
  })

  it('el motivo sigue siendo obligatorio también para el Super Admin', async () => {
    const id = await registrar('op-52-super-0002', 'p3', 'super@vb.mx')
    await expect(q(`select public.comision_operacion_cambiar_estado('${id}', 'registrada', 'confirmada', 'corto', ${lit(audit('super_admin', 'super@vb.mx'))}::jsonb)`)).rejects.toThrow(/auditoria_incompleta/)
  })

  it('confirmar la operación de OTRA persona no se marca como autoaprobada (ni siquiera el Super Admin)', async () => {
    const id = await registrar('op-52-otro-0001', 'p1', 'asesor@vb.mx')
    expect(await confirmar(id, audit('super_admin', 'super@vb.mx'))).toMatchObject({ resultado: 'ok', autoaprobada: false })
    const b = (await q<{ despues: Record<string, unknown> }>(`select despues from public.audit_logs where entidad = 'comision_operaciones' and entidad_id = '${id}' and accion = 'comision.operacion_confirmada'`))
    expect(b[0].despues).not.toHaveProperty('autoaprobada')
  })

  it('la reversa vuelve a la regla de la migración 43', async () => {
    await d.exec(sql('52-comision-autoaprobacion-super-admin.REVERTIR.sql'))
    const id = await registrar('op-52-revert-0001', 'p2', 'super@vb.mx')
    expect((await confirmar(id, audit('super_admin', 'super@vb.mx'))).resultado).toBe('autoaprobacion')
    await d.exec(sql('52-comision-autoaprobacion-super-admin.sql'))
  })
})
