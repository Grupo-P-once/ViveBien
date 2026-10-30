'use client'

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Tarjeta, fmt } from '@/components/admin/seo/ui'
import type { RendimientoPropiedad } from '@/lib/analitica-propiedades'

/**
 * Gráficas de «Mis métricas» (publicador y asociado), pensadas para leerse de un vistazo y sin saber de analítica:
 *  1. Embudo: de cuánta gente VIO tus propiedades, cuánta tocó un botón de contacto y cuánta pidió información (y, si tu cuenta atiende citas, cuántas citas).
 *  2. Cuáles propiedades se ven más (barras por propiedad: vistas frente a contactos).
 *  3. Cómo te contactan (WhatsApp, teléfono, correo) y cómo está tu cartera (publicadas, en revisión…), en anillos.
 *  4. Vistas por día (solo cuentas que atienden citas: el servidor decide si manda la serie).
 * Todo lleva su texto debajo: ninguna cifra vive solo en el color. Los colores salen de las series validadas para daltonismo del panel (`--serie-*`).
 */

type Totales = { vistas: number; contactos: number; solicitudes: number; citas: number }
type Dia = { dia: string; vistas: number; leads: number }

const TICK = { fill: 'var(--panel-tenue)', fontSize: 11 }
const C1 = 'var(--serie-1)'
const C2 = 'var(--serie-2)'
const C3 = 'var(--serie-3, #6b7280)'
const COLORES_ESTADO: Record<string, string> = { publicada: 'var(--serie-1)', en_revision: 'var(--serie-2)', borrador: 'var(--serie-3, #6b7280)', cambios_solicitados: '#b45309', rechazada: '#991b1b' }
const NOMBRE_ESTADO: Record<string, string> = { publicada: 'Publicadas', borrador: 'Borradores', en_revision: 'En revisión', cambios_solicitados: 'Con cambios pedidos', rechazada: 'Rechazadas' }

const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0)
const corto = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** El embudo no inventa etapas: cada barra es una cantidad medida; el porcentaje es contra las vistas. */
export function Embudo({ t, conCitas }: { t: Totales; conCitas: boolean }) {
  const etapas = [
    { clave: 'vistas', texto: 'Vieron tus propiedades', valor: t.vistas, color: C1, ayuda: 'Fichas abiertas (una por persona y propiedad)' },
    { clave: 'contactos', texto: 'Tocaron un botón de contacto', valor: t.contactos, color: C2, ayuda: 'WhatsApp, teléfono o correo' },
    { clave: 'solicitudes', texto: 'Pidieron información o una visita', valor: t.solicitudes, color: C3, ayuda: 'Con el formulario de la ficha' },
    ...(conCitas ? [{ clave: 'citas', texto: 'Pidieron una cita', valor: t.citas, color: '#b45309', ayuda: 'Los detalles están en «Citas recibidas»' }] : []),
  ]
  const max = Math.max(1, ...etapas.map((e) => e.valor))
  return (
    <ol className="space-y-3" aria-label="Embudo: de las vistas al contacto">
      {etapas.map((e) => (
        <li key={e.clave} data-etapa={e.clave}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-medium">{e.texto}</span>
            <span className="tabular-nums"><strong>{fmt(e.valor)}</strong>{e.clave !== 'vistas' && t.vistas > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({pct(e.valor, t.vistas)} % de las vistas)</span>}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-3 rounded-full" style={{ width: `${e.valor > 0 ? Math.max(3, Math.round((e.valor / max) * 100)) : 0}%`, background: e.color }} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{e.ayuda}</p>
        </li>
      ))}
    </ol>
  )
}

