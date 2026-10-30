'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSesion } from '@/components/admin/sesion'
import type { Bloque, Celda, DiaDeSerie, FiltroGrupo, Resultado, Tasa } from '@/lib/correo/metricas'

/**
 * «Resultados de correo»: tarjetas arriba, gráficas por día y tablas de detalle debajo. Todo viene de /api/admin/marketing/metricas (el servidor calcula y decide
 * qué se oculta). Lo REAL y los DATOS DE EJEMPLO nunca se mezclan: el interruptor cambia de fuente y cada gráfica lleva su rótulo. Las gráficas se dibujan SIEMPRE
 * (con ceros si no hubo actividad); lo que depende del webhook de Resend y no se puede medir se marca «No disponible» (no se dibuja como cero). Cada gráfica trae su
 * tabla de datos (accesible y útil en móvil) y nada vive solo en el color.
 */
type Origen = { tipo: 'real' | 'demostracion'; entorno: 'produccion' | 'preview_staging'; descripcion: string }
type Respuesta = {
  zona: string; hoy: string
  origen: Origen
  disponible?: boolean; explicacion?: string
  fuentes?: { webhookConfigurado: boolean | null; eventosDelProveedor: number | null; truncado: boolean }
  resultado?: Resultado
  definiciones: Array<{ metrica: string; definicion: string; fuente: string }>
  noDisponibles: Array<{ metrica: string; motivo: string }>
  nombresDeTipo: Record<string, string>
}

const TITULO: Record<'servicio' | 'promocional', { nombre: string; texto: string }> = {
  servicio: { nombre: 'Correos de servicio o seguridad', texto: 'Bienvenida, avisos que la persona pidió y notificaciones necesarias. No requieren consentimiento de marketing.' },
  promocional: { nombre: 'Correos promocionales', texto: 'Requieren consentimiento y respetan bajas y preferencias. Una baja promocional deja una supresión: no se le vuelve a escribir propaganda.' },
}
const TICK = { fill: 'var(--panel-tenue)', fontSize: 11 }
const ND = 'No disponible'
const v = (c: Celda | null) => (c === null ? ND : String(c))
const celdaTabla = (n: number | null | undefined) => (n === null || n === undefined ? ND : n)
const dia = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const suma = (xs: Array<number | null | undefined>) => xs.reduce<number>((a, x) => a + (x ?? 0), 0)

