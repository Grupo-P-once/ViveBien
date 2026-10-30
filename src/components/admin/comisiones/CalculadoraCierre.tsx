'use client'

import { useId } from 'react'
import { AlertTriangle, Plus, X } from 'lucide-react'
import { centavosDePesos, centesimasDeMeses, LIMITES, puntosBaseDePorcentaje, type EstadoAcreditacion } from '@/lib/comision-calculo'
import EscalaDeRango from './EscalaDeRango'
import { ETIQUETA_ACREDITACION } from '@/lib/comision-acreditacion'
import {
  ATAJOS, CONCEPTOS_SUGERIDOS, descripcionDeComision, ESCALAS, MESES_RENTA_REGLA, PCT_COLABORADOR_REGLA, PCT_VENTA_REGLA,
  type CalculoDeEntrada, type EntradaCalculadora,
} from '@/lib/comision-formulario'
import { pesos } from './GraficasComisiones'

/**
 * Calculadora de cierres (26-oct-2026): tres piezas que comparten el formulario de «Registrar un cierre» y la pestaña «Calculadora».
 *  · `PanelAjustes`: el trato real. Comisión pactada (porcentaje de la venta o meses de la renta), si se comparte y en qué proporción, y los gastos.
 *  · `CuentaDeLaOperacion`: lo que ENTRA, lo que SALE y lo que QUEDA, con cifras en texto (ninguna cantidad vive solo en un color).
 *  · La regla (3.5 %, un mes, 50/50) es el punto de partida; separarse de ella es legítimo pero pide un motivo, que queda en la operación.
 *
 * Inspirado en cómo lo resuelven las calculadoras y los estados de comisión inmobiliarios: comisión bruta → parte del colega/referido → gastos → neto,
 * con el reparto pactado caso por caso (no existe un 50/50 «oficial» entre agentes en México).
 */

