'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSesion } from '@/components/admin/sesion'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Cargando, ErrorCaja, Kpi, Tabla, Tarjeta, fmt } from '@/components/admin/seo/ui'
import { Anillo } from '@/components/admin/GraficasPropias'

/**
 * Google Analytics 4 dentro de «Métricas» (solo Super Admin). Lee la API de datos de GA4 desde el servidor, sin claves (ver `lib/seo/ga4.ts`).
 * Es la visión de MARKETING: de dónde llegan las visitas, qué páginas se ven y qué acciones hacen las personas (clics en WhatsApp, llamadas, formularios).
 * No sustituye las gráficas de abajo, que salen de la base propia (precios, zonas, días en el mercado).
 */

type Resumen = {
  configurado: true; propiedad: string; dias: number
  totales: { usuarios: number; usuariosNuevos: number; sesiones: number; vistas: number; interaccion: number; duracionMedia: number }
  porDia: Array<{ fecha: string; usuarios: number; sesiones: number }>
  canales: Array<{ clave: string; a: number; b: number }>
  paginas: Array<{ clave: string; a: number; b: number }>
  eventos: Array<{ clave: string; a: number; b: number }>
}
type Respuesta = Resumen | { configurado: false; faltan: string[] }

/** Nombre claro de los eventos que el sitio manda a Analytics (los demás se ven con su nombre técnico). */
const EVENTO: Record<string, string> = {
  click_whatsapp: 'Clic en WhatsApp', click_phone: 'Clic en teléfono', click_email: 'Clic en correo', generate_lead: 'Formulario enviado (lead)',
  contact_started: 'Contacto iniciado', view_item: 'Propiedad vista', search: 'Búsqueda de propiedades', add_to_wishlist: 'Propiedad guardada',
  valuation_calculated: 'Valuador usado', page_view: 'Página vista', first_visit: 'Primera visita', session_start: 'Inicio de sesión de visita', scroll: 'Desplazamiento (90 %)',
}
const CLAVE_CONTACTO = ['click_whatsapp', 'click_phone', 'click_email', 'generate_lead']
const TICK = { fill: 'var(--panel-tenue)', fontSize: 11 }
const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)', 'var(--serie-5)', 'var(--serie-6)']
const corto = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const duracion = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`)

export default function GoogleAnalytics() {
  const { pedir, perfil } = useSesion()
  const [dias, setDias] = useState<7 | 28 | 90>(28)
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async (d: number) => {
    setCargando(true); setError('')
    try { setDatos(await pedir<Respuesta>(`/api/admin/analitica/ga?dias=${d}`)) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer Google Analytics.') } finally { setCargando(false) }
  }, [pedir])
  useEffect(() => { if (!perfil.superAdmin) return; const t = setTimeout(() => void cargar(dias), 0); return () => clearTimeout(t) }, [cargar, dias, perfil.superAdmin])

  if (!perfil.superAdmin) return null

  const r = datos && datos.configurado ? datos : null
  const contactos = r ? r.eventos.filter((e) => CLAVE_CONTACTO.includes(e.clave)) : []
  const dia = r ? r.porDia.map((p) => ({ etiqueta: p.fecha.slice(5), sesiones: p.sesiones, usuarios: p.usuarios })) : []
  const canales = r ? r.canales.slice(0, 6).map((c, i) => ({ nombre: c.clave, valor: c.a, color: SERIES[i % SERIES.length] })) : []
  const totalCanales = canales.reduce((s, c) => s + c.valor, 0)
  const paginas = r ? r.paginas.slice(0, 8).map((p) => ({ nombre: corto(p.clave), vistas: p.a })) : []
  const acciones = r ? r.eventos.filter((e) => EVENTO[e.clave] && !['page_view', 'session_start', 'first_visit', 'scroll'].includes(e.clave)).slice(0, 8).map((e) => ({ nombre: EVENTO[e.clave], veces: e.a })) : []

  return (
    <section aria-labelledby="titulo-ga" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titulo-ga" className="text-lg font-semibold">Google Analytics</h2>
          <p className="text-sm text-muted-foreground">De dónde llegan las visitas, qué ven y qué acciones hacen. Solo lo ve el Super Admin. Los datos de Google llegan con un pequeño retraso.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">Periodo
            <select className="rounded-md border bg-background px-2 py-1.5 text-sm" value={dias} aria-label="Periodo de Google Analytics" onChange={(e) => setDias(Number(e.target.value) as 7 | 28 | 90)}>
              <option value={7}>7 días</option><option value={28}>28 días</option><option value={90}>90 días</option>
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={() => void cargar(dias)} disabled={cargando} aria-label="Actualizar Google Analytics"><RefreshCw aria-hidden /> Actualizar</Button>
        </div>
      </div>

      {cargando && !datos && <Cargando />}
      {error && <ErrorCaja mensaje={error} reintentar={() => void cargar(dias)} />}
      {datos && !datos.configurado && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Google Analytics aún no está conectado en este entorno. Falta: {datos.faltan.join(', ')}.</p>
      )}

      {r && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi etiqueta="Visitantes" valor={fmt(r.totales.usuarios)} nota={`${fmt(r.totales.usuariosNuevos)} nuevos`} />
            <Kpi etiqueta="Visitas (sesiones)" valor={fmt(r.totales.sesiones)} />
            <Kpi etiqueta="Páginas vistas" valor={fmt(r.totales.vistas)} />
            <Kpi etiqueta="Interacción" valor={`${fmt(r.totales.interaccion, 1)} %`} nota="Visitas con interacción real" />
            <Kpi etiqueta="Tiempo por visita" valor={duracion(r.totales.duracionMedia)} />
          </div>

          <Tarjeta titulo="Contactos medidos" descripcion="Lo que más importa: personas que intentaron comunicarse. Si aquí hay ceros, revisa que el sitio ya esté enviando eventos a esta propiedad.">
            {contactos.length === 0
              ? <p className="text-sm text-muted-foreground">Todavía no hay clics de contacto ni formularios en este periodo.</p>
              : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{contactos.map((c) => <Kpi key={c.clave} etiqueta={EVENTO[c.clave] ?? c.clave} valor={fmt(c.a)} nota={`${fmt(c.b)} personas`} />)}</div>}
          </Tarjeta>

          <Tarjeta titulo="Visitas por día" descripcion="Visitas y personas por día. Una subida suele corresponder a una publicación, un anuncio o una propiedad nueva.">
            <div role="img" aria-label={`Visitas por día: ${fmt(dia.reduce((s, d) => s + d.sesiones, 0))} visitas en ${dia.length} días`}>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dia} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="var(--grafica-rejilla)" />
                    <XAxis dataKey="etiqueta" tick={TICK} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={42} />
                    <Tooltip />
                    <Area type="monotone" dataKey="sesiones" name="Visitas" stroke="var(--serie-1)" strokeWidth={2} fill="var(--serie-1)" fillOpacity={0.12} dot={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="usuarios" name="Personas" stroke="var(--serie-2)" strokeWidth={2} fill="var(--serie-2)" fillOpacity={0.12} dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: 'var(--serie-1)' }} aria-hidden />Visitas</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: 'var(--serie-2)' }} aria-hidden />Personas</span>
              </p>
            </div>
          </Tarjeta>

          <div className="grid gap-5 xl:grid-cols-2">
            <Tarjeta titulo="De dónde llegan, de un vistazo" descripcion="Cada canal con su parte del total de visitas.">
              {totalCanales === 0 ? <p className="text-sm text-muted-foreground">Sin visitas en este periodo.</p> : <Anillo datos={canales} etiqueta="Visitas por canal" total={totalCanales} />}
            </Tarjeta>
            <Tarjeta titulo="Qué hacen en el sitio" descripcion="Las acciones más frecuentes, con su nombre claro.">
              {acciones.length === 0 ? <p className="text-sm text-muted-foreground">Sin acciones en este periodo.</p> : (
                <div role="img" aria-label={`Acciones: ${acciones.map((a) => `${a.nombre} ${a.veces}`).join(', ')}`} style={{ height: Math.max(160, acciones.length * 34 + 20) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={acciones} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid horizontal={false} stroke="var(--grafica-rejilla)" />
                    <XAxis type="number" allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="nombre" width={150} tick={TICK} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'var(--muted)' }} />
                    <Bar dataKey="veces" name="Veces" fill="var(--serie-2)" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              )}
            </Tarjeta>
          </div>

          <Tarjeta titulo="Páginas más vistas, de un vistazo" descripcion="Las 8 con más vistas.">
            {paginas.length === 0 ? <p className="text-sm text-muted-foreground">Sin visitas en este periodo.</p> : (
              <div role="img" aria-label={`Páginas más vistas: ${paginas.map((p) => `${p.nombre} ${p.vistas}`).join(', ')}`} style={{ height: Math.max(160, paginas.length * 34 + 20) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paginas} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid horizontal={false} stroke="var(--grafica-rejilla)" />
                    <XAxis type="number" allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="nombre" width={200} tick={TICK} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'var(--muted)' }} />
                    <Bar dataKey="vistas" name="Vistas" fill="var(--serie-1)" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Tarjeta>

          <div className="grid gap-5 xl:grid-cols-2">
            <Tarjeta titulo="De dónde llegan">
              <Tabla etiqueta="Canales de adquisición" filas={r.canales} idDe={(f) => f.clave} vacio="Sin visitas en este periodo."
                columnas={[{ clave: 'c', titulo: 'Canal', celda: (f) => f.clave }, { clave: 's', titulo: 'Visitas', alinear: 'der', celda: (f) => fmt(f.a) }, { clave: 'u', titulo: 'Personas', alinear: 'der', celda: (f) => fmt(f.b) }]} />
            </Tarjeta>
            <Tarjeta titulo="Páginas más vistas">
              <Tabla etiqueta="Páginas más vistas" filas={r.paginas} idDe={(f) => f.clave} vacio="Sin visitas en este periodo."
                columnas={[{ clave: 'p', titulo: 'Página', celda: (f) => <span className="break-all">{f.clave}</span> }, { clave: 'v', titulo: 'Vistas', alinear: 'der', celda: (f) => fmt(f.a) }, { clave: 'u', titulo: 'Personas', alinear: 'der', celda: (f) => fmt(f.b) }]} />
            </Tarjeta>
          </div>

          <Tarjeta titulo="Acciones en el sitio" descripcion="Eventos que registra Google Analytics, con su nombre claro.">
            <Tabla etiqueta="Eventos de Google Analytics" filas={r.eventos} idDe={(f) => f.clave} vacio="Sin eventos en este periodo."
              columnas={[{ clave: 'e', titulo: 'Acción', celda: (f) => EVENTO[f.clave] ?? <code className="text-xs">{f.clave}</code> }, { clave: 'n', titulo: 'Veces', alinear: 'der', celda: (f) => fmt(f.a) }, { clave: 'u', titulo: 'Personas', alinear: 'der', celda: (f) => fmt(f.b) }]} />
          </Tarjeta>
        </>
      )}
    </section>
  )
}
