import { z } from 'zod'

/**
 * Esquema de una propiedad, por pasos.
 *
 * Un solo sitio donde vive la forma del formulario. Antes se validaba a mano y
 * en dos lados —el navegador y la ruta de API— que podían discrepar sin que
 * nadie se enterara. Aquí el tipo de TypeScript sale del esquema (`z.infer`),
 * así que si cambia la regla, el tipo cambia con ella y el compilador avisa.
 *
 * La idea viene de `63r6o/shadcn-nextjs-multistep-form-example`; su persistencia
 * en localStorage se descartó a propósito, porque pierde el borrador al cambiar
 * de dispositivo y revienta al prerenderizar. Ver
 * [[Registro de repositorios de referencia]].
 */

/* ── Vocabulario ───────────────────────────────────────────────── */

export const OPERACIONES = ['venta', 'renta', 'temporada'] as const
export type Operacion = (typeof OPERACIONES)[number]

export const ETIQUETA_OPERACION: Record<Operacion, string> = {
  venta: 'Venta',
  renta: 'Renta',
  temporada: 'Temporada',
}

/**
 * Tipos de inmueble.
 *
 * Inmuebles24 lista dieciocho, incluidos «Terreno de playa» y «Huerta». En León
 * eso obliga a leer dieciocho renglones para encontrar «Casa». Esta lista es la
 * de lo que de verdad se opera aquí, y crece cuando aparezca la demanda.
 */
export const TIPOS = [
  'casa',
  'departamento',
  'terreno',
  'nave',
  'bodega',
  'local',
  'oficina',
  'edificio',
  'rancho',
] as const
export type Tipo = (typeof TIPOS)[number]

export const ETIQUETA_TIPO: Record<Tipo, string> = {
  casa: 'Casa',
  departamento: 'Departamento',
  terreno: 'Terreno o lote',
  nave: 'Nave industrial',
  bodega: 'Bodega',
  local: 'Local comercial',
  oficina: 'Oficina',
  edificio: 'Edificio',
  rancho: 'Rancho o quinta',
}

/** Subtipos por tipo. Vacío = ese tipo no pide subtipo. */
export const SUBTIPOS: Record<Tipo, { valor: string; etiqueta: string }[]> = {
  casa: [
    { valor: 'sola', etiqueta: 'Casa sola' },
    { valor: 'condominio', etiqueta: 'Casa en condominio' },
    { valor: 'duplex', etiqueta: 'Dúplex' },
    { valor: 'uso_suelo', etiqueta: 'Casa con uso de suelo' },
  ],
  terreno: [
    { valor: 'residencial', etiqueta: 'Terreno residencial' },
    { valor: 'comercial', etiqueta: 'Terreno comercial' },
    { valor: 'industrial', etiqueta: 'Terreno industrial' },
    { valor: 'campestre', etiqueta: 'Terreno campestre' },
  ],
  departamento: [],
  nave: [],
  bodega: [],
  local: [
    { valor: 'calle', etiqueta: 'Local a pie de calle' },
    { valor: 'plaza', etiqueta: 'Local en plaza comercial' },
  ],
  oficina: [],
  edificio: [],
  rancho: [],
}

export const ANTIGUEDADES = ['a_estrenar', 'anos', 'en_construccion'] as const
export const PRECISIONES = ['exacta', 'aproximada'] as const

/* ── Reglas que se repiten ─────────────────────────────────────── */

/** Un texto opcional: vacío cuenta como «no lo puso», no como error. */
const textoOpcional = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(''))

/**
 * Un número que llega del formulario como cadena.
 * `''` es «vacío», no `0` — un precio de 0 y un precio sin poner no son lo mismo.
 */
const numeroOpcional = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === '' || v === null) return undefined
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : undefined
  })

/* ── Paso 1.a · Operación y tipo ───────────────────────────────── */

export const esquemaTipo = z.object({
  operacion: z.enum(OPERACIONES, { message: 'Elige si vendes o rentas.' }),
  tipo: z.enum(TIPOS, { message: 'Elige qué tipo de inmueble es.' }),
  subtipo: textoOpcional(60),
})

/* ── Paso 1.b · Ubicación ──────────────────────────────────────── */

export const esquemaUbicacion = z.object({
  calle: z.string().trim().min(3, 'Escribe al menos la calle.').max(200),
  colonia: textoOpcional(120),
  ciudad: z.string().trim().min(2).max(120).default('León'),
  estado: z.string().trim().min(2).max(120).default('Guanajuato'),
  cp: textoOpcional(10),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  // Quien vende no siempre quiere publicar su dirección. Se le deja elegir,
  // y en la interfaz se le dice el precio: aproximada no sale en el mapa.
  precision: z.enum(PRECISIONES).default('exacta'),
})

/* ── Paso 1.c · Características y precio ───────────────────────── */

export const MINIMO_DESCRIPCION = 150

