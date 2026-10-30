/**
 * Qué pantalla toca al entrar en `/dashboard` (V-1.1.92).
 *
 * Código puro: sin React, sin red, sin base. La página sólo pinta lo que sale
 * de aquí, y cada caso se prueba de verdad.
 *
 * ─────────────────────────────────────────────────────────────
 * EL FALLO QUE ESTO ARREGLA
 *
 * `/dashboard` decidía con `const isAdmin = rol === 'admin'`, y `rol` empieza
 * en `null`. Pero `null` significaba **dos cosas a la vez**:
 *
 *   · «todavía no sé qué rol tiene» (los primeros 200-600 ms, mientras
 *     `/api/usuarios/me` viaja por la red), y
 *   · «ya lo sé y no es admin».
 *
 * Como `null !== 'admin'`, la página se metía por la puerta de «no es admin» y
 * **pintaba el portal antiguo entero** antes de saber a dónde iba esa persona.
 * Cuando llegaba la respuesta, `router.replace()` se la llevaba a `/portal` o a
 * `/admin`. Eso era el destello. Le pasaba también a los administradores.
 *
 * Por eso el resultado es un tipo con estados explícitos y `resolviendo` como
 * uno de ellos. **Ningún valor puede volver a significar «no sé» y «decidí»
 * al mismo tiempo**: ésa era la ambigüedad que produjo el fallo.
 * ─────────────────────────────────────────────────────────────
 */

/** Lo que `/api/usuarios/me` dice de quien ha entrado. */
export type PerfilDeEntrada = {
  rol?: unknown
  superAdmin?: unknown
  /** Si el portal está abierto PARA ESTA PERSONA. Lo calcula el servidor. */
  portal?: unknown
}

/**
 * Los tres estados del perfil, distintos a propósito:
 *
 * · `'cargando'`   — la petición sigue en el aire. **No se decide nada.**
 * · un perfil      — el servidor contestó.
 * · `'sin_perfil'` — la petición terminó y no hay perfil utilizable (403 de una
 *                    cuenta suspendida o eliminada, 503, red caída). Es un
 *                    estado **resuelto**: se deja a la persona en el panel
 *                    clásico en vez de dejarla mirando un spinner para siempre.
 */
export type EstadoDelPerfil = 'cargando' | 'sin_perfil' | PerfilDeEntrada

export type Pantalla =
  | { estado: 'resolviendo' }
  | { estado: 'acceso' }
  | { estado: 'redirigir'; destino: string }
  | { estado: 'clasico' }
  /** E-30: llegó con el enlace de una invitación para OTRO correo. No se consume ni se sigue como si nada. */
  | { estado: 'invitacion_otro_correo'; invitado: string; actual: string }

export type Entrada = {
  /** Firebase todavía no ha dicho si hay sesión. */
  authLoading: boolean
  hayUsuario: boolean
  perfil: EstadoDelPerfil
  /** `window.location.search`, para la escotilla `?clasico=1`. */
  busqueda: string
  /** Correo de la sesión (E-30): para comparar con el de la invitación del enlace. */
  correoSesion?: string | null
}

/**
 * E-30 — El enlace del correo de invitación lleva `?invitado=<correo>`. Si la sesión abierta es de OTRO correo, hay que
 * decirlo claramente (y no aceptar nada a escondidas). **Es solo ayuda de pantalla**: la invitación solo se aplica en el
 * servidor, con el correo VERIFICADO de la sesión, por igualdad exacta; aunque esta función no existiera, una sesión con
 * otro correo jamás la consumiría.
 */
export function invitacionDeOtroCorreo(busqueda: string, correoSesion: string | null | undefined): { invitado: string; actual: string } | null {
  const crudo = new URLSearchParams(busqueda).get('invitado')
  const invitado = (crudo ?? '').trim().toLowerCase()
  const actual = (correoSesion ?? '').trim().toLowerCase()
  if (!invitado || !actual || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(invitado)) return null
  return invitado === actual ? null : { invitado, actual }
}

