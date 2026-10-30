import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Centro de Ayuda · «¿Qué correos me manda VIVE BIEN y cómo los controlo?» (migración 64) y borrador del Aviso de Privacidad.
 * PGlite en memoria: nada toca ninguna base real. La migración está aplicada SOLO en staging.
 */
const leer = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')
const SLUG = 'correos-de-vive-bien-y-tus-preferencias'
let db: PGlite
const articulo = async () => (await db.query<{ cuerpo: string; estado: string; estado_producto: string; aviso: string | null; ambito: string; titulo: string }>(
  `select a.cuerpo, a.estado, a.estado_producto, a.aviso, a.ambito, a.titulo from public.knowledge_articles a join public.knowledge_categories c on c.id = a.categoria_id and c.slug = 'privacidad-y-seguridad' where a.slug = $1`, [SLUG])).rows[0]

beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(leer('supabase/27-centro-de-ayuda.sql'))
  await db.exec(leer('supabase/27-centro-de-ayuda-contenido.sql'))
  await db.exec(leer('supabase/64-ayuda-correos-y-preferencias.sql'))
}, 90_000)
afterAll(async () => { await db?.close() })

describe('migración 64: artículo de correos', () => {
  it('queda publicado, público y con aviso de producto «parcial»', async () => {
    const a = await articulo()
    expect(a).toMatchObject({ estado: 'PUBLICADO', estado_producto: 'parcial', ambito: 'publica' })
    expect(a.aviso).toMatch(/promocionales todavía no se envían/)
  })

  it('usa solo lo que el visor entiende: párrafos, negritas y enlaces (sin listas, tablas ni HTML)', async () => {
    const { cuerpo } = await articulo()
    expect(cuerpo).not.toMatch(/^\s*[-*+] |^\s*\d+\. |\|.*\||<[a-z]/im)
    expect(cuerpo).toContain('[Aviso de Privacidad](/privacidad)')
  })

  it('separa servicio y promocional y dice lo que el código hace (baja con supresión, dos años, sin aperturas ni clics, promocionales apagados)', async () => {
    const { cuerpo } = await articulo()
    for (const frag of ['**Correos de servicio.**', '**Correos promocionales.**', 'Hoy VIVE BIEN no envía correos promocionales', 'una huella derivada de tu correo', 'no afecta a los correos de servicio', 'hasta por dos años desde el envío', 'No registramos si abres un correo']) expect(cuerpo, frag).toContain(frag)
  })

  it('coincide con el código: la constante de marketing apagada, los dos años y la supresión de baja', () => {
    expect(leer('src/lib/correo/config.ts')).toMatch(/MARKETING_AUTORIZADO = false/)
    expect(leer('supabase/62-correo-suscripciones.sql')).toMatch(/730 days/)
    expect(leer('supabase/63-correo-baja-promocional.sql')).toMatch(/'baja_promocional'/)
  })

  it('es idempotente (no duplica el artículo ni sus fuentes) y registra sus fuentes', async () => {
    await db.exec(leer('supabase/64-ayuda-correos-y-preferencias.sql'))
    const n = await db.query<{ n: number }>(`select count(*)::int as n from public.knowledge_articles where slug = $1`, [SLUG])
    expect(n.rows[0].n).toBe(1)
    const f = await db.query<{ tipo: string }>(`select s.tipo from public.knowledge_article_sources s join public.knowledge_articles a on a.id = s.articulo_id where a.slug = $1 order by 1`, [SLUG])
    expect(f.rows.map((x) => x.tipo)).toEqual(['api', 'legal', 'product'])
  })

  it('la reversa quita el artículo y se puede volver a aplicar', async () => {
    await db.exec(leer('supabase/64-ayuda-correos-y-preferencias.REVERTIR.sql'))
    expect(await articulo()).toBeUndefined()
    await db.exec(leer('supabase/64-ayuda-correos-y-preferencias.sql'))
    expect(await articulo()).toBeDefined()
  })
})

describe('borrador del Aviso de Privacidad (correos)', () => {
  const p = leer('src/app/privacidad/page.tsx')
  it('describe los correos de servicio, la baja con supresión, el registro de envíos y a Resend', () => {
    for (const frag of ['Correos de servicio y seguridad', 'Hoy no enviamos correos promocionales', 'una huella derivada del correo', 'hasta por dos años desde el envío', 'No registramos si usted abre un correo', 'Resend:</strong> envío de los correos de VIVE BIEN']) expect(p, frag).toContain(frag)
  })
  it('está marcado como BORRADOR sin validar y NO sube la versión legal (eso lo decide el dueño con asesoría)', () => {
    expect(p).toContain('BORRADOR 30-oct-2026')
    expect(p).toContain('NO está validado por asesoría legal')
    expect(leer('src/lib/aceptacion-legal.ts')).toContain("privacidad: '2026-10-22'")
  })
})
