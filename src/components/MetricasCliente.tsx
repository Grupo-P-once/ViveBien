'use client'
import { useState, useEffect, useCallback } from 'react'
import { auth } from '@/lib/firebase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, ReferenceLine,
} from 'recharts'

/**
 * Gráficas del portal del cliente.
 *
 * El criterio, y es estricto: **una gráfica que no cambia una decisión es ruido
 * con ejes.** El cliente no gestiona un negocio; está decidiendo dónde vivir o
 * dónde invertir. Sólo entran dos preguntas, porque son las dos que se hace de
 * verdad antes de escribirle a alguien:
 *
 *   1. De lo que guardé, ¿cuál está mejor de precio?
 *   2. ¿Mi presupuesto alcanza para lo que busco, o tengo que moverlo?
 *
 * Se quedaron fuera «propiedades vistas», «tiempo en el sitio» y compañía: son
 * métricas del portal, no del cliente. A él no le sirven para nada.
 */

const SERIE = { azul: '#3B6FD4', ambar: '#D9930A', verde: '#158A70', rojo: '#C0392B' }
const TINTA = { fuerte: '#222831', media: '#5A6472', suave: '#8B95A3' }
const REJILLA = '#E8ECF1'

type Propiedad = {
  id: string
  titulo?: string
  ubicacion?: string
  precio?: number
  metros?: number
  operacion?: string
  tipo?: string
  estado_pub?: string
  estatus?: string
}

type Perfil = {
  busca_zona?: string | null
  busca_operacion?: string | null
  busca_tipo?: string | null
  presupuesto_max?: number | null
}

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

function Tarjeta({ titulo, nota, children }: {
  titulo: string; nota?: string; children: React.ReactNode
}) {
  return (
    <section className="carta" style={{ padding: '1.4rem 1.6rem' }}>
      <header style={{ marginBottom: '1rem' }}>
        <h3 style={{
          fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
          color: 'var(--azul)', fontSize: '1rem', margin: 0,
        }}>
          {titulo}
        </h3>
        {nota && (
          <p style={{ fontSize: '.8rem', color: TINTA.suave, marginTop: 3, lineHeight: 1.5 }}>{nota}</p>
        )}
      </header>
      {children}
    </section>
  )
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '2.25rem 1rem', textAlign: 'center', color: TINTA.suave,
      fontSize: '.86rem', background: '#FAFBFC', borderRadius: 10,
      border: '1px dashed #E0E5EB', lineHeight: 1.6,
    }}>
      {children}
    </div>
  )
}

function Pista({ activo, payload, label, sufijo }: {
  activo?: boolean; payload?: { value: number }[]; label?: string; sufijo?: string
}) {
  if (!activo || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid #E0E5EB', borderRadius: 8,
      padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,.1)', fontSize: '.85rem',
    }}>
      <div style={{ color: TINTA.media, marginBottom: 2 }}>{label}</div>
      <strong style={{ color: TINTA.fuerte, fontSize: '1rem' }}>
        {pesos(payload[0].value)}{sufijo}
      </strong>
    </div>
  )
}

