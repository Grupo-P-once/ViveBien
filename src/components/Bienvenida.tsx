'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { auth } from '@/lib/firebase'

/**
 * Primeros pasos, por rol.
 *
 * Se pidió «un tour paso por paso para quien entra por primera vez». Lo que se
 * entrega es lo que hace que la gente termine el paso, que no es lo mismo —
 * ver la investigación en Obsidian:
 *
 *  · Los coach marks encadenados (globito, globito, globito sobre la pantalla
 *    oscurecida) se saltan casi siempre: obligan a memorizar para aplicar
 *    después, y eso es carga, no ayuda.
 *  · La ayuda que dispara el propio usuario se completa un 123% más que el
 *    tour que salta solo.
 *  · Una barra de progreso visible sube la finalización entre 15% y 25%.
 *  · Cada paso de más la hunde. El consenso son cinco o menos; aquí son cuatro.
 *
 * De ahí la forma: lista de tareas como columna vertebral, tour corto detrás de
 * un enlace que el usuario abre si quiere, y nada que bloquee la pantalla.
 *
 * La regla que sostiene todo: **una tarea se tacha porque el dato existe de
 * verdad**, no porque alguien pulsó «hecho». Una lista que se puede marcar a
 * mano miente en cuanto alguien borra su teléfono.
 */

type Rol = 'cliente' | 'publicador' | 'admin'

type Tarea = {
  titulo: string
  detalle: string
  hecha: boolean
  href: string
  cta: string
}

type Props = {
  rol: Rol
  /** Propiedades del usuario, para saber por dónde va. Vacío para un cliente. */
  propiedades?: { estado_pub?: string; completitud?: number; fotos?: string[] }[]
  /**
   * Favoritos guardados. Si la pantalla no los conoce, el componente los
   * pregunta él mismo: es preferible una petición de más a una tarea que se
   * queda sin tachar aunque el usuario ya la hizo.
   */
  favoritos?: number
}

type PerfilMinimo = { completitud?: number; faltantes?: string[]; bienvenidaVista?: boolean }

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

/* ── Cómo funciona: el tour, en texto y a petición ─────────────── */

const COMO_FUNCIONA: Record<Rol, { paso: string; texto: string }[]> = {
  publicador: [
    { paso: 'Tu perfil', texto: 'Nombre, teléfono y WhatsApp. Es lo que verá quien se interese: sin eso, el anuncio no tiene a quién escribir.' },
    { paso: 'Creas un borrador', texto: 'Sólo el título. El borrador es tuyo y nadie más lo ve.' },
    { paso: 'Lo completas', texto: 'El asistente va por pasos y se guarda solo. Necesitas 80% y tres fotos como mínimo.' },
    { paso: 'Lo envías a revisión', texto: 'Un administrador lo aprueba, o te pide cambios con una nota. Mientras está en revisión no se puede editar.' },
    { paso: 'Se publica', texto: 'Aparece en el sitio y empiezas a recibir mensajes. Las visitas y los contactos los ves en tu panel.' },
  ],
  cliente: [
    { paso: 'Tu perfil', texto: 'Qué buscas, en qué zona y hasta cuánto. Con eso te avisamos cuando entre algo que encaje.' },
    { paso: 'Buscas', texto: 'Filtras por zona, tipo, operación y precio. Guardas con el corazón lo que te gusta.' },
    { paso: 'Contactas', texto: 'Desde la ficha, por WhatsApp o dejando tus datos. Le llega a quien publica la propiedad.' },
    { paso: 'Agendas visita', texto: 'El anunciante te responde y quedan. Nosotros no cobramos comisión por esto.' },
  ],
  admin: [
    { paso: 'Revisas lo pendiente', texto: 'Las propiedades que envían los publicadores esperan en «Por revisar».' },
    { paso: 'Apruebas o pides cambios', texto: 'Si pides cambios, la nota que escribas la ve el publicador. Sé concreto.' },
    { paso: 'Atiendes solicitudes', texto: 'Los leads y contactos llegan a las pestañas del panel.' },
    { paso: 'Miras las métricas', texto: 'Vistas, favoritos y solicitudes, para saber qué se mueve y qué no.' },
  ],
}

/* ── Tareas ────────────────────────────────────────────────────── */

