import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tipoDeArchivo, TOPE_DE_ADJUNTO } from '@/lib/contabilidad-adjuntos'

/**
 * Rutas nuevas de la migración 55 (colaboradores, comisiones externas, constancias y comprobantes). Mismo patrón que `contabilidad-servidor.test.ts`: la autorización real
 * (`puede`), la base y el almacén simulados. Nada sale a la red.
 */
type Perfil = { uid: string; email: string; rol: string; superAdmin: boolean }
const estado = vi.hoisted(() => ({
  perfil: null as null | Perfil,
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  respuesta: { data: { resultado: 'ok', id: '11111111-1111-4111-8111-111111111111' } as unknown, error: null as null | { message: string } },
  tabla: { data: [] as unknown, error: null as null | { message: string } },
  subidas: [] as Array<{ ruta: string; bytes: number; mime: string }>,
  subidaError: null as null | { message: string },
  firma: { data: { signedUrl: 'https://almacen.test/firmado?token=abc' } as null | { signedUrl: string }, error: null as null | { message: string } },
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { NextResponse } = await import('next/server')
  const { puede } = await import('../src/lib/acceso/permisos')
  function cadena() {
    const c: Record<string, unknown> = { select: () => c, order: () => c, limit: () => c, eq: () => c, maybeSingle: () => Promise.resolve(estado.tabla), then: (res: (v: unknown) => unknown) => res(estado.tabla) }
    return c
  }
  return {
    ...real,
    exigir: async (_req: Request, permiso: string) => (estado.perfil && puede(estado.perfil as never, permiso as never)
      ? { perfil: estado.perfil }
      : { error: NextResponse.json({ error: 'Tu cuenta no puede hacer eso.' }, { status: estado.perfil ? 403 : 401 }) }),
    supabaseAdmin: () => ({
      from: cadena,
      rpc: async (fn: string, args: Record<string, unknown>) => { estado.rpc.push({ fn, args }); return estado.respuesta },
      storage: { from: () => ({
        upload: async (ruta: string, bytes: Uint8Array, o: { contentType: string }) => { if (estado.subidaError) return { error: estado.subidaError }; estado.subidas.push({ ruta, bytes: bytes.byteLength, mime: o.contentType }); return { error: null } },
        createSignedUrl: async () => estado.firma,
      }) },
    }),
  }
})
vi.mock('@/lib/limites', async (original) => ({ ...(await original<typeof import('../src/lib/limites')>()), frenarAsync: async () => null }))

const SUPER: Perfil = { uid: 'su-n', email: 'super@vb.mx', rol: 'admin', superAdmin: true }
const ADMIN: Perfil = { uid: 'ad-n', email: 'admin@vb.mx', rol: 'admin', superAdmin: false }
const UUID_A = '4c68eb9b-7cba-4590-a629-1d6e45c520ce'
const RUTA = '2026/4c68eb9b-7cba-4590-a629-1d6e45c520ce.pdf'
const post = (url: string, cuerpo: unknown, metodo = 'POST') => new Request(`https://vb.test${url}`, { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })

beforeEach(() => {
  estado.perfil = SUPER; estado.rpc = []; estado.subidas = []; estado.subidaError = null
  estado.respuesta = { data: { resultado: 'ok', id: UUID_A }, error: null }
  estado.tabla = { data: [], error: null }
  estado.firma = { data: { signedUrl: 'https://almacen.test/firmado?token=abc' }, error: null }
})

describe('colaboradores', () => {
  it('GET: solo Super Admin; trae el contacto y nunca se guarda en caché', async () => {
    const { GET } = await import('../src/app/api/admin/contabilidad/colaboradores/route')
    estado.tabla = { data: [{ id: UUID_A, nombre: 'Ana', telefono: '477 123 4567', correo: 'ana@x.mx', folio_acreditacion: null }], error: null }
    const r = await GET(new Request('https://vb.test/x'))
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    expect((await r.json()).colaboradores[0].telefono).toBe('477 123 4567')
    estado.perfil = ADMIN
    expect((await GET(new Request('https://vb.test/x'))).status).toBe(403)
    estado.perfil = null
    expect((await GET(new Request('https://vb.test/x'))).status).toBe(401)
  })
  it('POST: el folio de acreditación es opcional y la bitácora NO lleva teléfono ni correo', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/colaboradores/route')
    const r = await POST(post('/x', { tipo: 'agente', nombre: 'Ana Pérez', telefono: '477 123 4567', correo: 'ana@x.mx' }))
    expect(r.status).toBe(201)
    expect(estado.rpc[0].fn).toBe('contab_colaborador_registrar')
    expect(estado.rpc[0].args.p_datos).toMatchObject({ tipo: 'agente', nombre: 'Ana Pérez', telefono: '477 123 4567', correo: 'ana@x.mx', creado_por: 'super@vb.mx' })
    const audit = JSON.stringify(estado.rpc[0].args.p_audit)
    expect(audit).not.toMatch(/477|ana@x\.mx/)
    expect(estado.rpc[0].args.p_audit).toMatchObject({ actor_rol: 'super_admin', despues: { tipo: 'agente', nombre: 'Ana Pérez', con_folio: false } })
    expect((await POST(post('/x', { tipo: 'raro', nombre: 'Ana' }))).status).toBe(400)
    estado.perfil = ADMIN
    expect((await POST(post('/x', { tipo: 'agente', nombre: 'Ana Pérez' }))).status).toBe(403)
  })
  it('PATCH: edita o desactiva; la bitácora dice qué campos cambiaron, no sus valores', async () => {
    const { PATCH } = await import('../src/app/api/admin/contabilidad/colaboradores/[id]/route')
    expect((await PATCH(post('/x', { telefono: '477 999 8888', activo: false }, 'PATCH'), ctx({ id: UUID_A }))).status).toBe(200)
    expect(estado.rpc[0].args.p_audit).toMatchObject({ despues: { campos: ['telefono', 'activo'], activo: false } })
    expect(JSON.stringify(estado.rpc[0].args.p_audit)).not.toContain('999')
    expect((await PATCH(post('/x', {}, 'PATCH'), ctx({ id: UUID_A }))).status).toBe(400)
    expect((await PATCH(post('/x', { notas: 'x' }, 'PATCH'), ctx({ id: 'no-uuid' }))).status).toBe(404)
    estado.respuesta = { data: { resultado: 'ya_existe' }, error: null }
    expect((await PATCH(post('/x', { nombre: 'Otro' }, 'PATCH'), ctx({ id: UUID_A }))).status).toBe(409)
  })
})

