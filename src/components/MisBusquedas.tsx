'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { auth } from '@/lib/firebase'
import { aHref, contar, describir, normalizarFiltros, type Filtros } from '@/lib/busquedas'

/**
 * Las búsquedas que el cliente guardó, con cuántas propiedades nuevas hay.
 *
 * «Nuevas» cuenta desde la última vez que abrió esa búsqueda —o desde que la
 * guardó—, recordado en este navegador. Es lo que convierte una lista de
 * filtros en una razón para volver: «3 nuevas» se abre; «Casas en venta», no.
 *
 * Los avisos por correo NO se ofrecen todavía: necesitan Resend configurado y
 * una tarea programada. Un interruptor que no avisa de nada sería una promesa
 * falsa, justo lo que este panel no puede permitirse.
 */

type Busqueda = { id: number; nombre: string | null; filtros: Filtros; creado_en: string }
type Propiedad = Parameters<typeof contar>[0][number]

const CLAVE_VISTA = (id: number) => `vivebien:busqueda-vista:${id}`

function leerVista(id: number): string | null {
  try { return localStorage.getItem(CLAVE_VISTA(id)) } catch { return null }
}
function marcarVista(id: number) {
  try { localStorage.setItem(CLAVE_VISTA(id), new Date().toISOString()) } catch { /* sin almacenamiento: no pasa nada */ }
}

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export default function MisBusquedas() {
  const [busquedas, setBusquedas] = useState<Busqueda[]>([])
  const [catalogo, setCatalogo] = useState<Propiedad[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [fallo, setFallo] = useState(false)
  const [borrando, setBorrando] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    try {
      const [rb, rc] = await Promise.all([
        fetch('/api/busquedas', { headers: await cabeceras() }),
        fetch('/api/catalogo'),
      ])
      if (!rb.ok) { setFallo(true); setCargando(false); return }
      const jb = await rb.json()
      setBusquedas(Array.isArray(jb.busquedas) ? jb.busquedas : [])
      // Sin catálogo se enseñan las búsquedas igual, sólo sin contador.
      if (rc.ok) {
        const jc = await rc.json().catch(() => ({}))
        setCatalogo(Array.isArray(jc.propiedades) ? jc.propiedades : null)
      }
      setFallo(false)
    } catch {
      setFallo(true)
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function borrar(id: number) {
    setBorrando(id)
    const res = await fetch(`/api/busquedas?id=${id}`, { method: 'DELETE', headers: await cabeceras() }).catch(() => null)
    if (res?.ok) setBusquedas(b => b.filter(x => x.id !== id))
    setBorrando(null)
  }

  return (
    <section className="carta" style={{ padding: '2rem', marginBottom: '2rem' }}>
      <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: 'var(--azul)', marginBottom: '1.25rem', fontSize: '1.1rem' }}>
        <i className="fa fa-bookmark" aria-hidden="true" style={{ color: 'var(--rojo-marca)', marginRight: '.5rem' }} />
        Tus búsquedas
      </h3>

      {cargando && <p style={{ color: '#8B95A3', fontSize: '.9rem' }}>Cargando…</p>}

      {!cargando && fallo && (
        <p style={{ background: 'var(--aviso-fondo-calido)', color: 'var(--aviso-fuerte)', padding: '1rem 1.25rem', borderRadius: 10, fontSize: '.88rem', lineHeight: 1.6 }}>
          No se pudieron consultar tus búsquedas. No significa que no existan —
          vuelve a cargar la página en un momento.
        </p>
      )}

      {!cargando && !fallo && busquedas.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#8B95A3' }}>
          <p style={{ marginBottom: '1.1rem', fontSize: '.92rem', lineHeight: 1.6 }}>
            Todavía no has guardado ninguna.<br />
            En el listado, elige tus filtros y pulsa <strong>Guardar búsqueda</strong>:
            aquí verás cuántas propiedades nuevas aparecen.
          </p>
          <Link href="/propiedades" style={{ display: 'inline-block', background: 'var(--rojo)', color: '#fff', padding: '.7rem 1.5rem', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '.9rem' }}>
            Ir al listado
          </Link>
        </div>
      )}

      {busquedas.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.75rem' }}>
          {busquedas.map(b => {
            const filtros = normalizarFiltros(b.filtros as Record<string, unknown>) ?? {}
            const vista = leerVista(b.id)
            const desde = vista && vista > b.creado_en ? vista : b.creado_en
            const cuenta = catalogo ? contar(catalogo, filtros, desde) : null
            return (
              <li key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', border: '1px solid var(--linea-oscura)', borderRadius: 12, padding: '1rem 1.2rem', background: '#fff', opacity: borrando === b.id ? .5 : 1 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, color: '#1F2024', fontSize: '.95rem' }}>
                    {describir(filtros)}
                  </div>
                  {cuenta && (
                    <div style={{ fontSize: '.82rem', color: '#6B7280', marginTop: 3 }}>
                      {cuenta.total === 1 ? '1 propiedad' : `${cuenta.total} propiedades`}
                      {cuenta.nuevas > 0 && (
                        <strong style={{ marginLeft: 8, background: 'var(--exito-fondo)', color: 'var(--exito-fuerte)', padding: '1px 8px', borderRadius: 20, fontSize: '.75rem' }}>
                          {cuenta.nuevas === 1 ? '1 nueva' : `${cuenta.nuevas} nuevas`}
                        </strong>
                      )}
                    </div>
                  )}
                </div>
                <Link href={aHref(filtros)} onClick={() => marcarVista(b.id)}
                  style={{ background: 'var(--azul)', color: '#fff', padding: '.55rem 1.1rem', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: '.83rem' }}>
                  Ver
                </Link>
                <button type="button" onClick={() => borrar(b.id)} disabled={borrando === b.id}
                  aria-label={`Borrar la búsqueda ${describir(filtros)}`}
                  style={{ background: 'none', border: '1px solid var(--borde-frio)', color: '#6B7280', padding: '.5rem .8rem', borderRadius: 8, fontSize: '.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Borrar
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
