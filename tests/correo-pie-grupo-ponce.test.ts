import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { catalogoCompleto, MUESTRA_POR_OMISION, vistaPrevia } from '../src/lib/correo/biblioteca'
import { LOGO_ARCHIVO, LOGO_URL, PONCE_LOGO_ARCHIVO, PONCE_URL, pieTexto } from '../src/lib/correo/plantillas/marca'

/**
 * Pie de TODOS los correos: el símbolo de Grupo P-ONCE en un círculo blanco que lleva a su sitio («VIVE BIEN es una empresa de Grupo P-ONCE»); logotipo COMPLETO de VIVE BIEN
 * (el anterior tiene la bajada recortada); avisos por correo activados por omisión (decisión del dueño) y engranaje de ajustes. PGlite en memoria; sin red ni correo real.
 */
const raiz = path.join(__dirname, '..')
const leer = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8')

describe('Grupo P-ONCE al pie de todos los correos', () => {
  const todos = catalogoCompleto().filter((e) => e.conVista)
  it('hay vistas de todos los grupos y TODAS llevan el círculo blanco con enlace a Grupo P-ONCE', () => {
    expect(todos.length).toBeGreaterThanOrEqual(36)
    for (const e of todos) {
      const v = vistaPrevia(e.id, MUESTRA_POR_OMISION)!
      expect(v.html, e.id).toContain(`href="${PONCE_URL}"`)
      expect(v.html, e.id).toContain('alt="Grupo P-ONCE"')
      expect(v.html, e.id).toMatch(/border-radius:34px/) // el círculo
      expect(v.html, e.id).toMatch(/bgcolor="#FFFFFF"[^>]*width="68"/)
      expect(v.html, e.id).toContain('VIVE BIEN es una empresa de')
      expect(v.texto, e.id).toContain(`Grupo P-ONCE: ${PONCE_URL}`)
      expect(v.imagenes.some((i) => i.endsWith(PONCE_LOGO_ARCHIVO)), e.id).toBe(true)
    }
  })
  it('incluye los correos con HTML propio (citas) y el aviso interno', () => {
    for (const id of ['cita_confirmada', 'cita_solicitud_nueva', 'aviso_lead']) expect(vistaPrevia(id)!.html, id).toContain(`href="${PONCE_URL}"`)
  })
  it('el enlace es https y abre el sitio del grupo; el símbolo existe en el repositorio', () => {
    expect(PONCE_URL).toBe('https://gp-once.com/')
    expect(existsSync(path.join(raiz, 'public', PONCE_LOGO_ARCHIVO))).toBe(true)
    expect(pieTexto()).toContain('empresa de Grupo P-ONCE')
  })
  it('en la vista previa el símbolo y el logotipo salen del despliegue (no de otro sitio)', () => {
    const v = vistaPrevia('bienvenida', { ...MUESTRA_POR_OMISION, origenImagenes: 'https://vista.ejemplo.vercel.app' })!
    expect(v.imagenes).toContain(`https://vista.ejemplo.vercel.app${LOGO_ARCHIVO}`)
    expect(v.imagenes).toContain(`https://vista.ejemplo.vercel.app${PONCE_LOGO_ARCHIVO}`)
  })
})

describe('logotipo completo de VIVE BIEN', () => {
  it('los correos usan el logotipo completo, que existe y no es el archivo recortado', () => {
    expect(LOGO_ARCHIVO).toBe('/logo-vivebien-completo.png')
    expect(LOGO_URL.endsWith('/logo-vivebien-completo.png')).toBe(true)
    const nuevo = path.join(raiz, 'public', 'logo-vivebien-completo.png')
    expect(existsSync(nuevo)).toBe(true)
    const buf = readFileSync(nuevo)
    expect(buf.subarray(1, 4).toString()).toBe('PNG')
    const ancho = buf.readUInt32BE(16), alto = buf.readUInt32BE(20)
    expect(ancho).toBeGreaterThanOrEqual(400)
    expect(alto).toBeGreaterThan(Math.round(ancho * 0.45)) // el recortado medía 475×316 (0,67); el completo es 475×~240 con la bajada ENTERA
    expect(statSync(nuevo).size).toBeLessThan(120_000)
    expect(vistaPrevia('bienvenida')!.imagenes.some((i) => i.endsWith('/logo-vivebien-completo.png'))).toBe(true)
    expect(vistaPrevia('bienvenida')!.imagenes.some((i) => i.endsWith('/logo_transparent.png'))).toBe(false)
  })
})

