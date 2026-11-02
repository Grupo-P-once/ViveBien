'use client'
import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { perfilDeSesion } from '@/lib/acceso/perfil-de-sesion'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { abrirNuevaPropiedad, estadoDeFiltro, rutaDeEditorDe } from '@/lib/publicador/espacio'
import { useSesionOpcional } from '@/components/admin/sesion'
import { confirmacionDeEnvio, rutaPublicaValida, type RespuestaDeEstado } from '@/lib/publicador/confirmacion'
import Encabezado from '@/components/admin/Encabezado'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import TablaMisPropiedades, { type FilaPropia } from './TablaMisPropiedades'
import { ofreceEnRevision } from '@/lib/publicador/espacio'

type Prop = {
  id: string
  folio?: string | null
  titulo?: string
  ubicacion?: string
  fotos?: string[]
  estado_pub?: string
  completitud?: number
  nota_moderacion?: string | null
  slug?: string | null
  /** La calcula el servidor: ¿la creó esta cuenta? (un admin ve el inventario entero; sin esto no se distingue lo suyo). */
  es_mia?: boolean
}

/** Mensaje de la última operación. `advertencia` = no se pudo confirmar. */
type Aviso = { titulo: string; detalle?: string; ruta?: string | null; advertencia?: boolean }

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

/** `useSearchParams` pide Suspense: el filtro `?estado=` y el foco `?nueva=1` se leen dentro de esta envoltura. */
export default function MisPropiedades() {
  return <Suspense fallback={null}><PanelPropiedades /></Suspense>
}

