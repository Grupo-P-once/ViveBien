import { formatoMetros } from '@/lib/medidas'
import { miniaturaCloudinary } from '../cloudinary-url'
import { nombreDe, rutaDe } from '../propiedad-publica'

/**
 * Una propiedad lista para pintarse como tarjeta del portal (mockup
 * «Nuevas propiedades para ti»): foto, tipo, título, lugar, 2–3 datos y precio.
 *
 * Sólo datos públicos: lo mismo que ya enseña la ficha de la propiedad.
 */

export type FilaPropiedadPortal = {
  id: string
  titulo: string | null
  tipo: string | null
  operacion: string | null
  precio: number | null
  precio_incluye_iva: boolean | null
  moneda: string | null
  ubicacion: string | null
  colonia: string | null
  ciudad: string | null
  metros: number | null
  recamaras: number | null
  banos: number | null
  altura_libre: number | null
  andenes: number | null
  estatus: string | null
  estado_pub: string | null
  slug: string | null
  fotos: string[] | null
  publicada_en: string | null
  /** Públicas: las búsquedas guardadas con filtros de características (estacionamientos, amueblado, mascotas) las necesitan para contar igual que el listado. */
  extras?: unknown
  /** 28-oct-2026: SIN estas tres, una búsqueda guardada con subtipo (ya existía) o con «Más filtros» de multimedia contaba CERO en el panel y en los correos aunque el catálogo la
   *  mostrara (prueba: tests/portal-columnas-filtros.test.ts). `videos`/`planos` solo se usan para saber si hay alguno. */
  subtipo?: string | null
  videos?: unknown
  planos?: unknown
  created_at: string | null
}

export const COLUMNAS_PROPIEDAD_PORTAL =
  'id, titulo, tipo, subtipo, operacion, precio, precio_incluye_iva, moneda, ubicacion, colonia, ciudad, metros, recamaras, banos, altura_libre, andenes, estatus, estado_pub, slug, fotos, videos, planos, publicada_en, created_at, extras'

export type PropiedadTarjeta = {
  id: string
  titulo: string
  tipo: string | null
  tipoEtiqueta: string | null
  ruta: string
  foto: string | null
  lugar: string | null
  precio: string | null
  /** Lo mismo que dice la web pública: «IVA inc.», «+ IVA», o nada si no hay precio. */
  iva: 'incluido' | 'mas' | null
  datos: string[]
  publicadaEn: string | null
}

const TIPO_SINGULAR: Record<string, string> = {
  casa: 'Casa',
  departamento: 'Departamento',
  depto: 'Departamento',
  terreno: 'Terreno',
  nave: 'Nave industrial',
  bodega: 'Bodega',
  local: 'Local comercial',
  comercial: 'Local comercial',
  oficina: 'Oficina',
  quinta: 'Quinta',
}

export function tipoEtiqueta(tipo: string | null | undefined): string | null {
  if (!tipo) return null
  return TIPO_SINGULAR[tipo] ?? tipo.charAt(0).toUpperCase() + tipo.slice(1)
}

const entero = (n: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(n)
const decimal = (n: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(n)

/** «$36,000/mes» en renta, «$4,200,000» en venta; «US$» si está en dólares. */
export function precioTarjeta(p: Pick<FilaPropiedadPortal, 'precio' | 'moneda' | 'operacion'>): string | null {
  if (typeof p.precio !== 'number' || !(p.precio > 0)) return null
  const signo = (p.moneda ?? 'MXN').toUpperCase() === 'USD' ? 'US$' : '$'
  return `${signo}${entero(p.precio)}${p.operacion === 'renta' ? '/mes' : ''}`
}

/** Hasta tres datos que importan para ese tipo de inmueble. */
export function datosTarjeta(p: FilaPropiedadPortal): string[] {
  const m2 = typeof p.metros === 'number' && p.metros > 0 ? `${formatoMetros(p.metros)} m²` : null
  const altura = typeof p.altura_libre === 'number' && p.altura_libre > 0 ? `${decimal(p.altura_libre)} m de altura` : null
  const andenes = typeof p.andenes === 'number' && p.andenes > 0 ? `${p.andenes} ${p.andenes === 1 ? 'andén' : 'andenes'}` : null
  const recamaras = typeof p.recamaras === 'number' && p.recamaras > 0 ? `${p.recamaras} ${p.recamaras === 1 ? 'recámara' : 'recámaras'}` : null
  const banos = typeof p.banos === 'number' && p.banos > 0 ? `${decimal(p.banos)} ${p.banos === 1 ? 'baño' : 'baños'}` : null
  const tipo = p.tipo ?? ''
  const orden = tipo === 'nave' || tipo === 'bodega'
    ? [m2, altura, andenes, banos]
    : tipo === 'casa' || tipo === 'departamento' || tipo === 'depto' || tipo === 'quinta'
      ? [m2, recamaras, banos]
      : [m2, banos, altura]
  return orden.filter((x): x is string => !!x).slice(0, 3)
}

export function lugarTarjeta(p: Pick<FilaPropiedadPortal, 'colonia' | 'ciudad' | 'ubicacion'>): string | null {
  const partes = [p.colonia, p.ciudad].filter((x): x is string => !!x && !!x.trim())
  return partes.length ? partes.join(', ') : p.ubicacion?.trim() || null
}

export function aTarjeta(p: FilaPropiedadPortal): PropiedadTarjeta {
  return {
    id: p.id,
    titulo: nombreDe(p),
    tipo: p.tipo,
    tipoEtiqueta: tipoEtiqueta(p.tipo),
    ruta: rutaDe(p),
    foto: miniaturaCloudinary(p.fotos?.[0] ?? null, { lado: 480 }),
    lugar: lugarTarjeta(p),
    precio: precioTarjeta(p),
    iva: p.precio && p.precio > 0 ? (p.precio_incluye_iva ? 'incluido' : 'mas') : null,
    datos: datosTarjeta(p),
    publicadaEn: p.publicada_en,
  }
}
