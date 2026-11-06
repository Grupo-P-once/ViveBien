'use client'

import Link from 'next/link'
import Encabezado from '@/components/admin/Encabezado'
import PiePanel from '@/components/admin/PiePanel'
import ConfigDisponibilidad from '@/components/citas/ConfigDisponibilidad'

/** Disponibilidad de los responsables de citas. El equipo elige de quién; cada cuenta del equipo edita la suya. */
export default function PaginaDisponibilidad() {
  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado versal="Citas" titulo="Disponibilidad" descripcion="Los horarios que se ofrecen en las fichas salen de aquí. No se inventan: se cargan los reales de cada responsable."
        acciones={<Link href="/admin/citas" className="text-sm font-semibold underline">Volver al calendario</Link>} />
      <div className="mt-6 rounded-xl border bg-card p-5 sm:p-6"><ConfigDisponibilidad elegirResponsable /></div>
      <PiePanel />
    </main>
  )
}
