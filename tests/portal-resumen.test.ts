import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirResumenPortal, nuevasCoincidencias, preferencias } from '../src/lib/portal/resumen'
import { aTarjeta, COLUMNAS_PROPIEDAD_PORTAL, precioTarjeta } from '../src/lib/portal/tarjeta'
import { COLUMNAS_INTERNAS } from '../src/lib/propiedad-publica'
import {
  BUSQUEDAS_DE_PRUEBA, CASOS_DE_PRUEBA, CITAS_DE_PRUEBA, PERFIL_COMPLETO, PROPIEDADES_DE_PRUEBA,
} from '../src/lib/portal/datos-de-prueba'

/**
 * P3-05 (V-1.1.82): la lógica del Inicio del portal y sus estados vacíos.
 * Todo con datos de prueba: nada de la base.
 */
const resumen = (caso: keyof typeof CASOS_DE_PRUEBA) => {
  const c = CASOS_DE_PRUEBA[caso]
  return construirResumenPortal({
    perfil: c.perfil, propiedades: [...c.propiedades], favoritos: [...c.favoritos], busquedas: [...c.busquedas],
    solicitudes: [...c.solicitudes], citas: [...c.citas],
  })
}

describe('cuenta vacía (el caso real de hoy)', () => {
  const r = resumen('vacio')

  it('todos los contadores en cero, sin inventar nada', () => {
    expect(r.tarjetas).toEqual({ guardadas: 0, busquedas: 0, nuevas: 0, visitas: 0 })
    expect(r.guardadas).toEqual([])
    expect(r.consultas).toEqual([])
    expect(r.proximasVisitas).toEqual([])
    expect(r.busquedas).toEqual([])
    expect(r.avisos).toEqual([])
    expect(r.tuBusqueda).toBeNull()
  })

  it('«Para ti» dice que son las más recientes, no que están elegidas para él', () => {
    expect(r.paraTi.criterio).toBe('recientes')
    expect(r.paraTi.propiedades.map((p) => p.id)).toEqual(['p-nave', 'p-terreno', 'p-local'])
  })

  it('nunca muestra pausadas ni borradores', () => {
    const ids = r.paraTi.propiedades.map((p) => p.id)
    expect(ids).not.toContain('p-pausada')
    expect(ids).not.toContain('p-borrador')
  })

  it('sin propiedades publicadas, «Para ti» queda vacío (la pantalla dice por qué)', () => {
    const sin = construirResumenPortal({ perfil: null, propiedades: [], favoritos: [], busquedas: [], solicitudes: [], citas: [] })
    expect(sin.paraTi.propiedades).toEqual([])
    expect(sin.tarjetas).toEqual({ guardadas: 0, busquedas: 0, nuevas: 0, visitas: 0 })
  })
})

describe('cuenta completa', () => {
  const r = resumen('lleno')

  it('contadores = lo que hay', () => {
    expect(r.tarjetas).toEqual({ guardadas: 2, busquedas: 2, nuevas: 1, visitas: 2 })
    expect(r.guardadas).toEqual(['p-terreno', 'p-casa'])
  })

  it('«Para ti» ordena por lo que busca', () => {
    expect(r.paraTi.criterio).toBe('preferencias')
    // La nave coincide con su búsqueda guardada, su zona, su tipo y su presupuesto.
    expect(r.paraTi.propiedades[0].id).toBe('p-nave')
  })

  it('«Tu búsqueda» refleja el perfil', () => {
    expect(r.tuBusqueda).toEqual({ operacion: 'venta', presupuestoMax: 20_000_000, zonas: ['Parque Industrial de prueba'], tipos: ['nave', 'terreno'] })
  })

  it('consultas: título de la propiedad; sin tarjeta si ya no está disponible', () => {
    expect(r.consultas).toHaveLength(2)
    expect(r.consultas[0]).toMatchObject({ id: 11, tipo: 'informacion', titulo: 'Nave industrial de prueba A' })
    expect(r.consultas[0].propiedad?.id).toBe('p-nave')
    expect(r.consultas[1]).toMatchObject({ id: 12, tipo: 'visita' })
    expect(r.consultas[1].propiedad).toBeNull()
  })

  it('búsquedas guardadas con total y nuevas', () => {
    const naves = r.busquedas.find((b) => b.id === 1)!
    expect(naves).toMatchObject({ nombre: 'Naves en venta', total: 1, nuevas: 1 })
    const sinNombre = r.busquedas.find((b) => b.id === 2)!
    expect(sinNombre.nombre.length).toBeGreaterThan(0)
    expect(sinNombre.href.startsWith('/propiedades')).toBe(true)
  })

  it('avisos: confirmar una visita es urgente y lleva a la visita; las nuevas coincidencias, no', () => {
    const cita = r.avisos.find((a) => a.id === 'cita-c-1')!
    expect(cita.urgente).toBe(true)
    expect(cita.enlace.startsWith('/portal/citas')).toBe(true)   // «Mis visitas» ahora es «Citas» (D-6)
    expect(r.avisos.find((a) => a.id === 'cita-c-2')).toBeUndefined()
    const nuevas = r.avisos.find((a) => a.id === 'nuevas')!
    expect(nuevas).toMatchObject({ urgente: false, texto: 'Hay 1 propiedad nueva para tus búsquedas' })
  })

  it('sólo las dos próximas visitas', () => {
    expect(r.proximasVisitas.map((c) => c.id)).toEqual(['c-1', 'c-2'])
    const muchas = construirResumenPortal({ ...CASOS_DE_PRUEBA.lleno, propiedades: [...PROPIEDADES_DE_PRUEBA], favoritos: [], busquedas: [], solicitudes: [], citas: [...CITAS_DE_PRUEBA, ...CITAS_DE_PRUEBA] })
    expect(muchas.proximasVisitas).toHaveLength(2)
  })
})

