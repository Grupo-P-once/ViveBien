'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { auth } from '@/lib/firebase'

/**
 * Lo que falta configurar, dicho en el panel.
 *
 * Nació de «no puedo publicar siendo admin»: la causa era una variable de
 * entorno sin poner, y el sitio no lo decía en ninguna parte — sólo devolvía
 * un error genérico al pulsar el botón. Un fallo de configuración que no se
 * ve es un fallo que se busca a mano cada vez.
 *
 * Lee `/api/admin/salud` (R-02, D-62): el detalle ya no es público. Con sesión de administrador devuelve solo verdaderos y falsos; sin ella
 * responde 401/403 y este aviso simplemente no se pinta.
 */

type Salud = {
  puedeAdministrar: boolean
  migracion07: boolean | null
  migracion08: boolean | null
  correo: boolean
  telegram: boolean
  pendiente: string[]
  /** Lo que falta sin impedir trabajar (p. ej. el correo). */
  opcional?: string[]
}

export default function AvisoConfiguracion() {
  const [salud, setSalud] = useState<Salud | null>(null)
  // `?diagnostico=1` en la URL del panel: para cuando se van a probar cosas que
  // no bloquean, como el correo. Se lee como almacén externo: el servidor
  // dice «no» y el navegador lee la URL real al hidratar, así el HTML de ambos coincide.
  const diagnostico = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).has('diagnostico'),
    () => false,
  )

  useEffect(() => {
    let vivo = true
    // Espera a que Firebase tenga usuario (en el primer render `currentUser` aún puede ser null) y comprueba tras cada await que sigue
    // siendo el MISMO usuario (regla de cambio de cuenta, E-31).
    const baja = auth.onAuthStateChanged(async (u) => {
      if (!u) return
      const vigente = () => vivo && auth.currentUser?.uid === u.uid
      try {
        const token = await u.getIdToken()
        if (!vigente()) return
        const r = await fetch('/api/admin/salud', { headers: { Authorization: `Bearer ${token}` } })
        if (!vigente() || !r.ok) return
        const j = await r.json()
        if (vigente()) setSalud(j)
      } catch { /* si esto falla, el panel no es el sitio para decirlo */ }
    })
    return () => { vivo = false; baja() }
  }, [])

  if (!salud) return null
  const opcional = diagnostico ? (salud.opcional ?? []) : []
  if (salud.pendiente.length === 0 && opcional.length === 0) return null

  // Lo que impide trabajar va en rojo; lo que sólo limita, en ámbar.
  const grave = !salud.puedeAdministrar || salud.migracion08 === false

  return (
    <section role="status" style={{
      background: grave ? 'var(--error-fondo-fuerte)' : 'var(--aviso-fondo-calido)',
      border: `1px solid ${grave ? 'var(--error-fuerte)' : 'var(--aviso-fuerte)'}`,
      borderRadius: 12, padding: '1.1rem 1.3rem', marginBottom: '1.5rem',
      color: grave ? 'var(--error-fuerte)' : '#5A4A2A',
    }}>
      <h3 style={{ margin: '0 0 .5rem', fontSize: '.95rem', fontWeight: 800, fontFamily: 'Montserrat, sans-serif' }}>
        <i className="fa fa-triangle-exclamation" aria-hidden="true" style={{ marginRight: '.5rem' }} />
        {grave
          ? 'Falta configurar algo y bloquea el trabajo'
          : salud.pendiente.length > 0 ? 'Falta configurar algo' : 'Diagnóstico: configuración opcional'}
      </h3>
      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '.86rem', lineHeight: 1.7 }}>
        {salud.pendiente.map(p => <li key={p}>{p}</li>)}
        {opcional.map(p => <li key={p} style={{ opacity: .85 }}>{p}</li>)}
      </ul>
    </section>
  )
}
