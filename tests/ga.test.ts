import { describe, expect, it } from 'vitest'
import { NEGOCIO } from '../src/lib/config/negocio'
import { configuracionGtag, guardiaInicial, paramsSeguros, RUTAS_PRIVADAS, rutaPrivada, tipoDeEnlace, traducirEvento } from '../src/lib/ga'

/** Eventos de Google Analytics (24-oct-2026): nombres de GA4, nunca datos personales, y nada en las áreas privadas. */

describe('rutaPrivada', () => {
  it('las áreas con sesión no se miden, ni lo que cuelga de ellas', () => {
    for (const r of ['/admin', '/admin/usuarios', '/dashboard', '/publicador/propiedades/x', '/mi-cuenta', '/portal/inicio', '/citas/accion', '/vista-previa/x', '/api/leads']) expect(rutaPrivada(r), r).toBe(true)
  })
  it('las páginas públicas sí, incluida una que solo empieza igual', () => {
    for (const r of ['/', '/propiedades', '/propiedades/nave-1', '/blog/como-vender', '/contacto', '/valuador', '/entrar', '/administracion', '/portafolio']) expect(rutaPrivada(r), r).toBe(false)
    expect(rutaPrivada(null)).toBe(false)
  })
})

describe('paramsSeguros — nunca datos personales', () => {
  it('conserva categorías y números, recorta textos largos', () => {
    expect(paramsSeguros({ tipo: 'nave', operacion: 'venta', filtros: 3, activo: true, largo: 'x'.repeat(200) })).toEqual({ tipo: 'nave', operacion: 'venta', filtros: 3, activo: true, largo: 'x'.repeat(80) })
  })
  it('descarta parámetros cuyo NOMBRE sugiere un dato personal, aunque alguien los agregue por error', () => {
    const r = paramsSeguros({ nombre: 'Ana', email: 'a@b.com', telefono: '4778116501', mensaje: 'hola', whatsapp: '52477', direccion: 'Calle 1', token: 'x', password: 'y', tipo: 'casa' })
    expect(r).toEqual({ tipo: 'casa' })
  })
  it('descarta VALORES con pinta de correo o de teléfono aunque el nombre sea inocente', () => {
    expect(paramsSeguros({ zona: 'a@b.com', dato: '477 811 6501', otro: '+52 (477) 811-6501', ok: 'Centro' })).toEqual({ ok: 'Centro' })
  })
  it('descarta nombres inválidos, objetos y valores vacíos', () => {
    expect(paramsSeguros({ '1x': 'a', 'a b': 'c', obj: { a: 1 } as never, vacio: '  ', nulo: null as never, bien: 1 })).toEqual({ bien: 1 })
    expect(paramsSeguros(null)).toEqual({})
  })
})

describe('traducirEvento — eventos internos → GA4', () => {
  it('usa los nombres recomendados de Google', () => {
    expect(traducirEvento('property_view', { propiedadId: 'p1' })).toEqual({ nombre: 'view_item', params: { item_id: 'p1' } })
    expect(traducirEvento('property_favorite', { propiedadId: 'p1' })?.nombre).toBe('add_to_wishlist')
    expect(traducirEvento('property_unfavorite')?.nombre).toBe('remove_from_wishlist')
    expect(traducirEvento('blog_view')?.nombre).toBe('select_content')
  })
  it('la búsqueda arma un término con las categorías elegidas y cuenta los filtros', () => {
    const r = traducirEvento('search_performed', { datos: { op: 'venta', tipo: 'nave', zona: 'Centro', precio: 5000000 } })
    expect(r?.nombre).toBe('search')
    expect(r?.params).toMatchObject({ search_term: 'venta nave Centro', filtros_activos: 4, precio: 5000000 })
  })
  it('una búsqueda con datos personales los descarta antes de salir', () => {
    const r = traducirEvento('search_performed', { datos: { tipo: 'casa', correo: 'a@b.com', telefono: '4778116501' } })
    expect(JSON.stringify(r)).not.toMatch(/a@b\.com|4778116501/)
  })
  it('sin id de propiedad no inventa uno', () => {
    expect(traducirEvento('contact_started')).toEqual({ nombre: 'contact_started', params: {} })
  })
})

