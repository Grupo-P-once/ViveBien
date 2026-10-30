'use client'

import { useCallback, useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import { fechaCorta } from '@/lib/admin/formato'
import { COMISIONES, ETIQUETA_COMISION, ETIQUETA_ORIGEN, MAXIMO_NOTA, ORIGENES, type NotaInterna } from '@/lib/propiedad-interno'

/**
 * «Interno» — de quién es la propiedad, comisión pactada y notas internas (migración 38, 24-oct-2026).
 *
 * Lo ve el dueño de la propiedad y el equipo. Las notas se filtran en el servidor: el equipo ve todas, cada quien las suyas.
 * Si las tablas todavía no existen, lo dice (no enseña «sin notas» como si todo estuviera bien).
 */

type Origen = {
  origen_tipo: string; titular_nombre: string | null; titular_empresa: string | null; titular_telefono: string | null
  titular_correo: string | null; comision_tipo: string | null; comision_valor: number | null; comision_detalle: string | null
  actualizado_por?: string; actualizado_en?: string
}
type Datos = {
  origen: Origen | null
  notas: NotaInterna[]
  subidaPor: { nombre: string | null; correo: string | null; rol: string | null; modalidad: string | null } | null
  veTodas: boolean
  /** Solo para el equipo: el directorio de colaboradores activos (id, nombre, empresa), el ligado a esta propiedad y si puede crear uno. */
  colaboradores?: Array<{ id: string; nombre: string; empresa: string | null }> | null
  colaborador?: { id: string; nombre: string; empresa: string | null } | null
  puedeCrearColaborador?: boolean
}
type Forma = { origen_tipo: string; titular_nombre: string; titular_empresa: string; titular_telefono: string; titular_correo: string; comision_tipo: string; comision_valor: string; comision_detalle: string }

const VACIA: Forma = { origen_tipo: '', titular_nombre: '', titular_empresa: '', titular_telefono: '', titular_correo: '', comision_tipo: '', comision_valor: '', comision_detalle: '' }
const deOrigen = (o: Origen | null): Forma => o
  ? { origen_tipo: o.origen_tipo ?? '', titular_nombre: o.titular_nombre ?? '', titular_empresa: o.titular_empresa ?? '', titular_telefono: o.titular_telefono ?? '', titular_correo: o.titular_correo ?? '', comision_tipo: o.comision_tipo ?? '', comision_valor: o.comision_valor == null ? '' : String(o.comision_valor), comision_detalle: o.comision_detalle ?? '' }
  : VACIA
const ROL: Record<string, string> = { publicador: 'Publicador', admin: 'Administración', super_admin: 'Super admin' }

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const campo: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--borde-frio)', fontFamily: 'inherit', fontSize: '.9rem', boxSizing: 'border-box', background: '#fff' }
const etiqueta: React.CSSProperties = { display: 'block', fontSize: '.8rem', fontWeight: 600, color: '#4b5563', marginBottom: 4 }
const boton: React.CSSProperties = { padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--azul)', color: '#fff', fontFamily: 'inherit', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer' }

