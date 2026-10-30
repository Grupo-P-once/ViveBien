import { describe, it, expect } from 'vitest'
import { paginaSeo, migasJsonLd, grafo, negocioJsonLd, jsonLdSeguro } from '../src/lib/seo'
import { tituloDe, descripcionDe } from '../src/lib/seo-propiedad'
import { lugarDe } from '../src/lib/ubicacion'

/**
 * Lo que estas pruebas vigilan es un fallo que ya ocurrió y costó semanas de
 * indexación: una canónica equivocada servida en todas las páginas, con el
 * proyecto compilando sin un solo error.
 */

describe('paginaSeo', () => {
  it('la canónica es la propia página, nunca la portada', () => {
    const m = paginaSeo({ ruta: '/propiedades', titulo: 'T', descripcion: 'D' })
    expect(m.alternates?.canonical).toBe('/propiedades')
  })

  it('no hay forma de generar metadata sin canónica', () => {
    for (const ruta of ['/', '/nosotros', '/propiedades/casa-abc']) {
      const m = paginaSeo({ ruta, titulo: 'T', descripcion: 'D' })
      expect(m.alternates?.canonical).toBe(ruta)
    }
  })

  it('por defecto la página se indexa', () => {
    const m = paginaSeo({ ruta: '/contacto', titulo: 'T', descripcion: 'D' })
    expect(m.robots).toMatchObject({ index: true, follow: true })
  })

  it('noIndexar deja de indexar pero sigue los enlaces', () => {
    const m = paginaSeo({ ruta: '/comparar', titulo: 'T', descripcion: 'D', noIndexar: true })
    // `follow` importa: el comparador enlaza a fichas que sí queremos indexar.
    expect(m.robots).toMatchObject({ index: false, follow: true })
  })
})

describe('tituloDe', () => {
  const base = { tipo: 'nave', operacion: 'renta', ubicacion: 'Blvd. San Juan Bosco, León' }

  it('pone tipo, operación y lugar en el orden en que se busca', () => {
    expect(tituloDe(base)).toMatch(/^Nave industrial en renta en León/)
  })

  it('no pasa de 60 caracteres ni con una dirección larga', () => {
    const largo = tituloDe({
      ...base,
      titulo: 'CASA CAÑADA DE MARICHES CAÑADA DEL REFUGIO SUR',
      ubicacion: 'Cañada de Mariches, Cañada del Refugio Sur, León, Guanajuato',
    })
    expect(largo.length).toBeLessThanOrEqual(60)
  })

  it('distingue dos fichas que por datos serían idénticas', () => {
    // Caso real: dos terrenos del mismo parque, 600 m², mismo precio, misma
    // ciudad. Lo único que los separa es «(A)» y «(B)» en el título escrito.
    const comun = { tipo: 'terreno', operacion: 'venta', ubicacion: '36293 Silao de la Victoria, Gto.', metros: 600, precio: 2280000 }
    const a = tituloDe({ ...comun, titulo: 'TERRENO INDUSTRIAL (A) PANAM II SIALO ' })
    const b = tituloDe({ ...comun, titulo: 'TERRENO INDUSTRIAL (B) PANAM II SIALO' })
    expect(a).not.toBe(b)
    expect(a.length).toBeLessThanOrEqual(60)
    expect(b.length).toBeLessThanOrEqual(60)
  })

  it('no baja a minúscula las siglas ni los marcadores entre paréntesis', () => {
    const t = tituloDe({ tipo: 'terreno', operacion: 'venta', ubicacion: 'Silao, Gto.', titulo: 'TERRENO INDUSTRIAL (A) PANAM II' })
    expect(t).toContain('(A)')
    expect(t).not.toContain('(a)')
    expect(t).not.toContain('Ii')
  })

  it('las preposiciones sí van en minúscula', () => {
    // Con la regla de las siglas salía «Cañada DE Mariches CAÑADA DEL».
    const t = tituloDe({ tipo: 'casa', operacion: 'venta', ubicacion: 'León, Gto.', titulo: 'CASA CAÑADA DE MARICHES' })
    expect(t).not.toMatch(/ DE | DEL /)
  })

  it('no inventa la operación cuando no la hay', () => {
    const t = tituloDe({ tipo: 'terreno', ubicacion: 'León' })
    expect(t).not.toMatch(/venta|renta/)
  })
})

