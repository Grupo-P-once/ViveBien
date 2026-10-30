'use client'

import { Settings } from 'lucide-react'
import { Pantalla } from '@/components/portal/Pantalla'
import CuentaYSeguridad from '@/components/cuenta/CuentaYSeguridad'
import PreferenciasDeAvisos from '@/components/portal/PreferenciasDeAvisos'

/**
 * «Configuración» del portal (3b-2).
 *
 * El contenido —correo, cómo entras, privacidad, cerrar sesión y cerrar la
 * cuenta— se movió a `components/cuenta/CuentaYSeguridad` en 03.08, porque el
 * panel de administración necesita exactamente lo mismo y copiarlo habría
 * creado dos versiones que se irían separando. Aquí queda el marco del portal;
 * allí, el del panel. Lo que se ve no cambia.
 */
export default function ConfiguracionPortal({ metodos, propiedades }: { metodos?: string[]; propiedades?: number }) {
  return (
    <Pantalla titulo="Configuración" descripcion="Tu cuenta y cómo entras." icono={Settings}>
      <CuentaYSeguridad metodos={metodos} propiedades={propiedades} />
      {/* UNA sola pantalla de correo (la misma que en Alertas): avisos de servicio y, aparte, promociones. Cada consentimiento se guarda por su ruta. */}
      <div className="mt-6"><PreferenciasDeAvisos /></div>
    </Pantalla>
  )
}
