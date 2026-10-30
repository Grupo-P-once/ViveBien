'use client'

import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ETIQUETA_PERIODO, type Linea, type Periodo, type Rango } from '@/lib/contabilidad'
import { balanceGeneral, estadoDeResultados, estadosACsv, LIMITACIONES_DE_LOS_ESTADOS, PENDIENTES_PARA_EL_CONTADOR, rangoAnterior, variacion } from '@/lib/contabilidad-estados'
import { mxn } from './GraficasContables'
import ReporteQuincenal from './ReporteQuincenal'

/**
 * «Estados financieros» (26-oct-2026): Estado de Resultados (con comparativo contra el periodo anterior de la misma duración) y Balance General a hoy, con el orden de las NIF B-3 y B-6.
 * Son estados GERENCIALES armados con el libro: la tarjeta de límites dice lo que el sistema no sabe (bancos, IVA, ISR/PTU, activos fijos…) y qué le toca confirmar al contador.
 * Se descargan en CSV o se imprimen / guardan como PDF desde el navegador.
 */

const textoDeVariacion = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`)
const th = 'py-1 text-xs font-semibold text-muted-foreground'

type Fila = { clave: string; texto: string; actual: number; anterior?: number; nivel?: 0 | 1; fuerte?: boolean; resta?: boolean }

export default function EstadosFinancieros({ lineas, rango, periodo, hoy, pedir }: { lineas: Linea[]; rango: Rango; periodo: Periodo; hoy: string; pedir: <T>(ruta: string, opciones?: RequestInit) => Promise<T> }) {
  const er = useMemo(() => estadoDeResultados(lineas, rango), [lineas, rango])
  const previo = useMemo(() => { const r = rangoAnterior(rango); return r ? estadoDeResultados(lineas, r) : null }, [lineas, rango])
  const bg = useMemo(() => balanceGeneral(lineas, hoy), [lineas, hoy])
  const etiqueta = ETIQUETA_PERIODO[periodo]

  const filas: Fila[] = [
    { clave: 'ventas', texto: 'Comisiones por ventas', actual: er.ingresosPorVentas, anterior: previo?.ingresosPorVentas, nivel: 1 },
    { clave: 'rentas', texto: 'Comisiones por rentas', actual: er.ingresosPorRentas, anterior: previo?.ingresosPorRentas, nivel: 1 },
    ...(er.ingresosExternos > 0 || (previo?.ingresosExternos ?? 0) > 0 ? [{ clave: 'externas', texto: 'Comisiones externas (su parte)', actual: er.ingresosExternos, anterior: previo?.ingresosExternos, nivel: 1 as const }] : []),
    { clave: 'ingresos', texto: 'Ingresos totales', actual: er.ingresos, anterior: previo?.ingresos, fuerte: true },
    { clave: 'colab', texto: 'Costo: parte de colaboradores', actual: er.costoColaboradores, anterior: previo?.costoColaboradores, resta: true },
    { clave: 'bruta', texto: 'Utilidad bruta', actual: er.utilidadBruta, anterior: previo?.utilidadBruta, fuerte: true },
    { clave: 'promo', texto: 'Promoción (publicidad y fotografía)', actual: er.gastosDeVenta.promocion, anterior: previo?.gastosDeVenta.promocion, nivel: 1, resta: true },
    { clave: 'terceros', texto: 'Comisiones a terceros', actual: er.gastosDeVenta.comisionesATerceros, anterior: previo?.gastosDeVenta.comisionesATerceros, nivel: 1, resta: true },
    { clave: 'deop', texto: 'Gastos propios de las operaciones', actual: er.gastosDeVenta.deLasOperaciones, anterior: previo?.gastosDeVenta.deLasOperaciones, nivel: 1, resta: true },
    { clave: 'venta', texto: 'Gastos de venta', actual: er.gastosDeVenta.total, anterior: previo?.gastosDeVenta.total, resta: true },
    { clave: 'admin', texto: 'Gastos de administración', actual: er.gastosDeAdministracion, anterior: previo?.gastosDeAdministracion, resta: true },
    { clave: 'operacion', texto: 'Utilidad de operación', actual: er.utilidadDeOperacion, anterior: previo?.utilidadDeOperacion, fuerte: true },
    { clave: 'otros', texto: 'Otros ingresos', actual: er.otrosIngresos, anterior: previo?.otrosIngresos },
    { clave: 'antes', texto: 'Resultado antes de impuestos', actual: er.resultadoAntesDeImpuestos, anterior: previo?.resultadoAntesDeImpuestos, fuerte: true },
  ]

  function descargar() {
    const blob = new Blob([estadosACsv(er, bg, etiqueta)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `estados-financieros-vivebien-${hoy}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6" data-estados-financieros>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="max-w-3xl text-sm text-muted-foreground">El orden que te pedirá un contador o un banco, armado con tu libro. Son estados <strong>gerenciales</strong>: revisa los límites al final antes de entregarlos.</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={descargar} data-descargar-estados><Download aria-hidden /> CSV</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()} data-imprimir-estados><Printer aria-hidden /> Imprimir / PDF</Button>
        </div>
      </div>

      <section aria-labelledby="er-titulo" className="rounded-xl border bg-card p-4 sm:p-5" data-estado-de-resultados>
        <h2 id="er-titulo" className="font-heading text-lg font-semibold">Estado de resultados</h2>
        <p className="text-xs text-muted-foreground">VIVE BIEN · {etiqueta}{rango.desde ? ` (${rango.desde} a ${rango.hasta})` : ''} · en pesos mexicanos · por devengado{previo ? '' : ' · sin periodo anterior que comparar'}</p>
        <div className="mt-3 overflow-x-auto" role="region" tabIndex={0} aria-label="Estado de resultados (se desplaza a los lados)">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <caption className="sr-only">Estado de resultados del periodo</caption>
            <thead><tr><th scope="col" className={th}>Concepto</th><th scope="col" className={`${th} text-right`}>{etiqueta}</th>{previo && <><th scope="col" className={`${th} text-right`}>Periodo anterior</th><th scope="col" className={`${th} text-right`}>Variación</th></>}</tr></thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave} className={`border-t ${f.fuerte ? 'bg-muted/40 font-semibold' : ''}`} data-fila-er={f.clave}>
                  <th scope="row" className={`py-1.5 pr-2 font-[inherit] ${f.nivel ? 'pl-5 font-normal' : ''}`}>{f.resta ? '(−) ' : ''}{f.texto}</th>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{mxn(f.actual)}</td>
                  {previo && <><td className="py-1.5 pr-2 text-right tabular-nums">{mxn(f.anterior ?? 0)}</td><td className="py-1.5 text-right tabular-nums">{textoDeVariacion(variacion(f.actual, f.anterior ?? 0))}</td></>}
                </tr>
              ))}
              <tr className="border-t text-muted-foreground"><th scope="row" className="py-1.5 pr-2 font-normal">ISR y PTU</th><td className="py-1.5 text-right" colSpan={previo ? 3 : 1}>No calculado: lo determina el contador</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Margen bruto {er.margenBruto === null ? '—' : `${er.margenBruto} %`} · margen de operación {er.margenDeOperacion === null ? '—' : `${er.margenDeOperacion} %`} · margen antes de impuestos {er.margenNeto === null ? '—' : `${er.margenNeto} %`}, sobre los ingresos.</p>
      </section>

      <section aria-labelledby="bg-titulo" className="rounded-xl border bg-card p-4 sm:p-5" data-balance-general>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="bg-titulo" className="font-heading text-lg font-semibold">Balance general</h2>
            <p className="text-xs text-muted-foreground">VIVE BIEN · al {bg.al} · en pesos mexicanos · con todo lo registrado a la fecha</p>
          </div>
          {bg.cuadra
            ? <p className="flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-900" data-cuadra="si"><CheckCircle2 className="size-3.5" aria-hidden />Cuadra: activo = pasivo + capital</p>
            : <p role="alert" className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-950" data-cuadra="no"><AlertTriangle className="size-3.5" aria-hidden />No cuadra: diferencia de {mxn(bg.diferencia)}</p>}
        </div>
        <div className="mt-3 grid gap-6 md:grid-cols-2">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Activo</caption>
            <thead><tr><th scope="col" className={th}>Activo</th><th scope="col" className={`${th} text-right`}>Importe</th></tr></thead>
            <tbody>
              <tr className="border-t"><th scope="row" className="py-1.5 pr-2 pl-3 font-normal">Efectivo (estimado)</th><td className="py-1.5 text-right tabular-nums" data-bg="efectivo">{mxn(bg.activo.efectivoEstimado)}</td></tr>
              <tr className="border-t"><th scope="row" className="py-1.5 pr-2 pl-3 font-normal">Comisiones por cobrar</th><td className="py-1.5 text-right tabular-nums" data-bg="por-cobrar">{mxn(bg.activo.comisionesPorCobrar)}</td></tr>
              <tr className="border-t bg-muted/40 font-semibold"><th scope="row" className="py-1.5 pr-2 font-[inherit]">Total del activo</th><td className="py-1.5 text-right tabular-nums" data-bg="activo">{mxn(bg.activo.total)}</td></tr>
            </tbody>
          </table>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Pasivo y capital</caption>
            <thead><tr><th scope="col" className={th}>Pasivo y capital</th><th scope="col" className={`${th} text-right`}>Importe</th></tr></thead>
            <tbody>
              <tr className="border-t"><th scope="row" className="py-1.5 pr-2 pl-3 font-normal">Comisiones por pagar a colaboradores</th><td className="py-1.5 text-right tabular-nums" data-bg="colaboradores">{mxn(bg.pasivo.comisionesPorPagarAColaboradores)}</td></tr>
              <tr className="border-t font-semibold"><th scope="row" className="py-1.5 pr-2 font-[inherit]">Total del pasivo</th><td className="py-1.5 text-right tabular-nums">{mxn(bg.pasivo.total)}</td></tr>
              <tr className="border-t"><th scope="row" className="py-1.5 pr-2 pl-3 font-normal">Resultados acumulados</th><td className="py-1.5 text-right tabular-nums" data-bg="resultados">{mxn(bg.capital.resultadosAcumulados)}</td></tr>
              {bg.capital.movimientosConElGrupo !== 0 && <tr className="border-t" data-bg-fila="grupo"><th scope="row" className="py-1.5 pr-2 pl-3 font-normal">Movimientos de capital con empresas del grupo</th><td className="py-1.5 text-right tabular-nums" data-bg="grupo">{mxn(bg.capital.movimientosConElGrupo)}</td></tr>}
              <tr className="border-t font-semibold"><th scope="row" className="py-1.5 pr-2 font-[inherit]">Total del capital</th><td className="py-1.5 text-right tabular-nums">{mxn(bg.capital.total)}</td></tr>
              <tr className="border-t bg-muted/40 font-semibold"><th scope="row" className="py-1.5 pr-2 font-[inherit]">Total pasivo + capital</th><td className="py-1.5 text-right tabular-nums" data-bg="pasivo-capital">{mxn(bg.pasivoMasCapital)}</td></tr>
            </tbody>
          </table>
        </div>
        {bg.efectivoNegativo && <p role="alert" className="mt-3 flex items-start gap-2 text-xs text-amber-950" data-efectivo-negativo><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />El efectivo estimado sale negativo: faltan ingresos por registrar o hay gastos que no corresponden. Revisa el libro diario.</p>}
      </section>

      <ReporteQuincenal pedir={pedir} />

      <section aria-labelledby="lim-titulo" className="rounded-xl border bg-card p-4 sm:p-5" data-limites-estados>
        <h2 id="lim-titulo" className="font-heading text-base font-semibold">Qué NO son estos estados</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{LIMITACIONES_DE_LOS_ESTADOS.map((x) => <li key={x}>{x}</li>)}</ul>
        <h3 className="mt-4 text-sm font-semibold">Para confirmar con tu contador</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{PENDIENTES_PARA_EL_CONTADOR.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
    </div>
  )
}
