import { describe, expect, it } from 'vitest'
import { COLORES, escapar, tarjetaPropiedad, urlSegura } from '../src/lib/correo/plantillas/marca'
import { plantillaBajaConfirmada, plantillaBienvenida, plantillaPrimerasPropiedades, plantillaRecomendaciones, plantillaSolicitudPublicador, type TarjetaCorreo } from '../src/lib/correo/plantillas'
import { aTarjetaCorreo, elegirPropiedades, fotoParaCorreo, leerPreferencias, motivoDe, resumenDe } from '../src/lib/correo/recomendaciones'
import type { FilaPropiedadPortal } from '../src/lib/portal/tarjeta'

/** D-80 — plantillas: marca, accesibilidad, escape de contenido y reglas anti-spam. Funciones puras. */
const TARJETA: TarjetaCorreo = {
  titulo: 'Nave industrial en Puerto Interior', url: 'https://vivebienn.com/propiedades/nave-1', foto: 'https://res.cloudinary.com/demo/image/upload/c_fill,w_1088,h_612,f_jpg,q_auto/v1/a.jpg',
  lugar: 'Puerto Interior, León', precio: '$12,500,000', etiqueta: 'Nave industrial · En venta', datos: ['1,800 m²', '9 m de altura'],
}
const TODAS = () => [
  plantillaSolicitudPublicador({ nombre: 'Rosa María', referencia: 'SOL-41' }),
  plantillaBienvenida({ nombre: 'Luis', urlPreferencias: 'https://vivebienn.com/portal/configuracion' }),
  plantillaPrimerasPropiedades({ nombre: 'Ana', resumen: 'naves en venta', propiedades: [TARJETA], urlConfirmar: 'https://vivebienn.com/correo/confirmar#t=x', urlBaja: 'https://vivebienn.com/correo/baja#t=y', diasValidez: 7 }),
  plantillaRecomendaciones({ nombre: 'Ana', propiedades: [TARJETA, { ...TARJETA, titulo: 'Segunda nave', foto: null }], motivo: 'Elegimos estas propiedades.', urlBaja: 'https://vivebienn.com/correo/baja#t=y', urlPreferencias: 'https://vivebienn.com/portal/configuracion' }),
  plantillaBajaConfirmada({ urlSuscribir: 'https://vivebienn.com/recomendaciones' }),
]

