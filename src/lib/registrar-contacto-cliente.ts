import { auth } from '@/lib/firebase'
import type { CanalDeContacto } from '@/lib/contactos-cliente'

/**
 * Anota en «Mis consultas» que esta persona (con sesión) contactó por una propiedad. SOLO NAVEGADOR.
 * Nunca lanza ni bloquea: el contacto es lo importante y el historial es un extra; si la sesión o la red fallan, simplemente no queda anotado.
 * `keepalive` hace que la petición sobreviva si la pantalla se va a WhatsApp o al marcador del teléfono justo después del clic.
 */
export async function registrarContactoDelCliente(propiedadId: string | null | undefined, canal: CanalDeContacto): Promise<boolean> {
  try {
    if (!propiedadId) return false
    const token = await auth.currentUser?.getIdToken()
    if (!token) return false
    const res = await fetch('/api/portal/contactos', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ propiedadId, canal }) })
    // `true` SOLO si el servidor lo guardó (201) o ya estaba de hace un instante (200, doble clic). Cualquier otra respuesta (503 sin migración, 404 portal cerrado…) NO es un éxito.
    if (!res.ok) console.warn(`[historial] no se pudo anotar el contacto (${res.status})`)
    return res.ok
  } catch { return false /* el historial nunca estorba al contacto */ }
}
