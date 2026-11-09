'use client'

import Link from 'next/link'
import { UserCog } from 'lucide-react'
import PanelCitasPagina from '@/components/citas/PanelCitasPagina'
import Encabezado from '@/components/admin/Encabezado'
import PiePanel from '@/components/admin/PiePanel'

/**
 * «Citas» del equipo (Admin y Super Admin): sus citas personales (las que agendaron para visitar una propiedad: filtro «Mis visitas») y las de todas las propiedades, del equipo y de los
 * publicadores. El servidor decide qué ve cada cuenta del equipo; la disponibilidad de quien atiende está en «Acciones rápidas».
 */
export default function PaginaCitasEquipo() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado versal="Citas" titulo="Calendario de citas" descripcion="Tus citas y las visitas de todas las propiedades: confirma, rechaza, propone otro horario, cancela o marca el resultado."
        acciones={<Link href="/admin/citas/responsables" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"><UserCog className="size-4" aria-hidden /> Responsables de citas</Link>} />
      <div className="mt-6">
        <PanelCitasPagina vista="admin" conResponsable rutaDisponibilidad="/admin/citas/disponibilidad"
          vacioAgenda="No hay citas en este periodo. Aparecerán aquí cuando alguien agende desde la ficha de una propiedad." />
      </div>
      <PiePanel />
    </main>
  )
}
