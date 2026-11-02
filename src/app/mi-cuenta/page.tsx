'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { olvidarPerfilDeSesion } from '@/lib/acceso/perfil-de-sesion'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { mascaraTelefono, soloDigitosTelefono } from '@/lib/contacto'
import { subirImagen } from '@/lib/medios/subir'
import { alternar, OPCIONES_TIPO, ZONAS_SUGERIDAS } from '@/lib/cliente/busqueda'
import { repartoDeMiCuenta, salidaTrasEditar } from '@/lib/cuenta/destino'

/**
 * Asistente de cuenta y perfil.
 *
 * Hermano del asistente de propiedad, y por el mismo motivo: la propiedad tenía
 * dónde llenarse y la persona no. Un anuncio al 100% cuyo dueño no dio teléfono
 * sale al público sin nadie a quien escribir.
 *
 * Tres pasos como mucho por rol. La investigación de patrones es clara: cada
 * paso de más hunde la finalización, y el consenso de los benchmarks son cinco
 * o menos. Aquí son tres.
 */

type Perfil = {
  uid?: string
  email?: string | null
  nombre?: string | null
  telefono?: string | null
  whatsapp?: string | null
  foto_url?: string | null
  inmobiliaria?: string | null
  zonas?: string[] | null
  biografia?: string | null
  busca_operacion?: string | null
  // «Qué estoy buscando»: el modelo único (P3-07, V-1.1.82).
  busca_zonas?: string[] | null
  busca_tipos?: string[] | null
  presupuesto_max?: number | null
  rol?: string
  completitud?: number
  faltantes?: string[]
}

// Zonas y tipos salen del modelo único (lib/cliente/busqueda.ts). Antes el tipo
// se guardaba como etiqueta («Casa») y nunca coincidía con las propiedades («casa»).

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

/* ── Piezas de interfaz ────────────────────────────────────────── */

const CAJA: React.CSSProperties = {
  width: '100%', padding: '11px 13px', border: '1px solid var(--borde-frio)',
  borderRadius: 8, fontSize: '1rem', fontFamily: 'inherit', background: '#fff',
}

function Campo({ etiqueta, ayuda, requerido, children }: {
  etiqueta: string; ayuda?: string; requerido?: boolean; children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block', marginBottom: '1.1rem' }}>
      <span style={{ display: 'block', fontWeight: 600, fontSize: '.9rem', marginBottom: 5 }}>
        {etiqueta}
        {requerido && <span style={{ color: 'var(--rojo)', marginLeft: 4 }} aria-hidden>*</span>}
      </span>
      {ayuda && (
        <span style={{ display: 'block', fontSize: '.8rem', color: '#6b7280', marginBottom: 6 }}>
          {ayuda}
        </span>
      )}
      {children}
    </label>
  )
}

function Pastilla({ activa, onClick, children }: {
  activa: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
      style={{
        padding: '8px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '.85rem',
        fontWeight: activa ? 700 : 500,
        border: `1px solid ${activa ? 'var(--azul)' : 'var(--borde-frio)'}`,
        background: activa ? 'var(--azul)' : '#fff',
        color: activa ? '#fff' : '#374151',
      }}>
      {children}
    </button>
  )
}

/* ── Página ────────────────────────────────────────────────────── */

