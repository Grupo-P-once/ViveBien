'use client'
import AceptacionComision from '@/components/publicador/AceptacionComision'
import OrigenDeclarado from '@/components/publicador/OrigenDeclarado'
import AceptacionLegal from '@/components/publicador/AceptacionLegal'
import { useState, useEffect, useCallback, useMemo, useRef, useId, use } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { perfilDeSesion } from '@/lib/acceso/perfil-de-sesion'
import { useSesionOpcional } from '@/components/admin/sesion'
import { rutaListaDePropiedades } from '@/lib/publicador/espacio'
import Link from 'next/link'
import { COMPLETITUD_MINIMA, calcularCompletitud, destinoDePublicacion, faltantes, fotosSuficientes, publicaSinRevisionEfectiva, puedeEditarAnuncio, tieneObservacionesDelRevisor } from '@/lib/publicacion'
import { MINIMO_FOTOS, MAXIMO_FOTOS, SUBTIPOS, type Tipo } from '@/lib/esquemas/propiedad'
import { conCaracteristicas, etiquetaSuperficie, leerCaracteristicas, podarCaracteristicas, tipoBase } from '@/lib/caracteristicas'
import CamposCaracteristicas from '@/components/publicador/CamposCaracteristicas'
import { repartirArchivos, mover, idYoutube, urlYoutube, MAXIMO_VIDEOS, MAXIMO_PLANOS } from '@/lib/multimedia'
import { MAXIMO_PIE } from '@/lib/fotos'
import { MINIMO_DESCRIPCION } from '@/lib/esquemas/propiedad'
import VistaPreviaAnuncio from '@/components/VistaPreviaAnuncio'
import DescripcionRica from '@/components/catalogo/DescripcionRica'
import { EJEMPLO_DESCRIPCION } from '@/lib/descripcion'
import '@/components/catalogo/catalogo.css'
import CampoAmenidades from '@/components/CampoAmenidades'
import dynamic from 'next/dynamic'
import { nombreDe, tituloReal } from '@/lib/propiedad-publica'
import { subirImagen } from '@/lib/medios/subir'
import { crearGuardador } from '@/lib/publicador/guardador'
import { agregarSinDuplicar, plazasLibres, procesarCarga, type Carga } from '@/lib/publicador/cola-fotos'
import { puede } from '@/lib/acceso/permisos'
import {
  confirmacionDeEnvio, confirmacionDeGuardado, confirmacionDeTransicionFallida, etiquetaDeProgreso, etiquetaDelBoton, modoDeEnvio, rutaPublicaValida, textoPrevioAlEnvio,
  type Confirmacion, type RespuestaDeEstado,
} from '@/lib/publicador/confirmacion'

// Leaflet toca `window` al importarse: sin ssr:false rompe el prerenderizado.
const MapaSelector = dynamic(() => import('@/components/MapaSelector'), {
  ssr: false,
  loading: () => <div style={{ height: 320, borderRadius: 10, background: 'var(--hueso-hundido, #E7E4DF)', display: 'grid', placeItems: 'center', color: '#5A6472', fontSize: '.85rem' }}>Cargando el mapa…</div>,
})

/** Un archivo en la cola de subida: su vista previa local, su estado y a qué zona pertenece. */
type CargaUI = Carga & { vista: string; destino: 'fotos' | 'planos' }

type Prop = {
  id: string
  slug?: string | null
  titulo?: string
  tipo?: string
  subtipo?: string | null
  operacion?: string
  extras?: Record<string, unknown> | null
  precio?: number
  precio_incluye_iva?: boolean
  mantenimiento?: number
  ubicacion?: string
  descripcion?: string
  lat?: number | null
  lng?: number | null
  fotos?: string[]
  planos?: string[]
  videos?: string[]
  metros?: number
  recamaras?: number
  banos?: number
  altura_libre?: number
  andenes?: number
  amenidades?: string[]
  whatsapp?: string
  estado_pub?: string
  completitud?: number
  nota_moderacion?: string | null
}

const TIPOS = [
  { v: 'nave', t: 'Nave o bodega' },
  { v: 'casa', t: 'Casa' },
  { v: 'departamento', t: 'Departamento' },
  { v: 'terreno', t: 'Terreno' },
  { v: 'comercial', t: 'Local comercial' },
  { v: 'oficina', t: 'Oficina' },
]

const OPERACIONES = [
  { v: 'venta', t: 'Venta' },
  { v: 'renta', t: 'Renta' },
]

/** Los pasos son fijos; lo que cambia dentro es qué campos pide el paso 3. */
/**
 * Los pasos, agrupados.
 *
 * Antes eran siete botones planos en una fila. Siete puntos en una barra se
 * leen como siete obstaculos; cuatro con detalle dentro se leen como cuatro
 * — es la misma cantidad de trabajo contada de otra manera, y es lo que hace
 * Inmuebles24. Ver la especificacion del wizard en Obsidian.
 *
 * `campos` es lo que decide la palomita verde: un sub-paso esta hecho cuando
 * sus datos EXISTEN, no cuando alguien paso por el. Marcar por visita mentiria
 * igual que una lista de tareas que se tacha sola.
 */
const PASOS = [
  'Tipo',
  'Ubicación',
  'Características',
  'Precio',
  'Fotos',
  'Descripción',
  'Revisar',
] as const

const GRUPOS: { nombre: string; pasos: number[] }[] = [
  { nombre: 'Principales', pasos: [0, 1, 2, 3] },
  { nombre: 'Multimedia',  pasos: [4] },
  { nombre: 'Detalles',    pasos: [5] },
  { nombre: 'Publicar',    pasos: [6] },
]

/** Qué campo prueba que un sub-paso está resuelto. */
const CAMPOS_DE_PASO: Record<number, (p: Record<string, unknown>) => boolean> = {
  0: p => Boolean(p.tipo) && Boolean(p.operacion),
  1: p => Boolean(p.ubicacion),
  2: p => Boolean(p.metros),
  3: p => Boolean(p.precio),
  // Antes: `>= 3`, mientras el servidor exige MINIMO_FOTOS (5): el paso salía «completo» y el envío se rechazaba (E-48).
  4: p => fotosSuficientes(p),
  5: p => String(p.descripcion ?? '').trim().length >= MINIMO_DESCRIPCION,
  6: () => false,
}

const esResidencial = (tipo?: string) => tipo === 'casa' || tipo === 'departamento'
/** Dónde hay baños que declarar: vivienda, locales y oficinas (la columna `banos` es una sola; medio baño = 0.5). */
const llevaBanos = (tipo?: string) => ['casa', 'departamento', 'local', 'oficina'].includes(tipoBase(tipo))
const esIndustrial = (tipo?: string) => tipo === 'nave' || tipo === 'bodega'

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

/* ── Piezas de interfaz ───────────────────────────────────────── */

const campoBase: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  border: '1px solid var(--borde-frio)',
  borderRadius: 8,
  fontSize: '.95rem',
  fontFamily: 'inherit',
  background: '#fff',
}

const botonMini: React.CSSProperties = {
  fontSize: '.72rem',
  padding: '4px 8px',
  minHeight: 28,
  border: '1px solid var(--borde-frio)',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

/**
 * Zona de arrastre con selector de archivos debajo.
 *
 * El `<input>` sigue ahí —oculto a la vista, no al teclado ni al lector de
 * pantalla—: arrastrar es cómodo en escritorio, pero en un teléfono sólo
 * existe «pulsar y elegir».
 */
function ZonaArrastre({ id, texto, deshabilitado, onArchivos }: {
  id: string
  texto: string
  deshabilitado?: boolean
  onArchivos: (archivos: FileList) => void
}) {
  const [encima, setEncima] = useState(false)
  return (
    <label htmlFor={id}
      onDragOver={e => { e.preventDefault(); if (!deshabilitado) setEncima(true) }}
      onDragLeave={() => setEncima(false)}
      onDrop={e => {
        e.preventDefault()
        setEncima(false)
        if (!deshabilitado && e.dataTransfer.files.length) onArchivos(e.dataTransfer.files)
      }}
      className="zona-arrastre"
      style={{
        display: 'block', position: 'relative', textAlign: 'center',
        padding: '1.4rem 1rem', borderRadius: 10,
        border: `2px dashed ${encima ? 'var(--azul)' : 'var(--borde-frio)'}`,
        background: encima ? '#EEF2F8' : '#fafbfc',
        cursor: deshabilitado ? 'not-allowed' : 'pointer',
        opacity: deshabilitado ? .6 : 1,
      }}>
      <i className="fa fa-cloud-arrow-up" aria-hidden="true" style={{ fontSize: '1.4rem', color: 'var(--azul)', display: 'block', marginBottom: 6 }} />
      <strong style={{ display: 'block', fontSize: '.88rem', color: '#1F2024' }}>{texto}</strong>
      <span style={{ fontSize: '.76rem', color: '#5A6472' }}>JPG, PNG o WebP · hasta 5 MB cada una</span>
      <input id={id} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={deshabilitado}
        onChange={e => {
          if (e.target.files?.length) onArchivos(e.target.files)
          // Vaciar para que elegir otra vez el mismo archivo vuelva a disparar.
          e.target.value = ''
        }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'inherit' }} />
    </label>
  )
}

