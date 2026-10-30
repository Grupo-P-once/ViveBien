import type { CitaVista } from '../citas/vista'
import type { FilaBusqueda, FilaFavorito, FilaPerfilPortal, FilaSolicitud } from './resumen'
import type { FilaPropiedadPortal } from './tarjeta'

/**
 * Datos de prueba del portal del cliente (fase 3a).
 *
 * TODO es inventado y se nota: nombres «de prueba», sin fotos reales, sin
 * teléfonos ni correos. Lo usan las pruebas (`tests/portal-resumen.test.ts`)
 * y la vista previa de desarrollo (`/vista-previa/portal`), que nunca toca la
 * base, Firebase, correos, leads ni citas reales.
 */

const HOY = new Date('2026-09-19T12:00:00-06:00')
const hace = (dias: number) => new Date(HOY.getTime() - dias * 86_400_000).toISOString()
const dentro = (dias: number, hora: number) => {
  const d = new Date(HOY.getTime() + dias * 86_400_000)
  d.setHours(hora, 0, 0, 0)
  return d.toISOString()
}

export const AHORA_DE_PRUEBA = HOY

function prop(p: Partial<FilaPropiedadPortal> & { id: string }): FilaPropiedadPortal {
  return {
    titulo: null, tipo: null, operacion: 'venta', precio: null, precio_incluye_iva: false, moneda: 'MXN', ubicacion: null, colonia: null,
    ciudad: 'León', metros: null, recamaras: null, banos: null, altura_libre: null, andenes: null,
    estatus: 'disponible', estado_pub: 'publicada', slug: null, fotos: [], publicada_en: hace(30), created_at: hace(40),
    ...p,
  }
}

/** Siete publicadas como hoy en producción (en cantidad, no en contenido), más una pausada y un borrador. */
export const PROPIEDADES_DE_PRUEBA: FilaPropiedadPortal[] = [
  prop({ id: 'p-nave', titulo: 'Nave industrial de prueba A', tipo: 'nave', precio: 18_500_000, precio_incluye_iva: true, metros: 2400, altura_libre: 9, andenes: 2, colonia: 'Parque Industrial de prueba', slug: 'nave-de-prueba-a', publicada_en: hace(2) }),
  prop({ id: 'p-terreno', titulo: 'Terreno de prueba B', tipo: 'terreno', precio: 4_200_000, metros: 800, colonia: 'Colonia de prueba', slug: 'terreno-de-prueba-b', publicada_en: hace(12) }),
  prop({ id: 'p-local', titulo: 'Local comercial de prueba C', tipo: 'local', operacion: 'renta', precio: 36_000, metros: 220, colonia: 'Centro de prueba', slug: 'local-de-prueba-c', publicada_en: hace(20) }),
  prop({ id: 'p-casa', titulo: 'Casa de prueba D', tipo: 'casa', precio: 3_150_000, metros: 180, recamaras: 3, banos: 2.5, colonia: 'Fraccionamiento de prueba', slug: 'casa-de-prueba-d', publicada_en: hace(25) }),
  prop({ id: 'p-bodega', titulo: 'Bodega de prueba E', tipo: 'bodega', operacion: 'renta', precio: 85_000, metros: 1200, altura_libre: 7.5, slug: 'bodega-de-prueba-e', publicada_en: hace(35) }),
  prop({ id: 'p-oficina', titulo: 'Oficina de prueba F', tipo: 'oficina', operacion: 'renta', precio: 22_000, metros: 90, banos: 1, slug: 'oficina-de-prueba-f', publicada_en: hace(50) }),
  prop({ id: 'p-depto', titulo: 'Departamento de prueba G', tipo: 'departamento', precio: 2_400_000, metros: 95, recamaras: 2, banos: 2, slug: 'departamento-de-prueba-g', publicada_en: hace(60) }),
  prop({ id: 'p-pausada', titulo: 'Nave de prueba pausada', tipo: 'nave', precio: 9_000_000, estatus: 'pausada', slug: 'nave-pausada', publicada_en: hace(1) }),
  prop({ id: 'p-borrador', titulo: 'Borrador de prueba', tipo: 'nave', estado_pub: 'borrador', publicada_en: null }),
]