describe('descripcionDe', () => {
  it('cabe en lo que Google enseña', () => {
    const d = descripcionDe({
      tipo: 'casa',
      operacion: 'venta',
      ubicacion: 'León',
      descripcion: 'Hermosa oportunidad única. '.repeat(90),
    })
    expect(d.length).toBeLessThanOrEqual(160)
  })

  it('los datos van delante del texto libre', () => {
    const d = descripcionDe({
      tipo: 'casa', operacion: 'venta', ubicacion: 'León', metros: 250,
      descripcion: 'Hermosa oportunidad única en venta.',
    })
    expect(d.startsWith('Casa en venta en')).toBe(true)
    expect(d).toContain('250 m²')
  })

  it('dos propiedades con la misma descripción no acaban con la misma etiqueta', () => {
    const texto = 'Terreno industrial en el parque PANAM II.'
    const a = descripcionDe({ tipo: 'terreno', operacion: 'venta', ubicacion: 'León', metros: 1000, precio: 2280000, descripcion: texto })
    const b = descripcionDe({ tipo: 'terreno', operacion: 'venta', ubicacion: 'Silao', metros: 1400, precio: 2280000, descripcion: texto })
    expect(a).not.toBe(b)
  })

  it('no dice «undefined» cuando faltan datos', () => {
    const d = descripcionDe({ tipo: 'casa' })
    expect(d).not.toMatch(/undefined|NaN|null/)
  })
})

describe('datos estructurados', () => {
  it('las migas empiezan en Inicio y numeran desde 1', () => {
    const m = migasJsonLd([{ nombre: 'Propiedades', ruta: '/propiedades' }, { nombre: 'Casa' }])
    expect(m.itemListElement[0]).toMatchObject({ position: 1, name: 'Inicio' })
    expect(m.itemListElement).toHaveLength(3)
  })

  it('la página actual va sin enlace', () => {
    const m = migasJsonLd([{ nombre: 'Casa' }])
    expect(m.itemListElement[1]).not.toHaveProperty('item')
  })

  it('el grafo lleva un solo @context', () => {
    const g = grafo(negocioJsonLd(), migasJsonLd([{ nombre: 'X' }]))
    expect(g['@context']).toBe('https://schema.org')
    expect(g['@graph']).toHaveLength(2)
  })

  it('la empresa no declara valoraciones ni horarios inventados', () => {
    const n = negocioJsonLd() as Record<string, unknown>
    expect(n).not.toHaveProperty('aggregateRating')
    expect(n).not.toHaveProperty('openingHours')
    expect(n).not.toHaveProperty('geo')
  })
})

describe('lugarDe — la ciudad que acaba en el título y en el JSON-LD', () => {
  it('quita el código postal que antepone el servicio de mapas', () => {
    // Producía literalmente «Terreno en venta en 36293 Silao de la Victoria».
    expect(lugarDe({ ubicacion: '36293 Silao de la Victoria, Gto.' }).ciudad).toBe('Silao')
  })

  it('reconoce el nombre oficial largo', () => {
    expect(lugarDe({ ubicacion: 'Mandujano 210, 37239 León de los Aldama, Gto.' }).ciudad).toBe('León')
  })

  it('no confunde la capital del estado con la ciudad de la propiedad', () => {
    // «…, León, Guanajuato, 37358, México» daba ciudad = Guanajuato, e indexaba
    // una casa de León en otra ciudad.
    const l = lugarDe({ ubicacion: 'Avenida Cañada de Mariches, Cañada Del Refugio 2a Secc, León, Guanajuato, 37358, México' })
    expect(l.ciudad).toBe('León')
  })

  it('no convierte «Nuevo León» en «León»', () => {
    expect(lugarDe({ ubicacion: 'Monterrey, Nuevo León' }).ciudad).not.toBe('León')
  })

  it('la columna real manda sobre el texto', () => {
    expect(lugarDe({ ciudad: 'Silao', ubicacion: 'algo en León' }).ciudad).toBe('Silao')
  })
})

describe('jsonLdSeguro — datos estructurados con texto escrito por publicadores', () => {
  const ataque = { description: 'Casa bonita</script><script>alert(document.cookie)</script>' }

  it('una descripción no puede cerrar la etiqueta <script>', () => {
    const salida = jsonLdSeguro(ataque)
    // Lo que importa: el navegador corta un <script> en el primer «</script>».
    expect(salida).not.toContain('</script>')
    expect(salida).not.toContain('<')
    expect(salida).not.toContain('>')
  })

  it('sigue siendo el mismo JSON para quien lo lee', () => {
    // Los buscadores leen el JSON, no el texto escapado: tiene que decodificar
    // exactamente a lo mismo.
    expect(JSON.parse(jsonLdSeguro(ataque))).toEqual(ataque)
  })

  it('escapa también los separadores de línea que rompen JavaScript', () => {
    const raro = { name: `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c` }
    const salida = jsonLdSeguro(raro)
    expect(salida).not.toContain(String.fromCharCode(0x2028))
    expect(salida).not.toContain(String.fromCharCode(0x2029))
    expect(JSON.parse(salida)).toEqual(raro)
  })

  it('no altera un JSON normal', () => {
    const normal = { '@type': 'RealEstateListing', name: 'Nave industrial en León', price: 7900000 }
    expect(JSON.parse(jsonLdSeguro(normal))).toEqual(normal)
  })
})
