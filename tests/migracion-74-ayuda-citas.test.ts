import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ETIQUETA_ESTADO, HORAS_MINIMAS_CLIENTE } from '../src/lib/citas/estados'
import { FLAGS_APAGADOS } from '../src/lib/config/flags'

/**
 * Migración 74 (+ 74b): el Centro de Ayuda al día con las citas v2.
 * PGlite en memoria: nada toca ninguna base real. Dos escenarios de partida: PRODUCCIÓN (con el contenido de 27, 29, 30 y 64) y STAGING (solo el esquema y
 * dos categorías); el estado final de los artículos de citas debe ser el mismo. Los textos se comprueban contra las constantes y las pantallas reales.
 */
const leer = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')
const SQL74 = 'supabase/74-ayuda-citas.sql'
const REV74 = 'supabase/74-ayuda-citas.REVERTIR.sql'
const SQL74B = 'supabase/74b-ayuda-citas-activar.sql'
const REV74B = 'supabase/74b-ayuda-citas-activar.REVERTIR.sql'

const NUEVOS = [
  ['consultas-y-visitas', 'estados-de-una-cita'], ['consultas-y-visitas', 'correos-de-tus-citas'],
  ['consultas-y-visitas', 'datos-que-se-comparten-en-una-cita'], ['consultas-y-visitas', 'calendario-y-agenda-de-mis-citas'],
  ['publicadores', 'quien-atiende-las-citas-de-mis-propiedades'], ['publicadores', 'mi-disponibilidad-para-citas'],
  ['administracion', 'gestionar-las-citas-del-equipo'],
] as const
const EXISTENTES = [
  ['consultas-y-visitas', 'como-solicitar-una-visita'], ['consultas-y-visitas', 'como-se-confirma-una-visita'], ['consultas-y-visitas', 'cancelar-o-reprogramar'],
  ['consultas-y-visitas', 'mi-historial-de-visitas'], ['consultas-y-visitas', 'recordatorios-de-visita'], ['consultas-y-visitas', 'google-calendar'],
  ['publicadores', 'citas-recibidas'], ['publicadores', 'mis-visitas-como-publicador'], ['administracion', 'permisos-de-citas-y-citas-en-linea'],
] as const
const TODOS = [...NUEVOS, ...EXISTENTES]
const SLUGS = TODOS.map((t) => t[1])

let db: PGlite
type Fila = Record<string, unknown>
const filas = async (sql: string) => (await db.query<Fila>(sql)).rows
const cuenta = async (sql: string) => Number((await filas(sql))[0].n)

async function nuevaBase(escenario: 'produccion' | 'staging') {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(leer('supabase/27-centro-de-ayuda.sql'))
  if (escenario === 'produccion') {
    for (const f of ['supabase/27-centro-de-ayuda-contenido.sql', 'supabase/29-ayuda-publicador-asociado.sql', 'supabase/30-ayuda-administracion-permisos.sql', 'supabase/64-ayuda-correos-y-preferencias.sql']) await db.exec(leer(f))
  } else {
    // Staging tiene 2 categorías y unos pocos artículos; ninguno de citas.
    await db.exec(`insert into public.knowledge_categories (slug, nombre, descripcion, icono, ambito, orden) values
      ('busquedas-y-alertas','Búsquedas y alertas','x','bell','publica',4), ('privacidad-y-seguridad','Privacidad y seguridad','x','lock','publica',8);`)
  }
}
/** Todo lo que la 74 puede tocar, en un formato comparable. */
const instantanea = async () => ({
  articulos: await filas(`select c.slug cat, a.slug, a.titulo, a.resumen, a.cuerpo, a.estado, a.estado_producto, a.aviso, a.prioridad, a.ambito
                           from public.knowledge_articles a join public.knowledge_categories c on c.id = a.categoria_id order by c.slug, a.slug`),
  fuentes: await filas(`select c.slug cat, a.slug, s.tipo, s.clave, s.version_fuente from public.knowledge_article_sources s
                         join public.knowledge_articles a on a.id = s.articulo_id join public.knowledge_categories c on c.id = a.categoria_id order by 1,2,3,4`),
  categorias: await filas('select slug, nombre, descripcion, ambito from public.knowledge_categories order by slug'),
})

afterEach(async () => { try { await db?.close() } catch { /* ya cerrada por el propio test */ } })