describe('avisos por correo activados por omisión + engranaje', () => {
  it('sin fila de preferencias, el motor de avisos trata alertas, precio y legales como activados; una baja (fila en false) se respeta', () => {
    const src = leer('src/lib/avisos-cliente-servidor.ts')
    expect(src).toContain('?? { correo_alertas: true, correo_legal: true, correo_precio: pf.conPrecio }') // el de precio solo si la columna existe
    expect(src).toContain("r.omitido = 'sin_preferencias'") // y con la lectura rota NO se usa ningún valor por omisión: falla cerrada
    expect(src).toMatch(/p\.correo_alertas \? suyas\.filter/) // quien tiene la fila en false no recibe
    const api = leer('src/app/api/portal/preferencias/route.ts')
    expect(api).toContain('correoAlertas: f?.correo_alertas ?? true')
    expect(api).toContain('correoPrecio: f?.correo_precio ?? true')
    expect(api).not.toMatch(/correo_alertas \?\? false|correo_precio \?\? false/)
  })
  it('lo PROMOCIONAL: la constante está autorizada (texto v3) pero la variable CORREO_MARKETING no se activa por omisión', () => {
    expect(leer('src/lib/correo/config.ts')).toMatch(/MARKETING_AUTORIZADO = true/)
  })
  it('el engranaje está en todas las pantallas del portal, con aria-expanded, Escape y panel que se monta al abrir', () => {
    expect(leer('src/components/portal/Pantalla.tsx')).toContain('<AjustesDeAvisos />')
    const g = leer('src/components/portal/AjustesDeAvisos.tsx')
    for (const frag of ['aria-expanded={abierto}', "e.key === 'Escape'", 'aria-label="Ajustes de avisos por correo"', '{abierto && (', 'size-7']) expect(g, frag).toContain(frag)
  })
  it('migración 65: las filas NUEVAS nacen activadas y las existentes no se tocan; la reversa vuelve a apagadas', async () => {
    const db = new PGlite()
    await db.exec(`create table public.preferencias_notificacion (uid text primary key, correo_alertas boolean not null default false, correo_legal boolean not null default true, consentimiento_alertas_en timestamptz, actualizado_en timestamptz not null default now())`)
    await db.exec(leer('supabase/60-correo-baja-de-precio.sql'))
    await db.exec(`create table public.usuarios (uid text primary key)`)
    await db.exec(`insert into public.usuarios (uid) values ('antes'), ('sin_fila'), ('eligio_si')`)
    await db.exec(`insert into public.preferencias_notificacion (uid) values ('antes')`) // fila previa con los valores antiguos
    await db.exec(`insert into public.preferencias_notificacion (uid, correo_alertas, correo_precio) values ('eligio_si', true, true)`) // eligió encender: se respeta
    await db.exec(leer('supabase/65-avisos-activados-por-omision.sql'))
    await db.exec(`insert into public.preferencias_notificacion (uid) values ('nueva')`) // cuenta creada DESPUÉS: nace activada
    const f = await db.query<{ uid: string; correo_alertas: boolean; correo_precio: boolean; correo_legal: boolean }>(`select uid, correo_alertas, correo_precio, correo_legal from public.preferencias_notificacion order by uid`)
    expect(f.rows).toEqual([
      { uid: 'antes', correo_alertas: false, correo_precio: false, correo_legal: true },
      { uid: 'eligio_si', correo_alertas: true, correo_precio: true, correo_legal: true },
      { uid: 'nueva', correo_alertas: true, correo_precio: true, correo_legal: true },
      { uid: 'sin_fila', correo_alertas: false, correo_precio: false, correo_legal: true }, // cuenta existente sin fila: conserva su estado (apagado), SIN efecto retroactivo
    ])
    await db.exec(leer('supabase/65-avisos-activados-por-omision.sql')) // idempotente
    await db.exec(leer('supabase/65-avisos-activados-por-omision.REVERTIR.sql'))
    await db.exec(`insert into public.preferencias_notificacion (uid) values ('despues')`)
    expect((await db.query<{ correo_alertas: boolean }>(`select correo_alertas from public.preferencias_notificacion where uid = 'despues'`)).rows[0].correo_alertas).toBe(false)
    await db.close()
  })
})
