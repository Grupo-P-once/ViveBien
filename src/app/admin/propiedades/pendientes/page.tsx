'use client'
import { useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import Link from 'next/link'

type Prop = {
  id: string
  titulo?: string
  ubicacion?: string
  precio?: number
  tipo?: string
  operacion?: string
  fotos?: string[]
  descripcion?: string
  estado_pub?: string
  completitud?: number
  owner_id?: string | null
  enviada_en?: string | null
}

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export default function ColaModeracion() {
  const [user, setUser] = useState<User | null>(null)
  const [cargando, setCargando] = useState(true)
  const [props, setProps] = useState<Prop[]>([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [trabajando, setTrabajando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/publicador/propiedades', { headers: await cabeceras() })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'No se pudo cargar la cola.')
        setProps([])
        return
      }
      setError('')
      const todas: Prop[] = await res.json()
      setProps(todas.filter(p => p.estado_pub === 'en_revision'))
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

  async function moderar(id: string, estado: string) {
    const nota = notas[id]?.trim()
    if ((estado === 'rechazada' || estado === 'cambios_solicitados') && !nota) {
      setError('Explica el motivo antes de rechazar o pedir cambios: el publicador lo verá en su panel.')
      return
    }
    setTrabajando(id)
    const res = await fetch(`/api/propiedades/${id}/estado`, {
      method: 'POST',
      headers: await cabeceras(),
      body: JSON.stringify({ estado, nota }),
    })
    const j = await res.json().catch(() => ({}))
    setTrabajando(null)
    if (!res.ok) { setError(j.error || 'No se pudo aplicar la decisión.'); return }
    setError('')
    const dicho =
      estado === 'publicada' ? 'Propiedad publicada.'
        : estado === 'rechazada' ? 'Propiedad rechazada.'
          : 'Cambios solicitados al publicador.'
    setAviso(dicho)
    setTimeout(() => setAviso(''), 5000)
    cargar()
  }

  if (cargando) return <div style={{ padding: '6rem 2rem', textAlign: 'center' }}>Cargando…</div>

  if (!user) return (
    <div style={{ padding: '6rem 2rem', textAlign: 'center', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>Moderación</h1>
      <Link href="/dashboard" style={{ background: 'var(--rojo)', color: '#fff', padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>
        Iniciar sesión
      </Link>
    </div>
  )

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.25rem 5rem', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--azul)', marginBottom: '.3rem' }}>
        Propiedades por revisar
      </h1>
      <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '.92rem' }}>
        Nada llega al catálogo público sin pasar por aquí. Cada decisión queda registrada en la bitácora.
      </p>

      {error && <p style={{ background: 'var(--error-fondo-fuerte)', color: 'var(--error-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.9rem' }}>{error}</p>}
      {aviso && <p style={{ background: 'var(--exito-fondo)', color: 'var(--exito-fuerte)', padding: '10px 14px', borderRadius: 8, fontSize: '.9rem' }}>{aviso}</p>}

      {props.length === 0 && !error && (
        <p style={{ color: '#888', padding: '3rem 0', textAlign: 'center' }}>
          No hay nada esperando revisión.
        </p>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {props.map(p => (
          <article key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 14, padding: '1rem 1.15rem', flexWrap: 'wrap' }}>
              {p.fotos?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.fotos[0]} alt={p.titulo || 'Foto de la propiedad'}
                  style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 220 }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--azul)' }}>{p.titulo || 'Sin título'}</h2>
                <p style={{ color: '#666', fontSize: '.85rem', marginTop: 2 }}>{p.ubicacion || 'Sin ubicación'}</p>
                <p style={{ fontSize: '.85rem', marginTop: 6, color: '#333' }}>
                  {p.tipo || '—'} · {p.operacion || '—'} · {p.precio ? `$${Number(p.precio).toLocaleString('es-MX')}` : 'sin precio'} · {p.fotos?.length ?? 0} fotos
                </p>
                <p style={{ fontSize: '.78rem', color: '#888', marginTop: 4 }}>
                  Completitud {p.completitud ?? 0}%
                </p>
              </div>
              <Link href={`/propiedades/${p.id}`} target="_blank"
                style={{ alignSelf: 'flex-start', fontSize: '.8rem', color: 'var(--azul)', textDecoration: 'underline' }}>
                Vista previa
              </Link>
            </div>

            <div style={{ padding: '0 1.15rem 1.15rem' }}>
              <label htmlFor={`nota-${p.id}`} style={{ display: 'block', fontSize: '.78rem', color: '#555', marginBottom: 4 }}>
                Motivo (obligatorio si rechazas o pides cambios)
              </label>
              <textarea id={`nota-${p.id}`} rows={2}
                value={notas[p.id] ?? ''}
                onChange={e => setNotas(n => ({ ...n, [p.id]: e.target.value }))}
                placeholder="Qué hay que corregir para que se pueda publicar"
                style={{ width: '100%', padding: 10, border: '1px solid var(--borde-frio)', borderRadius: 8, fontSize: '.88rem', fontFamily: 'inherit', resize: 'vertical' }} />

              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button onClick={() => moderar(p.id, 'publicada')} disabled={trabajando === p.id}
                  style={{ padding: '9px 18px', background: 'var(--exito-fuerte)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>
                  Aprobar y publicar
                </button>
                <button onClick={() => moderar(p.id, 'cambios_solicitados')} disabled={trabajando === p.id}
                  style={{ padding: '9px 18px', background: '#fff', color: '#c2410c', border: '1px solid #fdba74', borderRadius: 6, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>
                  Pedir cambios
                </button>
                <button onClick={() => moderar(p.id, 'rechazada')} disabled={trabajando === p.id}
                  style={{ padding: '9px 18px', background: '#fff', color: 'var(--error-fuerte)', border: '1px solid #fca5a5', borderRadius: 6, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>
                  Rechazar
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
