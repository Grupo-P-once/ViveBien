'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { leerOpinion, type Veredicto } from '@/lib/contabilidad-opinion'

/**
 * Opinión del asesor de IA sobre un trato por cerrar (25-oct-2026, rediseñada el 26-oct), debajo de la calculadora de comisión. NO registra nada ni decide: lo que escribe es texto que
 * la persona lee y valora. El servidor recalcula la comisión con el mismo código de la calculadora y le pide al modelo un formato fijo (veredicto, por qué, qué ajustar); aquí se
 * muestra como una tarjeta con el veredicto a la vista. Si el modelo no sigue el formato, se muestra su texto tal cual, sin inventar un veredicto. La conversación completa vive en `ChatAsesor.tsx`.
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
type Respuesta = { texto: string; modelo: string; generado_en: string }

const ESTILO: Record<Veredicto, { clase: string; icono: typeof CheckCircle2; lectura: string }> = {
  Razonable: { clase: 'border-emerald-300 bg-emerald-50 text-emerald-950', icono: CheckCircle2, lectura: 'El trato se ve sano.' },
  'Conviene ajustar': { clase: 'border-amber-300 bg-amber-50 text-amber-950', icono: AlertTriangle, lectura: 'Tiene arreglo antes de cerrarlo.' },
  'Revisar con cuidado': { clase: 'border-red-300 bg-red-50 text-red-950', icono: TriangleAlert, lectura: 'Hay algo que conviene revisar antes de cerrar.' },
}

function Lista({ titulo, items, id }: { titulo: string; items: string[]; id: string }) {
  if (!items.length) return null
  return (
    <section aria-labelledby={id} data-bloque-opinion={id}>
      <h4 id={id} className="text-xs font-semibold uppercase tracking-wide text-[#4b5563]">{titulo}</h4>
      <ul className="mt-1 space-y-1.5">{items.map((t, i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[#8B1A1A]" /><span>{t}</span></li>)}</ul>
    </section>
  )
}

function Texto({ r }: { r: Respuesta }) {
  const o = leerOpinion(r.texto)
  const e = o.veredicto ? ESTILO[o.veredicto] : null
  const Icono = e?.icono
  const sinAjustes = o.ajustar.length > 0 && o.ajustar.every((x) => /^ninguno\.?$/i.test(x))
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3 text-sm shadow-sm" data-respuesta-ia>
      {o.veredicto && e && Icono ? (
        <>
          <p className={`flex items-center gap-2 rounded-lg border px-3 py-2 font-semibold ${e.clase}`} data-veredicto={o.veredicto}><Icono className="size-4 shrink-0" aria-hidden /><span>{o.veredicto}<span className="ml-2 font-normal">{e.lectura}</span></span></p>
          <Lista titulo="Por qué" items={o.porQue} id="op-porque" />
          <Lista titulo="Qué ajustar" items={sinAjustes ? [] : o.ajustar} id="op-ajustar" />
          {sinAjustes && <p className="text-xs text-muted-foreground">No sugiere ajustes.</p>}
          {o.resto.map((t, i) => <p key={i}>{t}</p>)}
        </>
      ) : (
        <div className="space-y-1.5" data-opinion-sin-formato>{o.resto.map((t, i) => <p key={i}>{t}</p>)}</div>
      )}
      <p className="border-t pt-2 text-xs text-muted-foreground">Generado por IA ({r.modelo}) a partir de tus cifras. Revísalo antes de decidir; no es asesoría fiscal ni legal: confírmalo con tu contador.</p>
    </div>
  )
}

/** Debajo de la calculadora de comisión: «¿qué opina el asesor de este trato?». Manda solo los términos escritos; el servidor recalcula y la IA lee cifras. */
export function OpinionDeLaIA({ cuerpo, pedir, listo }: { cuerpo: Record<string, unknown>; pedir: Pedir; listo: boolean }) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [resp, setResp] = useState<Respuesta | null>(null)

  async function opinar() {
    setCargando(true); setError(''); setResp(null)
    try { setResp(await pedir<Respuesta>('/api/admin/contabilidad/asesor', { method: 'POST', body: JSON.stringify({ modo: 'operacion', ...cuerpo }) })) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo consultar al asesor.') } finally { setCargando(false) }
  }

  return (
    <div className="space-y-2" data-opinion-ia>
      <Button type="button" variant="outline" className="w-full" disabled={!listo || cargando} onClick={() => { void opinar() }}>{cargando ? <><Loader2 className="animate-spin" aria-hidden /> Pensando…</> : <><Sparkles aria-hidden /> ¿Qué opina el asesor de este trato?</>}</Button>
      <div role="status" aria-live="polite">
        {error && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">{error}</p>}
        {resp && <Texto r={resp} />}
      </div>
    </div>
  )
}
