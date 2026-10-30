import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { calcularComision } from '../src/lib/comision-calculo'

/**
 * Migración 43 (acreditación verificable del agente y operaciones de comisión) contra Postgres real (PGlite).
 * Se comprueba: solo el servidor las toca; la verificación solo entra por la función (no por INSERT ni UPDATE) y se borra si cambia el folio;
 * no hay autoaprobación; la operación suma exacto, es idempotente, inmutable y no se borra; el reparto retenido solo se libera con
 * acreditación verificada y vigente; todo deja bitácora en la misma transacción; y la reversa limpia sin tocar la migración 38.
 */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
let d: PGlite

const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);
  insert into public.propiedades values ('p1'), ('p2'), ('p3');
  create table public.audit_logs (id bigserial primary key, actor_uid text, actor_email text, actor_rol text, accion text, entidad text, entidad_id text, antes jsonb, despues jsonb);
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
`
const audit = (extra: Record<string, unknown> = {}, actor = { uid: 'u-admin', email: 'admin@vb.mx' }) =>
  JSON.stringify({ actor_uid: actor.uid, actor_email: actor.email, actor_rol: 'admin', accion: 'x.y', antes: {}, despues: { motivo: 'Comparado con el padrón oficial el 24-oct', ...extra } })
const q = async <T = Record<string, unknown>>(consulta: string, rol = 'service_role'): Promise<T[]> => {
  await d.exec(`set role ${rol}`)
  try { return (await d.query<T>(consulta)).rows } finally { await d.exec('reset role') }
}
const falla = (consulta: string, rol = 'service_role') => q(consulta, rol).then(() => null, (e: Error) => e.message)
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`

const origen = (id: string, folio: string | null, aporto = 'agente@x.mx') =>
  d.exec(`insert into public.propiedad_origen (propiedad_id, origen_tipo, creado_por, actualizado_por, acreditacion_folio, acreditacion_aporto_por)
          values ('${id}', 'inmobiliaria', 'a@x.mx', 'a@x.mx', ${folio ? lit(folio) : 'null'}, ${folio ? lit(aporto) : 'null'})`)

const verificar = (id: string, folio: string, res = 'coincide', hasta = "'2099-01-01'", a = audit()) =>
  q<{ r: { resultado: string } }>(`select public.origen_verificar_acreditacion('${id}', ${lit(folio)}, '${res}', ${hasta}, ${lit(a)}::jsonb) as r`)

function datos(sobre: Record<string, unknown> = {}) {
  const c = calcularComision({ operacion: 'renta', baseCentavos: 2_800_000, colaborador: { participa: true, acreditacion: 'pendiente', atribuible: true } })
  if (!c.ok) throw new Error('cálculo')
  return {
    propiedad_id: 'p1', tipo: 'renta', base_centavos: c.baseCentavos, regla_version: c.regla, total_centavos: c.totalCentavos,
    vivebien_centavos: c.viveBienCentavos, colaborador_centavos: c.colaboradorCentavos, colaborador_retenido_centavos: c.colaboradorRetenidoCentavos,
    retencion: c.retencion, reparto_estado: 'retenido', atribuible: true, atribucion_ref: 'cita:abc-123', clave_idempotencia: 'op-0001-renta-p1', creado_por: 'asesor@vb.mx',
    ...sobre,
  }
}
const registrar = (dt: Record<string, unknown>, a = audit()) =>
  q<{ r: { resultado: string; id?: string } }>(`select public.comision_operacion_registrar(${lit(JSON.stringify(dt))}::jsonb, ${lit(a)}::jsonb) as r`)

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  await d.exec(sql('38-propiedad-interno.sql'))
  await d.exec('grant all on all tables in schema public to service_role')
  await d.exec(sql('43-origen-acreditacion-y-operaciones.sql'))
})
afterAll(async () => { await d.close() })

describe('migración 43 — idempotente y solo del servidor', () => {
  it('se puede correr dos veces', async () => { await d.exec(sql('43-origen-acreditacion-y-operaciones.sql')) })
  it('anon y authenticated no leen ni escriben operaciones ni llaman a las funciones', async () => {
    for (const rol of ['anon', 'authenticated']) {
      expect(await falla('select * from public.comision_operaciones', rol)).toMatch(/permission denied/)
      expect(await falla(`select public.comision_reparto_liberar(gen_random_uuid(), ${lit(audit())}::jsonb)`, rol)).toMatch(/permission denied/)
      expect(await falla(`select public.origen_verificar_acreditacion('p1', 'x', 'coincide', null, ${lit(audit())}::jsonb)`, rol)).toMatch(/permission denied/)
    }
  })
})

