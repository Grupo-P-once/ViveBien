import { redondear2 } from './medidas'
import { MAXIMO_FOTOS, OPERACIONES, PRECISIONES, SUBTIPOS, TIPOS, type Tipo } from './esquemas/propiedad'
import { CLAVE_EXTRAS, conCaracteristicas, leerCaracteristicas, podarCaracteristicas, tipoBase, validarCaracteristicas } from './caracteristicas'
import { MAXIMO_PLANOS, MAXIMO_VIDEOS, idYoutube, urlYoutube } from './multimedia'
import { normalizarNube } from './medios/nube'

/**
 * Lo que el SERVIDOR acepta del contenido de una propiedad.
 *
 * ─────────────────────────────────────────────────────────────
 * EL HUECO QUE CIERRA
 *
 * La validación completa (zod) vivía sólo en el navegador. El servidor protegía con una LISTA NEGRA (`CAMPOS_RESERVADOS`): lo que
 * no estaba prohibido, pasaba tal cual y sin mirar el valor. Un `PATCH` a mano podía:
 *   · escribir cualquier columna que algún día se añada (una lista negra falla ABIERTA);
 *   · poner `tipo: 'cualquier cosa'`, un precio negativo o un `extras` de megabytes;
 *   · meter como «fotos» cualquier cadena (o la URL de otro sitio): cuentan para el mínimo de 5 y, con `publicar_sin_revision`,
 *     el anuncio se publica sin que nadie lo vea.
 *
 * Ahora: LISTA BLANCA de columnas de contenido, valor validado por campo y los medios de un publicador sólo pueden venir de
 * NUESTRA cuenta de Cloudinary (o de YouTube, en videos) o ser los que la propiedad ya tenía. Un administrador conserva su
 * libertad de origen, pero no la de escribir valores sin sentido.
 * ─────────────────────────────────────────────────────────────
 */

/** Columnas de CONTENIDO: las que escribe el asistente de publicación. Todo lo demás (dueño, estado, folio, slug, contadores…) es del servidor. */
export const CAMPOS_DE_CONTENIDO = [
  'titulo', 'descripcion', 'tipo', 'subtipo', 'operacion',
  'precio', 'moneda', 'precio_incluye_iva', 'mantenimiento',
  'ubicacion', 'calle', 'colonia', 'ciudad', 'estado_dir', 'cp', 'lat', 'lng', 'precision_ubicacion',
  'metros', 'recamaras', 'banos', 'altura_libre', 'andenes',
  'fotos', 'videos', 'planos', 'amenidades', 'extras',
] as const

/** Columnas que SÓLO escribe quien modera. */
export const CAMPOS_SOLO_MODERADOR = ['estatus', 'gestion'] as const

const TEXTOS: Record<string, number> = {
  titulo: 200, descripcion: 5000, ubicacion: 300, calle: 200, colonia: 120, ciudad: 120, estado_dir: 120, cp: 12, subtipo: 80,
}
const NUMEROS: Record<string, [number, number]> = {
  precio: [0, 1e11], mantenimiento: [0, 1e9], metros: [0, 1e8], banos: [0, 1000], altura_libre: [0, 1000], lat: [-90, 90], lng: [-180, 180],
}
const ENTEROS: Record<string, [number, number]> = { recamaras: [0, 1000], andenes: [0, 10000] }
const MAXIMO_EXTRAS = 20_000

/**
 * Tipos que el servidor acepta al ESCRIBIR: los del esquema (`TIPOS`) más `comercial`.
 *
 * E-48 (16-oct-2026): el editor del publicador y todo el sitio público (catálogo, portada, mosaico, valuador) llaman `comercial` a «Local
 * comercial», pero `TIPOS` trae `local`. Con sólo `TIPOS`, crear un anuncio y elegir «Local comercial» daba 400 «valor no permitido»
 * (editar uno que ya era `comercial` sí pasaba). Se conserva `comercial` TAL CUAL —no se convierte a `local`— porque el catálogo filtra por ese valor.
 * Unificar `comercial`/`local` (y `depto`/`departamento`) es una decisión aparte; hasta entonces un valor inventado se sigue rechazando.
 */
const TIPOS_ACEPTADOS: readonly string[] = [...TIPOS, 'comercial']

