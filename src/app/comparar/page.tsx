'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { obtenerComparar, alternarComparar, alCambiarComparar } from '@/lib/comparador'
import { lugarDe } from '@/lib/ubicacion'

/**
 * Comparar propiedades lado a lado.
 *
 * La idea viene del inventario de pantallas de Hozn, reescrita entera para
 * nuestro stack — ver [[Registro de repositorios de referencia]].
 *
 * Lo que hace útil una comparación no es poner los datos en columnas: es
 * **señalar cuál gana en cada fila**. Una tabla de números sin lectura obliga
 * al visitante a hacer aritmética mental, que es justo lo que vino a evitar.
 *
 * El precio por m² se calcula aquí y se marca el mejor, porque es el único
 * número que compara dos propiedades de tamaños distintos. Sin él, «3 millones»
 * y «4 millones» no dicen nada.
 */

type Propiedad = {
  id: string
  titulo?: string
  ubicacion?: string
  ciudad?: string
  estado_dir?: string
  precio?: number
  operacion?: string
  tipo?: string
  metros?: number
  m_terreno?: number
  recamaras?: number
  banos?: number
  estacionamientos?: number
  altura_libre?: number
  fotos?: string[]
  estatus?: string
  estado_pub?: string
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Una fila de la tabla. `mejor` dice si conviene el valor alto o el bajo. */
type Fila = {
  etiqueta: string
  valor: (p: Propiedad) => string | null
  numero?: (p: Propiedad) => number | null
  mejor?: 'bajo' | 'alto'
  nota?: string
}

const FILAS: Fila[] = [
  {
    etiqueta: 'Precio',
    valor: p => (num(p.precio) ? pesos(num(p.precio)!) : null),
    numero: p => num(p.precio),
    mejor: 'bajo',
  },
  {
    etiqueta: 'Precio por m²',
    valor: p => {
      const pr = num(p.precio)
      const m = num(p.metros) ?? num(p.m_terreno)
      return pr && m ? pesos(pr / m) : null
    },
    numero: p => {
      const pr = num(p.precio)
      const m = num(p.metros) ?? num(p.m_terreno)
      return pr && m ? pr / m : null
    },
    mejor: 'bajo',
    nota: 'El único número que compara dos propiedades de tamaños distintos.',
  },
  { etiqueta: 'Operación', valor: p => p.operacion ? p.operacion[0].toUpperCase() + p.operacion.slice(1) : null },
  { etiqueta: 'Tipo', valor: p => p.tipo ? p.tipo[0].toUpperCase() + p.tipo.slice(1) : null },
  { etiqueta: 'Ubicación', valor: p => lugarDe(p).completo },
  {
    etiqueta: 'Superficie',
    valor: p => { const m = num(p.metros) ?? num(p.m_terreno); return m ? `${m.toLocaleString('es-MX')} m²` : null },
    numero: p => num(p.metros) ?? num(p.m_terreno),
    mejor: 'alto',
  },
  { etiqueta: 'Recámaras', valor: p => num(p.recamaras)?.toString() ?? null, numero: p => num(p.recamaras), mejor: 'alto' },
  { etiqueta: 'Baños', valor: p => num(p.banos)?.toString() ?? null, numero: p => num(p.banos), mejor: 'alto' },
  { etiqueta: 'Estacionamientos', valor: p => num(p.estacionamientos)?.toString() ?? null, numero: p => num(p.estacionamientos), mejor: 'alto' },
  { etiqueta: 'Altura libre', valor: p => num(p.altura_libre) ? `${num(p.altura_libre)} m` : null, numero: p => num(p.altura_libre), mejor: 'alto' },
]

function CompararInterior() {
  const params = useSearchParams()
  const [props, setProps] = useState<Propiedad[]>([])
  const [ids, setIds] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    const deUrl = (params.get('ids') ?? '').split(',').map(s => s.trim()).filter(Boolean)
    setIds(deUrl.length > 0 ? deUrl : obtenerComparar())
    return alCambiarComparar(setIds)
  }, [params])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/catalogo')
        if (!res.ok) { setFallo(true); setCargando(false); return }
        const j = await res.json()
        setProps(j.propiedades ?? [])
      } catch { setFallo(true) }
      setCargando(false)
    })()
  }, [])

  const elegidas = ids
    .map(id => props.find(p => p.id === id))
    .filter((p): p is Propiedad => Boolean(p))

  return (
    <>
      <Header />
      <main style={{ background: 'var(--hueso)', minHeight: '70vh', padding: '2.5rem 1.25rem 5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p className="etiqueta regla-marca" style={{ color: 'var(--rojo-marca)', marginBottom: '1.1rem' }}>
            Comparar
          </p>
          <h1 className="titular" style={{ fontSize: 'clamp(1.5rem,3.5vw,2.2rem)', color: 'var(--negro)', margin: '0 0 1.75rem' }}>
            Lado a lado
          </h1>

          {cargando && <p style={{ color: '#8B95A3' }}>Cargando…</p>}

          {!cargando && fallo && (
            <p style={{ background: 'var(--aviso-fondo-calido)', color: 'var(--aviso-fuerte)', padding: '1rem 1.25rem', borderRadius: 10, lineHeight: 1.6 }}>
              No pudimos cargar el catálogo ahora mismo. Las propiedades siguen ahí;
              vuelve a intentarlo en un momento.
            </p>
          )}

          {!cargando && !fallo && elegidas.length < 2 && (
            <div style={{ background: '#fff', border: '1px solid var(--linea-oscura)', borderRadius: 12, padding: '3rem 2rem', textAlign: 'center' }}>
              <p style={{ color: '#5A6472', lineHeight: 1.65, marginBottom: '1.5rem' }}>
                Elige <strong>al menos dos</strong> propiedades para compararlas.
                En el catálogo, pulsa <strong>Comparar</strong> en las que te interesen.
              </p>
              <Link href="/propiedades" style={{
                background: 'var(--rojo-marca)', color: '#fff', padding: '.85rem 1.8rem',
                borderRadius: 10, fontWeight: 700, textDecoration: 'none', fontSize: '.92rem',
              }}>
                Ir al catálogo
              </Link>
            </div>
          )}

          {elegidas.length >= 2 && (
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 14, border: '1px solid var(--linea-oscura)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={{ width: 150 }} />
                    {elegidas.map(p => (
                      <th key={p.id} style={{ padding: '1rem .9rem', textAlign: 'left', verticalAlign: 'top', borderBottom: '1px solid var(--linea-oscura)' }}>
                        <div style={{ aspectRatio: '4/3', borderRadius: 9, overflow: 'hidden', background: 'var(--hueso-hundido)', marginBottom: '.6rem' }}>
                          {p.fotos?.[0]
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={p.fotos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#B9B3AA', fontSize: '.78rem' }}>sin foto</div>}
                        </div>
                        <Link href={`/propiedades/${p.id}`} style={{
                          fontSize: '.9rem', fontWeight: 700, color: 'var(--azul)',
                          textDecoration: 'none', lineHeight: 1.35, display: 'block',
                        }}>
                          {p.titulo ?? p.id}
                        </Link>
                        <button onClick={() => alternarComparar(p.id)} style={{
                          marginTop: '.4rem', background: 'none', border: 'none', padding: 0,
                          color: '#8B95A3', fontSize: '.76rem', cursor: 'pointer', textDecoration: 'underline',
                        }}>
                          Quitar
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FILAS.map(fila => {
                    const valores = elegidas.map(fila.valor)
                    // Una fila donde ninguna tiene el dato no aporta nada: fuera.
                    if (valores.every(v => v === null)) return null

                    let mejorIdx = -1
                    if (fila.numero && fila.mejor) {
                      const nums = elegidas.map(fila.numero)
                      const validos = nums.filter((n): n is number => n !== null)
                      // Con un solo dato no hay comparación que destacar.
                      if (validos.length >= 2) {
                        const objetivo = fila.mejor === 'bajo' ? Math.min(...validos) : Math.max(...validos)
                        // Si todas empatan, no se marca ninguna.
                        if (validos.some(n => n !== objetivo)) {
                          mejorIdx = nums.findIndex(n => n === objetivo)
                        }
                      }
                    }

                    return (
                      <tr key={fila.etiqueta}>
                        <th scope="row" style={{
                          padding: '.75rem .9rem', textAlign: 'left', verticalAlign: 'top',
                          fontSize: '.8rem', fontWeight: 600, color: '#5A6472',
                          borderBottom: '1px solid var(--linea-oscura)', background: '#FAFBFC',
                        }}>
                          {fila.etiqueta}
                          {fila.nota && (
                            <span style={{ display: 'block', fontSize: '.68rem', color: '#B9B3AA', fontWeight: 400, lineHeight: 1.4, marginTop: 2 }}>
                              {fila.nota}
                            </span>
                          )}
                        </th>
                        {valores.map((v, i) => (
                          <td key={i} style={{
                            padding: '.75rem .9rem', fontSize: '.88rem',
                            borderBottom: '1px solid var(--linea-oscura)',
                            fontWeight: i === mejorIdx ? 800 : 500,
                            color: i === mejorIdx ? 'var(--exito-fuerte)' : '#374151',
                          }}>
                            {v ?? <span style={{ color: '#D4CFC7' }}>—</span>}
                            {i === mejorIdx && (
                              <span style={{ marginLeft: 6, fontSize: '.7rem', fontWeight: 700 }}>mejor</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {elegidas.length >= 2 && (
            <p style={{ fontSize: '.8rem', color: '#8B95A3', marginTop: '1rem', lineHeight: 1.6 }}>
              «Mejor» compara sólo ese renglón. La más barata por m² puede no ser la
              que te convenga: mira también la zona y lo que hay alrededor.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}

export default function Comparar() {
  return (
    <Suspense fallback={<div style={{ padding: '6rem 2rem', textAlign: 'center' }}>Cargando…</div>}>
      <CompararInterior />
    </Suspense>
  )
}
