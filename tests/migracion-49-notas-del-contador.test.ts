import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Migración 49: notas del contador para el asesor de IA (solo se agrega; se retiran con motivo), contra Postgres real (PGlite). */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
let d: PGlite
const BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.propiedades (id text primary key);
  create table public.audit_logs (id bigserial primary key, actor_uid text, actor_email text, actor_rol text, accion text, entidad text, entidad_id text, antes jsonb, despues jsonb);
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to service_role;
  grant all on all tables in schema public to service_role;
`
const audit = JSON.stringify({ actor_uid: 'u-super', actor_email: 'super@vb.mx', actor_rol: 'super_admin', accion: 'contabilidad.nota', antes: {}, despues: {} })
const q = (j: unknown) => JSON.stringify(j).replace(/'/g, "''")
let n = 0
const nota = (extra: Record<string, unknown> = {}) => ({ titulo: 'Plazo de la balanza mensual', tema: 'fiscal', texto: 'Según la RMF 2026 vigente, el plazo cambió: verificar con el contador antes de afirmarlo.', clave_idempotencia: `nota-49-${String(++n).padStart(4, '0')}`, creado_por: 'super@vb.mx', ...extra })
const reg = async (o: Record<string, unknown>) => (await d.query<{ r: Record<string, unknown> }>(`select public.contab_nota_registrar('${q(o)}'::jsonb, '${audit}'::jsonb) r`)).rows[0].r
const falla = (o: Record<string, unknown>) => d.query(`select public.contab_nota_registrar('${q(o)}'::jsonb, '${audit}'::jsonb)`).then(() => null, (e: Error) => e.message)
const retirar = async (id: string, motivo = 'La ley cambió y esta nota ya no aplica', por = 'super@vb.mx') => (await d.query<{ r: Record<string, unknown> }>(`select public.contab_nota_retirar('${id}'::uuid, '${motivo.replace(/'/g, "''")}', '${por}', '${audit}'::jsonb) r`)).rows[0].r
const priv = async (rol: string, p: string) => (await d.query<{ t: boolean }>(`select has_table_privilege('${rol}', 'public.contab_conocimiento', '${p}') t`)).rows[0].t

beforeAll(async () => {
  d = new PGlite()
  await d.exec(BASE)
  for (const f of ['38-propiedad-interno.sql', '43-origen-acreditacion-y-operaciones.sql', '49-contabilidad-notas-del-contador.sql']) await d.exec(sql(f))
})
afterAll(async () => { await d.close() })