/**
 * Un campo con su etiqueta.
 *
 * Con UN control dentro (input, select, textarea) la etiqueta es un <label> que lo envuelve. Con un GRUPO de controles (botoneras de
 * Tipo/Subtipo/Operación, el mapa, las amenidades) `grupo` lo convierte en <fieldset> + <legend>: un <label> con varios controles dentro
 * etiqueta sólo al PRIMER descendiente etiquetable, así que el primer botón heredaba un nombre accesible que mezclaba el campo y todas las
 * opciones («Tipo de inmueble Casa Departamento …») y pulsar el texto del campo activaba esa primera opción.
 */
function Campo({ etiqueta, ayuda, grupo = false, children }: {
  etiqueta: string
  ayuda?: string
  /** Hay varios controles dentro: se agrupan con fieldset/legend en vez de envolverlos en un label. */
  grupo?: boolean
  children: React.ReactNode
}) {
  const idAyuda = useId()
  if (grupo) {
    return (
      <fieldset aria-describedby={ayuda ? idAyuda : undefined} style={{ border: 'none', padding: 0, margin: '0 0 1.1rem', minWidth: 0 }}>
        <legend style={{ display: 'block', padding: 0, fontSize: '.85rem', fontWeight: 600, color: 'var(--texto)', marginBottom: 5 }}>
          {etiqueta}
        </legend>
        {ayuda && (
          <span id={idAyuda} style={{ display: 'block', fontSize: '.78rem', color: '#6B7280', marginBottom: 6 }}>
            {ayuda}
          </span>
        )}
        {children}
      </fieldset>
    )
  }
  return (
    <label style={{ display: 'block', marginBottom: '1.1rem' }}>
      <span style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, color: 'var(--texto)', marginBottom: 5 }}>
        {etiqueta}
      </span>
      {ayuda && (
        <span style={{ display: 'block', fontSize: '.78rem', color: '#6B7280', marginBottom: 6 }}>
          {ayuda}
        </span>
      )}
      {children}
    </label>
  )
}