describe('comisiones externas', () => {
  const hoy = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10)
  const cuerpo = { fecha: hoy, descripcion: 'Cliente buscaba casa en Cañada', tipo: 'renta', parte_pesos: '10000', clave_idempotencia: 'ext-ruta-0001' }
  it('POST: registra (por cobrar o ya cobrada) y la bitácora lleva cifras, no personas', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/externas/route')
    expect((await POST(post('/x', cuerpo))).status).toBe(201)
    expect(estado.rpc[0].fn).toBe('comision_externa_registrar')
    expect(estado.rpc[0].args.p_datos).toMatchObject({ parte_centavos: 1_000_000, tipo: 'renta', creado_por: 'super@vb.mx' })
    estado.rpc = []
    await POST(post('/x', { ...cuerpo, clave_idempotencia: 'ext-ruta-0002', cobrada: true, cobrada_en: hoy, metodo_cobro: 'efectivo', contraparte: 'Inmobiliaria Del Bajío', adjunto: RUTA }))
    expect(estado.rpc[0].args.p_audit).toMatchObject({ despues: { cobrada: true, con_adjunto: true, parte_centavos: 1_000_000 } })
    expect(JSON.stringify(estado.rpc[0].args.p_audit)).not.toContain('Bajío')
  })
  it('POST: rechaza fecha futura, datos personales y archivos inventados; solo Super Admin', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/externas/route')
    for (const c of [{ fecha: '2999-01-01' }, { descripcion: 'Cliente ana@correo.mx' }, { adjunto: '../../etc/passwd' }, { parte_pesos: '0' }]) expect((await POST(post('/x', { ...cuerpo, ...c }))).status, JSON.stringify(c)).toBe(400)
    expect(estado.rpc).toHaveLength(0)
    estado.perfil = ADMIN
    expect((await POST(post('/x', cuerpo))).status).toBe(403)
  })
  it('PATCH: cobrar y anular; con el estado viejo, 409', async () => {
    const { PATCH } = await import('../src/app/api/admin/contabilidad/externas/[id]/route')
    expect((await PATCH(post('/x', { accion: 'cobrar', antes: 'por_cobrar', cobrada_en: hoy, metodo_cobro: 'transferencia', referencia: 'SPEI 99' }, 'PATCH'), ctx({ id: UUID_A }))).status).toBe(200)
    expect(estado.rpc[0].args).toMatchObject({ p_antes: 'por_cobrar', p_nuevo: 'cobrada', p_datos: { metodo_cobro: 'transferencia', referencia: 'SPEI 99' } })
    estado.respuesta = { data: { resultado: 'conflicto' }, error: null }
    expect((await PATCH(post('/x', { accion: 'anular', antes: 'por_cobrar', motivo: 'Se capturó dos veces la misma' }, 'PATCH'), ctx({ id: UUID_A }))).status).toBe(409)
    expect((await PATCH(post('/x', { accion: 'anular', antes: 'por_cobrar', motivo: 'corto' }, 'PATCH'), ctx({ id: UUID_A }))).status).toBe(400)
    expect(JSON.stringify(estado.rpc.at(-1)?.args.p_audit)).not.toContain('capturó')
  })
})