function PanelPropiedades() {
  const router = useRouter()
  const consulta = useSearchParams()
  // «En revisión» (acceso del portal): la MISMA lista filtrada en el navegador; el servidor sigue entregando sólo lo de esta cuenta.
  const filtro = estadoDeFiltro(consulta.get('estado'))
  const campoTitulo = useRef<HTMLInputElement>(null)
  // «Nueva propiedad»: el formulario se abre EN LÍNEA, en esta misma pantalla (nada de cambiar de panel).
  // Con el marco del rol hay una VENTANA para esto; sin marco (portal cerrado) queda el formulario en línea de siempre.
  const conMarco = useSesionOpcional() !== null
  const [abrirNueva, setAbrirNueva] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [cargando, setCargando] = useState(true)
  const [props, setProps] = useState<Prop[]>([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [nuevoTitulo, setNuevoTitulo] = useState('')
  const [faltaPerfil, setFaltaPerfil] = useState(false)
  // «Citas recibidas» sólo se ofrece a quien recibe citas. El servidor lo calcula
  // (ADR-0013) y de todos modos vuelve a comprobarlo en cada petición.
  const [recibeCitas, setRecibeCitas] = useState(false)
  // Quién publica sin pasar por revisión lo calcula el servidor (`/api/usuarios/me`); aquí solo cambia lo que dicen los textos y el botón.
  const [esAdmin, setEsAdmin] = useState(false)
  const [publicaSinRevision, setPublicaSinRevision] = useState(false)
  const [permisosCargados, setPermisosCargados] = useState(false)
  // `editar_publicadas` (ADR-0013): corregir lo YA publicado. Solo rotula el botón; el servidor lo vuelve a comprobar al guardar.
  const [editaPublicadas, setEditaPublicadas] = useState(false)
  // La lista tiene tres estados distintos: cargando, con error y vacía. «Todavía no tienes propiedades» solo se dice si la carga TERMINÓ bien.
  const [listaCargada, setListaCargada] = useState(false)

  // «Nueva propiedad» del portal llega aquí con `?nueva=1`: se enfoca el título y el borrador se crea al enviarlo.
  const pidioNueva = consulta.get('nueva') === '1'
  useEffect(() => {
    if (!pidioNueva) return
    if (conMarco) abrirNuevaPropiedad()
    else setAbrirNueva(true)
  }, [pidioNueva, conMarco])
  useEffect(() => {
    if (abrirNueva && !cargando && user) campoTitulo.current?.focus()
  }, [abrirNueva, cargando, user])

  const cargar = useCallback(async (): Promise<Prop[] | null> => {
    try {
      const res = await fetch('/api/publicador/propiedades', { headers: await cabeceras() })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'No se pudieron cargar tus propiedades.')
        setProps([])
        setListaCargada(true)
        return null
      }
      setError('')
      const lista: Prop[] = await res.json()
      setProps(lista)
      setListaCargada(true)
      return lista
    } catch {
      setError('Error de red.')
      setListaCargada(true)
      return null
    }
  }, [])

  // Si falla, el enlace simplemente no aparece: nunca da permisos, sólo los pinta.
  const cargarCapacidades = useCallback(async () => {
    try {
      // Misma consulta que acaba de hacer el marco (perfil-de-sesion.ts): entrar no cuesta dos.
      const actual = auth.currentUser
      const res = actual ? await perfilDeSesion(actual.uid, () => actual.getIdToken()) : null
      if (res?.ok) {
        const jm = res.datos
        setRecibeCitas(jm?.capacidades?.recibir_citas === true)
        // El rol y el permiso salen del perfil que calcula el servidor, no de nada que mande el navegador.
        setEsAdmin(jm?.rol === 'admin' || jm?.superAdmin === true)
        setPublicaSinRevision(jm?.capacidades?.publicar_sin_revision === true)
        setEditaPublicadas(jm?.capacidades?.editar_publicadas === true)
        setPermisosCargados(true)
      }
    } catch { /* sin enlace */ }
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u)
      setCargando(false)
      if (u) { cargar(); void cargarCapacidades() }
    })
  }, [cargar, cargarCapacidades])

  // Cerrojo SÍNCRONO contra pulsaciones repetidas: cada una crearía otro borrador (pasó en producción: 3 en 3 s).
  const cerrojoAlta = useRef(false)
  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!nuevoTitulo.trim() || cerrojoAlta.current) return
    cerrojoAlta.current = true
    let res: Response
    try {
      res = await fetch('/api/publicador/propiedades', {
        method: 'POST',
        headers: await cabeceras(),
        body: JSON.stringify({ titulo: nuevoTitulo.trim() }),
      })
    } catch { cerrojoAlta.current = false; setError('Error de red.'); return }
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { cerrojoAlta.current = false; setError(j.error || 'No se pudo crear.'); return }
    setNuevoTitulo('')
    // Un borrador con sólo el título no sirve para nada: el sitio natural
    // después de crearlo es el asistente, no esta lista.
    if (j.id) { router.push(rutaDeEditorDe(j.id, 'publicador')); return }
    cerrojoAlta.current = false
    setAviso({ titulo: 'Borrador creado', detalle: 'Aún no está publicado. Complétalo para poder publicarlo o enviarlo.' })
    cargar()
  }

  async function cambiarEstado(id: string, estado: string) {
    const res = await fetch(`/api/propiedades/${id}/estado`, {
      method: 'POST',
      headers: await cabeceras(),
      body: JSON.stringify({ estado }),
    })
    const j: RespuestaDeEstado & { error?: string; perfilIncompleto?: boolean } = await res.json().catch(() => ({}))
    if (!res.ok) {
      setAviso(null)
      setError(j.error || 'No se pudo cambiar el estado.')
      // El servidor distingue «falta tu contacto» de cualquier otro fallo.
      // Enseñar el motivo y dejar al publicador donde no puede arreglarlo
      // sería un callejón sin salida más.
      setFaltaPerfil(Boolean(j.perfilIncompleto))
      return
    }
    setFaltaPerfil(false)
    setError('')
    // El mensaje sale de lo que CONFIRMÓ el servidor cruzado con la lista recargada, no de lo que se pidió. Se queda hasta la
    // siguiente operación: la recarga de la lista no lo borra.
    const lista = await cargar()
    const c = confirmacionDeEnvio(j, lista?.find(p => p.id === id) ?? null)
    if (c.tipo === 'borrador') {
      setAviso({ titulo: 'Envío retirado', detalle: 'Volvió a borrador: ya no está en revisión ni publicado.' })
    } else {
      setAviso({ titulo: c.titulo, detalle: c.detalle, ruta: c.tipo === 'publicada' ? c.ruta : null, advertencia: c.tipo === 'sin_confirmar' })
    }
  }

  const sesion = useSesionOpcional()
  // «En revisión» (pestaña y tarjeta) solo para quien depende de la revisión: el asociado publica directo.
  const conRevision = ofreceEnRevision({ rol: esAdmin ? 'admin' : 'publicador', tipoPublicador: sesion?.perfil.tipoPublicador })

  if (cargando) return <div style={{ padding: '6rem 2rem', textAlign: 'center' }}>Cargando…</div>

  if (!user) return (
    <div style={{ padding: '6rem 2rem', textAlign: 'center', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>Panel del publicador</h1>
      <p style={{ color: '#555', marginBottom: '1.5rem' }}>Inicia sesión para administrar tus propiedades.</p>
      <Link href="/dashboard" style={{ background: 'var(--rojo)', color: '#fff', padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>
        Ir a iniciar sesión
      </Link>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado
        versal="Propiedades"
        titulo={filtro === 'en_revision' ? 'En revisión' : 'Mis propiedades'}
        descripcion={!permisosCargados
          ? 'Una propiedad nueva empieza como borrador. Cuando esté completa, el servidor decide según tu cuenta si se publica o pasa a revisión.'
          : (esAdmin || publicaSinRevision)
            ? 'Una propiedad nueva empieza como borrador. Cuando esté completa la publicas directamente: tu cuenta no necesita pasar por revisión.'
            : 'Una propiedad nueva empieza como borrador. Cuando esté completa la envías a revisión, y un administrador la aprueba.'}
        acciones={
          <>
            {recibeCitas && <Button asChild variant="outline" className="h-10 px-4"><Link href="/publicador/citas">Citas recibidas</Link></Button>}
            <Button className="h-10 px-4" onClick={() => (conMarco ? abrirNuevaPropiedad() : setAbrirNueva((v) => !v))}>
              <Plus aria-hidden /> Nueva propiedad
            </Button>
          </>
        }
      />

      {!conMarco && abrirNueva && (
      <form onSubmit={crear} data-alta-en-linea style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input ref={campoTitulo} value={nuevoTitulo} onChange={e => setNuevoTitulo(e.target.value)}
          placeholder="Título de la nueva propiedad" aria-label="Título de la nueva propiedad"
          style={{ flex: '1 1 260px', padding: 12, border: '1px solid #ccc', borderRadius: 8, fontSize: '1rem' }} />
        <button type="submit" style={{ padding: '12px 20px', background: 'var(--rojo)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
          Crear borrador
        </button>
        <button type="button" onClick={() => { setAbrirNueva(false); setNuevoTitulo('') }} style={{ padding: '12px 20px', background: '#fff', color: 'var(--azul)', border: '1px solid var(--borde-frio)', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
          Cancelar
        </button>
      </form>
      )}

      {error && (
        <p style={{ background: 'var(--error-fondo-fuerte)', color: 'var(--error-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.9rem' }}>
          {error}
          {faltaPerfil && (
            <>
              {' '}
              <Link href="/mi-cuenta?motivo=publicar" style={{ color: 'var(--error-fuerte)', fontWeight: 700 }}>
                Completar mi perfil →
              </Link>
            </>
          )}
        </p>
      )}
      {/* Región de estado (WCAG 4.1.3), siempre montada: se anuncia sin mover el foco. */}
      <div role="status" aria-live="polite" aria-atomic="true" data-aviso={aviso ? (aviso.advertencia ? 'advertencia' : 'ok') : 'ninguno'}>
        {aviso && (
          <p style={{
            padding: '10px 14px', borderRadius: 8, fontSize: '.9rem', lineHeight: 1.5,
            ...(aviso.advertencia
              ? { background: 'var(--aviso-fondo)', color: 'var(--aviso-fuerte)' }
              : { background: 'var(--exito-fondo)', color: 'var(--exito-fuerte)' }),
          }}>
            <strong>{aviso.titulo}</strong>
            {aviso.detalle ? <> {aviso.detalle}</> : null}
            {aviso.ruta && rutaPublicaValida(aviso.ruta) && (
              <>
                {' '}
                <Link href={aviso.ruta} style={{ color: 'inherit', fontWeight: 800, textDecoration: 'underline' }}>
                  Ver publicación
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      <TablaMisPropiedades
        key={filtro ?? 'todas'}
        filas={listaCargada ? (props as FilaPropia[]) : null}
        error=""
        esAdmin={esAdmin}
        publicaSinRevision={publicaSinRevision}
        permisosCargados={permisosCargados}
        editaPublicadas={editaPublicadas}
        conRevision={conRevision}
        pestanaInicial={filtro === 'en_revision' ? 'revision' : 'todas'}
        onEstado={cambiarEstado}
        onReintentar={() => { void cargar() }}
      />
    </div>
  )
}