export default function PanelInterno({ propiedadId }: { propiedadId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'no_disponible' | 'error'>('cargando')
  const [forma, setForma] = useState<Forma>(VACIA)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [colabElegido, setColabElegido] = useState('')
  const [creando, setCreando] = useState(false)
  const [nuevoColab, setNuevoColab] = useState({ tipo: 'agente', nombre: '', empresa: '', telefono: '' })
  const [ligando, setLigando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/propiedades/${encodeURIComponent(propiedadId)}/interno`, { headers: await cabeceras(), cache: 'no-store' })
      if (r.status === 503) { setEstado('no_disponible'); return }
      if (!r.ok) { setEstado('error'); return }
      const d = (await r.json()) as Datos
      setDatos(d)
      setColabElegido(d.colaborador?.id ?? '')
      setForma(deOrigen(d.origen))
      setEstado('listo')
    } catch { setEstado('error') }
  }, [propiedadId])

  useEffect(() => { void cargar() }, [cargar])

  const poner = (k: keyof Forma) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForma((f) => ({ ...f, [k]: e.target.value }))

  async function guardarOrigen(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setAviso(null)
    try {
      const r = await fetch(`/api/propiedades/${encodeURIComponent(propiedadId)}/interno`, { method: 'PUT', headers: await cabeceras(), body: JSON.stringify(forma) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso({ tipo: 'error', texto: j.error ?? 'No se pudo guardar.' }); return }
      setAviso({ tipo: 'ok', texto: 'Origen y comisión guardados.' })
      await cargar()
    } catch { setAviso({ tipo: 'error', texto: 'No se pudo guardar. Revisa tu conexión.' }) } finally { setGuardando(false) }
  }

  /** Liga (o quita) el colaborador del directorio. Si se está creando uno nuevo, primero se da de alta en el directorio y luego se liga. */
  async function ligarColaborador() {
    setLigando(true); setAviso(null)
    try {
      let destino: string | null = colabElegido || null
      if (creando) {
        const alta = await fetch('/api/admin/contabilidad/colaboradores', { method: 'POST', headers: await cabeceras(), body: JSON.stringify({ tipo: nuevoColab.tipo, nombre: nuevoColab.nombre, empresa: nuevoColab.empresa || undefined, telefono: nuevoColab.telefono || undefined }) })
        const a = await alta.json().catch(() => ({}))
        if (!alta.ok) { setAviso({ tipo: 'error', texto: a.error ?? 'No se pudo crear el colaborador.' }); return }
        destino = typeof a.id === 'string' ? a.id : null
        if (!destino) { setAviso({ tipo: 'error', texto: 'Se creó el colaborador, pero no se pudo ligar. Elígelo de la lista.' }); await cargar(); return }
      }
      const r = await fetch(`/api/propiedades/${encodeURIComponent(propiedadId)}/colaborador`, { method: 'PUT', headers: await cabeceras(), body: JSON.stringify({ colaborador_id: destino }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso({ tipo: 'error', texto: j.error ?? 'No se pudo guardar el colaborador.' }); return }
      setAviso({ tipo: 'ok', texto: destino ? 'Colaborador ligado a la propiedad.' : 'Colaborador quitado de la propiedad.' })
      setCreando(false); setNuevoColab({ tipo: 'agente', nombre: '', empresa: '', telefono: '' })
      await cargar()
    } catch { setAviso({ tipo: 'error', texto: 'No se pudo guardar. Revisa tu conexión.' }) } finally { setLigando(false) }
  }

  async function agregarNota(e: React.FormEvent) {
    e.preventDefault()
    if (!nota.trim()) return
    setEnviando(true); setAviso(null)
    try {
      const r = await fetch(`/api/propiedades/${encodeURIComponent(propiedadId)}/interno`, { method: 'POST', headers: await cabeceras(), body: JSON.stringify({ texto: nota }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso({ tipo: 'error', texto: j.error ?? 'No se pudo agregar la nota.' }); return }
      setNota('')
      await cargar()
    } catch { setAviso({ tipo: 'error', texto: 'No se pudo agregar la nota. Revisa tu conexión.' }) } finally { setEnviando(false) }
  }

  return (
    <section data-panel-interno aria-labelledby="titulo-interno" style={{ marginTop: '1.6rem', padding: '1.1rem 1.2rem', border: '1px solid var(--borde-frio)', borderRadius: 12, background: '#f8fafc' }}>
      <h2 id="titulo-interno" style={{ margin: 0, fontSize: '1.05rem' }}>Origen, comisión y notas internas</h2>
      <p style={{ margin: '4px 0 12px', fontSize: '.82rem', color: '#4b5563' }}>
        {datos?.veTodas
          ? 'Solo el equipo de VIVE BIEN y el dueño ven esto. Como equipo, ves las notas de todos.'
          : 'Solo tú y el equipo de VIVE BIEN ven esto. Tus notas internas no se muestran en el anuncio ni a los clientes.'}
      </p>

      {estado === 'cargando' && <p role="status" style={{ fontSize: '.88rem' }}>Cargando…</p>}
      {estado === 'no_disponible' && <p role="status" style={{ fontSize: '.88rem' }}>Las notas internas todavía no están disponibles.</p>}
      {estado === 'error' && (
        <p role="alert" style={{ fontSize: '.88rem', color: 'var(--error-fuerte)' }}>
          No se pudo cargar. <button type="button" onClick={() => { setEstado('cargando'); void cargar() }} style={{ ...boton, padding: '4px 10px' }}>Reintentar</button>
        </p>
      )}

      {estado === 'listo' && datos && (
        <>
          <p data-subida-por style={{ margin: '0 0 12px', fontSize: '.88rem' }}>
            <strong>Subida por:</strong>{' '}
            {datos.subidaPor
              ? `${datos.subidaPor.nombre || 'Sin nombre'}${datos.subidaPor.correo ? ` · ${datos.subidaPor.correo}` : ''}${datos.subidaPor.rol ? ` · ${ROL[datos.subidaPor.rol] ?? datos.subidaPor.rol}` : ''}${datos.subidaPor.modalidad ? ` (${datos.subidaPor.modalidad})` : ''}`
              : 'Equipo de VIVE BIEN (sin cuenta de publicador)'}
          </p>

          {!datos.origen && (
            <p data-sin-origen role="note" style={{ margin: '0 0 12px', padding: '8px 12px', borderRadius: 8, background: 'var(--aviso-fondo-calido)', color: 'var(--aviso-fuerte)', fontSize: '.85rem' }}>
              Aún no está registrado de quién es esta propiedad. Captúralo abajo para no tener que adivinarlo después.
            </p>
          )}

          <form onSubmit={guardarOrigen} style={{ display: 'grid', gap: 12 }} aria-label="Origen y comisión pactada">
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <div>
                <label htmlFor="int-origen" style={etiqueta}>¿De quién es? *</label>
                <select id="int-origen" value={forma.origen_tipo} onChange={poner('origen_tipo')} style={campo} required>
                  <option value="">Elige…</option>
                  {ORIGENES.map((o) => <option key={o} value={o}>{ETIQUETA_ORIGEN[o]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="int-nombre" style={etiqueta}>Nombre del dueño o contacto</label>
                <input id="int-nombre" value={forma.titular_nombre} onChange={poner('titular_nombre')} maxLength={200} style={campo} />
              </div>
              <div>
                <label htmlFor="int-empresa" style={etiqueta}>Inmobiliaria o empresa</label>
                <input id="int-empresa" value={forma.titular_empresa} onChange={poner('titular_empresa')} maxLength={200} style={campo} />
              </div>
              <div>
                <label htmlFor="int-tel" style={etiqueta}>Teléfono</label>
                <input id="int-tel" type="tel" inputMode="tel" value={forma.titular_telefono} onChange={poner('titular_telefono')} maxLength={40} style={campo} />
              </div>
              <div>
                <label htmlFor="int-correo" style={etiqueta}>Correo</label>
                <input id="int-correo" type="email" value={forma.titular_correo} onChange={poner('titular_correo')} maxLength={200} style={campo} />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <div>
                <label htmlFor="int-com-tipo" style={etiqueta}>Comisión pactada</label>
                <select id="int-com-tipo" value={forma.comision_tipo} onChange={poner('comision_tipo')} style={campo}>
                  <option value="">Sin capturar</option>
                  {COMISIONES.map((c) => <option key={c} value={c}>{ETIQUETA_COMISION[c]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="int-com-valor" style={etiqueta}>Valor</label>
                <input id="int-com-valor" type="number" min={0} step="0.01" inputMode="decimal" value={forma.comision_valor} onChange={poner('comision_valor')} style={campo} aria-describedby="int-com-ayuda" />
              </div>
            </div>
            <p id="int-com-ayuda" style={{ margin: '-6px 0 0', fontSize: '.78rem', color: '#4b5563' }}>
              Referencia del plan: venta de 3 a 4 % del precio, renta de 1 mes. No se rellena sola: escribe lo que se pactó de verdad.
            </p>
            <div>
              <label htmlFor="int-com-detalle" style={etiqueta}>Detalle de la comisión (por ejemplo, cómo se reparte si es compartida)</label>
              <textarea id="int-com-detalle" value={forma.comision_detalle} onChange={poner('comision_detalle')} rows={3} maxLength={1000} style={{ ...campo, resize: 'vertical' }} />
            </div>
            <div>
              <button type="submit" disabled={guardando} style={{ ...boton, opacity: guardando ? .6 : 1 }}>{guardando ? 'Guardando…' : 'Guardar origen y comisión'}</button>
            </div>
          </form>

          {aviso && (
            <p role={aviso.tipo === 'error' ? 'alert' : 'status'} style={{ margin: '10px 0 0', fontSize: '.85rem', color: aviso.tipo === 'error' ? 'var(--error-fuerte)' : 'var(--exito-fuerte)' }}>{aviso.texto}</p>
          )}

          {datos.veTodas && datos.colaboradores && datos.origen && (
            <section aria-labelledby="int-colab-t" data-colaborador-propiedad style={{ marginTop: '1.4rem', padding: '12px 14px', border: '1px solid var(--borde-frio)', borderRadius: 10, background: '#fff' }}>
              <h3 id="int-colab-t" style={{ margin: 0, fontSize: '.95rem' }}>Asesor o inmobiliaria que colaboró <span style={{ fontWeight: 400, color: '#4b5563' }}>(opcional)</span></h3>
              <p style={{ margin: '4px 0 10px', fontSize: '.8rem', color: '#4b5563' }}>Por ejemplo, un trato directo cuyo cliente llegó con ayuda de otro asesor. Se elige del directorio de colaboradores; si no está, créalo aquí mismo.</p>
              {datos.colaborador && !creando && <p data-colaborador-actual style={{ margin: '0 0 8px', fontSize: '.88rem' }}><strong>Ligado:</strong> {datos.colaborador.nombre}{datos.colaborador.empresa ? ` · ${datos.colaborador.empresa}` : ''}</p>}
              {!creando && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 14rem' }}>
                    <label htmlFor="int-colab" style={etiqueta}>Colaborador del directorio</label>
                    <select id="int-colab" value={colabElegido} onChange={(e) => { if (e.target.value === '__crear') { setCreando(true) } else setColabElegido(e.target.value) }} style={campo} data-select-colaborador>
                      <option value="">{datos.colaboradores.length ? 'Ninguno' : 'Aún no hay colaboradores en el directorio'}</option>
                      {datos.colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.empresa ? ` · ${c.empresa}` : ''}</option>)}
                      {datos.puedeCrearColaborador && <option value="__crear">➕ Crear colaborador nuevo…</option>}
                    </select>
                  </div>
                  <button type="button" onClick={() => { void ligarColaborador() }} disabled={ligando || colabElegido === (datos.colaborador?.id ?? '')} style={{ ...boton, opacity: ligando || colabElegido === (datos.colaborador?.id ?? '') ? .6 : 1 }} data-guardar-colaborador>{ligando ? 'Guardando…' : 'Guardar colaborador'}</button>
                </div>
              )}
              {creando && (
                <div data-crear-colaborador style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
                  <div><label htmlFor="int-nc-tipo" style={etiqueta}>Es</label><select id="int-nc-tipo" value={nuevoColab.tipo} onChange={(e) => setNuevoColab((n) => ({ ...n, tipo: e.target.value }))} style={campo}><option value="agente">Asesor / agente</option><option value="inmobiliaria">Inmobiliaria</option><option value="broker">Broker</option><option value="otro">Otro</option></select></div>
                  <div><label htmlFor="int-nc-nombre" style={etiqueta}>Nombre *</label><input id="int-nc-nombre" value={nuevoColab.nombre} maxLength={120} onChange={(e) => setNuevoColab((n) => ({ ...n, nombre: e.target.value }))} style={campo} autoComplete="off" /></div>
                  <div><label htmlFor="int-nc-empresa" style={etiqueta}>Empresa</label><input id="int-nc-empresa" value={nuevoColab.empresa} maxLength={120} onChange={(e) => setNuevoColab((n) => ({ ...n, empresa: e.target.value }))} style={campo} autoComplete="off" /></div>
                  <div><label htmlFor="int-nc-tel" style={etiqueta}>Teléfono</label><input id="int-nc-tel" type="tel" inputMode="tel" value={nuevoColab.telefono} maxLength={40} onChange={(e) => setNuevoColab((n) => ({ ...n, telefono: e.target.value }))} style={campo} autoComplete="off" /></div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <button type="button" onClick={() => { void ligarColaborador() }} disabled={ligando || nuevoColab.nombre.trim().length < 2} style={{ ...boton, opacity: ligando || nuevoColab.nombre.trim().length < 2 ? .6 : 1 }} data-crear-y-ligar>{ligando ? 'Guardando…' : 'Crear y ligar'}</button>
                    <button type="button" onClick={() => setCreando(false)} disabled={ligando} style={{ ...boton, background: '#fff', color: 'var(--azul)', border: '1px solid var(--borde-frio)' }}>Cancelar</button>
                  </div>
                </div>
              )}
            </section>
          )}

          <h3 style={{ margin: '1.4rem 0 6px', fontSize: '.95rem' }}>Notas internas</h3>
          <form onSubmit={agregarNota} style={{ display: 'grid', gap: 8 }} aria-label="Agregar nota interna">
            <label htmlFor="int-nota" style={etiqueta}>Nueva nota</label>
            <textarea id="int-nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={3} maxLength={MAXIMO_NOTA} placeholder="Acuerdos, condiciones, pendientes con el dueño…" style={{ ...campo, resize: 'vertical' }} />
            <div><button type="submit" disabled={enviando || !nota.trim()} style={{ ...boton, opacity: enviando || !nota.trim() ? .6 : 1 }}>{enviando ? 'Agregando…' : 'Agregar nota'}</button></div>
          </form>
          {datos.notas.length === 0 ? (
            <p style={{ margin: '10px 0 0', fontSize: '.85rem', color: '#4b5563' }}>Todavía no hay notas. Cuando agregues una, aparecerá aquí con su fecha; las notas no se pueden editar ni borrar.</p>
          ) : (
            <ul data-notas style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 8 }}>
              {datos.notas.map((n) => (
                <li key={n.id} style={{ padding: '8px 12px', borderRadius: 8, background: '#fff', border: '1px solid var(--borde-frio)' }}>
                  <p style={{ margin: 0, fontSize: '.76rem', color: '#4b5563' }}>{ROL[n.autor_rol] ?? n.autor_rol} · {fechaCorta(n.creado_en)}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '.9rem', whiteSpace: 'pre-wrap' }}>{n.texto}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