describe('migración 74 · producción: corrige lo viejo, añade lo nuevo, es repetible', () => {
  beforeEach(async () => { await nuevaBase('produccion') }, 90_000)

  it('deja los 16 artículos de citas publicados, con su ámbito, y repetir la migración no duplica nada', async () => {
    const antes = await cuenta('select count(*) n from public.knowledge_articles')
    await db.exec(leer(SQL74))
    await db.exec(leer(SQL74))
    expect(await cuenta('select count(*) n from public.knowledge_articles')).toBe(antes + NUEVOS.length)
    const f = await filas(`select c.slug cat, a.slug, a.estado, a.ambito from public.knowledge_articles a join public.knowledge_categories c on c.id = a.categoria_id
                           where a.slug = any(array['${SLUGS.join("','")}']) order by 1, 2`)
    expect(f).toHaveLength(TODOS.length)
    for (const r of f) expect(r.estado, `${r.cat}/${r.slug}`).toBe('PUBLICADO')
    const ambito = Object.fromEntries(f.map((r) => [`${r.cat}/${r.slug}`, r.ambito]))
    for (const [cat, slug] of TODOS) expect(ambito[`${cat}/${slug}`], slug).toBe(cat === 'consultas-y-visitas' ? 'publica' : cat === 'publicadores' ? 'publicador' : 'administrativa')
  })

  it('con `citasEnLinea` apagado ningún artículo promete la función: todos son «parcial» y con aviso (el CHECK de la tabla lo exige)', async () => {
    expect(FLAGS_APAGADOS.citasEnLinea).toBe(false)
    await db.exec(leer(SQL74))
    const f = await filas(`select a.slug, a.estado_producto ep, a.aviso from public.knowledge_articles a where a.slug = any(array['${SLUGS.join("','")}'])`)
    for (const r of f) {
      expect(r.ep, String(r.slug)).toBe('parcial')
      expect(String(r.aviso ?? '').trim().length, `aviso de ${r.slug}`).toBeGreaterThan(20)
    }
  })

  it('corrige las frases viejas de los artículos de 29 y de 64, sin tocar el resto de su texto', async () => {
    const pre = await instantanea()
    await db.exec(leer(SQL74))
    const cuerpo = async (cat: string, slug: string) => String((await filas(`select a.cuerpo from public.knowledge_articles a join public.knowledge_categories c on c.id = a.categoria_id where c.slug='${cat}' and a.slug='${slug}'`))[0].cuerpo)
    expect(await cuerpo('publicadores', 'permisos-de-citas')).not.toContain('abres un enlace de un correo')
    expect(await cuerpo('publicadores', 'permisos-de-citas')).toContain('cada vez que pulsas un botón: no basta con que el botón se vea')
    expect(await cuerpo('publicadores', 'solicitudes-de-tus-propiedades')).not.toContain('Lo que sí recibes son las **citas**')
    expect(await cuerpo('publicadores', 'solicitudes-de-tus-propiedades')).toContain('las atiende VIVE BIEN')
    const correos = await filas(`select cuerpo, aviso from public.knowledge_articles where slug = 'correos-de-vive-bien-y-tus-preferencias'`)
    expect(String(correos[0].cuerpo)).toContain('los avisos de tus citas')
    expect(String(correos[0].cuerpo)).not.toContain('los avisos de tus visitas')
    expect(String(correos[0].aviso)).toContain('los avisos de citas dependen')
    // Los artículos que la 74 no menciona quedan idénticos.
    const post = await instantanea()
    const igual = (a: Fila, b: Fila) => JSON.stringify(a) === JSON.stringify(b)
    const tocados = new Set([...SLUGS, 'permisos-de-citas', 'solicitudes-de-tus-propiedades', 'correos-de-vive-bien-y-tus-preferencias'])
    for (const a of pre.articulos) {
      if (tocados.has(String(a.slug))) continue
      const b = post.articulos.find((x) => x.cat === a.cat && x.slug === a.slug)
      expect(b && igual(a, b), `${a.cat}/${a.slug} no debe cambiar`).toBe(true)
    }
  })

  it('las fuentes: se quitan las que ya no son ciertas y quedan las de las pantallas nuevas', async () => {
    await db.exec(leer(SQL74))
    const fuentes = await filas(`select a.slug, s.tipo, s.clave from public.knowledge_article_sources s join public.knowledge_articles a on a.id = s.articulo_id where a.slug = any(array['${SLUGS.join("','")}'])`)
    const claves = fuentes.map((f) => `${f.tipo}:${f.clave}`)
    expect(claves).not.toContain('route:/portal/visitas')
    expect(claves).not.toContain('api:/api/citas/accion')
    expect(claves).toContain('route:/portal/citas')
    expect(claves).toContain('route:/publicador/citas')
    expect(claves).toContain('route:/admin/citas')
    expect(claves).toContain('component:AgendarCita')
    for (const [, slug] of TODOS) expect(fuentes.some((f) => f.slug === slug), `${slug} sin fuentes`).toBe(true)
  })

  it('LA REVERSA devuelve exactamente lo de antes: textos, avisos, fuentes y categorías; y no borra categorías', async () => {
    const antes = await instantanea()
    await db.exec(leer(SQL74))
    await db.exec(leer(REV74))
    const despues = await instantanea()
    expect(despues.articulos).toEqual(antes.articulos)
    expect(despues.categorias).toEqual(antes.categorias)
    expect(despues.fuentes).toEqual(antes.fuentes)
    expect(await cuenta(`select count(*) n from public.knowledge_articles where slug = any(array['${NUEVOS.map((n) => n[1]).join("','")}'])`)).toBe(0)
  })
})