export function Anillo({ datos, etiqueta, total }: { datos: Array<{ nombre: string; valor: number; color: string }>; etiqueta: string; total: number }) {
  const con = datos.filter((d) => d.valor > 0)
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative size-[132px] shrink-0" role="img" aria-label={`${etiqueta}: ${con.map((d) => `${d.nombre} ${d.valor}`).join(', ') || 'sin datos'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={con.length ? con : [{ nombre: 'Sin datos', valor: 1, color: 'var(--grafica-rejilla, #e5e7eb)' }]} dataKey="valor" nameKey="nombre" innerRadius={42} outerRadius={62} paddingAngle={con.length > 1 ? 2 : 0} isAnimationActive={false} stroke="none">
              {(con.length ? con : [{ color: 'var(--grafica-rejilla, #e5e7eb)' }]).map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            {con.length > 0 && <Tooltip formatter={(v, n) => [fmt(Number(v)), String(n)]} />}
          </PieChart>
        </ResponsiveContainer>
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-heading text-xl leading-none font-bold tabular-nums">{fmt(total)}</span>
          <span className="text-[0.65rem] text-muted-foreground">total</span>
        </span>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {datos.map((d) => (
          <li key={d.nombre} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{d.nombre}</span>
            <strong className="tabular-nums">{fmt(d.valor)}</strong>
            {total > 0 && <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{pct(d.valor, total)} %</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Ranking({ filas }: { filas: RendimientoPropiedad[] }) {
  const datos = [...filas].sort((a, b) => b.vistas - a.vistas).slice(0, 8).map((f) => ({ nombre: corto(f.nombre), vistas: f.vistas, contactos: f.contactos + f.solicitudes }))
  if (datos.length === 0 || datos.every((d) => d.vistas === 0 && d.contactos === 0)) return <p className="text-sm text-muted-foreground">Cuando tus propiedades reciban vistas, aquí verás cuáles se ven más.</p>
  return (
    <div role="img" aria-label={`Vistas y contactos por propiedad: ${datos.map((d) => `${d.nombre}, ${d.vistas} vistas y ${d.contactos} contactos`).join('; ')}`}>
      <div style={{ height: Math.max(160, datos.length * 44 + 30) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke="var(--grafica-rejilla)" />
            <XAxis type="number" allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="nombre" width={140} tick={TICK} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: 'var(--muted)' }} />
            <Bar dataKey="vistas" name="Vistas" fill={C1} radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={12} />
            <Bar dataKey="contactos" name="Contactos e interesados" fill={C2} radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: C1 }} aria-hidden />Vistas</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: C2 }} aria-hidden />Contactos e interesados</span>
      </p>
    </div>
  )
}

function PorDia({ serie }: { serie: Dia[] }) {
  const datos = serie.map((p) => ({ etiqueta: p.dia.slice(5), vistas: p.vistas, interesados: p.leads }))
  const total = datos.reduce((s, d) => s + d.vistas, 0)
  return (
    <div role="img" aria-label={`Vistas por día: ${fmt(total)} en ${datos.length} días`}>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={datos} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="var(--grafica-rejilla)" />
            <XAxis dataKey="etiqueta" tick={TICK} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={42} />
            <Tooltip />
            <Area type="monotone" dataKey="vistas" name="Vistas" stroke={C1} strokeWidth={2} fill={C1} fillOpacity={0.12} dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="interesados" name="Interesados" stroke={C2} strokeWidth={2} fill={C2} fillOpacity={0.12} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: C1 }} aria-hidden />Vistas</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: C2 }} aria-hidden />Interesados (piden información)</span>
      </p>
    </div>
  )
}

export default function GraficasPropias({ totales, filas, porEstado, porDia, dias }: {
  totales: Totales
  filas: RendimientoPropiedad[]
  porEstado?: Record<string, number>
  /** Solo si el servidor la mandó (cuentas que atienden citas). */
  porDia?: Dia[] | null
  dias: number
}) {
  const canales = [
    { nombre: 'WhatsApp', valor: filas.reduce((s, f) => s + f.whatsapp, 0), color: C1 },
    { nombre: 'Teléfono', valor: filas.reduce((s, f) => s + f.telefono, 0), color: C2 },
    { nombre: 'Correo', valor: filas.reduce((s, f) => s + f.correo, 0), color: C3 },
  ]
  const estados = Object.entries(porEstado ?? {}).map(([e, n]) => ({ nombre: NOMBRE_ESTADO[e] ?? e, valor: n, color: COLORES_ESTADO[e] ?? C3 }))
  const totalCanales = canales.reduce((s, c) => s + c.valor, 0)
  const totalEstados = estados.reduce((s, c) => s + c.valor, 0)

  return (
    <div className="space-y-5" data-graficas-propias>
      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta titulo="De las vistas al contacto" descripcion={`Lo que pasó en los últimos ${dias} días con todas tus propiedades juntas.`}>
          <Embudo t={totales} conCitas={porDia != null} />
        </Tarjeta>
        <Tarjeta titulo="Qué propiedades se ven más" descripcion="Las 8 con más vistas, y cuánta gente se comunicó por cada una.">
          <Ranking filas={filas} />
        </Tarjeta>
      </div>
      {porDia && porDia.length > 0 && (
        <Tarjeta titulo="Vistas día por día" descripcion="Para ver si un anuncio nuevo o una publicación en redes mueve la aguja.">
          <PorDia serie={porDia} />
        </Tarjeta>
      )}
      <div className={porEstado ? 'grid gap-5 lg:grid-cols-2' : 'grid gap-5'}>
        <Tarjeta titulo="Cómo te contactan" descripcion="Botones tocados en tus propiedades, por canal.">
          {totalCanales === 0 ? <p className="text-sm text-muted-foreground">Todavía nadie ha tocado un botón de contacto en este periodo.</p> : <Anillo datos={canales} etiqueta="Canales de contacto" total={totalCanales} />}
        </Tarjeta>
        {porEstado && (
          <Tarjeta titulo="Estado de tus propiedades" descripcion="En qué punto está cada propiedad que subiste.">
            {totalEstados === 0 ? <p className="text-sm text-muted-foreground">Aún no has subido ninguna propiedad.</p> : <Anillo datos={estados} etiqueta="Cartera por estado" total={totalEstados} />}
          </Tarjeta>
        )}
      </div>
    </div>
  )
}
