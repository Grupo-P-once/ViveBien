'use client'

import { useMemo, useState } from 'react'
import { calcularDesdeEntrada, cuerpoDeAjustes, entradaInicial, type EntradaCalculadora } from '@/lib/comision-formulario'
import { OpinionDeLaIA } from '@/components/admin/contabilidad/AsesorIA'
import { useSesion } from '@/components/admin/sesion'
import { CuentaDeLaOperacion, PanelAjustes } from './CalculadoraCierre'

/**
 * Calculadora libre (26-oct-2026): la misma cuenta que el formulario de cierre, pero sin propiedad y sin guardar nada. Sirve para simular un trato antes de
 * cerrarlo («¿y si lo dejamos en 4 %?», «¿y si lo compartimos 60/40 y hay 5 mil de publicidad?»). Para dejarlo registrado se usa «Registrar un cierre».
 */

const campo = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm'

export default function CalculadoraLibre() {
  const { pedir, perfil } = useSesion()
  const [entrada, setEntrada] = useState<EntradaCalculadora>(() => entradaInicial('venta', '', false))
  const [liberada, setLiberada] = useState(true)
  const cambiar = (c: Partial<EntradaCalculadora>) => setEntrada((e) => ({ ...e, ...c }))

  // En una simulación no hay origen ni acreditación que consultar: se supone que, si se comparte, el colaborador está acreditado (casilla) y la operación es atribuible.
  const resultado = useMemo(() => {
    const r = calcularDesdeEntrada(entrada, { participaEnOrigen: entrada.comparte, acreditacion: liberada ? 'verificado' : 'pendiente', atribuible: liberada })
    return { ...r, separaDeLaRegla: false, motivoValido: true }
  }, [entrada, liberada])

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" data-calculadora-libre>
      <div className="space-y-6">
        <section aria-labelledby="cl-datos" className="space-y-3">
          <h3 id="cl-datos" className="font-heading text-base font-semibold">La operación</h3>
          <fieldset>
            <legend className="mb-1 block text-xs font-semibold">¿Venta o renta?</legend>
            <div className="flex gap-4 text-sm">
              {(['venta', 'renta'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2"><input type="radio" name="cl-tipo" checked={entrada.tipo === t} onChange={() => cambiar({ tipo: t })} />{t === 'venta' ? 'Venta' : 'Renta'}</label>
              ))}
            </div>
          </fieldset>
          <div className="max-w-xs">
            <label htmlFor="cl-base" className="mb-1 block text-xs font-semibold">{entrada.tipo === 'venta' ? 'Precio total de la venta (MXN)' : 'Renta mensual (MXN)'}</label>
            <input id="cl-base" className={`${campo} tabular-nums`} inputMode="decimal" autoComplete="off" value={entrada.base} onChange={(e) => cambiar({ base: e.target.value })} placeholder={entrada.tipo === 'venta' ? '3,000,000' : '28,000'} />
          </div>
        </section>
        <PanelAjustes valor={entrada} onCambio={cambiar} participaEnOrigen={entrada.comparte} acreditacion={liberada ? 'verificado' : 'pendiente'} atribuible={liberada} resultado={resultado} />
        {entrada.comparte && (
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={liberada} onChange={(e) => setLiberada(e.target.checked)} data-supuesto-liberada />Suponer que el colaborador está acreditado y que la operación es atribuible a VIVE BIEN (si no, su parte queda retenida)</label>
        )}
      </div>
      <aside aria-label="Cuenta de la operación" className="space-y-3 lg:sticky lg:top-4">
        <CuentaDeLaOperacion resultado={resultado} valor={entrada} />
        {perfil.superAdmin && <OpinionDeLaIA pedir={pedir} listo={Boolean(resultado.calculo)} cuerpo={{ tipo: entrada.tipo, base_pesos: entrada.base, ...cuerpoDeAjustes(entrada, false) }} />}
        <p className="text-xs text-muted-foreground">Es una simulación: no se guarda nada. Para registrar el cierre de una propiedad usa «Registrar un cierre».</p>
      </aside>
    </div>
  )
}
