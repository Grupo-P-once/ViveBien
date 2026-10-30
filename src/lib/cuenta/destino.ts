/**
 * A dónde lleva `/mi-cuenta` según quién entra (03.08).
 *
 * ─────────────────────────────────────────────────────────────
 * UNA PANTALLA POR ROL, CADA UNA EN SU SITIO
 *
 * `/mi-cuenta` era un asistente por pasos con una sola distinción,
 * `rol === 'publicador'`. Todo lo demás —incluidos **admin y super admin**—
 * caía en la rama del cliente y acababa contestando «¿Compras o rentas?»,
 * «Zonas que te interesan» y «Presupuesto máximo». Quien administra el sitio
 * no está buscando casa.
 *
 * Ahora `/mi-cuenta` no pinta nada por su cuenta para cliente ni para
 * personal: reparte. Cada rol va a la pantalla que ya existe en su propia
 * carcasa, que es donde está su sesión y su marco visual.
 *
 *   cliente     → /portal/perfil        (PerfilPortal, hecho en 3b-2)
 *   publicador  → se queda en /mi-cuenta (su asistente ES su pantalla)
 *   admin       → /admin/cuenta          (datos + cuenta y seguridad)
 *   super admin → /admin/cuenta          (lo mismo: NO es un rol aparte)
 *
 * Código puro: sin React y sin DOM, para que cada caso se pruebe de verdad.
 * ─────────────────────────────────────────────────────────────
 */

/** Dónde vive la pantalla de cada quien. */
export const PERFIL_DEL_CLIENTE = '/portal/perfil'
export const CUENTA_DEL_PANEL = '/admin/cuenta'
export const ASISTENTE_DEL_PUBLICADOR = '/mi-cuenta'

export type Reparto =
  /** Hay que navegar a otra ruta. */
  | { tipo: 'ir'; a: string }
  /** Se queda aquí: el asistente del publicador es su pantalla. */
  | { tipo: 'quedarse' }
  /** Todavía no sabemos quién es. */
  | { tipo: 'esperar' }
  /** El servidor dijo un rol que no reconocemos. Ni cliente ni personal. */
  | { tipo: 'desconocido' }

/**
 * El reparto de `/mi-cuenta`.
 *
 * `rol` llega de `/api/usuarios/me`. Mientras no haya llegado es `undefined` y
 * **no se decide nada**: mandar a alguien a la pantalla equivocada y corregir
 * después es peor que esperar un instante.
 *
 * Un rol que no reconocemos **no se parece a ninguno**: ni se le trata como
 * cliente (así fue como admin acabó respondiendo «¿Compras o rentas?») ni como
 * personal (enseñarle la cuenta del panel sugiere un acceso que no tiene, y el
 * servidor le va a responder 403 de todas formas). Se le dice lo que pasa.
 */
export function repartoDeMiCuenta(rol: string | null | undefined): Reparto {
  if (!rol) return { tipo: 'esperar' }
  if (rol === 'publicador') return { tipo: 'quedarse' }
  if (rol === 'cliente') return { tipo: 'ir', a: PERFIL_DEL_CLIENTE }
  if (rol === 'admin') return { tipo: 'ir', a: CUENTA_DEL_PANEL }
  return { tipo: 'desconocido' }
}

/**
 * A dónde apunta un enlace de «Mi perfil» desde una pantalla que YA sabe el
 * rol. Evita el rebote por `/mi-cuenta` sin inventar un segundo enrutador:
 * son las mismas reglas de `repartoDeMiCuenta`, leídas al revés.
 */
export function enlaceDePerfil(rol: string | null | undefined): string {
  const r = repartoDeMiCuenta(rol)
  return r.tipo === 'ir' ? r.a : ASISTENTE_DEL_PUBLICADOR
}

/**
 * A dónde se sale al terminar.
 *
 * El asistente mandaba a `/dashboard` a todo el que no fuera publicador, así
 * que un administrador terminaba en el panel **viejo**.
 */
export function salidaTrasEditar(rol: string | null | undefined): string {
  if (rol === 'publicador') return '/portal/mis-propiedades'
  if (rol === 'admin') return '/admin'
  // Cliente y cualquier otro caso: el portal. Nunca el panel viejo, y nunca el
  // panel de administración a alguien cuyo rol no entendemos.
  return '/portal'
}

/** ¿Es personal de VIVE BIEN? Admin y super admin comparten alcance. */
export function esPersonal(rol: string | null | undefined): boolean {
  return rol === 'admin'
}
