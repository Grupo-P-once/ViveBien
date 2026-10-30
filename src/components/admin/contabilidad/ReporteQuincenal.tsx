'use client'

import { useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/**
 * Reporte quincenal por Telegram (26-oct-2026). Cada quincena (el 1 y el 16, a las 9:00 hora de México) el sistema manda al grupo de avisos un resumen con cifras agregadas.
 * Aquí se ve exactamente lo que se mandaría (vista previa, sin enviar nada) y, si hace falta, se envía a mano. Enviar es hacia fuera y no se retira: pide confirmación.
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
type Vista = { alerta: { nivel: string; titulo: string; datos: Record<string, string>; accion?: string }; telegram: { configurado: boolean } }

export default function ReporteQuincenal({ pedir }: { pedir: Pedir }) {
  const [vista, setVista] = useState<Vista | null>(null)
  const [cargando, setCargando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  async function verVistaPrevia() {
    setCargando(true); setError('')
    try { setVista(await pedir<Vista>('/api/admin/contabilidad/reporte')) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo armar la vista previa.') } finally { setCargando(false) }
  }
  async function enviar() {
    setEnviando(true)
    try {
      await pedir('/api/admin/contabilidad/reporte', { method: 'POST', body: JSON.stringify({ confirmar: true }) })
      toast.success('Reporte enviado al grupo de avisos.')
      setConfirmando(false)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo enviar.') } finally { setEnviando(false) }
  }

  return (
    <section aria-labelledby="rq-titulo" className="rounded-xl border bg-card p-4 sm:p-5 print:hidden" data-reporte-quincenal>
      <h2 id="rq-titulo" className="font-heading text-base font-semibold">Reporte quincenal por Telegram</h2>
      <p className="mt-1 text-sm text-muted-foreground">El día 1 y el 16 de cada mes, a las 9:00 (hora de México), se manda al grupo de avisos el resumen de la quincena que acaba de terminar: ingresos, gastos, utilidad, mayor gasto y comisiones sin cobrar. Solo cifras agregadas, sin nombres ni conceptos.</p>
      <div className="mt-3"><Button type="button" variant="outline" size="sm" onClick={() => { void verVistaPrevia() }} disabled={cargando} data-vista-previa-reporte>{cargando ? <><Loader2 className="animate-spin" aria-hidden /> Armando…</> : 'Ver vista previa'}</Button></div>
      {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
      {vista && (
        <div className="mt-3 space-y-3" data-reporte-vista>
          <div className="max-w-md rounded-2xl border bg-muted/40 p-3 text-sm">
            <p className="font-semibold">{vista.alerta.titulo}</p>
            <ul className="mt-1 space-y-0.5">{Object.entries(vista.alerta.datos).map(([k, v]) => <li key={k}>· {k}: {v}</li>)}</ul>
            {vista.alerta.accion && <p className="mt-2">→ {vista.alerta.accion}</p>}
          </div>
          {!vista.telegram.configurado && <p role="status" className="text-xs text-amber-950">Telegram todavía no está configurado (falta el bot o el grupo de avisos): no se puede enviar.</p>}
          {vista.telegram.configurado && !confirmando && <Button type="button" size="sm" onClick={() => setConfirmando(true)} data-enviar-reporte><Send aria-hidden /> Enviar ahora al grupo</Button>}
          {confirmando && (
            <div role="alertdialog" aria-label="Confirmar el envío" className="max-w-md space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-confirmar-reporte>
              <p>Este mensaje llegará al grupo de avisos de Telegram y no se puede retirar. Si el sistema ya lo mandó solo, no se duplica.</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => { void enviar() }} disabled={enviando} data-confirmar-envio>{enviando ? <><Loader2 className="animate-spin" aria-hidden /> Enviando…</> : 'Sí, enviar'}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmando(false)} disabled={enviando}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
