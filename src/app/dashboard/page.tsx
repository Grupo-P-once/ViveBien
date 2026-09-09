'use client'
import { useState, useEffect } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth'
import { auth, googleProvider } from '@/lib/firebase'
import Link from 'next/link'

interface Propiedad {
  id?: string
  titulo: string
  tipo: string
  operacion: string
  precio: number
  precio_incluye_iva?: boolean
  ubicacion: string
  descripcion: string
  fotos: string[]
  estatus: string
  metros?: number
  recamaras?: number
  banos?: number
  whatsapp?: string
  altura_libre?: number
  andenes?: number
  amenidades?: string[]
  mantenimiento?: number
  video_url?: string
  destacada?: boolean
}

const EMPTY: Omit<Propiedad, 'id'> = {
  titulo: '', tipo: 'nave', operacion: 'renta', precio: 0,
  precio_incluye_iva: false,
  ubicacion: '', descripcion: '', fotos: [], estatus: 'disponible',
  metros: undefined, recamaras: undefined, banos: undefined, whatsapp: '',
  altura_libre: undefined, andenes: undefined, amenidades: [], mantenimiento: undefined,
  video_url: '', destacada: false,
}

// Sólo controla qué se muestra en la interfaz. La autorización real vive en
// el servidor (src/lib/auth-server.ts) y se configura con ADMIN_EMAILS.
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

