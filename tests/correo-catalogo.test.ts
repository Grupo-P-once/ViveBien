import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { bandejaDeEjemplo, catalogoCompleto, DESTINATARIO_DE_EJEMPLO, GRUPOS_DE_CATALOGO, MUESTRA_POR_OMISION, NOMBRES_DE_MUESTRA, vistaPrevia } from '../src/lib/correo/biblioteca'

/**
 * Catálogo de correos: TODO lo que se afirma que existe se rastrea hasta el archivo que lo manda y ese archivo llama de verdad al mecanismo de envío;
 * lo pendiente no tiene vista; cada vista usa datos de ejemplo. Nada de red, base ni correo real.
 */
const raiz = path.join(__dirname, '..')
const leer = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8')
const catalogo = catalogoCompleto()
const EXISTEN = new Set(['envia_hoy', 'codigo_apagado', 'apagado_por_texto_legal'])

describe('catálogo: estructura y rastro', () => {
  it('ids únicos, grupos y existencias conocidos; están los grupos que pidió el dueño', () => {
    expect(new Set(catalogo.map((e) => e.id)).size).toBe(catalogo.length)
    for (const e of catalogo) { expect(GRUPOS_DE_CATALOGO).toContain(e.grupo); expect(['envia_hoy', 'codigo_apagado', 'apagado_por_texto_legal', 'plantilla_sin_evento', 'lo_manda_firebase', 'pendiente']).toContain(e.existencia) }
    for (const g of ['Cuenta y seguridad', 'Cliente', 'Publicador', 'Avisos legales', 'Marketing']) expect(catalogo.some((e) => e.grupo === g), g).toBe(true)
  })

  it('cubre los tipos pedidos (cuenta, cliente, publicador, legales y marketing)', () => {
    const nombres = catalogo.map((e) => e.nombre.toLowerCase()).join(' | ')
    for (const frag of ['bienvenida', 'verificación', 'recuperar', 'cambio de correo', 'baja de cuenta', 'consulta', 'whatsapp', 'búsquedas guardadas', 'baja de precio', 'evaluación', 'al subir una propiedad', 'revisión', 'aprobada', 'rechazada', 'nuevo interesado', 'términos', 'primeras propiedades', 'recomendaciones', 'artículos del blog']) {
      expect(nombres, frag).toContain(frag)
    }
  })

  it('lo que EXISTE tiene rastro: el archivo está en el repositorio y llama al mecanismo de envío', () => {
    for (const e of catalogo.filter((x) => EXISTEN.has(x.existencia))) {
      expect(e.rastro, e.id).toBeTruthy()
      expect(existsSync(path.join(raiz, e.rastro!)), `${e.id} → ${e.rastro}`).toBe(true)
      expect(leer(e.rastro!), `${e.id} → ${e.rastro}`).toMatch(/enviarPorEmisorUnico|enviarCorreo\(/)
    }
  })

  it('lo PENDIENTE no tiene rastro ni vista previa y lo dice; lo de Firebase tampoco finge una vista', () => {
    const pend = catalogo.filter((e) => e.existencia === 'pendiente')
    expect(catalogo.filter((e) => e.existencia === 'plantilla_sin_evento').map((e) => e.id).sort()).toEqual(['articulos_blog', 'cambio_correo', 'evaluacion_atencion']) // lo único con plantilla y sin evento: el blog (sin campañas ni texto legal), el cambio de correo (la app no lo permite) y la evaluación (sin tarea programada ni rutas Sí/No)
    for (const e of pend) { expect(e.rastro, e.id).toBeNull(); expect(e.conVista, e.id).toBe(false); expect(e.motivoSinVista, e.id).toMatch(/Pendiente de implementación/); expect(vistaPrevia(e.id), e.id).toBeNull() }
    for (const e of catalogo.filter((x) => x.existencia === 'lo_manda_firebase')) expect(e.rastro).toBeNull() // lo manda Firebase: no hay rastro de envío en este código
  })

  it('los que existen sin plantilla separada dicen por qué no se pueden ver', () => {
    for (const e of catalogo.filter((x) => EXISTEN.has(x.existencia) && !x.conVista)) expect(e.motivoSinVista!.length, e.id).toBeGreaterThan(40)
  })

  it('el aviso legal NO está en Marketing y lo promocional sí es de categoría marketing', () => {
    expect(catalogo.find((e) => e.id === 'legal')).toMatchObject({ grupo: 'Avisos legales', categoria: 'servicio' })
    for (const e of catalogo.filter((x) => x.grupo === 'Marketing' && x.existencia !== 'pendiente')) expect(e.categoria).toBe('marketing')
    for (const e of catalogo.filter((x) => x.categoria === 'marketing')) expect(e.grupo).toBe('Marketing')
  })
})

describe('vistas previas completas', () => {
  const conVista = catalogo.filter((e) => e.conVista)
  it('hay vistas para los correos existentes, incluidas las 15 de citas', () => {
    expect(conVista.length).toBeGreaterThanOrEqual(22)
    expect(conVista.filter((e) => e.id.startsWith('cita_'))).toHaveLength(15)
  })

  it('cada vista trae asunto, remitente, destinatario de ejemplo, extracto y enlaces https/mailto sin token ni persona real', () => {
    for (const nombre of NOMBRES_DE_MUESTRA) {
      for (const e of conVista) {
        const v = vistaPrevia(e.id, { ...MUESTRA_POR_OMISION, nombre })!
        expect(v, e.id).not.toBeNull()
        expect(v.asunto.length, e.id).toBeGreaterThan(5)
        expect(v.remitente, e.id).toMatch(/@/)
        expect(v.extracto.length, e.id).toBeGreaterThan(5)
        expect(v.extracto.length, e.id).toBeLessThanOrEqual(110)
        expect(v.html, e.id).toContain(nombre.split(" ")[0])
        for (const l of v.enlaces) expect(l, `${e.id}: ${l}`).toMatch(/^(https:\/\/|mailto:)/)
        expect(v.enlaces.join(' '), e.id).not.toMatch(/token|firma=|uid=|sig=|\.\.\/|javascript:/i)
      }
    }
    expect(DESTINATARIO_DE_EJEMPLO).toMatch(/\.invalid$/)
  })

  it('las plantillas con marco traen preencabezado y la bandeja lo usa como extracto', () => {
    const v = vistaPrevia('bienvenida')!
    expect(v.preencabezado).toBeTruthy()
    expect(v.extracto.startsWith(v.preencabezado!.slice(0, 40))).toBe(true)
    // Alertas, bajas de precio, avisos legales y (desde el 4-nov-2026, MKT-29) las citas usan el marco de marca, con preencabezado.
    for (const id of ['alertas', 'baja_de_precio', 'legal', 'cita_confirmada', 'cita_solicitud_nueva', 'cita_recordatorio_24h']) expect(vistaPrevia(id)!.preencabezado, id).toBeTruthy()
  })

  it('la bandeja lista exactamente los correos con vista, ordenados por grupo, con remitente, asunto y extracto', () => {
    const b = bandejaDeEjemplo()
    expect(b.map((f) => f.id).sort()).toEqual(conVista.map((e) => e.id).sort())
    const orden = b.map((f) => GRUPOS_DE_CATALOGO.indexOf(f.grupo))
    expect(orden).toEqual([...orden].sort((x, y) => x - y))
    for (const f of b) { expect(f.remitente).toBeTruthy(); expect(f.asunto).toBeTruthy(); expect(f.extracto).toBeTruthy() }
  })

  it('las citas se previsualizan con una cita FICTICIA, sin datos reales', () => {
    const v = vistaPrevia('cita_solicitud_nueva')!
    expect(v.html).toContain('Casa de ejemplo B')
    expect(v.html).toContain('Persona Sintética')
    // Sin la regla CSS @media ni el correo institucional del pie, ninguna dirección que no sea de ejemplo.
    expect(v.html.replace(/@media/g, '').replace(/informes@vivebienn.com/g, '')).not.toMatch(/@(?!ejemplo)/)
  })
})

describe('imágenes de ejemplo', () => {
  it('con imágenes: las tarjetas llevan fotos de /correo-ejemplo/ del origen del despliegue; sin imágenes: ninguna', () => {
    const con = vistaPrevia('recomendaciones', { ...MUESTRA_POR_OMISION, propiedades: 3, imagenes: true, origenImagenes: 'https://vista.ejemplo.vercel.app' })!
    expect(con.imagenes.filter((i) => i.includes('correo-ejemplo'))).toEqual(['a', 'b', 'c'].map((x) => `https://vista.ejemplo.vercel.app/correo-ejemplo/propiedad-${x}.svg`))
    const sin = vistaPrevia('recomendaciones', { ...MUESTRA_POR_OMISION, imagenes: false })!
    expect(sin.imagenes.some((i) => i.includes('correo-ejemplo'))).toBe(false)
  })
  it('con un origen de despliegue, el logotipo apunta a ese origen (el Preview no muestra el logo roto) y sin origen queda el del sitio', () => {
    const con = vistaPrevia('bienvenida', { ...MUESTRA_POR_OMISION, origenImagenes: 'https://vista.ejemplo.vercel.app' })!
    expect(con.imagenes).toContain('https://vista.ejemplo.vercel.app/logo-vivebien-completo.png')
    const sin = vistaPrevia('bienvenida', MUESTRA_POR_OMISION)!
    expect(sin.imagenes.some((i) => i.endsWith('/logo-vivebien-completo.png') && !i.includes('vista.ejemplo'))).toBe(true)
    expect(existsSync(path.join(raiz, 'public/logo-vivebien-completo.png'))).toBe(true)
  })
  it('las imágenes existen en el repositorio y dicen «FOTO DE EJEMPLO»', () => {
    for (const x of ['a', 'b', 'c']) {
      const rel = `public/correo-ejemplo/propiedad-${x}.svg`
      expect(existsSync(path.join(raiz, rel)), rel).toBe(true)
      expect(leer(rel)).toContain('FOTO DE EJEMPLO')
    }
  })
})
