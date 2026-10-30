'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NEGOCIO } from '@/lib/config/negocio'
import { useSesion } from '@/components/admin/sesion'
import { fechaDeOperacion, type OperacionComision } from '@/lib/comision-resumen'
import { fechaLarga, montoEnLetra, mxnTexto } from '@/lib/contabilidad-constancia'
import { fechaLocalISO } from '@/lib/contabilidad'

/**
 * Recibo de comisión (26-oct-2026) — hoja membretada para imprimir o guardar como PDF, desde «Operaciones». Dice de qué propiedad es la comisión, cuánto fue, cómo se reparte, si ya se
 * cobró y, si se pagó a un colaborador, la constancia de ese pago. Cualquier admin lo ve (la operación la conoce); los pagos a colaboradores vienen del libro y solo los ve Super Admin.
 * Documento interno de control: no es un comprobante fiscal (CFDI) y no lleva datos fiscales que VIVE BIEN todavía no ha dado.
 */

type Constancias = Record<string, { folio: string; colaborador_nombre: string; metodo: string }>
type Libro = { movimientos: Array<{ id: string; clase: string; operacion_id: string | null; monto_centavos: number; fecha: string }>; constancias?: Constancias }
const ESTADO = { registrada: 'Por cobrar', confirmada: 'Cobrada', anulada: 'Anulada' } as const

