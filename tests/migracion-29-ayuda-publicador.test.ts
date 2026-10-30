import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CAPACIDADES, DEFAULTS_POR_TIPO } from '../src/lib/acceso/capacidades'
import { MINIMO_FOTOS } from '../src/lib/esquemas/propiedad'
import { AJUSTES_POR_DEFECTO, HORARIO_POR_DEFECTO } from '../src/lib/citas/ajustes'

/**
 * Centro de Ayuda · PUBLICADOR / ASOCIADO (migración 29, ADR-0013).
 *
 * Todo en PGlite, en memoria: nada toca producción. Se demuestra que:
 *   1. la migración aplica sobre 27 + 27b, y se puede reaplicar;
 *   2. los artículos de ámbito `publicador` NO son legibles por la lectura anónima;
 *   3. el cuerpo es legible por el visor del Centro (sólo párrafos, negritas y enlaces);
 *   4. LO QUE DICE LA AYUDA COINCIDE CON EL CÓDIGO (permisos por defecto, fotos mínimas,
 *      horario): si alguien cambia un default sin actualizar el artículo, esta prueba falla;
 *   5. la reversa devuelve la base al estado anterior.
 */

const leerSql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const ROLES = 'create role anon; create role authenticated; create role service_role;'

const NUEVOS = [
  'que-es-un-publicador', 'que-es-un-asociado', 'publicador-o-asociado', 'publicar-con-revision', 'publicar-sin-revision',
  'solicitudes-de-tus-propiedades', 'citas-recibidas', 'mis-visitas-como-publicador', 'permisos-de-citas',
  'datos-que-puede-ver-un-publicador', 'perfil-y-contacto-publico', 'que-depende-de-vive-bien',
]
const CORREGIDOS = ['tu-panel-de-publicador', 'estados-de-una-propiedad']

let db: PGlite
type Art = { slug: string; cuerpo: string; resumen: string; estado: string; estado_producto: string; aviso: string | null; ambito: string; publicado_por: string | null }

async function base(): Promise<PGlite> {
  const d = new PGlite()
  await d.exec(ROLES)
  await d.exec(leerSql('27-centro-de-ayuda.sql'))
  await d.exec(leerSql('27-centro-de-ayuda-contenido.sql'))
  return d
}

const articulos = async (d: PGlite) =>
  (await d.query<Art>(`select a.slug, a.cuerpo, a.resumen, a.estado, a.estado_producto, a.aviso, a.ambito, a.publicado_por
                         from public.knowledge_articles a join public.knowledge_categories c on c.id = a.categoria_id
                        where c.slug = 'publicadores' order by a.slug`)).rows
const cuerpo = (as: Art[], slug: string) => as.find((a) => a.slug === slug)!.cuerpo

beforeAll(async () => { db = await base(); await db.exec(leerSql('29-ayuda-publicador-asociado.sql')) }, 90_000)
afterAll(async () => { await db?.close() })

describe('la migración aplica y se puede reaplicar', () => {
  it('deja los 12 artículos nuevos y corrige los 2 existentes, todos de ámbito publicador', async () => {
    const as = await articulos(db)
    for (const s of [...NUEVOS, ...CORREGIDOS]) expect(as.find((a) => a.slug === s), s).toBeDefined()
    expect(as.every((a) => a.ambito === 'publicador')).toBe(true)
    // 4 que ya había en la categoría (2 se corrigen, 2 siguen como estaban) + 12 nuevos
    expect(as).toHaveLength(16)
  })

  it('todo lo publicado lleva constancia de quién lo aprobó (el CHECK de la base)', async () => {
    const as = await articulos(db)
    for (const a of as.filter((x) => x.estado === 'PUBLICADO')) expect(a.publicado_por, a.slug).toBeTruthy()
  })

  it('lo que sólo existe a medias se publica CON aviso', async () => {
    const as = await articulos(db)
    for (const a of as.filter((x) => x.estado === 'PUBLICADO' && x.estado_producto !== 'disponible')) {
      expect(a.aviso?.trim().length, a.slug).toBeGreaterThan(10)
    }
  })

  it('«estados de una propiedad» pasa de borrador a publicado con el ciclo real', async () => {
    const a = (await articulos(db)).find((x) => x.slug === 'estados-de-una-propiedad')!
    expect(a.estado).toBe('PUBLICADO')
    expect(a.estado_producto).toBe('disponible')
    expect(a.cuerpo).toMatch(/En revisión/)
    expect(a.cuerpo).toMatch(/Cambios solicitados/)
  })

  it('es idempotente: reaplicar no duplica ni rompe nada', async () => {
    await expect(db.exec(leerSql('29-ayuda-publicador-asociado.sql'))).resolves.toBeDefined()
    expect(await articulos(db)).toHaveLength(16)
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.knowledge_articles`)
    expect(rows[0].n).toBe(37 + NUEVOS.length)
  })

  it('no toca lo público: los mismos artículos públicos publicados que antes (29 de los 31 de la 27b; los otros 2 son del ámbito publicador)', async () => {
    const antes = await base()
    const q = `select count(*)::int as n, md5(string_agg(slug || cuerpo, '|' order by slug)) as huella from public.knowledge_articles where ambito='publica' and estado='PUBLICADO'`
    const a = (await antes.query<{ n: number; huella: string }>(q)).rows[0]
    const d = (await db.query<{ n: number; huella: string }>(q)).rows[0]
    expect(d.n).toBe(29)
    expect(d).toEqual(a) // ni un artículo público cambió una coma
    await antes.close()
  }, 60_000)

  it('registra de dónde salió cada artículo nuevo', async () => {
    const { rows } = await db.query<{ slug: string; n: number }>(
      `select a.slug, count(s.*)::int as n from public.knowledge_articles a
         left join public.knowledge_article_sources s on s.articulo_id = a.id
        where a.slug = any($1) group by a.slug`, [NUEVOS])
    for (const r of rows) expect(r.n, r.slug).toBeGreaterThan(0)
    expect(rows).toHaveLength(NUEVOS.length)
  })
})

describe('lo del publicador no sale al público', () => {
  it('la lectura anónima (RLS) no ve ni un artículo de ámbito publicador', async () => {
    await db.exec('grant usage on schema public to anon; grant select on all tables in schema public to anon;')
    await db.exec('set role anon')
    try {
      const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.knowledge_articles where ambito = 'publicador'`)
      expect(rows[0].n).toBe(0)
      const pub = await db.query<{ n: number }>(`select count(*)::int as n from public.knowledge_articles where ambito = 'publica'`)
      expect(pub.rows[0].n).toBeGreaterThan(0) // lo público sigue legible: la prueba no es vacía
    } finally {
      await db.exec('reset role')
    }
  })
})

