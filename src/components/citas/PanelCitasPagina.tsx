'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { VistaCalendario } from '@/lib/citas/servicio'
import PanelCitas from './PanelCitas'

/** Lee `?cita=` de la dirección (enlaces de correos y avisos) y monta el panel. `useSearchParams` exige un Suspense alrededor. */
type Props = { vista: VistaCalendario; vacioAgenda: React.ReactNode; conResponsable?: boolean; rutaDisponibilidad?: string }

function Interior(props: Props) {
  const cita = useSearchParams().get('cita')
  const valida = cita && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cita) ? cita : null
  return <PanelCitas {...props} citaInicial={valida} />
}

export default function PanelCitasPagina(props: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" role="status" aria-label="Cargando citas" />}>
      <Interior {...props} />
    </Suspense>
  )
}
