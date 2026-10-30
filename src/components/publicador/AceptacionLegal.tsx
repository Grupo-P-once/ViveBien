'use client'

import { useCallback, useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import type { Documento, EstadoLegal } from '@/lib/aceptacion-legal'

/**
 * Términos y Condiciones y Aviso de Privacidad: se aceptan ANTES de enviar la propiedad (migración 44, 25-oct-2026).
 *
 * No pinta NADA si el módulo `legalAcceptance` está apagado, si la cuenta no tiene que aceptar o si la consulta falla: quien decide es el
 * servidor (la ruta de estado responde 403 `requiere_aceptacion_legal` con un mensaje claro). Esto solo le ahorra el tropiezo.
 * Nada viene marcado de antemano. Cada documento se acepta por separado y se registra con su versión; los enlaces abren la página vigente.
 */

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export default function AceptacionLegal() {
  const [e, setE] = useState<EstadoLegal | null>(null)
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/legal/aceptacion', { headers: await cabeceras(), cache: 'no-store' })
      if (!r.ok) return
      setE((await r.json()) as EstadoLegal)
    } catch { /* sin respuesta: no se muestra nada; el servidor decide al enviar */ }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function aceptar() {
    if (!e) return
    const documentos = e.pendientes.filter((d) => marcados[d])
    if (documentos.length !== e.pendientes.length) return
    setEnviando(true); setError('')
    try {
      const versiones = Object.fromEntries(e.documentos.map((d) => [d.documento, d.version]))
      const r = await fetch('/api/legal/aceptacion', { method: 'POST', headers: await cabeceras(), body: JSON.stringify({ documentos, versiones }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error ?? 'No se pudo registrar tu aceptación.')
        if (j.codigo === 'version_cambio') { setMarcados({}); await cargar() }
        return
      }
      await cargar()
    } catch { setError('No se pudo registrar tu aceptación. Revisa tu conexión.') } finally { setEnviando(false) }
  }

  if (!e?.requerida) return null
  const faltan = e.pendientes.length > 0
  const todoMarcado = faltan && e.pendientes.every((d: Documento) => marcados[d])

  return (
    <section data-aceptacion-legal aria-labelledby="titulo-legal" style={{ marginTop: '1.5rem', padding: '1rem 1.1rem', border: '1px solid var(--borde-frio)', borderRadius: 12, background: '#f8fafc' }}>
      <h3 id="titulo-legal" style={{ margin: 0, fontSize: '1rem' }}>Términos y Condiciones y Aviso de Privacidad</h3>
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 10 }}>
        {e.documentos.map((d) => (
          <li key={d.documento}>
            {d.aceptado ? (
              <p data-legal-aceptado={d.documento} role="status" style={{ margin: 0, fontSize: '.88rem', color: 'var(--exito-fuerte)' }}>
                Ya aceptaste el {d.nombre} (versión del {d.fecha}).
              </p>
            ) : (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.88rem' }}>
                <input type="checkbox" checked={Boolean(marcados[d.documento])} onChange={(ev) => setMarcados((m) => ({ ...m, [d.documento]: ev.target.checked }))} style={{ marginTop: 3 }} />
                <span>
                  He leído y acepto el{' '}
                  <a href={d.ruta} target="_blank" rel="noopener noreferrer">{d.nombre}<span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}> (se abre en una pestaña nueva)</span></a>
                  {' '}(versión del {d.fecha}).
                </span>
              </label>
            )}
          </li>
        ))}
      </ul>
      {faltan && (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <div>
            <button type="button" onClick={() => { void aceptar() }} disabled={!todoMarcado || enviando}
              style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--azul)', color: '#fff', fontFamily: 'inherit', fontSize: '.88rem', fontWeight: 600, cursor: todoMarcado && !enviando ? 'pointer' : 'not-allowed', opacity: todoMarcado && !enviando ? 1 : .55 }}>
              {enviando ? 'Registrando…' : 'Aceptar'}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: '.78rem', color: '#4b5563' }}>Sin tu aceptación no se puede enviar la propiedad a revisión.</p>
          {error && <p role="alert" style={{ margin: 0, fontSize: '.85rem', color: 'var(--error-fuerte)' }}>{error}</p>}
        </div>
      )}
    </section>
  )
}