export const esquemaCaracteristicas = z.object({
  recamaras: numeroOpcional,
  banos: numeroOpcional,
  medio_bano: numeroOpcional,
  estacionamientos: numeroOpcional,
  m_construidos: numeroOpcional,
  m_terreno: numeroOpcional,
  antiguedad: z.enum(ANTIGUEDADES).optional(),
  anos_antiguedad: numeroOpcional,

  precio: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((n) => Number.isFinite(n) && n > 0, 'Pon un precio mayor que cero.'),
  mantenimiento: numeroOpcional,
  sin_mantenimiento: z.boolean().default(false),

  titulo: z
    .string()
    .trim()
    .min(10, 'El título necesita al menos 10 caracteres.')
    .max(140, 'El título no puede pasar de 140 caracteres.'),

  // 150 caracteres es el mínimo de Inmuebles24 y tiene sentido: una descripción
  // de dos líneas no vende nada, y quien la escribe así no sabe que se está
  // perjudicando. Se avisa mientras escribe, no se le bloquea el teclado.
  descripcion: z
    .string()
    .trim()
    .min(MINIMO_DESCRIPCION, `Escribe un mínimo de ${MINIMO_DESCRIPCION} caracteres.`)
    .max(5000),
})

/* ── Paso 2 · Multimedia ───────────────────────────────────────── */

export const MINIMO_FOTOS = 5
export const MAXIMO_FOTOS = 50
/** Cloudinary aguanta más, pero subir 20 MB desde un teléfono en León no. */
export const MAXIMO_BYTES_FOTO = 5 * 1024 * 1024
export const FORMATOS_FOTO = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export const esquemaMultimedia = z.object({
  fotos: z
    .array(z.object({ url: z.string().url(), pie: textoOpcional(140) }))
    .min(MINIMO_FOTOS, `Sube al menos ${MINIMO_FOTOS} fotos.`)
    .max(MAXIMO_FOTOS),
  videos: z.array(z.string().url()).max(10).default([]),
  planos: z.array(z.string().url()).max(20).default([]),
})

/* ── Paso 3 · Extras ───────────────────────────────────────────── */

export const esquemaExtras = z.object({
  amenidades: z.array(z.string()).default([]),
  // Lo que sólo aplica a un tipo. Una columna por cada campo dejaría una tabla
  // con cincuenta columnas nulas: «tipo de riego» sólo existe en terrenos.
  extras: z.record(z.string(), z.unknown()).default({}),
})

/* ── Todo junto ────────────────────────────────────────────────── */

export const esquemaPropiedad = esquemaTipo
  .merge(esquemaUbicacion)
  .merge(esquemaCaracteristicas)
  .merge(esquemaMultimedia)
  .merge(esquemaExtras)

export type DatosTipo = z.infer<typeof esquemaTipo>
export type DatosUbicacion = z.infer<typeof esquemaUbicacion>
export type DatosCaracteristicas = z.infer<typeof esquemaCaracteristicas>
export type DatosMultimedia = z.infer<typeof esquemaMultimedia>
export type DatosPropiedad = z.infer<typeof esquemaPropiedad>

/* ── Los pasos, en orden ───────────────────────────────────────── */

export const PASOS = [
  { clave: 'tipo', grupo: 'Principales', titulo: 'Operación y tipo', esquema: esquemaTipo },
  { clave: 'ubicacion', grupo: 'Principales', titulo: 'Ubicación', esquema: esquemaUbicacion },
  { clave: 'caracteristicas', grupo: 'Principales', titulo: 'Características', esquema: esquemaCaracteristicas },
  { clave: 'multimedia', grupo: 'Multimedia', titulo: 'Fotos y videos', esquema: esquemaMultimedia },
  { clave: 'extras', grupo: 'Extras', titulo: 'Comodidades', esquema: esquemaExtras },
  { clave: 'publicar', grupo: 'Publicar', titulo: 'Revisar y enviar', esquema: null },
] as const

export type ClavePaso = (typeof PASOS)[number]['clave']

/** Los cuatro grupos de la barra superior, en orden y sin repetir. */
export const GRUPOS = ['Principales', 'Multimedia', 'Extras', 'Publicar'] as const

/**
 * Valida un paso concreto contra los datos que haya.
 *
 * Devuelve los errores por campo, en el idioma del usuario. Sólo mira el paso
 * pedido: disparar los errores de los pasos siguientes mientras alguien está en
 * el primero es la forma más rápida de que abandone.
 */
export function validarPaso(
  clave: ClavePaso,
  datos: Record<string, unknown>,
): { ok: true } | { ok: false; errores: Record<string, string> } {
  const paso = PASOS.find((p) => p.clave === clave)
  if (!paso?.esquema) return { ok: true }

  const r = paso.esquema.safeParse(datos)
  if (r.success) return { ok: true }

  const errores: Record<string, string> = {}
  for (const issue of r.error.issues) {
    const campo = String(issue.path[0] ?? '')
    if (campo && !errores[campo]) errores[campo] = issue.message
  }
  return { ok: false, errores }
}
