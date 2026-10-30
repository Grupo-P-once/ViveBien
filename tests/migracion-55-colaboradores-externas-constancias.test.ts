import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { calcularComision } from '../src/lib/comision-calculo'

/** Migración 55: directorio de colaboradores, comisiones EXTERNAS y constancias de pago. Contra Postgres real (PGlite). */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);
  insert into public.propiedades values ('p1');
  create table public.audit_logs (id bigserial primary key, actor_uid text, actor_email text, actor_rol text, accion text, entidad text, entidad_id text, antes jsonb, despues jsonb);
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to service_role;
  alter default privileges in schema public grant all on sequences to service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
`
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
const audit = (accion = 'contabilidad.x') => JSON.stringify({ actor_uid: 'u-super', actor_email: 'super@vb.mx', actor_rol: 'super_admin', accion, antes: {}, despues: { dato: 'x' } })
let d: PGlite
let n = 0
const q = async <T = Record<string, unknown>>(consulta: string): Promise<T[]> => { await d.exec('set role service_role'); try { return (await d.query<T>(consulta)).rows } finally { await d.exec('reset role') } }
const fn = async <T = Record<string, unknown>>(llamada: string): Promise<T> => (await q<{ r: T }>(`select ${llamada} as r`))[0].r
const falla = (consulta: string) => q(consulta).then(() => null, (e: Error) => e.message)
const J = (o: unknown) => `${lit(JSON.stringify(o))}::jsonb`

const colaborador = (extra: Record<string, unknown> = {}) => ({ tipo: 'agente', nombre: 'Agente de Prueba Uno', empresa: 'Inmobiliaria Prueba', telefono: '477 123 4567', correo: 'agente@prueba.mx', creado_por: 'super@vb.mx', ...extra })
const regCol = (o: Record<string, unknown>) => fn<{ resultado: string; id?: string }>(`public.contab_colaborador_registrar(${J(o)}, ${J(JSON.parse(audit('contabilidad.colaborador_creado')))})`)
const externa = (extra: Record<string, unknown> = {}) => ({ fecha: '2026-10-20', descripcion: 'Cliente buscaba casa en Cañada, 3 recámaras', tipo: 'renta', parte_centavos: 1_000_000, total_centavos: 2_000_000, porcentaje_bp: 5000, clave_idempotencia: `ext-55-${String(++n).padStart(4, '0')}`, creado_por: 'super@vb.mx', ...extra })
const regExt = (o: Record<string, unknown>) => fn<{ resultado: string; id?: string }>(`public.comision_externa_registrar(${J(o)}, ${J(JSON.parse(audit('contabilidad.externa_creada')))})`)
const estadoExt = (id: string, antes: string, nuevo: string, datos: Record<string, unknown>) => fn<{ resultado: string }>(`public.comision_externa_cambiar_estado('${id}', '${antes}', '${nuevo}', ${J(datos)}, ${J(JSON.parse(audit('contabilidad.externa_estado')))})`)

async function pagoColaborador(clave: string, monto = 1_500_000, fecha = '2026-10-26') {
  const c = calcularComision({ operacion: 'renta', baseCentavos: 8_000_000, colaborador: { participa: false, acreditacion: 'pendiente', atribuible: true } })
  if (!c.ok) throw new Error('cálculo')
  const op = await fn<{ id: string }>(`public.comision_operacion_registrar(${J({ propiedad_id: 'p1', tipo: 'renta', base_centavos: c.baseCentavos, regla_version: c.regla, total_centavos: c.totalCentavos, vivebien_centavos: c.viveBienCentavos - 4_000_000, colaborador_centavos: 4_000_000, colaborador_retenido_centavos: 0, retencion: null, reparto_estado: 'liberable', atribuible: true, atribucion_ref: 'cita:abc-1', clave_idempotencia: `op-${clave}`, creado_por: 'super@vb.mx', fecha_cierre: '2026-09-25' })}, ${J(JSON.parse(audit('comision.operacion_registrada')))})`)
  const mov = await fn<{ resultado: string; id: string }>(`public.contab_movimiento_registrar(${J({ fecha, clase: 'pago_colaborador', monto_centavos: monto, concepto: 'Pago en efectivo al colaborador', operacion_id: op.id, clave_idempotencia: `mov-${clave}`, creado_por: 'super@vb.mx' })}, ${J(JSON.parse(audit('contabilidad.movimiento')))})`)
  return { op: op.id, mov: mov.id }
}
const constancia = (o: Record<string, unknown>) => fn<{ resultado: string; id?: string; folio?: string }>(`public.contab_constancia_crear(${J(o)}, ${J(JSON.parse(audit('contabilidad.constancia_creada')))})`)

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  for (const f of ['38-propiedad-interno.sql', '43-origen-acreditacion-y-operaciones.sql', '46-comision-fecha-de-cierre.sql', '47-comision-ajustes-y-gastos.sql', '48-contabilidad-comisiones.sql', '53-contabilidad-aportaciones-al-grupo.sql', '55-colaboradores-externas-y-constancias.sql']) await d.exec(sql(f))
})
afterAll(async () => { await d.close() })

describe('migración 55 — solo del servidor', () => {
  it('se puede correr dos veces', async () => { await d.exec(sql('55-colaboradores-externas-y-constancias.sql')) })
  it('anon y authenticated no leen ni escriben; el servidor no borra ni vacía', async () => {
    for (const t of ['colaboradores', 'comision_externas', 'contab_constancias']) {
      for (const rol of ['anon', 'authenticated']) for (const p of ['select', 'insert', 'update', 'delete']) {
        expect((await d.query<{ t: boolean }>(`select has_table_privilege('${rol}', 'public.${t}', '${p}') t`)).rows[0].t, `${rol} ${p} ${t}`).toBe(false)
      }
      for (const p of ['delete', 'truncate']) expect((await d.query<{ t: boolean }>(`select has_table_privilege('service_role', 'public.${t}', '${p}') t`)).rows[0].t, `service_role ${p} ${t}`).toBe(false)
    }
  })
})

describe('colaboradores (directorio)', () => {
  it('registra con el folio opcional, es idempotente por nombre+empresa y deja bitácora SIN el contacto', async () => {
    const a = await regCol(colaborador())
    expect(a.resultado).toBe('ok')
    expect(await regCol(colaborador({ nombre: '  agente de prueba uno ' }))).toMatchObject({ resultado: 'ya_existe', id: a.id })
    expect((await regCol(colaborador({ nombre: 'Agente Sin Folio Ni Contacto', empresa: undefined, telefono: undefined, correo: undefined }))).resultado).toBe('ok')
    const b = (await q<{ despues: Record<string, unknown> }>(`select despues from public.audit_logs where entidad = 'colaboradores' and entidad_id = '${a.id}'`))
    expect(b).toHaveLength(1)
    expect(JSON.stringify(b[0].despues)).not.toMatch(/@|477/)
  })
  it('rechaza lo mal formado: tipo, nombre con correo o teléfono largo, correo inválido, claves ajenas', async () => {
    for (const c of [{ tipo: 'otro_tipo' }, { nombre: 'x' }, { nombre: 'Ana ana@correo.mx' }, { nombre: 'Tel 4771234567' }, { correo: 'no-es-correo' }, { telefono: '12' }]) {
      expect(String(await falla(`select public.contab_colaborador_registrar(${J(colaborador({ nombre: `Colab ${++n} Prueba`, ...c }))}, ${J(JSON.parse(audit()))})`)), JSON.stringify(c)).toMatch(/cambio_invalido|violates check/)
    }
    expect(String(await falla(`select public.contab_colaborador_registrar(${J({ ...colaborador({ nombre: 'Colab Ajeno Prueba' }), secreto: 1 })}, ${J(JSON.parse(audit()))})`))).toMatch(/cambio_invalido/)
  })
  it('se edita (incluido el folio de acreditación) y se desactiva, pero no se borra ni se vacía', async () => {
    const a = await regCol(colaborador({ nombre: 'Agente Editable Prueba' }))
    expect((await fn<{ resultado: string }>(`public.contab_colaborador_cambiar('${a.id}', ${J({ folio_acreditacion: 'GTO-2026-77', municipio: 'León', activo: false })}, ${J(JSON.parse(audit()))})`)).resultado).toBe('ok')
    expect((await q<{ folio_acreditacion: string; activo: boolean }>(`select folio_acreditacion, activo from public.colaboradores where id = '${a.id}'`))[0]).toEqual({ folio_acreditacion: 'GTO-2026-77', activo: false })
    expect((await fn<{ resultado: string }>(`public.contab_colaborador_cambiar('00000000-0000-0000-0000-000000000000', ${J({ notas: 'x' })}, ${J(JSON.parse(audit()))})`)).resultado).toBe('no_existe')
    expect((await fn<{ resultado: string }>(`public.contab_colaborador_cambiar('${a.id}', ${J({ nombre: 'Agente de Prueba Uno', empresa: 'Inmobiliaria Prueba' })}, ${J(JSON.parse(audit()))})`)).resultado).toBe('ya_existe')
    await expect(d.exec(`delete from public.colaboradores where id = '${a.id}'`)).rejects.toThrow(/no se borra/)
    await expect(d.exec('truncate public.colaboradores')).rejects.toThrow(/no se vacía|cannot truncate/) // con tablas que lo referencian, Postgres ya lo impide antes del disparador
  })
})

describe('comisiones externas', () => {
  it('registra una por cobrar, con colaborador del directorio, y deja bitácora', async () => {
    const col = await regCol(colaborador({ nombre: 'Contraparte Externa Prueba', empresa: undefined }))
    const r = await regExt(externa({ colaborador_id: col.id }))
    expect(r.resultado).toBe('ok')
    const f = (await q<{ estado: string; parte_centavos: string; colaborador_id: string }>(`select estado, parte_centavos, colaborador_id from public.comision_externas where id = '${r.id}'`))[0]
    expect(f).toMatchObject({ estado: 'por_cobrar', colaborador_id: col.id })
    expect(Number(f.parte_centavos)).toBe(1_000_000)
    expect(Number((await q<{ n: string }>(`select count(*) n from public.audit_logs where entidad = 'comision_externas' and entidad_id = '${r.id}'`))[0].n)).toBe(1)
  })
  it('puede nacer ya cobrada (algo rápido: efectivo, con fecha y referencia)', async () => {
    const r = await regExt(externa({ cobrada: true, cobrada_en: '2026-10-22', metodo_cobro: 'efectivo', referencia: 'Recibo 118', contraparte: 'Inmobiliaria Del Bajío' }))
    expect(r.resultado).toBe('ok')
    expect((await q<{ estado: string; metodo_cobro: string; cobrada_en: string }>(`select estado, metodo_cobro, cobrada_en::text from public.comision_externas where id = '${r.id}'`))[0]).toMatchObject({ estado: 'cobrada', metodo_cobro: 'efectivo', cobrada_en: '2026-10-22' })
  })
  it('es idempotente; la misma clave con otros datos es un conflicto', async () => {
    const dt = externa({})
    const a = await regExt(dt)
    expect(await regExt(dt)).toMatchObject({ resultado: 'repetida', id: a.id })
    expect((await regExt({ ...dt, parte_centavos: 1_000_001 })).resultado).toBe('clave_en_uso')
  })
  it('rechaza lo mal formado: parte mayor que el total, fecha futura, datos personales, cobrada sin método, colaborador inexistente', async () => {
    for (const c of [{ parte_centavos: 3_000_000 }, { fecha: '2999-01-01' }, { descripcion: 'Cliente ana@correo.mx quería casa' }, { descripcion: 'Tel 4771234567 casa' }, { cobrada: true, cobrada_en: '2026-10-22' }, { tipo: 'regalo' }, { parte_centavos: 0 }]) {
      expect(String(await falla(`select public.comision_externa_registrar(${J(externa(c))}, ${J(JSON.parse(audit()))})`)), JSON.stringify(c)).toMatch(/cambio_invalido|violates check/)
    }
    expect((await regExt(externa({ colaborador_id: '00000000-0000-0000-0000-000000000000' }))).resultado).toBe('no_existe')
  })
  it('por cobrar → cobrada (con comprobante) → anulada con motivo; con el estado viejo hay conflicto; una anulada no vuelve', async () => {
    const r = await regExt(externa({}))
    expect((await estadoExt(r.id!, 'cobrada', 'anulada', { motivo: 'Motivo suficientemente largo' })).resultado).toBe('conflicto')
    expect((await estadoExt(r.id!, 'por_cobrar', 'cobrada', { cobrada_en: '2026-10-25', metodo_cobro: 'transferencia', referencia: 'SPEI 998877', adjunto: '2026/comprobante-1.pdf' })).resultado).toBe('ok')
    expect((await q<{ estado: string; adjunto: string; estado_por: string }>(`select estado, adjunto, estado_por from public.comision_externas where id = '${r.id}'`))[0]).toEqual({ estado: 'cobrada', adjunto: '2026/comprobante-1.pdf', estado_por: 'super@vb.mx' })
    expect(String(await falla(`select public.comision_externa_cambiar_estado('${r.id}', 'cobrada', 'anulada', ${J({ motivo: 'corto' })}, ${J(JSON.parse(audit()))})`))).toMatch(/cambio_invalido/)
    expect((await estadoExt(r.id!, 'cobrada', 'anulada', { motivo: 'Se capturó dos veces la misma comisión' })).resultado).toBe('ok')
    expect(String(await falla(`select public.comision_externa_cambiar_estado('${r.id}', 'anulada', 'cobrada', ${J({ cobrada_en: '2026-10-25', metodo_cobro: 'efectivo' })}, ${J(JSON.parse(audit()))})`))).toMatch(/cambio_invalido/)
  })
  it('cobrar exige método y una fecha que no sea anterior al trato ni futura', async () => {
    const r = await regExt(externa({ fecha: '2026-10-20' }))
    for (const dt of [{ cobrada_en: '2026-10-25' }, { metodo_cobro: 'efectivo' }, { cobrada_en: '2026-10-01', metodo_cobro: 'efectivo' }, { cobrada_en: '2999-01-01', metodo_cobro: 'efectivo' }]) {
      expect(String(await falla(`select public.comision_externa_cambiar_estado('${r.id}', 'por_cobrar', 'cobrada', ${J(dt)}, ${J(JSON.parse(audit()))})`)), JSON.stringify(dt)).toMatch(/cambio_invalido/)
    }
  })
  it('no se edita, no cambia de estado por la libre, no se borra ni se vacía', async () => {
    const r = await regExt(externa({}))
    await expect(d.exec(`update public.comision_externas set parte_centavos = 5 where id = '${r.id}'`)).rejects.toThrow(/no se edita/)
    await expect(d.exec(`update public.comision_externas set estado = 'anulada', estado_motivo = 'Intento de saltarse la función' where id = '${r.id}'`)).rejects.toThrow(/solo cambia por sus funciones/)
    await expect(d.exec(`delete from public.comision_externas where id = '${r.id}'`)).rejects.toThrow(/no se borra/)
    await expect(d.exec('truncate public.comision_externas')).rejects.toThrow(/no se vacía/)
  })
})

describe('constancias de pago a colaboradores', () => {
  it('se crea con folio CP-AAAA-NNNN a partir de un pago, toma monto y fecha del movimiento y deja bitácora', async () => {
    const { mov, op } = await pagoColaborador('con-0001')
    const r = await constancia({ movimiento_id: mov, colaborador_nombre: 'Agente de Prueba Uno', metodo: 'efectivo', descripcion: 'Renta de bodega en León', creado_por: 'super@vb.mx' })
    expect(r.resultado).toBe('ok')
    expect(r.folio).toMatch(/^CP-2026-\d{4}$/)
    const f = (await q<{ monto_centavos: string; fecha_pago: string; operacion_id: string; metodo: string }>(`select monto_centavos, fecha_pago::text, operacion_id, metodo from public.contab_constancias where id = '${r.id}'`))[0]
    expect(Number(f.monto_centavos)).toBe(1_500_000)
    expect(f).toMatchObject({ fecha_pago: '2026-10-26', operacion_id: op, metodo: 'efectivo' })
    const b = (await q<{ despues: Record<string, unknown> }>(`select despues from public.audit_logs where entidad = 'contab_constancias' and entidad_id = '${r.id}'`))
    expect(b[0].despues).toMatchObject({ folio: r.folio })
  })
  it('los folios avanzan y repetir sobre el mismo pago devuelve la MISMA constancia', async () => {
    const a = await pagoColaborador('con-0002'); const b = await pagoColaborador('con-0003')
    const ca = await constancia({ movimiento_id: a.mov, colaborador_nombre: 'Agente Dos', metodo: 'transferencia', referencia: 'SPEI 5544', creado_por: 'super@vb.mx' })
    const cb = await constancia({ movimiento_id: b.mov, colaborador_nombre: 'Agente Tres', metodo: 'efectivo', creado_por: 'super@vb.mx' })
    expect(Number(cb.folio!.slice(-4))).toBe(Number(ca.folio!.slice(-4)) + 1)
    expect(await constancia({ movimiento_id: a.mov, colaborador_nombre: 'Otro Nombre', metodo: 'efectivo', creado_por: 'super@vb.mx' })).toMatchObject({ resultado: 'repetida', id: ca.id, folio: ca.folio })
  })
  it('solo de un pago vigente: un gasto o un pago anulado no tienen constancia', async () => {
    const g = await fn<{ id: string }>(`public.contab_movimiento_registrar(${J({ fecha: '2026-10-26', clase: 'gasto', monto_centavos: 100_000, categoria: 'oficina', concepto: 'Papelería de oficina', clave_idempotencia: 'mov-gasto-con-1', creado_por: 'super@vb.mx' })}, ${J(JSON.parse(audit()))})`)
    expect((await constancia({ movimiento_id: g.id, colaborador_nombre: 'Agente Cuatro', metodo: 'efectivo', creado_por: 'super@vb.mx' })).resultado).toBe('no_aplica')
    const p = await pagoColaborador('con-0004')
    await fn(`public.contab_movimiento_registrar(${J({ fecha: '2026-10-26', clase: 'anulacion', monto_centavos: 1_500_000, reverso_de: p.mov, motivo: 'Se capturó el pago por error', concepto: 'Anulación del pago', clave_idempotencia: 'mov-anula-con-4', creado_por: 'super@vb.mx' })}, ${J(JSON.parse(audit()))})`)
    expect((await constancia({ movimiento_id: p.mov, colaborador_nombre: 'Agente Cinco', metodo: 'efectivo', creado_por: 'super@vb.mx' })).resultado).toBe('no_aplica')
    expect((await constancia({ movimiento_id: '00000000-0000-0000-0000-000000000000', colaborador_nombre: 'Agente Seis', metodo: 'efectivo', creado_por: 'super@vb.mx' })).resultado).toBe('no_existe')
  })
  it('rechaza método inválido, nombre con correo o teléfono y claves ajenas', async () => {
    const p = await pagoColaborador('con-0005')
    for (const c of [{ metodo: 'cheque' }, { colaborador_nombre: 'Ana ana@correo.mx' }, { colaborador_nombre: 'Tel 4771234567' }, { referencia: 'ana@correo.mx' }]) {
      expect(String(await falla(`select public.contab_constancia_crear(${J({ movimiento_id: p.mov, colaborador_nombre: 'Agente Siete', metodo: 'efectivo', creado_por: 'super@vb.mx', ...c })}, ${J(JSON.parse(audit()))})`)), JSON.stringify(c)).toMatch(/cambio_invalido|violates check/)
    }
    expect(String(await falla(`select public.contab_constancia_crear(${J({ movimiento_id: p.mov, colaborador_nombre: 'Agente Ocho', metodo: 'efectivo', creado_por: 'super@vb.mx', secreto: 1 })}, ${J(JSON.parse(audit()))})`))).toMatch(/cambio_invalido/)
  })
  it('el comprobante puede llegar después, una sola vez; lo demás no se edita; no se borra ni se vacía', async () => {
    const p = await pagoColaborador('con-0006')
    const c = await constancia({ movimiento_id: p.mov, colaborador_nombre: 'Agente Nueve', metodo: 'transferencia', referencia: 'SPEI 1122', creado_por: 'super@vb.mx' })
    expect((await fn<{ resultado: string }>(`public.contab_constancia_adjuntar('${c.id}', '2026/comprobante-a.pdf', ${J(JSON.parse(audit()))})`)).resultado).toBe('ok')
    expect((await fn<{ resultado: string }>(`public.contab_constancia_adjuntar('${c.id}', '2026/comprobante-b.pdf', ${J(JSON.parse(audit()))})`)).resultado).toBe('ya_tiene')
    await expect(d.exec(`update public.contab_constancias set comprobante = 'otro/archivo.pdf' where id = '${c.id}'`)).rejects.toThrow(/no se reemplaza/)
    await expect(d.exec(`update public.contab_constancias set monto_centavos = 5 where id = '${c.id}'`)).rejects.toThrow(/no se edita/)
    await expect(d.exec(`delete from public.contab_constancias where id = '${c.id}'`)).rejects.toThrow(/no se borra/)
    await expect(d.exec('truncate public.contab_constancias')).rejects.toThrow(/no se vacía/)
  })
})