function Tarjeta({ etiqueta, valor, ayuda }: { etiqueta: string; valor: string; ayuda?: string }) {
  const noDisp = valor === ND
  return (
    <div className="rounded-lg border bg-background p-3" data-no-disponible={noDisp ? 'true' : undefined}>
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      <dd className={`mt-1 font-bold tabular-nums ${noDisp ? 'text-base text-muted-foreground' : 'text-2xl'}`}>{valor}</dd>
      {ayuda && <p className="mt-1 text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  )
}

function TarjetaTasa({ t }: { t: Tasa }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <dt className="text-xs font-medium text-muted-foreground">{t.nombre}</dt>
      <dd className={`mt-1 font-bold tabular-nums ${t.valor === null ? 'text-base text-muted-foreground' : 'text-2xl'}`}>{t.valor === null ? ND : `${t.valor}%`}</dd>
      <p className="mt-1 text-xs text-muted-foreground">Fórmula: {t.formula}{t.valor !== null ? ` (${v(t.numerador)} ÷ ${t.denominador})` : ''}.</p>
      {t.motivoSinDato && <p className="mt-1 text-xs text-muted-foreground">{t.motivoSinDato}</p>}
    </div>
  )
}

function Grafico({ titulo, resumen, rotulo, avisos, children, tabla }: { titulo: string; resumen: string; rotulo: string; avisos: string[]; children: React.ReactNode; tabla: React.ReactNode }) {
  return (
    <figure className="rounded-lg border bg-background p-3" data-grafica={titulo}>
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{titulo}</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${rotulo.startsWith('Datos de ejemplo') ? 'border-violet-300 bg-violet-50 text-violet-950' : 'bg-card'}`}>{rotulo}</span>
      </figcaption>
      {avisos.map((a) => <p key={a} role="note" data-aviso-grafica className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">{a}</p>)}
      <div role="img" aria-label={`${titulo}. ${resumen}`} className="mt-2 h-56 w-full">{children}</div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium">Ver los datos en tabla</summary>
        <div className="mt-2 max-h-64 overflow-auto">{tabla}</div>
      </details>
    </figure>
  )
}

function Tabla({ cabeceras, filas, nombre }: { cabeceras: string[]; filas: Array<Array<string | number>>; nombre: string }) {
  return (
    <table className="w-full min-w-[320px] text-left text-xs">
      <caption className="sr-only">{nombre}</caption>
      <thead><tr className="border-b">{cabeceras.map((h) => <th key={h} scope="col" className="px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
      <tbody>{filas.map((f) => <tr key={String(f[0])} className="border-b">{f.map((c, i) => <td key={i} className="px-2 py-1 tabular-nums">{c}</td>)}</tr>)}</tbody>
    </table>
  )
}

function BloqueDeCorreo({ b, demo, sinWebhook }: { b: Bloque; demo: boolean; sinWebhook: boolean }) {
  const t = b.totales
  const info = TITULO[b.grupo]
  const sinEnvios = t.enviados === 0 && t.fallos === 0 && t.omitidos === 0 && t.pendientes === 0
  const serie: DiaDeSerie[] | null = b.serie
  const rotulo = demo ? 'Datos de ejemplo (sintéticos)' : 'Datos reales de esta base'
  const aviso = (que: string) => (sinWebhook ? [`${que}: no disponible. Falta el webhook de Resend en este entorno; no se dibuja como cero porque no es una medición.`] : [])
  const vacio = sinEnvios ? ['Sin envíos en este periodo: las barras están en cero porque no hubo actividad.'] : []
  const conBajas = b.grupo === 'promocional' && serie?.some((d) => d.bajas !== undefined)
  return (
    <section aria-labelledby={`r-${b.grupo}`} data-grupo={b.grupo} className="rounded-xl border bg-card p-5">
      <h3 id={`r-${b.grupo}`} className="font-heading text-base font-semibold">{info.nombre}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{info.texto}</p>
      {b.detalleOculto && <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Hay menos de 5 correos en este grupo: se ocultan las cifras y el detalle por día para no identificar a nadie.</p>}
      <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta etiqueta="Enviados" valor={v(t.enviados)} ayuda="Aceptados por Resend" />
        <Tarjeta etiqueta="Entregados" valor={v(t.entregados)} ayuda="Llegaron al servidor del destinatario" />
        <Tarjeta etiqueta="Rebotes" valor={v(t.rebotes)} ayuda="Rechazos permanentes" />
        <Tarjeta etiqueta="Fallos" valor={v(t.fallos)} ayuda="No salieron por un error" />
        <Tarjeta etiqueta="Omitidos" valor={v(t.omitidos)} ayuda="No se mandaron a propósito" />
        <Tarjeta etiqueta="Quejas de spam" valor={v(t.quejas)} ayuda="Marcados como spam" />
        {b.bajas && <Tarjeta etiqueta="Bajas en el periodo" valor={v(b.bajas.enPeriodo)} ayuda="Se dieron de baja de promocionales" />}
        {b.bajas && <Tarjeta etiqueta="Bajas vigentes" valor={v(b.bajas.vigentes)} ayuda="Hoy siguen dadas de baja" />}
      </dl>
      <h4 className="mt-4 text-sm font-semibold">Tasas del periodo</h4>
      <dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{b.tasas.map((x) => <TarjetaTasa key={x.id} t={x} />)}</dl>

      <h4 className="mt-5 text-sm font-semibold">Gráficas por día</h4>
      {!serie ? <p role="status" className="mt-2 text-sm text-muted-foreground">El detalle por día está oculto porque el grupo es muy pequeño.</p> : (
        <div className="mt-2 grid gap-4 lg:grid-cols-2">
          <Grafico titulo="Enviados y entregados por día" rotulo={rotulo} avisos={[...vacio, ...aviso('Entregados')]} resumen={`${suma(serie.map((d) => d.enviados))} enviados${sinWebhook ? '; entregados no disponible' : ` y ${suma(serie.map((d) => d.entregados))} entregados`} en el periodo.`}
            tabla={<Tabla nombre="Enviados y entregados por día" cabeceras={['Día', 'Enviados', 'Entregados']} filas={serie.map((d) => [d.dia, d.enviados, celdaTabla(d.entregados)])} />}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="dia" tickFormatter={dia} tick={TICK} minTickGap={16} /><YAxis allowDecimals={false} tick={TICK} width={32} domain={[0, (max: number) => Math.max(max, 4)]} /><Tooltip /><Legend />
                <Bar dataKey="enviados" name="Enviados" fill="var(--serie-1)" />{!sinWebhook && <Bar dataKey="entregados" name="Entregados" fill="var(--serie-2)" />}</BarChart>
            </ResponsiveContainer>
          </Grafico>
          <Grafico titulo="Rebotes, fallos y omitidos por día" rotulo={rotulo} avisos={[...vacio, ...aviso('Rebotes')]} resumen={`${sinWebhook ? 'Rebotes no disponible' : `${suma(serie.map((d) => d.rebotes))} rebotes`}, ${suma(serie.map((d) => d.fallos))} fallos y ${suma(serie.map((d) => d.omitidos))} omitidos.`}
            tabla={<Tabla nombre="Rebotes, fallos y omitidos por día" cabeceras={['Día', 'Rebotes', 'Fallos', 'Omitidos', 'Quejas']} filas={serie.map((d) => [d.dia, celdaTabla(d.rebotes), d.fallos, d.omitidos, celdaTabla(d.quejas)])} />}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="dia" tickFormatter={dia} tick={TICK} minTickGap={16} /><YAxis allowDecimals={false} tick={TICK} width={32} domain={[0, (max: number) => Math.max(max, 4)]} /><Tooltip /><Legend />
                {!sinWebhook && <Bar dataKey="rebotes" name="Rebotes" stackId="a" fill="#991b1b" />}<Bar dataKey="fallos" name="Fallos" stackId="a" fill="#b45309" /><Bar dataKey="omitidos" name="Omitidos" stackId="a" fill="var(--serie-3, #6b7280)" /></BarChart>
            </ResponsiveContainer>
          </Grafico>
          {conBajas && (
            <Grafico titulo="Bajas promocionales por día y acumuladas" rotulo={rotulo} avisos={[]} resumen={`${v(b.bajas?.enPeriodo ?? null)} bajas en el periodo; ${v(b.bajas?.vigentes ?? null)} vigentes.`}
              tabla={<Tabla nombre="Bajas promocionales por día y acumuladas" cabeceras={['Día', 'Bajas', 'Acumuladas']} filas={serie.map((d) => [d.dia, d.bajas ?? 0, d.bajasAcumuladas ?? 0])} />}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serie}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="dia" tickFormatter={dia} tick={TICK} minTickGap={16} /><YAxis allowDecimals={false} tick={TICK} width={32} domain={[0, (max: number) => Math.max(max, 4)]} /><Tooltip /><Legend />
                  <Bar dataKey="bajas" name="Bajas del día" fill="var(--serie-2)" /><Line dataKey="bajasAcumuladas" name="Acumuladas" stroke="var(--serie-1)" strokeWidth={2} dot={false} /></ComposedChart>
              </ResponsiveContainer>
            </Grafico>
          )}
        </div>
      )}
      {b.grupo === 'promocional' && b.bajas && <p className="mt-3 text-xs text-muted-foreground">Las bajas no se pueden atribuir a un tipo de correo, así que no cambian con el filtro «Tipo». «Acumuladas» parte de las {b.bajas.acumuladasAntes} bajas anteriores al periodo.</p>}
    </section>
  )
}

export default function Resultados({ entorno }: { entorno: string | null }) {
  const { pedir } = useSesion()
  const [rango, setRango] = useState<'7' | '30' | '90' | 'custom'>('30')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [tipo, setTipo] = useState('')
  const [grupo, setGrupo] = useState<FiltroGrupo>('todos')
  const [demo, setDemo] = useState(false)
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const puedeDemo = entorno !== null && entorno !== 'produccion'

  // Un rango personalizado incompleto no pide nada. Cada pedido reemplaza al anterior (el efecto cancela al cambiar un filtro).
  useEffect(() => {
    if (rango === 'custom' && (!desde || !hasta)) return
    let vivo = true
    const p = new URLSearchParams()
    if (rango === 'custom') { p.set('desde', desde); p.set('hasta', hasta) } else p.set('dias', rango)
    if (tipo) p.set('tipo', tipo)
    p.set('grupo', grupo)
    if (demo && puedeDemo) p.set('demo', '1')
    pedir<Respuesta>(`/api/admin/marketing/metricas?${p}`)
      .then((r) => { if (vivo) { setDatos(r); setError(''); setCargando(false) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los resultados.'); setCargando(false) } })
    return () => { vivo = false }
  }, [pedir, rango, desde, hasta, tipo, grupo, demo, puedeDemo])

  const r = datos?.resultado
  const esDemo = datos?.origen.tipo === 'demostracion'
  const sinWebhook = Boolean(r?.noDisponibles?.length)
  const campo = 'mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm'
  return (
    <section aria-labelledby="m-resultados" className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 id="m-resultados" className="font-heading text-lg font-semibold">Resultados de correo</h2>
        <p className="mt-1 text-sm text-muted-foreground">Cuántos correos salieron, cuántos llegaron y qué pasó con ellos. Los correos de servicio y los promocionales se muestran por separado.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Filtros de resultados">
        <label className="text-sm">Periodo
          <select className={campo} value={rango} onChange={(e) => setRango(e.target.value as typeof rango)}>
            <option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="custom">Fechas personalizadas</option>
          </select>
        </label>
        <label className="text-sm">Grupo de correo
          <select className={campo} value={grupo} onChange={(e) => setGrupo(e.target.value as FiltroGrupo)}>
            <option value="todos">Servicio y promocionales (por separado)</option><option value="servicio">Solo servicio o seguridad</option><option value="promocional">Solo promocionales</option>
          </select>
        </label>
        <label className="text-sm">Tipo de correo
          <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {(r?.tipos ?? []).map((t) => <option key={t.id} value={t.id}>{datos?.nombresDeTipo[t.id] ?? t.id}</option>)}
          </select>
        </label>
        <label className="text-sm">Campaña
          <select className={campo} value="" disabled aria-describedby="m-campana"><option value="">Todavía no hay campañas</option></select>
          <span id="m-campana" className="mt-1 block text-xs text-muted-foreground">Las campañas aún no existen.</span>
        </label>
        {rango === 'custom' && (
          <>
            <label className="text-sm">Desde<input type="date" className={campo} value={desde} max={hasta || datos?.hoy} onChange={(e) => setDesde(e.target.value)} /></label>
            <label className="text-sm">Hasta<input type="date" className={campo} value={hasta} min={desde} max={datos?.hoy} onChange={(e) => setHasta(e.target.value)} /></label>
          </>
        )}
      </div>
      {puedeDemo && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="size-4" />
          Datos de ejemplo (valores sintéticos, no reales; van aparte de los datos reales)
        </label>
      )}
      {error && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}
      {cargando && !datos ? <p role="status" className="text-sm text-muted-foreground">Cargando resultados…</p> : null}
      {datos && (
        <>
          <p role="status" data-origen={datos.origen.tipo} data-entorno={datos.origen.entorno} className={`rounded-lg border p-3 text-sm font-medium ${esDemo ? 'border-violet-300 bg-violet-50 text-violet-950' : datos.origen.entorno === 'produccion' ? 'bg-background' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
            {datos.origen.descripcion}
          </p>
          <p className="text-xs text-muted-foreground">Zona horaria: {datos.zona} (hora de VIVE BIEN). Periodo: {r ? `${r.periodo.desde} al ${r.periodo.hasta} (${r.periodo.dias} ${r.periodo.dias === 1 ? 'día' : 'días'})` : '—'}. Hoy es {datos.hoy}.</p>
          {sinWebhook && <p role="note" data-sin-webhook className="rounded-lg border bg-background p-3 text-sm">Resend todavía no avisa a este sistema (el webhook no está configurado aquí): <strong>entregados, rebotes y quejas de spam aparecen como «No disponible»</strong> y no se dibujan como cero. Enviados, fallos, omitidos y bajas sí se miden.</p>}
          {datos.fuentes?.eventosDelProveedor !== null && datos.fuentes?.eventosDelProveedor !== undefined && <p className="text-xs text-muted-foreground">Eventos del proveedor recibidos (últimos 90 días): {datos.fuentes.eventosDelProveedor}.</p>}
          {datos.fuentes?.truncado && <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">El periodo tiene tantas filas que se leyó solo una parte: acórtalo para ver cifras completas.</p>}
          {datos.disponible === false && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{datos.explicacion}</p>}
          {r && r.bloques.map((b) => <BloqueDeCorreo key={b.grupo} b={b} demo={esDemo} sinWebhook={sinWebhook} />)}
          <div className="rounded-lg border bg-background p-3 text-sm">
            <h3 className="font-semibold">Lo que todavía no se puede medir</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">{datos.noDisponibles.map((n) => <li key={n.metrica}><strong>{n.metrica}:</strong> {n.motivo}</li>)}</ul>
          </div>
          <details className="rounded-lg border bg-background p-3 text-sm">
            <summary className="cursor-pointer font-semibold">De dónde sale cada número</summary>
            <dl className="mt-2 space-y-2">{datos.definiciones.map((d) => <div key={d.metrica}><dt className="font-medium">{d.metrica}</dt><dd className="text-muted-foreground">{d.definicion} <em>Fuente: {d.fuente}</em></dd></div>)}</dl>
          </details>
        </>
      )}
    </section>
  )
}
