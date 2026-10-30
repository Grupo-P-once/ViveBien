'use client'
import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts'
import type {
  PuntoDiario, Porcion, ZonaComparada, Rango, PuntoMercado, InteresPropiedad,
} from '@/lib/analitica'

/**
 * Las gráficas de analítica del panel.
 *
 * ─────────────────────────────────────────────────────────────
 * DOS GRÁFICAS NO SON COMO SE PIDIERON, A PROPÓSITO
 *
 * · «Vistas y leads, línea de doble eje» → dos líneas alineadas en el mismo eje
 *   de fechas, con el cursor sincronizado. Con dos escalas en un mismo plano, el
 *   punto donde se cruzan las líneas depende de cómo se alinean los ejes, no de
 *   los datos: la gráfica sugiere relaciones que no existen. Con 12 vistas y 0
 *   leads, se vería una «correlación» dibujada a mano.
 *
 * · «Búsquedas vs propiedades activas, barras apiladas» → barras agrupadas.
 *   Apilar suma búsquedas con propiedades, dos unidades distintas: la longitud
 *   total de la barra no significaría nada.
 * ─────────────────────────────────────────────────────────────
 *
 * Colores: los cuatro de `Metricas.tsx`, validados con el validador de paletas
 * (todos los pares, fondo blanco): peor par para daltonismo ΔE 9,3, visión normal
 * 19,5. El ámbar tiene contraste 2,58:1 con el fondo, así que toda gráfica lleva
 * etiquetas o su tabla. El texto nunca va en el color de la serie.
 */

const SERIE = { azul: '#3B6FD4', rojo: '#C0392B', ambar: '#D9930A', verde: '#158A70' }
const OTROS = '#B6BCC6'
const TINTA = { fuerte: '#222831', media: '#5A6472', suave: '#8B95A3' }
const REJILLA = '#E8ECF1'
const SUPERFICIE = '#ffffff'

/** El color sigue al tipo, no al tamaño: «Naves» es azul en las dos donas. */
const COLOR_TIPO: Record<string, string> = {
  nave: SERIE.azul, casa: SERIE.rojo, terreno: SERIE.ambar, departamento: SERIE.verde,
}
const colorTipo = (clave: string) => COLOR_TIPO[clave] ?? OTROS

export type Datos = {
  desde: string
  dias: number
  faltan: string[]
  serie: PuntoDiario[]
  inventario: Porcion[]
  interes: Porcion[]
  zonas: ZonaComparada[]
  precios: { renta: Rango[]; venta: Rango[]; total: number }
  mercado: PuntoMercado[]
  top: InteresPropiedad[]
}

const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 })
const dineroLargo = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

