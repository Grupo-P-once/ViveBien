'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { auth } from '@/lib/firebase'

/**
 * Todo el que dejó sus datos, en una sola tabla.
 *
 * Antes había que mirar en tres pestañas distintas —y aun así faltaba gente,
 * porque una de las cuatro tablas no se enseñaba en ningún sitio.
 *
 * Dos decisiones que importan:
 *
 *  · **La columna de consentimiento no se esconde.** Quien entró por un
 *    formulario que escribe directo del navegador llega sin versión de aviso
 *    registrada. Compartir su teléfono con un anunciante sin poder demostrar
 *    qué aceptó es exposición legal, no un detalle de datos. Se ve.
 *  · **La fuente tampoco.** Mientras haya cuatro tablas, saber de cuál salió
 *    cada registro es lo que permite arreglar el origen.
 */

type Registro = {
  id: string
  tipo: string
  nombre: string | null
  email: string | null
  telefono: string | null
  mensaje: string | null
  propiedad: string | null
  fuente: string
  consentimiento: string | null
  creado: string | null
}

const ETIQUETA: Record<string, { texto: string; bg: string; color: string }> = {
  cuenta:     { texto: 'Cuenta',      bg: '#EFF6FF', color: '#1D4ED8' },
  publicador: { texto: 'Publicador',  bg: '#F5F3FF', color: '#6D28D9' },
  interesado: { texto: 'Interesado',  bg: 'var(--exito-fondo)', color: 'var(--exito-fuerte)' },
  valuacion:  { texto: 'Valuación',   bg: 'var(--aviso-fondo)', color: 'var(--aviso-fuerte)' },
  contacto:   { texto: 'Contacto',    bg: '#FEF2F2', color: '#B91C1C' },
}

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })
}

