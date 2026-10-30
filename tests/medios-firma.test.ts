import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  autorizar,
  camposFirmados,
  credencialesCloudinary,
  destinoDe,
  FORMATOS_PERMITIDOS,
  firmar,
  leerPedido,
} from '../src/lib/medios/firma'

/**
 * SEC-05 (V-1.1.78, ADR-0008): cada subida a Cloudinary la firma el servidor.
 */
const SRC = join(__dirname, '..', 'src')
const CRED = { nube: 'demo', apiKey: '123456789012345', secreto: 'abcd' }

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return archivos(p)
    return /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

describe('firma de Cloudinary', () => {
  it('coincide con el ejemplo de la documentación de Cloudinary', () => {
    const params = { eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: 1315060510 }
    expect(firmar(params, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e')
  })

  it('no firma file, cloud_name, resource_type ni api_key', () => {
    const base = { public_id: 'x', timestamp: 1 }
    expect(firmar({ ...base, file: 'f', cloud_name: 'c', resource_type: 'image', api_key: 'k' }, 's')).toBe(firmar(base, 's'))
  })

  it('cambiar la carpeta o el nombre invalida la firma', () => {
    const c = camposFirmados({ public_id: 'vivebien/casa/p1/a', asset_folder: 'vivebien/casa/p1' }, CRED, 1_700_000_000_000)
    const { signature, api_key, ...firmados } = c
    expect(api_key).toBe(CRED.apiKey)
    expect(firmar(firmados, CRED.secreto)).toBe(signature)
    expect(firmar({ ...firmados, asset_folder: 'otra' }, CRED.secreto)).not.toBe(signature)
    expect(firmar({ ...firmados, public_id: 'otra/x' }, CRED.secreto)).not.toBe(signature)
  })

  it('lleva hora en segundos y nunca el secreto', () => {
    const c = camposFirmados({ public_id: 'a' }, CRED, 1_700_000_000_123)
    expect(c.timestamp).toBe('1700000000')
    expect(Object.values(c)).not.toContain(CRED.secreto)
  })

  it('sin clave o sin secreto no hay credenciales', () => {
    expect(credencialesCloudinary({})).toBeNull()
    expect(credencialesCloudinary({ NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'n', CLOUDINARY_API_KEY: 'k' })).toBeNull()
    expect(credencialesCloudinary({ NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: ' n ', CLOUDINARY_API_KEY: 'k\n', CLOUDINARY_API_SECRET: ' s' }))
      .toEqual({ nube: 'n', apiKey: 'k', secreto: 's' })
  })
})

describe('quién sube qué', () => {
  const cliente = { uid: 'c1', rol: 'cliente' }
  const dueno = { uid: 'd1', rol: 'publicador' }
  const admin = { uid: 'a1', rol: 'admin' }
  const prop = { owner_id: 'd1', tipo: 'casa' }

  it('lee sólo lo que el navegador puede pedir', () => {
    expect(leerPedido(null)).toBeNull()
    expect(leerPedido({ proposito: 'otra' })).toBeNull()
    expect(leerPedido({ proposito: 'perfil', public_id: 'mio' })).toEqual({ proposito: 'perfil' })
    expect(leerPedido({ proposito: 'propiedad', propiedadId: ' p1 ', clase: 'planos', asset_folder: 'x' }))
      .toEqual({ proposito: 'propiedad', propiedadId: 'p1', clase: 'planos' })
  })

  it('cualquier cuenta sube su foto de perfil', () => {
    expect(autorizar({ proposito: 'perfil' }, cliente, null).ok).toBe(true)
  })

  it('sólo el dueño o un admin suben a una propiedad', () => {
    const pedido = { proposito: 'propiedad' as const, propiedadId: 'p1', clase: 'fotos' as const }
    expect(autorizar(pedido, dueno, prop).ok).toBe(true)
    expect(autorizar(pedido, admin, prop).ok).toBe(true)
    expect(autorizar(pedido, { uid: 's1', rol: 'super_admin' }, prop).ok).toBe(true)
    expect(autorizar(pedido, cliente, prop)).toMatchObject({ ok: false, status: 403 })
    expect(autorizar(pedido, { uid: 'otro', rol: 'publicador' }, prop)).toMatchObject({ ok: false, status: 403 })
    expect(autorizar(pedido, dueno, null)).toMatchObject({ ok: false, status: 404 })
    // El dueño no sube fotos a lo que está en revisión o publicado; el admin sí.
    for (const estado_pub of ['en_revision', 'publicada']) {
      expect(autorizar(pedido, dueno, { ...prop!, estado_pub })).toMatchObject({ ok: false, status: 409 })
      expect(autorizar(pedido, admin, { ...prop!, estado_pub }).ok).toBe(true)
    }
    // `editar_publicadas` abre sólo lo ya publicado; en revisión, nunca.
    const conCapacidad = { ...dueno, editaPublicadas: true }
    expect(autorizar(pedido, conCapacidad, { ...prop!, estado_pub: 'publicada' }).ok).toBe(true)
    expect(autorizar(pedido, conCapacidad, { ...prop!, estado_pub: 'en_revision' })).toMatchObject({ ok: false, status: 409 })
    expect(autorizar(pedido, dueno, { ...prop!, estado_pub: 'borrador' }).ok).toBe(true)
  })

  it('una propiedad sin guardar sólo la sube un admin', () => {
    const pedido = { proposito: 'propiedad' as const, propiedadId: null, clase: 'fotos' as const }
    expect(autorizar(pedido, admin, null).ok).toBe(true)
    expect(autorizar(pedido, dueno, null)).toMatchObject({ ok: false, status: 403 })
  })

  it('la carpeta la decide el servidor y sólo admite imágenes', () => {
    const d = destinoDe({ proposito: 'propiedad', propiedadId: 'p1', clase: 'planos' }, prop)
    expect(d.asset_folder).toBe('vivebien/casa/p1/planos')
    expect(d.public_id.startsWith('vivebien/casa/p1/planos/')).toBe(true)
    expect(d.allowed_formats).toBe(FORMATOS_PERMITIDOS)
    const p = destinoDe({ proposito: 'perfil' }, null)
    expect(p.asset_folder).toBe('vivebien/perfiles')
    expect(p.allowed_formats).toBe(FORMATOS_PERMITIDOS)
  })
})

describe('ya no queda ninguna subida sin firma', () => {
  it('nadie usa el preset sin firma', () => {
    const culpables = archivos(SRC)
      .filter((p) =>
        readFileSync(p, 'utf8')
          .split('\n')
          .some((l) => /upload_preset|UPLOAD_PRESET/.test(l) && !/^\s*(\/\/|\*)/.test(l)),
      )
      .map((p) => relative(SRC, p))
    expect(culpables).toEqual([])
  })

  it('el secreto sólo se lee en el servidor', () => {
    const conSecreto = archivos(SRC)
      .filter((p) => /CLOUDINARY_API_SECRET/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(SRC, p).replace(/\\/g, '/'))
      .sort()
    // R-02 (D-62): el diagnóstico detallado salió de la ruta pública y vive en lib/salud-diagnostico.ts (solo lo sirve /api/admin/salud).
    expect(conSecreto).toEqual(['app/api/medios/firma/route.ts', 'lib/medios/firma.ts', 'lib/salud-diagnostico.ts'])
    // Y ninguno de los dos es código de navegador.
    for (const p of conSecreto) expect(readFileSync(join(SRC, p), 'utf8')).not.toMatch(/^['"]use client['"]/m)
  })
})
