'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { AvisoEntrada, useEntrarConGoogle } from '@/components/acceso/EntrarConGoogle'
import { mensajeDeRegistro } from '@/lib/acceso/google'
import { destinoTrasEntrar, modoClasico, pantallaDeDashboard, type EstadoDelPerfil } from '@/lib/acceso/destino-dashboard'
import { rutaDeEntrada } from '@/lib/pantalla/plegables'
import { CUENTA_DEL_PANEL, enlaceDePerfil } from '@/lib/cuenta/destino'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Metricas from '@/components/Metricas'
import Bienvenida from '@/components/Bienvenida'
import QuieroPublicar from '@/components/QuieroPublicar'
import MisFavoritos from '@/components/MisFavoritos'
import MisBusquedas from '@/components/MisBusquedas'
import AvisoConfiguracion from '@/components/AvisoConfiguracion'
import MetricasCliente from '@/components/MetricasCliente'
import Registros from '@/components/Registros'
import Usuarios from '@/components/Usuarios'
import { nombreDe, nombreProvisional } from '@/lib/propiedad-publica'
import { miniaturaCloudinary } from '@/lib/cloudinary-url'
import Analitica from '@/components/Analitica'
import { subirImagen } from '@/lib/medios/subir'
import PantallaDeEspera from '@/components/acceso/PantallaDeEspera'
import { olvidarPerfilDeSesion, perfilDeSesion } from '@/lib/acceso/perfil-de-sesion'

/** De dónde llegó un lead, en palabras de quien lo va a atender. */
const ORIGENES_LEAD: Record<string, string> = {
  ficha: 'Ficha de propiedad',
  contacto: 'Formulario de contacto',
  portada: 'Portada',
  valuador: 'Valuador',
  registro: 'Ventana de registro',
}

