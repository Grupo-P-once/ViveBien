import { NextResponse } from 'next/server'
import { exigir, type ChequeoRol } from '../auth-server'
import { leerFlags } from '../config/flags-servidor'
import { puede, type QuienDecide } from '../acceso/permisos'
import { aperturaDelPortal, portalAbiertoPara } from './apertura'

/**
 * La puerta de TODA `/api/portal/*` (V-1.1.82). Sólo servidor.
 *
 * La sesión de Firebase vive en el navegador, así que el layout no sabe quién
 * entra: el filtro por persona se hace aquí, en cada API. Sin acceso, 404 —
 * no se revela que el portal existe.
 *
 *  1. Portal cerrado para todos → 404 sin leer siquiera la sesión.
 *  2. Sesión, suspensión y permiso `cuenta.propia` (`exigir`: 401 / 403).
 *  3. Etapa interna y la cuenta no es admin → 404.
 */
const noEncontrado = (): ChequeoRol => ({ error: NextResponse.json({ error: 'No encontrado.' }, { status: 404 }) })

export async function exigirPortal(req: Request): Promise<ChequeoRol> {
  const flags = await leerFlags()
  if (aperturaDelPortal(flags) === 'nadie') return noEncontrado()

  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth

  if (!portalAbiertoPara(flags, auth.perfil)) return noEncontrado()
  return auth
}

/**
 * R8.6 · Escribir propiedades con el portal CERRADO para esta persona.
 *
 * El trabajo con propiedades de un publicador / asociado vive en el portal. Si el portal no está abierto para él (flag
 * `portalCliente` apagado, o etapa interna y no es de la casa), la pantalla ya no le ofrece nada (aviso de «no disponible»),
 * pero quien llame a la API a mano tampoco puede escribir: 403 con `codigo: 'portal_cerrado'`. Lo decide el servidor con
 * `portalAbiertoPara`, el mismo predicado que usan el layout y `/api/usuarios/me`; el navegador no aporta nada.
 *
 * Quien administra (`panel.admin`) NO depende del portal: su espacio es `/admin` y sigue funcionando con el portal cerrado.
 * Falla cerrado: si los flags no se pueden leer, `leerFlags` los da por apagados.
 */
export async function portalCerradoParaEscribir(perfil: QuienDecide): Promise<NextResponse | null> {
  if (puede(perfil, 'panel.admin')) return null
  if (portalAbiertoPara(await leerFlags(), perfil)) return null
  return NextResponse.json(
    { error: 'El portal está cerrado por ahora: no se pueden crear ni cambiar propiedades hasta que abra.', codigo: 'portal_cerrado' },
    { status: 403 },
  )
}