/** Nombre legible de cada campo para los mensajes de error (el publicador lee «Precio», no `precio`). */
const ETIQUETAS: Record<string, string> = {
  titulo: 'Título', descripcion: 'Descripción', tipo: 'Tipo de inmueble', subtipo: 'Subtipo', operacion: 'Operación', precio: 'Precio',
  moneda: 'Moneda', precio_incluye_iva: 'IVA incluido', mantenimiento: 'Mantenimiento', ubicacion: 'Ubicación', calle: 'Calle',
  colonia: 'Colonia', ciudad: 'Ciudad', estado_dir: 'Estado', cp: 'Código postal', lat: 'Latitud', lng: 'Longitud',
  precision_ubicacion: 'Precisión de la ubicación', metros: 'Superficie', recamaras: 'Recámaras', banos: 'Baños', altura_libre: 'Altura libre',
  andenes: 'Andenes', fotos: 'Fotos', videos: 'Videos', planos: 'Planos', amenidades: 'Amenidades', extras: 'Datos adicionales', gestion: 'Gestión',
}
const conEtiqueta = (e: string) => {
  const i = e.indexOf(':')
  return i > 0 ? `${ETIQUETAS[e.slice(0, i)] ?? e.slice(0, i)}${e.slice(i)}` : e
}

export type ResultadoSaneo = {
  /** Lo que sí se puede guardar, ya normalizado (números como número, vacío como null). */
  datos: Record<string, unknown>
  /** Claves recibidas que NO son contenido que esta cuenta pueda escribir (se ignoran). */
  descartados: string[]
  /** Valores no válidos: si hay alguno, no se guarda nada. */
  errores: string[]
}

const vacio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** ¿Es una URL de nuestra cuenta de Cloudinary? `https://res.cloudinary.com/<nube>/…` */
export function esUrlDeNuestraNube(url: string, nubeSinNormalizar: string | null | undefined): boolean {
  // La MISMA normalización que usa el firmador (`credencialesCloudinary`): un salto de línea o un espacio en la variable
  // no puede dejar subir una foto y rechazar luego su URL (E-48).
  const nube = normalizarNube(nubeSinNormalizar)
  if (!nube) return false
  try {
    const u = new URL(url)
    // Sin credenciales ni puerto, y sólo entregas de lo SUBIDO a nuestra cuenta (`/<nube>/image|raw|video/upload/…`): nunca `/fetch/…`
    // (que sirve contenido remoto a través de Cloudinary) ni otras formas de entrega.
    return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && !u.username && !u.password && !u.port
      && u.pathname.startsWith(`/${nube}/`) && /^\/[^/]+\/(image|raw|video)\/upload\//.test(u.pathname)
  } catch {
    return false
  }
}

function esHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