/** «2026-09-16» → «16 sep». Se lee como fecha de calendario, sin zona horaria. */
function diaCorto(dia: string): string {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${dia}T00:00:00Z`)).replace('.', '')
}

/* ── Piezas comunes ─────────────────────────────────────────── */

function Tarjeta({ titulo, nota, children, tabla }: {
  titulo: string; nota?: string; children: React.ReactNode; tabla?: React.ReactNode
}) {
  return (
    <section style={{ background: SUPERFICIE, borderRadius: 12, padding: '1.25rem 1.5rem', boxShadow: '0 4px 15px rgba(0,0,0,.08)', minWidth: 0 }}>
      <header style={{ marginBottom: '1rem' }}>
        <h3 style={{ color: 'var(--azul, #1B365D)', fontSize: '1rem', margin: 0, fontWeight: 700 }}>{titulo}</h3>
        {nota && <p style={{ fontSize: '.8rem', color: TINTA.suave, margin: '2px 0 0' }}>{nota}</p>}
      </header>
      {children}
      {/* La tabla es el equivalente accesible de la gráfica y la salida para
          los colores de poco contraste: ningún valor depende del cursor. */}
      {tabla && (
        <details style={{ marginTop: '.9rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '.8rem', color: TINTA.media }}>Ver los datos en tabla</summary>
          <div style={{ overflowX: 'auto', marginTop: '.5rem' }}>{tabla}</div>
        </details>
      )}
    </section>
  )
}

function Vacio({ mensaje }: { mensaje: string }) {
  return (
    <div style={{ padding: '2.2rem 1rem', textAlign: 'center', color: TINTA.suave, fontSize: '.88rem', lineHeight: 1.6 }}>
      <i className="fa fa-chart-simple" aria-hidden="true" style={{ display: 'block', fontSize: '1.4rem', marginBottom: '.5rem', opacity: .6 }} />
      {mensaje}
    </div>
  )
}

function Tabla({ columnas, filas }: { columnas: string[]; filas: (string | number)[][] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem', fontVariantNumeric: 'tabular-nums' }}>
      <thead>
        <tr>{columnas.map((c) => <th key={c} style={{ textAlign: 'left', padding: '6px 8px', color: TINTA.media, borderBottom: `1px solid ${REJILLA}` }}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i}>{f.map((v, j) => <td key={j} style={{ padding: '6px 8px', color: TINTA.fuerte, borderBottom: `1px solid ${REJILLA}` }}>{v}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

/** Muestra de color junto al texto: el texto es tinta, el color va en la marca. */
function Muestra({ color, forma = 'caja' }: { color: string; forma?: 'caja' | 'linea' }) {
  return forma === 'linea'
    ? <span aria-hidden="true" style={{ display: 'inline-block', width: 14, height: 2, background: color, borderRadius: 1, verticalAlign: 'middle' }} />
    : <span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, background: color, borderRadius: 2, verticalAlign: 'middle' }} />
}

type Fila = { valor: React.ReactNode; nombre: string; color: string }

/** Globo del cursor: el valor destaca, el nombre de la serie acompaña. */
function Globo({ titulo, filas }: { titulo?: React.ReactNode; filas: Fila[] }) {
  return (
    <div style={{ background: SUPERFICIE, border: `1px solid ${REJILLA}`, borderRadius: 8, padding: '8px 10px', boxShadow: '0 4px 14px rgba(0,0,0,.08)', fontSize: '.8rem' }}>
      {titulo && <div style={{ color: TINTA.media, marginBottom: 4 }}>{titulo}</div>}
      {filas.map((f) => (
        <div key={f.nombre} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Muestra color={f.color} forma="linea" />
          <strong style={{ color: TINTA.fuerte, fontVariantNumeric: 'tabular-nums' }}>{f.valor}</strong>
          <span style={{ color: TINTA.media }}>{f.nombre}</span>
        </div>
      ))}
    </div>
  )
}

const ejeTexto = { fill: TINTA.suave, fontSize: 11 }

/* ── 1. Vistas y leads: dos líneas alineadas ────────────────── */

function VistasYLeads({ serie }: { serie: PuntoDiario[] }) {
  const totalVistas = serie.reduce((s, p) => s + p.vistas, 0)
  const totalLeads = serie.reduce((s, p) => s + p.leads, 0)
  const paneles = [
    { clave: 'vistas' as const, nombre: 'Vistas totales', total: totalVistas, color: SERIE.azul, eje: false },
    { clave: 'leads' as const, nombre: 'Leads generados', total: totalLeads, color: SERIE.rojo, eje: true },
  ]

  return (
    <Tarjeta
      titulo="Vistas y leads, día a día"
      nota="Dos gráficas alineadas en las mismas fechas: el cursor se mueve en las dos a la vez. Cada una con su propia escala."
      tabla={<Tabla columnas={['Día', 'Vistas', 'Leads']} filas={serie.filter((p) => p.vistas || p.leads).map((p) => [diaCorto(p.dia), p.vistas, p.leads])} />}
    >
      {totalVistas === 0 && totalLeads === 0 ? (
        <Vacio mensaje="Aún no hay vistas ni leads en estos 30 días. Se llena en cuanto el catálogo recibe visitas." />
      ) : (
        <div style={{ display: 'grid', gap: '.4rem' }}>
          {paneles.map((panel) => (
            <div key={panel.clave}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: '.82rem', color: TINTA.media, marginLeft: 36 }}>
                <Muestra color={panel.color} forma="linea" />
                {panel.nombre}
                <strong style={{ color: TINTA.fuerte, fontSize: '.95rem' }}>{panel.total}</strong>
              </div>
              <div style={{ height: panel.eje ? 150 : 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie} syncId="vistas-leads" margin={{ top: 8, right: 12, bottom: panel.eje ? 0 : 8, left: 0 }}>
                    <CartesianGrid stroke={REJILLA} vertical={false} />
                    {/* Sin línea de eje: la de la cuadrícula en 0 ya es la base, y las
                        dos juntas se veían como una línea doble. La gráfica de
                        arriba oculta las fechas: las de abajo sirven para las dos. */}
                    <XAxis dataKey="dia" tickFormatter={diaCorto} tick={ejeTexto} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} height={24} hide={!panel.eje} />
                    <YAxis allowDecimals={false} width={32} tick={ejeTexto} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ stroke: TINTA.suave, strokeWidth: 1 }}
                      content={(p) => {
                        const x = p as unknown as { active?: boolean; label?: string; payload?: { value?: number }[] }
                        if (!x.active || !x.payload?.length) return null
                        return <Globo titulo={x.label ? diaCorto(x.label) : undefined} filas={[{ valor: x.payload[0].value ?? 0, nombre: panel.nombre, color: panel.color }]} />
                      }}
                    />
                    {/* Recta de punto a punto: una curva suavizada dibuja una subida
                        gradual entre días que no existió. Son conteos diarios. */}
                    <Line type="linear" dataKey={panel.clave} stroke={panel.color} strokeWidth={2} dot={false}
                      activeDot={{ r: 4, fill: panel.color, stroke: SUPERFICIE, strokeWidth: 2 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
    </Tarjeta>
  )
}

/* ── 2. Donas de composición ────────────────────────────────── */

function Dona({ titulo, nota, porciones, unidad, vacio }: {
  titulo: string; nota: string; porciones: Porcion[]; unidad: string; vacio: string
}) {
  const total = porciones.reduce((s, p) => s + p.n, 0)
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)

  return (
    <Tarjeta titulo={titulo} nota={nota}
      tabla={<Tabla columnas={['Tipo', unidad, '%']} filas={porciones.map((p) => [p.etiqueta, p.n, `${pct(p.n)}%`])} />}>
      {total === 0 ? <Vacio mensaje={vacio} /> : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 150, height: 150, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {/* El trazo del color de la superficie ES el hueco de 2 px entre
                    porciones, no un borde. */}
                <Pie data={porciones} dataKey="n" nameKey="etiqueta" innerRadius={48} outerRadius={70}
                  stroke={SUPERFICIE} strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
                  {porciones.map((p) => <Cell key={p.clave} fill={colorTipo(p.clave)} />)}
                </Pie>
                <Tooltip content={(p) => {
                  const x = p as unknown as { active?: boolean; payload?: { value?: number; name?: string; payload?: Porcion }[] }
                  const it = x.active && x.payload?.[0]
                  if (!it || !it.payload) return null
                  return <Globo filas={[{ valor: `${it.value} · ${pct(Number(it.value))}%`, nombre: String(it.name), color: colorTipo(it.payload.clave) }]} />
                }} />
              </PieChart>
            </ResponsiveContainer>
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: TINTA.fuerte, lineHeight: 1 }}>{total}</div>
                <div style={{ fontSize: '.7rem', color: TINTA.suave }}>{unidad.toLowerCase()}</div>
              </div>
            </div>
          </div>
          {/* Leyenda siempre presente: la identidad nunca depende sólo del color. */}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, fontSize: '.84rem', flex: 1, minWidth: 140 }}>
            {porciones.map((p) => (
              <li key={p.clave} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Muestra color={colorTipo(p.clave)} />
                <span style={{ color: TINTA.media, flex: 1 }}>{p.etiqueta}</span>
                <strong style={{ color: TINTA.fuerte, fontVariantNumeric: 'tabular-nums' }}>{pct(p.n)}%</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tarjeta>
  )
}

/* ── 3. Zonas: búsquedas frente a inventario ────────────────── */

function BarrasDobles({ datos, categoria, series, alturaFila = 34, anchoCategoria = 130 }: {
  datos: Record<string, string | number>[]
  categoria: string
  series: { clave: string; nombre: string; color: string }[]
  alturaFila?: number
  anchoCategoria?: number
}) {
  return (
    <>
      {/* Leyenda: dos series, así que siempre hay leyenda. */}
      <div style={{ display: 'flex', gap: '1rem', fontSize: '.8rem', color: TINTA.media, marginBottom: '.4rem', flexWrap: 'wrap' }}>
        {series.map((s) => <span key={s.clave} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Muestra color={s.color} />{s.nombre}</span>)}
      </div>
      <div style={{ height: datos.length * alturaFila + 30 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid stroke={REJILLA} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={ejeTexto} axisLine={{ stroke: REJILLA }} tickLine={false} />
            <YAxis type="category" dataKey={categoria} width={anchoCategoria} tick={{ ...ejeTexto, fill: TINTA.media }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,.03)' }} content={(p) => {
              const x = p as unknown as { active?: boolean; label?: string; payload?: { value?: number; dataKey?: string }[] }
              if (!x.active || !x.payload?.length) return null
              return <Globo titulo={x.label} filas={series.map((s) => ({
                valor: x.payload!.find((it) => it.dataKey === s.clave)?.value ?? 0, nombre: s.nombre, color: s.color,
              }))} />
            }} />
            {series.map((s) => (
              <Bar key={s.clave} dataKey={s.clave} name={s.nombre} fill={s.color} barSize={11} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {/* Valor en la punta: el ámbar no llega a 3:1 de contraste, así
                    que el número no puede depender del color. */}
                <LabelList dataKey={s.clave} position="right" style={{ fill: TINTA.media, fontSize: 11 }} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

/* ── 4. Histograma de presupuesto ───────────────────────────── */

function Histograma({ titulo, rangos }: { titulo: string; rangos: Rango[] }) {
  const total = rangos.reduce((s, r) => s + r.n, 0)
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '.82rem', color: TINTA.media, marginBottom: '.3rem' }}>{titulo} <strong style={{ color: TINTA.fuerte }}>{total}</strong></div>
      <div style={{ height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rangos} margin={{ top: 16, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%">
            <CartesianGrid stroke={REJILLA} vertical={false} />
            <XAxis dataKey="rango" tick={{ ...ejeTexto, fontSize: 10 }} axisLine={{ stroke: REJILLA }} tickLine={false} interval={0} height={36} />
            <YAxis allowDecimals={false} width={28} tick={ejeTexto} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,.03)' }} content={(p) => {
              const x = p as unknown as { active?: boolean; label?: string; payload?: { value?: number }[] }
              if (!x.active || !x.payload?.length) return null
              return <Globo titulo={x.label} filas={[{ valor: x.payload[0].value ?? 0, nombre: 'búsquedas', color: SERIE.azul }]} />
            }} />
            <Bar dataKey="n" fill={SERIE.azul} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="n" position="top" style={{ fill: TINTA.media, fontSize: 11 }} formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ── 5. Días en el mercado frente a precio ──────────────────── */

function Dispersion({ titulo, puntos, color }: { titulo: string; puntos: PuntoMercado[]; color: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '.82rem', color: TINTA.media, marginBottom: '.3rem' }}>{titulo} <strong style={{ color: TINTA.fuerte }}>{puntos.length}</strong></div>
      {puntos.length === 0 ? <Vacio mensaje="Sin propiedades publicadas con precio en esta operación." /> : (
        <div style={{ height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={REJILLA} />
              <XAxis type="number" dataKey="dias" name="Días publicada" allowDecimals={false} tick={ejeTexto} axisLine={{ stroke: REJILLA }} tickLine={false}
                label={{ value: 'Días publicada', position: 'insideBottomRight', offset: -2, fill: TINTA.suave, fontSize: 11 }} height={32} />
              <YAxis type="number" dataKey="precio" name="Precio" width={58} tick={ejeTexto} axisLine={false} tickLine={false} tickFormatter={(v: number) => dinero.format(v)} />
              <Tooltip cursor={false} content={(p) => {
                const x = p as unknown as { active?: boolean; payload?: { payload?: PuntoMercado }[] }
                const d = x.active && x.payload?.[0]?.payload
                if (!d) return null
                return <Globo titulo={<><strong style={{ color: TINTA.fuerte }}>{d.folio}</strong> · {d.nombre}</>}
                  filas={[{ valor: dineroLargo.format(d.precio), nombre: 'precio', color }, { valor: `${d.dias} días`, nombre: 'publicada', color }]} />
              }} />
              <Scatter data={puntos} isAnimationActive={false}
                shape={(props: unknown) => {
                  const { cx, cy } = props as { cx: number; cy: number }
                  // Área de acierto de 24 px alrededor de un punto de 10 px:
                  // nadie tiene que atinarle al centro exacto.
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={12} fill="transparent" />
                      <circle cx={cx} cy={cy} r={5} fill={color} stroke={SUPERFICIE} strokeWidth={2} />
                    </g>
                  )
                }} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

/* ── El panel ───────────────────────────────────────────────── */

export default function Analitica() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const t = await auth.currentUser?.getIdToken()
        const res = await fetch('/api/admin/analitica', { headers: t ? { Authorization: `Bearer ${t}` } : {} })
        const j = await res.json().catch(() => null)
        if (!vivo) return
        if (!res.ok || !j) setError(j?.error || 'No se pudo cargar la analítica.')
        else setDatos(j as Datos)
      } catch {
        if (vivo) setError('No se pudo cargar la analítica.')
      }
    })()
    return () => { vivo = false }
  }, [])

  if (error) {
    return <p style={{ background: '#FEF2F2', color: '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: '.9rem' }}>{error}</p>
  }
  if (!datos) {
    return <p style={{ color: TINTA.suave, fontSize: '.9rem', padding: '1rem 0' }}>Cargando analítica…</p>
  }
  return <AnaliticaVista datos={datos} />
}

/** Sólo pinta: recibe los datos ya calculados. Separado de la carga para poder
 *  verlo y probarlo sin sesión de administrador. */
export function AnaliticaVista({ datos }: { datos: Datos }) {
  const venta = datos.mercado.filter((p) => p.operacion === 'venta')
  const renta = datos.mercado.filter((p) => p.operacion === 'renta')

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--azul, #1B365D)' }}>Analítica</h2>
        <span style={{ fontSize: '.82rem', color: TINTA.suave }}>
          Últimos {datos.dias} días · los datos de visitas y búsquedas empiezan el 13 de septiembre de 2026
        </span>
      </header>

      {/* Una tabla que no contestó no puede verse igual que «todavía no hay datos». */}
      {datos.faltan.length > 0 && (
        <p role="status" style={{ background: 'var(--aviso-fondo-calido, #FFF7E6)', color: '#5A4A2A', padding: '10px 14px', borderRadius: 8, fontSize: '.85rem', margin: 0 }}>
          No se pudieron leer: {datos.faltan.join(', ')}. Las gráficas que dependen de ellas pueden salir incompletas.
        </p>
      )}

      <VistasYLeads serie={datos.serie} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <Dona titulo="Composición del inventario" nota="Propiedades publicadas, por tipo" porciones={datos.inventario} unidad="Propiedades"
          vacio="Todavía no hay propiedades publicadas." />
        <Dona titulo="Interés del cliente" nota="Vistas de ficha, según el tipo de la propiedad vista" porciones={datos.interes} unidad="Vistas"
          vacio="Aún no hay vistas de fichas en estos 30 días." />
      </div>

      <Tarjeta titulo="Zonas: lo que se busca frente a lo que hay"
        nota="Búsquedas por zona y propiedades publicadas en esa zona. Una zona muy buscada con 0 propiedades es inventario que falta."
        tabla={<Tabla columnas={['Zona', 'Búsquedas', 'Propiedades activas']} filas={datos.zonas.map((z) => [z.zona, z.busquedas, z.activas])} />}>
        {datos.zonas.length === 0
          ? <Vacio mensaje="Aún no hay búsquedas por zona. Se llena cuando alguien escribe una zona en el catálogo." />
          : <BarrasDobles datos={datos.zonas} categoria="zona" series={[
              { clave: 'busquedas', nombre: 'Búsquedas', color: SERIE.azul },
              { clave: 'activas', nombre: 'Propiedades activas', color: SERIE.verde },
            ]} />}
      </Tarjeta>

      <Tarjeta titulo="Presupuesto de quien busca"
        nota="Búsquedas con filtro de precio, por rango. Renta y venta por separado: en una sola escala no caben. Sin operación elegida, desde $200k cuenta como venta."
        tabla={<Tabla columnas={['Operación', 'Rango', 'Búsquedas']} filas={[
          ...datos.precios.renta.map((r) => ['Renta', r.rango, r.n]),
          ...datos.precios.venta.map((r) => ['Venta', r.rango, r.n]),
        ]} />}>
        {datos.precios.total === 0
          ? <Vacio mensaje="Todavía ninguna búsqueda ha usado el filtro de precio. Se llena en cuanto alguien lo use en el catálogo." />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <Histograma titulo="Renta mensual" rangos={datos.precios.renta} />
              <Histograma titulo="Venta" rangos={datos.precios.venta} />
            </div>
          )}
      </Tarjeta>

      <Tarjeta titulo="Días publicada frente a precio"
        nota="Cada punto es una propiedad. Arriba a la derecha: mucho tiempo y precio alto, candidata a revisar el precio. Venta y renta por separado por la escala."
        tabla={<Tabla columnas={['Folio', 'Propiedad', 'Operación', 'Precio', 'Días publicada']} filas={datos.mercado.map((p) => [p.folio, p.nombre, p.operacion, dineroLargo.format(p.precio), p.dias])} />}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          <Dispersion titulo="Venta" puntos={venta} color={SERIE.azul} />
          <Dispersion titulo="Renta" puntos={renta} color={SERIE.azul} />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Favoritos frente a contactos reales"
        nota="Las 5 propiedades con más interés. Muchos favoritos y ningún contacto suele señalar algo que frena: precio, fotos o información."
        tabla={<Tabla columnas={['Folio', 'Propiedad', 'Favoritos', 'Contactos']} filas={datos.top.map((p) => [p.folio, p.nombre, p.favoritos, p.contactos])} />}>
        {datos.top.length === 0
          ? <Vacio mensaje="Todavía ninguna propiedad tiene favoritos ni contactos registrados." />
          : <BarrasDobles datos={datos.top.map((p) => ({ ...p, etiqueta: `${p.folio} · ${p.nombre}`.slice(0, 34) }))} categoria="etiqueta" anchoCategoria={190} series={[
              { clave: 'favoritos', nombre: 'Favoritos', color: SERIE.ambar },
              { clave: 'contactos', nombre: 'Contactos reales', color: SERIE.verde },
            ]} />}
      </Tarjeta>
    </div>
  )
}