export default function MetricasCliente() {
  const [props, setProps] = useState<Propiedad[]>([])
  const [favIds, setFavIds] = useState<string[]>([])
  const [perfil, setPerfil] = useState<Perfil>({})
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    try {
      const h = await cabeceras()
      const [rp, rf, rm] = await Promise.all([
        fetch('/api/admin/propiedades'),
        fetch('/api/favoritos', { headers: h }),
        fetch('/api/usuarios/me', { headers: h }),
      ])
      if (rp.ok) {
        const d = await rp.json()
        setProps(Array.isArray(d) ? d : [])
      }
      if (rf.ok) {
        const d = await rf.json()
        setFavIds(Array.isArray(d) ? d : [])
      }
      if (rm.ok) setPerfil(await rm.json())
    } catch { /* las tarjetas dicen que faltan datos */ }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  if (cargando) return null

  const disponibles = props.filter(
    p => (p.estado_pub ?? 'publicada') === 'publicada' && p.estatus === 'disponible',
  )

  /* ── 1 · Precio por m² de lo que guardó ────────────────────────
     El número que de verdad compara dos propiedades. Dos casas de 3 y 4
     millones no se pueden comparar hasta dividirlas entre sus metros. */
  const favoritos = favIds
    .map(id => disponibles.find(p => p.id === id))
    .filter((p): p is Propiedad => Boolean(p) && Boolean(p!.precio) && Boolean(p!.metros))

  const porMetro = favoritos
    .map(p => ({
      nombre: (p.titulo ?? p.id).length > 20 ? `${(p.titulo ?? p.id).slice(0, 19).trimEnd()}…` : (p.titulo ?? p.id),
      valor: Math.round(p.precio! / p.metros!),
    }))
    .sort((a, b) => a.valor - b.valor)

  // La referencia del mercado: la mediana, no la media. Una nave industrial
  // de 40 millones desplaza una media y no dice nada de las casas.
  const todosPorMetro = disponibles
    .filter(p => p.precio && p.metros)
    .map(p => p.precio! / p.metros!)
    .sort((a, b) => a - b)
  const mediana = todosPorMetro.length
    ? Math.round(todosPorMetro[Math.floor(todosPorMetro.length / 2)])
    : 0

  /* ── 2 · Qué alcanza el presupuesto ────────────────────────────
     No es una gráfica bonita: es la respuesta a «¿tengo que subir?». */
  const tope = perfil.presupuesto_max ?? 0
  const zona = perfil.busca_zona ?? null

  const enZona = zona
    ? disponibles.filter(p => (p.ubicacion ?? '').toLowerCase().includes(zona.toLowerCase()))
    : disponibles

  const conPrecio = enZona.filter(p => typeof p.precio === 'number' && p.precio! > 0)
  const dentro = tope ? conPrecio.filter(p => p.precio! <= tope).length : 0
  const fuera = conPrecio.length - dentro

  const alcance = [
    { nombre: 'Dentro de tu presupuesto', valor: dentro, color: SERIE.verde },
    { nombre: 'Por encima', valor: fuera, color: SERIE.ambar },
  ]

  return (
    <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginBottom: '2rem' }}>

      <Tarjeta
        titulo="Precio por m² de lo que guardaste"
        nota={mediana
          ? `La línea es la mediana del catálogo: ${pesos(mediana)} por m². A la izquierda, mejor precio.`
          : 'A la izquierda, mejor precio por metro.'}
      >
        {porMetro.length === 0 ? (
          <Vacio>
            Guarda un par de propiedades con superficie y precio, y aquí verás
            cuál sale mejor por metro. Es la única forma de comparar dos
            propiedades de tamaños distintos.
          </Vacio>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(150, porMetro.length * 44)}>
            <BarChart data={porMetro} layout="vertical" margin={{ top: 4, right: 78, left: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke={REJILLA} />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="nombre" width={140}
                tick={{ fill: TINTA.media, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<Pista sufijo=" / m²" />} cursor={{ fill: 'rgba(59,111,212,.06)' }} />
              {mediana > 0 && (
                <ReferenceLine x={mediana} stroke={TINTA.suave} strokeDasharray="4 4" />
              )}
              <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
                {porMetro.map(d => (
                  <Cell key={d.nombre} fill={mediana && d.valor <= mediana ? SERIE.verde : SERIE.azul} />
                ))}
                <LabelList dataKey="valor" position="right"
                  formatter={(v: unknown) => (typeof v === 'number' ? pesos(v) : '')}
                  style={{ fill: TINTA.fuerte, fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Qué alcanza tu presupuesto"
        nota={tope
          ? `Hasta ${pesos(tope)}${zona ? ` · en ${zona}` : ' · en todo el catálogo'}.`
          : undefined}
      >
        {!tope ? (
          <Vacio>
            Dinos hasta cuánto quieres gastar y te decimos cuántas de las
            propiedades disponibles entran, y cuántas se te escapan por poco.
          </Vacio>
        ) : conPrecio.length === 0 ? (
          <Vacio>
            Todavía no hay propiedades con precio publicado
            {zona ? ` en ${zona}` : ''}. En cuanto entren, esto se llena solo.
          </Vacio>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div>
                <p style={{
                  fontFamily: 'Montserrat, sans-serif', fontSize: '2rem', fontWeight: 800,
                  color: dentro > 0 ? SERIE.verde : SERIE.ambar, lineHeight: 1, margin: 0,
                }}>
                  {dentro}
                </p>
                <p className="etiqueta" style={{ color: TINTA.suave, marginTop: 5 }}>
                  {dentro === 1 ? 'te entra' : 'te entran'}
                </p>
              </div>
              <div>
                <p style={{
                  fontFamily: 'Montserrat, sans-serif', fontSize: '2rem', fontWeight: 800,
                  color: TINTA.suave, lineHeight: 1, margin: 0,
                }}>
                  {conPrecio.length}
                </p>
                <p className="etiqueta" style={{ color: TINTA.suave, marginTop: 5 }}>
                  disponibles
                </p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={alcance} layout="vertical" margin={{ top: 0, right: 40, left: 4, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={REJILLA} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nombre" width={160}
                  tick={{ fill: TINTA.media, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={false}>
                  {alcance.map(d => <Cell key={d.nombre} fill={d.color} />)}
                  <LabelList dataKey="valor" position="right"
                    style={{ fill: TINTA.fuerte, fontSize: 12, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {dentro === 0 && (
              <p style={{
                fontSize: '.83rem', color: 'var(--aviso-fuerte)', background: 'var(--aviso-fondo-calido)',
                padding: '9px 12px', borderRadius: 8, marginTop: '.9rem', lineHeight: 1.55,
              }}>
                Nada entra en ese presupuesto{zona ? ` en ${zona}` : ''}. Vale la pena
                subir el tope o mirar otra zona — te lo decimos ahora y no después
                de diez búsquedas.
              </p>
            )}
          </>
        )}
      </Tarjeta>
    </div>
  )
}
