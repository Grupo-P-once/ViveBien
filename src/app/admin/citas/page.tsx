'use client'

import PanelCitasPagina from '@/components/citas/PanelCitasPagina'
import Encabezado from '@/components/admin/Encabezado'
import PiePanel from '@/components/admin/PiePanel'

/** «Citas» del equipo: el calendario de todos los responsables. El servidor decide qué ve cada cuenta del equipo. */
export default function PaginaCitasEquipo() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado versal="Citas" titulo="Calendario de citas" descripcion="Solicitudes y visitas de todas las propiedades: confirma, propone otro horario, cancela o marca el resultado." />
      <div className="mt-6">
        <PanelCitasPagina vista="admin" conResponsable
          vacioAgenda="No hay citas en este periodo. Aparecerán aquí cuando alguien agende desde la ficha de una propiedad." />
      </div>
      <PiePanel />
    </main>
  )
}
