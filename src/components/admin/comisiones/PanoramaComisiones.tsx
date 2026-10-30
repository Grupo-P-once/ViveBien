'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Kpi, Tarjeta } from '@/components/admin/seo/ui'
import ChatAsesor from '@/components/admin/contabilidad/ChatAsesor'
import { C_ENTRA, C_SALE, mxn } from '@/components/admin/contabilidad/GraficasContables'
import { construirLineas, ETIQUETA_PERIODO, fechaLocalISO, rangoDePeriodo, type MovimientoContable, type Periodo } from '@/lib/contabilidad'
import { construirPanorama, type FilaDeGrupo, type FilaDePropiedad } from '@/lib/contabilidad-panorama'
import type { OperacionComision } from '@/lib/comision-resumen'
import type { DatosDePropiedad } from '@/lib/contabilidad-servidor'

/**
 * «Panorama» de comisiones (26-oct-2026), solo Super Admin porque junta ingresos con gastos. Responde: ¿cuánto entra y por qué tipo de operación?, ¿en qué tipo de propiedad deja
 * más dinero?, ¿cuál gasta más en promoción?, ¿dónde rinde más cada peso? Todo lo calcula `lib/contabilidad-panorama.ts` con las MISMAS líneas del libro contable; aquí solo se
 * muestra. Cada gráfica trae sus cifras en una tabla y hay una tarjeta de comprobaciones que dice si los números cuadran. El asesor de IA lee este mismo panorama.
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
type Libro = { operaciones: OperacionComision[]; movimientos: MovimientoContable[]; etiquetasDePropiedad: Record<string, string>; propiedades: Record<string, DatosDePropiedad> }
const campo = 'h-9 rounded-lg border border-input bg-background px-3 text-sm'
const TICK = { fill: 'var(--panel-tenue, #6b7280)', fontSize: 11 }
const compacto = (c: number) => { const p = c / 100; return Math.abs(p) >= 1_000_000 ? `$${(p / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} M` : Math.abs(p) >= 1_000 ? `$${Math.round(p / 1_000).toLocaleString('es-MX')} mil` : `$${Math.round(p).toLocaleString('es-MX')}` }
const veces = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}×`)
const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`)

export default function PanoramaComisiones({ pedir }: { pedir: Pedir }) {
  const [libro, setLibro] = useState<Libro | null>(null)
  const [error, setError] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>('doce_meses')
  const [hoy] = useState(() => fechaLocalISO())

  useEffect(() => {
    let vivo = true
    pedir<Libro>('/api/admin/contabilidad/libro').then((r) => { if (vivo) setLibro(r) }).catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el panorama.') })
    return () => { vivo = false }
  }, [pedir])

  const p = useMemo(() => {
    if (!libro) return null
    const lineas = construirLineas({ operaciones: libro.operaciones, movimientos: libro.movimientos, etiquetasDePropiedad: libro.etiquetasDePropiedad })
    return construirPanorama(lineas, libro.propiedades ?? {}, { rango: rangoDePeriodo(periodo, hoy), hoy, formato: mxn })
  }, [libro, periodo, hoy])

  if (error) return <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-error-panorama>{error}</p>
  if (!p) return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Armando el panorama…</p>

  const t = p.totales
  const sinDatos = t.cierres === 0 && t.gastos === 0
  return (
    <div className="space-y-6" data-panorama>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">Todo junto: lo que entra por venta y renta, en qué se gasta, qué tipo de propiedad deja más y dónde rinde mejor cada peso invertido en promoción. Las cifras salen del libro contable.</p>
        <div><label htmlFor="panorama-periodo" className="mr-2 text-xs font-semibold">Periodo</label>
          <select id="panorama-periodo" className={campo} value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} data-panorama-periodo>
            {(Object.keys(ETIQUETA_PERIODO) as Periodo[]).map((k) => <option key={k} value={k}>{ETIQUETA_PERIODO[k]}</option>)}
          </select>
        </div>
      </div>

      {sinDatos ? (
        <Tarjeta titulo="Todavía no hay datos en este periodo"><p className="text-sm text-muted-foreground">Aquí aparecerán las comisiones que registres en «Registrar un cierre» y los gastos de «Contabilidad». Prueba con un periodo más amplio.</p></Tarjeta>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi etiqueta="Comisiones" valor={mxn(t.comision)} tono="bien" nota={`${t.cierres} ${t.cierres === 1 ? 'cierre' : 'cierres'} · ticket ${mxn(t.ticket)}`} />
            <Kpi etiqueta="Comisión neta" valor={mxn(t.comisionNeta)} nota={`Menos ${mxn(t.colaborador)} de colaboradores`} />
            <Kpi etiqueta="Gastos ligados" valor={mxn(t.gastos)} nota={`Promoción ${mxn(t.promocion)} · otros ${mxn(t.otrosGastos)}`} />
            <Kpi etiqueta="Utilidad de la empresa" valor={mxn(p.utilidadDeLaEmpresa)} tono={p.utilidadDeLaEmpresa < 0 ? 'mal' : 'bien'} nota={`Margen ${pct(t.margen)} · retorno ${veces(t.retorno)} por peso gastado`} />
          </div>

          {p.lecturas.length > 0 && (
            <Tarjeta titulo="Lo que dicen las cifras" descripcion="Lecturas automáticas con su cifra. Si la muestra es chica, lo dicen.">
              <ul className="space-y-2 text-sm" data-lecturas>
                {p.lecturas.map((l) => (
                  <li key={l.id} className="flex items-start gap-2">
                    {l.nivel === 'atencion' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-[#4b5563]" aria-hidden />}
                    <span><strong>{l.titulo}.</strong> {l.detalle}</span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}

          <Tarjeta titulo="Ingresos mes a mes" descripcion="Comisión de ventas y de rentas, y la utilidad de cada mes (últimos 12).">
            <Mensual p={p} />
          </Tarjeta>

          <div className="grid gap-4 lg:grid-cols-2">
            <Tarjeta titulo="Venta o renta: ¿qué deja más?" descripcion="Comisión cobrada y parte para colaboradores.">
              <table className="w-full text-left text-sm" data-por-operacion>
                <caption className="sr-only">Comisiones por tipo de operación</caption>
                <thead><tr className="text-xs text-muted-foreground"><th scope="col" className="py-1 pr-2 font-semibold">Operación</th><th scope="col" className="py-1 pr-2 text-right font-semibold">Cierres</th><th scope="col" className="py-1 pr-2 text-right font-semibold">Comisión</th><th scope="col" className="py-1 pr-2 text-right font-semibold">Ticket</th><th scope="col" className="py-1 text-right font-semibold">% del ingreso</th></tr></thead>
                <tbody>{p.porOperacion.map((o) => (
                  <tr key={o.clave} className="border-t"><th scope="row" className="py-1.5 pr-2 font-medium">{o.etiqueta}</th><td className="py-1.5 pr-2 text-right tabular-nums">{o.cierres}</td><td className="py-1.5 pr-2 text-right tabular-nums">{mxn(o.comision)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{mxn(o.ticket)}</td><td className="py-1.5 text-right tabular-nums">{pct(o.parteDelIngreso)}</td></tr>
                ))}</tbody>
              </table>
            </Tarjeta>
            <Tarjeta titulo="¿En qué se gasta?" descripcion="Gasto neto de devoluciones, por grupo.">
              <GastosPorGrupo p={p} />
            </Tarjeta>
          </div>

          <Tarjeta titulo="¿En qué tipo de propiedad deja más dinero?" descripcion="Comisión neta frente a lo gastado en promoción, por tipo. «Retorno» = comisión neta ÷ gasto.">
            <PorTipo filas={p.porTipoDePropiedad} />
          </Tarjeta>

          <div className="grid gap-4 lg:grid-cols-2">
            <Tarjeta titulo="Por zona" descripcion="Colonia de la propiedad.">
              <TablaDeGrupos filas={p.porZona.slice(0, 8)} vacio="Aún no hay propiedades con colonia registrada." dato="zona" />
            </Tarjeta>
            <Tarjeta titulo="Quién gasta más en promoción" descripcion="Propiedades con más inversión en publicidad y fotografía.">
              <TablaDePropiedades filas={p.masPromocion.slice(0, 6)} vacio="Todavía no hay gasto de promoción ligado a una propiedad." columna="promocion" />
            </Tarjeta>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Tarjeta titulo="Dónde conviene invertir: mejor retorno" descripcion="Por cada peso gastado, cuánta comisión neta dejó. Solo propiedades con gasto.">
              <TablaDePropiedades filas={p.mejorRetorno.slice(0, 5)} vacio="Aún no hay propiedades con gasto y comisión para comparar." columna="retorno" />
            </Tarjeta>
            <Tarjeta titulo="Dónde se está perdiendo: peor retorno" descripcion="Gasto alto frente a lo que dejó. Revisa antes de seguir invirtiendo.">
              <TablaDePropiedades filas={p.peorRetorno.slice(0, 5)} vacio="Aún no hay propiedades con gasto y comisión para comparar." columna="retorno" />
            </Tarjeta>
          </div>

          {p.gastoGeneral.total !== 0 && (
            <Tarjeta titulo="Gasto general (sin propiedad)" descripcion="Gastos que no se ligaron a una propiedad: restan a la utilidad de la empresa, no a la de una propiedad.">
              <ul className="space-y-1 text-sm" data-gasto-general>
                {p.gastoGeneral.porGrupo.map((g) => <li key={g.grupo} className="flex justify-between gap-3"><span>{g.etiqueta}</span><strong className="tabular-nums">{mxn(g.monto)}</strong></li>)}
                <li className="flex justify-between gap-3 border-t pt-1"><span className="font-semibold">Total</span><strong className="tabular-nums">{mxn(p.gastoGeneral.total)}</strong></li>
              </ul>
            </Tarjeta>
          )}

          <Tarjeta titulo="¿Los números cuadran?" descripcion="Comprobaciones automáticas: cada cifra de arriba se revisa por dos caminos distintos.">
            <ul className="space-y-2 text-sm" data-comprobaciones>
              {p.calidad.map((c) => (
                <li key={c.id} className="flex items-start gap-2" data-comprobacion={c.id} data-ok={c.ok ? 'si' : 'no'}>
                  {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />}
                  <span><strong>{c.titulo}.</strong> {c.detalle}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </>
      )}

      <Tarjeta titulo="Pregúntale al asesor sobre este panorama" descripcion="Lee exactamente estas cifras y las analiza: qué tipo de propiedad deja más, dónde invertir y qué no cuadra.">
        <ChatAsesor periodo={periodo} pedir={pedir} modo="panorama" />
      </Tarjeta>
    </div>
  )
}

function Mensual({ p }: { p: ReturnType<typeof construirPanorama> }) {
  const meses = p.mensual.filter((m) => m.venta > 0 || m.renta > 0 || m.promocion > 0 || m.otrosGastos > 0)
  if (!meses.length) return <p className="text-sm text-muted-foreground">Sin movimientos en los últimos 12 meses.</p>
  const datos = p.mensual.map((m) => ({ mes: m.etiqueta, Venta: m.venta / 100, Renta: m.renta / 100, Utilidad: m.utilidad / 100 }))
  return (
    <div data-panorama-mensual>
      <div role="img" aria-label={`Ingresos por mes. ${meses.map((m) => `${m.etiqueta}: venta ${mxn(m.venta)}, renta ${mxn(m.renta)}, utilidad ${mxn(m.utilidad)}`).join('; ')}`} style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grafica-rejilla)" />
            <XAxis dataKey="mes" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => compacto(Number(v) * 100)} />
            <Tooltip cursor={{ fill: 'var(--muted)' }} formatter={(v, n) => [mxn(Number(v) * 100), String(n)]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Venta" stackId="ing" fill={C_ENTRA} isAnimationActive={false} />
            <Bar dataKey="Renta" stackId="ing" fill="var(--serie-2, #3b82c4)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Utilidad" fill={C_SALE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Ver las cifras de cada mes</summary>
        <table className="mt-2 w-full max-w-2xl text-left">
          <caption className="sr-only">Venta, renta, gasto y utilidad por mes</caption>
          <thead><tr><th scope="col" className="pr-3 font-semibold">Mes</th><th scope="col" className="pr-3 text-right font-semibold">Venta</th><th scope="col" className="pr-3 text-right font-semibold">Renta</th><th scope="col" className="pr-3 text-right font-semibold">Promoción</th><th scope="col" className="pr-3 text-right font-semibold">Otros gastos</th><th scope="col" className="text-right font-semibold">Utilidad</th></tr></thead>
          <tbody>{meses.map((m) => (
            <tr key={m.mes}><th scope="row" className="pr-3 font-normal">{m.etiqueta}</th><td className="pr-3 text-right tabular-nums">{mxn(m.venta)}</td><td className="pr-3 text-right tabular-nums">{mxn(m.renta)}</td><td className="pr-3 text-right tabular-nums">{mxn(m.promocion)}</td><td className="pr-3 text-right tabular-nums">{mxn(m.otrosGastos)}</td><td className="text-right tabular-nums">{mxn(m.utilidad)}</td></tr>
          ))}</tbody>
        </table>
      </details>
    </div>
  )
}

function GastosPorGrupo({ p }: { p: ReturnType<typeof construirPanorama> }) {
  const filas = p.gastosPorGrupo.filter((g) => g.monto !== 0)
  if (!filas.length) return <p className="text-sm text-muted-foreground">Todavía no hay gastos en este periodo.</p>
  const max = Math.max(...filas.map((g) => Math.abs(g.monto)), 1)
  return (
    <ul className="space-y-3 text-sm" data-gastos-por-grupo>
      {filas.map((g) => (
        <li key={g.grupo}>
          <div className="flex justify-between gap-3"><span>{g.etiqueta}</span><strong className="tabular-nums">{mxn(g.monto)} <span className="font-normal text-muted-foreground">· {pct(g.parte)}</span></strong></div>
          <div className="mt-1 h-2 rounded-full bg-muted" aria-hidden><div className="h-2 rounded-full" style={{ width: `${Math.max(2, (Math.abs(g.monto) / max) * 100)}%`, background: 'var(--serie-1)' }} /></div>
        </li>
      ))}
    </ul>
  )
}

function PorTipo({ filas }: { filas: FilaDeGrupo[] }) {
  if (!filas.length) return <p className="text-sm text-muted-foreground">Aún no hay propiedades con tipo registrado para comparar.</p>
  const datos = filas.map((f) => ({ tipo: f.etiqueta, 'Comisión neta': f.comisionNeta / 100, Promoción: f.promocion / 100 }))
  return (
    <div data-por-tipo>
      <div role="img" aria-label={`Comisión neta y promoción por tipo de propiedad. ${filas.map((f) => `${f.etiqueta}: comisión neta ${mxn(f.comisionNeta)}, promoción ${mxn(f.promocion)}`).join('; ')}`} style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grafica-rejilla)" />
            <XAxis dataKey="tipo" tick={TICK} tickLine={false} axisLine={false} interval={0} />
            <YAxis tick={TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => compacto(Number(v) * 100)} />
            <Tooltip cursor={{ fill: 'var(--muted)' }} formatter={(v, n) => [mxn(Number(v) * 100), String(n)]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Comisión neta" fill={C_ENTRA} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Promoción" fill={C_SALE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 overflow-x-auto" role="region" tabIndex={0} aria-label="Comparativo por tipo de propiedad (se desplaza a los lados)">
        <TablaDeGrupos filas={filas} vacio="" dato="tipo" />
      </div>
    </div>
  )
}

function TablaDeGrupos({ filas, vacio, dato }: { filas: FilaDeGrupo[]; vacio: string; dato: string }) {
  if (!filas.length) return <p className="text-sm text-muted-foreground">{vacio}</p>
  return (
    <table className="w-full min-w-[34rem] text-left text-sm" data-tabla-grupos={dato}>
      <caption className="sr-only">Comparativo por {dato}</caption>
      <thead><tr className="text-xs text-muted-foreground"><th scope="col" className="py-1 pr-2 font-semibold capitalize">{dato}</th><th scope="col" className="py-1 pr-2 text-right font-semibold">Props.</th><th scope="col" className="py-1 pr-2 text-right font-semibold">Comisión neta</th><th scope="col" className="py-1 pr-2 text-right font-semibold">Gastos</th><th scope="col" className="py-1 pr-2 text-right font-semibold">Utilidad</th><th scope="col" className="py-1 text-right font-semibold">Retorno</th></tr></thead>
      <tbody>{filas.map((f) => (
        <tr key={f.clave} className="border-t"><th scope="row" className="py-1.5 pr-2 font-medium">{f.etiqueta}</th><td className="py-1.5 pr-2 text-right tabular-nums">{f.propiedades}</td><td className="py-1.5 pr-2 text-right tabular-nums">{mxn(f.comisionNeta)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{mxn(f.gastos)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{mxn(f.utilidad)}</td><td className="py-1.5 text-right tabular-nums">{veces(f.retorno)}</td></tr>
      ))}</tbody>
    </table>
  )
}

function TablaDePropiedades({ filas, vacio, columna }: { filas: FilaDePropiedad[]; vacio: string; columna: 'promocion' | 'retorno' }) {
  if (!filas.length) return <p className="text-sm text-muted-foreground">{vacio}</p>
  return (
    <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Tabla de propiedades (se desplaza a los lados)">
      <table className="w-full min-w-[28rem] text-left text-sm" data-tabla-propiedades={columna}>
        <caption className="sr-only">{columna === 'promocion' ? 'Propiedades con más promoción' : 'Propiedades por retorno'}</caption>
        <thead><tr className="text-xs text-muted-foreground"><th scope="col" className="py-1 pr-2 font-semibold">Propiedad</th><th scope="col" className="py-1 pr-2 text-right font-semibold">Promoción</th><th scope="col" className="py-1 pr-2 text-right font-semibold">Comisión neta</th><th scope="col" className="py-1 text-right font-semibold">Retorno</th></tr></thead>
        <tbody>{filas.map((f) => (
          <tr key={f.propiedadId} className="border-t"><th scope="row" className="py-1.5 pr-2 font-medium">{f.etiqueta}</th><td className="py-1.5 pr-2 text-right tabular-nums">{mxn(f.promocion)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{mxn(f.comisionNeta)}</td><td className="py-1.5 text-right tabular-nums">{veces(f.retorno)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  )
}
