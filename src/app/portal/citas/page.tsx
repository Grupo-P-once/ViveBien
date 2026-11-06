'use client'

import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { Pantalla } from '@/components/portal/Pantalla'
import PanelCitasPagina from '@/components/citas/PanelCitasPagina'

/** «Mis citas» del cliente: las visitas que pidió, con su calendario, agenda e historial. */
export default function PaginaCitasPortal() {
  return (
    <Pantalla titulo="Mis citas" descripcion="Tus visitas a propiedades: solicitudes, confirmadas y pasadas. Todo se responde aquí, con tu sesión." icono={CalendarDays}>
      <PanelCitasPagina
        vista="cliente"
        vacioAgenda={<>Aún no tienes citas. Entra a la ficha de una propiedad y usa <strong>Agenda una cita</strong>. <Link href="/propiedades" className="font-semibold underline">Ver propiedades</Link></>}
      />
    </Pantalla>
  )
}
