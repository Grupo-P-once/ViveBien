'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '@/components/admin/sesion'

/**
 * «Promociones por correo»: el consentimiento comercial (D-80), como UN GRUPO APARTE dentro de `PreferenciasDeAvisos` (la pantalla única de
 * correo de la persona, visible en Alertas y en Configuración). Aceptar publicidad es una decisión DISTINTA de pedir avisos y de crear la cuenta:
 * arranca desactivada, con el texto exacto y la versión que se aceptan, y se guarda por SU propia ruta (`/api/correo/preferencias`), nunca junto a
 * los avisos de servicio (`/api/portal/preferencias`). Mientras no exista texto legal aprobado el servidor responde `disponible: false` y este
 * grupo no se pinta.
 */
type Estado = { disponible: boolean; activa: boolean; texto: string }

export default function PreferenciaCorreo() {
  const { pedir } = useSesion()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(() => {
    pedir<Estado>('/api/correo/preferencias').then(setEstado).catch(() => setEstado(null))
  }, [pedir])
  useEffect(() => { cargar() }, [cargar])

  async function cambiar(aceptar: boolean) {
    setGuardando(true)
    setError('')
    try {
      await pedir('/api/correo/preferencias', { method: 'POST', body: JSON.stringify({ aceptar }) })
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar tu decisión.')
    }
    setGuardando(false)
  }

  if (!estado?.disponible) return null
  return (
    <section aria-labelledby="pref-correo" className="mt-5 rounded-xl border border-dashed bg-background p-4" data-grupo-promociones>
      <h3 id="pref-correo" className="font-heading text-sm font-semibold">Promociones (opcional, aparte de tus avisos)</h3>
      <p className="mt-1 text-sm text-muted-foreground">{estado.texto}</p>
      <label className="mt-3 flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 size-4" checked={estado.activa} disabled={guardando} onChange={(e) => cambiar(e.target.checked)} />
        <span>{estado.activa ? 'Recibo recomendaciones de propiedades por correo.' : 'Quiero recibir recomendaciones de propiedades por correo.'}</span>
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--estado-mal)]">{error}</p>}
    </section>
  )
}