describe('todas las plantillas', () => {
  it('traen HTML Y texto plano, en español, con la marca y sin lo prohibido', () => {
    for (const p of TODAS()) {
      expect(p.html).toContain('lang="es-MX"')
      expect(p.texto.length).toBeGreaterThan(40)
      expect(p.html).toContain(COLORES.rojo)
      expect(p.html).toContain(COLORES.fondo)
      expect(p.html).toContain('Montserrat')
      expect(p.html).toMatch(/<img [^>]*alt="VIVE BIEN Grupo Inmobiliario"/) // el logotipo, con alt
      expect(p.html).not.toMatch(/<script|<form|<iframe|javascript:|onerror=|onclick=|<style[^>]*>[\s\S]*@import/i)
      expect(p.html).toContain('informes@vivebienn.com')
      expect(p.texto).toContain('informes@vivebienn.com')
    }
  })

  it('el asunto no parece correo no deseado: sin emojis, sin signos de exclamación, sin MAYÚSCULAS, corto', () => {
    for (const p of TODAS()) {
      expect(p.asunto).not.toMatch(/[!¡]|\p{Extended_Pictographic}/u)
      expect(p.asunto).not.toMatch(/[A-ZÁÉÍÓÚÑ]{5,}/)
      expect(p.asunto.length).toBeLessThanOrEqual(70)
      expect(p.asunto).not.toMatch(/gratis|urgente|última oportunidad|ganaste/i)
    }
  })

  it('todos los enlaces son https y toda imagen lleva alt y tamaño', () => {
    for (const p of TODAS()) {
      for (const m of p.html.matchAll(/href="([^"]*)"/g)) expect(m[1], m[1]).toMatch(/^(https:\/\/|mailto:)/)
      for (const m of p.html.matchAll(/<img\b[^>]*>/g)) {
        expect(m[0]).toMatch(/\balt="[^"]+"/)
        expect(m[0]).toMatch(/\bwidth="\d+"/)
        expect(m[0]).toMatch(/src="https:\/\//)
      }
    }
  })

  it('una sola columna que cabe en el teléfono (600–680 px como máximo) y botones con contraste', () => {
    for (const p of TODAS()) expect(p.html).toMatch(/max-width:(600|640|680)px/)
    const b = plantillaBienvenida({ urlPreferencias: 'https://vivebienn.com/portal/configuracion' })
    expect(b.html).toMatch(/bgcolor="#A30D12"[\s\S]*color:#FFFFFF/) // blanco sobre rojo de marca
    expect(b.html).toMatch(/@media screen and \(max-width:620px\)/) // las columnas se apilan en el teléfono
  })

  it('la bienvenida con cara de portal: cifras y propiedades REALES o nada (nunca ceros ni relleno inventados)', () => {
    const sin = plantillaBienvenida({ nombre: 'Luis', urlPreferencias: 'https://vivebienn.com/portal/configuracion' })
    expect(sin.html).toContain('Tu portal de cliente')
    expect(sin.html).not.toMatch(/Propiedades guardadas|Lo más reciente/) // sin datos: esos bloques no existen
    const con = plantillaBienvenida({
      nombre: 'Luis', urlPreferencias: 'https://vivebienn.com/portal/configuracion',
      resumen: { guardadas: 2, busquedas: 1, citas: 0 }, propiedades: [TARJETA, { ...TARJETA, titulo: 'Segunda nave', foto: null }],
    })
    for (const t of [con.html, con.texto]) { expect(t).toContain('Nave industrial en Puerto Interior'); expect(t).toContain('Segunda nave') }
    expect(con.html).toContain('Propiedades guardadas')
    expect(con.html).toContain('Lo más reciente')
    expect(con.html).toMatch(/alt="Foto de Nave industrial en Puerto Interior"/) // la foto de la tarjeta es la de una propiedad real
    expect(con.texto).toContain('2 guardadas')
    expect(con.html + con.texto).not.toMatch(/Bienvenido\/a|¡/) // sin género gramatical ni exclamaciones de relleno
  })
})

describe('escape: nada que venga de una persona o de la base se interpreta como HTML', () => {
  const MALO = '"><img src=x onerror=alert(1)><script>alert(1)</script>'
  it('nombre, título, lugar, referencia y motivo', () => {
    const r = plantillaRecomendaciones({ nombre: MALO, propiedades: [{ ...TARJETA, titulo: MALO, lugar: MALO, precio: MALO, etiqueta: MALO, datos: [MALO] }], motivo: MALO, urlBaja: 'https://vivebienn.com/b', urlPreferencias: 'https://vivebienn.com/p' })
    const p = plantillaSolicitudPublicador({ nombre: MALO, referencia: MALO })
    const c = plantillaPrimerasPropiedades({ nombre: MALO, resumen: MALO, propiedades: [{ ...TARJETA, titulo: MALO, lugar: MALO, precio: MALO, etiqueta: MALO, datos: [MALO] }], urlConfirmar: 'https://vivebienn.com/c', urlBaja: 'https://vivebienn.com/b', diasValidez: 7 })
    for (const x of [r, p, c]) {
      expect(x.html).not.toContain('<script>alert')
      expect(x.html).not.toContain('<img src=x')
      // la carga completa NO aparece tal cual, sólo escapada (comillas y ángulos convertidos): no puede romper ningún atributo ni etiqueta
      expect(x.html).not.toContain(MALO)
      expect(x.html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    }
  })

  it('urlSegura rechaza esquemas peligrosos y caracteres de ruptura', () => {
    for (const mala of ['javascript:alert(1)', 'data:text/html,x', 'http://x.com', 'https://x.com/"onmouseover="x', 'https://x.com/ a', "https://x.com/'", '', null]) {
      expect(urlSegura(mala), String(mala)).toBe('https://vivebienn.com')
    }
    expect(urlSegura('https://vivebienn.com/propiedades/x?a=1')).toBe('https://vivebienn.com/propiedades/x?a=1')
    expect(escapar(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })
})

describe('contenido y consentimiento', () => {
  it('la solicitud de publicador dice que NO está aprobada, da la referencia y no lleva publicidad', () => {
    const p = plantillaSolicitudPublicador({ nombre: 'Rosa María Gómez', referencia: 'SOL-41' })
    for (const t of [p.html, p.texto]) {
      expect(t).toContain('SOL-41')
      expect(t).toMatch(/no est(á|a) aprobada/i)
      expect(t).not.toMatch(/baja|oferta|recomendaciones|suscri/i)
    }
    expect(p.html).toContain('Hola Rosa,')
  })

  it('la bienvenida no es una campaña: sin baja de marketing, y explica cómo sí recibir recomendaciones', () => {
    const b = plantillaBienvenida({ nombre: null, urlPreferencias: 'https://vivebienn.com/portal/configuracion' })
    expect(b.html).toContain('Te damos la bienvenida a VIVE BIEN.')
    expect(b.html).toContain('Mis guardadas')
    expect(b.html).toMatch(/No es publicidad/)
    expect(b.html).not.toMatch(/\/correo\/baja/)
  })

  it('las primeras propiedades: valen por sí solas, el «sí» va al final, caduca, no parece phishing y siempre trae baja', () => {
    const c = plantillaPrimerasPropiedades({ nombre: null, resumen: 'casas en venta', propiedades: [TARJETA, { ...TARJETA, titulo: 'Segunda nave', foto: null }], urlConfirmar: 'https://vivebienn.com/correo/confirmar#t=abc', urlBaja: 'https://vivebienn.com/correo/baja#t=def', diasValidez: 7 })
    expect(c.asunto).toBe('Tus primeras 2 propiedades en VIVE BIEN')
    for (const t of [c.html, c.texto]) {
      expect(t).toContain('Nave industrial en Puerto Interior')
      expect(t).toContain('Segunda nave')
      expect(t).toContain('https://vivebienn.com/correo/confirmar#t=abc')
      expect(t).toContain('https://vivebienn.com/correo/baja#t=def')
      expect(t).toMatch(/7 días/)
      expect(t).toMatch(/no te escribiremos más|no te escribiremos más/i)
      expect(t).toMatch(/una vez cada siete días/)
    }
    // nada de lenguaje de verificación de cuenta ni de «alguien pidió»
    expect(c.asunto + c.html + c.texto).not.toMatch(/confirma tu (correo|cuenta|suscripci)|alguien (pidi|solicit)|verifica/i)
    // las propiedades van ANTES del botón de seguir recibiéndolas
    expect(c.html.indexOf('Segunda nave')).toBeLessThan(c.html.indexOf('correo/confirmar#t=abc'))
  })

  it('sin propiedades que encajen hoy: la alerta queda creada y se dice con honestidad (nunca un correo vacío ni inventado)', () => {
    const c = plantillaPrimerasPropiedades({ nombre: 'Ana', resumen: 'bodegas en renta', propiedades: [], urlConfirmar: 'https://vivebienn.com/correo/confirmar#t=abc', urlBaja: 'https://vivebienn.com/correo/baja#t=def', diasValidez: 7 })
    expect(c.asunto).toBe('Tu alerta de propiedades de VIVE BIEN está lista')
    expect(c.html + c.texto).toMatch(/Hoy no tenemos propiedades publicadas que se ajusten/)
    expect(c.html + c.texto).toContain('bodegas en renta')
  })

  it('las recomendaciones llevan baja y preferencias en HTML y texto, el motivo del envío y todas las propiedades', () => {
    const r = plantillaRecomendaciones({ nombre: 'Ana', propiedades: [TARJETA, { ...TARJETA, titulo: 'Segunda nave', foto: null }], motivo: 'Elegimos estas propiedades según lo que pediste.', urlBaja: 'https://vivebienn.com/correo/baja#t=B', urlPreferencias: 'https://vivebienn.com/portal/configuracion' })
    expect(r.asunto).toBe('2 propiedades que podrían interesarte')
    for (const t of [r.html, r.texto]) {
      expect(t).toContain('https://vivebienn.com/correo/baja#t=B')
      expect(t).toContain('https://vivebienn.com/portal/configuracion')
      expect(t).toContain('Nave industrial en Puerto Interior')
      expect(t).toContain('Segunda nave')
      expect(t).toContain('$12,500,000')
      expect(t).toMatch(/pediste recomendaciones/)
    }
    expect(r.html).toContain('Ver propiedad')
  })

  it('una tarjeta sin foto no deja una imagen rota', () => {
    expect(tarjetaPropiedad({ ...TARJETA, foto: null })).not.toContain('<img')
    expect(tarjetaPropiedad({ ...TARJETA, precio: null, lugar: null, datos: [], etiqueta: null })).not.toMatch(/\$|undefined|null/)
  })
})

describe('qué se recomienda: sólo lo real, publicado y relevante', () => {
  const fila = (id: string, extra: Partial<FilaPropiedadPortal> = {}): FilaPropiedadPortal => ({
    id, titulo: `Propiedad ${id}`, tipo: 'nave', operacion: 'venta', precio: 5_000_000, precio_incluye_iva: false, moneda: 'MXN', ubicacion: 'León, Gto.', colonia: 'Puerto Interior',
    ciudad: 'León', metros: 1000, recamaras: null, banos: null, altura_libre: 9, andenes: 2, estatus: 'disponible', estado_pub: 'publicada', slug: `p-${id}`,
    fotos: ['https://res.cloudinary.com/demo/image/upload/v1/x.jpg'], publicada_en: '2026-10-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z', ...extra,
  })
  const prefs = leerPreferencias({ operacion: 'venta', tipos: ['nave'], zonas: ['León'], presupuestoMax: 6_000_000 })

  it('descarta no publicadas, pausadas/vendidas, otro tipo, otra operación, fuera de presupuesto y las ya enviadas; ordena por novedad; tope 3', () => {
    const cat = [
      fila('nueva', { publicada_en: '2026-10-09T00:00:00Z' }), fila('vieja', { publicada_en: '2026-09-01T00:00:00Z' }), fila('media', { publicada_en: '2026-10-05T00:00:00Z' }),
      fila('cuarta', { publicada_en: '2026-08-01T00:00:00Z' }),
      fila('borrador', { estado_pub: 'borrador' }), fila('pausada', { estatus: 'pausada' }), fila('vendida', { estatus: 'vendida' }),
      fila('casa', { tipo: 'casa' }), fila('renta', { operacion: 'renta' }), fila('cara', { precio: 9_000_000 }), fila('otra-zona', { ciudad: 'Silao', colonia: 'Centro', ubicacion: 'Silao' }),
      fila('ya-enviada', { publicada_en: '2026-10-10T00:00:00Z' }),
    ]
    const r = elegirPropiedades(prefs, cat, new Set(['ya-enviada']))
    expect(r.map((x) => x.id)).toEqual(['nueva', 'media', 'vieja'])
  })

  it('sin coincidencias → vacío (no se manda correo)', () => {
    expect(elegirPropiedades(prefs, [fila('casa', { tipo: 'casa' })], new Set())).toEqual([])
    expect(elegirPropiedades(prefs, [fila('uno')], new Set(['uno']))).toEqual([])
  })

  it('preferencias raras o hostiles se ignoran; sin preferencias → lo más reciente publicado', () => {
    expect(leerPreferencias({ operacion: 'hackeo', tipos: [1, null, '  nave  ', 'x'.repeat(200)], zonas: 'no-lista', presupuestoMax: -5 })).toEqual({ operacion: null, tipos: ['nave', 'x'.repeat(60)], zonas: [], presupuestoMax: null })
    expect(leerPreferencias(null)).toEqual({ operacion: null, tipos: [], zonas: [], presupuestoMax: null })
    expect(elegirPropiedades(leerPreferencias({}), [fila('a'), fila('b', { estado_pub: 'borrador' })], new Set()).map((x) => x.id)).toEqual(['a'])
    expect(motivoDe(leerPreferencias({}))).toMatch(/más recientes/)
  })

  it('el motivo y el resumen describen lo que la persona pidió, nada más', () => {
    expect(motivoDe(prefs)).toBe('Elegimos estas propiedades publicadas según lo que pediste: nave, en venta, en León, hasta $6,000,000.')
    expect(resumenDe(prefs)).toBe('nave, en venta, en León, hasta $6,000,000')
    expect(resumenDe(leerPreferencias({}))).toBe('')
  })

  it('la tarjeta sale de los datos reales: nada inventado y la foto recortada en JPG', () => {
    const t = aTarjetaCorreo(fila('x', { precio: null, metros: null, altura_libre: null, andenes: null, fotos: [] }))
    expect(t.precio).toBeNull()
    expect(t.datos).toEqual([])
    expect(t.foto).toBeNull()
    expect(t.url).toBe('https://vivebienn.com/propiedades/p-x')
    expect(aTarjetaCorreo(fila('y')).datos).toEqual(['1,000 m²', '9 m de altura', '2 andenes'])
    expect(fotoParaCorreo('https://res.cloudinary.com/demo/image/upload/v1/x.jpg')).toBe('https://res.cloudinary.com/demo/image/upload/c_fill,w_1088,h_612,f_jpg,q_auto/v1/x.jpg')
    expect(fotoParaCorreo('http://inseguro/x.jpg')).toBeNull()
    expect(fotoParaCorreo('https://otro.com/x.jpg')).toBe('https://otro.com/x.jpg')
  })
})
