'use client'

import { useCallback, useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'

/**
 * Revisión de la acreditación de un agente (migración 43). SOLO para el equipo: la ruta responde 403 a cualquier otra cuenta y entonces
 * este bloque no pinta nada. Se muestra dentro de «Notas/Comisión», solo cuando la propiedad trae un folio que revisar.
 *
 * El equipo compara el folio con el padrón oficial (https://sde.guanajuato.gob.mx/PortalSE/PadronAgentesInmoviliarios) y registra el resultado,
 * la vigencia que indica el padrón y un motivo. Quien aportó el folio no lo verifica; el servidor y la base lo impiden.
 */

type Datos = {
  folio: string | null; municipio: string | null; aportoPor: string | null; estado: string; etiqueta: string
  verificadoPor: string | null; verificadoEn: string | null; vigenteHasta: string | null; motivo: string | null
}

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const campo: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--borde-frio)', fontFamily: 'inherit', fontSize: '.9rem', boxSizing: 'border-box', background: '#fff' }
const etiqueta: React.CSSProperties = { display: 'block', fontSize: '.8rem', fontWeight: 600, color: '#4b5563', marginBottom: 4 }

export default function VerificacionAcreditacion({ propiedadId }: { propiedadId: string }) {
  const [d, setD] = useState<Datos | null>(null)
  const [resultado, setResultado] = useState<'coincide' | 'no_coincide' | ''>('')
  const [hasta, setHasta] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/propiedades/${encodeURIComponent(propiedadId)}/acreditacion`, { headers: await cabeceras(), cache: 'no-store' })
      if (!r.ok) { setD(null); return }
      setD((await r.json()) as Datos)
    } catch { setD(null) }
  }, [propiedadId])

  useEffect(() => { void cargar() }, [cargar])

  async function registrar() {
    if (!d?.folio || !resultado) return
    setEnviando(true); setAviso(null)
    try {
      const r = await fetch(`/api/propiedades/${encodeURIComponent(propiedadId)}/acreditacion`, {
        method: 'POST', headers: await cabeceras(),
        body: JSON.stringify({ folio: d.folio, resultado, vigente_hasta: resultado === 'coincide' ? hasta : undefined, motivo }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso({ tipo: 'error', texto: j.error ?? 'No se pudo registrar la revisión.' }); if (j.codigo === 'conflicto') await cargar(); return }
      setAviso({ tipo: 'ok', texto: 'Revisión registrada.' }); setMotivo(''); setHasta(''); setResultado('')
      await cargar()
    } catch { setAviso({ tipo: 'error', texto: 'No se pudo registrar la revisión. Revisa tu conexión.' }) } finally { setEnviando(false) }
  }

  if (!d || !d.folio) return null
  const listo = Boolean(resultado) && motivo.trim().length >= 10 && (resultado !== 'coincide' || /^\d{4}-\d{2}-\d{2}$/.test(hasta))

  return (
    <section data-verificacion-acreditacion aria-labelledby="titulo-acreditacion" style={{ marginTop: 20, padding: '1rem 1.1rem', border: '1px solid var(--borde-frio)', borderRadius: 12, background: '#f8fafc' }}>
      <h3 id="titulo-acreditacion" style={{ margin: 0, fontSize: '1rem' }}>Acreditación del agente</h3>
      <p data-acreditacion-estado style={{ margin: '4px 0 8px', fontSize: '.88rem', fontWeight: 600 }}>{d.etiqueta}</p>
      <p style={{ margin: 0, fontSize: '.84rem', lineHeight: 1.6 }}>
        Folio aportado: <strong>{d.folio}</strong>{d.municipio ? ` · Municipio: ${d.municipio}` : ''}<br />
        {d.verificadoPor && <>Revisó: {d.verificadoPor}{d.vigenteHasta ? ` · vigente hasta ${d.vigenteHasta}` : ''}{d.motivo ? ` · ${d.motivo}` : ''}</>}
      </p>
      <p style={{ margin: '8px 0', fontSize: '.8rem', color: '#4b5563' }}>
        Compara el folio con el <a href="https://sde.guanajuato.gob.mx/PortalSE/PadronAgentesInmoviliarios" target="_blank" rel="noopener noreferrer">padrón oficial</a> y registra lo que encontraste. Hasta que esté verificada y vigente, la parte del reparto del agente se queda retenida.
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <label htmlFor="ac-res" style={etiqueta}>Resultado de la revisión</label>
          <select id="ac-res" style={campo} value={resultado} onChange={(ev) => setResultado(ev.target.value as typeof resultado)}>
            <option value="">Elige…</option>
            <option value="coincide">El folio coincide con el padrón</option>
            <option value="no_coincide">El folio no coincide o no aparece</option>
          </select>
        </div>
        {resultado === 'coincide' && (
          <div><label htmlFor="ac-hasta" style={etiqueta}>Vigente hasta (según el padrón)</label><input id="ac-hasta" type="date" style={campo} value={hasta} onChange={(ev) => setHasta(ev.target.value)} /></div>
        )}
        <div><label htmlFor="ac-motivo" style={etiqueta}>Motivo o evidencia de la revisión (mínimo 10 caracteres)</label><textarea id="ac-motivo" style={{ ...campo, minHeight: 64 }} value={motivo} maxLength={500} onChange={(ev) => setMotivo(ev.target.value)} /></div>
        <div>
          <button type="button" onClick={() => { void registrar() }} disabled={!listo || enviando}
            style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--azul)', color: '#fff', fontFamily: 'inherit', fontSize: '.88rem', fontWeight: 600, cursor: listo && !enviando ? 'pointer' : 'not-allowed', opacity: listo && !enviando ? 1 : .55 }}>
            {enviando ? 'Registrando…' : 'Registrar revisión'}
          </button>
          {aviso && <p role={aviso.tipo === 'error' ? 'alert' : 'status'} style={{ margin: '8px 0 0', fontSize: '.85rem', color: aviso.tipo === 'error' ? 'var(--error-fuerte)' : 'var(--exito-fuerte)' }}>{aviso.texto}</p>}
        </div>
      </div>
    </section>
  )
}
