'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '@/components/admin/sesion'

/**
 * «Recomendaciones por correo» en la Configuración del portal (D-80). Aceptar recibir publicidad es una decisión APARTE de
 * crear la cuenta: arranca desactivada, con el texto exacto y la versión que se aceptan. Si la función no está activa en el
 * servidor (`disponible: false`) no se pinta nada.
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
    <section aria-labelledby="pref-correo" className="mt-6 rounded-xl border bg-card p-5">
      <h2 id="pref-correo" className="font-heading text-base font-bold">Recomendaciones por correo</h2>
      <p className="mt-1 text-sm text-muted-foreground">{estado.texto}</p>
      <label className="mt-3 flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 size-4" checked={estado.activa} disabled={guardando} onChange={(e) => cambiar(e.target.checked)} />
        <span>{estado.activa ? 'Recibo recomendaciones de propiedades por correo.' : 'Quiero recibir recomendaciones de propiedades por correo.'}</span>
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--estado-mal)]">{error}</p>}
    </section>
  )
}
