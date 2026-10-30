import { describe, expect, it } from 'vitest'
import { enlaceCorto } from '@/lib/catalogo/compartir'

describe('enlace corto para compartir una propiedad', () => {
  const origen = 'https://vivebienn.com'
  it('usa el folio: /p/<folio>', () => {
    expect(enlaceCorto({ id: 'u-1', slug: 'casa-larga-leon', folio: 'VB-2026-00002' }, origen)).toBe('https://vivebienn.com/p/VB-2026-00002')
  })
  it('sin folio cae a la dirección de la ficha (slug, o id si no hay slug)', () => {
    expect(enlaceCorto({ id: 'u-1', slug: 'casa-larga-leon' }, origen)).toBe('https://vivebienn.com/propiedades/casa-larga-leon')
    expect(enlaceCorto({ id: 'u-1', slug: null, folio: null }, origen)).toBe('https://vivebienn.com/propiedades/u-1')
  })
  it('un folio raro no se mete en la URL sin validar', () => {
    expect(enlaceCorto({ id: 'u-1', slug: 's', folio: 'x/../admin' }, origen)).toBe('https://vivebienn.com/propiedades/s')
    expect(enlaceCorto({ id: 'u-1', slug: 's', folio: 'VB 1' }, origen)).toBe('https://vivebienn.com/propiedades/s')
  })
  it('quita la diagonal final del origen', () => {
    expect(enlaceCorto({ id: 'u', folio: 'VB-2026-00009' }, 'https://vivebienn.com/')).toBe('https://vivebienn.com/p/VB-2026-00009')
  })
})
