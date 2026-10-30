'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NEGOCIO } from '@/lib/config/negocio'
import { useSesion } from '@/components/admin/sesion'
import { SubirComprobante, VerComprobante } from '@/components/admin/contabilidad/SubirComprobante'
import { fechaLarga, textoDeConstancia, type MetodoDePago } from '@/lib/contabilidad-constancia'
import { fechaLocalISO } from '@/lib/contabilidad'

/**
 * Constancia de pago a un colaborador (26-oct-2026) — hoja membretada para imprimir o guardar como PDF. Solo Super Admin. Dice quién recibió, cuánto, cuándo, cómo y por qué
 * operación; si fue transferencia, el comprobante se agrega después y se abre desde aquí. No lleva datos fiscales: VIVE BIEN todavía no los ha dado y no se inventan.
 */

type Constancia = { id: string; folio: string; colaborador_nombre: string; metodo: MetodoDePago; referencia: string | null; comprobante: string | null; monto_centavos: number; fecha_pago: string; descripcion: string }

export default function ConstanciaPagina() {
  const { pedir, perfil } = useSesion()
  const { folio } = useParams<{ folio: string }>()
  const [c, setC] = useState<Constancia | null>(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [vuelta, setVuelta] = useState(0)
  const [hoy] = useState(() => fechaLocalISO())
  const recargar = useCallback(() => setVuelta((n) => n + 1), [])

  useEffect(() => {
    if (!perfil.superAdmin) return
    let vivo = true
    pedir<{ constancia: Constancia }>(`/api/admin/contabilidad/constancias/${encodeURIComponent(folio)}`)
      .then((r) => { if (vivo) { setC(r.constancia); setError('') } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar la constancia.') })
    return () => { vivo = false }
  }, [pedir, folio, vuelta, perfil.superAdmin])

  async function adjuntar(ruta: string | null) {
    if (!ruta || !c) return
    setGuardando(true)
    try { await pedir(`/api/admin/contabilidad/constancias/${c.id}`, { method: 'PATCH', body: JSON.stringify({ comprobante: ruta }) }); recargar() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el comprobante.') } finally { setGuardando(false) }
  }

  if (!perfil.superAdmin) return <main className="mx-auto w-full max-w-[900px] px-4 py-10"><p role="alert" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Esta pantalla es sólo para Super Admin.</p></main>

  const t = c ? textoDeConstancia({ folio: c.folio, fechaPago: c.fecha_pago, colaborador: c.colaborador_nombre, montoCentavos: c.monto_centavos, metodo: c.metodo, referencia: c.referencia, descripcion: c.descripcion, hayComprobante: !!c.comprobante }) : null

  return (
    <main className="mx-auto w-full max-w-[900px] space-y-4 px-4 py-6 sm:px-6">
      <style>{`@media print{body *{visibility:hidden}[data-constancia],[data-constancia] *{visibility:visible}[data-constancia]{position:absolute;left:0;top:0;width:100%;border:0!important;box-shadow:none!important}@page{margin:18mm}}`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="outline" size="sm"><Link href="/admin/contabilidad"><ArrowLeft aria-hidden /> Contabilidad</Link></Button>
        {c && <Button type="button" size="sm" onClick={() => window.print()} data-imprimir><Printer aria-hidden /> Imprimir / Guardar como PDF</Button>}
      </div>
      {error && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-error-constancia>{error}</p>}
      {!error && !c && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Cargando…</p>}

      {c && t && (
        <article data-constancia className="rounded-xl border bg-white p-6 text-[#1f2937] sm:p-10">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#8B1A1A] pb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo_transparent.png" alt="VIVE BIEN" className="h-14 w-auto" />
            <div className="text-right text-xs leading-relaxed text-[#4b5563]">
              <p className="font-semibold text-[#8B1A1A]">VIVE BIEN · Grupo inmobiliario</p>
              <p>León, Guanajuato</p>
              <p>vivebienn.com · {NEGOCIO.email}</p>
            </div>
          </header>

          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
            <div><h1 className="font-heading text-xl font-semibold sm:text-2xl">{t.titulo}</h1><p className="text-sm text-[#4b5563]">{t.subtitulo}</p></div>
            <div className="text-right text-sm"><p className="font-semibold tabular-nums" data-folio>{c.folio}</p><p className="text-xs text-[#4b5563]" data-fecha-emision>Emitida el {fechaLarga(hoy)}</p></div>
          </div>

          <div className="mt-5 space-y-3 text-sm leading-relaxed">{t.parrafos.map((p, i) => <p key={i}>{p}</p>)}</div>

          <dl className="mt-5 grid gap-x-6 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
            {t.datos.map(([k, v]) => <div key={k}><dt className="text-xs font-semibold text-[#4b5563]">{k}</dt><dd className="break-words">{v}</dd></div>)}
          </dl>

          <div className="mt-14 grid gap-10 text-center text-xs sm:grid-cols-2">
            <div><div className="border-t border-[#1f2937] pt-2">{t.firmas.entrego}</div></div>
            <div><div className="border-t border-[#1f2937] pt-2">{t.firmas.recibio}</div></div>
          </div>

          <p className="mt-8 text-[11px] text-[#4b5563]">Documento interno de control. No es un comprobante fiscal (CFDI) ni sustituye uno. Texto sin revisión legal.</p>

          {c.metodo === 'transferencia' && (
            <section className="mt-6 border-t pt-4 text-sm print:break-before-page" data-anexo>
              <h2 className="font-semibold">Anexo: comprobante de la transferencia</h2>
              {c.comprobante ? <p className="mt-1 print:hidden"><VerComprobante pedir={pedir} ruta={c.comprobante} texto="Abrir el comprobante" /></p> : <p className="mt-1 text-[#4b5563] print:hidden">Aún no se ha adjuntado. Agrégalo cuando lo tengas; se guarda aquí y en el libro.</p>}
              {c.comprobante && <p className="hidden text-xs text-[#4b5563] print:block">Comprobante archivado en el sistema (almacén privado).</p>}
            </section>
          )}
        </article>
      )}

      {c && c.metodo === 'transferencia' && !c.comprobante && (
        <div className="rounded-xl border bg-card p-4 print:hidden" data-adjuntar-tardio>
          <SubirComprobante pedir={pedir} valor={null} onCambio={(r) => { void adjuntar(r) }} etiqueta="Comprobante de la transferencia" ayuda={guardando ? 'Guardando…' : 'Se guarda en un almacén privado y queda ligado a esta constancia.'} />
        </div>
      )}
    </main>
  )
}
