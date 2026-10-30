import { getRedirectResult, signInWithPopup, signInWithRedirect } from 'firebase/auth'
import { auth, googleProvider } from '@/lib/firebase'
import {
  codigoDe, esCancelacion, mensajeIncrustado, navegadorIncrustado, pideRedireccion, redireccionDisponible,
  resultadoDeError, type RegistroAcceso, type ResultadoEntrada,
} from './google'

/**
 * Entrar con Google (V-1.1.83). El orden, en un solo lugar para las cuatro
 * pantallas que lo ofrecen (/dashboard, portal, panel, carga inicial):
 *
 *  1. Navegador dentro de otra app → se dice claro cómo abrirlo en el
 *     navegador (Google no deja entrar desde ahí: ni ventana ni redirección).
 *  2. Navegador normal → ventana emergente.
 *  3. La ventana no pudo abrirse → redirección, SÓLO si es fiable.
 *  4. Cualquier otra cosa → frase para la persona; el código, a la bitácora.
 */

export type DependenciasEntrada = {
  ventana: () => Promise<unknown>
  redireccion: () => Promise<unknown>
  agente: string
  anfitrion: string
  authDomain: string | undefined
  registrar: (r: RegistroAcceso) => void
}

export function crearEntrada(d: DependenciasEntrada) {
  const incrustado = () => navegadorIncrustado(d.agente)
  const planB = () => redireccionDisponible(d.authDomain, d.anfitrion)

  async function porRedireccion(donde: string, app: string | null): Promise<ResultadoEntrada> {
    try {
      await d.redireccion()
      return { estado: 'redirigiendo' }
    } catch (e) {
      d.registrar({ codigo: codigoDe(e) || 'desconocido/sin-codigo', donde, paso: 'redireccion', incrustado: app, planB: true })
      return resultadoDeError(e)
    }
  }

  return async function entrar(donde: string): Promise<ResultadoEntrada> {
    const app = incrustado()
    if (app) {
      // Ni ventana ni redirección: Google bloquea el acceso dentro de estas
      // apps («disallowed_useragent»), con o sin proxy. Lo que sirve es abrir
      // el enlace en el navegador de verdad.
      d.registrar({ codigo: 'vivebien/navegador-incrustado', donde, paso: 'ventana', incrustado: app, planB: planB() })
      return { estado: 'navegador-incrustado', app, mensaje: mensajeIncrustado(app) }
    }
    try {
      await d.ventana()
      return { estado: 'dentro' }
    } catch (e) {
      const codigo = codigoDe(e)
      // También las cancelaciones: si la ventana se cierra sola al volver de
      // Google, Firebase lo reporta como «cerrada por la persona».
      d.registrar({ codigo: codigo || 'desconocido/sin-codigo', donde, paso: 'ventana', incrustado: null, planB: planB() })
      if (esCancelacion(codigo)) return { estado: 'cancelado' }
      if (pideRedireccion(codigo) && planB()) return porRedireccion(donde, null)
      return resultadoDeError(e)
    }
  }
}

/** Al volver de Google por redirección: recoge el error, si lo hubo. */
export function crearRegreso(d: Pick<DependenciasEntrada, 'anfitrion' | 'authDomain' | 'registrar'> & {
  resultado: () => Promise<unknown>
}) {
  return async function regreso(donde: string): Promise<ResultadoEntrada | null> {
    // Sin plan B no hubo redirección que recoger, y pedir el resultado cargaría
    // un iframe de firebaseapp.com en cada visita para nada.
    if (!redireccionDisponible(d.authDomain, d.anfitrion)) return null
    try {
      await d.resultado()
      return null
    } catch (e) {
      d.registrar({ codigo: codigoDe(e) || 'desconocido/sin-codigo', donde, paso: 'regreso', incrustado: null, planB: true })
      return resultadoDeError(e)
    }
  }
}

/** Manda el código a la bitácora sin esperar ni romper nada. */
export function registrarAcceso(r: RegistroAcceso): void {
  console.warn('[acceso con Google]', r.codigo, r.paso, r.donde, r.incrustado ?? '')
  try {
    const cuerpo = JSON.stringify(r)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/acceso/registro', new Blob([cuerpo], { type: 'application/json' }))
    } else {
      void fetch('/api/acceso/registro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: cuerpo, keepalive: true }).catch(() => {})
    }
  } catch {
    // La bitácora nunca impide entrar.
  }
}

function dependenciasReales(): DependenciasEntrada {
  return {
    ventana: () => signInWithPopup(auth, googleProvider),
    redireccion: () => signInWithRedirect(auth, googleProvider),
    agente: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    anfitrion: typeof location === 'undefined' ? '' : location.hostname,
    authDomain: auth.config.authDomain,
    registrar: registrarAcceso,
  }
}

/** Para las pantallas: llamar DIRECTO desde el clic (sin `await` antes), o el navegador bloquea la ventana. */
export function entrarConGoogle(donde: string): Promise<ResultadoEntrada> {
  return crearEntrada(dependenciasReales())(donde)
}

export function recogerRegresoDeGoogle(donde: string): Promise<ResultadoEntrada | null> {
  const d = dependenciasReales()
  return crearRegreso({ ...d, resultado: () => getRedirectResult(auth) })(donde)
}
