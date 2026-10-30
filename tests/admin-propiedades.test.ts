import { describe, it, expect } from 'vitest'
import {
  accionesDe, conteosPorPestana, enPestana, filtrarPropiedades, kpisPropiedades, PESTANAS, type PropiedadPanel,
} from '../src/lib/admin/propiedades'
import { puedeTransicionar } from '../src/lib/publicacion'

const AHORA = new Date('2026-09-17T18:00:00.000Z')
const hace = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString()

const P = (p: Partial<PropiedadPanel>): PropiedadPanel => ({ id: 'x', estado_pub: 'publicada', estatus: 'disponible', ...p })

const lista = [
  P({ id: 'a', titulo: 'Nave industrial Mandujano', folio: 'VB-2026-00006', ubicacion: 'León de los Aldama, Gto.', publicada_en: hace(5) }),
  P({ id: 'b', titulo: 'Casa Cañada', estatus: 'pausada', publicada_en: hace(60) }),
  P({ id: 'c', titulo: null, estado_pub: 'borrador' }),
  P({ id: 'd', estado_pub: 'en_revision' }),
  P({ id: 'e', estado_pub: 'rechazada' }),
  P({ id: 'f', estatus: 'eliminada' }),
]

describe('pestañas de propiedades', () => {
  it('«Todas» es el inventario: deja fuera lo archivado', () => {
    expect(enPestana(P({ estatus: 'eliminada' }), 'todas')).toBe(false)
    expect(conteosPorPestana(lista).todas).toBe(5)
  })

  it('una propiedad puede estar publicada y pausada a la vez', () => {
    const c = conteosPorPestana(lista)
    expect(c.publicadas).toBe(2)
    expect(c.pausadas).toBe(1)
  })

  it('borradores incluye lo devuelto y lo rechazado', () => {
    expect(conteosPorPestana(lista).borradores).toBe(2)
    expect(conteosPorPestana(lista).revision).toBe(1)
    expect(conteosPorPestana(lista).archivadas).toBe(1)
  })

  it('busca por título, folio y ubicación sin acentos', () => {
    expect(filtrarPropiedades(lista, 'todas', 'leon').map((p) => p.id)).toEqual(['a'])
    expect(filtrarPropiedades(lista, 'todas', 'VB-2026-00006').map((p) => p.id)).toEqual(['a'])
    expect(filtrarPropiedades(lista, 'todas', 'canada').map((p) => p.id)).toEqual(['b'])
  })
})

describe('pestaña «Rentadas / Vendidas»', () => {
  const mezcla = [P({ id: 'p1' }), P({ id: 'r1', estatus: 'rentada', titulo: 'Bodega San Juan' }), P({ id: 'v1', estatus: 'vendida' }), P({ id: 'ra', estatus: 'eliminada' }), P({ id: 'rb', estatus: 'rentada', estado_pub: 'borrador' })]
  it('junta lo rentado y lo vendido, sin archivadas, y lo saca de «Publicadas» (que es lo que se ve en el sitio)', () => {
    expect(mezcla.filter((p) => enPestana(p, 'cerradas')).map((p) => p.id)).toEqual(['r1', 'v1', 'rb'])
    expect(mezcla.filter((p) => enPestana(p, 'publicadas')).map((p) => p.id)).toEqual(['p1'])
  })
  it('sigue en «Todas» (es inventario), cuenta aparte y se puede buscar', () => {
    const c = conteosPorPestana(mezcla)
    expect(c).toMatchObject({ todas: 4, publicadas: 1, cerradas: 3, archivadas: 1 })
    expect(filtrarPropiedades(mezcla, 'cerradas', 'san juan').map((p) => p.id)).toEqual(['r1'])
  })
  it('la pestaña está junto a las demás, con su nombre', () => {
    expect(PESTANAS.map((t) => t.etiqueta)).toEqual(['Todas', 'Publicadas', 'Borradores', 'Por revisar', 'Pausadas', 'Rentadas / Vendidas', 'Archivadas'])
  })
})