function tareasDe(rol: Rol, perfil: PerfilMinimo, props: Props['propiedades'], favs: number): Tarea[] {
  const perfilOk = (perfil.completitud ?? 0) >= 70
  const lista = props ?? []

  if (rol === 'publicador') {
    const tieneBorrador = lista.length > 0
    const algunaCompleta = lista.some(p => (p.completitud ?? 0) >= 80)
    const algunaEnviada = lista.some(p => p.estado_pub && p.estado_pub !== 'borrador')
    return [
      {
        titulo: 'Completa tu perfil',
        detalle: 'Teléfono y WhatsApp. Sin esto no puedes enviar nada a revisión.',
        hecha: perfilOk, href: '/mi-cuenta', cta: 'Completar',
      },
      {
        titulo: 'Crea tu primera propiedad',
        detalle: 'Empieza con el título; el resto se llena después.',
        hecha: tieneBorrador, href: '/publicador', cta: 'Crear',
      },
      {
        titulo: 'Llénala al 80%',
        detalle: 'Ubicación, precio, superficie y tres fotos como mínimo.',
        hecha: algunaCompleta, href: '/publicador', cta: 'Continuar',
      },
      {
        titulo: 'Envíala a revisión',
        detalle: 'Un administrador la aprueba y sale al público.',
        hecha: algunaEnviada, href: '/publicador', cta: 'Enviar',
      },
    ]
  }

  if (rol === 'admin') {
    const porRevisar = lista.filter(p => p.estado_pub === 'en_revision').length
    return [
      {
        titulo: 'Revisa lo pendiente',
        detalle: porRevisar > 0
          ? `${porRevisar} ${porRevisar === 1 ? 'propiedad espera' : 'propiedades esperan'} tu aprobación.`
          : 'Ahora mismo no hay nada esperando.',
        hecha: porRevisar === 0, href: '/admin/propiedades/pendientes', cta: 'Revisar',
      },
      {
        titulo: 'Completa tu perfil',
        detalle: 'Tu nombre aparece en las notas de moderación que ve el publicador.',
        hecha: perfilOk, href: '/mi-cuenta', cta: 'Completar',
      },
    ]
  }

  return [
    {
      titulo: 'Dinos qué buscas',
      detalle: 'Zona, tipo y presupuesto. Con eso te avisamos de lo que encaje.',
      hecha: perfilOk, href: '/mi-cuenta', cta: 'Completar',
    },
    {
      titulo: 'Guarda tu primera propiedad',
      detalle: 'El corazón de cada ficha la guarda aquí para volver luego.',
      hecha: favs > 0, href: '/propiedades', cta: 'Ver propiedades',
    },
  ]
}

/* ── Componente ────────────────────────────────────────────────── */

