'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSesion } from '@/components/admin/sesion'
import { fechaDeOperacion, historialDePropiedad, type OperacionComision } from '@/lib/comision-resumen'
import { pesos } from './GraficasComisiones'

/**
 * Lo que ha dejado UNA propiedad (25-oct-2026): sus operaciones de comisión, lo cobrado y lo que falta, con el enlace para registrar un cierre nuevo.
 * Una propiedad vendida o rentada NO se archiva: se conserva y aquí queda su historial (una renta puede repetirse). Si las operaciones no están disponibles
 * (migración sin aplicar o sin permiso) no se pinta nada: es información de apoyo, no un requisito para revisar la propiedad.
 */
const ESTADO: Record<string, string> = { registrada: 'Por cobrar', confirmada: 'Cobrada', anulada: 'Anulada' }

export default function HistorialComisiones({ propiedadId }: { propiedadId: string }) {
  const { pedir } = useSesion()
  const [ops, setOps] = useState<OperacionComision[] | null>(null)

  useEffect(() => {
    let vivo = true
    pedir<{ operaciones: OperacionComision[] }>(`/api/admin/comision/operaciones?propiedad_id=${encodeURIComponent(propiedadId)}`)
      .then((r) => { if (vivo) setOps(r.operaciones) })
      .catch(() => { if (vivo) setOps(null) })
    return () => { vivo = false }
  }, [pedir, propiedadId])

  if (ops === null) return null
  const h = historialDePropiedad(ops, propiedadId)
  return (
    <section aria-labelledby="comisiones-propiedad" className="rounded-xl border p-4 sm:p-5" data-historial-comisiones>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="comisiones-propiedad" className="font-heading text-lg font-semibold">Comisiones de esta propiedad</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {h.operaciones.length === 0 ? 'Todavía no tiene cierres registrados.' : <>{h.operaciones.length} {h.operaciones.length === 1 ? 'operación' : 'operaciones'} · cobrado <strong>{pesos(h.cobrada)}</strong> · por cobrar <strong>{pesos(h.porCobrar)}</strong></>}
          </p>
        </div>
        <Link href={`/admin/comisiones?nueva=1&propiedad=${encodeURIComponent(propiedadId)}`} className="text-sm underline">Registrar un cierre</Link>
      </div>
      {h.operaciones.length > 0 && (
        <ul className="mt-3 divide-y text-sm">
          {h.operaciones.slice(0, 6).map((o) => (
            <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5">
              <span>{fechaDeOperacion(o)} · {o.tipo === 'venta' ? 'Venta' : 'Renta'}</span>
              <span><strong className="tabular-nums">{pesos(o.total_centavos)}</strong> <span className="text-xs text-muted-foreground">· {ESTADO[o.estado] ?? o.estado}</span></span>
            </li>
          ))}
        </ul>
      )}
      {h.operaciones.length > 0 && <p className="mt-2 text-xs"><Link className="underline" href={`/admin/comisiones?historial=${encodeURIComponent(propiedadId)}`}>Ver el historial completo y dar seguimiento al cobro</Link></p>}
    </section>
  )
}
