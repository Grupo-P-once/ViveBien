import { beforeEach, describe, expect, it, vi } from 'vitest'

/** `/api/eventos` con los eventos por propiedad (24-oct-2026): se aceptan; un clic de contacto solo guarda canal y lugar de listas fijas. */

const e = vi.hoisted(() => ({ insertados: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const consulta = () => {
    const c: Record<string, unknown> = {}
    c.select = () => c; c.eq = () => c; c.gte = () => c
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ count: 0, data: [], error: null }).then(ok)
    c.insert = (fila: Record<string, unknown>) => { e.insertados.push(fila); return Promise.resolve({ error: null }) }
    return c
  }
  return { ...real, verifyIdToken: async () => null, supabaseAdmin: () => ({ from: consulta, rpc: async () => ({}) }) }
})
vi.mock('@/lib/limites', async (o) => ({ ...(await o<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))

const post = (cuerpo: unknown) => new Request('https://x.test/api/eventos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
beforeEach(() => { e.insertados = [] })

describe('POST /api/eventos — eventos por propiedad', () => {
  it('acepta el clic en la tarjeta con el id de la propiedad', async () => {
    const { POST } = await import('../src/app/api/eventos/route')
    const r = await POST(post({ nombre: 'property_card_click', propiedadId: 'prop-1', sesion: 's1' }))
    expect(r.status).toBe(200)
    expect(e.insertados[0]).toMatchObject({ nombre: 'property_card_click', propiedad_id: 'prop-1', sesion: 's1' })
  })
  it('un clic de contacto guarda SOLO canal y lugar de listas fijas: ni número, ni correo, ni texto libre', async () => {
    const { POST } = await import('../src/app/api/eventos/route')
    await POST(post({ nombre: 'property_contact_click', propiedadId: 'p', sesion: 's', datos: { canal: 'whatsapp', lugar: 'tarjeta', telefono: '4778116501', correo: 'a@b.com', mensaje: 'hola' } }))
    expect(e.insertados[0].datos).toEqual({ canal: 'whatsapp', lugar: 'tarjeta' })
  })
  it('un canal o lugar inventado cae a valores neutros, y sin datos también', async () => {
    const { POST } = await import('../src/app/api/eventos/route')
    await POST(post({ nombre: 'property_contact_click', propiedadId: 'p', sesion: 's', datos: { canal: '<script>', lugar: 'cualquier-cosa' } }))
    await POST(post({ nombre: 'property_contact_click', propiedadId: 'p', sesion: 's2' }))
    expect(e.insertados.map((x) => x.datos)).toEqual([{ canal: 'otro', lugar: 'pagina' }, { canal: 'otro', lugar: 'pagina' }])
  })
  it('los tres canales y los tres lugares válidos pasan tal cual', async () => {
    const { POST } = await import('../src/app/api/eventos/route')
    for (const canal of ['whatsapp', 'telefono', 'correo']) for (const lugar of ['tarjeta', 'ficha', 'pagina']) await POST(post({ nombre: 'property_contact_click', propiedadId: 'p', sesion: `s-${canal}-${lugar}`, datos: { canal, lugar } }))
    expect(e.insertados).toHaveLength(9)
    expect(e.insertados.every((x) => ['whatsapp', 'telefono', 'correo'].includes((x.datos as { canal: string }).canal))).toBe(true)
  })
  it('un evento que no está en la lista se rechaza con 400 y no se guarda', async () => {
    const { POST } = await import('../src/app/api/eventos/route')
    expect((await POST(post({ nombre: 'property_hack', propiedadId: 'p' }))).status).toBe(400)
    expect(e.insertados).toEqual([])
  })
  it('los eventos que ya existían siguen guardando sus datos como antes', async () => {
    const { POST } = await import('../src/app/api/eventos/route')
    await POST(post({ nombre: 'search_performed', sesion: 's', datos: { zona: 'Centro' } }))
    expect(e.insertados[0].datos).toEqual({ zona: 'Centro' })
  })
})

describe('POST /api/eventos — compartir', () => {
  it('acepta property_share y guarda SOLO el modo de una lista fija', async () => {
    const { POST } = await import('../src/app/api/eventos/route')
    await POST(post({ nombre: 'property_share', propiedadId: 'p', sesion: 's1', datos: { canal: 'copiado', url: 'https://x', correo: 'a@b.com' } }))
    await POST(post({ nombre: 'property_share', propiedadId: 'p', sesion: 's2', datos: { canal: 'nativo' } }))
    await POST(post({ nombre: 'property_share', propiedadId: 'p', sesion: 's3', datos: { canal: '<b>' } }))
    expect(e.insertados.map((x) => x.datos)).toEqual([{ canal: 'copiado' }, { canal: 'nativo' }, { canal: 'otro' }])
  })
})