describe('nuevas coincidencias (las «alertas» dentro del portal)', () => {
  it('sólo cuenta lo publicado DESPUÉS de guardar la búsqueda', () => {
    expect(nuevasCoincidencias(PROPIEDADES_DE_PRUEBA, BUSQUEDAS_DE_PRUEBA).map((p) => p.id)).toEqual(['p-nave'])
  })

  it('nunca cuenta lo pausado, aunque sea más reciente', () => {
    const ids = nuevasCoincidencias(PROPIEDADES_DE_PRUEBA, [{ id: 9, nombre: null, filtros: { tipo: 'nave' }, creado_en: '2026-09-01T00:00:00Z' }]).map((p) => p.id)
    expect(ids).toContain('p-nave')
    expect(ids).not.toContain('p-pausada')
  })

  it('sin búsquedas, nada es «nuevo»', () => {
    expect(nuevasCoincidencias(PROPIEDADES_DE_PRUEBA, [])).toEqual([])
  })
})

describe('preferencias', () => {
  it('lee las listas de zonas y tipos', () => {
    expect(preferencias(PERFIL_COMPLETO)).toEqual({ zonas: ['Parque Industrial de prueba'], tipos: ['nave', 'terreno'], operacion: 'venta', presupuestoMax: 20_000_000 })
  })

  it('sin perfil, vacías', () => {
    expect(preferencias(null)).toEqual({ zonas: [], tipos: [], operacion: null, presupuestoMax: null })
  })
})

describe('la tarjeta del portal sólo lleva datos públicos', () => {
  it('ni la lista de columnas ni la tarjeta tienen columnas internas', () => {
    const columnas = COLUMNAS_PROPIEDAD_PORTAL.split(',').map((c) => c.trim())
    for (const interna of COLUMNAS_INTERNAS) expect(columnas, interna).not.toContain(interna)
    const t = aTarjeta(PROPIEDADES_DE_PRUEBA[0])
    // `iva` desde V-1.1.85: es público (lo enseña la ficha) y el portal no
    // puede decir algo distinto que la web (D-32, una sola verdad por dato).
    expect(Object.keys(t).sort()).toEqual(['datos', 'foto', 'id', 'iva', 'lugar', 'precio', 'publicadaEn', 'ruta', 'tipo', 'tipoEtiqueta', 'titulo'])
  })

  it('el IVA dice lo mismo que la web pública, y nada si no hay precio', () => {
    expect(aTarjeta({ ...PROPIEDADES_DE_PRUEBA[0], precio: 100, precio_incluye_iva: true }).iva).toBe('incluido')
    expect(aTarjeta({ ...PROPIEDADES_DE_PRUEBA[0], precio: 100, precio_incluye_iva: false }).iva).toBe('mas')
    expect(aTarjeta({ ...PROPIEDADES_DE_PRUEBA[0], precio: null }).iva).toBeNull()
    expect(aTarjeta({ ...PROPIEDADES_DE_PRUEBA[0], precio: 0 }).iva).toBeNull()
  })

  it('la API del portal pide exactamente esas columnas', () => {
    const ruta = readFileSync(join(__dirname, '..', 'src/app/api/portal/resumen/route.ts'), 'utf8')
    expect(ruta).toMatch(/\.from\('propiedades'\)\.select\(COLUMNAS_PROPIEDAD_PORTAL\)/)
  })

  it('precio: renta con /mes; sin precio, nada (no «$0»)', () => {
    expect(precioTarjeta({ precio: 36_000, moneda: 'MXN', operacion: 'renta' })).toBe('$36,000/mes')
    expect(precioTarjeta({ precio: 18_500_000, moneda: 'MXN', operacion: 'venta' })).toBe('$18,500,000')
    expect(precioTarjeta({ precio: null, moneda: 'MXN', operacion: 'venta' })).toBeNull()
    expect(precioTarjeta({ precio: 0, moneda: 'MXN', operacion: 'venta' })).toBeNull()
  })

  it('datos según el tipo', () => {
    expect(aTarjeta(PROPIEDADES_DE_PRUEBA[0]).datos).toEqual(['2,400 m²', '9 m de altura', '2 andenes'])
    expect(aTarjeta(PROPIEDADES_DE_PRUEBA[3]).datos).toEqual(['180 m²', '3 recámaras', '2.5 baños'])
  })
})
