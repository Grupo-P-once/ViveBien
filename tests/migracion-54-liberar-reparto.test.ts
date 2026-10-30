import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { calcularComision } from '../src/lib/comision-calculo'

/** Migración 54: el Super Admin libera la parte retenida del colaborador sin acreditación verificada (queda marcado); cualquier otro rol sigue necesitando la acreditación. Contra Postgres real (PGlite). */
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
const audit = (rol: string, accion = 'comision.reparto_liberado') => JSON.stringify({ actor_uid: 'u-x', actor_email: `${rol}@vb.mx`, actor_rol: rol, accion, antes: {}, despues: { reparto_estado: 'liberable' } })
let d: PGlite
const q = async <T = Record<string, unknown>>(consulta: string): Promise<T[]> => { await d.exec('set role service_role'); try { return (await d.query<T>(consulta)).rows } finally { await d.exec('reset role') } }

async function retenida(clave: string, propiedad: string, atribuible: boolean) {
  const c = calcularComision({ operacion: 'renta', baseCentavos: 8_000_000, colaborador: { participa: true, acreditacion: 'pendiente', atribuible } })
  if (!c.ok) throw new Error('cálculo')
  const r = (await q<{ r: { id: string } }>(`select public.comision_operacion_registrar(${lit(JSON.stringify({ propiedad_id: propiedad, tipo: 'renta', base_centavos: c.baseCentavos, regla_version: c.regla, total_centavos: c.totalCentavos, vivebien_centavos: c.viveBienCentavos, colaborador_centavos: c.colaboradorCentavos, colaborador_retenido_centavos: c.colaboradorRetenidoCentavos, retencion: c.retencion, reparto_estado: 'retenido', atribuible, atribucion_ref: atribuible ? 'cita:abc' : null, clave_idempotencia: clave, creado_por: 'asesor@vb.mx' }))}::jsonb, ${lit(audit('admin', 'comision.operacion_registrada'))}::jsonb) r`))[0].r
  return r.id
}
const liberar = async (id: string, rol: string) => (await q<{ r: { resultado: string; sin_verificacion?: boolean } }>(`select public.comision_reparto_liberar('${id}', ${lit(audit(rol))}::jsonb) r`))[0].r

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  await d.exec(sql('38-propiedad-interno.sql'))
  await d.exec('grant all on all tables in schema public to service_role')
  await d.exec(sql('43-origen-acreditacion-y-operaciones.sql'))
  await d.exec(sql('54-comision-liberar-reparto-super-admin.sql'))
})
afterAll(async () => { await d.close() })

describe('migración 54 — liberar el reparto sin acreditación (solo Super Admin)', () => {
  it('se puede correr dos veces', async () => { await d.exec(sql('54-comision-liberar-reparto-super-admin.sql')) })

  it('un admin que no es Super Admin SIGUE necesitando la acreditación verificada y la atribución', async () => {
    const id = await retenida('op-54-admin-0001', 'p1', false)
    expect((await liberar(id, 'admin')).resultado).toBe('no_elegible')
    expect((await q<{ reparto_estado: string }>(`select reparto_estado from public.comision_operaciones where id = '${id}'`))[0].reparto_estado).toBe('retenido')
  })

  it('el Super Admin libera sin acreditación ni atribución: la parte pasa a liberable y la bitácora lo marca', async () => {
    const id = await retenida('op-54-super-0001', 'p2', false)
    expect(await liberar(id, 'super_admin')).toMatchObject({ resultado: 'ok', sin_verificacion: true })
    const f = (await q<{ reparto_estado: string; colaborador_centavos: string; colaborador_retenido_centavos: string; retencion: string | null }>(`select reparto_estado, colaborador_centavos, colaborador_retenido_centavos, retencion from public.comision_operaciones where id = '${id}'`))[0]
    expect(f.reparto_estado).toBe('liberable')
    expect(Number(f.colaborador_retenido_centavos)).toBe(0)
    expect(Number(f.colaborador_centavos)).toBe(4_000_000)
    expect(f.retencion).toBeNull()
    const b = (await q<{ despues: Record<string, unknown> }>(`select despues from public.audit_logs where entidad_id = '${id}' and accion = 'comision.reparto_liberado'`))
    expect(b).toHaveLength(1)
    expect(b[0].despues).toMatchObject({ reparto_estado: 'liberable', liberada_sin_verificacion: true })
  })

  it('no se libera dos veces ni una operación anulada, tampoco el Super Admin', async () => {
    const id = await retenida('op-54-super-0002', 'p3', true)
    expect((await liberar(id, 'super_admin')).resultado).toBe('ok')
    expect((await liberar(id, 'super_admin')).resultado).toBe('conflicto')
    const otra = await retenida('op-54-super-0003', 'p1', true)
    await q(`select public.comision_operacion_cambiar_estado('${otra}', 'registrada', 'anulada', 'Se anuló la operación por una prueba', ${lit(JSON.stringify({ actor_uid: 'u-y', actor_email: 'otro@vb.mx', actor_rol: 'admin', accion: 'x.y', antes: {}, despues: {} }))}::jsonb)`)
    expect((await liberar(otra, 'super_admin')).resultado).toBe('conflicto')
  })

  it('la reversa vuelve a exigir la acreditación a todos', async () => {
    await d.exec(sql('54-comision-liberar-reparto-super-admin.REVERTIR.sql'))
    const id = await retenida('op-54-revert-0001', 'p2', false)
    expect((await liberar(id, 'super_admin')).resultado).toBe('no_elegible')
    await d.exec(sql('54-comision-liberar-reparto-super-admin.sql'))
  })
})
