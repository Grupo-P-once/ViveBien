'use client'
import { useState, useEffect } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth'
import {
  collection, getDocs, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import Link from 'next/link'

interface Propiedad {
  id?: string
  titulo: string
  tipo: string
  operacion: string
  precio: number
  ubicacion: string
  descripcion: string
  fotos: string[]
  estatus: string
  metros?: number
  recamaras?: number
  banos?: number
  whatsapp?: string
}

const EMPTY: Omit<Propiedad, 'id'> = {
  titulo: '', tipo: 'nave', operacion: 'renta', precio: 0,
  ubicacion: '', descripcion: '', fotos: [], estatus: 'disponible',
  metros: undefined, recamaras: undefined, banos: undefined, whatsapp: '',
}

type Tab = 'metricas' | 'props' | 'leads'
type AuthTab = 'login' | 'register'

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Auth form
  const [authTab, setAuthTab] = useState<AuthTab>('login')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [regName, setRegName] = useState('')
  const [loginErr, setLoginErr] = useState('')

  // Dashboard state
  const [tab, setTab] = useState<Tab>('metricas')
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [contactos, setContactos] = useState<any[]>([])
  const [editando, setEditando] = useState<Partial<Propiedad> | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u)
      setAuthLoading(false)
      if (u) {
        cargarPropiedades()
        cargarLeads()
        cargarContactos()
      }
    })
    return unsub
  }, [])

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoginErr('')
    try {
      await signInWithEmailAndPassword(auth, email, pass)
    } catch {
      setLoginErr('Correo o contraseña incorrectos')
    }
  }

  async function registro(e: React.FormEvent) {
    e.preventDefault()
    setLoginErr('')
    try {
      await createUserWithEmailAndPassword(auth, email, pass)
    } catch (err: any) {
      setLoginErr(err.message || 'Error al crear la cuenta')
    }
  }

  async function cargarPropiedades() {
    const snap = await getDocs(collection(db, 'propiedades'))
    setPropiedades(snap.docs.map(d => ({ id: d.id, ...d.data() } as Propiedad)))
  }

  async function cargarLeads() {
    try {
      const snap = await getDocs(collection(db, 'leads'))
      setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { }
  }

  async function cargarContactos() {
    try {
      const snap = await getDocs(collection(db, 'contactos'))
      setContactos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { }
  }

  async function guardar() {
    if (!editando) return
    setSaving(true)
    try {
      if (editando.id) {
        const { id, ...rest } = editando
        await updateDoc(doc(db, 'propiedades', id!), { ...rest, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, 'propiedades'), { ...editando, createdAt: serverTimestamp() })
      }
      await cargarPropiedades()
      setEditando(null)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar esta propiedad? Esta acción no se puede deshacer.')) return
    await deleteDoc(doc(db, 'propiedades', id))
    await cargarPropiedades()
  }

  /* ── Auth Loading ── */
  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1B365D' }}>
      <i className="fa fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#fff' }} />
    </div>
  )

  /* ── Login screen ── */
  if (!user) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1B365D' }}>
      <div style={{
        background: '#fff', padding: '3rem', borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,.3)', textAlign: 'center',
        width: '90%', maxWidth: '400px',
      }}>
        <i className="fa fa-user-circle" style={{ fontSize: '2.5rem', color: '#8B1A1A', marginBottom: '1rem', display: 'block' }} />
        <h2 style={{ fontFamily: 'var(--font-montserrat)', color: '#1B365D', marginBottom: '.5rem' }}>Mi Cuenta</h2>
        <p style={{ fontSize: '.9rem', color: '#666', marginBottom: '1.5rem' }}>Gestión de Propiedades y Leads</p>

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: '1.5rem', borderBottom: '2px solid #eee' }}>
          {(['login', 'register'] as AuthTab[]).map(t => (
            <button key={t} onClick={() => { setAuthTab(t); setLoginErr('') }} style={{
              flex: 1, padding: '10px', cursor: 'pointer', fontWeight: 700,
              background: 'none', border: 'none',
              color: authTab === t ? '#8B1A1A' : '#888',
              borderBottom: authTab === t ? '2px solid #8B1A1A' : 'none',
              marginBottom: '-2px',
              fontFamily: 'var(--font-montserrat)',
            }}>
              {t === 'login' ? 'Ingresar' : 'Crear Cuenta'}
            </button>
          ))}
        </div>

        {authTab === 'login' ? (
          <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Correo electrónico" required
              style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '1rem' }} />
            <input type="password" value={pass} onChange={e => setPass(e.target.value)}
              placeholder="Contraseña" required
              style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '1rem' }} />
            {loginErr && <p style={{ color: '#8B1A1A', fontSize: '.85rem' }}>{loginErr}</p>}
            <button type="submit" style={{ padding: '12px', background: '#8B1A1A', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>
              Iniciar Sesión
            </button>
          </form>
        ) : (
          <form onSubmit={registro} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="text" value={regName} onChange={e => setRegName(e.target.value)}
              placeholder="Nombre completo" required
              style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '1rem' }} />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Correo electrónico" required
              style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '1rem' }} />
            <input type="password" value={pass} onChange={e => setPass(e.target.value)}
              placeholder="Contraseña (mín. 6 caracteres)" minLength={6} required
              style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '1rem' }} />
            {loginErr && <p style={{ color: '#8B1A1A', fontSize: '.85rem' }}>{loginErr}</p>}
            <button type="submit" style={{ padding: '12px', background: '#8B1A1A', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>
              Registrarme
            </button>
          </form>
        )}

        <Link href="/" style={{ display: 'block', marginTop: '20px', color: '#1B365D', fontSize: '.85rem' }}>
          ← Volver al inicio
        </Link>
      </div>
    </div>
  )

  /* ── Dashboard ── */
  return (
    <div style={{ minHeight: '100vh', background: '#F4F6F8', fontFamily: 'var(--font-montserrat)' }}>
      {/* Header */}
      <header style={{
        background: 'rgba(255,255,255,.6)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(0,0,0,.05)', borderRadius: '50px',
        padding: '.8rem 2rem', boxShadow: '0 2px 8px rgba(0,0,0,.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: '1200px', margin: '15px auto', position: 'sticky', top: '15px', zIndex: 1000,
      }}>
        <h1 style={{ color: '#1B365D', fontSize: '1.2rem', fontWeight: 700 }}>
          <i className="fa fa-chart-pie" style={{ marginRight: '.5rem', color: '#8B1A1A' }} />
          Panel de Administración – Vive Bien
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '.85rem', color: '#555', background: '#f0f0f0', padding: '5px 15px', borderRadius: '20px', fontWeight: 600 }}>
            <i className="fa fa-user-circle" style={{ marginRight: '.4rem' }} />
            {user.email}
          </span>
          <Link href="/" style={{ color: '#8B1A1A', fontWeight: 600, fontSize: '.85rem' }}>← Ver sitio</Link>
          <button onClick={() => signOut(auth)} style={{
            background: 'transparent', color: '#8B1A1A', border: '1px solid #8B1A1A',
            padding: '5px 15px', borderRadius: '20px', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600,
          }}>
            <i className="fa fa-sign-out-alt" style={{ marginRight: '.4rem' }} />Cerrar Sesión
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav style={{ background: '#fff', padding: '0 2rem', display: 'flex', gap: '1rem', borderBottom: '1px solid #ddd', maxWidth: '1200px', margin: '0 auto' }}>
        {([
          { key: 'metricas', label: 'Métricas y Leads', icon: 'fa-chart-bar' },
          { key: 'props', label: 'Mis Propiedades', icon: 'fa-home' },
        ] as { key: Tab; label: string; icon: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '1rem 1.5rem', background: 'none', border: 'none',
            cursor: 'pointer', fontWeight: 600, fontSize: '1rem',
            color: tab === t.key ? '#8B1A1A' : '#666',
            borderBottom: tab === t.key ? '3px solid #8B1A1A' : '3px solid transparent',
            transition: 'color .2s',
          }}>
            <i className={`fa ${t.icon}`} style={{ marginRight: '.5rem' }} />
            {t.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>

        {/* ── TAB: Métricas ── */}
        {tab === 'metricas' && (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
              {[
                { title: 'Total Propiedades', value: propiedades.length, color: '#1B365D', icon: 'fa-home' },
                { title: 'Propiedades Activas', value: propiedades.filter(p => p.estatus === 'disponible').length, color: '#8B1A1A', icon: 'fa-check-circle' },
                { title: 'Leads Registrados', value: leads.length, color: '#5B4FCF', icon: 'fa-users' },
                { title: 'Contactos Formulario', value: contactos.length, color: '#279546', icon: 'fa-envelope' },
              ].map(k => (
                <div key={k.title} style={{
                  background: '#fff', borderRadius: '12px', padding: '1.5rem',
                  boxShadow: '0 4px 15px rgba(0,0,0,.08)', borderLeft: `5px solid ${k.color}`,
                }}>
                  <div style={{ fontSize: '.9rem', color: '#666', marginBottom: '.5rem' }}>
                    <i className={`fa ${k.icon}`} style={{ color: k.color, marginRight: '.4rem' }} />
                    {k.title}
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#222831' }}>{k.value}</div>
                  <div style={{ fontSize: '.8rem', color: '#279546', marginTop: '.5rem', fontWeight: 700 }}>
                    <i className="fa fa-database" style={{ marginRight: '.3rem' }} />Datos reales de Firebase
                  </div>
                </div>
              ))}
            </div>

            {/* Tabla de Leads */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 15px rgba(0,0,0,.08)', marginBottom: '2rem', overflowX: 'auto' }}>
              <h3 style={{ color: '#1B365D', marginBottom: '1rem', fontSize: '1.1rem' }}>
                <i className="fa fa-users" style={{ color: '#8B1A1A', marginRight: '.5rem' }} />Leads / Prospectos
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr style={{ background: '#F4F6F8' }}>
                    {['Nombre', 'Teléfono', 'Email', 'Interés', 'Origen', 'Fecha'].map(h => (
                      <th key={h} style={{ padding: '12px 15px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '.85rem', fontWeight: 700, color: '#1B365D' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>No hay leads registrados aún.</td></tr>
                  ) : leads.map((l: any) => (
                    <tr key={l.id} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '12px 15px', fontSize: '.9rem' }}>{l.nombre}</td>
                      <td style={{ padding: '12px 15px', fontSize: '.9rem' }}>
                        <a href={`https://wa.me/52${l.telefono?.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#25D366', fontWeight: 600 }}>
                          {l.telefono}
                        </a>
                      </td>
                      <td style={{ padding: '12px 15px', fontSize: '.9rem' }}>{l.email || '—'}</td>
                      <td style={{ padding: '12px 15px', fontSize: '.9rem' }}>{l.interes || '—'}</td>
                      <td style={{ padding: '12px 15px', fontSize: '.85rem', color: '#888' }}>{l.origen || '—'}</td>
                      <td style={{ padding: '12px 15px', fontSize: '.85rem', color: '#888' }}>
                        {l.createdAt?.toDate?.()?.toLocaleDateString('es-MX') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tabla de Contactos */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 15px rgba(0,0,0,.08)', overflowX: 'auto' }}>
              <h3 style={{ color: '#1B365D', marginBottom: '1rem', fontSize: '1.1rem' }}>
                <i className="fa fa-envelope" style={{ color: '#8B1A1A', marginRight: '.5rem' }} />Contactos del Formulario
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr style={{ background: '#F4F6F8' }}>
                    {['Nombre', 'Teléfono', 'Email', 'Interés', 'Fecha'].map(h => (
                      <th key={h} style={{ padding: '12px 15px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '.85rem', fontWeight: 700, color: '#1B365D' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contactos.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>No hay contactos registrados aún.</td></tr>
                  ) : contactos.map((c: any) => (
                    <tr key={c.id} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '12px 15px', fontSize: '.9rem' }}>{c.nombre}</td>
                      <td style={{ padding: '12px 15px', fontSize: '.9rem' }}>{c.telefono}</td>
                      <td style={{ padding: '12px 15px', fontSize: '.9rem' }}>{c.email || '—'}</td>
                      <td style={{ padding: '12px 15px', fontSize: '.9rem' }}>{c.interes || '—'}</td>
                      <td style={{ padding: '12px 15px', fontSize: '.85rem', color: '#888' }}>
                        {c.createdAt?.toDate?.()?.toLocaleDateString('es-MX') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── TAB: Propiedades ── */}
        {tab === 'props' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontWeight: 800, color: '#222831', fontSize: '1.3rem' }}>
                <i className="fa fa-home" style={{ color: '#8B1A1A', marginRight: '.5rem' }} />
                Propiedades ({propiedades.length})
              </h2>
              <button onClick={() => setEditando({ ...EMPTY })} style={{
                background: '#8B1A1A', color: '#fff', border: 'none',
                padding: '.75rem 1.5rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '.9rem',
              }}>
                <i className="fa fa-plus" style={{ marginRight: '.5rem' }} />Nueva propiedad
              </button>
            </div>

            <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.06)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                <thead>
                  <tr style={{ background: '#F4F6F8' }}>
                    {['Título', 'Tipo', 'Operación', 'Precio', 'Estatus', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '1rem', textAlign: 'left', fontSize: '.85rem', fontWeight: 700, color: '#1B365D' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {propiedades.map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '.85rem 1rem', fontSize: '.9rem', fontWeight: 600 }}>{p.titulo}</td>
                      <td style={{ padding: '.85rem 1rem', fontSize: '.9rem' }}>
                        <span style={{
                          background: '#1B365D', color: '#fff', padding: '3px 10px',
                          borderRadius: '20px', fontSize: '.75rem', fontWeight: 700,
                        }}>{p.tipo}</span>
                      </td>
                      <td style={{ padding: '.85rem 1rem', fontSize: '.9rem', textTransform: 'capitalize' }}>{p.operacion}</td>
                      <td style={{ padding: '.85rem 1rem', fontSize: '.9rem', fontWeight: 800, color: '#8B1A1A' }}>
                        {p.precio ? `$${p.precio.toLocaleString('es-MX')}` : '—'}
                      </td>
                      <td style={{ padding: '.85rem 1rem' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: '4px', fontSize: '.75rem', fontWeight: 700,
                          background: p.estatus === 'disponible' ? '#e6f4ea' : '#f5f5f5',
                          color: p.estatus === 'disponible' ? '#279546' : '#888',
                        }}>
                          {p.estatus}
                        </span>
                      </td>
                      <td style={{ padding: '.85rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '.5rem' }}>
                          <button onClick={() => setEditando(p)} style={{
                            background: '#1B365D', color: '#fff', border: 'none',
                            padding: '.4rem .8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '.8rem',
                          }}>Editar</button>
                          <button onClick={() => p.id && eliminar(p.id)} style={{
                            background: '#8B1A1A', color: '#fff', border: 'none',
                            padding: '.4rem .8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '.8rem',
                          }}>Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {propiedades.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
                  No hay propiedades aún. ¡Agrega la primera!
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Modal editar / crear propiedad ── */}
      {editando && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
          zIndex: 9000, overflowY: 'auto', padding: '2rem',
        }} onClick={() => setEditando(null)}>
          <div style={{
            background: '#fff', borderRadius: '20px', padding: '2.5rem',
            maxWidth: '600px', margin: '0 auto',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontWeight: 800, color: '#8B1A1A', marginBottom: '1.5rem', fontSize: '1.3rem' }}>
              {editando.id ? 'Editar' : 'Nueva'} Propiedad
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {([
                { key: 'titulo', label: 'Título', type: 'text', placeholder: 'Ej. Nave industrial en Silao' },
                { key: 'ubicacion', label: 'Ubicación', type: 'text', placeholder: 'Ej. Parque Industrial, León' },
                { key: 'precio', label: 'Precio (MXN)', type: 'number', placeholder: '0' },
                { key: 'metros', label: 'Metros cuadrados', type: 'number', placeholder: '0' },
                { key: 'recamaras', label: 'Recámaras', type: 'number', placeholder: '0' },
                { key: 'banos', label: 'Baños', type: 'number', placeholder: '0' },
                { key: 'whatsapp', label: 'WhatsApp (sin + ni espacios)', type: 'text', placeholder: '524771234567' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>{f.label}</label>
                  <input
                    type={f.type}
                    value={(editando as any)[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={e => setEditando(d => ({ ...d, [f.key]: f.type === 'number' ? (parseFloat(e.target.value) || undefined) : e.target.value }))}
                    style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem', boxSizing: 'border-box' }}
                  />
                </div>
              ))}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Tipo</label>
                  <select value={editando.tipo || 'nave'} onChange={e => setEditando(d => ({ ...d, tipo: e.target.value }))}
                    style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem' }}>
                    <option value="nave">Nave/Bodega</option>
                    <option value="casa">Casa</option>
                    <option value="terreno">Terreno</option>
                    <option value="comercial">Local</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Operación</label>
                  <select value={editando.operacion || 'renta'} onChange={e => setEditando(d => ({ ...d, operacion: e.target.value }))}
                    style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem' }}>
                    <option value="renta">Renta</option>
                    <option value="venta">Venta</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Estatus</label>
                <select value={editando.estatus || 'disponible'} onChange={e => setEditando(d => ({ ...d, estatus: e.target.value }))}
                  style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem' }}>
                  <option value="disponible">Disponible</option>
                  <option value="pausada">Pausada</option>
                  <option value="vendida">Vendida / Rentada</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Descripción</label>
                <textarea rows={3} value={editando.descripcion || ''}
                  onChange={e => setEditando(d => ({ ...d, descripcion: e.target.value }))}
                  placeholder="Descripción de la propiedad..."
                  style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>
                  URLs de fotos <span style={{ fontWeight: 400, color: '#888' }}>(una por línea)</span>
                </label>
                <textarea rows={4} value={editando.fotos?.join('\n') || ''}
                  onChange={e => setEditando(d => ({ ...d, fotos: e.target.value.split('\n').filter(Boolean) }))}
                  placeholder="https://ejemplo.com/foto1.jpg&#10;https://ejemplo.com/foto2.jpg"
                  style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button onClick={() => setEditando(null)} style={{
                flex: 1, padding: '1rem', background: '#fff', color: '#1B365D',
                border: '2px solid #1B365D', borderRadius: '10px', fontWeight: 700, cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={guardar} disabled={saving} style={{
                flex: 2, padding: '1rem', background: '#8B1A1A', color: '#fff',
                border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer',
                opacity: saving ? .7 : 1,
              }}>
                {saving ? 'Guardando...' : 'Guardar propiedad'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
