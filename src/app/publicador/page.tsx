'use client'
import { useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import Link from 'next/link'

type Prop = {
  id: string
  titulo?: string
  ubicacion?: string
  fotos?: string[]
  estado_pub?: string
  completitud?: number
  nota_moderacion?: string | null
}

const ETIQUETA: Record<string, { texto: string; bg: string; color: string }> = {
  borrador: { texto: 'Borrador', bg: '#f1f5f9', color: '#475569' },
  en_revision: { texto: 'En revisión', bg: 'var(--aviso-fondo)', color: '#b45309' },
  cambios_solicitados: { texto: 'Cambios solicitados', bg: '#ffedd5', color: '#c2410c' },
  rechazada: { texto: 'Rechazada', bg: 'var(--error-fondo-fuerte)', color: 'var(--error-fuerte)' },
  publicada: { texto: 'Publicada', bg: 'var(--exito-fondo)', color: 'var(--exito-fuerte)' },
}

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export default function PanelPublicador() {
  const [user, setUser] = useState<User | null>(null)
  const [cargando, setCargando] = useState(true)
  const [props, setProps] = useState<Prop[]>([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [nuevoTitulo, setNuevoTitulo] = useState('')

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/publicador/propiedades', { headers: await cabeceras() })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'No se pudieron cargar tus propiedades.')
        setProps([])
        return
      }
      setError('')
      setProps(await res.json())
    } catch {
      setError('Error de red.')
    }
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u)
      setCargando(false)
      if (u) cargar()
    })
  }, [cargar])

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!nuevoTitulo.trim()) return
    const res = await fetch('/api/publicador/propiedades', {
      method: 'POST',
      headers: await cabeceras(),
      body: JSON.stringify({ titulo: nuevoTitulo.trim() }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setError(j.error || 'No se pudo crear.'); return }
    setNuevoTitulo('')
    setAviso('Borrador creado. Complétalo para poder enviarlo a revisión.')
    setTimeout(() => setAviso(''), 6000)
    cargar()
  }

  async function cambiarEstado(id: string, estado: string) {
    const res = await fetch(`/api/propiedades/${id}/estado`, {
      method: 'POST',
      headers: await cabeceras(),
      body: JSON.stringify({ estado }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setError(j.error || 'No se pudo cambiar el estado.'); return }
    setError('')
    setAviso(estado === 'en_revision' ? 'Enviada a revisión.' : 'Estado actualizado.')
    setTimeout(() => setAviso(''), 5000)
    cargar()
  }

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
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.25rem 5rem', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--azul)', marginBottom: '.3rem' }}>Mis propiedades</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '.92rem' }}>
        Una propiedad nueva empieza como borrador. Cuando esté completa la envías a revisión, y un administrador la aprueba.
      </p>

      <form onSubmit={crear} style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input value={nuevoTitulo} onChange={e => setNuevoTitulo(e.target.value)}
          placeholder="Título de la nueva propiedad"
          style={{ flex: '1 1 260px', padding: 12, border: '1px solid #ccc', borderRadius: 8, fontSize: '1rem' }} />
        <button type="submit" style={{ padding: '12px 20px', background: 'var(--rojo)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
          Crear borrador
        </button>
      </form>

      {error && <p style={{ background: 'var(--error-fondo-fuerte)', color: 'var(--error-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.9rem' }}>{error}</p>}
      {aviso && <p style={{ background: 'var(--exito-fondo)', color: 'var(--exito-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.9rem' }}>{aviso}</p>}

      {props.length === 0 && !error && (
        <p style={{ color: '#888', padding: '3rem 0', textAlign: 'center' }}>Todavía no tienes propiedades.</p>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {props.map(p => {
          const est = p.estado_pub || 'publicada'
          const tag = ETIQUETA[est] ?? ETIQUETA.borrador
          const completa = (p.completitud ?? 0) >= 80
          const pendiente = completa ? '' : ' — necesita 80% para enviarse'
          return (
            <article key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '1rem 1.15rem', background: '#fff' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.02rem', fontWeight: 700, flex: 1, minWidth: 200 }}>{p.titulo || 'Sin título'}</h2>
                <span style={{ background: tag.bg, color: tag.color, padding: '3px 10px', borderRadius: 6, fontSize: '.72rem', fontWeight: 700 }}>
                  {tag.texto}
                </span>
              </div>
              {p.ubicacion && <p style={{ color: '#666', fontSize: '.85rem', marginTop: 2 }}>{p.ubicacion}</p>}

              <div style={{ marginTop: 10, marginBottom: 10 }}>
                <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${p.completitud ?? 0}%`, background: completa ? 'var(--exito-fuerte)' : 'var(--aviso)' }} />
                </div>
                <span style={{ fontSize: '.75rem', color: '#666' }}>
                  {p.completitud ?? 0}% completo{pendiente}
                </span>
              </div>

              {p.nota_moderacion && (
                <p style={{ background: 'var(--aviso-fondo-calido)', borderLeft: '3px solid #c2410c', padding: '8px 12px', fontSize: '.85rem', color: '#7c2d12', borderRadius: '0 6px 6px 0', marginBottom: 10 }}>
                  <strong>Nota del revisor:</strong> {p.nota_moderacion}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(est === 'borrador' || est === 'cambios_solicitados') && (
                  <button onClick={() => cambiarEstado(p.id, 'en_revision')} disabled={!completa}
                    title={completa ? 'Enviar a revisión' : 'Complétala al 80% primero'}
                    style={{ padding: '8px 16px', background: completa ? 'var(--azul)' : 'var(--borde-frio)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '.85rem', cursor: completa ? 'pointer' : 'not-allowed' }}>
                    Enviar a revisión
                  </button>
                )}
                {est === 'en_revision' && (
                  <button onClick={() => cambiarEstado(p.id, 'borrador')}
                    style={{ padding: '8px 16px', background: '#fff', color: '#475569', border: '1px solid var(--borde-frio)', borderRadius: 6, fontWeight: 600, fontSize: '.85rem', cursor: 'pointer' }}>
                    Retirar el envío
                  </button>
                )}
                {est === 'rechazada' && (
                  <button onClick={() => cambiarEstado(p.id, 'borrador')}
                    style={{ padding: '8px 16px', background: 'var(--azul)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>
                    Volver a borrador
                  </button>
                )}
                {est === 'publicada' && (
                  <Link href={`/propiedades/${p.id}`} style={{ padding: '8px 16px', background: '#fff', color: 'var(--azul)', border: '1px solid var(--borde-frio)', borderRadius: 6, fontWeight: 600, fontSize: '.85rem', textDecoration: 'none' }}>
                    Ver publicada
                  </Link>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </main>
  )
}
