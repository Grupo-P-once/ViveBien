'use client'
import { useState, useEffect, useCallback } from 'react'
import { auth } from '@/lib/firebase'

/**
 * Panel de usuarios: cambiar rol y suspender.
 *
 * `estado: suspendido` existe en la base desde la Fase 1 y **nunca hubo
 * pantalla para usarlo**. En la práctica no se podía suspender a nadie sin
 * entrar a Supabase a mano.
 */

type Usuario = {
  uid: string
  email: string | null
  nombre: string | null
  telefono: string | null
  whatsapp: string | null
  rol: string
  estado: string
  completitud: number | null
  creado_en: string | null
}

const ROLES = [
  { v: 'cliente', t: 'Cliente' },
  { v: 'publicador', t: 'Publicador' },
  { v: 'admin', t: 'Administrador' },
]

const COLOR_ESTADO: Record<string, { bg: string; color: string }> = {
  activo: { bg: 'var(--exito-fondo)', color: 'var(--exito-fuerte)' },
  suspendido: { bg: 'var(--error-fondo-fuerte)', color: 'var(--error-fuerte)' },
  pendiente: { bg: 'var(--aviso-fondo)', color: 'var(--aviso-fuerte)' },
}

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export default function Usuarios() {
  const [datos, setDatos] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/admin/usuarios', { headers: await cabeceras() })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'No se pudieron cargar los usuarios.'); setDatos([]) }
      else { setDatos(j.usuarios ?? []); setError('') }
    } catch { setError('Error de red.') }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function cambiar(uid: string, cambios: Record<string, string>) {
    setOcupado(uid)
    setError('')
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'PATCH', headers: await cabeceras(),
        body: JSON.stringify({ uid, ...cambios }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || 'No se pudo aplicar el cambio.')
      } else {
        setAviso('Cambio aplicado.')
        setTimeout(() => setAviso(''), 3000)
        await cargar()
      }
    } catch { setError('Error de red.') }
    setOcupado(null)
  }

  const celda: React.CSSProperties = {
    padding: '10px 12px', fontSize: '.85rem', color: '#374151',
    borderBottom: '1px solid var(--linea-oscura, rgba(11,11,12,.1))', verticalAlign: 'middle',
  }

  return (
    <section className="carta" style={{ padding: '1.5rem 1.6rem', marginBottom: '2rem' }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: 'var(--azul)', fontSize: '1.05rem', margin: 0, flex: 1, minWidth: 180 }}>
          Usuarios
        </h3>
        <span style={{ fontSize: '.82rem', color: '#8B95A3' }}>
          {cargando ? 'Cargando…' : `${datos.length}`}
        </span>
        <button onClick={cargar} style={{ background: 'none', border: 'none', color: 'var(--azul)', fontSize: '.83rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
          Actualizar
        </button>
      </header>

      {error && (
        <p style={{ background: 'var(--error-fondo-fuerte)', color: 'var(--error-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.86rem', marginBottom: '1rem', lineHeight: 1.55 }}>
          {error}
        </p>
      )}
      {aviso && (
        <p style={{ background: 'var(--exito-fondo)', color: 'var(--exito-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.86rem', marginBottom: '1rem' }}>
          {aviso}
        </p>
      )}

      {!cargando && datos.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#8B95A3', fontSize: '.88rem', lineHeight: 1.65 }}>
          <p style={{ margin: 0 }}>Todavía no hay usuarios en la tabla.</p>
          <p style={{ margin: '.6rem 0 0', fontSize: '.82rem' }}>
            La fila de cada persona se crea la primera vez que entra al panel.
            Si alguien se registró mientras la base no respondía, aparecerá
            cuando vuelva a entrar.
          </p>
        </div>
      )}

      {/* Advertencia permanente: la lista puede no estar completa, y saberlo
          importa antes de concluir que "no hay usuarios". */}
      {datos.length > 0 && (
        <p style={{ fontSize: '.78rem', color: '#8B95A3', marginBottom: '.75rem', lineHeight: 1.55 }}>
          Esta lista sale de la tabla <code>usuarios</code>, que se llena la primera
          vez que alguien entra al panel. Quien creó cuenta y no ha vuelto todavía
          no aparece aquí.
        </p>
      )}

      {datos.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                {['Persona', 'Contacto', 'Rol', 'Estado', ''].map(h => (
                  <th key={h} className="etiqueta" style={{ textAlign: 'left', padding: '8px 12px', color: '#8B95A3', borderBottom: '1px solid var(--borde-frio)', fontSize: '.66rem' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map(u => {
                const est = COLOR_ESTADO[u.estado] ?? COLOR_ESTADO.pendiente
                const trabajando = ocupado === u.uid
                return (
                  <tr key={u.uid} style={{ opacity: trabajando ? .5 : 1 }}>
                    <td style={{ ...celda, fontWeight: 600, color: '#1F2024' }}>
                      {u.nombre ?? <span style={{ color: '#B9B3AA', fontWeight: 400 }}>sin nombre</span>}
                      {typeof u.completitud === 'number' && (
                        <div style={{ fontSize: '.7rem', color: '#B9B3AA', fontWeight: 400 }}>
                          perfil {u.completitud}%
                        </div>
                      )}
                    </td>
                    <td style={celda}>
                      {u.email && <div style={{ fontSize: '.8rem' }}>{u.email}</div>}
                      {(u.whatsapp || u.telefono) && (
                        <a href={`https://wa.me/${(u.whatsapp || u.telefono || '').replace(/\D/g, '')}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--whatsapp, #25D366)', fontWeight: 600, fontSize: '.8rem', textDecoration: 'none' }}>
                          {u.whatsapp || u.telefono}
                        </a>
                      )}
                    </td>
                    <td style={celda}>
                      <select value={u.rol} disabled={trabajando}
                        onChange={e => cambiar(u.uid, { rol: e.target.value })}
                        style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--borde-frio)', fontSize: '.82rem', fontFamily: 'inherit', background: '#fff' }}>
                        {ROLES.map(r => <option key={r.v} value={r.v}>{r.t}</option>)}
                      </select>
                    </td>
                    <td style={celda}>
                      <span style={{ background: est.bg, color: est.color, padding: '3px 10px', borderRadius: 5, fontSize: '.72rem', fontWeight: 700 }}>
                        {u.estado}
                      </span>
                    </td>
                    <td style={{ ...celda, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {u.estado === 'suspendido' ? (
                        <button disabled={trabajando} onClick={() => cambiar(u.uid, { estado: 'activo' })}
                          style={{ background: 'var(--exito-fuerte)', color: '#fff', border: 'none', padding: '6px 13px', borderRadius: 7, fontSize: '.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Reactivar
                        </button>
                      ) : (
                        <button disabled={trabajando}
                          onClick={() => {
                            // Suspender corta el acceso de una persona real.
                            // Una confirmación aquí cuesta un segundo; el error
                            // cuesta una llamada enfadada.
                            if (confirm(`¿Suspender a ${u.nombre ?? u.email ?? 'este usuario'}? No podrá entrar hasta que lo reactives.`)) {
                              cambiar(u.uid, { estado: 'suspendido' })
                            }
                          }}
                          style={{ background: '#fff', color: 'var(--error-fuerte)', border: '1px solid var(--error-fuerte)', padding: '6px 13px', borderRadius: 7, fontSize: '.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Suspender
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: '.78rem', color: '#8B95A3', marginTop: '1rem', lineHeight: 1.6 }}>
        No puedes cambiar tu propia cuenta ni la de quien esté en <code>ADMIN_EMAILS</code>:
        esa lista manda sobre la tabla, así que el cambio no tendría efecto.
      </p>
    </section>
  )
}
