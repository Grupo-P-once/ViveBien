import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Migración 75 (auditoría de seguridad 7-nov-2026): las tablas de ayuda solo conservan SELECT para anon/authenticated, y solo en lo que el sitio público lee. */
const sql = readFileSync('supabase/75-ayuda-permisos-minimos.sql', 'utf8')
const reversa = readFileSync('supabase/75-ayuda-permisos-minimos.REVERTIR.sql', 'utf8')
const TABLAS = ['article_relations', 'article_sources', 'article_tags', 'article_versions', 'articles', 'categories', 'change_events', 'feedback', 'searches'].map((t) => `public.knowledge_${t}`)
const sinComentarios = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

describe('migración 75 · permisos mínimos de la ayuda', () => {
  it('revoca TODO a anon y authenticated en las 9 tablas de ayuda', () => {
    const rev = sinComentarios(sql).match(/revoke all on([\s\S]*?)from anon, authenticated;/)
    expect(rev).not.toBeNull()
    for (const t of TABLAS) expect(rev![1], t).toContain(t)
  })
  it('solo devuelve SELECT (nunca escritura) y solo de lo que lee el sitio público', () => {
    const grants = [...sinComentarios(sql).matchAll(/grant ([a-z, ]+) on([\s\S]*?)to anon, authenticated;/g)]
    expect(grants).toHaveLength(1)
    expect(grants[0][1].trim()).toBe('select')
    for (const t of ['articles', 'categories', 'article_tags', 'article_relations']) expect(grants[0][2]).toContain(`public.knowledge_${t}`)
    for (const t of ['feedback', 'searches', 'article_versions', 'article_sources', 'change_events']) expect(grants[0][2], t).not.toContain(`knowledge_${t}`)
  })
  it('una transacción, sin tocar datos ni políticas, con reversa', () => {
    const cuerpo = sinComentarios(sql)
    expect(cuerpo).toMatch(/begin;[\s\S]*commit;/)
    expect(cuerpo).not.toMatch(/\b(delete|insert|update|truncate|drop|alter)\b/i)
    expect(sinComentarios(reversa)).toMatch(/grant all on/)
    expect(sinComentarios(reversa)).toMatch(/revoke insert on public\.knowledge_feedback/)
  })
})