const campo = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm'
const etiqueta = 'mb-1 block text-xs font-semibold'
const chip = 'rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background'
const nuevoId = () => `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export function PanelAjustes({ valor, onCambio, participaEnOrigen, acreditacion, atribuible, resultado }: {
  valor: EntradaCalculadora
  onCambio: (cambios: Partial<EntradaCalculadora>) => void
  participaEnOrigen: boolean
  acreditacion: EstadoAcreditacion
  atribuible: boolean | null
  resultado: CalculoDeEntrada
}) {
  const id = useId()
  const venta = valor.tipo === 'venta'
  const cambiaGasto = (gid: string, c: Partial<{ concepto: string; monto: string }>) => onCambio({ gastos: valor.gastos.map((g) => (g.id === gid ? { ...g, ...c } : g)) })
  const agregarGasto = (concepto = '') => onCambio({ gastos: [...valor.gastos, { id: nuevoId(), concepto, monto: '' }] })

  return (
    <div className="space-y-6" data-panel-ajustes>
      <section aria-labelledby={`${id}-pactada`} className="space-y-3">
        <h3 id={`${id}-pactada`} className="font-heading text-base font-semibold">Comisión pactada</h3>
        {venta ? (
          <div>
            <label htmlFor={`${id}-pct`} className={etiqueta}>Porcentaje sobre el precio total</label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-28">
                <input id={`${id}-pct`} className={`${campo} pr-8 text-right tabular-nums`} inputMode="decimal" autoComplete="off" value={valor.pct} onChange={(e) => onCambio({ pct: e.target.value })} data-campo-pct />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden>%</span>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Porcentajes comunes">
                {ATAJOS.pctVenta.map((p) => <button key={p} type="button" className={chip} aria-pressed={valor.pct.trim() === p} onClick={() => onCambio({ pct: p })}>{p} %</button>)}
              </div>
            </div>
            <EscalaDeRango valor={puntosBaseDePorcentaje(valor.pct) === null ? null : (puntosBaseDePorcentaje(valor.pct) as number) / 100} escala={ESCALAS.venta} formato={(n) => `${n} %`} />
            <p className="mt-1 text-xs text-muted-foreground">Regla de VIVE BIEN: {PCT_VENTA_REGLA} % (la marca de la regleta). Si al final el porcentaje cambió, ajústalo aquí.</p>
          </div>
        ) : (
          <div>
            <label htmlFor={`${id}-meses`} className={etiqueta}>Meses de renta que se cobran</label>
            <div className="flex flex-wrap items-center gap-2">
              <input id={`${id}-meses`} className={`${campo} w-28 text-right tabular-nums`} inputMode="decimal" autoComplete="off" value={valor.meses} onChange={(e) => onCambio({ meses: e.target.value })} data-campo-meses />
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Meses comunes">
                {ATAJOS.mesesRenta.map((m) => <button key={m} type="button" className={chip} aria-pressed={valor.meses.trim() === m} onClick={() => onCambio({ meses: m })}>{m === '1' ? '1 mes' : `${m} meses`}</button>)}
              </div>
            </div>
            <EscalaDeRango valor={centesimasDeMeses(valor.meses) === null ? null : (centesimasDeMeses(valor.meses) as number) / 100} escala={ESCALAS.renta} formato={(n) => `${n} ${n === 1 ? 'mes' : 'meses'}`} />
            <p className="mt-1 text-xs text-muted-foreground">Regla de VIVE BIEN: {MESES_RENTA_REGLA} mes (la marca de la regleta).</p>
          </div>
        )}
      </section>

      <section aria-labelledby={`${id}-compartida`} className="space-y-3">
        <h3 id={`${id}-compartida`} className="font-heading text-base font-semibold">Comisión compartida</h3>
        <fieldset>
          <legend className={etiqueta}>¿Se comparte la comisión con otro agente o inmobiliaria?</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name={`${id}-comparte`} checked={valor.comparte} onChange={() => onCambio({ comparte: true })} data-comparte-si />Sí, se comparte</label>
            <label className="flex items-center gap-2"><input type="radio" name={`${id}-comparte`} checked={!valor.comparte} onChange={() => onCambio({ comparte: false })} data-comparte-no />No, es solo de VIVE BIEN</label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {participaEnOrigen ? 'El origen de la propiedad declara un agente o inmobiliaria colaboradora.' : 'El origen de la propiedad es trato directo (sin agente).'}
          </p>
        </fieldset>
        {valor.comparte && (
          <div>
            <label htmlFor={`${id}-col`} className={etiqueta}>Parte del colaborador (sobre la comisión total)</label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-28">
                <input id={`${id}-col`} className={`${campo} pr-8 text-right tabular-nums`} inputMode="decimal" autoComplete="off" value={valor.colPct} onChange={(e) => onCambio({ colPct: e.target.value })} data-campo-col />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden>%</span>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Repartos comunes">
                {ATAJOS.pctColaborador.map((p) => <button key={p} type="button" className={chip} aria-pressed={valor.colPct.trim() === p} onClick={() => onCambio({ colPct: p })}>{p} / {100 - Number(p)}</button>)}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Regla de VIVE BIEN: {PCT_COLABORADOR_REGLA} %. El reparto entre agentes se pacta caso por caso; el total que paga el cliente no cambia.</p>
            <p className="mt-2 text-xs text-muted-foreground" data-estado-colaborador>
              Para liberar su parte hacen falta la acreditación verificada ({ETIQUETA_ACREDITACION[acreditacion]}) y que la operación sea atribuible a VIVE BIEN{atribuible === null ? '' : atribuible ? ' (lo es)' : ' (no lo es)'}. Si falta algo, queda retenida.
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby={`${id}-gastos`} className="space-y-3">
        <h3 id={`${id}-gastos`} className="font-heading text-base font-semibold">Gastos de la operación <span className="text-xs font-normal text-muted-foreground">(opcional)</span></h3>
        <p className="text-xs text-muted-foreground">Lo que costó cerrar: fotografía, publicidad, gestoría… Salen de la parte de VIVE BIEN, no de la del colaborador. Sin nombres, teléfonos ni correos.</p>
        {valor.gastos.length > 0 && (
          <ul className="space-y-2" aria-label="Gastos">
            {valor.gastos.map((g, i) => (
              <li key={g.id} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2" data-gasto>
                <div><label htmlFor={`${g.id}-c`} className="sr-only">Concepto del gasto {i + 1}</label><input id={`${g.id}-c`} className={campo} maxLength={LIMITES.conceptoMax} placeholder="Concepto" autoComplete="off" value={g.concepto} onChange={(e) => cambiaGasto(g.id, { concepto: e.target.value })} /></div>
                <div><label htmlFor={`${g.id}-m`} className="sr-only">Monto del gasto {i + 1} en pesos</label><input id={`${g.id}-m`} className={`${campo} text-right tabular-nums`} inputMode="decimal" placeholder="$ 0.00" autoComplete="off" value={g.monto} onChange={(e) => cambiaGasto(g.id, { monto: e.target.value })} /></div>
                <button type="button" aria-label={`Quitar el gasto ${i + 1}`} className="inline-flex size-10 items-center justify-center rounded-lg border hover:bg-muted" onClick={() => onCambio({ gastos: valor.gastos.filter((x) => x.id !== g.id) })}><X className="size-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
        {valor.gastos.length < LIMITES.gastosMax && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Agregar un gasto">
            {CONCEPTOS_SUGERIDOS.map((c) => <button key={c} type="button" className={`${chip} inline-flex items-center gap-1`} onClick={() => agregarGasto(c === 'Otro' ? '' : c)}><Plus className="size-3" aria-hidden />{c}</button>)}
          </div>
        )}
      </section>

      {resultado.separaDeLaRegla && (
        <section aria-labelledby={`${id}-motivo`} className="space-y-2 rounded-lg border border-dashed p-3" data-ajuste-motivo>
          <h3 id={`${id}-motivo`} className="text-sm font-semibold">Estás cambiando la regla: ¿por qué?</h3>
          <label htmlFor={`${id}-mot`} className={etiqueta}>Motivo ({LIMITES.motivo.min} a {LIMITES.motivo.max} caracteres)</label>
          <textarea id={`${id}-mot`} className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" maxLength={LIMITES.motivo.max} value={valor.motivo} onChange={(e) => onCambio({ motivo: e.target.value })} placeholder="Ej.: se negoció 4 % con el propietario por la urgencia de la venta" />
          <p className="text-xs text-muted-foreground">Queda en la operación y en la bitácora. Una operación registrada no se edita: si algo cambia después, se anula y se registra otra.</p>
        </section>
      )}
    </div>
  )
}

/** Barra de cascada: de `desde` a `hasta` por ciento del total. Solo apoyo visual; la cifra va en texto. */
function Barra({ desde, hasta, color }: { desde: number; hasta: number; color: string }) {
  return (
    <div aria-hidden className="relative mb-1 h-1.5 w-full rounded-full bg-muted">
      <span className="absolute inset-y-0 rounded-full" style={{ left: `${Math.max(0, desde)}%`, width: `${Math.max(hasta - desde, 0.8)}%`, background: color }} />
    </div>
  )
}

function Fila({ nombre, valor, extra, dato, barra }: { nombre: React.ReactNode; valor: string; extra?: React.ReactNode; dato?: string; barra?: React.ReactNode }) {
  return (
    <div className="py-1.5 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-muted-foreground">{nombre}{extra}</span>
        <span className="shrink-0 tabular-nums" {...(dato ? { [dato]: '' } : {})}>{valor}</span>
      </div>
      {barra && <div className="mt-1">{barra}</div>}
    </div>
  )
}

export function CuentaDeLaOperacion({ resultado, valor }: { resultado: CalculoDeEntrada; valor: EntradaCalculadora }) {
  const c = resultado.calculo
  if (!c) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" data-cuenta-vacia>
        {resultado.error ? <p role="alert" className="flex items-start gap-2 text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{resultado.error}</p> : <p>Escribe {valor.tipo === 'venta' ? 'el precio total' : 'la renta mensual'} para ver la cuenta: lo que entra, lo que sale y lo que queda.</p>}
      </div>
    )
  }
  const colab = c.colaboradorCentavos + c.colaboradorRetenidoCentavos
  const sale = colab + c.gastosCentavos
  const parte = (v: number) => (c.totalCentavos > 0 ? (v / c.totalCentavos) * 100 : 0)
  const gastos = valor.gastos.filter((g) => g.concepto.trim() && g.monto.trim())
  // Cascada: la comisión total ocupa todo el ancho y cada salida se descuenta desde la derecha, hasta lo que queda.
  const pColab = parte(colab)
  const tramosGastos = gastos.reduce<Array<{ desde: number; hasta: number }>>((acc, g) => {
    const hasta = acc.length ? acc[acc.length - 1].desde : 100 - pColab
    return [...acc, { desde: hasta - parte(centavosDePesos(g.monto) ?? 0), hasta }]
  }, [])

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5" data-cuenta aria-live="polite">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cuenta de la operación</p>

      <div className="mt-3">
        <p className="text-xs text-muted-foreground">Entra · comisión total</p>
        <p className="font-heading text-3xl font-bold tabular-nums" data-calculo-total>{pesos(c.totalCentavos)}</p>
        <p className="text-xs text-muted-foreground" data-calculo-descripcion>{descripcionDeComision(c, pesos)}</p>
        <div className="mt-2"><Barra desde={0} hasta={100} color="var(--foreground)" /></div>
      </div>

      <div className="mt-3 divide-y">
        <div className="pb-1">
          <p className="pt-1 text-xs text-muted-foreground">Sale · {sale > 0 ? pesos(sale) : 'nada'}</p>
          {c.colaboradorPuntosBase !== null && (
            <Fila
              nombre={<>Colaborador ({c.colaboradorPuntosBase / 100} %)</>}
              extra={<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.colaboradorRetenidoCentavos > 0 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`} data-estado-reparto>{c.colaboradorRetenidoCentavos > 0 ? 'retenida' : 'liberable'}</span>}
              valor={pesos(colab)} dato="data-calculo-colaborador"
              barra={<Barra desde={100 - pColab} hasta={100} color="var(--serie-3, #eda100)" />}
            />
          )}
          {gastos.map((g, i) => <Fila key={g.id} nombre={`Gasto: ${g.concepto.trim()}`} valor={pesos(centavosDePesos(g.monto) ?? 0)} barra={<Barra desde={tramosGastos[i].desde} hasta={tramosGastos[i].hasta} color="var(--serie-2)" />} />)}
          {c.colaboradorPuntosBase === null && gastos.length === 0 && <p className="py-1.5 text-sm text-muted-foreground">Sin colaborador ni gastos.</p>}
        </div>
        <div className="pt-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold">Queda para VIVE BIEN</span>
            <span className="font-heading text-xl font-bold tabular-nums" data-calculo-neto>{pesos(c.netoViveBienCentavos)}</span>
          </div>
          <div className="mt-1"><Barra desde={0} hasta={parte(c.netoViveBienCentavos)} color="var(--serie-1)" /></div>
          <p className="text-right text-xs text-muted-foreground">{Math.round(parte(c.netoViveBienCentavos))} % de la comisión</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Antes de IVA y otros impuestos (el tratamiento lo define el contador). Regla {c.regla} (borrador){c.ajustada ? ': con ajustes sobre la regla' : ''}.
        {c.colaboradorRetenidoCentavos > 0 && ' La parte del colaborador no se libera hasta verificar su acreditación y la atribución.'}
      </p>
    </div>
  )
}
