import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Migración 48: contabilidad de comisiones (cuentas de gasto y libro de movimientos solo-agregar), contra Postgres real (PGlite). */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
let d: PGlite
const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);
  insert into public.propiedades values ('p1');
  create table public.audit_logs (id bigserial primary key, actor_uid text, actor_email text, actor_rol text, accion text, entidad text, entidad_id text, antes jsonb, despues jsonb);
  grant usage on schema public to anon, authenticated, service_role;
  -- Como Supabase: toda tabla nueva nace con todos los permisos para service_role.
  alter default privileges in schema public grant all on tables to service_role;
  alter default privileges in schema public grant all on sequences to service_role;
  grant all on all tables in schema public to service_role;
  grant all on all sequences in schema public to service_role;
`
const audit = JSON.stringify({ actor_uid: 'u-super', actor_email: 'super@vb.mx', actor_rol: 'super_admin', accion: 'contab.x', antes: {}, despues: {} })
const q = (j: unknown) => JSON.stringify(j).replace(/'/g, "''")
const hoy = async () => (await d.query<{ h: string }>('select current_date::text h')).rows[0].h
const mas = async (n: number) => (await d.query<{ h: string }>(`select (current_date + ${n})::text h`)).rows[0].h

let n = 0
const gasto = (extra: Record<string, unknown> = {}) => ({
  fecha: '2026-10-10', clase: 'gasto', monto_centavos: 150_000, categoria: 'publicidad_impresa', concepto: 'Lonas para la nave', referencia: 'F-2026-118',
  clave_idempotencia: `mov-48-${String(++n).padStart(4, '0')}`, creado_por: 'super@vb.mx', ...extra,
})
const reg = async (o: Record<string, unknown>) => (await d.query<{ r: Record<string, unknown> }>(`select public.contab_movimiento_registrar('${q(o)}'::jsonb, '${audit}'::jsonb) r`)).rows[0].r
const falla = (o: Record<string, unknown>) => d.query(`select public.contab_movimiento_registrar('${q(o)}'::jsonb, '${audit}'::jsonb)`).then(() => null, (e: Error) => e.message)
const cuenta = async (o: Record<string, unknown>) => (await d.query<{ r: Record<string, unknown> }>(`select public.contab_cuenta_registrar('${q(o)}'::jsonb, '${audit}'::jsonb) r`)).rows[0].r
const cuentaFalla = (o: Record<string, unknown>) => d.query(`select public.contab_cuenta_registrar('${q(o)}'::jsonb, '${audit}'::jsonb)`).then(() => null, (e: Error) => e.message)
const priv = async (rol: string, tabla: string, p: string) => (await d.query<{ t: boolean }>(`select has_table_privilege('${rol}', 'public.${tabla}', '${p}') t`)).rows[0].t

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  for (const f of ['38-propiedad-interno.sql', '43-origen-acreditacion-y-operaciones.sql']) await d.exec(sql(f))
  await d.exec("insert into public.comision_operaciones (propiedad_id, tipo, base_centavos, regla_version, total_centavos, vivebien_centavos, colaborador_centavos, colaborador_retenido_centavos, reparto_estado, atribuible, clave_idempotencia, creado_por) values ('p1','venta',100000000,'v',3500000,3500000,0,0,'no_aplica',false,'op-vieja-0048','asesor@vb.mx')")
  await d.exec(sql('48-contabilidad-comisiones.sql'))
})
afterAll(async () => { await d.close() })

describe('migración 48 — permisos y guardias', () => {
  it('se puede correr dos veces', async () => { await d.exec(sql('48-contabilidad-comisiones.sql')) })
  it('solo el servidor toca las tablas: anon y authenticated, nada', async () => {
    for (const rol of ['anon', 'authenticated']) for (const t of ['contab_cuentas', 'contab_movimientos']) for (const p of ['select', 'insert', 'update', 'delete']) expect(await priv(rol, t, p), `${rol} ${p} ${t}`).toBe(false)
  })
  it('service_role: del libro solo lee y agrega; de las cuentas, además cambia (nunca borra ni vacía)', async () => {
    expect([await priv('service_role', 'contab_movimientos', 'select'), await priv('service_role', 'contab_movimientos', 'insert')]).toEqual([true, true])
    for (const p of ['update', 'delete', 'truncate']) expect(await priv('service_role', 'contab_movimientos', p), `movimientos ${p}`).toBe(false)
    expect(await priv('service_role', 'contab_cuentas', 'update')).toBe(true)
    for (const p of ['delete', 'truncate']) expect(await priv('service_role', 'contab_cuentas', p), `cuentas ${p}`).toBe(false)
  })
  it('un movimiento no se edita, no se borra y no se vacía (ni siquiera el dueño de la base)', async () => {
    const r = await reg(gasto())
    expect(r.resultado).toBe('ok')
    await expect(d.exec(`update public.contab_movimientos set monto_centavos = 1 where id = '${r.id}'`)).rejects.toThrow(/no se edita ni se borra/)
    await expect(d.exec(`delete from public.contab_movimientos where id = '${r.id}'`)).rejects.toThrow(/no se edita ni se borra/)
    await expect(d.exec('truncate public.contab_movimientos')).rejects.toThrow(/no se vacía/)
  })
  it('las combinaciones imposibles de clase y sentido no entran ni directamente', async () => {
    const malas = [
      "('2026-10-10','entra','gasto',100,'otro','x1','mov-48-dir-0001','abc')",
      "('2026-10-10','sale','ingreso_extra',100,'ingreso_extra','x2','mov-48-dir-0002','abc')",
      "('2026-10-10','sale','gasto',100,'ingreso_extra','x3','mov-48-dir-0003','abc')",
      "('2026-10-10','entra','devolucion',100,'otro','x4','mov-48-dir-0004','abc')", // sin original ni motivo
    ]
    for (const v of malas) await expect(d.exec(`insert into public.contab_movimientos (fecha, sentido, clase, monto_centavos, categoria, concepto, clave_idempotencia, creado_por) values ${v}`)).rejects.toThrow()
  })
})

describe('migración 48 — cuentas de gasto', () => {
  let id = ''
  it('registra «Meta Ads · 33839» y «Lonas El Juanito»; repetirla devuelve la misma', async () => {
    const a = await cuenta({ nombre: 'Meta Ads', categoria: 'publicidad_digital', identificador: '33839', notas: 'Cuenta publicitaria principal', creado_por: 'super@vb.mx' })
    expect(a.resultado).toBe('ok')
    id = a.id as string
    const b = await cuenta({ nombre: 'Lonas El Juanito', categoria: 'publicidad_impresa', creado_por: 'super@vb.mx' })
    expect(b.resultado).toBe('ok')
    expect(await cuenta({ nombre: '  meta ads ', categoria: 'publicidad_digital', identificador: '33839', creado_por: 'super@vb.mx' })).toEqual({ resultado: 'ya_existe', id })
    // el mismo nombre con otro identificador es otra cuenta
    expect((await cuenta({ nombre: 'Meta Ads', categoria: 'publicidad_digital', identificador: '99120', creado_por: 'super@vb.mx' })).resultado).toBe('ok')
  })
  it('rechaza categoría inválida, nombre corto o con correo/teléfono largo, claves ajenas y auditoría incompleta', async () => {
    for (const o of [{ nombre: 'X', categoria: 'otro' }, { nombre: 'Proveedor', categoria: 'inventada' }, { nombre: 'contacto@proveedor.mx', categoria: 'otro' }, { nombre: 'Tel 4771234567890', categoria: 'otro' }, { nombre: 'Proveedor', categoria: 'otro', identificador: 'a@b.c' }, { nombre: 'Proveedor', categoria: 'otro', activa: true }]) {
      expect(await cuentaFalla({ ...o, creado_por: 'super@vb.mx' }), JSON.stringify(o)).toMatch(/cambio_invalido/)
    }
    await expect(d.query(`select public.contab_cuenta_registrar('${q({ nombre: 'Proveedor', categoria: 'otro', creado_por: 'super@vb.mx' })}'::jsonb, '{}'::jsonb)`)).rejects.toThrow(/auditoria_incompleta/)
  })
  it('solo cambian las notas y si está activa; nada más, y no se borra', async () => {
    const cambiar = async (c: unknown) => (await d.query<{ r: Record<string, unknown> }>(`select public.contab_cuenta_cambiar('${id}'::uuid, '${q(c)}'::jsonb, '${audit}'::jsonb) r`)).rows[0].r
    expect((await cambiar({ activa: false, notas: 'Se pausó la cuenta' })).resultado).toBe('ok')
    expect((await d.query<{ activa: boolean; notas: string }>(`select activa, notas from public.contab_cuentas where id = '${id}'`)).rows[0]).toEqual({ activa: false, notas: 'Se pausó la cuenta' })
    await expect(d.query(`select public.contab_cuenta_cambiar('${id}'::uuid, '${q({ nombre: 'Otro' })}'::jsonb, '${audit}'::jsonb)`)).rejects.toThrow(/cambio_invalido/)
    await expect(d.query(`select public.contab_cuenta_cambiar('${id}'::uuid, '${q({ activa: 'si' })}'::jsonb, '${audit}'::jsonb)`)).rejects.toThrow(/cambio_invalido/)
    expect((await d.query<{ r: Record<string, unknown> }>(`select public.contab_cuenta_cambiar('${'00000000-0000-4000-8000-000000000000'}'::uuid, '${q({ activa: true })}'::jsonb, '${audit}'::jsonb) r`)).rows[0].r).toEqual({ resultado: 'no_existe' })
    await expect(d.exec(`update public.contab_cuentas set nombre = 'Otro' where id = '${id}'`)).rejects.toThrow(/solo cambian las notas/)
    await expect(d.exec(`delete from public.contab_cuentas where id = '${id}'`)).rejects.toThrow(/no se borra/)
    await expect(d.exec('truncate public.contab_cuentas')).rejects.toThrow(/no se vacía|cannot truncate/) // Postgres ya lo impide por la clave foránea de los movimientos; el disparador lo cubre sin ella
    await cambiar({ activa: true })
  })
  it('un gasto contra una cuenta inactiva o inexistente no se registra', async () => {
    const c = await cuenta({ nombre: 'Proveedor viejo', categoria: 'otro', creado_por: 'super@vb.mx' })
    await d.exec(`select public.contab_cuenta_cambiar('${c.id}'::uuid, '{"activa": false}'::jsonb, '${audit}'::jsonb)`)
    expect(await reg(gasto({ cuenta_id: c.id }))).toEqual({ resultado: 'cuenta_inactiva' })
    expect(await reg(gasto({ cuenta_id: '00000000-0000-4000-8000-000000000000' }))).toEqual({ resultado: 'no_existe' })
    expect((await reg(gasto({ cuenta_id: id }))).resultado).toBe('ok')
  })
})

describe('migración 48 — gastos e ingresos extra', () => {
  it('un gasto guarda todo, vinculado a una propiedad y a una operación, y deja bitácora', async () => {
    const op = (await d.query<{ id: string }>("select id from public.comision_operaciones limit 1")).rows[0].id
    const r = await reg(gasto({ propiedad_id: 'p1', operacion_id: op, referencia: 'campaña 33839', concepto: 'Promoción de la propiedad', clave_idempotencia: 'mov-48-vinculado' }))
    expect(r.resultado).toBe('ok')
    const f = (await d.query<Record<string, unknown>>(`select sentido, clase, monto_centavos::text, categoria, propiedad_id, referencia from public.contab_movimientos where id = '${r.id}'`)).rows[0]
    expect(f).toMatchObject({ sentido: 'sale', clase: 'gasto', monto_centavos: '150000', categoria: 'publicidad_impresa', propiedad_id: 'p1', referencia: 'campaña 33839' })
    expect(Number((await d.query<{ n: string }>(`select count(*) n from public.audit_logs where entidad = 'contab_movimientos' and entidad_id = '${r.id}'`)).rows[0].n)).toBe(1)
  })
  it('un ingreso extra entra y su categoría es siempre «ingreso_extra»', async () => {
    const r = await reg({ ...gasto(), clase: 'ingreso_extra', categoria: 'otro', concepto: 'Reembolso de seguro' })
    expect(r.resultado).toBe('ok')
    expect((await d.query<{ sentido: string; categoria: string }>(`select sentido, categoria from public.contab_movimientos where id = '${r.id}'`)).rows[0]).toEqual({ sentido: 'entra', categoria: 'ingreso_extra' })
  })
  it('rechaza montos, fechas, conceptos y referencias inválidos', async () => {
    const f2 = await mas(2)
    const casos: Array<Record<string, unknown>> = [
      { monto_centavos: 0 }, { monto_centavos: -5 }, { monto_centavos: 1.5 }, { monto_centavos: '12' }, { monto_centavos: 400_000_000_001 },
      { fecha: f2 }, { fecha: '1999-12-31' }, { fecha: 'ayer' }, { fecha: '2026-13-45' },
      { concepto: 'x' }, { concepto: 'x'.repeat(201) }, { concepto: 'Pago a juan@correo.mx' }, { concepto: 'Llamar al 4771234567' },
      { referencia: 'a@b.c' }, { referencia: 'x'.repeat(121) },
      { categoria: 'ingreso_extra' }, { categoria: 'inventada' }, { clase: 'otra' },
      { reverso_de: '00000000-0000-4000-8000-000000000000' }, { motivo: 'no corresponde' },
    ]
    for (const [i, c] of casos.entries()) expect(String(await falla(gasto({ ...c, clave_idempotencia: `mov-48-malo-${i}x` }))), JSON.stringify(c)).toMatch(/cambio_invalido/)
    expect(await falla({ ...gasto(), clave_idempotencia: 'mov-48-ajena', secreto: 1 })).toMatch(/cambio_invalido/)
    expect((await reg(gasto({ fecha: await hoy(), referencia: 'FAC 20261025123456', clave_idempotencia: 'mov-48-factura' }))).resultado).toBe('ok') // un número de factura largo sí va en la referencia
    expect((await reg(gasto({ fecha: await mas(1), clave_idempotencia: 'mov-48-manana' }))).resultado).toBe('ok') // mañana vale (husos horarios)
  })
  it('una propiedad u operación inexistente da «no_existe»', async () => {
    expect(await reg(gasto({ propiedad_id: 'no-hay' }))).toEqual({ resultado: 'no_existe' })
    expect(await reg(gasto({ operacion_id: '00000000-0000-4000-8000-000000000000' }))).toEqual({ resultado: 'no_existe' })
  })
  it('un reintento con la misma clave es idempotente; con otros datos, «clave_en_uso»', async () => {
    const x = gasto({ clave_idempotencia: 'mov-48-idem' })
    const a = await reg(x)
    expect(await reg(x)).toMatchObject({ resultado: 'repetida', id: a.id })
    expect(await reg({ ...x, monto_centavos: 999 })).toEqual({ resultado: 'clave_en_uso' })
  })
})

describe('migración 48 — devoluciones', () => {
  let original: string
  const dev = (monto: number, extra: Record<string, unknown> = {}) => ({ clase: 'devolucion', fecha: '2026-10-12', monto_centavos: monto, reverso_de: original, motivo: 'Lona de mala calidad, el proveedor devuelve', concepto: 'Devolución de lonas', clave_idempotencia: `dev-48-${String(++n).padStart(4, '0')}`, creado_por: 'super@vb.mx', ...extra })
  beforeAll(async () => { original = (await reg(gasto({ monto_centavos: 100_000, concepto: 'Lonas El Juanito', clave_idempotencia: 'mov-48-original-dev' }))).id as string })

  it('una devolución parcial entra, hereda lo del original y exige motivo', async () => {
    const r = await reg(dev(30_000))
    expect(r.resultado).toBe('ok')
    expect((await d.query<Record<string, unknown>>(`select sentido, clase, categoria, monto_centavos::text, reverso_de::text from public.contab_movimientos where id = '${r.id}'`)).rows[0]).toMatchObject({ sentido: 'entra', clase: 'devolucion', categoria: 'publicidad_impresa', monto_centavos: '30000', reverso_de: original })
    expect(await falla(dev(1000, { motivo: 'corto', clave_idempotencia: 'dev-48-sin-motivo' }))).toMatch(/cambio_invalido/)
    expect(await falla(dev(1000, { motivo: undefined, clave_idempotencia: 'dev-48-sin-motivo2' }))).toMatch(/cambio_invalido/)
  })
  it('no puede exceder lo que queda del original; devolver exactamente el resto vale', async () => {
    expect(await reg(dev(70_001))).toEqual({ resultado: 'excede', disponible: 70_000 })
    expect((await reg(dev(70_000))).resultado).toBe('ok')
    expect(await reg(dev(1))).toEqual({ resultado: 'excede', disponible: 0 })
  })
  it('no se devuelve antes de la fecha del gasto, ni algo que no existe, ni una devolución', async () => {
    const o2 = (await reg(gasto({ monto_centavos: 5000, fecha: '2026-10-10', clave_idempotencia: 'mov-48-o2' }))).id as string
    expect(await falla({ ...dev(100, { clave_idempotencia: 'dev-48-antes' }), reverso_de: o2, fecha: '2026-10-09' })).toMatch(/cambio_invalido/)
    expect(await reg({ ...dev(100, { clave_idempotencia: 'dev-48-fantasma' }), reverso_de: '00000000-0000-4000-8000-000000000000' })).toEqual({ resultado: 'no_existe' })
    const d1 = (await reg({ ...dev(100, { clave_idempotencia: 'dev-48-d1' }), reverso_de: o2 })).id as string
    expect(await reg({ ...dev(10, { clave_idempotencia: 'dev-48-d2' }), reverso_de: d1 })).toEqual({ resultado: 'no_aplica' })
  })
  it('devolver un ingreso extra es una salida', async () => {
    const ing = (await reg({ ...gasto({ clave_idempotencia: 'mov-48-ing-dev' }), clase: 'ingreso_extra', categoria: 'otro', monto_centavos: 8000, concepto: 'Reembolso' })).id as string
    const r = await reg({ ...dev(3000, { clave_idempotencia: 'dev-48-ing' }), reverso_de: ing })
    expect(r.resultado).toBe('ok')
    expect((await d.query<{ sentido: string }>(`select sentido from public.contab_movimientos where id = '${r.id}'`)).rows[0].sentido).toBe('sale')
  })
})

describe('migración 48 — anulaciones', () => {
  const anul = (de: string, monto: number, extra: Record<string, unknown> = {}) => ({ clase: 'anulacion', fecha: '2026-10-13', monto_centavos: monto, reverso_de: de, motivo: 'Se capturó dos veces por error', concepto: 'Anulación', clave_idempotencia: `anu-48-${String(++n).padStart(4, '0')}`, creado_por: 'super@vb.mx', ...extra })
  it('anula todo lo que queda; con devoluciones previas, solo el resto; no se anula dos veces', async () => {
    const g = (await reg(gasto({ monto_centavos: 50_000, clave_idempotencia: 'mov-48-anula-1' }))).id as string
    expect(await reg(anul(g, 40_000))).toEqual({ resultado: 'monto_distinto', esperado: 50_000 })
    const r = await reg(anul(g, 50_000))
    expect(r.resultado).toBe('ok')
    expect((await d.query<{ sentido: string; clase: string }>(`select sentido, clase from public.contab_movimientos where id = '${r.id}'`)).rows[0]).toEqual({ sentido: 'entra', clase: 'anulacion' })
    expect(await reg(anul(g, 50_000))).toEqual({ resultado: 'ya_anulado' })
    expect(await reg({ clase: 'devolucion', fecha: '2026-10-13', monto_centavos: 100, reverso_de: g, motivo: 'Devolución tardía del proveedor', concepto: 'Devolución', clave_idempotencia: 'dev-48-tarde', creado_por: 'super@vb.mx' })).toEqual({ resultado: 'ya_anulado' })
    expect(await reg(anul(r.id as string, 50_000))).toEqual({ resultado: 'no_aplica' })

    const g2 = (await reg(gasto({ monto_centavos: 50_000, clave_idempotencia: 'mov-48-anula-2' }))).id as string
    await reg({ clase: 'devolucion', fecha: '2026-10-13', monto_centavos: 20_000, reverso_de: g2, motivo: 'Devolución parcial acordada', concepto: 'Devolución', clave_idempotencia: 'dev-48-parcial-anula', creado_por: 'super@vb.mx' })
    expect(await reg(anul(g2, 50_000))).toEqual({ resultado: 'monto_distinto', esperado: 30_000 })
    expect((await reg(anul(g2, 30_000))).resultado).toBe('ok')
  })
  it('lo devuelto por completo no se anula; anular una devolución libera ese monto para devolver otra vez', async () => {
    const g = (await reg(gasto({ monto_centavos: 10_000, clave_idempotencia: 'mov-48-anula-3' }))).id as string
    const dv = (await reg({ clase: 'devolucion', fecha: '2026-10-13', monto_centavos: 10_000, reverso_de: g, motivo: 'Devolución total acordada', concepto: 'Devolución', clave_idempotencia: 'dev-48-total', creado_por: 'super@vb.mx' })).id as string
    expect(await reg(anul(g, 10_000))).toEqual({ resultado: 'sin_remanente' })
    expect((await reg(anul(dv, 10_000))).resultado).toBe('ok') // la devolución se registró por error
    const otra = await reg({ clase: 'devolucion', fecha: '2026-10-13', monto_centavos: 10_000, reverso_de: g, motivo: 'Devolución correcta, ahora sí', concepto: 'Devolución', clave_idempotencia: 'dev-48-otra', creado_por: 'super@vb.mx' })
    expect(otra.resultado).toBe('ok')
  })
  it('exige motivo y una auditoría completa', async () => {
    const g = (await reg(gasto({ monto_centavos: 700, clave_idempotencia: 'mov-48-anula-4' }))).id as string
    expect(await falla(anul(g, 700, { motivo: 'corto' }))).toMatch(/cambio_invalido/)
    await expect(d.query(`select public.contab_movimiento_registrar('${q(anul(g, 700))}'::jsonb, '{}'::jsonb)`)).rejects.toThrow(/auditoria_incompleta/)
  })
})

describe('migración 48 — la reversa', () => {
  it('quita tablas y funciones; las operaciones de comisión siguen intactas', async () => {
    await d.exec(sql('48-contabilidad-comisiones.REVERTIR.sql'))
    const t = (await d.query<{ n: string }>("select count(*) n from information_schema.tables where table_name like 'contab\\_%'")).rows[0]
    expect(Number(t.n)).toBe(0)
    const f = (await d.query<{ n: string }>("select count(*) n from pg_proc where proname like 'contab\\_%'")).rows[0]
    expect(Number(f.n)).toBe(0)
    expect(Number((await d.query<{ n: string }>('select count(*) n from public.comision_operaciones')).rows[0].n)).toBe(1)
    await d.exec(sql('48-contabilidad-comisiones.sql')) // y se puede volver a aplicar
  })
})