describe('constancias', () => {
  const cuerpo = { movimiento_id: UUID_A, colaborador_nombre: 'Ana Pérez', metodo: 'transferencia', referencia: 'SPEI 99', comprobante: RUTA }
  it('POST: crea con folio; repetir devuelve la misma; de un movimiento que no es pago, 409', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/constancias/route')
    estado.respuesta = { data: { resultado: 'ok', id: UUID_A, folio: 'CP-2026-0007' }, error: null }
    const r = await POST(post('/x', cuerpo))
    expect(r.status).toBe(201)
    expect(await r.json()).toMatchObject({ folio: 'CP-2026-0007' })
    expect(estado.rpc[0].args.p_datos).toMatchObject({ metodo: 'transferencia', comprobante: RUTA, creado_por: 'super@vb.mx' })
    estado.respuesta = { data: { resultado: 'repetida', id: UUID_A, folio: 'CP-2026-0007' }, error: null }
    expect((await (await POST(post('/x', cuerpo))).json())).toMatchObject({ repetida: true, folio: 'CP-2026-0007' })
    estado.respuesta = { data: { resultado: 'no_aplica' }, error: null }
    expect((await POST(post('/x', cuerpo))).status).toBe(409)
    estado.perfil = ADMIN
    expect((await POST(post('/x', cuerpo))).status).toBe(403)
  })
  it('GET: por folio con formato válido; sin sesión de Super Admin no hay nada; nunca en caché', async () => {
    const { GET } = await import('../src/app/api/admin/contabilidad/constancias/[folio]/route')
    estado.tabla = { data: { id: UUID_A, folio: 'CP-2026-0007', colaborador_nombre: 'Ana Pérez', metodo: 'efectivo', monto_centavos: 4_000_000 }, error: null }
    const r = await GET(new Request('https://vb.test/x'), ctx({ folio: 'CP-2026-0007' }))
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    expect((await GET(new Request('https://vb.test/x'), ctx({ folio: '../../x' }))).status).toBe(404)
    estado.perfil = ADMIN
    expect((await GET(new Request('https://vb.test/x'), ctx({ folio: 'CP-2026-0007' }))).status).toBe(403)
  })
  it('PATCH: el comprobante llega después, una sola vez, y solo una ruta de nuestro almacén', async () => {
    const { PATCH } = await import('../src/app/api/admin/contabilidad/constancias/[folio]/route')
    expect((await PATCH(post('/x', { comprobante: RUTA }, 'PATCH'), ctx({ folio: UUID_A }))).status).toBe(200)
    expect((await PATCH(post('/x', { comprobante: 'https://malo.example/x.pdf' }, 'PATCH'), ctx({ folio: UUID_A }))).status).toBe(400)
    estado.respuesta = { data: { resultado: 'ya_tiene' }, error: null }
    expect((await PATCH(post('/x', { comprobante: RUTA }, 'PATCH'), ctx({ folio: UUID_A }))).status).toBe(409)
  })
})

