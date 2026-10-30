import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { calcularComision } from '../src/lib/comision-calculo'

/** Migración 53: «aportación a una empresa del grupo» (sale, no es gasto) y «pago al colaborador» (ligado a una operación, tope = lo que falta pagarle). Contra Postgres real (PGlite). */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);
  insert into public.propiedades values ('p1'), ('p2');
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
const mov = (extra: Record<string, unknown>) => ({ fecha: '2026-10-26', clase: 'aportacion_grupo', monto_centavos: 4_000_000, concepto: 'Aportación de capital a ANDAX', clave_idempotencia: `mov-53-${String(++n).padStart(4, '0')}`, creado_por: 'super@vb.mx', ...extra })
const reg = async (o: Record<string, unknown>) => (await q<{ r: Record<string, unknown> }>(`select public.contab_movimiento_registrar(${lit(JSON.stringify(o))}::jsonb, ${lit(audit)}::jsonb) r`))[0].r
const falla = (o: Record<string, unknown>) => q(`select public.contab_movimiento_registrar(${lit(JSON.stringify(o))}::jsonb, ${lit(audit)}::jsonb)`).then(() => null, (e: Error) => e.message)

async function operacion(clave: string, colabRetenido: number, colabLibre = 0, estado?: string) {
  const c = calcularComision({ operacion: 'renta', baseCentavos: 8_000_000, colaborador: { participa: false, acreditacion: 'pendiente', atribuible: true } })
  if (!c.ok) throw new Error('cálculo')
  const total = c.totalCentavos
  const r = (await q<{ r: { id: string } }>(`select public.comision_operacion_registrar(${lit(JSON.stringify({ propiedad_id: 'p1', tipo: 'renta', base_centavos: c.baseCentavos, regla_version: c.regla, total_centavos: total, vivebien_centavos: total - colabRetenido - colabLibre, colaborador_centavos: colabLibre, colaborador_retenido_centavos: colabRetenido, retencion: colabRetenido ? 'acreditacion_no_verificada' : null, reparto_estado: colabRetenido ? 'retenido' : colabLibre ? 'liberable' : 'no_aplica', atribuible: false, clave_idempotencia: clave, creado_por: 'super@vb.mx', fecha_cierre: '2026-09-25' }))}::jsonb, ${lit(audit)}::jsonb) r`))[0].r
  if (estado) await q(`select public.comision_operacion_cambiar_estado('${r.id}', 'registrada', '${estado}', 'Se anuló por una prueba del libro', ${lit(JSON.stringify({ actor_uid: 'otro', actor_email: 'otro@vb.mx', actor_rol: 'admin', accion: 'x.y', antes: {}, despues: {} }))}::jsonb)`)
  return r.id
}

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  for (const f of ['38-propiedad-interno.sql', '43-origen-acreditacion-y-operaciones.sql', '46-comision-fecha-de-cierre.sql', '47-comision-ajustes-y-gastos.sql', '48-contabilidad-comisiones.sql', '53-contabilidad-aportaciones-al-grupo.sql']) await d.exec(sql(f))
})
afterAll(async () => { await d.close() })

describe('migración 53 — aportación a una empresa del grupo', () => {
  it('se puede correr dos veces', async () => { await d.exec(sql('53-contabilidad-aportaciones-al-grupo.sql')) })
  it('se registra como salida con su categoría fija; no es un gasto y deja bitácora', async () => {
    const r = await reg(mov({}))
    expect(r.resultado).toBe('ok')
    const f = (await q<{ clase: string; sentido: string; categoria: string }>(`select clase, sentido, categoria from public.contab_movimientos where id = '${r.id}'`))[0]
    expect(f).toEqual({ clase: 'aportacion_grupo', sentido: 'sale', categoria: 'aportacion_grupo' })
    expect(Number((await q<{ n: string }>(`select count(*) n from public.audit_logs where entidad = 'contab_movimientos' and entidad_id = '${r.id}'`))[0].n)).toBe(1)
  })
  it('un gasto NO puede usar la categoría de aportación ni la de pago, y una aportación no pide categoría', async () => {
    expect(String(await falla(mov({ clase: 'gasto', categoria: 'aportacion_grupo' })))).toMatch(/cambio_invalido/)
    expect(String(await falla(mov({ clase: 'gasto', categoria: 'pago_colaborador' })))).toMatch(/cambio_invalido/)
    expect((await reg(mov({ categoria: 'oficina' }))).resultado).toBe('ok') // la categoría que mande el navegador se ignora: queda la fija
    const f = (await q<{ categoria: string }>(`select categoria from public.contab_movimientos order by creado_en desc limit 1`))[0]
    expect(f.categoria).toBe('aportacion_grupo')
  })
  it('no admite devolución (no es un gasto), pero sí anulación con motivo y por el monto completo', async () => {
    const r = await reg(mov({}))
    expect((await reg({ ...mov({ clase: 'devolucion', monto_centavos: 100_000, reverso_de: r.id, motivo: 'Les devolvieron una parte' }) })).resultado).toBe('no_aplica')
    expect((await reg(mov({ clase: 'anulacion', monto_centavos: 1_000, reverso_de: r.id, motivo: 'Monto equivocado en la captura' }))).resultado).toBe('monto_distinto')
    expect((await reg(mov({ clase: 'anulacion', monto_centavos: 4_000_000, reverso_de: r.id, motivo: 'Se reclasificó con el contador' }))).resultado).toBe('ok')
    expect((await reg(mov({ clase: 'anulacion', monto_centavos: 4_000_000, reverso_de: r.id, motivo: 'Otra vez la misma anulación' }))).resultado).toBe('ya_anulado')
  })
})

