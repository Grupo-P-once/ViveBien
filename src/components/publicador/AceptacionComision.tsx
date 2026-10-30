'use client'

import { useCallback, useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import type { EstadoAceptacion } from '@/lib/comision-aceptacion'

/**
 * Propuesta de comisión: el publicador la lee y la acepta antes de enviar o publicar (Etapa B, 24-oct-2026).
 *
 * No pinta NADA si el módulo está apagado, si la cuenta no tiene que aceptar o si la consulta falla: quien decide es el servidor
 * (la ruta de estado responde 403 `requiere_aceptacion_comision` con un mensaje claro). Esto solo le ahorra el tropiezo.
 */

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export default function AceptacionComision() {
  const [e, setE] = useState<EstadoAceptacion | null>(null)
  const [leida, setLeida] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/comision/aceptacion', { headers: await cabeceras(), cache: 'no-store' })
      if (!r.ok) return
      setE((await r.json()) as EstadoAceptacion)
    } catch { /* sin respuesta: no se muestra nada; el servidor decide al enviar */ }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function aceptar() {
    if (!e?.texto || !leida) return
    setEnviando(true); setError('')
    try {
      const r = await fetch('/api/comision/aceptacion', { method: 'POST', headers: await cabeceras(), body: JSON.stringify({ texto_id: e.texto.id, hash: e.texto.hash }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error ?? 'No se pudo registrar tu aceptación.')
        if (j.codigo === 'texto_cambio') { setLeida(false); await cargar() }
        return
      }
      await cargar()
    } catch { setError('No se pudo registrar tu aceptación. Revisa tu conexión.') } finally { setEnviando(false) }
  }

  if (!e?.requerida || !e.texto) return null

  return (
    <section data-aceptacion-comision aria-labelledby="titulo-comision" style={{ marginTop: '1.5rem', padding: '1rem 1.1rem', border: '1px solid var(--borde-frio)', borderRadius: 12, background: '#f8fafc' }}>
      <h3 id="titulo-comision" style={{ margin: 0, fontSize: '1rem' }}>{e.texto.titulo}</h3>
      <p style={{ margin: '2px 0 8px', fontSize: '.78rem', color: '#4b5563' }}>Versión {e.texto.version}</p>
      <div tabIndex={0} role="region" aria-label="Texto de la propuesta de comisión" data-texto-comision
        style={{ maxHeight: 260, overflowY: 'auto', padding: '10px 12px', background: '#fff', border: '1px solid var(--borde-frio)', borderRadius: 8, fontSize: '.86rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {e.texto.cuerpo}
      </div>
      {e.aceptada ? (
        <p data-comision-aceptada role="status" style={{ margin: '10px 0 0', fontSize: '.88rem', color: 'var(--exito-fuerte)' }}>
          Ya aceptaste esta propuesta (versión {e.texto.version}).
        </p>
      ) : (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.88rem' }}>
            <input type="checkbox" checked={leida} onChange={(ev) => setLeida(ev.target.checked)} style={{ marginTop: 3 }} />
            <span>He leído la propuesta de comisión (versión {e.texto.version}) y la acepto.</span>
          </label>
          <div>
            <button type="button" onClick={() => { void aceptar() }} disabled={!leida || enviando}
              style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--azul)', color: '#fff', fontFamily: 'inherit', fontSize: '.88rem', fontWeight: 600, cursor: leida && !enviando ? 'pointer' : 'not-allowed', opacity: leida && !enviando ? 1 : .55 }}>
              {enviando ? 'Registrando…' : 'Aceptar la propuesta'}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: '.78rem', color: '#4b5563' }}>Sin tu aceptación no se puede enviar la propiedad a revisión.</p>
          {error && <p role="alert" style={{ margin: 0, fontSize: '.85rem', color: 'var(--error-fuerte)' }}>{error}</p>}
        </div>
      )}
    </section>
  )
}
