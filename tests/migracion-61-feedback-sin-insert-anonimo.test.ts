import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

/**
 * Migración 61 (SEC-7) en Postgres real (PGlite): antes, `anon` inserta directo en `knowledge_feedback` (estado de la 42);
 * después, NO (permission denied) y `service_role` sí; aplicarla dos veces no rompe; la reversa devuelve el permiso; no toca filas.
 */
const m61 = readFileSync('supabase/61-feedback-sin-insert-anonimo.sql', 'utf8')
const rev = readFileSync('supabase/61-feedback-sin-insert-anonimo.REVERTIR.sql', 'utf8')

async function estadoDeLa42() {
  const db = await PGlite.create()
  // `service_role` de Supabase tiene BYPASSRLS (por eso la ruta, con clave de servicio, no depende de la política).
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.knowledge_articles (id uuid primary key, ambito text, estado text);
    create table public.knowledge_feedback (id uuid primary key default gen_random_uuid(), articulo_id uuid not null references public.knowledge_articles(id), util boolean not null,
      comentario text check (comentario is null or length(comentario) <= 500), creado_en timestamptz not null default now());
    alter table public.knowledge_feedback enable row level security;
    grant usage on schema public to anon, authenticated, service_role;
    grant insert on public.knowledge_feedback to anon, authenticated;
    grant select, insert on public.knowledge_feedback to service_role;
    grant select on public.knowledge_articles to anon, authenticated, service_role;
    create policy knowledge_feedback_escribir on public.knowledge_feedback for insert to anon, authenticated
      with check (exists (select 1 from public.knowledge_articles a where a.id = articulo_id and a.ambito = 'publica' and a.estado = 'PUBLICADO'));
    insert into public.knowledge_articles values ('11111111-1111-1111-1111-111111111111', 'publica', 'PUBLICADO');`)
  return db
}
const insertarComo = async (db: PGlite, rol: string) => {
  await db.exec(`set role ${rol}`)
  try {
    await db.exec(`insert into public.knowledge_feedback (articulo_id, util) values ('11111111-1111-1111-1111-111111111111', true)`)
    return 'ok'
  } catch (e) { return String((e as Error).message) } finally { await db.exec('reset role') }
}

describe('migración 61 · knowledge_feedback sin INSERT anónimo', () => {
  it('control positivo: antes de la 61, anon SÍ inserta (el hueco existía)', async () => {
    const db = await estadoDeLa42()
    expect(await insertarComo(db, 'anon')).toBe('ok')
    expect(await insertarComo(db, 'authenticated')).toBe('ok')
  })
  it('después de la 61: anon y authenticated reciben permission denied; service_role sigue insertando', async () => {
    const db = await estadoDeLa42()
    await db.exec(m61)
    expect(await insertarComo(db, 'anon')).toMatch(/permission denied/i)
    expect(await insertarComo(db, 'authenticated')).toMatch(/permission denied/i)
    expect(await insertarComo(db, 'service_role')).toBe('ok')
  })
  it('aplicarla dos veces no rompe, y no toca filas', async () => {
    const db = await estadoDeLa42()
    await insertarComo(db, 'service_role')
    const antes = (await db.query<{ n: number }>('select count(*)::int n from public.knowledge_feedback')).rows[0].n
    await db.exec(m61); await db.exec(m61)
    expect((await db.query<{ n: number }>('select count(*)::int n from public.knowledge_feedback')).rows[0].n).toBe(antes)
  })
  it('la reversa devuelve el permiso a anon (estado de la 42)', async () => {
    const db = await estadoDeLa42()
    await db.exec(m61)
    await db.exec(rev)
    expect(await insertarComo(db, 'anon')).toBe('ok')
  })
  it('no toca ninguna otra tabla ni permisos de SELECT: solo un REVOKE INSERT sobre knowledge_feedback', () => {
    const sentencias = m61.split('\n').filter((l) => /^\s*(revoke|grant|drop|alter|delete|update|insert|truncate)\b/i.test(l))
    expect(sentencias.map((l) => l.trim())).toEqual(['revoke insert on public.knowledge_feedback from anon, authenticated;'])
  })
})