/** Cabeceras con el ID token de Firebase para las rutas de administración. */
async function authHeaders(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

type Tab = 'metricas' | 'props' | 'leads'
type AuthTab = 'login' | 'register'

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [rol, setRol] = useState<'cliente' | 'publicador' | 'admin' | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Auth form
  const [authTab, setAuthTab] = useState<AuthTab>('login')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [regName, setRegName] = useState('')
  const [regRol, setRegRol] = useState<'cliente' | 'publicador'>('cliente')
  const [loginErr, setLoginErr] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  // Dashboard state
  const [tab, setTab] = useState<Tab>('metricas')
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [contactos, setContactos] = useState<any[]>([])
  const [editando, setEditando] = useState<Partial<Propiedad> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todas' | 'disponible' | 'pausada' | 'eliminada'>('todas')
  const [fotoInput, setFotoInput] = useState('')
  const [uploadingFotos, setUploadingFotos] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // El rol lo dice el servidor. La lista local sólo evita un parpadeo mientras
  // llega la respuesta; no decide nada: cada ruta lo vuelve a comprobar.
  const isAdmin = rol ? rol === 'admin' : (user ? ADMIN_EMAILS.includes((user.email || '').toLowerCase()) : false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u)
      setAuthLoading(false)
      if (!u) { setRol(null); return }

      // Preguntar al servidor qué rol tiene. También da de alta la fila la
      // primera vez que alguien entra.
      authHeaders()
        .then(h => fetch('/api/usuarios/me', { headers: h }))
        .then(r => r.ok ? r.json() : null)
        .then(p => { if (p?.rol) setRol(p.rol) })
        .catch(() => { })

      if (u && ADMIN_EMAILS.includes((u.email || '').toLowerCase())) {
        cargarPropiedades()
        cargarLeads()
        cargarContactos()
      } else if (u) {
        cargarLeadsCliente(u.email || '')
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
      // El nombre y el rol se guardan en el servidor. El rol que llega de aquí
      // es una preferencia: el servidor lo valida y nunca acepta 'admin'.
      await fetch('/api/usuarios/me', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ nombre: regName, rol: regRol }),
      }).catch(() => { })
    } catch (err: any) {
      setLoginErr(err.message || 'Error al crear la cuenta')
    }
  }

  async function loginConGoogle() {
    setLoginErr('')
    setGoogleLoading(true)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err: any) {
      console.error('Google auth error:', err)
      setLoginErr(`${err?.code || ''} ${err?.message || 'error desconocido'}`)
    }
    setGoogleLoading(false)
  }

  async function cargarPropiedades() {
    try {
      const res = await fetch('/api/admin/propiedades')
      const data = await res.json()
      setPropiedades(Array.isArray(data) ? data as Propiedad[] : [])
    } catch { setPropiedades([]) }
  }

  // El servidor decide qué devuelve según el token: todo si eres admin, sólo
  // lo tuyo si no. La tabla ya no se lee desde el navegador.
  async function cargarLeads() {
    try {
      const res = await fetch('/api/leads', { headers: await authHeaders() })
      const data = await res.json()
      setLeads(Array.isArray(data) ? data : [])
    } catch { setLeads([]) }
  }

  // El correo sale del token verificado en el servidor, no de aquí.
  async function cargarLeadsCliente(_correo: string) {
    await cargarLeads()
  }

  async function cargarContactos() {
    try {
      const res = await fetch('/api/admin/contactos', { headers: await authHeaders() })
      const data = await res.json()
      setContactos(Array.isArray(data) ? data : [])
    } catch { setContactos([]) }
  }

  async function guardar() {
    if (!editando) return
    setSaving(true)
    setSaveError('')
    try {
      let res: Response
      if (editando.id) {
        const { id, ...rest } = editando
        res = await fetch(`/api/admin/propiedades/${id}`, {
          method: 'PATCH',
          headers: await authHeaders(),
          body: JSON.stringify(rest),
        })
      } else {
        const newId = editando.titulo?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || Date.now().toString()
        res = await fetch('/api/admin/propiedades', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ ...editando, id: newId }),
        })
      }
      const json = await res.json()
      if (!res.ok) {
        setSaveError(json.error || 'Error al guardar')
        setSaving(false)
        return
      }
      await cargarPropiedades()
      setEditando(null)
      setSaveSuccess('✓ Propiedad guardada correctamente')
      setTimeout(() => setSaveSuccess(''), 4000)
    } catch (err: any) {
      setSaveError(err.message || 'Error de red')
    }
    setSaving(false)
  }

  async function cambiarEstatus(id: string, nuevoEstatus: string) {
    const res = await fetch(`/api/admin/propiedades/${id}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ estatus: nuevoEstatus }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setSaveError(json.error || 'No se pudo cambiar el estatus.')
      return
    }
    await cargarPropiedades()
    setSaveSuccess(`✓ Estatus cambiado a "${nuevoEstatus}"`)
    setTimeout(() => setSaveSuccess(''), 3000)
  }

  async function subirFotos(files: FileList) {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
    if (!cloudName || !preset) {
      alert('Configura NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME y NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET en .env.local')
      return
    }
    setUploadingFotos(true)
    const arr = Array.from(files)
    const urls: string[] = []
    for (let i = 0; i < arr.length; i++) {
      setUploadProgress(Math.round((i / arr.length) * 100))
      const fd = new FormData()
      fd.append('file', arr[i])
      fd.append('upload_preset', preset)
      fd.append('folder', 'vivebien')
      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: fd })
        const data = await res.json()
        if (data.secure_url) urls.push(data.secure_url)
      } catch { /* skip failed */ }
    }
    setEditando(d => ({ ...d, fotos: [...(d?.fotos || []), ...urls] }))
    setUploadingFotos(false)
    setUploadProgress(0)
  }

  async function eliminar(id: string) {
    // Soft delete: cambia estatus a 'eliminada' en vez de borrar
    if (!confirm('¿Archivar esta propiedad? Podrás restaurarla desde la pestaña "Eliminadas".')) return
    await cambiarEstatus(id, 'eliminada')
  }

  async function eliminarDefinitivo(id: string) {
    if (!confirm('¿Eliminar DEFINITIVAMENTE? Esta acción no se puede deshacer.')) return
    const res = await fetch(`/api/admin/propiedades/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setSaveError(json.error || 'No se pudo eliminar la propiedad.')
      return
    }
    await cargarPropiedades()
    setSaveSuccess('✓ Propiedad eliminada definitivamente')
    setTimeout(() => setSaveSuccess(''), 3000)
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
        width: '90%', maxWidth: '420px',
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
            <p style={{ fontSize: '.85rem', color: '#555', margin: '6px 0 2px' }}>¿Qué quieres hacer?</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {([['cliente', 'Buscar propiedades'], ['publicador', 'Publicar una propiedad']] as const).map(([valor, texto]) => (
                <button key={valor} type="button" onClick={() => setRegRol(valor)}
                  aria-pressed={regRol === valor}
                  style={{
                    flex: 1, padding: '10px', fontSize: '.85rem', cursor: 'pointer', borderRadius: '6px',
                    fontWeight: regRol === valor ? 700 : 400,
                    border: regRol === valor ? '2px solid #8B1A1A' : '1px solid #ccc',
                    background: regRol === valor ? '#fdf4f4' : '#fff',
                    color: regRol === valor ? '#8B1A1A' : '#444',
                  }}>
                  {texto}
                </button>
              ))}
            </div>
            {loginErr && <p style={{ color: '#8B1A1A', fontSize: '.85rem' }}>{loginErr}</p>}
            <button type="submit" style={{ padding: '12px', background: '#8B1A1A', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>
              Registrarme
            </button>
          </form>
        )}

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0 4px' }}>
          <div style={{ flex: 1, height: '1px', background: '#ddd' }} />
          <span style={{ color: '#aaa', fontSize: '.82rem', whiteSpace: 'nowrap', fontWeight: 600 }}>— o continúa con —</span>
          <div style={{ flex: 1, height: '1px', background: '#ddd' }} />
        </div>

        {/* Google button */}
        <button
          onClick={loginConGoogle}
          disabled={googleLoading}
          style={{
            width: '100%', padding: '12px', marginTop: '12px',
            background: '#fff', color: '#3c4043',
            border: '1.5px solid #dadce0', borderRadius: '6px',
            fontWeight: 700, cursor: googleLoading ? 'not-allowed' : 'pointer',
            fontSize: '.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '10px', transition: 'box-shadow .2s',
            opacity: googleLoading ? .7 : 1,
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => { if (!googleLoading) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(0,0,0,.15)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '' }}
        >
          {/* Google "G" SVG */}
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          {googleLoading ? 'Conectando...' : 'Continuar con Google'}
        </button>

        <Link href="/" style={{ display: 'block', marginTop: '20px', color: '#1B365D', fontSize: '.85rem' }}>
          ← Volver al inicio
        </Link>
      </div>
    </div>
  )

  /* ── CLIENT PORTAL (non-admin) ── */
  if (!isAdmin) return (
    <div style={{ minHeight: '100vh', background: '#F4F6F8', fontFamily: 'var(--font-montserrat)' }}>
      {/* Header */}
      <header style={{
        background: 'rgba(255,255,255,.6)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(0,0,0,.05)', borderRadius: '50px',
        padding: '.8rem 2rem', boxShadow: '0 2px 8px rgba(0,0,0,.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: '1000px', margin: '15px auto', position: 'sticky', top: '15px', zIndex: 1000,
      }}>
        <h1 style={{ color: '#1B365D', fontSize: '1.1rem', fontWeight: 700 }}>
          <i className="fa fa-user-circle" style={{ marginRight: '.5rem', color: '#8B1A1A' }} />
          Portal de Cliente
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '.85rem', color: '#555', background: '#f0f0f0', padding: '5px 15px', borderRadius: '20px', fontWeight: 600 }}>
            {user.displayName || user.email}
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

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
        {/* Welcome banner */}
        <div style={{
          background: 'linear-gradient(135deg, #1B365D 0%, #8B1A1A 100%)',
          borderRadius: '20px', padding: '2.5rem', color: '#fff', marginBottom: '2rem',
          display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap',
        }}>
          <div style={{
            width: '70px', height: '70px', borderRadius: '50%',
            background: 'rgba(255,255,255,.15)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {user.photoURL ? (
              <img src={user.photoURL} alt="" style={{ width: '70px', height: '70px', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <i className="fa fa-user" style={{ fontSize: '2rem' }} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1.5rem', margin: '0 0 .4rem' }}>
              ¡Bienvenido{user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}!
            </h2>
            <p style={{ opacity: .85, margin: 0, fontSize: '.95rem' }}>
              Este es tu portal personal. Aquí puedes ver tus consultas enviadas y explorar propiedades.
            </p>
          </div>
          <Link href="/propiedades" style={{
            background: 'rgba(255,255,255,.2)', color: '#fff', padding: '.8rem 1.8rem',
            borderRadius: '10px', textDecoration: 'none', fontWeight: 700,
            fontSize: '.9rem', backdropFilter: 'blur(4px)',
            border: '1px solid rgba(255,255,255,.3)', whiteSpace: 'nowrap',
          }}>
            <i className="fa fa-search" style={{ marginRight: '.4rem' }} />Ver Propiedades
          </Link>
        </div>

        {/* Mis consultas */}
        <div style={{ background: '#fff', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 15px rgba(0,0,0,.06)', marginBottom: '2rem' }}>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: '#1B365D', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
            <i className="fa fa-envelope-open" style={{ color: '#8B1A1A', marginRight: '.5rem' }} />
            Mis Consultas Enviadas
          </h3>
          {leads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>
              <i className="fa fa-inbox" style={{ fontSize: '2.5rem', marginBottom: '1rem', display: 'block', opacity: .3 }} />
              <p style={{ marginBottom: '1rem' }}>No has enviado consultas aún.</p>
              <Link href="/propiedades" style={{
                display: 'inline-block', background: '#8B1A1A', color: '#fff',
                padding: '.7rem 1.5rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 700,
              }}>
                Explorar propiedades
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {leads.map((l: any) => (
                <div key={l.id} style={{
                  background: '#F4F6F8', borderRadius: '12px', padding: '1.2rem 1.5rem',
                  borderLeft: '4px solid #1B365D', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', flexWrap: 'wrap', gap: '.8rem',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#1B365D', marginBottom: '.25rem', fontSize: '.95rem' }}>
                      {l.interes || 'Consulta general'}
                    </div>
                    <div style={{ fontSize: '.82rem', color: '#888' }}>
                      <i className="fa fa-calendar" style={{ marginRight: '.3rem' }} />
                      {l.createdAt?.toDate?.()?.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }) || 'Fecha no disponible'}
                    </div>
                    {l.mensaje && <div style={{ fontSize: '.85rem', color: '#555', marginTop: '.3rem', fontStyle: 'italic' }}>"{l.mensaje}"</div>}
                  </div>
                  <span style={{ background: '#e6f4ea', color: '#279546', padding: '4px 12px', borderRadius: '20px', fontSize: '.78rem', fontWeight: 700 }}>
                    <i className="fa fa-check" style={{ marginRight: '.3rem' }} />Recibida
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1rem' }}>
          {[
            { href: '/propiedades?tipo=nave', icon: 'fa-industry', label: 'Naves Industriales', color: '#1B365D' },
            { href: '/propiedades?tipo=casa', icon: 'fa-house', label: 'Casas en Venta', color: '#8B1A1A' },
            { href: '/propiedades?tipo=terreno', icon: 'fa-map', label: 'Terrenos', color: '#279546' },
            { href: '/propiedades?tipo=comercial', icon: 'fa-store', label: 'Locales Comerciales', color: '#D97706' },
          ].map(q => (
            <Link key={q.href} href={q.href} style={{
              background: '#fff', borderRadius: '12px', padding: '1.5rem',
              boxShadow: '0 2px 10px rgba(0,0,0,.06)', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: '1rem',
              borderLeft: `4px solid ${q.color}`, transition: 'transform .2s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = '' }}
            >
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: q.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`fa ${q.icon}`} style={{ color: '#fff', fontSize: '1rem' }} />
              </div>
              <span style={{ fontWeight: 700, color: '#1B365D', fontSize: '.9rem' }}>{q.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )

  /* ── ADMIN DASHBOARD ── */
  return (
    <div style={{ minHeight: '100vh', background: '#F4F6F8', fontFamily: 'var(--font-montserrat)' }}>
      {/* Toast de éxito */}
      {saveSuccess && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 99999,
          background: '#059669', color: '#fff', padding: '.9rem 1.5rem',
          borderRadius: '12px', fontWeight: 700, fontSize: '.9rem',
          boxShadow: '0 8px 30px rgba(5,150,105,.4)',
          display: 'flex', alignItems: 'center', gap: '.6rem',
          animation: 'slideIn .3s ease',
        }}>
          <i className="fa fa-check-circle" style={{ fontSize: '1.1rem' }} />
          {saveSuccess}
        </div>
      )}
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
                    <i className="fa fa-database" style={{ marginRight: '.3rem' }} />Datos reales de Supabase
                  </div>
                </div>
              ))}
            </div>

            {/* Tabla de Leads */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 15px rgba(0,0,0,.08)', marginBottom: '2rem', overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.8rem' }}>
                <h3 style={{ color: '#1B365D', fontSize: '1.1rem', margin: 0 }}>
                  <i className="fa fa-users" style={{ color: '#8B1A1A', marginRight: '.5rem' }} />Leads / Prospectos ({leads.length})
                </h3>
                {leads.length > 0 && (
                  <button
                    onClick={() => {
                      const headers = ['Nombre', 'Teléfono', 'Email', 'Mensaje', 'Propiedad', 'Fecha']
                      const rows = leads.map((l: any) => [
                        l.nombre || '', l.telefono || '', l.email || '',
                        (l.mensaje || l.interes || '').replace(/,/g, ';'),
                        l.propiedad_id || l.origen || '',
                        l.created_at ? new Date(l.created_at).toLocaleDateString('es-MX') : '',
                      ])
                      const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
                      a.download = `leads-vivebien-${new Date().toISOString().split('T')[0]}.csv`
                      a.click()
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '.4rem', background: '#1B365D', color: '#fff', border: 'none', padding: '.55rem 1.1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '.82rem' }}>
                    <i className="fa fa-download" /> Exportar CSV
                  </button>
                )}
              </div>
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
                        {l.created_at ? new Date(l.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tabla de Contactos */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 15px rgba(0,0,0,.08)', overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.8rem' }}>
                <h3 style={{ color: '#1B365D', fontSize: '1.1rem', margin: 0 }}>
                  <i className="fa fa-envelope" style={{ color: '#8B1A1A', marginRight: '.5rem' }} />Contactos del Formulario ({contactos.length})
                </h3>
                {contactos.length > 0 && (
                  <button
                    onClick={() => {
                      const headers = ['Nombre', 'Teléfono', 'Email', 'Mensaje', 'Fecha']
                      const rows = contactos.map((c: any) => [
                        c.nombre || '', c.telefono || '', c.email || '',
                        (c.mensaje || '').replace(/,/g, ';'),
                        c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX') : '',
                      ])
                      const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
                      a.download = `contactos-vivebien-${new Date().toISOString().split('T')[0]}.csv`
                      a.click()
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '.4rem', background: '#279546', color: '#fff', border: 'none', padding: '.55rem 1.1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '.82rem' }}>
                    <i className="fa fa-download" /> Exportar CSV
                  </button>
                )}
              </div>
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
                      <td style={{ padding: '12px 15px', fontSize: '.9rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.mensaje || '—'}</td>
                      <td style={{ padding: '12px 15px', fontSize: '.85rem', color: '#888' }}>
                        {c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
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
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ fontWeight: 800, color: '#222831', fontSize: '1.3rem', margin: 0 }}>
                <i className="fa fa-home" style={{ color: '#8B1A1A', marginRight: '.5rem' }} />
                Propiedades
              </h2>
              <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap' }}>
                <a href="/admin/seed" style={{
                  background: '#1B365D', color: '#fff', border: 'none',
                  padding: '.65rem 1.1rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '.82rem',
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
                }}>
                  <i className="fa fa-database" style={{ marginRight: '.5rem' }} />Seed Supabase
                </a>
                <button onClick={() => setEditando({ ...EMPTY })} style={{
                  background: '#8B1A1A', color: '#fff', border: 'none',
                  padding: '.65rem 1.3rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '.88rem',
                }}>
                  <i className="fa fa-plus" style={{ marginRight: '.5rem' }} />Nueva propiedad
                </button>
              </div>
            </div>

            {/* Tabs por estatus */}
            {(() => {
              const counts = {
                todas: propiedades.length,
                disponible: propiedades.filter(p => p.estatus === 'disponible').length,
                pausada: propiedades.filter(p => p.estatus === 'pausada').length,
                eliminada: propiedades.filter(p => p.estatus === 'eliminada' || p.estatus === 'vendida').length,
              }
              const tabs: { key: typeof statusFilter; label: string; color: string; bg: string }[] = [
                { key: 'todas',      label: `Todas (${counts.todas})`,              color: '#1B365D', bg: '#EFF6FF' },
                { key: 'disponible', label: `Disponibles (${counts.disponible})`,   color: '#059669', bg: '#ecfdf5' },
                { key: 'pausada',    label: `Pausadas (${counts.pausada})`,          color: '#D97706', bg: '#FEF9C3' },
                { key: 'eliminada',  label: `Archivadas (${counts.eliminada})`,      color: '#8B1A1A', bg: '#fee2e2' },
              ]
              return (
                <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
                  {tabs.map(t => (
                    <button key={t.key} onClick={() => setStatusFilter(t.key)} style={{
                      padding: '.45rem 1rem', borderRadius: '8px', border: `2px solid ${statusFilter === t.key ? t.color : '#dde'}`,
                      background: statusFilter === t.key ? t.bg : '#fff',
                      color: statusFilter === t.key ? t.color : '#888',
                      fontWeight: 700, fontSize: '.8rem', cursor: 'pointer', transition: 'all .2s',
                      fontFamily: 'Montserrat, sans-serif',
                    }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )
            })()}

            {/* Tabla */}
            <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.06)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '750px' }}>
                <thead>
                  <tr style={{ background: '#F4F6F8' }}>
                    {['Título / Ubicación', 'Tipo', 'Precio', 'Estatus', 'Cambiar estatus', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '1rem', textAlign: 'left', fontSize: '.82rem', fontWeight: 700, color: '#1B365D', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {propiedades
                    .filter(p => statusFilter === 'todas' ? true : (statusFilter === 'eliminada' ? (p.estatus === 'eliminada' || p.estatus === 'vendida') : p.estatus === statusFilter))
                    .map(p => {
                      const estatusColor = p.estatus === 'disponible' ? { bg: '#dcfce7', color: '#15803d' }
                        : p.estatus === 'pausada' ? { bg: '#fef9c3', color: '#b45309' }
                        : { bg: '#fee2e2', color: '#991b1b' }
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid #eee' }}>
                          <td style={{ padding: '.85rem 1rem', fontSize: '.88rem', fontWeight: 600, maxWidth: '220px' }}>
                            {p.destacada && <i className="fa fa-star" style={{ color: '#D97706', marginRight: '.4rem', fontSize: '.8rem' }} />}
                            <div style={{ fontWeight: 700, color: '#1a1a2e', marginBottom: '.15rem' }}>{p.titulo}</div>
                            <div style={{ fontSize: '.75rem', color: '#888', fontWeight: 400 }}>{p.ubicacion}</div>
                          </td>
                          <td style={{ padding: '.85rem 1rem', fontSize: '.88rem', whiteSpace: 'nowrap' }}>
                            <span style={{ background: '#1B365D', color: '#fff', padding: '3px 10px', borderRadius: '20px', fontSize: '.72rem', fontWeight: 700 }}>
                              {p.tipo}
                            </span>
                            <div style={{ fontSize: '.72rem', color: '#aaa', marginTop: '.2rem', textTransform: 'capitalize' }}>{p.operacion}</div>
                          </td>
                          <td style={{ padding: '.85rem 1rem', fontSize: '.9rem', fontWeight: 800, color: '#8B1A1A', whiteSpace: 'nowrap' }}>
                            {p.precio ? `$${p.precio.toLocaleString('es-MX')}` : '—'}
                            {p.metros ? <div style={{ fontSize: '.72rem', color: '#aaa', fontWeight: 400 }}>{p.metros} m²</div> : null}
                          </td>
                          <td style={{ padding: '.85rem 1rem' }}>
                            <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '.75rem', fontWeight: 700, background: estatusColor.bg, color: estatusColor.color, whiteSpace: 'nowrap' }}>
                              {p.estatus}
                            </span>
                          </td>
                          {/* Quick status change */}
                          <td style={{ padding: '.85rem 1rem' }}>
                            <select
                              value={p.estatus || 'disponible'}
                              onChange={e => p.id && cambiarEstatus(p.id, e.target.value)}
                              style={{ padding: '.4rem .6rem', borderRadius: '6px', border: '1.5px solid #dde', fontSize: '.78rem', fontWeight: 600, cursor: 'pointer', background: '#fafafa' }}
                            >
                              <option value="disponible">✅ Disponible</option>
                              <option value="pausada">⏸ Pausada</option>
                              <option value="eliminada">🗃 Archivar</option>
                            </select>
                          </td>
                          <td style={{ padding: '.85rem 1rem' }}>
                            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                              <button onClick={() => setEditando(p)} style={{
                                background: '#1B365D', color: '#fff', border: 'none',
                                padding: '.4rem .75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '.78rem', fontWeight: 700,
                              }}>
                                <i className="fa fa-pen" style={{ marginRight: '.3rem' }} />Editar
                              </button>
                              {(p.estatus === 'eliminada' || p.estatus === 'vendida') && (
                                <button onClick={() => p.id && eliminarDefinitivo(p.id)} style={{
                                  background: '#7f1d1d', color: '#fff', border: 'none',
                                  padding: '.4rem .75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '.78rem', fontWeight: 700,
                                }}>
                                  <i className="fa fa-trash" style={{ marginRight: '.3rem' }} />Borrar
                                </button>
                              )}
                              {p.estatus !== 'eliminada' && p.estatus !== 'vendida' && (
                                <button onClick={() => p.id && eliminar(p.id)} style={{
                                  background: '#f3f4f6', color: '#555', border: '1px solid #dde',
                                  padding: '.4rem .75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '.78rem', fontWeight: 700,
                                }}>
                                  <i className="fa fa-archive" style={{ marginRight: '.3rem' }} />Archivar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
              {propiedades.filter(p => statusFilter === 'todas' ? true : (statusFilter === 'eliminada' ? (p.estatus === 'eliminada' || p.estatus === 'vendida') : p.estatus === statusFilter)).length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
                  {statusFilter === 'todas' ? 'No hay propiedades aún. ¡Agrega la primera!' : `No hay propiedades con estatus "${statusFilter}".`}
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
                { key: 'precio', label: 'Precio total (MXN)', type: 'number', placeholder: '0' },
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

              {/* IVA */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: '.7rem', cursor: 'pointer',
                padding: '.75rem 1rem', borderRadius: '8px', border: `2px solid ${editando.precio_incluye_iva ? '#059669' : '#DDE'}`,
                background: editando.precio_incluye_iva ? '#ecfdf5' : '#FAFAFA', transition: 'all .2s',
              }}>
                <input type="checkbox" checked={!!editando.precio_incluye_iva}
                  onChange={e => setEditando(d => ({ ...d, precio_incluye_iva: e.target.checked }))}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#059669' }} />
                <div>
                  <span style={{ fontWeight: 700, color: editando.precio_incluye_iva ? '#065f46' : '#1B365D', fontSize: '.9rem', fontFamily: 'Montserrat, sans-serif' }}>
                    <i className="fa fa-receipt" style={{ color: editando.precio_incluye_iva ? '#059669' : '#888', marginRight: '.4rem' }} />
                    El precio ya incluye IVA
                  </span>
                  <div style={{ fontSize: '.75rem', color: '#888', marginTop: '.1rem' }}>
                    {editando.precio_incluye_iva ? 'Se mostrará "IVA incluido" al visitante' : 'Se mostrará "+ IVA" al visitante'}
                  </div>
                </div>
              </label>

              {/* Extra fields for naves */}
              {(editando.tipo === 'nave' || !editando.tipo) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', padding: '1rem', background: '#EFF6FF', borderRadius: '10px', border: '1px solid #BFDBFE' }}>
                  <div>
                    <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Altura libre (m)</label>
                    <input type="number" value={editando.altura_libre ?? ''} placeholder="0"
                      onChange={e => setEditando(d => ({ ...d, altura_libre: parseFloat(e.target.value) || undefined }))}
                      style={{ width: '100%', padding: '.65rem .8rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.88rem', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Andenes</label>
                    <input type="number" value={editando.andenes ?? ''} placeholder="0"
                      onChange={e => setEditando(d => ({ ...d, andenes: parseFloat(e.target.value) || undefined }))}
                      style={{ width: '100%', padding: '.65rem .8rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.88rem', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Mantenimiento $</label>
                    <input type="number" value={editando.mantenimiento ?? ''} placeholder="0"
                      onChange={e => setEditando(d => ({ ...d, mantenimiento: parseFloat(e.target.value) || undefined }))}
                      style={{ width: '100%', padding: '.65rem .8rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.88rem', boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Tipo</label>
                  <select value={editando.tipo || 'nave'} onChange={e => setEditando(d => ({ ...d, tipo: e.target.value }))}
                    style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem' }}>
                    <option value="nave">Nave/Bodega</option>
                    <option value="casa">Casa</option>
                    <option value="terreno">Terreno</option>
                    <option value="comercial">Local</option>
                    <option value="departamento">Departamento</option>
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
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>
                  Amenidades <span style={{ fontWeight: 400, color: '#888' }}>(separadas por coma)</span>
                </label>
                <input type="text" value={(editando.amenidades || []).join(', ')} placeholder="Acceso tráiler, Oficinas, Vigilancia 24/7"
                  onChange={e => setEditando(d => ({ ...d, amenidades: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                  style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>
                  Video URL <span style={{ fontWeight: 400, color: '#888' }}>(YouTube o MP4)</span>
                </label>
                <input type="url" value={editando.video_url || ''} placeholder="https://youtube.com/watch?v=..."
                  onChange={e => setEditando(d => ({ ...d, video_url: e.target.value }))}
                  style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem', boxSizing: 'border-box' }} />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '.7rem', cursor: 'pointer', padding: '.75rem 1rem', background: editando.destacada ? '#FEF9C3' : '#F4F6F8', borderRadius: '8px', border: `2px solid ${editando.destacada ? '#D97706' : '#DDE'}`, transition: 'all .2s' }}>
                <input type="checkbox" checked={!!editando.destacada}
                  onChange={e => setEditando(d => ({ ...d, destacada: e.target.checked }))}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#D97706' }} />
                <span style={{ fontWeight: 700, color: editando.destacada ? '#92400e' : '#1B365D', fontSize: '.9rem', fontFamily: 'Montserrat, sans-serif' }}>
                  <i className="fa fa-star" style={{ color: '#D97706', marginRight: '.4rem' }} />
                  Marcar como Propiedad Destacada
                </span>
                {editando.destacada && <span style={{ marginLeft: 'auto', fontSize: '.75rem', color: '#92400e', fontWeight: 600 }}>⭐ Aparecerá destacada en el sitio</span>}
              </label>

              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.3rem' }}>Descripción</label>
                <textarea rows={3} value={editando.descripcion || ''}
                  onChange={e => setEditando(d => ({ ...d, descripcion: e.target.value }))}
                  placeholder="Descripción de la propiedad..."
                  style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              {/* ── Fotos: upload directo + URL ── */}
              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: '#1B365D', display: 'block', marginBottom: '.6rem' }}>
                  Fotos <span style={{ fontWeight: 400, color: '#888' }}>({(editando.fotos || []).length} imagen{(editando.fotos || []).length !== 1 ? 'es' : ''})</span>
                </label>

                {/* Zona de upload */}
                <input
                  id="foto-upload-input"
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  disabled={uploadingFotos}
                  onChange={e => e.target.files && subirFotos(e.target.files)}
                />

                {uploadingFotos ? (
                  <div style={{ border: '2px dashed #1B365D', borderRadius: '10px', padding: '1.5rem', textAlign: 'center', background: '#EFF6FF', marginBottom: '.8rem' }}>
                    <i className="fa fa-spinner fa-spin" style={{ fontSize: '1.6rem', color: '#1B365D', marginBottom: '.5rem', display: 'block' }} />
                    <span style={{ fontSize: '.88rem', color: '#1B365D', fontWeight: 700 }}>Subiendo fotos… {uploadProgress}%</span>
                    <div style={{ width: '100%', height: '6px', background: '#DDE', borderRadius: '3px', overflow: 'hidden', marginTop: '.6rem' }}>
                      <div style={{ height: '6px', background: '#1B365D', width: `${uploadProgress}%`, transition: 'width .3s', borderRadius: '3px' }} />
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: '.8rem' }}>
                    {/* Botón principal de selección */}
                    <button
                      type="button"
                      onClick={() => document.getElementById('foto-upload-input')?.click()}
                      style={{
                        width: '100%', padding: '.85rem', borderRadius: '10px',
                        border: '2px dashed #8B1A1A', background: '#fdf4f4',
                        color: '#8B1A1A', fontWeight: 700, fontSize: '.92rem',
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: '.6rem', marginBottom: '.5rem',
                        fontFamily: 'Montserrat, sans-serif', transition: 'all .2s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fce8e8' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fdf4f4' }}
                    >
                      <i className="fa fa-folder-open" style={{ fontSize: '1.1rem' }} />
                      Seleccionar fotos de mi computadora
                    </button>
                    <p style={{ textAlign: 'center', fontSize: '.72rem', color: '#aaa', margin: 0 }}>
                      JPG, PNG, WEBP · Puedes seleccionar varias a la vez
                    </p>
                  </div>
                )}

                {/* Grid de previews */}
                {(editando.fotos || []).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.5rem', marginBottom: '.8rem' }}>
                    {(editando.fotos || []).map((url, i) => (
                      <div key={i} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: '8px', overflow: 'hidden', background: '#eee' }}>
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }} />
                        <button
                          onClick={() => setEditando(d => ({ ...d, fotos: (d?.fotos || []).filter((_, j) => j !== i) }))}
                          style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,.65)', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem' }}>
                          <i className="fa fa-times" />
                        </button>
                        {i === 0 && (
                          <span style={{ position: 'absolute', bottom: '4px', left: '4px', background: '#8B1A1A', color: '#fff', fontSize: '.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', letterSpacing: '.5px' }}>
                            PRINCIPAL
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* URL manual (respaldo) */}
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '.72rem', color: '#aaa', whiteSpace: 'nowrap', flexShrink: 0 }}>o URL:</span>
                  <input
                    type="url"
                    value={fotoInput}
                    onChange={e => setFotoInput(e.target.value)}
                    placeholder="https://res.cloudinary.com/..."
                    style={{ flex: 1, padding: '.55rem .8rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.82rem', boxSizing: 'border-box' }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (fotoInput.trim()) { setEditando(d => ({ ...d, fotos: [...(d?.fotos || []), fotoInput.trim()] })); setFotoInput('') }
                      }
                    }}
                  />
                  <button
                    onClick={() => { if (fotoInput.trim()) { setEditando(d => ({ ...d, fotos: [...(d?.fotos || []), fotoInput.trim()] })); setFotoInput('') } }}
                    style={{ background: '#1B365D', color: '#fff', border: 'none', borderRadius: '8px', padding: '.55rem .9rem', cursor: 'pointer', fontWeight: 700, fontSize: '.82rem', whiteSpace: 'nowrap' }}>
                    + URL
                  </button>
                </div>
              </div>
            </div>

            {saveError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '.75rem 1rem', color: '#991b1b', fontSize: '.88rem', fontWeight: 600, marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <i className="fa fa-exclamation-circle" />
                {saveError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button onClick={() => { setEditando(null); setSaveError('') }} style={{
                flex: 1, padding: '1rem', background: '#fff', color: '#1B365D',
                border: '2px solid #1B365D', borderRadius: '10px', fontWeight: 700, cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={guardar} disabled={saving} style={{
                flex: 2, padding: '1rem', background: '#8B1A1A', color: '#fff',
                border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer',
                opacity: saving ? .7 : 1,
              }}>
                {saving ? <><i className="fa fa-spinner fa-spin" style={{ marginRight: '.5rem' }} />Guardando...</> : 'Guardar propiedad'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