describe('comprobantes (almacén privado)', () => {
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 1, 2, 3, 4, 5])
  const subir = (bytes: Uint8Array, nombre = 'recibo.pdf') => { const f = new FormData(); f.append('archivo', new File([bytes as BlobPart], nombre)); return new Request('https://vb.test/x', { method: 'POST', body: f }) }
  it('los primeros bytes deciden el tipo: PDF, JPG, PNG y WEBP sí; un ejecutable o un HTML con nombre .pdf, no', () => {
    expect(tipoDeArchivo(PDF)).toEqual({ mime: 'application/pdf', extension: 'pdf' })
    expect(tipoDeArchivo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))?.extension).toBe('jpg')
    expect(tipoDeArchivo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))?.extension).toBe('png')
    expect(tipoDeArchivo(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))?.extension).toBe('webp')
    expect(tipoDeArchivo(new TextEncoder().encode('<html><script>alert(1)</script></html>'))).toBeNull()
    expect(tipoDeArchivo(new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]))).toBeNull()
    expect(tipoDeArchivo(new Uint8Array([1, 2, 3]))).toBeNull()
  })
  it('POST: sube con una ruta propia (AAAA/uuid.ext), sin conservar el nombre del archivo', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/adjuntos/route')
    const r = await POST(subir(PDF, 'mi recibo con nombre personal.pdf'))
    expect(r.status).toBe(201)
    const j = await r.json()
    expect(j.ruta).toMatch(/^\d{4}\/[0-9a-f-]{36}\.pdf$/)
    expect(j.ruta).not.toContain('recibo')
    expect(estado.subidas[0]).toMatchObject({ ruta: j.ruta, mime: 'application/pdf' })
  })
  it('POST: rechaza lo que no es PDF/imagen (415), lo grande (413), lo vacío y la falta de archivo (400); sin almacén, 503 explicado', async () => {
    const { POST } = await import('../src/app/api/admin/contabilidad/adjuntos/route')
    expect((await POST(subir(new TextEncoder().encode('<html>no soy un pdf</html>'), 'recibo.pdf'))).status).toBe(415)
    expect((await POST(subir(new Uint8Array(TOPE_DE_ADJUNTO + 1)))).status).toBe(413)
    expect((await POST(subir(new Uint8Array(0)))).status).toBe(400)
    expect((await POST(new Request('https://vb.test/x', { method: 'POST', body: new FormData() }))).status).toBe(400)
    estado.subidaError = { message: 'Bucket not found' }
    const r = await POST(subir(PDF))
    expect(r.status).toBe(503)
    expect((await r.json()).codigo).toBe('sin_almacen')
    estado.perfil = ADMIN
    expect((await POST(subir(PDF))).status).toBe(403)
  })
  it('GET: solo rutas de nuestro formato, solo Super Admin y siempre una dirección firmada que caduca; nada público', async () => {
    const { GET } = await import('../src/app/api/admin/contabilidad/adjuntos/route')
    const r = await GET(new Request(`https://vb.test/x?ruta=${encodeURIComponent(RUTA)}`))
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('https://almacen.test/firmado?token=abc')
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    const j = await GET(new Request(`https://vb.test/x?ruta=${encodeURIComponent(RUTA)}&formato=json`))
    expect(j.status).toBe(200)
    expect(await j.json()).toEqual({ url: 'https://almacen.test/firmado?token=abc' })
    for (const mala of ['', '../x.pdf', '2026/x.pdf', 'https://malo.example/a.pdf']) expect((await GET(new Request(`https://vb.test/x?ruta=${encodeURIComponent(mala)}`))).status, mala).toBe(404)
    estado.firma = { data: null, error: { message: 'Object not found' } }
    expect((await GET(new Request(`https://vb.test/x?ruta=${encodeURIComponent(RUTA)}`))).status).toBe(404)
    estado.perfil = ADMIN
    expect((await GET(new Request(`https://vb.test/x?ruta=${encodeURIComponent(RUTA)}`))).status).toBe(403)
  })
})
