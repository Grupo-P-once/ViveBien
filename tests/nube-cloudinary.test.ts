import { describe, expect, it } from 'vitest'
import { normalizarNube } from '../src/lib/medios/nube'
import { credencialesCloudinary } from '../src/lib/medios/firma'
import { esUrlDeNuestraNube, sanearContenido } from '../src/lib/sanear-propiedad'

/**
 * E-48 (15-oct-2026): el firmador recortaba la variable de la nube de Cloudinary y el saneo no. Con un salto de línea o un espacio
 * pegado en la variable, la subida funcionaba y el guardado de la URL se rechazaba, solo para quien no es moderador.
 * Estas pruebas fijan UNA normalización para los dos sitios. Datos sintéticos; sin red ni Cloudinary.
 */
const URL_SUBIDA = 'https://res.cloudinary.com/nube-de-prueba/image/upload/v1700000000/usuarios/abc/anuncios/casa/p1/foto-1.jpg'
const fotos = [URL_SUBIDA, URL_SUBIDA.replace('foto-1', 'foto-2')]

describe('normalizarNube', () => {
  it('recorta espacios y saltos de línea y devuelve null si no queda nada', () => {
    expect(normalizarNube('nube-de-prueba')).toBe('nube-de-prueba')
    expect(normalizarNube(' nube-de-prueba ')).toBe('nube-de-prueba')
    expect(normalizarNube('nube-de-prueba\n')).toBe('nube-de-prueba')
    expect(normalizarNube('\r\nnube-de-prueba\r\n')).toBe('nube-de-prueba')
    expect(normalizarNube('   ')).toBeNull()
    expect(normalizarNube('')).toBeNull()
    expect(normalizarNube(undefined)).toBeNull()
    expect(normalizarNube(null)).toBeNull()
  })
})

describe('la comprobación de URLs usa la misma normalización que el firmador', () => {
  it.each([
    ['nombre limpio', 'nube-de-prueba', true],
    ['espacio al final', 'nube-de-prueba ', true],
    ['salto de línea al final', 'nube-de-prueba\n', true],
    ['retorno de carro + salto', 'nube-de-prueba\r\n', true],
    ['espacios alrededor', '  nube-de-prueba  ', true],
    ['otra nube', 'otra-nube', false],
    ['variable ausente', undefined, false],
    ['variable vacía', '   ', false],
  ])('esUrlDeNuestraNube: %s', (_n, nube, esperado) => {
    expect(esUrlDeNuestraNube(URL_SUBIDA, nube as string | undefined)).toBe(esperado)
  })

  it('el firmador y el saneo coinciden con la variable «sucia»', () => {
    const env = { NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'nube-de-prueba\n', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' }
    const cred = credencialesCloudinary(env)
    expect(cred?.nube).toBe('nube-de-prueba')
    // lo que el firmador usaría para subir, el saneo lo acepta al guardar (antes: rechazo 400 para el publicador)
    expect(esUrlDeNuestraNube(`https://res.cloudinary.com/${cred?.nube}/image/upload/v1/x.jpg`, env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME)).toBe(true)
  })
})

describe('sanearContenido con fotos de un PUBLICADOR (no moderador)', () => {
  const guardar = (nube: string | undefined, moderador = false) => sanearContenido({ fotos }, { moderador, actuales: null, nube })

  it('acepta las fotos subidas a la nube con la variable limpia, con espacio o con salto de línea', () => {
    for (const nube of ['nube-de-prueba', 'nube-de-prueba ', 'nube-de-prueba\n']) {
      const r = guardar(nube)
      expect(r.errores, `nube ${JSON.stringify(nube)}`).toEqual([])
      expect(r.datos.fotos).toEqual(fotos)
    }
  })

  it('rechaza fotos de otra nube, de otro host o con la variable ausente', () => {
    expect(guardar('otra-nube').errores.length).toBeGreaterThan(0)
    expect(guardar(undefined).errores.length).toBeGreaterThan(0)
    const ajena = sanearContenido({ fotos: ['https://ejemplo.test/nube-de-prueba/image/upload/v1/x.jpg'] }, { moderador: false, actuales: null, nube: 'nube-de-prueba' })
    expect(ajena.errores.length).toBeGreaterThan(0)
  })

  it('un moderador no pasa por esa comprobación (comportamiento existente)', () => {
    expect(guardar('otra-nube', true).errores).toEqual([])
  })
})