export default function ReciboDeComision() {
  const { pedir, perfil } = useSesion()
  const { id } = useParams<{ id: string }>()
  const [op, setOp] = useState<OperacionComision | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [libro, setLibro] = useState<Libro | null>(null)

  useEffect(() => {
    let vivo = true
    pedir<{ operaciones: OperacionComision[] }>('/api/admin/comision/operaciones')
      .then((r) => { if (vivo) setOp((r.operaciones ?? []).find((o) => o.id === id) ?? null) })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar la operación.') })
    return () => { vivo = false }
  }, [pedir, id])

  useEffect(() => {
    if (!perfil.superAdmin) return
    let vivo = true
    pedir<Libro>('/api/admin/contabilidad/libro').then((r) => { if (vivo) setLibro(r) }).catch(() => { /* sin libro solo faltan los pagos al colaborador */ })
    return () => { vivo = false }
  }, [pedir, perfil.superAdmin])

  const pagos = useMemo(() => {
    if (!libro || !op) return []
    return libro.movimientos.filter((m) => m.clase === 'pago_colaborador' && m.operacion_id === op.id).map((m) => ({ ...m, constancia: libro.constancias?.[m.id] ?? null }))
  }, [libro, op])

  const titulo = op ? `${op.propiedad_titulo || op.propiedad_id}${op.propiedad_folio ? ` (${op.propiedad_folio})` : ''}` : ''
  const colaborador = op ? op.colaborador_centavos + op.colaborador_retenido_centavos : 0
  const [hoy] = useState(() => fechaLocalISO())
  const cobroConfirmado = op?.estado === 'confirmada' && (op as OperacionComision & { estado_en?: string | null }).estado_en ? String((op as OperacionComision & { estado_en?: string | null }).estado_en).slice(0, 10) : null

  return (
    <main className="mx-auto w-full max-w-[900px] space-y-4 px-4 py-6 sm:px-6">
      <style>{`@media print{body *{visibility:hidden}[data-recibo],[data-recibo] *{visibility:visible}[data-recibo]{position:absolute;left:0;top:0;width:100%;border:0!important;box-shadow:none!important}@page{margin:18mm}}`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="outline" size="sm"><Link href="/admin/comisiones"><ArrowLeft aria-hidden /> Cierres y comisiones</Link></Button>
        {op && op.estado !== 'anulada' && <Button type="button" size="sm" onClick={() => window.print()} data-imprimir><Printer aria-hidden /> Imprimir / Guardar como PDF</Button>}
      </div>
      {error && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-error-recibo>{error}</p>}
      {op === undefined && !error && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Cargando…</p>}
      {op === null && <p role="alert" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground" data-recibo-no-existe>Esa operación no existe.</p>}
      {op && op.estado === 'anulada' && <p role="alert" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground" data-recibo-anulada>Esta operación está anulada: no se emite recibo.</p>}

      {op && op.estado !== 'anulada' && (
        <article data-recibo className="rounded-xl border bg-white p-6 text-[#1f2937] sm:p-10">
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
            <div><h1 className="font-heading text-xl font-semibold sm:text-2xl">Recibo de comisión</h1><p className="text-sm text-[#4b5563]">{op.tipo === 'venta' ? 'Venta' : 'Renta'} · {ESTADO[op.estado]}</p></div>
            <div className="text-right text-sm"><p className="font-semibold tabular-nums" data-referencia>Ref. {op.id.slice(0, 8).toUpperCase()}</p><p className="text-xs text-[#4b5563]" data-fecha-emision>Emitido el {fechaLarga(hoy)}</p></div>
          </div>

          <div className="mt-5 space-y-3 text-sm leading-relaxed">
            <p>
              VIVE BIEN hace constar que por la {op.tipo === 'venta' ? 'venta' : 'renta'} de <strong>{titulo}</strong>, cerrada el {fechaLarga(fechaDeOperacion(op))}, la comisión total fue de <strong>{mxnTexto(op.total_centavos)}</strong> ({montoEnLetra(op.total_centavos)}).
              {op.estado === 'confirmada' ? ' La comisión ya fue cobrada.' : ' La comisión está pendiente de cobro.'}
            </p>
            {colaborador > 0 && <p>De esa comisión, la parte que corresponde al agente colaborador es de <strong>{mxnTexto(colaborador)}</strong>{op.colaborador_retenido_centavos > 0 ? ' (retenida por ahora)' : ''}, y la parte de VIVE BIEN es de <strong>{mxnTexto(op.vivebien_centavos)}</strong>.</p>}
          </div>

          <dl className="mt-5 grid gap-x-6 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-semibold text-[#4b5563]">{op.tipo === 'venta' ? 'Precio final' : 'Renta base'}</dt><dd>{mxnTexto(op.base_centavos)}</dd></div>
            <div><dt className="text-xs font-semibold text-[#4b5563]">Comisión total</dt><dd>{mxnTexto(op.total_centavos)}</dd></div>
            <div><dt className="text-xs font-semibold text-[#4b5563]">Parte de VIVE BIEN</dt><dd>{mxnTexto(op.vivebien_centavos)}</dd></div>
            <div><dt className="text-xs font-semibold text-[#4b5563]">Parte del colaborador</dt><dd>{mxnTexto(colaborador)}</dd></div>
            <div><dt className="text-xs font-semibold text-[#4b5563]">Fecha de cierre</dt><dd>{fechaLarga(fechaDeOperacion(op))}</dd></div>
            <div><dt className="text-xs font-semibold text-[#4b5563]">Estado de cobro</dt><dd>{ESTADO[op.estado]}</dd></div>
            <div><dt className="text-xs font-semibold text-[#4b5563]">Operación registrada el</dt><dd>{fechaLarga(op.creado_en.slice(0, 10))}</dd></div>
            {cobroConfirmado && <div><dt className="text-xs font-semibold text-[#4b5563]">Cobro confirmado el</dt><dd data-fecha-cobro>{fechaLarga(cobroConfirmado)}</dd></div>}
          </dl>

          {pagos.length > 0 && (
            <section className="mt-5 text-sm" data-pagos-colaborador>
              <h2 className="font-semibold">Pagos al colaborador</h2>
              <ul className="mt-1 space-y-1">
                {pagos.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-1">
                    <span>{fechaLarga(p.fecha)} · {mxnTexto(p.monto_centavos)}{p.constancia ? ` · ${p.constancia.colaborador_nombre} · ${p.constancia.metodo === 'transferencia' ? 'transferencia' : 'efectivo'}` : ''}</span>
                    {p.constancia ? <Link className="text-xs underline print:no-underline" href={`/admin/contabilidad/constancia/${p.constancia.folio}`}>Constancia {p.constancia.folio}</Link> : <span className="text-xs text-[#4b5563]">sin constancia</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-14 grid gap-10 text-center text-xs sm:grid-cols-2">
            <div><div className="border-t border-[#1f2937] pt-2">VIVE BIEN</div></div>
            <div><div className="border-t border-[#1f2937] pt-2">Recibió</div></div>
          </div>

          <p className="mt-8 text-[11px] text-[#4b5563]">Documento interno de control. No es un comprobante fiscal (CFDI) ni sustituye uno; los importes son antes de IVA y otros impuestos. Texto sin revisión legal.</p>
        </article>
      )}
    </main>
  )
}