function MiCuentaInterior() {
  const router = useRouter()
  const params = useSearchParams()
  // Se llega aquí desde el candado de publicar: conviene decir por qué.
  const motivo = params.get('motivo')

  const [user, setUser] = useState<User | null>(null)
  const [cargando, setCargando] = useState(true)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [paso, setPaso] = useState(0)
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState<'limpio' | 'guardando' | 'guardado' | 'error'>('limpio')
  const [subiendo, setSubiendo] = useState(false)

  const pendiente = useRef<Record<string, unknown>>({})
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/usuarios/me', { headers: await cabeceras() })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'No se pudo cargar tu perfil.')
        return
      }
      const p: Perfil = await res.json()
      setPerfil(p)
      setError('')
    } catch {
      setError('Error de red al cargar tu perfil.')
    }
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u)
      setCargando(false)
      if (u) cargar()
    })
  }, [cargar])

  // ── El reparto por rol (03.08) ────────────────────────────────────────
  // Este asistente es el del PUBLICADOR. El cliente tiene el suyo en el
  // portal y el personal de VIVE BIEN el suyo en el panel; a ellos se les
  // manda allí en cuanto el servidor dice quiénes son. Antes no se repartía
  // nada: todo el que no fuera publicador veía el asistente del cliente, así
  // que un administrador acababa respondiendo «¿Compras o rentas?».
  const reparto = repartoDeMiCuenta(perfil?.rol)
  const seVa = reparto.tipo === 'ir'
  const irA = reparto.tipo === 'ir' ? reparto.a : null
  useEffect(() => {
    if (irA !== null) router.replace(irA)
  }, [irA, router])

  /** Guarda con retardo. Igual que el asistente de propiedad: nadie pulsa «guardar». */
  const guardar = useCallback((cambios: Record<string, unknown>) => {
    setPerfil(p => (p ? { ...p, ...cambios } : p))
    pendiente.current = { ...pendiente.current, ...cambios }
    setGuardado('guardando')
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(async () => {
      const envio = pendiente.current
      pendiente.current = {}
      if (Object.keys(envio).length === 0) return
      try {
        olvidarPerfilDeSesion()
        const res = await fetch('/api/usuarios/me', {
          method: 'PATCH', headers: await cabeceras(), body: JSON.stringify(envio),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(j.error || 'No se pudo guardar.')
          setGuardado('error')
          return
        }
        setError('')
        setGuardado('guardado')
        // La completitud la manda el servidor: aquí no se calcula, o dirían
        // cosas distintas cada uno.
        if (typeof j.completitud === 'number') {
          setPerfil(p => (p ? { ...p, completitud: j.completitud, faltantes: j.faltantes ?? [] } : p))
        }
        setTimeout(() => setGuardado(g => (g === 'guardado' ? 'limpio' : g)), 2500)
      } catch {
        setError('Se perdió la conexión. Lo escrito sigue aquí; se guardará al reintentar.')
        setGuardado('error')
      }
    }, 1000)
  }, [])

  async function subirFoto(archivo: File) {
    setSubiendo(true)
    // V-1.1.78 (SEC-05): subida firmada por el servidor.
    const r = await subirImagen(archivo, { proposito: 'perfil' })
    if (r.ok) guardar({ foto_url: r.url })
    else setError(r.motivo)
    setSubiendo(false)
  }

  /** Vacía lo pendiente antes de navegar, o se pierde lo último escrito. */
  async function terminar() {
    if (temporizador.current) clearTimeout(temporizador.current)
    const envio = pendiente.current
    pendiente.current = {}
    if (Object.keys(envio).length > 0) {
      olvidarPerfilDeSesion()
      await fetch('/api/usuarios/me', {
        method: 'PATCH', headers: await cabeceras(), body: JSON.stringify(envio),
      }).catch(() => {})
    }
    router.push(salidaTrasEditar(perfil?.rol))
  }

  if (cargando || seVa) {
    // Mientras se resuelve o se va, nada del asistente aparece: un
    // administrador no debe llegar a ver «¿Compras o rentas?» ni un instante.
    return <div style={{ padding: '6rem 2rem', textAlign: 'center' }}>Cargando…</div>
  }

  if (reparto.tipo === 'desconocido') {
    // El servidor dice un rol que no entendemos. No se le trata como cliente
    // (así fue como un administrador acabó respondiendo «¿Compras o rentas?»)
    // ni como personal (sugeriría un acceso que no tiene). Se le dice.
    return (
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '6rem 1.5rem', fontFamily: 'system-ui', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--azul)' }}>No reconocemos tu tipo de cuenta</h1>
        <p style={{ marginTop: '.9rem', color: '#555', lineHeight: 1.55 }}>
          Tu sesión está activa, pero tu cuenta tiene un tipo que esta pantalla no sabe atender,
          así que no te enseñamos nada que pudiera no ser tuyo. Escríbenos y lo revisamos.
        </p>
        <p style={{ marginTop: '1.5rem' }}>
          <Link href="/" style={{ color: 'var(--rojo)', fontWeight: 700 }}>Volver al inicio</Link>
        </p>
      </main>
    )
  }

  if (!user) return (
    <div style={{ padding: '6rem 2rem', textAlign: 'center', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>Tu cuenta</h1>
      <p style={{ color: '#555', marginBottom: '1.5rem' }}>Inicia sesión para configurar tu perfil.</p>
      <Link href="/dashboard" style={{ background: 'var(--rojo)', color: '#fff', padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>
        Ir a iniciar sesión
      </Link>
    </div>
  )

  const p = perfil ?? {}
  const rol = p.rol ?? 'cliente'
  const esPublicador = rol === 'publicador'
  const completitud = p.completitud ?? 0
  const falta = p.faltantes ?? []
  const zonas = p.zonas ?? []

  const PASOS = esPublicador
    ? ['Cómo te contactan', 'Quién eres', 'Dónde operas']
    : ['Cómo te contactamos', 'Qué buscas']

  const ultimo = paso >= PASOS.length - 1

  function alternarZona(z: string) {
    const ya = zonas.includes(z)
    guardar({ zonas: ya ? zonas.filter(x => x !== z) : [...zonas, z].slice(0, 12) })
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.25rem 5rem', fontFamily: 'system-ui' }}>

      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--azul)', marginBottom: '.3rem' }}>
        Tu perfil
      </h1>
      <p style={{ color: '#666', fontSize: '.92rem', marginBottom: '1.25rem' }}>
        {esPublicador
          ? 'Esto es lo que verá quien se interese por una de tus propiedades.'
          : 'Con esto podemos avisarte cuando entre algo que encaje con lo que buscas.'}
      </p>

      {motivo === 'publicar' && (
        <p style={{
          background: 'var(--aviso-fondo-calido)', borderLeft: '3px solid #c2410c',
          padding: '10px 14px', fontSize: '.88rem', color: '#7c2d12',
          borderRadius: '0 6px 6px 0', marginBottom: '1.25rem', lineHeight: 1.55,
        }}>
          Para enviar una propiedad a revisión faltan tus datos de contacto. Sin
          ellos, quien vea el anuncio no tiene a quién escribir.
        </p>
      )}

      {/* ── Progreso ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: '#555', marginBottom: 5 }}>
          <span>Paso {paso + 1} de {PASOS.length} · {PASOS[paso]}</span>
          <span style={{ fontWeight: 700 }}>{completitud}%</span>
        </div>
        <div style={{ height: 7, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${completitud}%`,
            background: completitud >= 70 ? 'var(--exito-fuerte)' : 'var(--aviso)',
            transition: 'width .3s',
          }} />
        </div>
        {falta.length > 0 && (
          <p style={{ fontSize: '.78rem', color: '#6b7280', marginTop: 6 }}>
            Falta: {falta.join(' · ')}
          </p>
        )}
      </div>

      {error && (
        <p style={{ background: 'var(--error-fondo-fuerte)', color: 'var(--error-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.9rem', marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem 1.4rem' }}>

        {/* ── Paso 1 · contacto (los dos roles) ── */}
        {paso === 0 && (
          <>
            <Campo etiqueta="Tu nombre" requerido>
              <input style={CAJA} value={p.nombre ?? ''} autoComplete="name"
                onChange={e => guardar({ nombre: e.target.value })}
                placeholder="Como quieres que te llamen" />
            </Campo>

            <Campo etiqueta="Teléfono" requerido={esPublicador}
              ayuda="10 dígitos. El formato se pone solo. No se muestra público salvo que tú lo publiques.">
              {/* Se VE con formato y se GUARDA en dígitos: el enlace de WhatsApp
                  (wa.me/52…) necesita dígitos a secas, y un número guardado con
                  paréntesis y guiones lo rompería. */}
              <input style={CAJA} value={mascaraTelefono(p.telefono ?? '')} inputMode="tel" autoComplete="tel"
                onChange={e => guardar({ telefono: soloDigitosTelefono(e.target.value) })}
                placeholder="(477) 123-4567" />
            </Campo>

            {esPublicador && (
              <Campo etiqueta="WhatsApp" requerido
                ayuda="Es por donde llega casi todo el contacto. Puede ser el mismo número.">
                <input style={CAJA} value={mascaraTelefono(p.whatsapp ?? '')} inputMode="tel"
                  onChange={e => guardar({ whatsapp: soloDigitosTelefono(e.target.value) })}
                  placeholder="(477) 123-4567" />
                {/* Se comparan dígitos: un número guardado antes como «+52 477…»
                    y el mismo como «477…» no son dos números distintos. */}
                {p.telefono && soloDigitosTelefono(p.telefono) !== soloDigitosTelefono(p.whatsapp ?? '') && (
                  <button type="button" onClick={() => guardar({ whatsapp: soloDigitosTelefono(p.telefono ?? '') })}
                    style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--azul)', fontSize: '.82rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                    Usar el mismo que el teléfono
                  </button>
                )}
              </Campo>
            )}
          </>
        )}

        {/* ── Paso 2 · publicador: quién eres ── */}
        {paso === 1 && esPublicador && (
          <>
            <Campo etiqueta="Foto o logo"
              ayuda="Un anuncio con cara detrás recibe más mensajes que uno anónimo.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', overflow: 'hidden',
                  background: 'var(--gris, #EDEAE5)', flexShrink: 0,
                  display: 'grid', placeItems: 'center', color: '#9ca3af', fontSize: '1.6rem',
                }}>
                  {p.foto_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : '👤'}
                </div>
                <input type="file" accept="image/*" disabled={subiendo}
                  onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(f) }}
                  style={{ fontSize: '.85rem' }} />
                {subiendo && <span style={{ fontSize: '.82rem', color: '#6b7280' }}>Subiendo…</span>}
              </div>
            </Campo>

            <Campo etiqueta="Inmobiliaria" ayuda="Déjalo vacío si operas por tu cuenta.">
              <input style={CAJA} value={p.inmobiliaria ?? ''}
                onChange={e => guardar({ inmobiliaria: e.target.value })}
                placeholder="Nombre de la inmobiliaria" />
            </Campo>

            <Campo etiqueta="Breve presentación"
              ayuda="Dos o tres líneas. Cuánto llevas, en qué te especializas.">
              <textarea style={{ ...CAJA, minHeight: 90, resize: 'vertical' }}
                value={p.biografia ?? ''} maxLength={600}
                onChange={e => guardar({ biografia: e.target.value })}
                placeholder="Llevo ocho años vendiendo casa en el poniente de León…" />
            </Campo>
          </>
        )}

        {/* ── Paso 3 · publicador: zonas ── */}
        {paso === 2 && esPublicador && (
          <>
            <Campo etiqueta="Zonas donde operas"
              ayuda="Sirve para ordenar mejor tus propiedades en las búsquedas de esas zonas.">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {ZONAS_SUGERIDAS.map(z => (
                  <Pastilla key={z} activa={zonas.includes(z)} onClick={() => alternarZona(z)}>
                    {z}
                  </Pastilla>
                ))}
              </div>
            </Campo>
            {zonas.length === 0 && (
              <p style={{ fontSize: '.82rem', color: '#6b7280' }}>
                Puedes dejarlo para después: no impide publicar.
              </p>
            )}
          </>
        )}

        {/* ── Paso 2 · cliente: qué buscas ── */}
        {paso === 1 && !esPublicador && (
          <>
            <Campo etiqueta="¿Compras o rentas?">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {[['venta', 'Comprar'], ['renta', 'Rentar'], ['ambas', 'Las dos']].map(([v, t]) => (
                  <Pastilla key={v} activa={p.busca_operacion === v}
                    onClick={() => guardar({ busca_operacion: p.busca_operacion === v ? null : v })}>
                    {t}
                  </Pastilla>
                ))}
              </div>
            </Campo>

            <Campo etiqueta="Tipos de inmueble" ayuda="Puedes elegir varios.">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {OPCIONES_TIPO.map(t => (
                  <Pastilla key={t.clave} activa={(p.busca_tipos ?? []).includes(t.clave)}
                    onClick={() => guardar({ busca_tipos: alternar(p.busca_tipos, t.clave) })}>
                    {t.etiqueta}
                  </Pastilla>
                ))}
              </div>
            </Campo>

            <Campo etiqueta="Zonas que te interesan" ayuda="Puedes elegir varias.">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {ZONAS_SUGERIDAS.map(z => (
                  <Pastilla key={z} activa={(p.busca_zonas ?? []).includes(z)}
                    onClick={() => guardar({ busca_zonas: alternar(p.busca_zonas, z) })}>
                    {z}
                  </Pastilla>
                ))}
              </div>
            </Campo>

            <Campo etiqueta="Presupuesto máximo" ayuda="Aproximado. Sirve para no enseñarte lo que se sale.">
              <input style={CAJA} inputMode="numeric" value={p.presupuesto_max ?? ''}
                onChange={e => guardar({ presupuesto_max: e.target.value.replace(/\D/g, '') })}
                placeholder="2500000" />
            </Campo>
          </>
        )}
      </section>

      {/* ── Navegación ── */}
      <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setPaso(n => Math.max(0, n - 1))} disabled={paso === 0}
          style={{
            padding: '11px 20px', borderRadius: 8, fontWeight: 600, fontSize: '.9rem',
            border: '1px solid var(--borde-frio)', background: '#fff',
            color: paso === 0 ? '#cbd5e1' : '#475569',
            cursor: paso === 0 ? 'not-allowed' : 'pointer',
          }}>
          Atrás
        </button>

        {!ultimo && (
          <button type="button" onClick={() => setPaso(n => n + 1)}
            style={{ padding: '11px 22px', borderRadius: 8, fontWeight: 700, fontSize: '.9rem', border: 'none', background: 'var(--azul)', color: '#fff', cursor: 'pointer' }}>
            Siguiente
          </button>
        )}

        {ultimo && (
          <button type="button" onClick={terminar}
            style={{ padding: '11px 22px', borderRadius: 8, fontWeight: 700, fontSize: '.9rem', border: 'none', background: 'var(--rojo)', color: '#fff', cursor: 'pointer' }}>
            Listo
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: '.8rem', color: guardado === 'error' ? 'var(--error-fuerte)' : '#6b7280' }}>
          {guardado === 'guardando' && 'Guardando…'}
          {guardado === 'guardado' && 'Guardado'}
          {guardado === 'error' && 'Sin guardar'}
        </span>
      </div>

      <p style={{ marginTop: '1.75rem', fontSize: '.82rem', color: '#6b7280', lineHeight: 1.6 }}>
        Se guarda solo conforme escribes. Puedes salir e irte cuando quieras.{' '}
        <Link href="/privacidad" style={{ color: 'var(--azul)' }}>Cómo tratamos tus datos</Link>.
      </p>
    </main>
  )
}

export default function MiCuenta() {
  return (
    <Suspense fallback={<div style={{ padding: '6rem 2rem', textAlign: 'center' }}>Cargando…</div>}>
      <MiCuentaInterior />
    </Suspense>
  )
}