describe('tipoDeEnlace', () => {
  it('reconoce WhatsApp, teléfono y correo por su esquema y host, sin importar el número', () => {
    expect(tipoDeEnlace('https://wa.me/524778116501?text=Hola')).toBe('click_whatsapp')
    expect(tipoDeEnlace('https://api.whatsapp.com/send?phone=1')).toBe('click_whatsapp')
    expect(tipoDeEnlace('tel:+524778116501')).toBe('click_phone')
    expect(tipoDeEnlace('MAILTO:x@y.com')).toBe('click_email')
  })
  it('lo demás no es un contacto, ni un dominio que solo se parece', () => {
    for (const h of ['/contacto', 'https://vivebienn.com', 'https://wa.me.malo.com/1', 'https://example.com/wa.me', '', null, undefined]) expect(tipoDeEnlace(h as string), String(h)).toBeNull()
  })
})

describe('guardia inicial y configuración de gtag', () => {
  const ids = [NEGOCIO.ga4, NEGOCIO.ga4Adicional]
  it('el script del head apaga LAS DOS propiedades en rutas privadas y es la misma lista que `RUTAS_PRIVADAS`', () => {
    const s = guardiaInicial(ids)
    for (const id of ids) expect(s).toContain(`window['ga-disable-${id}']=true`)
    const re = new RegExp(/RegExp\('([^']+)'\)/.exec(s)![1])
    for (const r of RUTAS_PRIVADAS) expect(re.test(r + '/x'), r).toBe(true)
    for (const r of ['/propiedades', '/blog', '/', '/administracion']) expect(re.test(r), r).toBe(false)
  })
  it('configura cada propiedad y las dos son distintas y con formato de ID de medición', () => {
    expect(configuracionGtag(ids)).toBe(`gtag('config','${ids[0]}');gtag('config','${ids[1]}');`)
    expect(ids[0]).not.toBe(ids[1])
    for (const id of ids) expect(id).toMatch(/^G-[A-Z0-9]{8,12}$/)
    expect(NEGOCIO.ga4Propiedad).toMatch(/^\d{6,15}$/)
  })
})

describe('identificadores de propiedad (item_id)', () => {
  it('un UUID con muchos dígitos seguidos NO se descarta por parecer teléfono', () => {
    for (const id of ['12345678-1234-1234-1234-123456789012', '00000000-0000-4000-8000-000000000001', '5243dab0-e30f-4c1a-9a1d-0123456789ab']) expect(paramsSeguros({ item_id: id }), id).toEqual({ item_id: id })
  })
  it('el filtro de teléfonos sigue valiendo para cualquier OTRO parámetro', () => {
    expect(paramsSeguros({ dato: '12345678-1234-1234-1234-123456789012', item_id: '12345678-1234-1234-1234-123456789012' })).toEqual({ item_id: '12345678-1234-1234-1234-123456789012' })
  })
  it('un item_id que no tiene forma de identificador (espacios, correo, teléfono con símbolos, demasiado largo) se descarta', () => {
    for (const malo of ['477 811 6501', 'a@b.com', '+52 (477) 811-6501', 'x'.repeat(65), 'con espacio', '<script>', '']) expect(paramsSeguros({ item_id: malo }), malo).toEqual({})
  })
  it('traducirEvento conserva el id de una propiedad aunque sea casi todo dígitos', () => {
    const r = traducirEvento('property_view', { propiedadId: '12345678-1234-1234-1234-123456789012' })
    expect(paramsSeguros(r!.params)).toEqual({ item_id: '12345678-1234-1234-1234-123456789012' })
  })
})