export default function Registros() {
  const [datos, setDatos] = useState<Registro[]>([])
  const [sinCons, setSinCons] = useState(0)
  const [fallos, setFallos] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/admin/registros', { headers: await cabeceras() })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || 'No se pudieron cargar los registros.')
        setDatos([])
      } else {
        setDatos(j.registros ?? [])
        setSinCons(j.sinConsentimiento ?? 0)
        setFallos(j.fallos ?? [])
        setError('')
      }
    } catch {
      setError('Error de red al cargar los registros.')
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const conteos = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of datos) c[r.tipo] = (c[r.tipo] ?? 0) + 1
    return c
  }, [datos])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return datos.filter(r => {
      if (filtro !== 'todos' && r.tipo !== filtro) return false
      if (!q) return true
      return [r.nombre, r.email, r.telefono, r.mensaje, r.propiedad]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    })
  }, [datos, filtro, busqueda])

  const celda: React.CSSProperties = {
    padding: '10px 12px', fontSize: '.84rem', color: '#374151',
    borderBottom: '1px solid var(--linea-oscura, rgba(11,11,12,.1))',
    verticalAlign: 'top',
  }

  return (
    <section className="carta" style={{ padding: '1.5rem 1.6rem', marginBottom: '2rem' }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <h3 style={{
          fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
          color: 'var(--azul)', fontSize: '1.05rem', margin: 0, flex: 1, minWidth: 200,
        }}>
          Registros y solicitudes
        </h3>
        <span style={{ fontSize: '.82rem', color: '#8B95A3' }}>
          {cargando ? 'Cargando…' : `${datos.length} en total`}
        </span>
        <button onClick={cargar} style={{
          background: 'none', border: 'none', color: 'var(--azul)',
          fontSize: '.83rem', cursor: 'pointer', textDecoration: 'underline', padding: 0,
        }}>
          Actualizar
        </button>
      </header>

      {error && (
        <p style={{ background: 'var(--error-fondo-fuerte)', color: 'var(--error-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.88rem' }}>
          {error}
        </p>
      )}

      {fallos.length > 0 && (
        <p style={{ background: 'var(--aviso-fondo-calido)', color: 'var(--aviso-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.85rem', marginBottom: '1rem', lineHeight: 1.55 }}>
          Faltan datos de {fallos.length === 1 ? 'una tabla' : `${fallos.length} tablas`}: no se
          pudo consultar. <strong>Puede haber más gente de la que se ve aquí.</strong>
        </p>
      )}

      {/* El aviso de consentimiento no se esconde: es exposición legal. */}
      {sinCons > 0 && !cargando && (
        <p style={{
          background: 'var(--aviso-fondo-calido)', borderLeft: '3px solid #c2410c',
          color: '#7c2d12', padding: '10px 14px', borderRadius: '0 8px 8px 0',
          fontSize: '.85rem', marginBottom: '1rem', lineHeight: 1.6,
        }}>
          <strong>{sinCons}</strong> {sinCons === 1 ? 'persona llegó' : 'personas llegaron'} sin
          versión de consentimiento registrada. Compartir su teléfono con un anunciante sin poder
          demostrar qué aceptaron es exposición bajo la LFPDPPP.
        </p>
      )}

      {/* Filtros por tipo */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[['todos', `Todos (${datos.length})`], ...Object.entries(conteos).map(([t, n]) => [t, `${ETIQUETA[t]?.texto ?? t} (${n})`])].map(([v, t]) => (
          <button key={v} onClick={() => setFiltro(v)}
            style={{
              padding: '6px 13px', borderRadius: 18, fontSize: '.8rem', cursor: 'pointer',
              fontWeight: filtro === v ? 700 : 500,
              border: `1px solid ${filtro === v ? 'var(--azul)' : 'var(--borde-frio)'}`,
              background: filtro === v ? 'var(--azul)' : '#fff',
              color: filtro === v ? '#fff' : '#374151',
            }}>
            {t}
          </button>
        ))}
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar nombre, correo, teléfono…"
          style={{
            flex: '1 1 200px', minWidth: 160, padding: '6px 12px',
            border: '1px solid var(--borde-frio)', borderRadius: 18, fontSize: '.82rem',
          }} />
      </div>

      {!cargando && visibles.length === 0 && !error && (
        <p style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#8B95A3', fontSize: '.88rem', lineHeight: 1.6 }}>
          {datos.length === 0
            ? 'Todavía no hay registros. Aquí aparecerá todo el que cree una cuenta, pregunte por una propiedad o deje sus datos.'
            : 'Nadie coincide con ese filtro.'}
        </p>
      )}

      {visibles.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead>
              <tr>
                {['Tipo', 'Nombre', 'Contacto', 'Interés', 'Aviso', 'Fecha'].map(h => (
                  <th key={h} className="etiqueta" style={{
                    textAlign: 'left', padding: '8px 12px', color: '#8B95A3',
                    borderBottom: '1px solid var(--borde-frio)', fontSize: '.66rem',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map(r => {
                const et = ETIQUETA[r.tipo] ?? { texto: r.tipo, bg: '#f1f5f9', color: '#475569' }
                const esCuenta = r.tipo === 'cuenta' || r.tipo === 'publicador'
                return (
                  <tr key={r.id}>
                    <td style={celda}>
                      <span style={{
                        background: et.bg, color: et.color, padding: '3px 9px',
                        borderRadius: 5, fontSize: '.72rem', fontWeight: 700, whiteSpace: 'nowrap',
                      }}>
                        {et.texto}
                      </span>
                    </td>
                    <td style={{ ...celda, fontWeight: 600, color: '#1F2024' }}>
                      {r.nombre ?? <span style={{ color: '#B9B3AA' }}>sin nombre</span>}
                    </td>
                    <td style={celda}>
                      {r.email && <div>{r.email}</div>}
                      {r.telefono && (
                        <a href={`https://wa.me/${r.telefono.replace(/\D/g, '')}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--whatsapp, #25D366)', fontWeight: 600, textDecoration: 'none' }}>
                          {r.telefono}
                        </a>
                      )}
                      {!r.email && !r.telefono && <span style={{ color: '#B9B3AA' }}>—</span>}
                    </td>
                    <td style={{ ...celda, maxWidth: 260 }}>
                      {r.propiedad && (
                        <div style={{ fontSize: '.78rem', color: 'var(--azul)', fontWeight: 600 }}>{r.propiedad}</div>
                      )}
                      {r.mensaje && (
                        <div style={{ fontSize: '.8rem', color: '#5A6472', lineHeight: 1.45 }}>{r.mensaje}</div>
                      )}
                      {!r.propiedad && !r.mensaje && <span style={{ color: '#B9B3AA' }}>—</span>}
                    </td>
                    <td style={celda}>
                      {esCuenta ? (
                        <span style={{ color: '#B9B3AA', fontSize: '.78rem' }}>n/a</span>
                      ) : r.consentimiento ? (
                        <span style={{ color: 'var(--exito-fuerte)', fontSize: '.78rem', fontWeight: 600 }}>
                          ✓ {r.consentimiento}
                        </span>
                      ) : (
                        <span style={{ color: '#B45309', fontSize: '.78rem', fontWeight: 700 }}>
                          sin registrar
                        </span>
                      )}
                    </td>
                    <td style={{ ...celda, whiteSpace: 'nowrap', color: '#8B95A3' }}>
                      {fecha(r.creado)}
                      <div style={{ fontSize: '.68rem', color: '#B9B3AA' }}>{r.fuente}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
