'use client'
import { useState, useEffect, useCallback } from 'react'
import { auth } from '@/lib/firebase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'

/**
 * Métricas reales del panel.
 *
 * Los colores de marca (#1B365D, #8B1A1A) son buenos para la interfaz y malos
 * para marcas de datos: quedan fuera de la banda de luminosidad y su croma es
 * tan bajo que leen como gris. Estos cuatro salen de las mismas familias pero
 * validados para daltonismo, y el rojo es el token --rojo-claro que ya existía.
 */
const SERIE = {
  azul: '#3B6FD4',
  rojo: '#C0392B',
  ambar: '#D9930A',
  verde: '#158A70',
}

// Tinta: el texto nunca lleva el color de la serie.
const TINTA = { fuerte: '#222831', media: '#5A6472', suave: '#8B95A3' }
const REJILLA = '#E8ECF1'

type Resumen = {
  desde: string
  total: number
  porNombre: Record<string, number>
  masVistas: [string, number][]
  zonasMasBuscadas: [string, number][]
}

type Props = {
  propiedades: { id?: string; titulo?: string; estatus?: string; estado_pub?: string }[]
  leads: unknown[]
  contactos: unknown[]
}

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

function Tarjeta({ titulo, children, nota }: { titulo: string; children: React.ReactNode; nota?: string }) {
  return (
    <section style={{
      background: '#fff', borderRadius: 12, padding: '1.25rem 1.5rem',
      boxShadow: '0 4px 15px rgba(0,0,0,.08)',
    }}>
      <header style={{ marginBottom: '1rem' }}>
        <h3 style={{ color: 'var(--azul, #1B365D)', fontSize: '1rem', margin: 0, fontWeight: 700 }}>{titulo}</h3>
        {nota && <p style={{ fontSize: '.8rem', color: TINTA.suave, marginTop: 2 }}>{nota}</p>}
      </header>
      {children}
    </section>
  )
}

/**
 * Estado vacío honesto: dice qué aparecerá aquí y qué hace falta para verlo.
 *
 * Si la petición falló, lo dice. Enseñar «aún no hay datos» cuando en realidad
 * no se pudo consultar hace creer que el negocio va peor de lo que va.
 */
function Vacio({ mensaje, fallo }: { mensaje: string; fallo?: boolean }) {
  return (
    <div style={{
      padding: '2.5rem 1rem', textAlign: 'center',
      color: fallo ? '#92400E' : TINTA.suave,
      fontSize: '.88rem',
      background: fallo ? '#FFFBEB' : '#FAFBFC',
      borderRadius: 8,
      border: `1px dashed ${fallo ? '#FDE68A' : '#E0E5EB'}`,
      lineHeight: 1.6,
    }}>
      {fallo ? 'No se pudieron consultar estos datos. No significa que no existan.' : mensaje}
    </div>
  )
}

function Pista({ activo, payload, label }: {
  activo?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!activo || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8,
      padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,.1)', fontSize: '.85rem',
    }}>
      <div style={{ color: TINTA.media, marginBottom: 2 }}>{label}</div>
      <strong style={{ color: TINTA.fuerte, fontSize: '1rem' }}>{payload[0].value}</strong>
    </div>
  )
}