/**
 * SESSION-SWITCH BUG (P1): `/entrar` manda a `/dashboard?siguiente=/portal/visitas` (ver `rutaTrasAutenticar`). Ese destino
 * previo SÓLO se respeta si cae dentro del área que corresponde al rol que dijo el SERVIDOR (`base`): un administrador
 * con `siguiente=/portal/visitas` va a `/admin`, nunca al portal; un cliente con `siguiente=/admin/usuarios`, a `/portal`.
 */
function conSubruta(base: '/portal' | '/admin', busqueda: string): string {
  const s = new URLSearchParams(busqueda).get('siguiente')
  if (!s || !s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\') || /[\u0000-\u001f\u007f\s]/.test(s)) return base
  const m = /^(\/[a-z]+)(?=[/?#]|$)/i.exec(s)
  // Ni «\» ni segmentos «.» / «..»: no se sale del área del rol.
  if (s.includes('\\') || /%(25|2e|2f|5c)/i.test(s) || /(^|\/)\.\.?(\/|\?|#|$)/.test(s)) return base
  return m && m[1].toLowerCase() === base && s.toLowerCase() !== base ? s : base
}

/** ¿Pidieron explícitamente el panel de siempre? */
export function modoClasico(busqueda: string): boolean {
  return new URLSearchParams(busqueda).has('clasico')
}

/**
 * Un administrador llega con rol efectivo `'admin'`; el Super Admin, además,
 * con `superAdmin: true`.
 *
 * `rol: 'super_admin'` NO cuenta a propósito, aunque sea lo que guarda la tabla:
 * `/api/usuarios/me` nunca lo emite —`resolverPerfil` lo traduce a
 * `'admin' + superAdmin`—, así que recibirlo significaría que algo no es lo que
 * dice ser. Inferir permisos de una forma que la API no produce es justo lo que
 * no se hace aquí. De todos modos esto sólo elige a dónde navegar: quien
 * autoriza es el servidor, en cada ruta.
 */
export function esAdministracion(p: PerfilDeEntrada): boolean {
  return p.rol === 'admin' || p.superAdmin === true
}

/**
 * La decisión. El orden importa:
 *
 *   1. sin saber si hay sesión  → resolviendo
 *   2. sin sesión               → acceso
 *   3. `?clasico=1`             → clásico (escotilla explícita, no hace falta perfil)
 *   4. perfil sin resolver      → resolviendo   ← **aquí estaba el fallo**
 *   5. administración           → /admin
 *   6. portal abierto           → /portal
 *   7. resto                    → clásico
 */
export function pantallaDeDashboard(e: Entrada): Pantalla {
  if (e.authLoading) return { estado: 'resolviendo' }
  if (!e.hayUsuario) return { estado: 'acceso' }

  // Sesión de otro correo + enlace de una invitación: se dice, antes que cualquier otra cosa. No se redirige.
  const otro = invitacionDeOtroCorreo(e.busqueda, e.correoSesion)
  if (otro) return { estado: 'invitacion_otro_correo', ...otro }

  // La escotilla vale incluso antes de saber el rol: quien la escribe ya dijo
  // a dónde quiere ir.
  if (modoClasico(e.busqueda)) return { estado: 'clasico' }

  if (e.perfil === 'cargando') return { estado: 'resolviendo' }
  // Resuelto, pero sin perfil utilizable: no se adivina nada.
  if (e.perfil === 'sin_perfil') return { estado: 'clasico' }

  if (esAdministracion(e.perfil)) return { estado: 'redirigir', destino: conSubruta('/admin', e.busqueda) }
  // El portal lo decide el servidor con `portalAbiertoPara`, no el navegador.
  if (e.perfil.portal === true) return { estado: 'redirigir', destino: conSubruta('/portal', e.busqueda) }

  // Portal cerrado por flag: se queda donde está. Es una decisión TOMADA, no
  // una espera; por eso no puede confundirse con `resolviendo`.
  return { estado: 'clasico' }
}

/**
 * Después de entrar en /dashboard: a dónde va cada quien. `null` = se queda.
 *
 * Es una vista fina sobre `pantallaDeDashboard` para no tener dos reglas que
 * puedan discrepar. Lo usa el efecto que navega.
 */
export function destinoTrasEntrar(
  perfil: PerfilDeEntrada | null | undefined,
  busqueda: string,
): string | null {
  const p = pantallaDeDashboard({
    authLoading: false,
    hayUsuario: true,
    perfil: perfil ?? 'sin_perfil',
    busqueda,
  })
  return p.estado === 'redirigir' ? p.destino : null
}

/**
 * A dónde va `/entrar` en cuanto hay sesión. **Un solo sitio para esa regla.**
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ NO LLAMA A `destinoTrasEntrar` AQUÍ
 *
 * Son dos decisiones distintas y en dos momentos distintos:
 *
 *  · **Aquí** sólo se sabe que hay sesión. El perfil —rol, `portal`— todavía
 *    no se ha pedido: lo sirve `/api/usuarios/me`, y quien lo pide es
 *    `/dashboard`.
 *  · **`destinoTrasEntrar`** necesita ese perfil para repartir a `/portal` o
 *    a `/admin`.
 *
 * Llamarla desde `/entrar` obligaría a pedir el perfil **también** aquí: dos
 * peticiones a la misma API y dos sitios que pueden discrepar sobre quién va
 * a dónde. Y no resolvería el caso que importa — `destinoTrasEntrar` devuelve
 * `null` para «se queda en el panel clásico», y un `null` aquí dejaría a la
 * persona **parada en el formulario de acceso**, que es exactamente el fallo
 * que se está corrigiendo.
 *
 * Así que `/entrar` entrega a `/dashboard`, que es el único que pide el perfil
 * y el único que aplica `destinoTrasEntrar`. **La lógica oficial no se
 * duplica ni se sustituye: se delega en su dueño.** Mientras `/dashboard`
 * resuelve, pinta pantalla de carga —nunca el panel equivocado—, porque
 * `pantallaDeDashboard` distingue `resolviendo` de `clasico` (V-1.1.92, E-18).
 *
 * `siguiente` manda cuando viene: es un «devuélveme donde estaba» explícito,
 * ya validado con `destinoSeguro` contra redirecciones abiertas, y la ruta de
 * destino vuelve a comprobar permisos en el servidor de todos modos.
 * ─────────────────────────────────────────────────────────────
 */
export function rutaTrasAutenticar(siguiente: string | null | undefined): string {
  // SESSION-SWITCH BUG (P1): `siguiente` es lo que había en la barra ANTES de entrar, y quien entra puede ser
  // OTRA persona (cerré sesión de un cliente en /portal y entró un admin: aterrizaba en el portal del cliente;
  // y al revés, un cliente en /admin). Las áreas por rol (/portal y /admin) NUNCA se eligen por la URL previa:
  // se delega en /dashboard (llevando `siguiente`), que pide el perfil al servidor, reparte según el rol de la sesión ACTUAL
  // y sólo conserva el destino si cae dentro del área de ese rol.
  // El resto de destinos (una ficha, la ayuda, un enlace de cita…) no dependen del rol y se respetan.
  if (!siguiente) return '/dashboard'
  if (AREA_POR_ROL.test(siguiente)) return `/dashboard?siguiente=${encodeURIComponent(siguiente)}`
  return siguiente
}

/** `/portal` y `/admin` (y lo que cuelga de ellos): áreas cuyo contenido depende de QUIÉN es la sesión. */
const AREA_POR_ROL = /^\/(portal|admin)(?:[/?#]|$)/i