describe('indicadores de propiedades', () => {
  const k = kpisPropiedades(lista, AHORA)
  it('publicadas cuenta las nuevas de los últimos 30 días', () => {
    expect(k.find((x) => x.clave === 'publicadas')).toEqual({ clave: 'publicadas', valor: 2, nota: '1 nueva en 30 días' })
  })
  it('lo que está fuera suma pausadas, rentadas/vendidas y archivadas, y lo desglosa', () => {
    expect(k.find((x) => x.clave === 'fuera')).toEqual({ clave: 'fuera', valor: 2, nota: '1 pausada · 0 rentadas/vendidas · 1 archivada' })
  })
})

describe('acciones de cada propiedad', () => {
  const etiquetas = (p: PropiedadPanel) => accionesDe(p).map((a) => a.etiqueta)

  it('una publicada se puede quitar del sitio, pausar o archivar', () => {
    expect(etiquetas(P({}))).toEqual(['Quitar del sitio (a borrador)', 'Pausar', 'Archivar'])
  })

  it('una venta o una renta publicada ofrece «Vendida» o «Rentada» (lleva al motor de comisiones), sin archivarla', () => {
    expect(etiquetas(P({ operacion: 'venta' }))).toEqual(['Quitar del sitio (a borrador)', 'Vendida: registrar comisión', 'Pausar', 'Archivar'])
    expect(etiquetas(P({ operacion: 'renta' }))).toEqual(['Quitar del sitio (a borrador)', 'Rentada: registrar comisión', 'Pausar', 'Archivar'])
    const cierre = accionesDe(P({ operacion: 'renta' })).find((a) => a.tipo === 'cierre')
    expect(cierre).toMatchObject({ tipo: 'cierre', operacion: 'renta', marcar: true })
  })

  it('una propiedad ya vendida o rentada ofrece registrar su comisión (sin volver a marcarla) y volver a disponible', () => {
    const vendida = accionesDe(P({ operacion: 'venta', estatus: 'vendida' }))
    expect(vendida.map((a) => a.etiqueta)).toEqual(['Quitar del sitio (a borrador)', 'Registrar comisión de esta venta', 'Volver a disponible', 'Archivar'])
    expect(vendida.find((a) => a.tipo === 'cierre')).toMatchObject({ operacion: 'venta', marcar: false })
    const rentada = accionesDe(P({ operacion: 'renta', estatus: 'rentada' }))
    expect(rentada.find((a) => a.tipo === 'cierre')).toMatchObject({ operacion: 'renta', marcar: false })
    expect(rentada.map((a) => a.etiqueta)).not.toContain('Pausar')
  })

  it('archivar NO es lo que se hace al vender: lo archivado no ofrece cerrar y lo vendido conserva su propiedad', () => {
    expect(etiquetas(P({ operacion: 'venta', estatus: 'eliminada' }))).toEqual(['Restaurar', 'Eliminar para siempre'])
    expect(accionesDe(P({ operacion: 'venta' })).filter((a) => a.tipo === 'cierre' && a.marcar).every((a) => a.tipo === 'cierre' && a.operacion === 'venta')).toBe(true)
  })

  it('sin operación conocida no se ofrece cerrar (no se sabría qué comisión calcular)', () => {
    expect(accionesDe(P({ operacion: null })).some((a) => a.tipo === 'cierre')).toBe(false)
  })

  it('lo que espera revisión se aprueba desde aquí', () => {
    expect(etiquetas(P({ estado_pub: 'en_revision' }))[0]).toBe('Aprobar y publicar')
  })

  it('borrar para siempre sólo existe para lo archivado', () => {
    expect(etiquetas(P({}))).not.toContain('Eliminar para siempre')
    expect(etiquetas(P({ estatus: 'eliminada' }))).toEqual(['Restaurar', 'Eliminar para siempre'])
  })

  it('cada cambio de publicación que se ofrece lo acepta el servidor para un admin', () => {
    // Un botón que el servidor rechaza es peor que no tener botón.
    for (const origen of ['borrador', 'en_revision', 'cambios_solicitados', 'rechazada', 'publicada'] as const) {
      for (const a of accionesDe(P({ estado_pub: origen }))) {
        if (a.tipo !== 'publicacion') continue
        expect(puedeTransicionar(origen, a.valor, 'admin')).toEqual({ ok: true })
      }
    }
  })
})
