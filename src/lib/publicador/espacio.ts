/**
 * Dónde vive el trabajo con propiedades de cada rol (R8.3).
 *
 * Una sola regla, para que ningún enlace mande a nadie a «otro panel»:
 *   · Admin trabaja en su panel: la lista eficiente es `/admin/propiedades` y la cola, `/admin/propiedades/pendientes`.
 *   · Publicador y asociado trabajan en su portal (`/publicador/*` se pinta DENTRO del marco del portal).
 * El rol sólo decide qué se pinta; quién puede ver o tocar cada propiedad lo decide el servidor en cada petición.
 */

import { ofreceAccesoEnRevision } from '@/lib/acceso/capacidades'

export type RolDePropiedades = 'cliente' | 'publicador' | 'admin' | null | undefined

export const ETIQUETAS_PROPIEDADES = {
  mis: 'Mis propiedades',
  nueva: 'Nueva propiedad',
  enRevision: 'En revisión', // publicador NO asociado: sus propiedades enviadas a revisión
  revisar: 'Revisar', // admin: la cola de pendientes
} as const

export const RUTA_LISTA_ADMIN = '/admin/propiedades'
export const RUTA_COLA_ADMIN = '/admin/propiedades/pendientes'
export const RUTA_LISTA_PUBLICADOR = '/portal/mis-propiedades'
// «Nueva propiedad» NO es otra pantalla: abre el formulario EN LÍNEA dentro de la lista del propio rol (`?nueva=1` solo lo abre).
export const RUTA_NUEVA_ADMIN = '/admin/propiedades?nueva=1'
export const RUTA_NUEVA_PUBLICADOR = '/portal/mis-propiedades?nueva=1'
export const RUTA_EN_REVISION = '/portal/mis-propiedades?estado=en_revision'

/** A dónde vuelve «mis propiedades» según el rol (la lista densa para Admin, la del portal para los demás). */
export function rutaListaDePropiedades(rol: RolDePropiedades): string {
  return rol === 'admin' ? RUTA_LISTA_ADMIN : RUTA_LISTA_PUBLICADOR
}

/**
 * «En revisión» como acceso separado: sólo el publicador que NO es asociado (regla confirmada, ver `capacidades.ts`).
 * Presentación, no permiso: el servidor sólo entrega las propiedades de la cuenta y decide cada transición.
 */
export function ofreceEnRevision(p: { rol?: RolDePropiedades; tipoPublicador?: string | null }): boolean {
  return p.rol === 'publicador' && ofreceAccesoEnRevision(p.tipoPublicador)
}

/** Filtro de la lista del publicador (`?estado=`): sólo los estados conocidos; cualquier otra cosa = sin filtro. */
export function estadoDeFiltro(valor: string | null | undefined): 'en_revision' | null {
  return valor === 'en_revision' ? 'en_revision' : null
}

/** El asistente de una propiedad: el MISMO editor para todos, pero con la ruta del panel del rol (Admin nunca sale de /admin). */
export function rutaDeEditorDe(id: string, rol?: RolDePropiedades): string {
  const i = encodeURIComponent(id)
  return rol === 'admin' ? `/admin/propiedades/${i}/editar` : `/portal/mis-propiedades/${i}/editar`
}

/**
 * La interfaz ANTIGUA `/publicador…` ya no es un espacio de trabajo: lo que quede de enlaces viejos (correos, favoritos,
 * el historial) se lleva a la ruta canónica del rol, sin añadir una entrada al historial (`replace`).
 * `busqueda` conserva `?nueva=1` y `?estado=`. `/publicador/citas` no es de propiedades: para el publicador se queda donde está; para ADMINISTRACIÓN (cuyas citas personales y las del equipo viven en un solo calendario) se lleva a su calendario del equipo, conservando `?cita=`.
 */
export function destinoCanonico(ruta: string, esAdmin: boolean, busqueda = '', puedePublicar = true): string | null {
  const q = busqueda && busqueda !== '?' ? (busqueda.startsWith('?') ? busqueda : `?${busqueda}`) : ''
  // Quien no publica (cliente) NO se convierte en publicador: un enlace viejo lo deja en su portal.
  if (!puedePublicar && !esAdmin && (ruta === '/publicador' || /^\/publicador\/propiedades\/[^/]+\/editar$/.test(ruta))) return '/portal'
  // Administración ve sus citas personales y las del equipo en UN solo lugar: el calendario del equipo (conserva `?cita=`).
  if (esAdmin && ruta === '/publicador/citas') return `/admin/citas${new URLSearchParams(q).get('cita') ? `?cita=${encodeURIComponent(new URLSearchParams(q).get('cita') as string)}` : ''}`
  if (ruta === '/publicador') return (esAdmin ? RUTA_LISTA_ADMIN : RUTA_LISTA_PUBLICADOR) + (esAdmin ? q.replace(/estado=[^&]*&?/, '') : q)
  const m = /^\/publicador\/propiedades\/([^/]+)\/editar$/.exec(ruta)
  if (!m) return null
  return (esAdmin ? `/admin/propiedades/${m[1]}/editar` : `/portal/mis-propiedades/${m[1]}/editar`) + q
}

/**
 * «Nueva propiedad» NO navega: abre una VENTANA sobre la pantalla en la que ya estás (R8.5). Cualquier botón del panel
 * (barra lateral, encabezado de la lista) avisa con este evento y el diálogo montado en el marco del rol (portal o administración)
 * lo abre. Así ninguna acción de la barra cambia de ruta ni de panel; el editor se abre después, ya con el borrador creado.
 */
export const EVENTO_NUEVA_PROPIEDAD = 'vb:nueva-propiedad'
// Instante de la última petición sin atender (0 = ninguna). Caduca a los 5 s: una petición vieja no puede abrir la ventana más tarde, en otra pantalla.
let nuevaPendienteEn = 0
export function abrirNuevaPropiedad(): void {
  if (typeof window === 'undefined') return
  nuevaPendienteEn = Date.now() // si la ventana aún no se montó (p. ej. `?nueva=1` al cargar), la recoge al montarse
  window.dispatchEvent(new Event(EVENTO_NUEVA_PROPIEDAD))
}
/** La ventana llama a esto al abrirse o al montarse: devuelve si había una petición sin atender y la limpia. */
export function consumirNuevaPendiente(): boolean {
  const hay = nuevaPendienteEn > 0 && Date.now() - nuevaPendienteEn < 5000
  nuevaPendienteEn = 0
  return hay
}