interface Propiedad {
  id?: string
  folio?: string | null
  slug?: string | null
  estado_pub?: string
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

// V-1.1.79 (SEC-08): aquí había una copia PÚBLICA de la lista de correos de
// administración (`NEXT_PUBLIC_ADMIN_EMAILS`): viajaba en el código del sitio
// y le decía a cualquiera qué correos registrar (así se explotaba SEC-00).
// Ahora el rol lo dice sólo el servidor (`/api/usuarios/me`).

/** Cabeceras con el ID token de Firebase para las rutas de administración. */
// Filas que devuelven /api/leads y /api/admin/contactos (el servidor decide los campos; todos pueden faltar).
type FilaLead = { id: number | string; nombre?: string | null; telefono?: string | null; email?: string | null; mensaje?: string | null; interes?: string | null; origen?: string | null; propiedad_id?: string | number | null; created_at?: string | null }
type FilaContacto = { id: number | string; nombre?: string | null; telefono?: string | null; email?: string | null; mensaje?: string | null; created_at?: string | null }

async function authHeaders(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

type Tab = 'metricas' | 'registros' | 'usuarios' | 'props' | 'leads'
type AuthTab = 'login' | 'register'

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [rol, setRol] = useState<'cliente' | 'publicador' | 'admin' | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  /**
   * V-1.1.92 — `'cargando'` NO es lo mismo que «no es admin».
   *
   * Antes se decidía con `rol === 'admin'`, y `rol` empieza en `null`: durante
   * los 200-600 ms que tarda `/api/usuarios/me`, la página se metía por la
   * puerta de «no es admin» y pintaba el portal antiguo entero antes de saber a
   * dónde iba esa persona. Eso era el destello, y le pasaba también a los
   * administradores.
   */
  const [perfil, setPerfil] = useState<EstadoDelPerfil>('cargando')

  // Auth form
  const [authTab, setAuthTab] = useState<AuthTab>('login')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [regName, setRegName] = useState('')
  const [loginErr, setLoginErr] = useState('')
  // V-1.1.83: ventana → plan B por redirección → frase clara; nunca el código crudo.
  const google = useEntrarConGoogle('dashboard')
  const googleLoading = google.entrando

  // Dashboard state
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('metricas')
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [leads, setLeads] = useState<FilaLead[]>([])
  const [contactos, setContactos] = useState<FilaContacto[]>([])
  const [editando, setEditando] = useState<Partial<Propiedad> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todas' | 'disponible' | 'pausada' | 'eliminada'>('todas')
  const [fotoInput, setFotoInput] = useState('')
  const [uploadingFotos, setUploadingFotos] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // El rol lo dice el servidor; cada ruta lo vuelve a comprobar.
  const isAdmin = rol === 'admin'

  // Sin sesión, a la pantalla de acceso, conservando a dónde se quería ir
  // (incluido `?clasico=1`, que así sigue funcionando después de entrar).
  useEffect(() => {
    if (authLoading || user) return
    const busqueda = typeof window === 'undefined' ? '' : window.location.search
    // `?clasico=1` es la escotilla: si `/entrar` fallara alguna vez, aquí
    // sigue habiendo una forma de entrar. No se desvía.
    if (modoClasico(busqueda)) return
    const aqui = typeof window === 'undefined' ? '/dashboard' : window.location.pathname + busqueda
    router.replace(rutaDeEntrada(aqui))
  }, [authLoading, user, router])

  const cargarPropiedades = useCallback(async () => {
    try {
      // E-35: la ruta de administración exige sesión (antes devolvía solo lo público a cualquiera).
      const res = await fetch('/api/admin/propiedades', { headers: await authHeaders() })
      const data = await res.json()
      setPropiedades(Array.isArray(data) ? data as Propiedad[] : [])
    } catch { setPropiedades([]) }
  }, [])

  // El servidor decide qué devuelve según el token: todo si eres admin, sólo
  // lo tuyo si no. La tabla ya no se lee desde el navegador.
  const cargarLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/leads', { headers: await authHeaders() })
      const data = await res.json()
      setLeads(Array.isArray(data) ? data : [])
    } catch { setLeads([]) }
  }, [])

  // El correo sale del token verificado en el servidor, no de aquí.
  const cargarLeadsCliente = useCallback(async () => {
    await cargarLeads()
  }, [cargarLeads])

  const cargarContactos = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/contactos', { headers: await authHeaders() })
      const data = await res.json()
      setContactos(Array.isArray(data) ? data : [])
    } catch { setContactos([]) }
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u)
      setAuthLoading(false)
      if (!u) { olvidarPerfilDeSesion(); setRol(null); setPerfil('cargando'); return }

      // Preguntar al servidor qué rol tiene. También da de alta la fila la
      // primera vez que alguien entra. La respuesta se comparte unos segundos con el marco del panel de
      // destino (`perfil-de-sesion.ts`), para que entrar sea UNA consulta y no dos.
      perfilDeSesion(u.uid, () => u.getIdToken())
        .then(r => r.ok ? r.datos : null)
        .then(p => {
          // Cambio de cuenta: una respuesta tardía de la sesión anterior no decide nada.
          if (auth.currentUser?.uid !== u.uid) return
          if (p?.rol) setRol(p.rol as 'cliente' | 'publicador' | 'admin')
          setPerfil(p ?? 'sin_perfil')

          // V-1.1.74 — el panel de administración es ahora /admin. `?clasico=1`
          // abre este panel anterior por si hiciera falta algo mientras se retira.
          //
          // V-1.1.92 — la MISMA función decide si se navega y qué se pinta, así
          // que no pueden discrepar.
          const decision = pantallaDeDashboard({
            authLoading: false,
            hayUsuario: true,
            perfil: p ?? 'sin_perfil',
            busqueda: window.location.search,
            correoSesion: u.email,
          })
          if (decision.estado === 'redirigir') {
            router.replace(decision.destino)
            // No se cargan datos de un panel que nadie va a ver.
            return
          }

          // Qué se carga depende del rol que dice el servidor, no de una lista local.
          if (p?.rol === 'admin') {
            cargarPropiedades()
            cargarLeads()
            cargarContactos()
          } else {
            cargarLeadsCliente()
          }
        })
        .catch(() => {
          // La petición terminó y no hay perfil: estado RESUELTO, no espera.
          setPerfil('sin_perfil')
          cargarLeadsCliente()
        })
    })
    return unsub
  }, [router, cargarPropiedades, cargarLeads, cargarContactos, cargarLeadsCliente])

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
      olvidarPerfilDeSesion()
      await fetch('/api/usuarios/me', {
        method: 'PATCH',
        headers: await authHeaders(),
        // El rol no viaja: todos entran como cliente.
        body: JSON.stringify({ nombre: regName }),
      }).catch(() => { })
    } catch (err) {
      const codigo = (err as { code?: string } | null)?.code
      console.warn('[registro con correo]', codigo)
      setLoginErr(mensajeDeRegistro(codigo))
    }
  }

  function loginConGoogle() {
    setLoginErr('')
    google.entrar()
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
      // El servidor quita las columnas que aún no existen para no perder el
      // resto del formulario. Si eso pasa hay que DECIRLO: el «+ IVA» se
      // descartaba en silencio y nadie se enteraba (V-1.1.84).
      if (Array.isArray(json.omitidas) && json.omitidas.length) {
        setSaveError(json.warning || `No se guardó: ${json.omitidas.join(', ')}.`)
        setSaving(false)
        return
      }
      setSaveSuccess('✓ Propiedad guardada correctamente')
      setTimeout(() => setSaveSuccess(''), 4000)
    } catch (err) {
      setSaveError((err as Error | null)?.message || 'Error de red')
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
    setUploadingFotos(true)
    const arr = Array.from(files)
    const urls: string[] = []
    for (let i = 0; i < arr.length; i++) {
      setUploadProgress(Math.round((i / arr.length) * 100))
      // V-1.1.78 (SEC-05): subida firmada; sin id (propiedad nueva) sólo la firma un admin.
      const r = await subirImagen(arr[i], { proposito: 'propiedad', propiedadId: editando?.id ?? null })
      if (r.ok) urls.push(r.url)
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
  /**
   * V-1.1.92 — LA PUERTA QUE FALTABA.
   *
   * Mientras no se sepa a dónde va esta persona, lo único que se monta es la
   * pantalla mínima. El panel antiguo **no se construye**: no está oculto por
   * CSS, no está detrás de un `opacity`, no se pinta y luego se navega. Es
   * inalcanzable durante `resolviendo` y durante `redirigir`.
   */
  const pantalla = pantallaDeDashboard({
    authLoading,
    hayUsuario: !!user,
    perfil,
    busqueda: typeof window === 'undefined' ? '' : window.location.search,
    correoSesion: user?.email ?? null,
  })

  /**
   * V-1.1.93 (D-29.4) · QUIEN NO TIENE SESIÓN SE VA A `/entrar`.
   *
   * Aquí vivía una de las tres pantallas de acceso del sistema: la tarjeta
   * con pestañas, correo y contraseña y el botón de Google. Ahora hay una
   * sola, y ésta se queda como puerta de compatibilidad — sigue existiendo
   * `?clasico=1`, y al volver de `/entrar` se resuelve el destino por rol
   * como siempre.
   *
   * Mientras se navega se enseña la pantalla mínima, no la tarjeta: el panel
   * antiguo no se monta ni un instante (D-45).
   */
  const clasico = modoClasico(typeof window === 'undefined' ? '' : window.location.search)
  const aEntrar = pantalla.estado === 'acceso' && !clasico

  // E-30 — enlace de invitación para OTRO correo: se dice con claridad; no se consume nada ni se sigue «como si nada».
  if (pantalla.estado === 'invitacion_otro_correo') return (
    <main style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--hueso)' }}>
      <div role="alert" style={{ maxWidth: 520, background: '#fff', borderRadius: 16, padding: '2rem', boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
        <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: '1.3rem', color: 'var(--azul)', marginBottom: '.8rem' }}>Esta invitación es para otro correo</h1>
        <p style={{ lineHeight: 1.7, color: '#444', marginBottom: '.6rem' }}>
          La invitación es para <strong>{pantalla.invitado}</strong> y ahora tienes abierta la sesión de <strong>{pantalla.actual}</strong>.
          Para recibirla, cierra esta sesión y entra con <strong>{pantalla.invitado}</strong>. Con la sesión actual no se aplica nada.
        </p>
        <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap', marginTop: '1.2rem' }}>
          <button onClick={() => signOut(auth)} style={{ background: 'var(--rojo-marca)', color: '#fff', padding: '.75rem 1.4rem', borderRadius: 10, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            Cerrar sesión y entrar con ese correo
          </button>
          {/* Quitar `?invitado=` y seguir el flujo de ESTA cuenta: el efecto que navega ya corrió, así que se navega aquí con la misma regla. */}
          <button onClick={() => router.replace((typeof perfil === 'object' ? destinoTrasEntrar(perfil, '') : null) ?? '/dashboard')} style={{ background: '#fff', color: 'var(--azul)', padding: '.75rem 1.4rem', borderRadius: 10, fontWeight: 700, border: '2px solid var(--azul)', cursor: 'pointer' }}>
            Seguir con mi cuenta actual
          </button>
        </div>
      </div>
    </main>
  )

  // La MISMA pantalla que pintan los marcos de destino (portal, publicador, admin): antes esta era azul y la
  // siguiente blanca, y al entrar se veían las dos seguidas. Ver `PantallaDeEspera`.
  if (pantalla.estado === 'resolviendo' || pantalla.estado === 'redirigir' || aEntrar) return <PantallaDeEspera />


  /* ── Login screen ── ESCOTILLA. Sólo se llega con `?clasico=1`: el resto se
     desvía a `/entrar`, la única pantalla de acceso (D-29.4). Se conserva a
     propósito, por si `/entrar` fallara en producción. ── */
  if (pantalla.estado === 'acceso') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--azul)' }}>
      <div style={{
        background: '#fff', padding: '3rem', borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,.3)', textAlign: 'center',
        width: '90%', maxWidth: '420px',
      }}>
        <i className="fa fa-user-circle" style={{ fontSize: '2.5rem', color: 'var(--rojo)', marginBottom: '1rem', display: 'block' }} />
        <h2 style={{ fontFamily: 'var(--font-montserrat)', color: 'var(--azul)', marginBottom: '.5rem' }}>Mi Cuenta</h2>
        <p style={{ fontSize: '.9rem', color: '#666', marginBottom: '1.5rem' }}>Gestión de Propiedades y Leads</p>

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: '1.5rem', borderBottom: '2px solid #eee' }}>
          {(['login', 'register'] as AuthTab[]).map(t => (
            <button key={t} onClick={() => { setAuthTab(t); setLoginErr('') }} style={{
              flex: 1, padding: '10px', cursor: 'pointer', fontWeight: 700,
              background: 'none', border: 'none',
              color: authTab === t ? 'var(--rojo)' : '#888',
              borderBottom: authTab === t ? '2px solid var(--rojo)' : 'none',
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
            {loginErr && <p style={{ color: 'var(--rojo)', fontSize: '.85rem' }}>{loginErr}</p>}
            <button type="submit" style={{ padding: '12px', background: 'var(--rojo)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>
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
            {/* Sin eleccion de rol. Publicar no es una preferencia que uno
                marca al registrarse: es permiso para meter contenido en el
                catalogo publico, y lo concede un administrador. */}
            {loginErr && <p style={{ color: 'var(--rojo)', fontSize: '.85rem' }}>{loginErr}</p>}
            <button type="submit" style={{ padding: '12px', background: 'var(--rojo)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>
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
        <AvisoEntrada aviso={google.aviso} />

        <Link href="/" style={{ display: 'block', marginTop: '20px', color: 'var(--azul)', fontSize: '.85rem' }}>
          ← Volver al inicio
        </Link>
      </div>
    </div>
  )

  // A partir de aquí hay sesión: lo garantiza la puerta `acceso` de arriba.
  // TypeScript no puede deducirlo del estado de `pantalla`, así que se afirma.
  if (!user) return null

  /* ── CLIENT PORTAL (non-admin) ── clásico: sólo se llega con ?clasico=1 o
     con el portal cerrado, nunca mientras se resuelve el destino. ── */
  if (!isAdmin) return (
    <div style={{ minHeight: '100vh', background: 'var(--superficie)', fontFamily: 'var(--font-montserrat)' }}>
      {/* Header */}
      <header style={{
        background: 'rgba(255,255,255,.6)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(0,0,0,.05)', borderRadius: '50px',
        padding: '.8rem 2rem', boxShadow: '0 2px 8px rgba(0,0,0,.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: '1000px', margin: '15px auto', position: 'sticky', top: '15px', zIndex: 1000,
      }}>
        <h1 style={{ color: 'var(--azul)', fontSize: '1.1rem', fontWeight: 700 }}>
          <i className="fa fa-user-circle" style={{ marginRight: '.5rem', color: 'var(--rojo)' }} />
          Portal de Cliente
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '.85rem', color: '#555', background: '#f0f0f0', padding: '5px 15px', borderRadius: '20px', fontWeight: 600 }}>
            {user.displayName || user.email}
          </span>
          {(rol === 'publicador' || isAdmin) && (
            <Link href="/portal/mis-propiedades" style={{
              background: 'var(--azul)', color: '#fff', fontWeight: 600, fontSize: '.85rem',
              padding: '6px 16px', borderRadius: '20px', textDecoration: 'none',
            }}>
              <i className="fa fa-building" style={{ marginRight: '.4rem' }} />Mis propiedades
            </Link>
          )}
          {/* El admin tambien publica, y hasta ahora no tenia por donde. */}
          <Link href="/portal/mis-propiedades" style={{
            background: 'var(--rojo-marca)', color: '#fff', fontWeight: 600,
            fontSize: '.85rem', padding: '6px 16px', borderRadius: '20px', textDecoration: 'none',
          }}>
            <i className="fa fa-plus" style={{ marginRight: '.4rem' }} />Publicar
          </Link>
          {/* 03.08 · El cliente tiene su perfil en el portal; el publicador, su
              asistente. Se enlaza directo en vez de rebotar por /mi-cuenta. */}
          <Link href={enlaceDePerfil(rol)} style={{ color: 'var(--azul)', fontWeight: 600, fontSize: '.85rem' }}>
            <i className="fa fa-id-card" style={{ marginRight: '.4rem' }} />Mi perfil
          </Link>
          <Link href="/" style={{ color: 'var(--rojo)', fontWeight: 600, fontSize: '.85rem' }}>← Ver sitio</Link>
          <button onClick={() => signOut(auth)} style={{
            background: 'transparent', color: 'var(--rojo)', border: '1px solid var(--rojo)',
            padding: '5px 15px', borderRadius: '20px', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600,
          }}>
            <i className="fa fa-sign-out-alt" style={{ marginRight: '.4rem' }} />Cerrar Sesión
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
        {/* Welcome banner */}
        <div style={{
          background: 'linear-gradient(135deg, var(--azul) 0%, var(--rojo) 100%)',
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

        {/* Primeros pasos: se tacha solo, mirando los datos reales. */}
        <Bienvenida rol={rol === 'publicador' ? 'publicador' : 'cliente'} />

        {/* Sólo a quien todavía no publica: al publicador ya no le dice nada. */}
        {rol !== 'publicador' && <QuieroPublicar />}

        {/* Dos preguntas, no un tablero: cual esta mejor de precio, y si el
            presupuesto alcanza. */}
        <MetricasCliente />

        {/* El corazon de la ficha guardaba en `favoritos` desde la Fase 5 y
            este panel nunca leia esa tabla. */}
        <MisFavoritos />

        {/* `busquedas_guardadas` existía desde la migración 05 sin pantalla. */}
        <MisBusquedas />

        {/* Mis consultas */}
        <div style={{ background: '#fff', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 15px rgba(0,0,0,.06)', marginBottom: '2rem' }}>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: 'var(--azul)', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
            <i className="fa fa-envelope-open" style={{ color: 'var(--rojo)', marginRight: '.5rem' }} />
            Mis Consultas Enviadas
          </h3>
          {leads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>
              <i className="fa fa-inbox" style={{ fontSize: '2.5rem', marginBottom: '1rem', display: 'block', opacity: .3 }} />
              <p style={{ marginBottom: '1rem' }}>No has enviado consultas aún.</p>
              <Link href="/propiedades" style={{
                display: 'inline-block', background: 'var(--rojo)', color: '#fff',
                padding: '.7rem 1.5rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 700,
              }}>
                Explorar propiedades
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {leads.map((l) => (
                <div key={l.id} style={{
                  background: 'var(--superficie)', borderRadius: '12px', padding: '1.2rem 1.5rem',
                  borderLeft: '4px solid var(--azul)', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', flexWrap: 'wrap', gap: '.8rem',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--azul)', marginBottom: '.25rem', fontSize: '.95rem' }}>
                      {l.interes || 'Consulta general'}
                    </div>
                    <div style={{ fontSize: '.82rem', color: '#888' }}>
                      <i className="fa fa-calendar" style={{ marginRight: '.3rem' }} />
                      {l.created_at ? new Date(l.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Fecha no disponible'}
                    </div>
                    {l.mensaje && <div style={{ fontSize: '.85rem', color: '#555', marginTop: '.3rem', fontStyle: 'italic' }}>&quot;{l.mensaje}&quot;</div>}
                  </div>
                  <span style={{ background: '#e6f4ea', color: 'var(--exito)', padding: '4px 12px', borderRadius: '20px', fontSize: '.78rem', fontWeight: 700 }}>
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
            { href: '/propiedades?tipo=nave', icon: 'fa-industry', label: 'Naves Industriales', color: 'var(--azul)' },
            { href: '/propiedades?tipo=casa', icon: 'fa-house', label: 'Casas en Venta', color: 'var(--rojo)' },
            { href: '/propiedades?tipo=terreno', icon: 'fa-map', label: 'Terrenos', color: 'var(--exito)' },
            { href: '/propiedades?tipo=comercial', icon: 'fa-store', label: 'Locales Comerciales', color: 'var(--aviso)' },
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
              <span style={{ fontWeight: 700, color: 'var(--azul)', fontSize: '.9rem' }}>{q.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )

  /* ── ADMIN DASHBOARD ── */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--superficie)', fontFamily: 'var(--font-montserrat)' }}>
      {/* Toast de éxito */}
      {saveSuccess && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 99999,
          background: 'var(--exito-medio)', color: '#fff', padding: '.9rem 1.5rem',
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
        <h1 style={{ color: 'var(--azul)', fontSize: '1.2rem', fontWeight: 700 }}>
          <i className="fa fa-chart-pie" style={{ marginRight: '.5rem', color: 'var(--rojo)' }} />
          Panel de Administración – Vive Bien
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '.85rem', color: '#555', background: '#f0f0f0', padding: '5px 15px', borderRadius: '20px', fontWeight: 600 }}>
            <i className="fa fa-user-circle" style={{ marginRight: '.4rem' }} />
            {user.email}
          </span>
          {/* V-1.1.71: el panel nuevo convive con este hasta tener sus cuatro pantallas. */}
          <Link href="/admin" style={{
            background: '#971010', color: '#fff', fontWeight: 600, fontSize: '.85rem',
            padding: '6px 16px', borderRadius: '20px', textDecoration: 'none',
          }}>
            <i className="fa fa-wand-magic-sparkles" style={{ marginRight: '.4rem' }} />Panel nuevo
          </Link>
          <Link href="/admin/propiedades/pendientes" style={{
            background: 'var(--azul)', color: '#fff', fontWeight: 600, fontSize: '.85rem',
            padding: '6px 16px', borderRadius: '20px', textDecoration: 'none',
          }}>
            <i className="fa fa-clipboard-check" style={{ marginRight: '.4rem' }} />Por revisar
          </Link>
          {/* 03.08 · Esta rama es la de administración: su cuenta vive en el panel. */}
          <Link href={CUENTA_DEL_PANEL} style={{ color: 'var(--azul)', fontWeight: 600, fontSize: '.85rem' }}>
            <i className="fa fa-id-card" style={{ marginRight: '.4rem' }} />Mi cuenta
          </Link>
          <Link href="/" style={{ color: 'var(--rojo)', fontWeight: 600, fontSize: '.85rem' }}>← Ver sitio</Link>
          <button onClick={() => signOut(auth)} style={{
            background: 'transparent', color: 'var(--rojo)', border: '1px solid var(--rojo)',
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
          { key: 'registros', label: 'Registros', icon: 'fa-address-book' },
          { key: 'usuarios', label: 'Usuarios', icon: 'fa-users-gear' },
          { key: 'props', label: 'Mis Propiedades', icon: 'fa-home' },
        ] as { key: Tab; label: string; icon: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '1rem 1.5rem', background: 'none', border: 'none',
            cursor: 'pointer', fontWeight: 600, fontSize: '1rem',
            color: tab === t.key ? 'var(--rojo)' : '#666',
            borderBottom: tab === t.key ? '3px solid var(--rojo)' : '3px solid transparent',
            transition: 'color .2s',
          }}>
            <i className={`fa ${t.icon}`} style={{ marginRight: '.5rem' }} />
            {t.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Lo que falta configurar, arriba del todo: «no puedo publicar» era
            una variable de entorno sin poner y no se decía en ningún sitio. */}
        <AvisoConfiguracion />

        {/* Primeros pasos del administrador: sobre todo, lo que espera revisión. */}
        <Bienvenida rol="admin" propiedades={propiedades} />

        {/* ── TAB: Registros ──
             Todo el que dejo sus datos, de las cuatro tablas a la vez. */}
        {tab === 'registros' && <Registros />}

        {/* Roles y suspension. `estado: suspendido` existia sin pantalla. */}
        {tab === 'usuarios' && <Usuarios />}

        {/* ── TAB: Métricas ── */}
        {tab === 'metricas' && (
          <>
            <div style={{ marginBottom: '2rem' }}>
              <Metricas propiedades={propiedades} leads={leads} contactos={contactos} />
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <Analitica />
            </div>

            {/* Tabla de Leads */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 15px rgba(0,0,0,.08)', marginBottom: '2rem', overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.8rem' }}>
                <h3 style={{ color: 'var(--azul)', fontSize: '1.1rem', margin: 0 }}>
                  <i className="fa fa-users" style={{ color: 'var(--rojo)', marginRight: '.5rem' }} />Leads / Prospectos ({leads.length})
                </h3>
                {leads.length > 0 && (
                  <button
                    onClick={() => {
                      const headers = ['Nombre', 'Teléfono', 'Email', 'Mensaje', 'Propiedad', 'Fecha']
                      const rows = leads.map((l) => [
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
                    style={{ display: 'flex', alignItems: 'center', gap: '.4rem', background: 'var(--azul)', color: '#fff', border: 'none', padding: '.55rem 1.1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '.82rem' }}>
                    <i className="fa fa-download" /> Exportar CSV
                  </button>
                )}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr style={{ background: 'var(--superficie)' }}>
                    {['Nombre', 'Teléfono', 'Email', 'Interés', 'Origen', 'Fecha'].map(h => (
                      <th key={h} style={{ padding: '12px 15px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '.85rem', fontWeight: 700, color: 'var(--azul)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>No hay leads registrados aún.</td></tr>
                  ) : leads.map((l) => (
                    <tr key={l.id} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '12px 15px', fontSize: '.9rem' }}>{l.nombre}</td>
                      <td style={{ padding: '12px 15px', fontSize: '.9rem' }}>
                        <a href={`https://wa.me/52${l.telefono?.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--whatsapp)', fontWeight: 600 }}>
                          {l.telefono}
                        </a>
                      </td>
                      <td style={{ padding: '12px 15px', fontSize: '.9rem' }}>{l.email || '—'}</td>
                      <td style={{ padding: '12px 15px', fontSize: '.9rem' }}>{l.interes || '—'}</td>
                      <td style={{ padding: '12px 15px', fontSize: '.85rem', color: '#888' }}>
                        {/* El código interno («ficha») no le dice nada a quien atiende el
                            lead; de dónde vino y, si aplica, qué propiedad miraba, sí. */}
                        {ORIGENES_LEAD[l.origen ?? ''] ?? l.origen ?? '—'}
                        {l.propiedad_id && (
                          <a href={`/propiedades/${encodeURIComponent(l.propiedad_id)}`} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'block', color: 'var(--azul)', fontWeight: 600, fontSize: '.78rem' }}>
                            Ver la propiedad →
                          </a>
                        )}
                      </td>
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
                <h3 style={{ color: 'var(--azul)', fontSize: '1.1rem', margin: 0 }}>
                  <i className="fa fa-envelope" style={{ color: 'var(--rojo)', marginRight: '.5rem' }} />Contactos del Formulario ({contactos.length})
                </h3>
                {contactos.length > 0 && (
                  <button
                    onClick={() => {
                      const headers = ['Nombre', 'Teléfono', 'Email', 'Mensaje', 'Fecha']
                      const rows = contactos.map((c) => [
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
                    style={{ display: 'flex', alignItems: 'center', gap: '.4rem', background: 'var(--exito)', color: '#fff', border: 'none', padding: '.55rem 1.1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '.82rem' }}>
                    <i className="fa fa-download" /> Exportar CSV
                  </button>
                )}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr style={{ background: 'var(--superficie)' }}>
                    {['Nombre', 'Teléfono', 'Email', 'Interés', 'Fecha'].map(h => (
                      <th key={h} style={{ padding: '12px 15px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '.85rem', fontWeight: 700, color: 'var(--azul)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contactos.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>No hay contactos registrados aún.</td></tr>
                  ) : contactos.map((c) => (
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
              <h2 style={{ fontWeight: 800, color: 'var(--texto)', fontSize: '1.3rem', margin: 0 }}>
                <i className="fa fa-home" style={{ color: 'var(--rojo)', marginRight: '.5rem' }} />
                Propiedades
              </h2>
              <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap' }}>
                <a href="/admin/seed" style={{
                  background: 'var(--azul)', color: '#fff', border: 'none',
                  padding: '.65rem 1.1rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '.82rem',
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
                }}>
                  <i className="fa fa-database" style={{ marginRight: '.5rem' }} />Seed Supabase
                </a>
                {/* Crea el borrador y lleva AL ASISTENTE, no al formulario en
                    linea. Habia dos editores de propiedad y el admin veia el
                    viejo: el asistente de 4 etapas existia, funcionaba para
                    admin -la API acepta ['publicador','admin']- y no habia
                    ningun enlace que llevara ahi. E-13 otra vez. */}
                {/* R8.3: no crea nada ni cambia de panel: abre el alta del espacio del rol (el borrador nace al enviar el título). */}
                <button onClick={() => router.push(isAdmin ? '/admin/propiedades?nueva=1' : '/portal/mis-propiedades?nueva=1')} style={{
                  background: 'var(--rojo-marca)', color: '#fff', border: 'none',
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
                // Un borrador no es inventario disponible: los seis vacíos se
                // contaban aquí como si estuvieran a la venta.
                disponible: propiedades.filter(p => p.estatus === 'disponible' && (!p.estado_pub || p.estado_pub === 'publicada')).length,
                pausada: propiedades.filter(p => p.estatus === 'pausada').length,
                eliminada: propiedades.filter(p => p.estatus === 'eliminada' || p.estatus === 'vendida').length,
              }
              const tabs: { key: typeof statusFilter; label: string; color: string; bg: string }[] = [
                { key: 'todas',      label: `Todas (${counts.todas})`,              color: 'var(--azul)', bg: 'var(--info-fondo)' },
                { key: 'disponible', label: `Disponibles (${counts.disponible})`,   color: 'var(--exito-medio)', bg: '#ecfdf5' },
                { key: 'pausada',    label: `Pausadas (${counts.pausada})`,          color: 'var(--aviso)', bg: 'var(--aviso-fondo)' },
                { key: 'eliminada',  label: `Archivadas (${counts.eliminada})`,      color: 'var(--rojo)', bg: 'var(--error-fondo-fuerte)' },
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
                  <tr style={{ background: 'var(--superficie)' }}>
                    {['Imagen', 'Título / Ubicación', 'Tipo', 'Precio', 'Estatus', 'Cambiar estatus', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '1rem', textAlign: 'left', fontSize: '.82rem', fontWeight: 700, color: 'var(--azul)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {propiedades
                    .filter(p => statusFilter === 'todas' ? true : (statusFilter === 'eliminada' ? (p.estatus === 'eliminada' || p.estatus === 'vendida') : p.estatus === statusFilter))
                    .map(p => {
                      const estatusColor = p.estatus === 'disponible' ? { bg: 'var(--exito-fondo)', color: 'var(--exito-fuerte)' }
                        : p.estatus === 'pausada' ? { bg: 'var(--aviso-fondo)', color: '#b45309' }
                        : { bg: 'var(--error-fondo-fuerte)', color: 'var(--error)' }
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid #eee' }}>
                          <td style={{ padding: '.6rem .5rem .6rem 1rem', width: 64 }}>
                            {/* Miniatura de 48 px pedida a Cloudinary (~2 KB), no la foto
                                original (~500 KB): la tabla carga igual de rápido con
                                quince propiedades que con cien. Tamaño fijo para que las
                                filas no salten mientras cargan. */}
                            {p.fotos?.[0] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={miniaturaCloudinary(p.fotos[0]) ?? ''} alt="" width={48} height={48} loading="lazy" decoding="async"
                                style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, display: 'block', background: 'var(--superficie)' }} />
                            ) : (
                              <div title="Sin fotos todavía" style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--superficie)', display: 'grid', placeItems: 'center', color: '#B9B3AA' }}>
                                <i className="fa fa-image" aria-hidden="true" />
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '.85rem 1rem', fontSize: '.88rem', fontWeight: 600, maxWidth: '220px' }}>
                            {p.destacada && <i className="fa fa-star" style={{ color: 'var(--aviso)', marginRight: '.4rem', fontSize: '.8rem' }} />}
                            <div style={{ fontWeight: 700, color: nombreProvisional(p) ? '#8B95A3' : '#1a1a2e', fontStyle: nombreProvisional(p) ? 'italic' : 'normal', marginBottom: '.15rem' }}>{nombreDe(p)}</div>
                            {/* Sin esto, un borrador vacío y una propiedad publicada se veían idénticos. */}
                            {p.estado_pub && p.estado_pub !== 'publicada' && (
                              <span style={{ display: 'inline-block', background: 'var(--aviso-fondo)', color: '#b45309', padding: '1px 8px', borderRadius: 6, fontSize: '.68rem', fontWeight: 700, marginBottom: '.2rem' }}>
                                {p.estado_pub === 'borrador' ? 'Borrador' : p.estado_pub.replace('_', ' ')}
                              </span>
                            )}
                            <div style={{ fontSize: '.75rem', color: '#888', fontWeight: 400 }}>{p.ubicacion}</div>
                            {p.folio && (
                              <div style={{ fontSize: '.7rem', color: 'var(--azul)', fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', marginTop: '.15rem' }}>
                                {p.folio}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '.85rem 1rem', fontSize: '.88rem', whiteSpace: 'nowrap' }}>
                            <span style={{ background: 'var(--azul)', color: '#fff', padding: '3px 10px', borderRadius: '20px', fontSize: '.72rem', fontWeight: 700 }}>
                              {p.tipo}
                            </span>
                            <div style={{ fontSize: '.72rem', color: '#aaa', marginTop: '.2rem', textTransform: 'capitalize' }}>{p.operacion}</div>
                          </td>
                          <td style={{ padding: '.85rem 1rem', fontSize: '.9rem', fontWeight: 800, color: 'var(--rojo)', whiteSpace: 'nowrap' }}>
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
                              {/* Al asistente, no al formulario corto de este panel:
                                  ahí faltaban campos (ubicación en el mapa, planos,
                                  videos, amenidades, pies de foto) y por eso «no se
                                  cambiaban» o «no salían». V-1.1.72. */}
                              <Link href={`/portal/mis-propiedades/${encodeURIComponent(p.id ?? '')}/editar`} style={{
                                background: 'var(--azul)', color: '#fff',
                                padding: '.4rem .75rem', borderRadius: '6px', fontSize: '.78rem', fontWeight: 700,
                                textDecoration: 'none', display: 'inline-block',
                              }}>
                                <i className="fa fa-pen" style={{ marginRight: '.3rem' }} />Editar
                              </Link>
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
            <h2 style={{ fontWeight: 800, color: 'var(--rojo)', marginBottom: '1.5rem', fontSize: '1.3rem' }}>
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
                  <label style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>{f.label}</label>
                  <input
                    type={f.type}
                    step={f.key === 'metros' ? '0.01' : undefined}
                    value={(editando as unknown as Record<string, string | number | undefined>)[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={e => setEditando(d => ({ ...d, [f.key]: f.type === 'number' ? (parseFloat(e.target.value) || undefined) : e.target.value }))}
                    style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem', boxSizing: 'border-box' }}
                  />
                </div>
              ))}

              {/* IVA */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: '.7rem', cursor: 'pointer',
                padding: '.75rem 1rem', borderRadius: '8px', border: `2px solid ${editando.precio_incluye_iva ? 'var(--exito-medio)' : '#DDE'}`,
                background: editando.precio_incluye_iva ? '#ecfdf5' : '#FAFAFA', transition: 'all .2s',
              }}>
                <input type="checkbox" checked={!!editando.precio_incluye_iva}
                  onChange={e => setEditando(d => ({ ...d, precio_incluye_iva: e.target.checked }))}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--exito-medio)' }} />
                <div>
                  <span style={{ fontWeight: 700, color: editando.precio_incluye_iva ? '#065f46' : 'var(--azul)', fontSize: '.9rem', fontFamily: 'Montserrat, sans-serif' }}>
                    <i className="fa fa-receipt" style={{ color: editando.precio_incluye_iva ? 'var(--exito-medio)' : '#888', marginRight: '.4rem' }} />
                    El precio ya incluye IVA
                  </span>
                  <div style={{ fontSize: '.75rem', color: '#888', marginTop: '.1rem' }}>
                    {editando.precio_incluye_iva ? 'Se mostrará "IVA incluido" al visitante' : 'Se mostrará "+ IVA" al visitante'}
                  </div>
                </div>
              </label>

              {/* Extra fields for naves */}
              {(editando.tipo === 'nave' || !editando.tipo) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', padding: '1rem', background: 'var(--info-fondo)', borderRadius: '10px', border: '1px solid #BFDBFE' }}>
                  <div>
                    <label style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>Altura libre (m)</label>
                    <input type="number" value={editando.altura_libre ?? ''} placeholder="0"
                      onChange={e => setEditando(d => ({ ...d, altura_libre: parseFloat(e.target.value) || undefined }))}
                      style={{ width: '100%', padding: '.65rem .8rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.88rem', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>Andenes</label>
                    <input type="number" value={editando.andenes ?? ''} placeholder="0"
                      onChange={e => setEditando(d => ({ ...d, andenes: parseFloat(e.target.value) || undefined }))}
                      style={{ width: '100%', padding: '.65rem .8rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.88rem', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>Mantenimiento $</label>
                    <input type="number" value={editando.mantenimiento ?? ''} placeholder="0"
                      onChange={e => setEditando(d => ({ ...d, mantenimiento: parseFloat(e.target.value) || undefined }))}
                      style={{ width: '100%', padding: '.65rem .8rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.88rem', boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>Tipo</label>
                  <select value={editando.tipo || 'nave'} onChange={e => setEditando(d => ({ ...d, tipo: e.target.value }))}
                    style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem' }}>
                    <option value="nave">Nave/Bodega</option>
                    <option value="casa">Casa</option>
                    <option value="terreno">Terreno</option>
                    <option value="comercial">Local</option>
                    <option value="oficina">Oficina</option>
                    <option value="departamento">Departamento</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>Operación</label>
                  <select value={editando.operacion || 'renta'} onChange={e => setEditando(d => ({ ...d, operacion: e.target.value }))}
                    style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem' }}>
                    <option value="renta">Renta</option>
                    <option value="venta">Venta</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>Estatus</label>
                <select value={editando.estatus || 'disponible'} onChange={e => setEditando(d => ({ ...d, estatus: e.target.value }))}
                  style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem' }}>
                  <option value="disponible">Disponible</option>
                  <option value="pausada">Pausada</option>
                  <option value="vendida">Vendida / Rentada</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>
                  Amenidades <span style={{ fontWeight: 400, color: '#888' }}>(separadas por coma)</span>
                </label>
                <input type="text" value={(editando.amenidades || []).join(', ')} placeholder="Acceso tráiler, Oficinas, Vigilancia 24/7"
                  onChange={e => setEditando(d => ({ ...d, amenidades: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                  style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>
                  Video URL <span style={{ fontWeight: 400, color: '#888' }}>(YouTube o MP4)</span>
                </label>
                <input type="url" value={editando.video_url || ''} placeholder="https://youtube.com/watch?v=..."
                  onChange={e => setEditando(d => ({ ...d, video_url: e.target.value }))}
                  style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem', boxSizing: 'border-box' }} />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '.7rem', cursor: 'pointer', padding: '.75rem 1rem', background: editando.destacada ? 'var(--aviso-fondo)' : 'var(--superficie)', borderRadius: '8px', border: `2px solid ${editando.destacada ? 'var(--aviso)' : '#DDE'}`, transition: 'all .2s' }}>
                <input type="checkbox" checked={!!editando.destacada}
                  onChange={e => setEditando(d => ({ ...d, destacada: e.target.checked }))}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--aviso)' }} />
                <span style={{ fontWeight: 700, color: editando.destacada ? 'var(--aviso-fuerte)' : 'var(--azul)', fontSize: '.9rem', fontFamily: 'Montserrat, sans-serif' }}>
                  <i className="fa fa-star" style={{ color: 'var(--aviso)', marginRight: '.4rem' }} />
                  Marcar como Propiedad Destacada
                </span>
                {editando.destacada && <span style={{ marginLeft: 'auto', fontSize: '.75rem', color: 'var(--aviso-fuerte)', fontWeight: 600 }}>⭐ Aparecerá destacada en el sitio</span>}
              </label>

              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.3rem' }}>Descripción</label>
                <textarea rows={3} value={editando.descripcion || ''}
                  onChange={e => setEditando(d => ({ ...d, descripcion: e.target.value }))}
                  placeholder="Descripción de la propiedad..."
                  style={{ width: '100%', padding: '.75rem 1rem', borderRadius: '8px', border: '1.5px solid #DDE', fontSize: '.92rem', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              {/* ── Fotos: upload directo + URL ── */}
              <div>
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--azul)', display: 'block', marginBottom: '.6rem' }}>
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
                  <div style={{ border: '2px dashed var(--azul)', borderRadius: '10px', padding: '1.5rem', textAlign: 'center', background: 'var(--info-fondo)', marginBottom: '.8rem' }}>
                    <i className="fa fa-spinner fa-spin" style={{ fontSize: '1.6rem', color: 'var(--azul)', marginBottom: '.5rem', display: 'block' }} />
                    <span style={{ fontSize: '.88rem', color: 'var(--azul)', fontWeight: 700 }}>Subiendo fotos… {uploadProgress}%</span>
                    <div style={{ width: '100%', height: '6px', background: '#DDE', borderRadius: '3px', overflow: 'hidden', marginTop: '.6rem' }}>
                      <div style={{ height: '6px', background: 'var(--azul)', width: `${uploadProgress}%`, transition: 'width .3s', borderRadius: '3px' }} />
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
                        border: '2px dashed var(--rojo)', background: '#fdf4f4',
                        color: 'var(--rojo)', fontWeight: 700, fontSize: '.92rem',
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
                          <span style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'var(--rojo)', color: '#fff', fontSize: '.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', letterSpacing: '.5px' }}>
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
                    style={{ background: 'var(--azul)', color: '#fff', border: 'none', borderRadius: '8px', padding: '.55rem .9rem', cursor: 'pointer', fontWeight: 700, fontSize: '.82rem', whiteSpace: 'nowrap' }}>
                    + URL
                  </button>
                </div>
              </div>
            </div>

            {saveError && (
              <div style={{ background: 'var(--error-fondo)', border: '1px solid #fca5a5', borderRadius: '8px', padding: '.75rem 1rem', color: 'var(--error)', fontSize: '.88rem', fontWeight: 600, marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <i className="fa fa-exclamation-circle" />
                {saveError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button onClick={() => { setEditando(null); setSaveError('') }} style={{
                flex: 1, padding: '1rem', background: '#fff', color: 'var(--azul)',
                border: '2px solid var(--azul)', borderRadius: '10px', fontWeight: 700, cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={guardar} disabled={saving} style={{
                flex: 2, padding: '1rem', background: 'var(--rojo)', color: '#fff',
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
