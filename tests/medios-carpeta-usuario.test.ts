import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { destinoDe, idOpacoDeUsuario, leerPedido, autorizar } from '../src/lib/medios/firma'
import { esUrlDeNuestraNube } from '../src/lib/sanear-propiedad'
import { carpetaDe } from '../src/lib/fotos'

/**
 * Carpeta de Cloudinary por usuario (opaco), tipo y anuncio (15-oct-2026, E-48). Las URLs de Cloudinary son públicas: el UID de Firebase
 * NO puede aparecer en ellas, y todo lo que decide la carpeta sale del servidor (sesión validada y fila de la propiedad), nunca del navegador.
 * Datos sintéticos; sin red.
 */
const SECRETO = 'secreto-de-prueba-cloudinary'
const UID_DUENO = 'uid-dueno-AAAAAAAAAAAAAAAAAAAA'
const UID_ADMIN = 'uid-admin-BBBBBBBBBBBBBBBBBBBB'
const pedido = { proposito: 'propiedad', propiedadId: 'prop-123', clase: 'fotos' } as const

describe('idOpacoDeUsuario', () => {
  it('es estable, distinto por cuenta y por secreto, y no contiene el UID', () => {
    const a = idOpacoDeUsuario(UID_DUENO, SECRETO)
    expect(idOpacoDeUsuario(UID_DUENO, SECRETO)).toBe(a)
    expect(idOpacoDeUsuario(UID_ADMIN, SECRETO)).not.toBe(a)
    expect(idOpacoDeUsuario(UID_DUENO, 'otro-secreto')).not.toBe(a)
    expect(a).toMatch(/^[0-9a-f]{20}$/)
    expect(a).not.toContain(UID_DUENO.toLowerCase())
    expect(a.toLowerCase()).not.toContain('uid')
  })
})

describe('destinoDe con origen de carpeta (servidor)', () => {
  it('usuarios/<id opaco>/anuncios/<tipo>/<anuncio>, con el tipo de la fila de la base', () => {
    const d = destinoDe(pedido, { owner_id: UID_DUENO, tipo: 'Departamento', estado_pub: 'borrador' }, { uid: UID_ADMIN, secreto: SECRETO })
    const id = idOpacoDeUsuario(UID_DUENO, SECRETO)
    expect(d.asset_folder).toBe(`usuarios/${id}/anuncios/departamento/prop-123`)
    expect(d.public_id.startsWith(`usuarios/${id}/anuncios/departamento/prop-123/`)).toBe(true)
    expect(d.allowed_formats).toBe('jpg,jpeg,png,webp')
  })

  it('los planos van en su subcarpeta', () => {
    const d = destinoDe({ ...pedido, clase: 'planos' }, { owner_id: UID_DUENO, tipo: 'nave' }, { uid: UID_DUENO, secreto: SECRETO })
    expect(d.asset_folder.endsWith('/anuncios/nave/prop-123/planos')).toBe(true)
  })

  it('la carpeta es de la DUEÑA de la propiedad aunque suba un administrador', () => {
    const porAdmin = destinoDe(pedido, { owner_id: UID_DUENO, tipo: 'casa' }, { uid: UID_ADMIN, secreto: SECRETO })
    const porDueno = destinoDe(pedido, { owner_id: UID_DUENO, tipo: 'casa' }, { uid: UID_DUENO, secreto: SECRETO })
    expect(porAdmin.asset_folder).toBe(porDueno.asset_folder)
    expect(porAdmin.asset_folder).not.toContain(idOpacoDeUsuario(UID_ADMIN, SECRETO))
  })

  it('sin dueño en la base usa la cuenta de la sesión validada', () => {
    const d = destinoDe(pedido, { owner_id: null, tipo: 'casa' }, { uid: UID_ADMIN, secreto: SECRETO })
    expect(d.asset_folder).toContain(`usuarios/${idOpacoDeUsuario(UID_ADMIN, SECRETO)}/`)
  })

  it('el UID nunca aparece en la ruta (carpeta ni public_id)', () => {
    const d = destinoDe(pedido, { owner_id: UID_DUENO, tipo: 'casa' }, { uid: UID_ADMIN, secreto: SECRETO })
    for (const uid of [UID_DUENO, UID_ADMIN]) {
      expect(d.asset_folder.toLowerCase()).not.toContain(uid.toLowerCase())
      expect(d.public_id.toLowerCase()).not.toContain(uid.toLowerCase())
    }
  })

  it('tipo e id se sanean (sin acentos, espacios ni barras): el navegador no puede colar segmentos', () => {
    const d = destinoDe({ ...pedido, propiedadId: '../otra cuenta/ñ' }, { owner_id: UID_DUENO, tipo: 'Casa/../x' }, { uid: UID_DUENO, secreto: SECRETO })
    expect(d.asset_folder).not.toContain('..')
    expect(d.asset_folder.split('/').length).toBe(5) // usuarios / id / anuncios / tipo / anuncio
  })

  it('lo que manda el navegador no decide la carpeta: leerPedido ignora uid, tipo y propietario', () => {
    const p = leerPedido({ proposito: 'propiedad', propiedadId: 'prop-123', uid: 'otro-uid', owner_id: 'otro', tipo: 'terreno', usuario: 'x' })
    expect(p).toEqual({ proposito: 'propiedad', propiedadId: 'prop-123', clase: 'fotos' })
  })

  it('sin origen queda el esquema anterior (el bot de Telegram) y la URL resultante pasa el saneo', () => {
    const d = destinoDe(pedido, { owner_id: UID_DUENO, tipo: 'casa' })
    expect(d.asset_folder).toBe('vivebien/casa/prop-123')
    expect(carpetaDe('prop-123', 'casa')).toBe('vivebien/casa/prop-123')
    const nuevo = destinoDe(pedido, { owner_id: UID_DUENO, tipo: 'casa' }, { uid: UID_DUENO, secreto: SECRETO })
    expect(esUrlDeNuestraNube(`https://res.cloudinary.com/nube-de-prueba/image/upload/v1/${nuevo.public_id}.jpg`, 'nube-de-prueba')).toBe(true)
  })

  it('la autorización de subida sigue igual: solo la dueña (o un admin) sube a su propiedad', () => {
    expect(autorizar(pedido, { uid: UID_DUENO, rol: 'publicador' }, { owner_id: UID_DUENO, tipo: 'casa', estado_pub: 'borrador' }).ok).toBe(true)
    expect(autorizar(pedido, { uid: 'otra', rol: 'publicador' }, { owner_id: UID_DUENO, tipo: 'casa', estado_pub: 'borrador' }).ok).toBe(false)
  })
})

describe('la ruta de firma deriva la carpeta con datos del servidor', () => {
  const ruta = readFileSync(new URL('../src/app/api/medios/firma/route.ts', import.meta.url), 'utf8').split('\r\n').join('\n')

  it('pasa la cuenta de la SESIÓN validada y el secreto del servidor; nunca algo del cuerpo de la petición', () => {
    expect(ruta).toContain('destinoDe(pedido, prop, { uid: perfil.uid, secreto: cred.secreto })')
    // `perfil` sale de exigir() (token de Firebase validado); el pedido solo aporta propósito, id de propiedad y clase
    expect(ruta).toContain("const chequeo = await exigir(req, 'cuenta.propia')")
    expect(ruta).not.toContain('pedido.uid')
    expect(ruta).not.toContain('body.uid')
  })

  it('el tipo y el dueño salen de la fila de la propiedad en la base', () => {
    expect(ruta).toContain(".select('owner_id, tipo, estado_pub')")
  })
})
