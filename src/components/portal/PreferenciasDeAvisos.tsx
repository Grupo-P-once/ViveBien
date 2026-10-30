'use client'

import { useEffect, useState } from 'react'
import { BellRing, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useSesion } from '@/components/admin/sesion'
import { fechaCorta } from '@/lib/admin/formato'

/**
 * «Cómo quiero que me avisen» (28-oct-2026): las dos preferencias de correo del cliente, con su consentimiento a la vista.
 *  · Alertas de búsquedas por correo: NACEN APAGADAS. Encenderlas es el consentimiento (queda la fecha). Un solo resumen, nunca un correo por propiedad, con baja en un clic.
 *  · Cambios de Términos y Aviso de Privacidad: son avisos de servicio y nacen encendidos; se pueden apagar.
 * Lo que se muestra es lo que respondió el servidor (no lo que se tocó).
 */
type Preferencias = { correoAlertas: boolean; correoLegal: boolean; correoPrecio?: boolean; consentimientoEn: string | null; consentimientoPrecioEn?: string | null }

function Interruptor({ id, marcado, deshabilitado, onCambio, titulo, ayuda }: { id: string; marcado: boolean; deshabilitado: boolean; onCambio: (v: boolean) => void; titulo: string; ayuda: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-background p-4">
      <input id={id} type="checkbox" checked={marcado} disabled={deshabilitado} onChange={(e) => onCambio(e.target.checked)} className="mt-1 size-5 shrink-0 cursor-pointer accent-[#8B1A1A]" aria-describedby={`${id}-ayuda`} />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span id={`${id}-ayuda`} className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{ayuda}</span>
      </label>
    </div>
  )
}

export default function PreferenciasDeAvisos() {
  const { pedir } = useSesion()
  const [p, setP] = useState<Preferencias | null>(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vivo = true
    pedir<Preferencias>('/api/portal/preferencias').then((r) => { if (vivo) setP(r) }).catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron cargar tus preferencias.') })
    return () => { vivo = false }
  }, [pedir])

  async function guardar(cambio: Partial<Pick<Preferencias, 'correoAlertas' | 'correoLegal' | 'correoPrecio'>>) {
    setGuardando(true)
    try {
      const r = await pedir<Preferencias>('/api/portal/preferencias', { method: 'PUT', body: JSON.stringify(cambio) })
      setP(r)
      toast.success(cambio.correoPrecio === true ? 'Listo: te mandaremos un correo cuando baje de precio una propiedad con campana.' : cambio.correoPrecio === false ? 'Ya no te mandaremos correos de baja de precio.' : cambio.correoAlertas === true ? 'Listo: te avisaremos por correo.' : cambio.correoAlertas === false ? 'Ya no te mandaremos alertas por correo.' : 'Preferencia guardada.')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar.') }
    setGuardando(false)
  }

  return (
    <section aria-labelledby="pref-avisos" className="rounded-xl border bg-card p-5" data-preferencias-avisos>
      <h2 id="pref-avisos" className="flex items-center gap-2 font-heading text-[1.02rem] font-semibold"><BellRing className="size-4" aria-hidden />Cómo quiero que me avisen</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">Aquí dentro siempre verás tus avisos. Esto decide si además te los mandamos por correo.</p>
      {error && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}
      {!p && !error && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Cargando…</p>}
      {p && (
        <div className="space-y-3">
          <Interruptor id="pref-correo-alertas" marcado={p.correoAlertas} deshabilitado={guardando} onCambio={(v) => { void guardar({ correoAlertas: v }) }}
            titulo="Recibir por correo las propiedades nuevas de mis búsquedas"
            ayuda={<>Un solo resumen cuando haya algo nuevo en las búsquedas donde pulsaste «Avisarme». Sin publicidad, y con un enlace para dejar de recibirlo.{p.correoAlertas && p.consentimientoEn ? <> <strong className="text-foreground">Activado el {fechaCorta(p.consentimientoEn)}.</strong></> : null}</>} />
          {/* BORRADOR PARA REVISIÓN: texto del consentimiento del correo de baja de precio. Apagado por defecto; requiere la migración 60 y aprobación del dueño antes de publicarse. */}
          <Interruptor id="pref-correo-precio" marcado={p.correoPrecio === true} deshabilitado={guardando} onCambio={(v) => { void guardar({ correoPrecio: v }) }}
            titulo="Recibir por correo cuando baje de precio una propiedad en la que pulsé la campana"
            ayuda={<>Un correo cuando detectemos una baja de precio, solo de las propiedades donde pulsaste «Avisarme cuando baje de precio». Sin publicidad, y con un enlace para dejar de recibirlo.{p.correoPrecio && p.consentimientoPrecioEn ? <> <strong className="text-foreground">Activado el {fechaCorta(p.consentimientoPrecioEn)}.</strong></> : null}</>} />
          <Interruptor id="pref-correo-legal" marcado={p.correoLegal} deshabilitado={guardando} onCambio={(v) => { void guardar({ correoLegal: v }) }}
            titulo="Avisarme por correo si cambian los Términos o el Aviso de Privacidad"
            ayuda="Solo cuando de verdad cambien las condiciones de tu cuenta. Siempre los verás también aquí."/>
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />Tu correo solo se usa para esto. Puedes cambiarlo cuando quieras.</p>
        </div>
      )}
    </section>
  )
}