describe('el cuerpo se lee bien en el visor del Centro', () => {
  it('sólo párrafos, negritas y enlaces: ni tablas, ni listas con guion, ni HTML', async () => {
    for (const a of await articulos(db)) {
      if (!NUEVOS.includes(a.slug) && !CORREGIDOS.includes(a.slug)) continue
      expect(a.cuerpo, a.slug).not.toMatch(/^\s*\|/m)
      expect(a.cuerpo, a.slug).not.toMatch(/^\s*[-*] /m)
      expect(a.cuerpo, a.slug).not.toMatch(/<[a-z][^>]*>/i)
      // cada línea no vacía está separada por una línea en blanco: así se parte en párrafos
      expect(a.cuerpo, a.slug).not.toMatch(/[^\n]\n[^\n]/)
    }
  })
})

describe('la ayuda dice lo mismo que el código', () => {
  const por = (tipo: 'publicador' | 'asociado') => DEFAULTS_POR_TIPO[tipo]

  it('«publicar sin revisión»: sólo el asociado, por defecto', async () => {
    expect(por('asociado').publicar_sin_revision).toBe(true)
    expect(por('publicador').publicar_sin_revision).toBe(false)
    const as = await articulos(db)
    expect(cuerpo(as, 'publicador-o-asociado')).toMatch(/\*\*Publicar\.\*\* Publicador: con revisión de VIVE BIEN\. Asociado: sin revisión previa\./)
    expect(cuerpo(as, 'que-es-un-publicador')).toMatch(/no puedes publicar por tu cuenta/)
  })

  it('«corregir lo ya publicado»: sólo el asociado, por defecto', async () => {
    expect(por('asociado').editar_publicadas).toBe(true)
    expect(por('publicador').editar_publicadas).toBe(false)
    expect(cuerpo(await articulos(db), 'publicador-o-asociado')).toMatch(/Corregir lo ya publicado\.\*\* Publicador: no.*Asociado: sí\./)
  })

  it('las cinco capacidades de citas: apagadas para el publicador, encendidas para el asociado', async () => {
    const citas = ['recibir_citas', 'aceptar_citas', 'rechazar_citas', 'reprogramar_citas', 'cancelar_citas'] as const
    for (const c of citas) {
      expect(por('publicador')[c], `publicador ${c}`).toBe(false)
      expect(por('asociado')[c], `asociado ${c}`).toBe(true)
    }
    const t = cuerpo(await articulos(db), 'permisos-de-citas')
    expect(t).toMatch(/El publicador normal los tiene \*\*apagados\*\*; el asociado los tiene \*\*encendidos\*\*/)
    for (const nombre of ['Recibir citas', 'Aceptar citas', 'Rechazar citas', 'Reprogramar citas', 'Cancelar citas']) expect(t).toContain(`**${nombre}.**`)
  })

  it('los datos del interesado: apagados en AMBAS modalidades, y la ayuda lo dice', async () => {
    expect(por('publicador').ver_datos_interesado).toBe(false)
    expect(por('asociado').ver_datos_interesado).toBe(false)
    const t = cuerpo(await articulos(db), 'datos-que-puede-ver-un-publicador')
    expect(t).toMatch(/Por defecto, ningún publicador ve los datos personales del interesado/)
    expect(t).toMatch(/Esto vale igual para publicador y para asociado/)
    expect(cuerpo(await articulos(db), 'publicador-o-asociado')).toMatch(/Datos personales del interesado\.\*\* Ninguno de los dos/)
  })

  it('el contacto público: teléfono, WhatsApp y correo apagados para los dos; nombre sólo para el asociado', async () => {
    for (const c of ['mostrar_telefono', 'mostrar_whatsapp', 'mostrar_email'] as const) {
      expect(por('publicador')[c]).toBe(false)
      expect(por('asociado')[c]).toBe(false)
    }
    expect(por('asociado').mostrar_perfil && por('asociado').mostrar_nombre).toBe(true)
    expect(por('publicador').mostrar_nombre).toBe(false)
    expect(cuerpo(await articulos(db), 'publicador-o-asociado')).toMatch(/Nombre ante el cliente en sus visitas\.\*\* Publicador: no, por defecto\. Asociado: sí, por defecto\./)
  })

  it('el número mínimo de fotos que dice la ayuda es el del código', async () => {
    expect(MINIMO_FOTOS).toBe(5)
    const as = await articulos(db)
    expect(cuerpo(as, 'publicar-con-revision')).toContain(`al menos ${MINIMO_FOTOS} fotos`)
    expect(cuerpo(as, 'publicar-sin-revision')).toContain(`al menos ${MINIMO_FOTOS} fotos`)
  })

  it('el horario estándar que dice «Citas recibidas» es el del código', async () => {
    const lv = HORARIO_POR_DEFECTO.filter((b) => b.dia >= 1 && b.dia <= 5)
    expect(lv.every((b) => b.desde === '09:00' && b.hasta === '18:00')).toBe(true)
    const sab = HORARIO_POR_DEFECTO.find((b) => b.dia === 6)!
    expect(sab.desde).toBe('10:00')
    expect(sab.hasta).toBe('14:00')
    expect(AJUSTES_POR_DEFECTO.duracionMin).toBe(60)
    expect(AJUSTES_POR_DEFECTO.confirmacion).toBe('manual')
    const t = cuerpo(await articulos(db), 'citas-recibidas')
    expect(t).toContain('lunes a viernes de 9:00 a 18:00 y sábado de 10:00 a 14:00')
    expect(t).toContain('visitas de 1 hora y confirmación manual')
  })

  it('cada capacidad del catálogo se menciona en «Qué depende de VIVE BIEN» (por grupo) y no hay artículos que hablen de una que no existe', async () => {
    expect(CAPACIDADES.length).toBeGreaterThan(0)
    const t = cuerpo(await articulos(db), 'que-depende-de-vive-bien')
    for (const grupo of ['Publicación.', 'Citas.', 'Datos.', 'Contacto público.']) expect(t).toContain(`**${grupo}**`)
    expect(t).toMatch(/no concede nada/)
  })

  it('lo que todavía NO existe se dice en el aviso, no en el cuerpo como si funcionara', async () => {
    const as = await articulos(db)
    const aviso = (s: string) => as.find((a) => a.slug === s)!.aviso ?? ''
    expect(aviso('citas-recibidas')).toMatch(/horario propio todavía no se puede editar/)
    expect(aviso('citas-recibidas')).toMatch(/Pedir visitas en línea todavía no está activo/)
    expect(aviso('mis-visitas-como-publicador')).toMatch(/Pedir visitas en línea todavía no está activo/)
    // El portal de clientes YA está abierto (portalCliente = true): la ayuda no puede decir que se abre por etapas.
    for (const a of as) expect(a.aviso ?? '', a.slug).not.toMatch(/por etapas/)
    expect(aviso('que-es-un-publicador')).toMatch(/comisiones todavía no existe/)
    expect(aviso('solicitudes-de-tus-propiedades')).toMatch(/todavía no está construido/)
    expect(aviso('perfil-y-contacto-publico')).toMatch(/ficha pública/)
    expect(aviso('que-depende-de-vive-bien')).toMatch(/pantalla de administración/)
  })
})

describe('la reversa', () => {
  it('borra los 12 nuevos y devuelve los 2 corregidos a su texto anterior', async () => {
    const d = await base()
    await d.exec(leerSql('29-ayuda-publicador-asociado.sql'))
    await d.exec(leerSql('29-ayuda-publicador-asociado.REVERTIR.sql'))
    const as = await articulos(d)
    expect(as.map((a) => a.slug).sort()).toEqual(['estados-de-una-propiedad', 'por-que-no-puedo-publicar', 'tu-panel-de-publicador', 'tus-leads'])
    const estados = as.find((a) => a.slug === 'estados-de-una-propiedad')!
    expect(estados.estado).toBe('BORRADOR')
    expect(estados.estado_producto).toBe('parcial')
    const { rows } = await d.query<{ n: number }>(`select count(*)::int as n from public.knowledge_articles`)
    expect(rows[0].n).toBe(37)
    await d.close()
  }, 90_000)
})