describe('migración 49 — notas del contador', () => {
  it('se puede correr dos veces; solo el servidor toca la tabla y no puede borrar ni vaciar', async () => {
    await d.exec(sql('49-contabilidad-notas-del-contador.sql'))
    for (const rol of ['anon', 'authenticated']) for (const p of ['select', 'insert', 'update', 'delete']) expect(await priv(rol, p), `${rol} ${p}`).toBe(false)
    expect([await priv('service_role', 'select'), await priv('service_role', 'insert'), await priv('service_role', 'update')]).toEqual([true, true, true])
    for (const p of ['delete', 'truncate']) expect(await priv('service_role', p), p).toBe(false)
  })
  it('registra una nota y deja bitácora; repetir la misma clave es idempotente', async () => {
    const x = nota()
    const a = await reg(x)
    expect(a.resultado).toBe('ok')
    expect(await reg(x)).toMatchObject({ resultado: 'repetida', id: a.id })
    expect(await reg({ ...x, texto: 'Otro texto distinto, de al menos diez caracteres.' })).toEqual({ resultado: 'clave_en_uso' })
    expect(Number((await d.query<{ n: string }>(`select count(*) n from public.audit_logs where entidad = 'contab_conocimiento' and entidad_id = '${a.id}'`)).rows[0].n)).toBe(1)
  })
  it('rechaza lo mal formado: tema, largos, correos, números largos, fechas, claves ajenas', async () => {
    const f2 = (await d.query<{ h: string }>('select (current_date + 2)::text h')).rows[0].h
    const casos: Array<Record<string, unknown>> = [
      { tema: 'inventado' }, { titulo: 'ab' }, { titulo: 'x'.repeat(121) }, { texto: 'corto' }, { texto: 'x'.repeat(1201) },
      { texto: 'Escribir a contador@correo.mx para confirmar el criterio.' }, { texto: 'Llamar al 4771234567 para confirmar el criterio nuevo.' }, { titulo: 'Contacto a@b.mx' },
      { vigente_desde: f2 }, { vigente_desde: '1999-01-01' }, { vigente_desde: 'ayer' }, { clave_idempotencia: 'corta' },
    ]
    for (const [i, c] of casos.entries()) expect(String(await falla(nota({ ...c, clave_idempotencia: c.clave_idempotencia ?? `nota-49-malo-${i}xx` }))), JSON.stringify(c)).toMatch(/cambio_invalido|violates check/)
    expect(String(await falla({ ...nota(), clave_idempotencia: 'nota-49-ajena1', secreto: 1 }))).toMatch(/cambio_invalido/)
    await expect(d.query(`select public.contab_nota_registrar('${q(nota())}'::jsonb, '{}'::jsonb)`)).rejects.toThrow(/auditoria_incompleta/)
  })
  it('un número de decreto o de DOF corto sí cabe (solo se rechazan 10 o más dígitos seguidos)', async () => {
    expect((await reg(nota({ texto: 'Reforma del DOF del 16-jul-2025: el umbral es de 8,025 UMA según el despacho consultado.' }))).resultado).toBe('ok')
  })
  it('no se edita ni se borra ni se vacía; no se puede «des-retirar»', async () => {
    const a = await reg(nota())
    await expect(d.exec(`update public.contab_conocimiento set texto = 'otro texto distinto de diez' where id = '${a.id}'`)).rejects.toThrow(/no se edita/)
    await expect(d.exec(`update public.contab_conocimiento set titulo = 'Otro título' where id = '${a.id}'`)).rejects.toThrow(/no se edita/)
    await expect(d.exec(`delete from public.contab_conocimiento where id = '${a.id}'`)).rejects.toThrow(/no se borra/)
    await expect(d.exec('truncate public.contab_conocimiento')).rejects.toThrow(/no se vacía/)
    expect((await retirar(a.id as string)).resultado).toBe('ok')
    await expect(d.exec(`update public.contab_conocimiento set retirada = false, retirada_por = null, retirada_en = null, retirada_motivo = null where id = '${a.id}'`)).rejects.toThrow(/no vuelve/)
  })
  it('retirar exige motivo y quién, deja bitácora, y no se retira dos veces ni algo que no existe', async () => {
    const a = await reg(nota())
    await expect(d.query(`select public.contab_nota_retirar('${a.id}'::uuid, 'corto', 'super@vb.mx', '${audit}'::jsonb)`)).rejects.toThrow(/cambio_invalido/)
    await expect(d.query(`select public.contab_nota_retirar('${a.id}'::uuid, 'Ya no aplica por la reforma nueva', 'x', '${audit}'::jsonb)`)).rejects.toThrow(/cambio_invalido/)
    expect((await retirar(a.id as string)).resultado).toBe('ok')
    const f = (await d.query<{ retirada: boolean; retirada_por: string; retirada_motivo: string }>(`select retirada, retirada_por, retirada_motivo from public.contab_conocimiento where id = '${a.id}'`)).rows[0]
    expect(f).toEqual({ retirada: true, retirada_por: 'super@vb.mx', retirada_motivo: 'La ley cambió y esta nota ya no aplica' })
    expect((await retirar(a.id as string)).resultado).toBe('ya_retirada')
    expect((await retirar('00000000-0000-4000-8000-000000000000')).resultado).toBe('no_existe')
    expect(Number((await d.query<{ n: string }>(`select count(*) n from public.audit_logs where entidad = 'contab_conocimiento' and entidad_id = '${a.id}'`)).rows[0].n)).toBe(2)
  })
  it('máximo 30 notas vigentes; retirar una libera un lugar', async () => {
    const vigentes = Number((await d.query<{ n: string }>('select count(*) n from public.contab_conocimiento where not retirada')).rows[0].n)
    const ids: string[] = []
    for (let i = vigentes; i < 30; i++) ids.push((await reg(nota({ titulo: `Nota de relleno ${i}` }))).id as string)
    expect(await reg(nota({ titulo: 'La número 31' }))).toEqual({ resultado: 'tope', maximo: 30 })
    await retirar(ids[0])
    expect((await reg(nota({ titulo: 'Ahora sí cabe' }))).resultado).toBe('ok')
  })
  it('la reversa quita todo y se puede volver a aplicar', async () => {
    await d.exec(sql('49-contabilidad-notas-del-contador.REVERTIR.sql'))
    expect(Number((await d.query<{ n: string }>("select count(*) n from information_schema.tables where table_name = 'contab_conocimiento'")).rows[0].n)).toBe(0)
    expect(Number((await d.query<{ n: string }>("select count(*) n from pg_proc where proname like 'contab\\_nota\\_%'")).rows[0].n)).toBe(0)
    await d.exec(sql('49-contabilidad-notas-del-contador.sql'))
  })
})