describe('acreditación: solo la función verifica', () => {
  it('la acreditación es opcional: un origen sin folio se guarda', async () => {
    await origen('p1', null)
    const f = (await q<{ acreditacion_folio: string | null }>("select acreditacion_folio from public.propiedad_origen where propiedad_id = 'p1'"))[0]
    expect(f.acreditacion_folio).toBeNull()
  })
  it('no se puede crear una verificación por INSERT', async () => {
    expect(await falla(`insert into public.propiedad_origen (propiedad_id, origen_tipo, creado_por, actualizado_por, acreditacion_folio, acreditacion_resultado, acreditacion_vigente_hasta, acreditacion_verificado_por, acreditacion_verificado_en)
      values ('p3', 'broker', 'a@x.mx', 'a@x.mx', 'GTO-1', 'coincide', '2099-01-01', 'admin@vb.mx', now())`)).toMatch(/no se crea por inserción/)
  })
  it('sin folio no hay nada que verificar', async () => {
    expect((await verificar('p1', 'GTO-1'))[0].r.resultado).toBe('sin_folio')
  })
  it('un UPDATE directo tampoco fija la verificación', async () => {
    await origen('p2', 'GTO-2')
    expect(await falla("update public.propiedad_origen set acreditacion_resultado = 'coincide', acreditacion_vigente_hasta = '2099-01-01', acreditacion_verificado_por = 'x@x.mx', acreditacion_verificado_en = now() where propiedad_id = 'p2'")).toMatch(/solo la registra origen_verificar_acreditacion/)
  })
  it('quien aportó el folio no lo verifica (ni por correo ni por uid)', async () => {
    expect((await verificar('p2', 'GTO-2', 'coincide', "'2099-01-01'", audit({}, { uid: 'u-x', email: 'AGENTE@x.mx' })))[0].r.resultado).toBe('autoaprobacion')
    expect((await verificar('p2', 'GTO-2', 'coincide', "'2099-01-01'", audit({}, { uid: 'agente@x.mx', email: 'otro@x.mx' })))[0].r.resultado).toBe('autoaprobacion')
  })
  it('exige motivo y bitácora completos, un resultado válido y vigencia si coincide', async () => {
    expect(await falla(`select public.origen_verificar_acreditacion('p2', 'GTO-2', 'coincide', '2099-01-01', ${lit(JSON.stringify({ actor_uid: 'u', accion: 'a', antes: {}, despues: { motivo: 'corto' } }))}::jsonb)`)).toMatch(/auditoria_incompleta/)
    expect(await falla(`select public.origen_verificar_acreditacion('p2', 'GTO-2', 'verificadisimo', '2099-01-01', ${lit(audit())}::jsonb)`)).toMatch(/cambio_invalido/)
    expect(await falla(`select public.origen_verificar_acreditacion('p2', 'GTO-2', 'coincide', null, ${lit(audit())}::jsonb)`)).toMatch(/cambio_invalido/)
  })
  it('compara con el folio que vio el revisor (conflicto)', async () => {
    expect((await verificar('p2', 'OTRO-FOLIO'))[0].r.resultado).toBe('conflicto')
  })
  it('verifica, guarda quién y cuándo, y deja bitácora en la misma transacción', async () => {
    const antes = Number((await q<{ n: string }>("select count(*) as n from public.audit_logs where entidad = 'propiedad_origen'"))[0].n)
    expect((await verificar('p2', 'GTO-2'))[0].r.resultado).toBe('ok')
    const f = (await q<{ acreditacion_resultado: string; acreditacion_verificado_por: string; acreditacion_vigente_hasta: string; acreditacion_motivo: string }>("select acreditacion_resultado, acreditacion_verificado_por, acreditacion_vigente_hasta::text, acreditacion_motivo from public.propiedad_origen where propiedad_id = 'p2'"))[0]
    expect(f).toMatchObject({ acreditacion_resultado: 'coincide', acreditacion_verificado_por: 'admin@vb.mx', acreditacion_vigente_hasta: '2099-01-01' })
    expect(Number((await q<{ n: string }>("select count(*) as n from public.audit_logs where entidad = 'propiedad_origen'"))[0].n)).toBe(antes + 1)
  })
  it('si cambia el folio, la verificación se borra sola', async () => {
    await d.exec("update public.propiedad_origen set acreditacion_folio = 'GTO-NUEVO' where propiedad_id = 'p2'")
    const f = (await q<{ acreditacion_resultado: string | null; acreditacion_verificado_por: string | null }>("select acreditacion_resultado, acreditacion_verificado_por from public.propiedad_origen where propiedad_id = 'p2'"))[0]
    expect(f).toEqual({ acreditacion_resultado: null, acreditacion_verificado_por: null })
  })
  it('un folio fuera de rango no entra', async () => {
    expect(await falla("update public.propiedad_origen set acreditacion_folio = 'ab' where propiedad_id = 'p2'")).toMatch(/propiedad_origen_acreditacion_ck/)
  })
})

