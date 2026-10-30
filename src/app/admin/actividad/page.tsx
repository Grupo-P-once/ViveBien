'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useSesion } from '@/components/admin/sesion'
import Encabezado from '@/components/admin/Encabezado'
import ActividadReciente from '@/components/admin/ActividadReciente'
import PiePanel from '@/components/admin/PiePanel'
import type { ItemActividad } from '@/lib/admin/actividad'

export default function PaginaActividad() {
  const { pedir } = useSesion()
  const [items, setItems] = useState<ItemActividad[] | null>(null)
  const [faltan, setFaltan] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    pedir<{ items: ItemActividad[]; faltan: string[] }>('/api/admin/actividad?limite=100')
      .then((r) => { setItems(r.items); setFaltan(r.faltan) })
      .catch((e) => { setError(e instanceof Error ? e.message : 'No se pudo cargar la actividad.'); setItems([]) })
  }, [pedir])

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado
        versal="Actividad"
        titulo="Actividad del sitio"
        descripcion="Registros, cuentas, publicaciones, revisiones, cambios de permisos e invitaciones, de lo más reciente a lo más viejo."
      />
      {(error || faltan.length > 0) && (
        <p className="mt-6 flex items-start gap-2 rounded-lg bg-[var(--estado-aviso-fondo)] px-4 py-3 text-sm text-[var(--estado-aviso)]" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error || `No respondieron: ${faltan.join(', ')}. La lista puede estar incompleta.`}
        </p>
      )}
      <section className="mt-6 rounded-xl border bg-card p-5 sm:p-6">
        {items === null ? <div className="h-64 animate-pulse rounded-lg bg-muted" aria-label="Cargando" /> : <ActividadReciente items={items} />}
      </section>
      <PiePanel />
    </main>
  )
}