describe('migración 74 · staging (casi sin contenido): crea lo que falta y llega al MISMO estado final', () => {
  it('crea las categorías, inserta los 16 artículos y el estado final de esos artículos es idéntico al de producción', async () => {
    await nuevaBase('staging')
    await db.exec(leer(SQL74))
    await db.exec(leer(SQL74))
    const enStaging = await filas(`select c.slug cat, a.slug, a.titulo, a.resumen, a.cuerpo, a.estado, a.estado_producto, a.aviso, a.prioridad, a.ambito from public.knowledge_articles a
      join public.knowledge_categories c on c.id = a.categoria_id where a.slug = any(array['${SLUGS.join("','")}']) order by 1, 2`)
    expect(enStaging).toHaveLength(TODOS.length)
    await db.close()
    await nuevaBase('produccion')
    await db.exec(leer(SQL74))
    const enProduccion = await filas(`select c.slug cat, a.slug, a.titulo, a.resumen, a.cuerpo, a.estado, a.estado_producto, a.aviso, a.prioridad, a.ambito from public.knowledge_articles a
      join public.knowledge_categories c on c.id = a.categoria_id where a.slug = any(array['${SLUGS.join("','")}']) order by 1, 2`)
    expect(enStaging).toEqual(enProduccion)
  }, 90_000)
})

describe('migración 74b · al encender `citasEnLinea`', () => {
  beforeEach(async () => { await nuevaBase('produccion'); await db.exec(leer(SQL74)) }, 90_000)

  it('pasa los artículos a «disponible» y sin aviso, salvo el del calendario (no hay sincronización automática), y es repetible', async () => {
    await db.exec(leer(SQL74B))
    await db.exec(leer(SQL74B))
    const f = await filas(`select a.slug, a.estado_producto ep, a.aviso from public.knowledge_articles a where a.slug = any(array['${SLUGS.join("','")}'])`)
    for (const r of f) {
      if (r.slug === 'google-calendar') { expect(r.ep).toBe('parcial'); expect(String(r.aviso)).toContain('.ics'); continue }
      expect(r.ep, String(r.slug)).toBe('disponible')
      expect(r.aviso, String(r.slug)).toBeNull()
    }
    const correos = await filas(`select aviso from public.knowledge_articles where slug = 'correos-de-vive-bien-y-tus-preferencias'`)
    expect(String(correos[0].aviso)).not.toContain('dependen de que las citas en línea')
    expect(String(correos[0].aviso)).toBe('Los correos promocionales todavía no se envían.')
  })

  it('su reversa deja el estado idéntico al de justo después de la 74', async () => {
    const tras74 = await instantanea()
    await db.exec(leer(SQL74B))
    await db.exec(leer(REV74B))
    expect(await instantanea()).toEqual(tras74)
  })
})

