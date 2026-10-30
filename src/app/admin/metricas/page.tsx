'use client'

import Analitica from '@/components/Analitica'
import Encabezado from '@/components/admin/Encabezado'
import GoogleAnalytics from '@/components/admin/GoogleAnalytics'
import PiePanel from '@/components/admin/PiePanel'
import RendimientoPropiedades from '@/components/admin/RendimientoPropiedades'

/**
 * Métricas detalladas: el rendimiento de cada propiedad (telemetría propia), las seis gráficas de analítica de V-1.1.69 (base propia) y, solo para
 * Super Admin, la sección de Google Analytics (de dónde llegan las visitas y qué acciones hacen). `GoogleAnalytics` no pinta nada si la persona no es
 * Super Admin.
 */
export default function PaginaMetricas() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado
        versal="Métricas"
        titulo="Métricas del sitio"
        descripcion="Cuánto se ve y se contacta cada propiedad, precios que se buscan, zonas frente a inventario y días en el mercado."
      />
      <div className="mt-6 space-y-10">
        <RendimientoPropiedades />
        <GoogleAnalytics />
        <Analitica />
      </div>
      <PiePanel />
    </main>
  )
}
