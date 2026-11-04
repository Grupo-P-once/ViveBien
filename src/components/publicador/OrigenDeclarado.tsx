'use client'

import { useCallback, useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'

/**
 * «¿Cómo manejas esta propiedad?» — se declara ANTES de enviar a revisión (migración 43, 24-oct-2026).
 *
 * No pinta NADA si el módulo de comisiones está apagado, si la cuenta no paga comisión o si la consulta falla: quien decide es el servidor
 * (la ruta de estado responde 403 `requiere_origen`). Esto solo le ahorra el tropiezo. Nada viene preseleccionado: ni la opción ni la casilla.
 * El folio de acreditación es opcional; declararlo NO lo verifica, y la pantalla lo dice.
 * Trato directo pide además nombre completo, teléfono y correo del propietario (o de quien lo representa): se ofrecen ya rellenos con los
 * datos del perfil para no pedirlos dos veces, y se pueden cambiar. Van al origen, que es lo que el equipo ve en «Notas/Comisión».
 */

type Opcion = 'trato_directo' | 'agente'
type Estado = {
  aplica: boolean
  listo?: boolean
  opcion?: Opcion | null
  valores?: { declara_autorizacion: boolean; agente_nombre: string; inmobiliaria: string; folio: string; municipio: string; nombre_completo: string; telefono: string; correo: string }
  prefill?: { nombre: string; telefono: string; correo: string }
  acreditacion?: { estado: string; etiqueta: string } | null
  comoFunciona?: string[]
  resumen?: { borrador: boolean; lineas: string[] }
  acuerdoVigente?: boolean | null
  avisoSinAcuerdo?: string | null
}

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const campo: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--borde-frio)', fontFamily: 'inherit', fontSize: '.9rem', boxSizing: 'border-box', background: '#fff' }
const etiqueta: React.CSSProperties = { display: 'block', fontSize: '.8rem', fontWeight: 600, color: '#4b5563', marginBottom: 4 }

