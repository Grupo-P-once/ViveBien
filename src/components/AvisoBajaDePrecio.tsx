'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { rutaDeEntrada } from '@/lib/pantalla/plegables'
import { useAuth } from '@/lib/useAuth'
import { auth } from '@/lib/firebase'

/**
 * La campana «Avisarme cuando baje de precio» (28-oct-2026), debajo de la caja de precio y contacto de la ficha.
 * Solo funciona CON CUENTA: sin sesión, tocarla lleva a entrar o crear cuenta (nada se guarda). Con sesión, enciende/apaga el aviso (`/api/portal/avisos-precio`); el aviso llega a «Mis avisos»
 * cuando la tarea diaria detecta que el precio bajó. La campana es un interruptor (`aria-pressed`) y el resultado se anuncia con `role="status"`; los errores, con `role="alert"`.
 */
type Estado = 'cargando' | 'inactivo' | 'activo' | 'guardando'

async function llamar(metodo: 'GET' | 'POST', propiedadId: string, activo?: boolean): Promise<{ ok: boolean; activo?: boolean; error?: string; codigo?: string; estado?: number }> {
  const token = await auth.currentUser?.getIdToken().catch(() => null)
  if (!token) return { ok: false, error: 'Inicia sesión para activar el aviso.' }
  const res = await fetch(metodo === 'GET' ? `/api/portal/avisos-precio?propiedadId=${encodeURIComponent(propiedadId)}` : '/api/portal/avisos-precio', {
    method: metodo, headers: { Authorization: `Bearer ${token}`, ...(metodo === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(metodo === 'POST' ? { body: JSON.stringify({ propiedadId, activo }) } : {}),
  }).catch(() => null)
  if (!res) return { ok: false, error: 'Se perdió la conexión. Inténtalo otra vez.' }
  const j = await res.json().catch(() => ({})) as { activo?: boolean; error?: string; codigo?: string }
  return res.ok ? { ok: true, activo: Boolean(j.activo) } : { ok: false, error: j.error || 'No se pudo completar.', codigo: j.codigo, estado: res.status }
}

export default function AvisoBajaDePrecio({ propiedadId, isLoggedIn }: { propiedadId: string; isLoggedIn: boolean }) {
  const router = useRouter()
  // Mientras Firebase decide si hay sesión, la campana espera (deshabilitada): tocarla antes mandaría a entrar a quien SÍ tiene sesión.
  const { loading: sesionCargando } = useAuth()
  const [estado, setEstado] = useState<Estado>(isLoggedIn ? 'cargando' : 'inactivo')
  const [error, setError] = useState('')
  const [noDisponible, setNoDisponible] = useState(false)
  // 404 de la puerta del portal (portal cerrado para esta cuenta): NO es «muy pronto», es «no está disponible para tu cuenta».
  const [portalCerrado, setPortalCerrado] = useState(false)

  useEffect(() => {
    if (!isLoggedIn) { setEstado('inactivo'); return }
    let vivo = true
    setEstado('cargando')
    llamar('GET', propiedadId).then((r) => {
      if (!vivo) return
      if (r.ok) setEstado(r.activo ? 'activo' : 'inactivo')
      else { setEstado('inactivo'); if (r.codigo === 'no_disponible') setNoDisponible(true); else if (r.estado === 404) setPortalCerrado(true) }
    })
    return () => { vivo = false }
  }, [isLoggedIn, propiedadId])

  async function alternar() {
    // Sin cuenta no se guarda nada: se lleva a entrar/crear cuenta y se regresa a esta ficha (no al formulario de contacto, que no crea cuenta).
    if (!isLoggedIn) { router.push(rutaDeEntrada(`${window.location.pathname}${window.location.search}`)); return }
    if (estado === 'guardando' || estado === 'cargando') return
    const quiere = estado !== 'activo'
    const antes = estado
    setError(''); setEstado('guardando')
    const r = await llamar('POST', propiedadId, quiere)
    // Un «todavía no disponible» anterior no bloquea para siempre: si ahora responde bien, se limpia y el estado manda.
    if (r.ok) { setNoDisponible(false); setEstado(r.activo ? 'activo' : 'inactivo') }
    else { setEstado(antes); setError(r.error ?? 'No se pudo completar.'); if (r.codigo === 'no_disponible') setNoDisponible(true) }
  }

  const activo = estado === 'activo'
  return (
    <section aria-labelledby="aviso-precio-t" data-aviso-precio style={{ marginTop: '1rem', background: '#fff', borderRadius: '20px', boxShadow: '0 8px 30px rgba(0,0,0,.08)', border: '1px solid #E8ECF1', padding: '.75rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.9rem' }}>
        <button type="button" onClick={alternar} aria-pressed={activo} aria-label={activo ? 'Quitar el aviso de baja de precio' : 'Avisarme cuando baje de precio'}
          disabled={sesionCargando || estado === 'guardando' || estado === 'cargando'} aria-busy={sesionCargando || estado === 'cargando'} data-campana
          style={{
            width: 46, height: 46, flex: 'none', borderRadius: '50%', cursor: 'pointer', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: activo ? 'var(--azul)' : '#fff', color: activo ? '#fff' : 'var(--azul)', border: '2px solid var(--azul)', transition: 'transform .15s, background .2s',
          }}>
          <i className={activo ? 'fas fa-bell' : 'far fa-bell'} aria-hidden="true" />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 id="aviso-precio-t" style={{ margin: 0, fontFamily: 'Montserrat, sans-serif', fontSize: '.98rem', fontWeight: 800, color: 'var(--azul)' }}>
            {activo ? 'Te avisaremos si baja de precio' : 'Avisarme cuando baje de precio'}
          </h3>
          <p style={{ margin: '.2rem 0 0', fontSize: '.8rem', lineHeight: 1.35, color: '#4b5563' }}>
            {!isLoggedIn
              ? 'Con tu cuenta te avisamos en Mis avisos.'
              : activo
                ? <>Llegará a <Link href="/portal/alertas" style={{ color: 'var(--azul)', fontWeight: 700 }}>Mis avisos</Link>. Toca la campana para quitarlo.</>
                : 'Toca la campana y te avisamos en Mis avisos.'}
          </p>
        </div>
      </div>
      <p role="status" aria-live="polite" style={{ margin: activo || noDisponible ? '.6rem 0 0' : 0, fontSize: '.82rem', fontWeight: 600, color: 'var(--exito-fuerte, #166534)' }}>
        {estado === 'guardando' ? 'Guardando…' : ''}
      </p>
      {portalCerrado && <p role="alert" style={{ margin: '.6rem 0 0', fontSize: '.82rem', color: '#7a4b00' }}>Los avisos de precio no están disponibles para tu cuenta por ahora.</p>}
      {noDisponible && <p role="alert" style={{ margin: '.6rem 0 0', fontSize: '.82rem', color: '#7a4b00' }}>Los avisos de precio estarán disponibles muy pronto.</p>}
      {error && <p role="alert" style={{ margin: '.6rem 0 0', fontSize: '.82rem', color: 'var(--error-fuerte, #991b1b)' }}>{error}</p>}
    </section>
  )
}