export const PERFIL_COMPLETO: FilaPerfilPortal = {
  nombre: 'Cliente Prueba',
  busca_operacion: 'venta',
  busca_zonas: ['Parque Industrial de prueba'],
  busca_tipos: ['nave', 'terreno'],
  presupuesto_max: 20_000_000,
}

export const BUSQUEDAS_DE_PRUEBA: FilaBusqueda[] = [
  // Guardada hace 5 días: la nave publicada hace 2 días es «nueva» para ella.
  { id: 1, nombre: 'Naves en venta', filtros: { op: 'venta', tipo: 'nave' }, creado_en: hace(5) },
  { id: 2, nombre: null, filtros: { op: 'renta', tipo: 'local' }, creado_en: hace(3) },
]

export const FAVORITOS_DE_PRUEBA: FilaFavorito[] = [
  { propiedad_id: 'p-terreno', creado_en: hace(4) },
  { propiedad_id: 'p-casa', creado_en: hace(9) },
]

export const SOLICITUDES_DE_PRUEBA: FilaSolicitud[] = [
  { id: 11, propiedad_id: 'p-nave', propiedad_titulo: 'Nave industrial de prueba A', tipo: 'informacion', creado_en: hace(1) },
  { id: 12, propiedad_id: 'p-pausada', propiedad_titulo: 'Nave de prueba pausada', tipo: 'visita', creado_en: hace(6) },
]

function cita(c: Partial<CitaVista> & { id: string; estado: CitaVista['estado'] }): CitaVista {
  return {
    version: 1, etiqueta: '', papel: 'cliente', inicio: dentro(3, 11), fin: dentro(3, 12), zona: 'America/Mexico_City',
    lugar: null, propiedad: { id: 'p-terreno', titulo: 'Terreno de prueba B', tipo: 'terreno', ruta: '/propiedades/terreno-de-prueba-b', foto: null },
    propuesta: null, cliente: { nombre: 'Cliente de prueba' }, asesor: { nombre: 'Asesor de prueba' },
    notasCliente: null, motivoCancelacion: null, acciones: [], creadaEn: hace(2), actualizadaEn: hace(1),
    ...c,
  } as CitaVista
}

export const CITAS_DE_PRUEBA: CitaVista[] = [
  cita({ id: 'c-1', estado: 'PENDING_CONFIRMATION' }),
  cita({ id: 'c-2', estado: 'CONFIRMED', inicio: dentro(8, 16), fin: dentro(8, 17) }),
]

/** Los tres casos que pide la fase 3a: cuenta completa, vacía y suspendida. */
export const CASOS_DE_PRUEBA = {
  lleno: {
    perfil: PERFIL_COMPLETO, propiedades: PROPIEDADES_DE_PRUEBA, favoritos: FAVORITOS_DE_PRUEBA,
    busquedas: BUSQUEDAS_DE_PRUEBA, solicitudes: SOLICITUDES_DE_PRUEBA, citas: CITAS_DE_PRUEBA,
  },
  vacio: {
    perfil: null, propiedades: PROPIEDADES_DE_PRUEBA, favoritos: [], busquedas: [], solicitudes: [], citas: [],
  },
  suspendido: {
    perfil: PERFIL_COMPLETO, propiedades: PROPIEDADES_DE_PRUEBA, favoritos: FAVORITOS_DE_PRUEBA,
    busquedas: BUSQUEDAS_DE_PRUEBA, solicitudes: SOLICITUDES_DE_PRUEBA, citas: CITAS_DE_PRUEBA,
  },
} as const

export type CasoDePrueba = keyof typeof CASOS_DE_PRUEBA

/**
 * Las pantallas que la vista previa sabe pintar (3b-1). Vive aquí, y no en el
 * componente, porque la página es de servidor: lo que exporta un módulo
 * `'use client'` llega como referencia, no como valor.
 */
export const PANTALLAS_DE_PRUEBA = [
  'inicio', 'guardadas', 'busquedas', 'alertas', 'consultas',
  // 3b-2
  'me-interesan', 'visitas', 'perfil', 'mi-busqueda', 'configuracion',
] as const
export type PantallaDePrueba = (typeof PANTALLAS_DE_PRUEBA)[number]