function Opciones({ valor, opciones, onChange }: {
  valor?: string
  opciones: { v: string; t: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {opciones.map(o => {
        const activo = valor === o.v
        return (
          <button
            key={o.v} type="button" onClick={() => onChange(o.v)}
            aria-pressed={activo}
            style={{
              padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
              fontSize: '.9rem', fontFamily: 'inherit',
              fontWeight: activo ? 700 : 500,
              border: activo ? '2px solid var(--rojo)' : '1px solid var(--borde-frio)',
              background: activo ? '#fdf4f4' : '#fff',
              color: activo ? 'var(--rojo)' : 'var(--texto)',
            }}
          >
            {o.t}
          </button>
        )
      })}
    </div>
  )
}

/* ── Página ───────────────────────────────────────────────────── */

export default function EditarPropiedad({ params }: { params: Promise<{ id: string }> }) {
  // Volver a «mis propiedades» lleva a la lista DEL ROL, dentro del mismo panel (Admin: su lista; los demás: la del portal).
  const rutaLista = rutaListaDePropiedades(useSesionOpcional()?.perfil.rol)
  const { id } = use(params)

  const [user, setUser] = useState<User | null>(null)
  const [cargando, setCargando] = useState(true)
  const [prop, setProp] = useState<Prop | null>(null)
  /**
   * El paso vive en la URL, no sólo en el estado.
   *
   * Antes era `useState` a secas, y pulsar **Atrás en el navegador** te
   * expulsaba del asistente entero — perdías el sitio en el que ibas después
   * de rellenar seis pantallas. En un móvil, donde Atrás es un gesto y no un
   * botón, eso pasa constantemente.
   *
   * `?paso=N` lo arregla sin partir el archivo en siete rutas: Atrás y
   * Adelante recorren los pasos, y cada uno es enlazable — útil para el correo
   * de «cambios solicitados», que puede llevar directo al paso que falla.
   */
  const [paso, setPasoEstado] = useState(0)

  // Al cargar, respetar el paso de la URL.
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get('paso'))
    if (Number.isInteger(n) && n >= 0 && n < PASOS.length) setPasoEstado(n)
  }, [])

  // Atrás y Adelante del navegador.
  useEffect(() => {
    const alVolver = () => {
      const n = Number(new URLSearchParams(window.location.search).get('paso'))
      setPasoEstado(Number.isInteger(n) && n >= 0 && n < PASOS.length ? n : 0)
    }
    window.addEventListener('popstate', alVolver)
    return () => window.removeEventListener('popstate', alVolver)
  }, [])

  const setPaso = useCallback((v: number | ((p: number) => number)) => {
    setPasoEstado(anterior => {
      const siguiente = typeof v === 'function' ? v(anterior) : v
      const limitado = Math.max(0, Math.min(PASOS.length - 1, siguiente))
      if (limitado !== anterior && typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.set('paso', String(limitado))
        // `pushState` y no `replaceState`: es lo que crea la entrada en el
        // historial que hace que Atrás vuelva al paso anterior.
        window.history.pushState({ paso: limitado }, '', url)
      }
      return limitado
    })
  }, [])
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState<'limpio' | 'guardando' | 'guardado' | 'error'>('limpio')
  const [enviando, setEnviando] = useState(false)
  const [faltaPerfil, setFaltaPerfil] = useState(false)
  // Campos que la base todavía no puede guardar (migración sin aplicar). Se
  // dice en vez de dar «Guardado» y perderlos en silencio.
  const [sinColumna, setSinColumna] = useState<string[]>([])
  const [videoNuevo, setVideoNuevo] = useState('')
  // Un administrador publica directo; un publicador manda a revisión. El botón
  // final tiene que decir lo que de verdad va a pasar al pulsarlo.
  const [esAdmin, setEsAdmin] = useState(false)
  // `publicar_sin_revision` (asociado u override): lo calcula el servidor y llega
  // en /api/usuarios/me. Aquí sólo cambia lo que dice el botón; quien autoriza
  // es `/api/propiedades/[id]/estado`.
  const [publicaSinRevision, setPublicaSinRevision] = useState(false)
  // ¿ya se sabe qué permisos tiene la cuenta? Hasta entonces el texto previo no promete revisión ni publicación (lo decide el servidor).
  const [permisosCargados, setPermisosCargados] = useState(false)
  // Qué pasó con el último guardado / envío, según lo que confirmó el servidor (lib/publicador/confirmacion.ts). Se muestra en una
  // región `role="status"` y NO se borra al recargar la propiedad: el usuario tiene que poder leerlo.
  const [resultado, setResultado] = useState<Confirmacion | null>(null)
  const [guardandoBorrador, setGuardandoBorrador] = useState(false)
  // El campo del título muestra el texto CRUDO en cuanto la persona empieza a escribir. Antes estaba atado a `tituloReal`, que recorta
  // (`trim`) y descarta los textos de relleno: el espacio final se borraba en cada tecla (no se podían separar palabras) y escribir
  // «Prop…», «Borrador» o «Nueva propiedad» vaciaba el campo. Mientras no se toca, el relleno heredado («Propiedad sin título») sigue sin mostrarse.
  const [tituloTocado, setTituloTocado] = useState(false)
  const [reintentoPerfil, setReintentoPerfil] = useState(false)
  // `editar_publicadas`: capacidad aparte (corregir lo ya publicado).
  const [editaPublicadas, setEditaPublicadas] = useState(false)
  // Pies de foto, indexados por URL: el texto pertenece a la imagen, así que
  // reordenar las fotos no lo mueve de sitio.
  const [pies, setPies] = useState<Record<string, string>>({})

  // Lo más reciente de `prop`: una foto que termina de subir se añade a la lista ACTUAL y no a una copia vieja (E-48).
  const propRef = useRef<Prop | null>(null)
  // Seguro SÍNCRONO contra el doble clic: el estado de React (`enviando`) se actualiza al repintar, y dos clics en el mismo instante
  // pasaban los dos (mandaban dos órdenes de estado; el servidor rechazaba la segunda). Una referencia sí cambia al momento.
  const operacionEnCurso = useRef(false)
  useEffect(() => { propRef.current = prop }, [prop])

  // Autoguardado que NO pierde lo pendiente si el servidor responde con un error (lib/publicador/guardador.ts).
  const guardador = useMemo(() => crearGuardador({
    enviar: async (envio) => {
      const res = await fetch(`/api/admin/propiedades/${id}`, {
        method: 'PATCH',
        headers: await cabeceras(),
        body: JSON.stringify(envio),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        return { ok: false, error: j.error || 'No se pudo guardar.' }
      }
      const ok = await res.json().catch(() => ({}))
      if (Array.isArray(ok.omitidas) && ok.omitidas.length) {
        setSinColumna(prev => Array.from(new Set([...prev, ...ok.omitidas])))
      }
      return { ok: true }
    },
    alCambiarEstado: (e, mensaje) => {
      setGuardado(e)
      if (e === 'error') setError(mensaje || 'No se pudo guardar.')
      if (e === 'guardado') {
        setError('')
        setTimeout(() => setGuardado(g => (g === 'guardado' ? 'limpio' : g)), 2500)
      }
    },
  }), [id])

  // Subidas por archivo: vista previa local, estado propio y reintento sin perder las demás.
  const [cargas, setCargas] = useState<CargaUI[]>([])
  const archivosEnCola = useRef(new Map<string, File>())
  const urlsDeVista = useRef(new Set<string>())

  // Al salir: lo pendiente se intenta guardar (no se pierde en silencio), se avisa si queda algo sin guardar y se liberan las vistas previas.
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (guardador.hayPendiente()) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', aviso)
    const vistas = urlsDeVista.current
    return () => {
      window.removeEventListener('beforeunload', aviso)
      void guardador.vaciar()
      vistas.forEach(u => URL.revokeObjectURL(u))
      vistas.clear()
    }
  }, [guardador])

  const cargar = useCallback(async (): Promise<Prop | null> => {
    try {
      const res = await fetch('/api/publicador/propiedades', { headers: await cabeceras() })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'No se pudo cargar la propiedad.')
        return null
      }
      const todas: Prop[] = await res.json()
      const mia = todas.find(p => p.id === id)
      if (!mia) { setError('Esa propiedad no existe o no es tuya.'); return null }
      // Lo que aún no se guardó (por un error) NO se pisa con lo que devuelve el servidor.
      const sinGuardar = guardador.pendiente()
      const aplicado = Object.keys(sinGuardar).length ? { ...mia, ...sinGuardar } : mia
      propRef.current = aplicado
      setProp(aplicado)
      if (!guardador.hayPendiente()) setError('')

      try {
        const actual = auth.currentUser
        const rm = actual ? await perfilDeSesion(actual.uid, () => actual.getIdToken()) : null
        if (rm?.ok) {
          const jm = rm.datos
          setEsAdmin(puede({ rol: (jm?.usuario as { rol?: string } | undefined)?.rol ?? jm?.rol ?? 'cliente', superAdmin: jm?.superAdmin === true }, 'propiedad.moderar'))
          setPermisosCargados(true)
          setPublicaSinRevision(jm?.capacidades?.publicar_sin_revision === true)
          setEditaPublicadas(jm?.capacidades?.editar_publicadas === true)
        }
      } catch { /* si no se sabe el rol, se asume publicador: manda a revisión */ }

      // Los pies viven en la tabla `fotos` y de un borrador no los puede leer
      // el navegador: se piden aparte. Si fallan, se editan las fotos igual.
      try {
        const rp = await fetch(`/api/admin/propiedades/${id}`, { headers: await cabeceras() })
        if (rp.ok) {
          const jp = await rp.json()
          if (jp.pies && typeof jp.pies === 'object') setPies(jp.pies)
        }
      } catch { /* sin pies: lo demás sigue funcionando */ }
      return aplicado
    } catch {
      setError('Error de red.')
      return null
    }
  }, [id, guardador])

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u)
      setCargando(false)
      if (u) cargar()
    })
  }, [cargar])

  /**
   * Autoguardado con retardo (lib/publicador/guardador.ts).
   *
   * El estado local se actualiza al instante: escribir nunca debe sentirse lento por esperar a la red. Los cambios se acumulan y se
   * mandan 1,2 s después de la última tecla; si el servidor responde con error NO se descartan: vuelven a la cola y se reintentan.
   */
  const guardar = useCallback((cambios: Record<string, unknown>) => {
    if (propRef.current) propRef.current = { ...propRef.current, ...cambios }
    setProp(p => (p ? { ...p, ...cambios } : p))
    setResultado(r => (r && r.tipo !== 'transicion_fallida' ? null : r))
    guardador.guardar(cambios)
  }, [guardador])

  /**
   * Cambiar el tipo o la operación cambia lo que aplica: el subtipo se limpia y las características que dejan de aplicar se quitan
   * (el servidor haría lo mismo; así lo que se ve en pantalla es lo que se guardará). Lo demás de `extras` se conserva.
   */
  const cambiarTipoOperacion = useCallback((cambio: { tipo?: string; operacion?: string }) => {
    const actual = propRef.current
    const tipo = cambio.tipo ?? actual?.tipo
    const operacion = cambio.operacion ?? actual?.operacion
    const cambios: Record<string, unknown> = { ...cambio }
    if (cambio.tipo !== undefined && cambio.tipo !== actual?.tipo) cambios.subtipo = null
    const guardadas = leerCaracteristicas(actual?.extras)
    if (Object.keys(guardadas).length) {
      const podadas = podarCaracteristicas(guardadas, tipo, operacion)
      cambios.extras = conCaracteristicas(actual?.extras, Object.keys(podadas).length ? podadas : null)
    }
    guardar(cambios)
  }, [guardar])

  /**
   * Sube fotos o planos a Cloudinary, UNO A UNO y con estado por archivo (lib/publicador/cola-fotos.ts).
   *
   * Se valida ANTES de subir: formato y tamaño (un HEIC de 12 MB tardaba un minuto en fallar). Cada archivo muestra su vista previa
   * local mientras sube; si falla se queda con su motivo y se reintenta SOLO ese, sin perder los demás. Cada foto subida se añade a la
   * lista ACTUAL al terminar (no a la copia que había al empezar), así que quitar o reordenar mientras se sube no se pisa.
   */
  function quitarCarga(idCarga: string) {
    setCargas(c => {
      const x = c.find(k => k.id === idCarga)
      if (x) { URL.revokeObjectURL(x.vista); urlsDeVista.current.delete(x.vista) }
      return c.filter(k => k.id !== idCarga)
    })
    archivosEnCola.current.delete(idCarga)
  }

  async function subirUna(idCarga: string, destino: 'fotos' | 'planos') {
    const archivo = archivosEnCola.current.get(idCarga)
    if (!archivo) return
    setCargas(c => c.map(x => (x.id === idCarga ? { ...x, estado: 'subiendo', motivo: undefined } : x)))
    const tope = destino === 'fotos' ? MAXIMO_FOTOS : MAXIMO_PLANOS
    const r = await procesarCarga({
      archivo,
      // V-1.1.78 (SEC-05): subida firmada. Carpeta y nombre los decide el servidor.
      subir: a => subirImagen(a, { proposito: 'propiedad', propiedadId: id, clase: destino }),
      agregar: url => {
        const actuales = (destino === 'fotos' ? propRef.current?.fotos : propRef.current?.planos) ?? []
        const { lista, agregada } = agregarSinDuplicar(actuales, url, tope)
        if (agregada) guardar(destino === 'fotos' ? { fotos: lista } : { planos: lista })
        return agregada
      },
    })
    if (r.estado === 'ok') quitarCarga(idCarga)
    else setCargas(c => c.map(x => (x.id === idCarga ? { ...x, estado: 'error', motivo: r.motivo } : x)))
  }

  function subirImagenes(archivos: FileList | File[], destino: 'fotos' | 'planos') {
    const guardadas = ((destino === 'fotos' ? propRef.current?.fotos : propRef.current?.planos) ?? []).length
    const subiendoYa = cargas.filter(c => c.destino === destino && c.estado === 'subiendo').length
    const tope = destino === 'fotos' ? MAXIMO_FOTOS : MAXIMO_PLANOS
    const { validos, problemas } = repartirArchivos(Array.from(archivos), guardadas + subiendoYa, tope)
    setError(problemas.join(' '))
    if (validos.length === 0) return

    const nuevas: CargaUI[] = validos.map(a => {
      const idCarga = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      archivosEnCola.current.set(idCarga, a)
      const vista = URL.createObjectURL(a)
      urlsDeVista.current.add(vista)
      return { id: idCarga, nombre: a.name, estado: 'subiendo', vista, destino }
    })
    setCargas(c => [...c, ...nuevas])
    void (async () => { for (const n of nuevas) await subirUna(n.id, destino) })()
  }

  function reintentarCarga(idCarga: string, destino: 'fotos' | 'planos') {
    void subirUna(idCarga, destino)
  }

  const sinPlazas = (destino: 'fotos' | 'planos') => {
    const tope = destino === 'fotos' ? MAXIMO_FOTOS : MAXIMO_PLANOS
    const guardadas = ((destino === 'fotos' ? prop?.fotos : prop?.planos) ?? []).length
    return plazasLibres(guardadas, cargas.filter(c => c.destino === destino && c.estado === 'subiendo').length, tope) === 0
  }
  const subiendo = cargas.some(c => c.estado === 'subiendo')

  /** Los archivos en cola de una zona: vista previa + estado + reintentar/descartar. */
  const listaDeCargas = (destino: 'fotos' | 'planos') => {
    const mias = cargas.filter(c => c.destino === destino)
    if (mias.length === 0) return null
    return (
      <ul aria-label="Archivos en cola" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
        {mias.map(c => (
          <li key={c.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: `1px solid ${c.estado === 'error' ? '#fca5a5' : '#e8ecf1'}`, background: '#fafbfc' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.vista} alt={`Vista previa de ${c.nombre}`}
              style={{ width: '100%', height: 105, objectFit: 'cover', display: 'block', opacity: c.estado === 'subiendo' ? .55 : 1 }} />
            <div role="status" style={{ padding: '6px 8px', fontSize: '.74rem', color: c.estado === 'error' ? 'var(--error-fuerte)' : '#5A6472' }}>
              {c.estado === 'subiendo' ? 'Subiendo…' : (c.motivo || 'No se pudo subir.')}
            </div>
            {c.estado === 'error' && (
              <div style={{ display: 'flex', gap: 4, padding: '0 6px 6px' }}>
                <button type="button" onClick={() => reintentarCarga(c.id, destino)} style={{ ...botonMini, flex: 1 }}>Reintentar</button>
                <button type="button" onClick={() => quitarCarga(c.id)} style={{ ...botonMini, borderColor: '#fca5a5', color: 'var(--error-fuerte)' }}>Descartar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  }

  function quitarFoto(url: string) {
    guardar({ fotos: (prop?.fotos ?? []).filter(f => f !== url) })
  }

  function moverPortada(url: string) {
    const resto = (prop?.fotos ?? []).filter(f => f !== url)
    guardar({ fotos: [url, ...resto] })
  }

  const pieTemporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  function guardarPie(url: string, texto: string) {
    setPies(p => ({ ...p, [url]: texto }))
    setGuardado('guardando')
    if (pieTemporizador.current) clearTimeout(pieTemporizador.current)
    pieTemporizador.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/propiedades/${id}`, {
          method: 'PATCH',
          headers: await cabeceras(),
          body: JSON.stringify({ pies: { [url]: texto } }),
        })
        setGuardado(res.ok ? 'guardado' : 'error')
        setTimeout(() => setGuardado(g => (g === 'guardado' ? 'limpio' : g)), 2500)
      } catch {
        setGuardado('error')
      }
    }, 900)
  }

  function moverFoto(i: number, delta: number) {
    guardar({ fotos: mover(prop?.fotos ?? [], i, delta) })
  }

  function quitarPlano(url: string) {
    guardar({ planos: (prop?.planos ?? []).filter(f => f !== url) })
  }

  function agregarVideo() {
    const vid = idYoutube(videoNuevo)
    if (!vid) {
      setError('Ese enlace no es de un video de YouTube. En YouTube, pulsa «Compartir» y copia el enlace.')
      return
    }
    const actuales = prop?.videos ?? []
    const url = urlYoutube(vid)
    if (!actuales.includes(url)) {
      if (actuales.length >= MAXIMO_VIDEOS) {
        setError(`Caben ${MAXIMO_VIDEOS} videos como máximo.`)
        return
      }
      guardar({ videos: [...actuales, url] })
    }
    setVideoNuevo('')
    setError('')
  }

  /**
   * Publica o manda a revisión, y DICE lo que pasó.
   *
   * El texto que ve la persona sale de la respuesta del servidor (`estado` releído de la base) cruzada con lo que se ve al recargar
   * la propiedad; nunca del texto del botón. `reintento` repite SOLO la transición (el borrador ya está guardado: no se crea otro
   * anuncio ni se vuelven a subir fotos).
   */
  async function enviarARevision(reintento?: 'publicada' | 'en_revision') {
    if (operacionEnCurso.current) return
    operacionEnCurso.current = true
    try { await enviarSinSeguro(reintento) } finally { operacionEnCurso.current = false }
  }

  async function enviarSinSeguro(reintento?: 'publicada' | 'en_revision') {
    setEnviando(true)
    setResultado(null)
    setFaltaPerfil(false)
    setReintentoPerfil(false)
    // El admin salta la revisión —revisarse a sí mismo no aporta nada—, pero
    // el contenido mínimo se comprueba igual en el servidor.
    const destino = reintento ?? destinoDePublicacion(prop?.estado_pub, esAdmin, publicaSinRevisionEfectiva(publicaSinRevision, prop))
    // No se envía nada con fotos aún subiéndose ni con lo pendiente SIN guardar: se vacía lo pendiente y se COMPRUEBA el resultado.
    // Antes el fallo del guardado se ignoraba y el envío fallaba después con «5 fotos como mínimo (llevas 0)» sin decir por qué (E-48).
    if (subiendo) {
      setEnviando(false)
      setError('Espera a que terminen de subirse las fotos antes de enviar.')
      return
    }
    const guardadoPrevio = await guardador.vaciar()
    if (!guardadoPrevio.ok) {
      setEnviando(false)
      setError(`No se envió: tu anuncio no se pudo guardar. ${guardadoPrevio.error}`)
      return
    }

    // Ya está en ese estado (una publicada que sólo se editaba): no se pide un
    // cambio que el servidor rechazaría con «ya está en ese estado» (V-1.1.84).
    if (!destino) {
      setEnviando(false)
      setError('')
      const recargada = await cargar()
      setResultado(confirmacionDeGuardado(recargada, recargada ? rutaDePropia(recargada) : null))
      return
    }

    let res: Response | null = null
    let j: RespuestaDeEstado & { error?: string; perfilIncompleto?: boolean } = {}
    try {
      res = await fetch(`/api/propiedades/${id}/estado`, {
        method: 'POST',
        headers: await cabeceras(),
        body: JSON.stringify({ estado: destino }),
      })
      j = await res.json().catch(() => ({}))
    } catch { /* sin red: el borrador ya está guardado, se dice abajo */ }
    setEnviando(false)
    if (!res || !res.ok) {
      // El servidor pudo haber hecho el cambio y perderse la respuesta (o ya estaba así): se mira el estado REAL antes de hablar de fallo.
      const recargada = await cargar()
      if (res && recargada?.estado_pub === destino) {
        setResultado(confirmacionDeEnvio({ estado: destino }, recargada))
        return
      }
      // El borrador SÍ quedó guardado (el guardado previo se comprobó arriba): se dice y se ofrece reintentar solo la transición.
      setError('')
      setResultado(confirmacionDeTransicionFallida(
        destino,
        res ? (j.error || (destino === 'publicada' ? 'No se pudo publicar.' : 'No se pudo enviar a revisión.')) : 'No hubo conexión con el servidor.',
      ))
      // Falta el contacto del publicador, no algo de esta propiedad: el sitio donde se arregla es el perfil.
      setReintentoPerfil(Boolean(j.perfilIncompleto))
      return
    }
    setError('')
    const recargada = await cargar()
    setResultado(confirmacionDeEnvio(j, recargada))
  }

  /** Enlace a una ya publicada: solo si ESTA propiedad es visible al público; la ruta se calcula con el mismo `rutaDe` del servidor. */
  function rutaDePropia(p: Prop): string | null {
    if (p.estado_pub !== 'publicada') return null
    return rutaPublicaValida(`/propiedades/${encodeURIComponent((p.slug ?? '').trim() || p.id)}`)
  }

  /** «Guardar borrador»: vacía lo pendiente, COMPRUEBA el resultado y confirma según el estado que se ve al recargar. No publica ni envía. */
  async function guardarBorrador() {
    if (operacionEnCurso.current) return
    operacionEnCurso.current = true
    try { await guardarBorradorSinSeguro() } finally { operacionEnCurso.current = false }
  }

  async function guardarBorradorSinSeguro() {
    setGuardandoBorrador(true)
    setResultado(null)
    if (subiendo) {
      setGuardandoBorrador(false)
      setError('Espera a que terminen de subirse las fotos antes de guardar.')
      return
    }
    const g = await guardador.vaciar()
    if (!g.ok) {
      setGuardandoBorrador(false)
      setError(`No se guardó: ${g.error}`)
      return
    }
    setError('')
    const recargada = await cargar()
    setGuardandoBorrador(false)
    setResultado(confirmacionDeGuardado(recargada, recargada ? rutaDePropia(recargada) : null))
  }

  if (cargando) return <div style={{ padding: '6rem 2rem', textAlign: 'center' }}>Cargando…</div>

  if (!user) return (
    <div style={{ padding: '6rem 2rem', textAlign: 'center', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>Editar propiedad</h1>
      <Link href="/dashboard" style={{ background: 'var(--rojo)', color: '#fff', padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>
        Iniciar sesión
      </Link>
    </div>
  )

  if (!prop) return (
    <div style={{ padding: '6rem 2rem', textAlign: 'center', fontFamily: 'system-ui' }}>
      <p style={{ color: 'var(--error)' }}>{error || 'Cargando…'}</p>
      <Link href={rutaLista} style={{ color: 'var(--azul)' }}>← Volver a mis propiedades</Link>
    </div>
  )

  const pct = calcularCompletitud(prop as Record<string, unknown>)
  const falta = faltantes(prop as Record<string, unknown>)
  const lista = falta.length === 0
  const largoDescripcion = (prop.descripcion ?? '').trim().length
  /**
   * Quién puede cambiar qué.
   *
   * Para un publicador, una propiedad en revisión o ya publicada está cerrada:
   * si pudiera cambiarla después de aprobarla, la revisión no serviría de nada.
   *
   * Pero al ADMINISTRADOR le decía «pídele a un administrador que la pase a
   * borrador» —a sí mismo—, y como casi todo está publicado, el asistente salía
   * en gris y parecía que la edición no funcionaba. El servidor siempre le dejó
   * guardar (`PATCH /api/admin/propiedades/[id]` sólo comprueba el dueño cuando
   * NO es admin): el candado era de la pantalla, no del permiso.
   */
  const editable = puedeEditarAnuncio(prop.estado_pub, esAdmin, editaPublicadas)
  const publicadaYEditable = (esAdmin || editaPublicadas) && prop.estado_pub === 'publicada'
  const fotos = prop.fotos ?? []
  const conObservaciones = tieneObservacionesDelRevisor(prop)
  const modo = modoDeEnvio({ permisosCargados, esAdmin, publicaSinRevision: publicaSinRevisionEfectiva(publicaSinRevision, prop) })

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.25rem 6rem', fontFamily: 'system-ui' }}>
      <Link href={rutaLista} style={{ fontSize: '.85rem', color: 'var(--azul)', textDecoration: 'none' }}>
        ← Mis propiedades
      </Link>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--azul)', margin: '.6rem 0 .2rem' }}>
        {/* Antes el respaldo era el MISMO texto que el relleno, así que «no
            tiene título» y «se llama Propiedad sin título» se veían igual. */}
        {tituloReal(prop) ?? <span style={{ color: '#5A6472', fontStyle: 'italic', fontWeight: 600 }}>{nombreDe(prop)}</span>}
      </h1>

      {!editable && (
        <p style={{ background: 'var(--aviso-fondo)', color: 'var(--aviso-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.88rem', marginTop: 10 }}>
          {prop.estado_pub === 'en_revision'
            ? 'Está en revisión. Para poder editarla, retírala primero desde tus propiedades.'
            : 'Está publicada. Para cambiarla, pide a un administrador que la pase a borrador.'}
        </p>
      )}

      {publicadaYEditable && (
        <p style={{ background: 'var(--aviso-fondo)', color: 'var(--aviso-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.88rem', marginTop: 10 }}>
          Está <strong>publicada</strong>: lo que guardes aquí se ve en el sitio en cuanto se guarda.
        </p>
      )}

      {prop.nota_moderacion && (
        <p style={{ background: 'var(--aviso-fondo-calido)', borderLeft: '3px solid var(--aviso)', padding: '10px 14px', fontSize: '.88rem', color: 'var(--aviso-fuerte)', borderRadius: '0 8px 8px 0', marginTop: 10 }}>
          <strong>Nota del revisor:</strong> {prop.nota_moderacion}
        </p>
      )}

      {/* ── Progreso ── */}
      <section style={{ margin: '1.5rem 0' }} aria-label="Progreso del anuncio">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontSize: '.85rem', color: '#5A6472' }}>
            {etiquetaDeProgreso({ estadoPub: prop.estado_pub, lista, modo, minimo: COMPLETITUD_MINIMA })}
          </span>
          <strong style={{ fontSize: '1rem', color: 'var(--texto)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</strong>
        </div>
        <div style={{ height: 8, background: '#F1F4F8', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`, borderRadius: 4,
            background: lista ? 'var(--exito-fuerte)' : 'var(--aviso)',
            transition: 'width .3s ease',
          }} />
        </div>
      </section>

      {/* ── Los cuatro grupos ── */}
      <nav aria-label="Etapas" style={{
        display: 'flex', alignItems: 'flex-start', marginBottom: '1.5rem',
        overflowX: 'auto', paddingBottom: 4,
      }}>
        {GRUPOS.map((g, gi) => {
          const activo = g.pasos.includes(paso)
          const completo = g.pasos.every(i => CAMPOS_DE_PASO[i]?.(prop as Record<string, unknown>))
          const pasado = paso > Math.max(...g.pasos)
          return (
            <div key={g.nombre} style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 108 }}>
              <button type="button" onClick={() => setPaso(g.pasos[0])}
                aria-current={activo ? 'step' : undefined}
                style={{
                  display: 'grid', justifyItems: 'center', gap: 6,
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', padding: 0, width: '100%',
                }}>
                <span style={{
                  width: 30, height: 30, borderRadius: '50%',
                  display: 'grid', placeItems: 'center',
                  fontSize: '.82rem', fontWeight: 800,
                  background: activo ? 'var(--rojo-marca)' : (completo || pasado) ? 'var(--exito-fuerte)' : '#EDEAE5',
                  color: activo || completo || pasado ? '#fff' : '#5A6472',
                  border: activo ? '3px solid rgba(200,16,46,.22)' : 'none',
                }}>
                  {completo && !activo ? '✓' : gi + 1}
                </span>
                <span style={{
                  fontSize: '.74rem', fontWeight: activo ? 700 : 500,
                  color: activo ? 'var(--rojo-marca)' : '#5A6472',
                  fontFamily: 'Montserrat, sans-serif',
                }}>
                  {g.nombre}
                </span>
              </button>
              {gi < GRUPOS.length - 1 && (
                <span aria-hidden style={{
                  flex: 1, height: 2, marginTop: 14, minWidth: 12,
                  background: pasado ? 'var(--exito-fuerte)' : '#EDEAE5',
                }} />
              )}
            </div>
          )
        })}
      </nav>

      {/* ── Sub-pasos del grupo activo ──
           Sólo los del grupo en el que se está: enseñar los siete a la vez es
           justo lo que se quería evitar. */}
      {(() => {
        const grupo = GRUPOS.find(g => g.pasos.includes(paso))
        if (!grupo || grupo.pasos.length < 2) return null
        return (
          <nav aria-label={`Pasos de ${grupo.nombre}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            {grupo.pasos.map(i => {
              const hecho = CAMPOS_DE_PASO[i]?.(prop as Record<string, unknown>)
              const aqui = paso === i
              return (
                <button key={i} type="button" onClick={() => setPaso(i)}
                  aria-current={aqui ? 'step' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 13px', borderRadius: 20, cursor: 'pointer',
                    fontSize: '.8rem', fontFamily: 'inherit',
                    fontWeight: aqui ? 700 : 500,
                    border: `1px solid ${aqui ? 'var(--azul)' : 'var(--borde-frio)'}`,
                    background: aqui ? 'var(--azul)' : '#fff',
                    color: aqui ? '#fff' : '#5A6472',
                  }}>
                  {hecho && !aqui && <span style={{ color: 'var(--exito-fuerte)', fontWeight: 800 }}>✓</span>}
                  {PASOS[i]}
                </button>
              )
            })}
          </nav>
        )
      })()}

      {error && (
        <p style={{ background: 'var(--error-fondo-fuerte)', color: 'var(--error-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.88rem', marginBottom: '1rem' }}>
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

      {sinColumna.length > 0 && (
        <p role="status" style={{ background: 'var(--aviso-fondo)', color: 'var(--aviso-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.84rem', marginBottom: '1rem', lineHeight: 1.55 }}>
          Lo demás se guardó, pero <strong>{sinColumna.join(', ')}</strong> todavía no:
          la base necesita una actualización (migración 07). Cuando se aplique,
          vuelve a colocar el pin o a escribir ese dato.
        </p>
      )}

      <fieldset disabled={!editable} style={{ border: 'none', padding: 0, margin: 0, opacity: editable ? 1 : .6 }}>
        <section style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 12, padding: '1.5rem' }}>

          {paso === 0 && (
            <>
              <Campo etiqueta="Título del anuncio" ayuda="Lo primero que ve la gente. Sé concreto: qué es, dónde y cuánto mide.">
                <input value={tituloTocado ? (prop.titulo ?? '') : (tituloReal(prop) ?? '')} onChange={e => { setTituloTocado(true); guardar({ titulo: e.target.value }) }}
                  placeholder="Bodega en renta en Blvd. San Juan Bosco, 1,244 m²" style={campoBase} />
              </Campo>
              <Campo etiqueta="Tipo de inmueble" grupo>
                <Opciones valor={prop.tipo} opciones={TIPOS} onChange={v => cambiarTipoOperacion({ tipo: v })} />
              </Campo>
              {(SUBTIPOS[tipoBase(prop.tipo) as Tipo] ?? []).length > 0 && (
                <Campo etiqueta="Subtipo" ayuda="Opcional." grupo>
                  <Opciones valor={prop.subtipo ?? ''} opciones={[{ v: '', t: 'Sin indicar' }, ...SUBTIPOS[tipoBase(prop.tipo) as Tipo].map(s => ({ v: s.valor, t: s.etiqueta }))]}
                    onChange={v => guardar({ subtipo: v || null })} />
                </Campo>
              )}
              <Campo etiqueta="Operación" grupo>
                <Opciones valor={prop.operacion} opciones={OPERACIONES} onChange={v => cambiarTipoOperacion({ operacion: v })} />
              </Campo>
            </>
          )}

          {paso === 1 && (
            <>
              <Campo etiqueta="Ubicación" ayuda="Calle o boulevard y colonia. No hace falta el número exacto si prefieres reservarlo.">
                <input value={prop.ubicacion ?? ''} onChange={e => guardar({ ubicacion: e.target.value })}
                  placeholder="Blvd. San Juan Bosco, Cañada del Refugio, León, Gto." style={campoBase} />
              </Campo>

              {/* El pin en el mapa. Sin coordenadas no hay busqueda por area,
                  que es lo que mas se espera de un portal inmobiliario.
                  Mientras 07-ubicacion-y-fotos.sql no este aplicado no existe
                  la columna: la ruta PATCH reintenta sin ella, asi que esto no
                  rompe nada — sencillamente todavia no guarda. */}
              <Campo etiqueta="Marca el punto en el mapa" grupo
                ayuda="Es lo que permite que te encuentren buscando por zona.">
                <MapaSelector
                  lat={typeof prop.lat === 'number' ? prop.lat : null}
                  lng={typeof prop.lng === 'number' ? prop.lng : null}
                  direccion={prop.ubicacion ?? ''}
                  deshabilitado={!editable}
                  onCambio={({ lat, lng, direccion }) =>
                    guardar(direccion ? { lat, lng, ubicacion: direccion } : { lat, lng })
                  }
                />
              </Campo>
            </>
          )}

          {paso === 2 && (
            <>
              <Campo etiqueta={`${etiquetaSuperficie(prop.tipo)} (m²)`}>
                <input type="number" min={0} step="0.01" inputMode="decimal" value={prop.metros ?? ''}
                  onChange={e => guardar({ metros: e.target.value ? Number(e.target.value) : null })}
                  placeholder="1244" style={campoBase} />
              </Campo>

              {llevaBanos(prop.tipo) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1rem' }}>
                  {esResidencial(prop.tipo) && (
                    <Campo etiqueta="Recámaras">
                      <input type="number" min={0} value={prop.recamaras ?? ''}
                        onChange={e => guardar({ recamaras: e.target.value ? Number(e.target.value) : null })} style={campoBase} />
                    </Campo>
                  )}
                  <Campo etiqueta="Baños" ayuda="Un medio baño cuenta como 0.5 (por ejemplo 2.5).">
                    <input type="number" min={0} step="0.5" value={prop.banos ?? ''}
                      onChange={e => guardar({ banos: e.target.value ? Number(e.target.value) : null })} style={campoBase} />
                  </Campo>
                </div>
              )}

              {esIndustrial(prop.tipo) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1rem' }}>
                  <Campo etiqueta="Altura libre en metros">
                    <input type="number" min={0} step="0.1" value={prop.altura_libre ?? ''}
                      onChange={e => guardar({ altura_libre: e.target.value ? Number(e.target.value) : null })} style={campoBase} />
                  </Campo>
                  <Campo etiqueta="Andenes de carga">
                    <input type="number" min={0} value={prop.andenes ?? ''}
                      onChange={e => guardar({ andenes: e.target.value ? Number(e.target.value) : null })} style={campoBase} />
                  </Campo>
                </div>
              )}

              <CamposCaracteristicas tipo={prop.tipo} operacion={prop.operacion} extras={prop.extras} deshabilitado={!editable}
                grupos={['espacios', 'condiciones', 'servicios', 'seguridad', 'accesibilidad']}
                onChange={extras => guardar({ extras })} />

              {/* Era un campo de texto que se recalculaba con cada tecla desde
                  la lista: al escribir la coma, el trozo vacío se descartaba y
                  la coma desaparecía. Sólo se podía guardar UNA amenidad. */}
              {/* AMENIDADES: instalaciones y servicios del inmueble o del conjunto. Las opciones estructuradas y las etiquetas libres son dos datos distintos, juntos aquí porque son lo mismo para quien publica. */}
              <CamposCaracteristicas tipo={prop.tipo} operacion={prop.operacion} extras={prop.extras} deshabilitado={!editable}
                concepto="amenidad" grupos={['espacios', 'seguridad']} onChange={extras => guardar({ extras })} />

              <Campo etiqueta="Amenidades" grupo ayuda="Escribe y pulsa Enter, o toca una de las sugerencias. Puedes pegar varias separadas por comas.">
                <CampoAmenidades
                  valor={prop.amenidades ?? []}
                  tipo={prop.tipo}
                  deshabilitado={!editable}
                  onChange={amenidades => guardar({ amenidades })}
                />
              </Campo>
            </>
          )}

          {paso === 3 && (
            <>
              <Campo etiqueta={prop.operacion === 'renta' ? 'Precio mensual en pesos' : 'Precio en pesos'}>
                <input type="number" min={0} value={prop.precio ?? ''}
                  onChange={e => guardar({ precio: e.target.value ? Number(e.target.value) : null })}
                  placeholder="118180" style={campoBase} />
              </Campo>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: '1.1rem', fontSize: '.9rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!prop.precio_incluye_iva}
                  onChange={e => guardar({ precio_incluye_iva: e.target.checked })}
                  style={{ width: 17, height: 17, cursor: 'pointer' }} />
                El precio ya incluye IVA
              </label>
              <Campo etiqueta="Mantenimiento mensual" ayuda="Déjalo vacío si no aplica.">
                <input type="number" min={0} value={prop.mantenimiento ?? ''}
                  onChange={e => guardar({ mantenimiento: e.target.value ? Number(e.target.value) : null })}
                  style={campoBase} />
              </Campo>
              <CamposCaracteristicas tipo={prop.tipo} operacion={prop.operacion} extras={prop.extras} deshabilitado={!editable}
                grupos={['renta']} onChange={extras => guardar({ extras })} />
            </>
          )}

          {paso === 4 && (
            <>
              <p style={{ fontSize: '.88rem', color: '#5A6472', marginBottom: '1rem', lineHeight: 1.6 }}>
                Entre <strong>{MINIMO_FOTOS} y {MAXIMO_FOTOS} fotos</strong>. La primera es la portada;
                cambia el orden con las flechas.
              </p>

              {/* Consejo permanente, como en Inmuebles24. Lo de las marcas de
                  agua no es cosmético: es lo que evita que el catálogo se llene
                  de fotos con el logo de otra inmobiliaria encima. */}
              <aside style={{ background: 'var(--aviso-fondo-calido)', borderLeft: '3px solid var(--aviso-fuerte)', padding: '10px 14px', borderRadius: '0 8px 8px 0', fontSize: '.82rem', color: '#5A4A2A', lineHeight: 1.55, marginBottom: '1rem' }}>
                <strong>Más visitas con buenas fotos:</strong> nítidas, con luz de día y horizontales.
                Evita bordes, logos, marcas de agua o textos promocionales.
              </aside>

              <ZonaArrastre id="subir-fotos" deshabilitado={sinPlazas('fotos')}
                texto="Arrastra aquí las fotos o pulsa para elegirlas"
                onArchivos={a => subirImagenes(a, 'fotos')} />

              {listaDeCargas('fotos')}

              <p aria-live="polite" style={{ fontSize: '.8rem', margin: '.8rem 0 0', color: fotos.length >= MINIMO_FOTOS ? 'var(--exito-fuerte)' : '#5A6472' }}>
                {fotos.length >= MINIMO_FOTOS
                  ? `${fotos.length} fotos · suficientes`
                  : `${fotos.length} de ${MINIMO_FOTOS} fotos · faltan ${MINIMO_FOTOS - fotos.length}`}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginTop: '.8rem' }}>
                {fotos.map((f, i) => (
                  <figure key={f} style={{ margin: 0, position: 'relative', borderRadius: 8, overflow: 'hidden', border: i === 0 ? '2px solid var(--rojo)' : '1px solid #e8ecf1' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f} alt={`Foto ${i + 1} de ${prop.titulo || 'la propiedad'}`}
                      style={{ width: '100%', height: 105, objectFit: 'cover', display: 'block' }} />
                    {i === 0 && (
                      <figcaption style={{ position: 'absolute', top: 6, left: 6, background: 'var(--rojo)', color: '#fff', fontSize: '.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>
                        ★ Portada
                      </figcaption>
                    )}
                    <div style={{ display: 'flex', gap: 4, padding: 6, background: '#fafbfc' }}>
                      <button type="button" onClick={() => moverFoto(i, -1)} disabled={i === 0}
                        aria-label={`Mover la foto ${i + 1} antes`} style={botonMini}>←</button>
                      <button type="button" onClick={() => moverFoto(i, 1)} disabled={i === fotos.length - 1}
                        aria-label={`Mover la foto ${i + 1} después`} style={botonMini}>→</button>
                      {i !== 0 && (
                        <button type="button" onClick={() => moverPortada(f)}
                          aria-label={`Hacer portada la foto ${i + 1}`}
                          style={{ ...botonMini, flex: 1 }}>
                          Portada
                        </button>
                      )}
                      <button type="button" onClick={() => quitarFoto(f)}
                        aria-label={`Quitar foto ${i + 1}`}
                        style={{ ...botonMini, flex: i === 0 ? 1 : undefined, borderColor: '#fca5a5', color: 'var(--error-fuerte)' }}>
                        Quitar
                      </button>
                    </div>
                    {/* El pie de foto: lo que la imagen no dice sola. «Salón de
                        eventos» sobre una foto de un techo cambia lo que se ve. */}
                    <input
                      value={pies[f] ?? ''}
                      onChange={e => guardarPie(f, e.target.value.slice(0, MAXIMO_PIE))}
                      placeholder="Pie de foto (opcional)"
                      aria-label={`Pie de la foto ${i + 1}`}
                      maxLength={MAXIMO_PIE}
                      style={{
                        width: '100%', border: 'none', borderTop: '1px solid #e8ecf1',
                        padding: '7px 9px', fontSize: '.75rem', fontFamily: 'inherit',
                        background: '#fff', color: '#374151',
                      }} />
                  </figure>
                ))}
              </div>

              {/* ── Planos, aparte ──
                  Para una nave el plano vale más que cualquier foto, y mezclado
                  en la galería se veía como una foto más. */}
              <h3 style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--azul)', margin: '2rem 0 .3rem' }}>
                Planos <span style={{ fontWeight: 400, color: '#5A6472', fontSize: '.8rem' }}>· opcional</span>
              </h3>
              <p style={{ fontSize: '.82rem', color: '#6B7280', margin: '0 0 .8rem' }}>
                Distribución, cortes o levantamiento. Se enseñan en su propia sección de la ficha.
              </p>
              <ZonaArrastre id="subir-planos" deshabilitado={sinPlazas('planos')}
                texto="Arrastra aquí los planos o pulsa para elegirlos"
                onArchivos={a => subirImagenes(a, 'planos')} />
              {listaDeCargas('planos')}
              {(prop.planos ?? []).length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginTop: '.8rem' }}>
                  {(prop.planos ?? []).map((f, i) => (
                    <figure key={f} style={{ margin: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #e8ecf1', background: '#fff' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f} alt={`Plano ${i + 1}`} style={{ width: '100%', height: 105, objectFit: 'contain', display: 'block', background: '#fff' }} />
                      <div style={{ padding: 6, background: '#fafbfc' }}>
                        <button type="button" onClick={() => quitarPlano(f)} aria-label={`Quitar plano ${i + 1}`}
                          style={{ ...botonMini, width: '100%', borderColor: '#fca5a5', color: 'var(--error-fuerte)' }}>
                          Quitar
                        </button>
                      </div>
                    </figure>
                  ))}
                </div>
              )}

              {/* ── Videos de YouTube ──
                  Sólo YouTube, y guardado en una forma única: un «video» que
                  apunta a cualquier sitio es un enlace sin revisar en la ficha. */}
              <h3 style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--azul)', margin: '2rem 0 .3rem' }}>
                Videos <span style={{ fontWeight: 400, color: '#5A6472', fontSize: '.8rem' }}>· opcional, hasta {MAXIMO_VIDEOS}</span>
              </h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input aria-label="Enlace del video de YouTube" value={videoNuevo}
                  onChange={e => setVideoNuevo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarVideo() } }}
                  placeholder="https://youtu.be/…" inputMode="url"
                  style={{ ...campoBase, flex: 1, minWidth: 200, width: 'auto' }} />
                <button type="button" onClick={agregarVideo} disabled={!videoNuevo.trim()}
                  style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--azul)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Agregar
                </button>
              </div>
              {(prop.videos ?? []).length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '.8rem 0 0', display: 'grid', gap: 8 }}>
                  {(prop.videos ?? []).map((v, i) => {
                    const vid = idYoutube(v)
                    return (
                      <li key={v} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e8ecf1', borderRadius: 8, padding: 6 }}>
                        {vid && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`https://i.ytimg.com/vi/${vid}/mqdefault.jpg`} alt="" width={96} height={54}
                            style={{ borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
                        )}
                        <a href={v} target="_blank" rel="noopener noreferrer"
                          style={{ flex: 1, minWidth: 0, fontSize: '.8rem', color: 'var(--azul)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v}
                        </a>
                        <button type="button" aria-label={`Quitar video ${i + 1}`}
                          onClick={() => guardar({ videos: (prop.videos ?? []).filter(x => x !== v) })}
                          style={{ ...botonMini, borderColor: '#fca5a5', color: 'var(--error-fuerte)' }}>
                          Quitar
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}

          {paso === 5 && (
            <>
              <Campo etiqueta="Descripción" ayuda="Lo que no se ve en las fotos: accesos, estado, para qué sirve, qué hay cerca. Escríbela con tus propias palabras: los párrafos, las viñetas y los subtítulos se respetan.">
                <textarea value={prop.descripcion ?? ''} onChange={e => guardar({ descripcion: e.target.value })}
                  rows={12} placeholder="Bodega sobre Blvd. San Juan Bosco, con acceso rápido a vialidades principales…"
                  aria-describedby="contador-descripcion"
                  style={{
                    ...campoBase, resize: 'vertical', lineHeight: 1.6,
                    borderColor: largoDescripcion > 0 && largoDescripcion < MINIMO_DESCRIPCION
                      ? 'var(--error-fuerte)' : undefined,
                  }} />
                {/* Avisa mientras escribe, sin bloquearle el teclado. Una
                    descripción de dos líneas no vende nada, y quien la escribe
                    así no sabe que se está perjudicando. */}
                <div id="contador-descripcion" aria-live="polite" style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  marginTop: 5, fontSize: '.78rem',
                  color: largoDescripcion >= MINIMO_DESCRIPCION ? 'var(--exito-fuerte)' : '#5A6472',
                }}>
                  <span>
                    {largoDescripcion === 0
                      ? `Escribe un mínimo de ${MINIMO_DESCRIPCION} caracteres.`
                      : largoDescripcion < MINIMO_DESCRIPCION
                        ? `Te faltan ${MINIMO_DESCRIPCION - largoDescripcion} caracteres.`
                        : 'Buena longitud.'}
                  </span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {largoDescripcion}
                  </strong>
                </div>

                {/* Formas de escribirla: texto libre con unas marcas sencillas, y se ve cómo quedará. Sin HTML: nada de lo escrito se interpreta como código. */}
                <details className="dr-guia" style={{ marginTop: 10 }}>
                  <summary>Cómo darle formato (párrafos, viñetas, subtítulos)</summary>
                  <ul>
                    <li><b>Párrafos:</b> deja una línea en blanco entre uno y otro.</li>
                    <li><b>Salto de línea:</b> con Enter se conserva dentro del párrafo.</li>
                    <li><b>Viñetas:</b> empieza la línea con <code>- </code> o <code>• </code>. <b>Lista numerada:</b> <code>1. </code>, <code>2. </code>…</li>
                    <li><b>Subtítulo:</b> <code>## Lo que incluye</code>, o una línea corta que termine en dos puntos (<code>Incluye:</code>).</li>
                    <li><b>Negritas:</b> <code>**así**</code>.</li>
                  </ul>
                  <button type="button" className="dr-ejemplo" onClick={() => { if (!(prop.descripcion ?? '').trim()) guardar({ descripcion: EJEMPLO_DESCRIPCION }) }}
                    disabled={(prop.descripcion ?? '').trim().length > 0}>
                    Usar un ejemplo (solo si la descripción está vacía)
                  </button>
                </details>
                {(prop.descripcion ?? '').trim() !== '' && (
                  <div className="dr-vista" aria-label="Vista previa del texto en la página pública">
                    <p className="dr-vista-t">Así se verá en la página</p>
                    <DescripcionRica texto={prop.descripcion ?? ''} />
                  </div>
                )}
              </Campo>
            </>
          )}

          {paso === 6 && (
            <>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--azul)', marginBottom: '1rem' }}>
                Antes de enviar
              </h2>

              {/* La tarjeta real, no un resumen de campos. Es donde uno ve que
                  la portada esta oscura o que el titulo se corta. */}
              <div data-vista-previa style={{ marginBottom: '1.5rem' }}>
                <VistaPreviaAnuncio {...prop} />
              </div>

              {lista ? (
                <p data-texto-previo={modo} style={{ background: 'var(--exito-fondo)', color: 'var(--exito-fuerte)', padding: '12px 15px', borderRadius: 8, fontSize: '.9rem', lineHeight: 1.6 }}>
                  {textoPrevioAlEnvio(modo, esAdmin, conObservaciones && !esAdmin && publicaSinRevision)}
                </p>
              ) : (
                <div style={{ background: 'var(--aviso-fondo)', padding: '12px 15px', borderRadius: 8 }}>
                  <p style={{ color: 'var(--aviso-fuerte)', fontSize: '.9rem', fontWeight: 600, marginBottom: 8 }}>
                    Falta esto para poder enviarlo:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: '.88rem', color: 'var(--aviso-fuerte)', lineHeight: 1.8 }}>
                    {falta.map(f => <li key={f}>{f}</li>)}
                  </ul>
                </div>
              )}

              {/* Propuesta de comisión: solo aparece si el módulo está encendido y esta cuenta tiene que aceptarla. */}
              {/* Términos y Condiciones y Aviso de Privacidad: solo aparece con el módulo `legalAcceptance` encendido. */}
              <AceptacionLegal />

              {/* Cómo maneja la propiedad (trato directo o agente/inmobiliaria): primero esto, luego la aceptación. */}
              <OrigenDeclarado propiedadId={id} editable={editable} />
              <AceptacionComision />

              <button type="button" onClick={() => { void enviarARevision() }} disabled={!lista || !editable} aria-disabled={enviando || guardandoBorrador}
                style={{
                  marginTop: '1.5rem', width: '100%', padding: '14px',
                  background: lista && editable ? 'var(--rojo)' : '#cbd5e1',
                  color: '#fff', border: 'none', borderRadius: 9,
                  fontSize: '1rem', fontWeight: 700, fontFamily: 'inherit',
                  cursor: lista && editable ? 'pointer' : 'not-allowed',
                }}>
                {etiquetaDelBoton(modo, enviando)}
              </button>

              {prop.estado_pub !== 'publicada' && (
                <button type="button" onClick={() => { void guardarBorrador() }} disabled={!editable} aria-disabled={enviando || guardandoBorrador}
                  style={{
                    marginTop: 10, width: '100%', padding: '12px', background: '#fff', color: 'var(--azul)',
                    border: '1px solid var(--borde-frio)', borderRadius: 9, fontSize: '.95rem', fontWeight: 700, fontFamily: 'inherit',
                    cursor: editable ? 'pointer' : 'not-allowed',
                  }}>
                  {guardandoBorrador ? 'Guardando…' : 'Guardar borrador'}
                </button>
              )}
            </>
          )}
        </section>
      </fieldset>

      {/* Confirmación de lo que pasó al guardar / publicar / enviar. Región de estado (WCAG 4.1.3): se anuncia sin mover el foco ni
          usar `alert`. Está SIEMPRE montada (vacía hasta que haya algo): una región que aparece junto con su contenido no se anuncia. */}
      <div role="status" aria-live="polite" aria-atomic="true" data-confirmacion={resultado?.tipo ?? 'ninguna'} style={{ marginTop: resultado ? '1rem' : 0 }}>
        {resultado && (
          <div style={{
            // `paddingRight`: el botón flotante de WhatsApp (fijo, abajo a la derecha) tapaba el final del texto en pantallas angostas.
            padding: '14px 84px 14px 16px', borderRadius: 10, lineHeight: 1.55, fontSize: '.92rem',
            ...(resultado.tipo === 'publicada' || resultado.tipo === 'cambios_guardados' || resultado.tipo === 'borrador' || resultado.tipo === 'en_revision'
              ? { background: 'var(--exito-fondo)', color: 'var(--exito-fuerte)', border: '1px solid var(--exito-fuerte)' }
              : { background: 'var(--aviso-fondo)', color: 'var(--aviso-fuerte)', border: '1px solid var(--aviso)' }),
          }}>
            <strong style={{ display: 'block', fontSize: '1rem' }}>{resultado.titulo}</strong>
            <span>{resultado.detalle}</span>
            {(resultado.tipo === 'publicada' || resultado.tipo === 'cambios_guardados') && resultado.ruta && (
              <>
                {' '}
                <Link href={resultado.ruta} style={{ color: 'inherit', fontWeight: 800, textDecoration: 'underline' }}>
                  Ver publicación
                </Link>
              </>
            )}
            {resultado.tipo === 'transicion_fallida' && reintentoPerfil && (
              <>
                {' '}
                <Link href="/mi-cuenta?motivo=publicar" style={{ color: 'inherit', fontWeight: 800 }}>Completar mi perfil →</Link>
              </>
            )}
          </div>
        )}
      </div>
      {resultado?.tipo === 'transicion_fallida' && (
        <button type="button" aria-disabled={enviando} onClick={() => { void enviarARevision(resultado.destino === 'publicada' ? 'publicada' : 'en_revision') }}
          style={{ ...botonMini, marginTop: 10, padding: '10px 16px', fontSize: '.9rem' }}>
          {enviando ? 'Reintentando…' : (resultado.destino === 'publicada' ? 'Reintentar publicación' : 'Reintentar envío')}
        </button>
      )}

      {/* ── Navegación entre pasos ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.2rem', gap: 12 }}>
        <button type="button" onClick={() => setPaso(p => Math.max(0, p - 1))} disabled={paso === 0}
          style={{
            padding: '10px 20px', borderRadius: 8, fontFamily: 'inherit', fontSize: '.9rem',
            border: '1px solid var(--borde-frio)', background: '#fff',
            cursor: paso === 0 ? 'not-allowed' : 'pointer', opacity: paso === 0 ? .45 : 1,
          }}>
          Anterior
        </button>

        <span aria-live="polite" style={{ fontSize: '.8rem', color: guardado === 'error' ? 'var(--error-fuerte)' : '#5A6472' }}>
          {guardado === 'guardando' && 'Guardando…'}
          {guardado === 'guardado' && 'Guardado'}
          {guardado === 'error' && 'No se pudo guardar'}
          {guardado === 'error' && (
            <button type="button" onClick={() => { void guardador.vaciar() }} style={{ ...botonMini, marginLeft: 8 }}>Reintentar guardado</button>
          )}
        </span>

        <button type="button" onClick={() => setPaso(p => Math.min(PASOS.length - 1, p + 1))}
          disabled={paso === PASOS.length - 1}
          style={{
            padding: '10px 20px', borderRadius: 8, fontFamily: 'inherit', fontSize: '.9rem', fontWeight: 600,
            border: 'none', background: 'var(--azul)', color: '#fff',
            cursor: paso === PASOS.length - 1 ? 'not-allowed' : 'pointer',
            opacity: paso === PASOS.length - 1 ? .45 : 1,
          }}>
          Siguiente
        </button>
      </div>
    </div>
  )
}
