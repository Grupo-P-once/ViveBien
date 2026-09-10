'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { auth } from '@/lib/firebase'

/**
 * Las propiedades que el cliente guardó.
 *
 * El corazón de la ficha ya escribía en `favoritos` desde la Fase 5, pero el
 * portal del cliente nunca leía esa tabla: se guardaban y no aparecían en
 * ningún sitio. Guardar algo y no volver a verlo es peor que no ofrecer el
 * botón, porque promete una lista que no existe.
 */

type Propiedad = {
  id: string
  titulo?: string
  ubicacion?: string
  precio?: number
  operacion?: string
  tipo?: string
  metros?: number
  recamaras?: number
  banos?: number
  fotos?: string[]
  estado_pub?: string
  estatus?: string
}

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

function precio(p: Propiedad): string {
  if (!p.precio) return 'Precio a consultar'
  const n = p.precio.toLocaleString('es-MX', { maximumFractionDigits: 0 })
  return `$${n}${p.operacion === 'renta' ? ' / mes' : ''}`
}

export default function MisFavoritos() {
  const [ids, setIds] = useState<string[]>([])
  const [props, setProps] = useState<Propiedad[]>([])
  const [cargando, setCargando] = useState(true)
  const [fallo, setFallo] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [rf, rp] = await Promise.all([
        fetch('/api/favoritos', { headers: await cabeceras() }),
        fetch('/api/admin/propiedades'),
      ])
      if (!rf.ok) { setFallo(true); setCargando(false); return }
      const listaIds: string[] = await rf.json()
      const todas: Propiedad[] = rp.ok ? await rp.json() : []
      setIds(Array.isArray(listaIds) ? listaIds : [])
      setProps(Array.isArray(todas) ? todas : [])
    } catch {
      setFallo(true)
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function quitar(id: string) {
    // Optimista: el corazón responde al instante y se corrige si falla.
    const antes = ids
    setIds(x => x.filter(i => i !== id))
    const res = await fetch('/api/favoritos', {
      method: 'POST', headers: await cabeceras(),
      body: JSON.stringify({ propiedadId: id }),
    }).catch(() => null)
    if (!res || !res.ok) setIds(antes)
  }

  const guardadas = ids
    .map(id => props.find(p => p.id === id))
    .filter((p): p is Propiedad => Boolean(p))

  // Un favorito cuya propiedad ya no está publicada. Decirlo es mejor que
  // hacerla desaparecer sin explicación: el cliente la guardó por algo.
  const retiradas = ids.length - guardadas.length

  return (
    <section className="carta" style={{ padding: '2rem', marginBottom: '2rem' }}>
      <h3 style={{
        fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: 'var(--azul)',
        marginBottom: '1.25rem', fontSize: '1.1rem',
      }}>
        <i className="fa fa-heart" style={{ color: 'var(--rojo-marca)', marginRight: '.5rem' }} />
        Propiedades que guardaste
      </h3>

      {cargando && <p style={{ color: '#8B95A3', fontSize: '.9rem' }}>Cargando…</p>}

      {!cargando && fallo && (
        <p style={{
          background: 'var(--aviso-fondo-calido)', color: 'var(--aviso-fuerte)',
          padding: '1rem 1.25rem', borderRadius: 10, fontSize: '.88rem', lineHeight: 1.6,
        }}>
          No se pudieron consultar tus favoritos. No significa que no existan —
          vuelve a cargar la página en un momento.
        </p>
      )}

      {!cargando && !fallo && guardadas.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#8B95A3' }}>
          <i className="fa fa-heart-o" style={{ fontSize: '2.2rem', display: 'block', marginBottom: '.9rem', opacity: .35 }} />
          <p style={{ marginBottom: '1.1rem', fontSize: '.92rem', lineHeight: 1.6 }}>
            Todavía no has guardado ninguna.<br />
            El corazón de cada ficha la guarda aquí para compararlas después.
          </p>
          <Link href="/propiedades" style={{
            display: 'inline-block', background: 'var(--rojo)', color: '#fff',
            padding: '.7rem 1.5rem', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '.9rem',
          }}>
            Explorar propiedades
          </Link>
        </div>
      )}

      {guardadas.length > 0 && (
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))' }}>
          {guardadas.map(p => (
            <article key={p.id} style={{
              border: '1px solid var(--linea-oscura)', borderRadius: 12,
              overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ position: 'relative', aspectRatio: '4/3', background: 'var(--hueso-hundido)' }}>
                {p.fotos?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.fotos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#B9B3AA' }}>
                    <i className="fa fa-home" style={{ fontSize: '1.8rem' }} />
                  </div>
                )}
                <button onClick={() => quitar(p.id)} aria-label="Quitar de favoritos"
                  style={{
                    position: 'absolute', top: 10, right: 10, width: 34, height: 34,
                    borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: 'rgba(255,255,255,.94)', color: 'var(--rojo-marca)',
                    boxShadow: '0 2px 8px rgba(0,0,0,.18)', fontSize: '.9rem',
                  }}>
                  <i className="fa fa-heart" />
                </button>
              </div>

              <div style={{ padding: '.9rem 1rem 1.1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span className="etiqueta" style={{ color: '#8B95A3', fontSize: '.66rem' }}>
                  {[p.tipo, p.operacion].filter(Boolean).join(' · ') || 'Propiedad'}
                </span>
                <h4 style={{
                  fontSize: '.95rem', fontWeight: 700, color: 'var(--azul)',
                  margin: '.35rem 0 .2rem', lineHeight: 1.35,
                }}>
                  {p.titulo || 'Sin título'}
                </h4>
                {p.ubicacion && (
                  <p style={{ fontSize: '.8rem', color: '#8B95A3', margin: 0 }}>{p.ubicacion}</p>
                )}

                <p style={{
                  fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
                  color: 'var(--rojo-marca)', fontSize: '1.02rem', margin: '.6rem 0 .1rem',
                }}>
                  {precio(p)}
                </p>

                {(p.metros || p.recamaras || p.banos) && (
                  <p style={{ fontSize: '.78rem', color: '#5A6472', margin: '.2rem 0 0' }}>
                    {[
                      p.metros ? `${p.metros} m²` : null,
                      p.recamaras ? `${p.recamaras} rec` : null,
                      p.banos ? `${p.banos} baños` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}

                <Link href={`/propiedades/${p.id}`} style={{
                  marginTop: 'auto', paddingTop: '.9rem', color: 'var(--azul)',
                  fontWeight: 700, fontSize: '.83rem', textDecoration: 'none',
                }}>
                  Ver ficha completa →
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {retiradas > 0 && (
        <p style={{ fontSize: '.8rem', color: '#8B95A3', marginTop: '1rem' }}>
          {retiradas === 1
            ? 'Una propiedad que guardaste ya no está disponible.'
            : `${retiradas} propiedades que guardaste ya no están disponibles.`}
        </p>
      )}
    </section>
  )
}
