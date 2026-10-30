import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CAPACIDADES, MINIMO_MOTIVO_PERMISOS } from '../src/lib/acceso/capacidades'
import { FICHAS, GRUPOS, ORDEN_DE_GRUPOS } from '../src/lib/admin/permisos'

/**
 * Centro de Ayuda · administración de permisos (migración 30, fase ADMIN).
 *
 * En PGlite, en memoria. Demuestra que la migración aplica y se puede reaplicar,
 * que el ámbito administrativo no es legible por la lectura anónima, que el
 * cuerpo se lee en el visor, y —lo importante— que LO QUE DICE LA AYUDA
 * COINCIDE CON LO QUE HACE LA PANTALLA: si cambia una etiqueta, un grupo, el
 * mínimo del motivo o un aviso, esta prueba falla hasta actualizar el artículo.
 */

const leerSql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const leerSrc = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')
const ROLES = 'create role anon; create role authenticated; create role service_role;'

const SLUGS = [
  'donde-se-administran-los-permisos', 'cambiar-la-modalidad', 'permisos-individuales', 'que-controla-cada-permiso',
  'datos-del-interesado-y-contacto-publico', 'permisos-de-citas-y-citas-en-linea', 'motivo-y-bitacora', 'quien-puede-cambiar-permisos',
]

type Art = { slug: string; cuerpo: string; estado: string; estado_producto: string; aviso: string | null; ambito: string; publicado_por: string | null }
let db: PGlite

async function base(): Promise<PGlite> {
  const d = new PGlite()
  await d.exec(ROLES)
  await d.exec(leerSql('27-centro-de-ayuda.sql'))
  await d.exec(leerSql('27-centro-de-ayuda-contenido.sql'))
  return d
}
const arts = async (d: PGlite) =>
  (await d.query<Art>(`select a.slug, a.cuerpo, a.estado, a.estado_producto, a.aviso, a.ambito, a.publicado_por
                         from public.knowledge_articles a join public.knowledge_categories c on c.id = a.categoria_id
                        where c.slug = 'administracion' order by a.slug`)).rows
const cuerpo = (as: Art[], slug: string) => as.find((a) => a.slug === slug)!.cuerpo

beforeAll(async () => {
  db = await base()
  await db.exec(leerSql('29-ayuda-publicador-asociado.sql'))
  await db.exec(leerSql('30-ayuda-administracion-permisos.sql'))
  // 40: el permiso «Sin comisión» (Etapa B) se documenta en el mismo artículo. La ayuda y la pantalla tienen que decir lo mismo.
  await db.exec(leerSql('40-ayuda-sin-comision.sql'))
}, 120_000)
afterAll(async () => { await db?.close() })