describe('migración 53 — pago al colaborador', () => {
  it('va ligado a una operación: sin operación es inválido, con una inexistente «no_existe»', async () => {
    expect(String(await falla(mov({ clase: 'pago_colaborador', concepto: 'Pago al colaborador' })))).toMatch(/cambio_invalido/)
    expect((await reg(mov({ clase: 'pago_colaborador', concepto: 'Pago al colaborador', operacion_id: '00000000-0000-0000-0000-000000000000' }))).resultado).toBe('no_existe')
  })
  it('registra el pago de la parte retenida SIN liberarla ni verificar nada, hereda la propiedad y respeta el tope', async () => {
    const id = await operacion('op-53-ret-0001', 4_000_000)
    const r = await reg(mov({ clase: 'pago_colaborador', concepto: 'Pago en efectivo al colaborador', operacion_id: id }))
    expect(r.resultado).toBe('ok')
    const f = (await q<{ propiedad_id: string; sentido: string; categoria: string }>(`select propiedad_id, sentido, categoria from public.contab_movimientos where id = '${r.id}'`))[0]
    expect(f).toEqual({ propiedad_id: 'p1', sentido: 'sale', categoria: 'pago_colaborador' })
    const o = (await q<{ reparto_estado: string; estado: string }>(`select reparto_estado, estado from public.comision_operaciones where id = '${id}'`))[0]
    expect(o).toEqual({ reparto_estado: 'retenido', estado: 'registrada' }) // el pago no liberó ni confirmó nada
    // ya se pagó todo: otro pago excede (disponible 0)
    expect(await reg(mov({ clase: 'pago_colaborador', monto_centavos: 100, concepto: 'Un pago de más', operacion_id: id }))).toMatchObject({ resultado: 'excede', disponible: 0 })
  })
  it('pagos parciales suman contra el tope; anular uno devuelve su lugar', async () => {
    const id = await operacion('op-53-par-0001', 4_000_000)
    const a = await reg(mov({ clase: 'pago_colaborador', monto_centavos: 1_500_000, concepto: 'Primer pago', operacion_id: id }))
    expect(a.resultado).toBe('ok')
    expect(await reg(mov({ clase: 'pago_colaborador', monto_centavos: 2_600_000, concepto: 'Segundo pago', operacion_id: id }))).toMatchObject({ resultado: 'excede', disponible: 2_500_000 })
    expect((await reg(mov({ clase: 'anulacion', monto_centavos: 1_500_000, reverso_de: a.id, motivo: 'Se capturó dos veces el primer pago' }))).resultado).toBe('ok')
    expect((await reg(mov({ clase: 'pago_colaborador', monto_centavos: 4_000_000, concepto: 'Pago completo', operacion_id: id }))).resultado).toBe('ok')
  })
  it('la parte ya liberada también cuenta; una operación anulada no admite pagos; sin colaborador no hay nada que pagar', async () => {
    const libre = await operacion('op-53-lib-0001', 0, 3_000_000)
    expect((await reg(mov({ clase: 'pago_colaborador', monto_centavos: 3_000_000, concepto: 'Pago de la parte liberada', operacion_id: libre }))).resultado).toBe('ok')
    const anulada = await operacion('op-53-anu-0001', 4_000_000, 0, 'anulada')
    expect((await reg(mov({ clase: 'pago_colaborador', concepto: 'Pago a una operación anulada', operacion_id: anulada }))).resultado).toBe('no_aplica')
    const sin = await operacion('op-53-sin-0001', 0, 0)
    expect(await reg(mov({ clase: 'pago_colaborador', monto_centavos: 100, concepto: 'No hay parte del colaborador', operacion_id: sin }))).toMatchObject({ resultado: 'excede', disponible: 0 })
  })
  it('sigue sin editarse ni borrarse ni vaciarse el libro', async () => {
    await expect(d.exec(`update public.contab_movimientos set concepto = 'otro concepto' where clase = 'aportacion_grupo'`)).rejects.toThrow(/no se edita/)
    await expect(d.exec('truncate public.contab_movimientos')).rejects.toThrow(/no se vacía/)
  })
})
