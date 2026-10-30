'use client'

import Encabezado from '@/components/admin/Encabezado'
import RendimientoPropiedades from '@/components/admin/RendimientoPropiedades'
import { useSesion } from '@/components/admin/sesion'
import { puede } from '@/lib/acceso/permisos'

/**
 * «Mis métricas» (Publicador y Asociado): cuánta gente ve, elige y contacta CADA propiedad que esta cuenta subió, con los días que lleva publicada y el
 * promedio del sitio para compararse. El servidor (`/api/publicador/metricas`) solo trae lo suyo y solo cantidades; esta pantalla no decide nada de permisos.
 * El menú ofrece el enlace solo a quien tiene la capacidad de publicar; si alguien abre la dirección sin ella, se le dice y la API igual responde 403.
 */
export default function MisMetricas() {
  const { perfil } = useSesion()
  const publica = puede({ rol: perfil.rol ?? 'cliente', superAdmin: perfil.superAdmin }, 'propiedad.gestionar_propias')

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado versal="Propiedades" titulo="Mis métricas" descripcion="Vistas, interés y contactos de las propiedades que subiste, y los días que llevan publicadas." />
      <div className="mt-6">
        {publica
          ? <RendimientoPropiedades propias />
          : <p role="status" className="rounded-lg border bg-muted/40 p-4 text-sm">Esta pantalla es para cuentas que publican propiedades. Cuando tu cuenta pueda publicar, aquí verás cómo le va a cada una.</p>}
      </div>
    </div>
  )
}