export function sanearContenido(
  entrada: Record<string, unknown>,
  o: {
    /** Quien modera (admin / super admin) puede escribir `estatus` y `gestion` y poner medios de cualquier https. */
    moderador: boolean
    /** La propiedad tal como está guardada (en una edición): lo que YA tenía sigue siendo válido aunque no cumpla las reglas nuevas. */
    actuales?: Record<string, unknown> | null
    /** Nombre de nuestra cuenta de Cloudinary (`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`). */
    nube?: string | null
  },
): ResultadoSaneo {
  const datos: Record<string, unknown> = {}
  const descartados: string[] = []
  const errores: string[] = []
  const permitidos = new Set<string>([...CAMPOS_DE_CONTENIDO, ...(o.moderador ? CAMPOS_SOLO_MODERADOR : [])])
  const ya = (campo: string): unknown[] => (Array.isArray(o.actuales?.[campo]) ? (o.actuales![campo] as unknown[]) : [])
  let hayExtras = false
  let extrasEntrada: unknown

  for (const [campo, v] of Object.entries(entrada)) {
    if (!permitidos.has(campo)) { descartados.push(campo); continue }

    // — textos —
    if (campo in TEXTOS) {
      if (vacio(v)) { datos[campo] = null; continue }
      if (typeof v !== 'string' || v.length > TEXTOS[campo] * 2 || v.trim().length > TEXTOS[campo]) { errores.push(`${campo}: texto no válido (máximo ${TEXTOS[campo]} caracteres)`); continue }
      datos[campo] = v
      continue
    }
    // — conjuntos cerrados —
    if (campo === 'tipo' || campo === 'operacion' || campo === 'precision_ubicacion' || campo === 'moneda') {
      const validos: readonly string[] = campo === 'tipo' ? TIPOS_ACEPTADOS : campo === 'operacion' ? OPERACIONES : campo === 'precision_ubicacion' ? PRECISIONES : ['MXN', 'USD']
      if (vacio(v) && campo !== 'precision_ubicacion' && campo !== 'moneda') { datos[campo] = null; continue }
      // lo que la propiedad ya tenía (datos viejos) sigue valiendo si no se toca
      if (typeof v === 'string' && (validos.includes(v) || o.actuales?.[campo] === v)) { datos[campo] = v; continue }
      errores.push(`${campo}: valor no permitido`)
      continue
    }
    // — números —
    if (campo in NUMEROS || campo in ENTEROS) {
      if (vacio(v)) { datos[campo] = null; continue }
      const [min, max] = NUMEROS[campo] ?? ENTEROS[campo]
      const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN
      if (!Number.isFinite(n) || n < min || n > max || (campo in ENTEROS && !Number.isInteger(n))) { errores.push(`${campo}: número fuera de rango`); continue }
      // La superficie admite hasta 2 decimales (140.50 m²); lo que venga con más se redondea aquí, no en cada pantalla.
      datos[campo] = campo === 'metros' ? redondear2(n) : n
      continue
    }
    if (campo === 'precio_incluye_iva') {
      if (typeof v !== 'boolean') { errores.push('precio_incluye_iva: debe ser verdadero o falso'); continue }
      datos[campo] = v
      continue
    }
    // — listas de medios —
    if (campo === 'fotos' || campo === 'planos' || campo === 'videos') {
      if (vacio(v)) { datos[campo] = []; continue }
      const tope = campo === 'fotos' ? MAXIMO_FOTOS : campo === 'planos' ? MAXIMO_PLANOS : MAXIMO_VIDEOS
      if (!Array.isArray(v) || v.length > tope) { errores.push(`${campo}: lista no válida (máximo ${tope})`); continue }
      const previas = new Set(ya(campo))
      let ok = true
      for (const url of v) {
        if (typeof url !== 'string' || url.length > 600 || !esHttps(url)) { ok = false; break }
        if (o.moderador || previas.has(url)) continue
        const permitida = campo === 'videos' ? (() => { const id = idYoutube(url); return !!id && urlYoutube(id) === url })() : esUrlDeNuestraNube(url, o.nube)
        if (!permitida) { ok = false; break }
      }
      if (!ok) { errores.push(`${campo}: ${campo === 'videos' ? 'sólo enlaces de YouTube' : 'sólo imágenes subidas desde el asistente'}`); continue }
      datos[campo] = Array.from(new Set(v as string[]))
      continue
    }
    if (campo === 'amenidades') {
      if (vacio(v)) { datos[campo] = []; continue }
      if (!Array.isArray(v) || v.length > 80 || v.some((x) => typeof x !== 'string' || x.length > 80)) { errores.push('amenidades: lista no válida'); continue }
      datos[campo] = v
      continue
    }
    if (campo === 'extras') {
      // Se resuelve DESPUÉS del bucle: lo que aplica depende del tipo y la operación finales del anuncio.
      hayExtras = true
      extrasEntrada = v
      continue
    }
    // — sólo moderador: `estatus` lo valida su propia regla (esEstatusComercial); `gestion` es un marcador cerrado —
    if (campo === 'estatus') { datos[campo] = v; continue }
    if (campo === 'gestion') {
      if (v !== null && v !== 'requiere_gestion') { errores.push('gestion: valor no permitido'); continue }
      datos[campo] = v
      continue
    }
  }

  // Tipo y operación EFECTIVOS: lo que llega en esta petición, o si no lo que ya tenía el anuncio.
  const tipoEfectivo = 'tipo' in datos ? datos.tipo : o.actuales?.tipo
  const operacionEfectiva = 'operacion' in datos ? datos.operacion : o.actuales?.operacion

  // — subtipo: sólo uno de los que ofrece ese tipo (o el que ya tenía) —
  if (typeof datos.subtipo === 'string') {
    const lista = SUBTIPOS[tipoBase(tipoEfectivo) as Tipo]
    if (lista && lista.length > 0 && !lista.some((s) => s.valor === datos.subtipo) && o.actuales?.subtipo !== datos.subtipo) {
      errores.push('subtipo: valor no permitido para este tipo de inmueble')
    }
  }

  // — extras: sólo el espacio `caracteristicas` (lista blanca por tipo/operación); lo demás que ya hubiera se conserva intacto —
  const extrasActuales: Record<string, unknown> =
    o.actuales?.extras && typeof o.actuales.extras === 'object' && !Array.isArray(o.actuales.extras) ? (o.actuales.extras as Record<string, unknown>) : {}
  if (hayExtras) {
    if (vacio(extrasEntrada)) {
      datos.extras = conCaracteristicas(extrasActuales, null)
    } else if (typeof extrasEntrada !== 'object' || Array.isArray(extrasEntrada)) {
      errores.push('extras: objeto no válido')
    } else {
      const erroresAntes = errores.length
      const entrada = extrasEntrada as Record<string, unknown>
      for (const k of Object.keys(entrada)) {
        if (k === CLAVE_EXTRAS) continue
        // Una clave que ya estaba y no se tocó es historia y se respeta; una nueva no se acepta del cliente.
        if (!(k in extrasActuales) || JSON.stringify(extrasActuales[k]) !== JSON.stringify(entrada[k])) errores.push(`extras: la clave «${k}» no está permitida`)
      }
      const r = validarCaracteristicas(entrada[CLAVE_EXTRAS], tipoEfectivo, operacionEfectiva)
      errores.push(...r.errores)
      if (errores.length === erroresAntes) datos.extras = conCaracteristicas(extrasActuales, r.valor)
    }
  } else if ('tipo' in datos || 'operacion' in datos) {
    // Cambió el tipo u operación sin tocar las características: lo que ya no aplica se quita; lo demás queda.
    const guardadas = leerCaracteristicas(extrasActuales)
    if (Object.keys(guardadas).length) {
      const podadas = podarCaracteristicas(guardadas, tipoEfectivo, operacionEfectiva)
      if (JSON.stringify(podadas) !== JSON.stringify(extrasActuales[CLAVE_EXTRAS] ?? {})) {
        datos.extras = conCaracteristicas(extrasActuales, Object.keys(podadas).length ? podadas : null)
      }
    }
  }
  if (datos.extras !== undefined && JSON.stringify(datos.extras).length > MAXIMO_EXTRAS) {
    errores.push('extras: demasiado grande')
    delete datos.extras
  }

  return { datos, descartados, errores: errores.map(conEtiqueta) }
}