describe('operaciones de comisión', () => {
  let id = ''
  it('registra una operación con bitácora y la reparte exacto', async () => {
    const r = (await registrar(datos()))[0].r
    expect(r.resultado).toBe('ok')
    id = r.id!
    const f = (await q<{ total_centavos: string; vivebien_centavos: string; colaborador_retenido_centavos: string; estado: string }>(`select total_centavos, vivebien_centavos, colaborador_retenido_centavos, estado from public.comision_operaciones where id = '${id}'`))[0]
    expect(Number(f.total_centavos)).toBe(Number(f.vivebien_centavos) + Number(f.colaborador_retenido_centavos))
    expect(f.estado).toBe('registrada')
    expect(Number((await q<{ n: string }>(`select count(*) as n from public.audit_logs where entidad = 'comision_operaciones' and entidad_id = '${id}'`))[0].n)).toBe(1)
  })
  it('es idempotente: el mismo reintento devuelve la misma operación y no duplica', async () => {
    const r = (await registrar(datos()))[0].r
    expect(r).toMatchObject({ resultado: 'repetida', id })
    expect(Number((await q<{ n: string }>("select count(*) as n from public.comision_operaciones where clave_idempotencia = 'op-0001-renta-p1'"))[0].n)).toBe(1)
  })
  it('la misma clave con otros datos es un conflicto, no una segunda comisión', async () => {
    expect((await registrar(datos({ base_centavos: 9_000_000 })))[0].r.resultado).toBe('clave_en_uso')
  })
  it('rechaza un reparto que no suma, columnas ajenas y propiedades inexistentes', async () => {
    expect(await falla(`select public.comision_operacion_registrar(${lit(JSON.stringify(datos({ clave_idempotencia: 'op-0002-mal-suma', vivebien_centavos: 1 })))}::jsonb, ${lit(audit())}::jsonb)`)).toMatch(/cambio_invalido/)
    expect(await falla(`select public.comision_operacion_registrar(${lit(JSON.stringify({ ...datos({ clave_idempotencia: 'op-0003-extra' }), estado: 'confirmada' }))}::jsonb, ${lit(audit())}::jsonb)`)).toMatch(/cambio_invalido/)
    expect((await registrar(datos({ propiedad_id: 'no-existe', clave_idempotencia: 'op-0004-sin-propiedad' })))[0].r.resultado).toBe('no_existe')
  })
  it('una atribución con datos personales o caracteres raros no entra', async () => {
    expect(await falla(`select public.comision_operacion_registrar(${lit(JSON.stringify(datos({ clave_idempotencia: 'op-0005-atrib', atribucion_ref: 'Juan Pérez 4771234567' })))}::jsonb, ${lit(audit())}::jsonb)`)).toMatch(/cambio_invalido/)
  })
  it('es inmutable: ni edición, ni borrado, ni cambio directo de estado o reparto', async () => {
    expect(await falla(`update public.comision_operaciones set total_centavos = 1 where id = '${id}'`)).toMatch(/no se edita|suma/)
    expect(await falla(`update public.comision_operaciones set base_centavos = 5 where id = '${id}'`)).toMatch(/no se edita/)
    expect(await falla(`update public.comision_operaciones set estado = 'confirmada' where id = '${id}'`)).toMatch(/solo cambian por las funciones/)
    expect(await falla(`update public.comision_operaciones set reparto_estado = 'liberable' where id = '${id}'`)).toMatch(/solo cambian por las funciones|violates check/)
    expect(await falla(`delete from public.comision_operaciones where id = '${id}'`)).toMatch(/no se borra/)
  })
  it('el reparto retenido NO se libera con una acreditación sin verificar (p1 no tiene folio)', async () => {
    const r = (await q<{ r: { resultado: string } }>(`select public.comision_reparto_liberar('${id}', ${lit(audit())}::jsonb) as r`))[0].r
    expect(r.resultado).toBe('no_elegible')
  })
  it('se libera cuando el equipo verifica el folio y la operación es atribuible', async () => {
    await d.exec("update public.propiedad_origen set acreditacion_folio = 'GTO-77', acreditacion_aporto_por = 'agente@x.mx' where propiedad_id = 'p1'")
    expect((await verificar('p1', 'GTO-77'))[0].r.resultado).toBe('ok')
    const r = (await q<{ r: { resultado: string } }>(`select public.comision_reparto_liberar('${id}', ${lit(audit())}::jsonb) as r`))[0].r
    expect(r.resultado).toBe('ok')
    const f = (await q<{ reparto_estado: string; colaborador_centavos: string; colaborador_retenido_centavos: string; total_centavos: string; vivebien_centavos: string }>(`select reparto_estado, colaborador_centavos, colaborador_retenido_centavos, total_centavos, vivebien_centavos from public.comision_operaciones where id = '${id}'`))[0]
    expect(f.reparto_estado).toBe('liberable')
    expect(Number(f.colaborador_retenido_centavos)).toBe(0)
    expect(Number(f.colaborador_centavos) + Number(f.vivebien_centavos)).toBe(Number(f.total_centavos))
  })
  it('no se libera dos veces', async () => {
    expect((await q<{ r: { resultado: string } }>(`select public.comision_reparto_liberar('${id}', ${lit(audit())}::jsonb) as r`))[0].r.resultado).toBe('conflicto')
  })
  it('quien registró la operación no la confirma; otra persona sí; con motivo; y una anulada no vuelve', async () => {
    const cambiar = (nuevo: string, a: string, motivo = 'Cobro verificado en el estado de cuenta', antes = 'registrada') =>
      q<{ r: { resultado: string } }>(`select public.comision_operacion_cambiar_estado('${id}', '${antes}', '${nuevo}', ${lit(motivo)}, ${lit(a)}::jsonb) as r`)
    expect((await cambiar('confirmada', audit({}, { uid: 'u-1', email: 'ASESOR@vb.mx' })))[0].r.resultado).toBe('autoaprobacion') // (la migración 52 solo lo permite al rol super_admin)
    expect(await falla(`select public.comision_operacion_cambiar_estado('${id}', 'registrada', 'confirmada', 'corto', ${lit(audit())}::jsonb)`)).toMatch(/auditoria_incompleta/)
    expect((await cambiar('confirmada', audit(), undefined, 'confirmada'))[0].r.resultado).toBe('conflicto')
    expect((await cambiar('confirmada', audit()))[0].r.resultado).toBe('ok')
    expect((await cambiar('anulada', audit(), 'Se canceló la renta antes de la primera mensualidad', 'confirmada'))[0].r.resultado).toBe('ok')
    expect(await falla(`select public.comision_operacion_cambiar_estado('${id}', 'anulada', 'confirmada', 'Intento de revivirla sin motivo real', ${lit(audit())}::jsonb)`)).toMatch(/cambio_invalido/)
  })
})

describe('reversa', () => {
  it('la reversa quita todo lo de la 43 y deja la 38 intacta', async () => {
    await d.exec(sql('43-origen-acreditacion-y-operaciones.REVERTIR.sql'))
    const t = (await d.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_name like 'comision_%'")).rows
    expect(t).toEqual([])
    const c = (await d.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'propiedad_origen' and column_name like 'acreditacion_%'")).rows
    expect(c).toEqual([])
    expect(Number((await d.query<{ n: string }>('select count(*) as n from public.propiedad_origen')).rows[0].n)).toBeGreaterThan(0)
  })
})