describe('los textos: formato del visor, rutas, vocabulario y coherencia con el código', () => {
  const sin = (s: string) => s.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')
  const cuerpos = () => [...sin(leer(SQL74)).matchAll(/\$c\$([\s\S]*?)\$c\$/g)].map((m) => m[1])
  const todo = () => cuerpos().join('\n\n')

  it('hay un cuerpo por artículo y solo usan lo que entiende el visor: párrafos, negritas y enlaces (sin tablas, listas, encabezados ni comillas invertidas)', () => {
    expect(cuerpos()).toHaveLength(TODOS.length)
    for (const c of cuerpos()) {
      expect(c, 'sin tabla').not.toMatch(/^\s*\|/m)
      expect(c, 'sin lista').not.toMatch(/^\s*([-*•]|\d+\.)\s/m)
      expect(c, 'sin encabezado').not.toMatch(/^\s*#/m)
      expect(c, 'sin código').not.toContain('`')
      expect(c.trim().length).toBeGreaterThan(80)
    }
  })

  it('todo enlace interno apunta a una pantalla que existe', () => {
    const rutas = new Set([...todo().matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]))
    expect(rutas.size).toBeGreaterThan(4)
    for (const r of rutas) expect(existsSync(path.join(__dirname, '..', 'src', 'app', r.replace(/^\//, ''), 'page.tsx')), `la ruta ${r} no existe`).toBe(true)
  })

  it('vocabulario vigente: los ocho estados con su etiqueta del código; «Mis visitas» ya no es el nombre de nada', () => {
    const estados = cuerpos().find((c) => c.includes('**Pendiente.**'))!
    for (const etiqueta of Object.values(ETIQUETA_ESTADO)) expect(estados.toLowerCase(), etiqueta).toContain(`**${etiqueta.toLowerCase()}.**`)
    expect(todo()).not.toMatch(/Mis visitas/)
    expect(todo()).toContain('[Citas](/portal/citas)')
  })

  it('la regla de cancelación sale de la constante del código (2 h), los recordatorios de la migración 70 (24 h y 1 h) y la cita vigente se conserva al reprogramar', () => {
    expect(HORAS_MINIMAS_CLIENTE).toBe(2)
    const cancelar = cuerpos().find((c) => c.includes('**Cancelar cita**'))!
    expect(cancelar).toContain(`hasta ${HORAS_MINIMAS_CLIENTE} horas antes`)
    expect(cancelar).toContain('contacta a VIVE BIEN')
    expect(cancelar).toMatch(/sigue vigente/)
    const m70 = leer('supabase/70-citas-v2.sql')
    expect(m70).toContain("('24h', interval '24 hours'), ('1h', interval '1 hour')")
    const recordatorios = cuerpos().find((c) => c.includes('**24 horas antes**'))!
    expect(recordatorios).toContain('**1 hora antes**')
  })

  it('la solicitud NO aparta el horario (D-2) y los correos NO traen botones de acción (D-3): ningún artículo dice lo contrario', () => {
    const t = todo()
    expect(t).toContain('no aparta el horario')
    expect(t).toMatch(/Ningún correo trae botones/)
    expect(t).not.toMatch(/(pulsa|haz clic|toca) (en )?(el botón )?(del correo|«Confirmar»|«Aceptar»|«Cancelar»)/i)
    expect(t).not.toMatch(/desde el correo (puedes|podrás) (confirmar|cancelar|aceptar)/i)
    expect(t).not.toMatch(/se (aparta|reserva) (el horario )?al (enviar|pedir)/i)
  })

  it('los nombres de pantallas y botones que citan los artículos existen en el código', () => {
    const ficha = leer('src/components/AgendarCita.tsx')
    expect(ficha).toContain('Agenda una cita')
    expect(ficha).toContain('Solicitud enviada')
    expect(ficha).toContain('Enviar solicitud')
    const panel = leer('src/components/citas/PanelCitas.tsx') + leer('src/components/citas/DetalleCita.tsx') + leer('src/components/citas/ListaCitas.tsx')
    for (const s of ['Calendario', 'Agenda', 'Historial', 'Actualizar', 'Horario ocupado', 'Por responder']) expect(panel, s).toContain(s)
    expect(leer('src/lib/citas/estados.ts')).toContain("cancelar: 'Cancelar cita'")
    expect(leer('src/app/publicador/citas/page.tsx')).toContain('Mi disponibilidad')
    expect(leer('src/app/admin/citas/page.tsx')).toContain('Disponibilidad')
    const t = todo()
    for (const s of ['Agenda una cita', 'Solicitud enviada', 'Enviar solicitud', 'Cancelar cita', 'Horario ocupado', 'Mi disponibilidad']) expect(t, s).toContain(s)
  })

  it('los rangos de la disponibilidad salen de la validación del código', () => {
    const v = leer('src/lib/citas/agenda.ts')
    for (const [campo, min, max] of [['duracionMin', 15, 240], ['margenMin', 0, 120], ['anticipacionHoras', 0, 168], ['ventanaDias', 1, 180]] as const) expect(v, campo).toContain(`entero(a.${campo}, ${min}, ${max})`)
    const d = cuerpos().find((c) => c.includes('**Duración de la visita**'))!
    expect(d).toContain('de 15 a 240 minutos')
    expect(d).toContain('de 0 a 120')
    expect(d).toContain('hasta 168 horas')
    expect(d).toContain('de 1 a 180')
  })

  it('privacidad: dice con quién se comparten los datos y remite al Aviso y a los Términos', () => {
    const datos = cuerpos().find((c) => c.includes('**El dueño de una propiedad que es publicador**'))!
    expect(datos).toContain('sin tu nombre, teléfono, correo ni notas')
    expect(datos).toContain('[Aviso de Privacidad](/privacidad)')
    expect(datos).toContain('[Términos y condiciones](/terminos)')
  })

  it('la reversa y la 74b solo mencionan artículos de la 74 y no borran categorías ni tablas', () => {
    for (const f of [REV74, REV74B, SQL74B]) {
      const s = sin(leer(f))
      expect(s, f).not.toMatch(/\bdrop\s+(table|schema|column)\b/i)
      expect(s, f).not.toMatch(/delete\s+from\s+public\.knowledge_categories/i)
      expect(s, f).not.toMatch(/\btruncate\b/i)
    }
    expect(sin(leer(SQL74))).not.toMatch(/\bdrop\b/i)   // sin DROP: la herramienta de migraciones no pide confirmación humana
  })
})