export default function Bienvenida({ rol, propiedades, favoritos }: Props) {
  const [perfil, setPerfil] = useState<PerfilMinimo | null>(null)
  const [favs, setFavs] = useState(favoritos ?? 0)
  const [oculto, setOculto] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [tour, setTour] = useState(false)

  useEffect(() => {
    if (rol !== 'cliente' || favoritos !== undefined) return
    let vivo = true
    ;(async () => {
      try {
        const res = await fetch('/api/favoritos', { headers: await cabeceras() })
        if (!res.ok || !vivo) return
        const ids = await res.json()
        if (vivo && Array.isArray(ids)) setFavs(ids.length)
      } catch { /* sin favoritos, la tarea sigue sin tachar */ }
    })()
    return () => { vivo = false }
  }, [rol, favoritos])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const res = await fetch('/api/usuarios/me', { headers: await cabeceras() })
        if (!res.ok || !vivo) return
        const p: PerfilMinimo = await res.json()
        if (!vivo) return
        setPerfil(p)
        // Abierta de par en par la primera vez; plegada después. No se cierra
        // sola: quien no ha terminado necesita seguir viéndola.
        setAbierto(!p.bienvenidaVista)
      } catch { /* sin perfil, la lista no se pinta */ }
    })()
    return () => { vivo = false }
  }, [])

  const recordarQueSeVio = useCallback(async () => {
    try {
      await fetch('/api/usuarios/me', {
        method: 'PATCH', headers: await cabeceras(),
        body: JSON.stringify({ bienvenidaVista: true }),
      })
    } catch { /* que no se recuerde no rompe nada */ }
  }, [])

  if (!perfil || oculto) return null

  const tareas = tareasDe(rol, perfil, propiedades, favs)
  const hechas = tareas.filter(t => t.hecha).length
  const todo = hechas === tareas.length
  const pct = Math.round((hechas / tareas.length) * 100)
  const pasos = COMO_FUNCIONA[rol]

  // Terminado y ya visto: sólo queda el enlace de ayuda, que no estorba.
  if (todo && perfil.bienvenidaVista && !tour) {
    return (
      <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
        <button type="button" onClick={() => setTour(true)}
          style={{ background: 'none', border: 'none', color: 'var(--azul)', fontSize: '.85rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
          ¿Cómo funciona?
        </button>
      </div>
    )
  }

  return (
    <section aria-label="Primeros pasos" style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
      padding: '1.25rem 1.4rem', marginBottom: '1.75rem',
      boxShadow: '0 4px 15px rgba(0,0,0,.05)',
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--azul)', margin: 0, flex: 1, minWidth: 180 }}>
          {todo ? '¡Listo! Ya tienes todo en marcha' : 'Primeros pasos'}
        </h2>
        <span style={{ fontSize: '.82rem', color: '#6b7280', fontWeight: 700 }}>
          {hechas} de {tareas.length}
        </span>
        <button type="button"
          onClick={() => { if (abierto) recordarQueSeVio(); setAbierto(a => !a) }}
          aria-expanded={abierto}
          style={{ background: 'none', border: 'none', color: 'var(--azul)', fontSize: '.85rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
          {abierto ? 'Plegar' : 'Ver'}
        </button>
      </header>

      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', margin: '.85rem 0' }}>
        <div style={{
          height: '100%', width: `${pct}%`, transition: 'width .35s',
          background: todo ? 'var(--exito-fuerte)' : 'var(--azul)',
        }} />
      </div>

      {abierto && (
        <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 .5rem', display: 'grid', gap: 10 }}>
          {tareas.map(t => (
            <li key={t.titulo} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '10px 12px', borderRadius: 9,
              background: t.hecha ? 'var(--exito-fondo)' : 'var(--superficie, #F4F6F8)',
            }}>
              <span aria-hidden style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                display: 'grid', placeItems: 'center', fontSize: '.72rem', fontWeight: 800,
                background: t.hecha ? 'var(--exito-fuerte)' : '#fff',
                color: t.hecha ? '#fff' : '#94a3b8',
                border: t.hecha ? 'none' : '1px solid var(--borde-frio)',
              }}>
                {t.hecha ? '✓' : ''}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, fontWeight: 700, fontSize: '.9rem',
                  color: t.hecha ? 'var(--exito-fuerte)' : '#1f2937',
                  textDecoration: t.hecha ? 'line-through' : 'none',
                }}>
                  {t.titulo}
                </p>
                {!t.hecha && (
                  <p style={{ margin: '2px 0 0', fontSize: '.82rem', color: '#6b7280', lineHeight: 1.5 }}>
                    {t.detalle}
                  </p>
                )}
              </div>
              {!t.hecha && (
                <Link href={t.href} style={{
                  flexShrink: 0, alignSelf: 'center', padding: '6px 14px', borderRadius: 6,
                  background: 'var(--rojo)', color: '#fff', fontSize: '.8rem',
                  fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
                }}>
                  {t.cta}
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* El tour: detrás de un enlace, nunca automático, siempre saltable. */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: '.75rem' }}>
        <button type="button" onClick={() => setTour(t => !t)}
          aria-expanded={tour}
          style={{ background: 'none', border: 'none', color: 'var(--azul)', fontSize: '.85rem', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: 600 }}>
          {tour ? 'Cerrar' : '¿Cómo funciona?'}
        </button>
        {todo && (
          <button type="button" onClick={() => { setOculto(true); recordarQueSeVio() }}
            style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '.85rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
            Ocultar esto
          </button>
        )}
      </div>

      {tour && (
        <ol style={{ margin: '1rem 0 0', paddingLeft: '1.15rem', display: 'grid', gap: 10 }}>
          {pasos.map(s => (
            <li key={s.paso} style={{ fontSize: '.86rem', lineHeight: 1.55, color: '#374151' }}>
              <strong style={{ color: 'var(--azul)' }}>{s.paso}.</strong> {s.texto}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