export default function OrigenDeclarado({ propiedadId, editable = true }: { propiedadId: string; editable?: boolean }) {
  const [e, setE] = useState<Estado | null>(null)
  const [opcion, setOpcion] = useState<Opcion | null>(null)
  const [autoriza, setAutoriza] = useState(false)
  const [duenoNombre, setDuenoNombre] = useState('')
  const [duenoTelefono, setDuenoTelefono] = useState('')
  const [duenoCorreo, setDuenoCorreo] = useState('')
  const [agente, setAgente] = useState('')
  const [inmobiliaria, setInmobiliaria] = useState('')
  const [folio, setFolio] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/propiedades/${encodeURIComponent(propiedadId)}/origen`, { headers: await cabeceras(), cache: 'no-store' })
      if (!r.ok) return
      const j = (await r.json()) as Estado
      setE(j)
      if (j.aplica && j.valores) {
        setOpcion(j.opcion ?? null)
        setAutoriza(j.valores.declara_autorizacion)
        setAgente(j.valores.agente_nombre); setInmobiliaria(j.valores.inmobiliaria); setFolio(j.valores.folio); setMunicipio(j.valores.municipio)
        // Lo guardado manda; si no hay nada guardado, se ofrece lo que ya dio en su perfil.
        setDuenoNombre(j.valores.nombre_completo || j.prefill?.nombre || '')
        setDuenoTelefono(j.valores.telefono || j.prefill?.telefono || '')
        setDuenoCorreo(j.valores.correo || j.prefill?.correo || '')
      }
    } catch { /* sin respuesta: no se muestra nada; el servidor decide al enviar */ }
  }, [propiedadId])

  useEffect(() => { void cargar() }, [cargar])

  async function guardar() {
    if (!opcion) return
    setGuardando(true); setAviso(null)
    try {
      const cuerpo = opcion === 'trato_directo'
        ? { opcion, declara_autorizacion: autoriza, nombre_completo: duenoNombre, telefono: duenoTelefono, correo: duenoCorreo }
        : { opcion, agente_nombre: agente, inmobiliaria, folio, municipio }
      const r = await fetch(`/api/propiedades/${encodeURIComponent(propiedadId)}/origen`, { method: 'PUT', headers: await cabeceras(), body: JSON.stringify(cuerpo) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso({ tipo: 'error', texto: j.error ?? 'No se pudo guardar.' }); return }
      setAviso({ tipo: 'ok', texto: 'Guardado.' })
      await cargar()
    } catch { setAviso({ tipo: 'error', texto: 'No se pudo guardar. Revisa tu conexión.' }) } finally { setGuardando(false) }
  }

  if (!e?.aplica) return null
  const bloqueado = !editable
  const duenoCompleto = autoriza && duenoNombre.trim().split(/\s+/).length >= 2 && duenoTelefono.trim().length >= 7 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(duenoCorreo.trim())

  return (
    <section data-origen-declarado aria-labelledby="titulo-origen" style={{ marginTop: '1.5rem', padding: '1rem 1.1rem', border: '1px solid var(--borde-frio)', borderRadius: 12, background: '#f8fafc' }}>
      <h3 id="titulo-origen" style={{ margin: 0, fontSize: '1rem' }}>¿Cómo manejas esta propiedad?</h3>
      <p style={{ margin: '2px 0 10px', fontSize: '.82rem', color: '#4b5563' }}>Elige una opción antes de enviarla a revisión.</p>

      <fieldset disabled={bloqueado} style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        <legend style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Cómo manejas esta propiedad</legend>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.9rem' }}>
          <input type="radio" name="origen-declarado" checked={opcion === 'trato_directo'} onChange={() => setOpcion('trato_directo')} style={{ marginTop: 3 }} />
          <span>Trato directo — soy propietario/a o representante autorizado/a</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.9rem' }}>
          <input type="radio" name="origen-declarado" checked={opcion === 'agente'} onChange={() => setOpcion('agente')} style={{ marginTop: 3 }} />
          <span>Agente inmobiliario/a o inmobiliaria</span>
        </label>
      </fieldset>

      {opcion && (
        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          <div data-como-funciona style={{ padding: '10px 12px', background: '#fff', border: '1px solid var(--borde-frio)', borderRadius: 8 }}>
            <p style={{ margin: '0 0 6px', fontSize: '.86rem', fontWeight: 700 }}>Cómo funciona VIVE BIEN</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: '.85rem', lineHeight: 1.6 }}>{(e.comoFunciona ?? []).map((t) => <li key={t}>{t}</li>)}</ul>
          </div>

          {opcion === 'trato_directo' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <p style={{ margin: 0, fontSize: '.84rem', color: '#4b5563' }}>Datos del propietario (o de quien lo representa). Ya los llenamos con tu perfil; cámbialos si vende otra persona.</p>
              <div><label htmlFor="og-dnombre" style={etiqueta}>Nombre completo</label><input id="og-dnombre" style={campo} value={duenoNombre} disabled={bloqueado} maxLength={200} onChange={(ev) => setDuenoNombre(ev.target.value)} autoComplete="name" /></div>
              <div><label htmlFor="og-dtel" style={etiqueta}>Teléfono</label><input id="og-dtel" type="tel" style={campo} value={duenoTelefono} disabled={bloqueado} maxLength={40} onChange={(ev) => setDuenoTelefono(ev.target.value)} autoComplete="tel" /></div>
              <div><label htmlFor="og-dcorreo" style={etiqueta}>Correo electrónico</label><input id="og-dcorreo" type="email" style={campo} value={duenoCorreo} disabled={bloqueado} maxLength={200} onChange={(ev) => setDuenoCorreo(ev.target.value)} autoComplete="email" /></div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.88rem' }}>
                <input type="checkbox" checked={autoriza} disabled={bloqueado} onChange={(ev) => setAutoriza(ev.target.checked)} style={{ marginTop: 3 }} />
                <span>Declaro que soy propietario/a de esta propiedad o su representante autorizado/a para ofrecerla.</span>
              </label>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div><label htmlFor="og-agente" style={etiqueta}>Nombre del agente</label><input id="og-agente" style={campo} value={agente} disabled={bloqueado} maxLength={200} onChange={(ev) => setAgente(ev.target.value)} autoComplete="off" /></div>
              <div><label htmlFor="og-inmob" style={etiqueta}>Nombre comercial o razón social de la inmobiliaria</label><input id="og-inmob" style={campo} value={inmobiliaria} disabled={bloqueado} maxLength={200} onChange={(ev) => setInmobiliaria(ev.target.value)} autoComplete="off" /></div>
              <div><label htmlFor="og-folio" style={etiqueta}>Folio de acreditación estatal (opcional)</label><input id="og-folio" style={campo} value={folio} disabled={bloqueado} maxLength={40} onChange={(ev) => setFolio(ev.target.value)} autoComplete="off" aria-describedby="og-folio-ayuda" /></div>
              <div><label htmlFor="og-mun" style={etiqueta}>Municipio (opcional)</label><input id="og-mun" style={campo} value={municipio} disabled={bloqueado} maxLength={120} onChange={(ev) => setMunicipio(ev.target.value)} autoComplete="off" /></div>
              <p id="og-folio-ayuda" style={{ margin: 0, fontSize: '.8rem', color: '#4b5563' }}>
                El folio es opcional. Si lo aportas, el equipo lo revisa contra el padrón oficial; hasta entonces figura como <strong>pendiente de verificación</strong>, no como acreditado, y la parte de la comisión que le correspondería a un agente colaborador queda retenida.
              </p>
              {e.acreditacion && <p data-acreditacion-estado style={{ margin: 0, fontSize: '.82rem', fontWeight: 600 }}>{e.acreditacion.etiqueta}</p>}
            </div>
          )}

          <div data-resumen-economico style={{ padding: '10px 12px', background: '#fff', border: '1px solid var(--borde-frio)', borderRadius: 8 }}>
            <p style={{ margin: '0 0 6px', fontSize: '.86rem', fontWeight: 700 }}>{e.acuerdoVigente === true ? 'Comisión' : 'Comisión (propuesta)'}</p>
            {e.avisoSinAcuerdo && <p data-aviso-sin-acuerdo style={{ margin: '0 0 8px', padding: '8px 10px', background: 'var(--superficie)', border: '1px solid var(--borde-frio)', borderRadius: 6, fontSize: '.82rem', lineHeight: 1.5 }}>{e.avisoSinAcuerdo}</p>}
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: '.85rem', lineHeight: 1.6 }}>{(e.resumen?.lineas ?? []).map((t) => <li key={t}>{t}</li>)}</ul>
          </div>

          {!bloqueado && (
            <div>
              <button type="button" onClick={() => { void guardar() }} disabled={guardando || (opcion === 'trato_directo' && !duenoCompleto)}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--azul)', color: '#fff', fontFamily: 'inherit', fontSize: '.88rem', fontWeight: 600, cursor: guardando ? 'wait' : 'pointer', opacity: guardando || (opcion === 'trato_directo' && !duenoCompleto) ? .55 : 1 }}>
                {guardando ? 'Guardando…' : 'Guardar cómo manejo esta propiedad'}
              </button>
              {aviso && <p role={aviso.tipo === 'error' ? 'alert' : 'status'} style={{ margin: '8px 0 0', fontSize: '.85rem', color: aviso.tipo === 'error' ? 'var(--error-fuerte)' : 'var(--exito-fuerte)' }}>{aviso.texto}</p>}
            </div>
          )}
        </div>
      )}
      {e.listo && <p data-origen-listo role="status" style={{ margin: '10px 0 0', fontSize: '.85rem', color: 'var(--exito-fuerte)' }}>Ya declaraste cómo manejas esta propiedad.</p>}
    </section>
  )
}