/**
 * Los pies de foto que llegan en `pies` (URL → texto): un objeto plano de pocas entradas, claves https y textos cortos.
 * Antes iban a la base sin mirar su forma. `{ ok: true }` sin `pies` = no vinieron.
 */
export function sanearPies(v: unknown): { ok: true; pies?: Record<string, string> } | { ok: false } {
  if (v === undefined) return { ok: true }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false }
  const entradas = Object.entries(v as Record<string, unknown>)
  if (entradas.length > MAXIMO_FOTOS + 20) return { ok: false }
  const pies: Record<string, string> = {}
  for (const [url, texto] of entradas) {
    if (url.length > 600 || !esHttps(url) || typeof texto !== 'string' || texto.length > 400) return { ok: false }
    pies[url] = texto
  }
  return { ok: true, pies }
}

/** Campos de TEXTO LIBRE: pueden traer teléfonos, correos o nombres que escribió una persona. Nunca se vuelcan a la bitácora. */
const TEXTO_LIBRE = new Set(['titulo', 'descripcion', 'ubicacion', 'calle', 'colonia', 'ciudad', 'estado_dir', 'cp', 'subtipo'])
const COORDENADAS = new Set(['lat', 'lng'])

/**
 * Qué cambió (antes → después) para la bitácora, SIN datos personales: el texto libre se resume como longitud (`{ n }`), las
 * coordenadas (que pueden ser exactas aunque el anuncio muestre una zona aproximada) como «[coordenadas]», las listas como cantidad
 * y los objetos como «[objeto]». Lo demás (precio, tipo, operación, superficie, estatus…) es dato del anuncio y se guarda tal cual.
 */
export function diferenciasDeContenido(actuales: Record<string, unknown> | null | undefined, datos: Record<string, unknown>): { antes: Record<string, unknown>; despues: Record<string, unknown> } {
  const resumen = (campo: string, v: unknown): unknown => {
    if (v === null || v === undefined) return null
    if (COORDENADAS.has(campo)) return '[coordenadas]'
    if (TEXTO_LIBRE.has(campo)) return { n: typeof v === 'string' ? v.length : 0 }
    if (Array.isArray(v)) return { n: v.length }
    if (typeof v === 'object') return '[objeto]'
    if (typeof v === 'string') return v.length > 40 ? `[texto de ${v.length} caracteres]` : v   // un enumerado corto sí; un texto largo inesperado, no
    return v
  }
  const antes: Record<string, unknown> = {}
  const despues: Record<string, unknown> = {}
  for (const [k, nuevo] of Object.entries(datos)) {
    const previo = actuales?.[k]
    if (JSON.stringify(previo ?? null) === JSON.stringify(nuevo ?? null)) continue
    antes[k] = resumen(k, previo)
    despues[k] = resumen(k, nuevo)
  }
  return { antes, despues }
}
