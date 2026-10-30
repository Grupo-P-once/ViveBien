import { auth } from '../firebase'

/**
 * Subir una imagen a Cloudinary desde el navegador, con firma del servidor.
 *
 * V-1.1.78 (SEC-05, ADR-0008): sustituye al preset sin firma. Primero se pide
 * la firma a `/api/medios/firma` (que decide carpeta, nombre y formatos), luego
 * se sube el archivo directo a Cloudinary con esos campos tal cual.
 */

export type PedidoSubida =
  | { proposito: 'propiedad'; propiedadId?: string | null; clase?: 'fotos' | 'planos' }
  | { proposito: 'perfil' }

export type ResultadoSubida = { ok: true; url: string } | { ok: false; motivo: string }

export async function subirImagen(archivo: File, pedido: PedidoSubida): Promise<ResultadoSubida> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) return { ok: false, motivo: 'Inicia sesión para subir fotos.' }

  let firma: { url: string; campos: Record<string, string> }
  try {
    const res = await fetch('/api/medios/firma', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(pedido),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, motivo: j.error ?? 'No se pudo preparar la subida.' }
    firma = j
  } catch {
    return { ok: false, motivo: 'Sin conexión. Inténtalo otra vez.' }
  }

  const fd = new FormData()
  fd.append('file', archivo)
  for (const [k, v] of Object.entries(firma.campos)) fd.append(k, v)

  try {
    const res = await fetch(firma.url, { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    if (typeof data?.secure_url === 'string') return { ok: true, url: data.secure_url }
    return { ok: false, motivo: data?.error?.message ?? 'La imagen no se pudo subir.' }
  } catch {
    return { ok: false, motivo: 'La imagen no se pudo subir. Inténtalo otra vez.' }
  }
}