/** Barras horizontales: las etiquetas son nombres de zona o títulos, largos. */
function BarrasHorizontales({ datos, color }: { datos: { nombre: string; valor: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, datos.length * 42)}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 44, left: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={REJILLA} />
        <XAxis type="number" hide />
        <YAxis
          type="category" dataKey="nombre" width={150}
          tick={{ fill: TINTA.media, fontSize: 12 }}
          axisLine={false} tickLine={false}
        />
        <Tooltip content={<Pista />} cursor={{ fill: 'rgba(59,111,212,.06)' }} />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
          {datos.map((d) => <Cell key={d.nombre} fill={color} />)}
          {/* El ámbar no llega a 3:1 contra el fondo: la etiqueta visible es obligatoria. */}
          <LabelList
            dataKey="valor" position="right"
            style={{ fill: TINTA.fuerte, fontSize: 12, fontWeight: 700 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function Metricas({ propiedades, leads, contactos }: Props) {
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/eventos', { headers: await cabeceras() })
      if (!res.ok) {
        setError('No se pudieron cargar las métricas.')
        setResumen(null)
      } else {
        setResumen(await res.json())
        setError('')
      }
    } catch {
      setError('Error de red al cargar las métricas.')
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const publicadas = propiedades.filter(
    p => (p.estado_pub ?? 'publicada') === 'publicada' && p.estatus === 'disponible',
  ).length
  const pendientes = propiedades.filter(p => p.estado_pub === 'en_revision').length

  const vistas = resumen?.porNombre?.property_view ?? 0
  const favoritos = resumen?.porNombre?.property_favorite ?? 0
  const solicitudes = leads.length + contactos.length

  const titulo = (id: string) => {
    const t = propiedades.find(p => p.id === id)?.titulo ?? id
    return t.length > 22 ? t.slice(0, 21).trimEnd() + '…' : t
  }

  const zonas = (resumen?.zonasMasBuscadas ?? []).map(([nombre, valor]) => ({
    nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1),
    valor,
  }))

  const masVistas = (resumen?.masVistas ?? []).map(([id, valor]) => ({
    nombre: titulo(id), valor,
  }))

  const kpis = [
    { titulo: 'Publicadas', valor: publicadas, color: SERIE.verde },
    { titulo: 'Por revisar', valor: pendientes, color: SERIE.ambar },
    { titulo: 'Leads', valor: leads.length, color: SERIE.azul },
    { titulo: 'Contactos', valor: contactos.length, color: SERIE.rojo },
  ]

  // No es un embudo: se puede contactar sin haber guardado en favoritos.
  // Son tres medidas de interacción, y las dos últimas se expresan contra las
  // vistas, que es el denominador que comparten.
  const interaccion = [
    { paso: 'Vistas de propiedad', valor: vistas, color: SERIE.azul, base: false },
    { paso: 'Guardadas en favoritos', valor: favoritos, color: SERIE.ambar, base: true },
    { paso: 'Solicitudes de contacto', valor: solicitudes, color: SERIE.verde, base: true },
  ]
  const tope = Math.max(...interaccion.map(e => e.valor), 1)

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {error && (
        <p style={{ background: '#FEF2F2', color: '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: '.9rem' }}>
          {error}
        </p>
      )}

      {/* ── Cifras de cabecera ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '1rem' }}>
        {kpis.map(k => (
          <div key={k.titulo} style={{
            background: '#fff', borderRadius: 12, padding: '1.15rem 1.35rem',
            boxShadow: '0 4px 15px rgba(0,0,0,.08)', borderLeft: `4px solid ${k.color}`,
          }}>
            <div style={{ fontSize: '.8rem', color: TINTA.media, marginBottom: 6, letterSpacing: '.02em' }}>
              {k.titulo}
            </div>
            <div style={{
              fontSize: '2.1rem', fontWeight: 800, color: TINTA.fuerte,
              lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            }}>
              {k.valor}
            </div>
          </div>
        ))}
      </div>

      {/* ── Embudo ── */}
      <Tarjeta
        titulo="Interacción con el catálogo"
        nota={cargando ? 'Cargando…' : 'Últimos 30 días · los porcentajes son sobre las vistas'}
      >
        {vistas === 0 && favoritos === 0 && solicitudes === 0 ? (
          <Vacio fallo={!!error} mensaje="Aquí verás cuántas visitas se convierten en solicitudes. Empieza a llenarse cuando el catálogo reciba tráfico." />
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {interaccion.map((e) => {
              const tasa = e.base && vistas > 0 ? Math.round((e.valor / vistas) * 100) : null
              return (
                <div key={e.paso}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <span style={{ fontSize: '.85rem', color: TINTA.media }}>{e.paso}</span>
                    <span style={{ fontSize: '.95rem', fontWeight: 700, color: TINTA.fuerte, fontVariantNumeric: 'tabular-nums' }}>
                      {e.valor}
                      {tasa !== null && (
                        <span style={{ fontSize: '.78rem', fontWeight: 600, color: TINTA.suave, marginLeft: 8 }}>
                          {tasa}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{ height: 10, background: '#F1F4F8', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.round((e.valor / tope) * 100)}%`,
                      background: e.color, borderRadius: 5, minWidth: e.valor > 0 ? 4 : 0,
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Tarjeta>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '1.5rem' }}>
        {/* ── Zonas ── */}
        <Tarjeta titulo="Zonas más buscadas" nota="Lo que la gente escribe en el buscador">
          {zonas.length === 0
            ? <Vacio fallo={!!error} mensaje="Cada búsqueda con zona queda registrada aquí. Sirve para saber dónde conviene captar inventario." />
            : <BarrasHorizontales datos={zonas} color={SERIE.azul} />}
        </Tarjeta>

        {/* ── Más vistas ── */}
        <Tarjeta titulo="Propiedades más vistas" nota="Una visita por sesión, sin contar recargas">
          {masVistas.length === 0
            ? <Vacio fallo={!!error} mensaje="Se llena cuando el catálogo empiece a recibir visitas." />
            : <BarrasHorizontales datos={masVistas} color={SERIE.ambar} />}
        </Tarjeta>
      </div>
    </div>
  )
}