describe('la migración aplica y se puede reaplicar', () => {
  it('crea la categoría administrativa y los 8 artículos', async () => {
    const as = await arts(db)
    expect(as.map((a) => a.slug).sort()).toEqual([...SLUGS].sort())
    expect(as.every((a) => a.ambito === 'administrativa')).toBe(true)
    const { rows } = await db.query<{ ambito: string }>(`select ambito from public.knowledge_categories where slug='administracion'`)
    expect(rows[0].ambito).toBe('administrativa')
  })

  it('todo lo publicado lleva constancia de quién lo aprobó y lo parcial lleva aviso', async () => {
    for (const a of await arts(db)) {
      expect(a.estado, a.slug).toBe('PUBLICADO')
      expect(a.publicado_por, a.slug).toBeTruthy()
      if (a.estado_producto !== 'disponible') expect(a.aviso?.trim().length, a.slug).toBeGreaterThan(10)
    }
  })

  it('es idempotente', async () => {
    await expect(db.exec(leerSql('30-ayuda-administracion-permisos.sql'))).resolves.toBeDefined()
    expect(await arts(db)).toHaveLength(8)
    // Reaplicar la 30 deja el artículo como estaba antes de la 40: se vuelve a aplicar (también es idempotente).
    await db.exec(leerSql('40-ayuda-sin-comision.sql'))
    await expect(db.exec(leerSql('40-ayuda-sin-comision.sql'))).resolves.toBeDefined()
  })

  it('no toca lo público ni lo del publicador (migración 29)', async () => {
    const antes = await base()
    await antes.exec(leerSql('29-ayuda-publicador-asociado.sql'))
    const q = `select count(*)::int as n, md5(string_agg(slug || cuerpo, '|' order by slug)) as huella from public.knowledge_articles a where ambito in ('publica','publicador')`
    const a = (await antes.query<{ n: number; huella: string }>(q)).rows[0]
    const d = (await db.query<{ n: number; huella: string }>(q)).rows[0]
    expect(d).toEqual(a)
    await antes.close()
  }, 90_000)

  it('la lectura anónima no ve nada del ámbito administrativo', async () => {
    await db.exec('grant usage on schema public to anon; grant select on all tables in schema public to anon;')
    await db.exec('set role anon')
    try {
      const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.knowledge_articles where ambito = 'administrativa'`)
      expect(rows[0].n).toBe(0)
    } finally {
      await db.exec('reset role')
    }
  })

  it('el cuerpo sólo usa párrafos, negritas y enlaces (el visor no entiende tablas ni listas)', async () => {
    for (const a of await arts(db)) {
      expect(a.cuerpo, a.slug).not.toMatch(/^\s*\|/m)
      expect(a.cuerpo, a.slug).not.toMatch(/^\s*[-*] /m)
      expect(a.cuerpo, a.slug).not.toMatch(/<[a-z][^>]*>/i)
      expect(a.cuerpo, a.slug).not.toMatch(/[^\n]\n[^\n]/)
    }
  })

  it('la reversa deja la base como estaba', async () => {
    const d = await base()
    await d.exec(leerSql('29-ayuda-publicador-asociado.sql'))
    await d.exec(leerSql('30-ayuda-administracion-permisos.sql'))
    await d.exec(leerSql('30-ayuda-administracion-permisos.REVERTIR.sql'))
    expect(await arts(d)).toHaveLength(0)
    const { rows } = await d.query<{ n: number }>(`select count(*)::int as n from public.knowledge_categories where slug='administracion'`)
    expect(rows[0].n).toBe(0)
    await d.close()
  }, 90_000)
})

describe('la ayuda dice lo mismo que la pantalla', () => {
  const ui = leerSrc('src/components/admin/usuarios/PermisosPublicador.tsx')
  const lista = leerSrc('src/app/admin/usuarios/page.tsx')

  it('«Qué controla cada permiso» nombra TODOS los permisos del catálogo, con la etiqueta exacta de la pantalla, y los títulos de grupo', async () => {
    const t = cuerpo(await arts(db), 'que-controla-cada-permiso')
    for (const c of CAPACIDADES) {
      // la etiqueta de la pantalla, sin mayúscula inicial (aparece dentro de una frase)
      const e = FICHAS[c].etiqueta.replace(/^Recibir aviso de solicitudes$/, 'Recibir aviso de solicitudes')
      expect(t.toLowerCase(), c).toContain(e.toLowerCase().replace('ver los datos del interesado', 'ver los datos del interesado'))
    }
    for (const g of ORDEN_DE_GRUPOS) {
      const titulo = GRUPOS[g].titulo
      // el artículo usa el título de cada grupo como encabezado en negritas
      expect(t, g).toMatch(new RegExp(`\\*\\*${titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(' y ')[0]}`))
    }
  })

  it('el mínimo del motivo que dice la ayuda es el del código y el de la pantalla', async () => {
    expect(MINIMO_MOTIVO_PERMISOS).toBe(10)
    expect(cuerpo(await arts(db), 'motivo-y-bitacora')).toContain(`al menos ${MINIMO_MOTIVO_PERMISOS} caracteres`)
    expect(ui).toContain('MINIMO_MOTIVO_PERMISOS')
    expect(ui).toMatch(/disabled=\{!motivoValido \|\| guardando\}/)
  })

  it('las acciones y avisos que describe la ayuda existen en la pantalla', async () => {
    const as = await arts(db)
    expect(lista).toContain('Modalidad y permisos')
    expect(lista).toContain('ver permisos')
    expect(cuerpo(as, 'donde-se-administran-los-permisos')).toContain('**Modalidad y permisos**')
    expect(cuerpo(as, 'donde-se-administran-los-permisos')).toContain('«ver permisos»')
    for (const texto of ['Revisar y guardar', 'Descartar', 'Según modalidad', 'Datos personales', 'Efectivo:']) expect(ui, texto).toContain(texto)
    const permisos = cuerpo(as, 'permisos-individuales')
    expect(permisos).toContain('**Revisar y guardar**')
    expect(permisos).toContain('**Descartar**')
    expect(permisos).toContain('«Según modalidad (No)»')
  })

  it('la ayuda describe el conflicto de edición con el mismo mensaje que da el servidor, y el guardado atómico', async () => {
    const t = cuerpo(await arts(db), 'motivo-y-bitacora')
    expect(t).toContain('«Alguien cambió esta cuenta…»')
    expect(t).toContain('en una sola operación')
    expect(t).toContain('«Recargar la cuenta»')
    expect(ui).toContain('Recargar la cuenta')
    expect(leerSrc('src/app/api/admin/usuarios/route.ts')).toContain('Alguien cambió esta cuenta mientras la editabas')
    expect(leerSrc('src/app/api/admin/usuarios/route.ts')).toContain("rpc('usuario_cambiar_permisos'")
  })

  it('el aviso de las citas en línea de la ayuda es el de la pantalla', async () => {
    expect(ui).toContain('Las citas en línea están desactivadas')
    expect(cuerpo(await arts(db), 'permisos-de-citas-y-citas-en-linea')).toContain('«Las citas en línea están desactivadas»')
  })

  it('lo que la ayuda marca como sin efecto hoy coincide con las fichas de la pantalla', async () => {
    const t = cuerpo(await arts(db), 'datos-del-interesado-y-contacto-publico')
    const sinEfecto = CAPACIDADES.filter((c) => FICHAS[c].sinEfectoHoy)
    expect(sinEfecto).toContain('mostrar_telefono')
    expect(sinEfecto).toContain('mostrar_whatsapp')
    expect(sinEfecto).toContain('mostrar_email')
    expect(sinEfecto).toContain('mostrar_foto')
    expect(t).toMatch(/El teléfono, el WhatsApp, el correo y la foto del publicador todavía no se muestran en ninguna pantalla pública/)
    const aviso = (await arts(db)).find((a) => a.slug === 'datos-del-interesado-y-contacto-publico')!.aviso!
    expect(aviso).toMatch(/teléfono, WhatsApp, correo y foto todavía no tiene efecto/)
  })

  it('la ayuda no promete permisos que no existen («contacto público» como permiso suelto)', async () => {
    for (const a of await arts(db)) expect(a.cuerpo, a.slug).not.toMatch(/contacto_publico/)
  })
})
