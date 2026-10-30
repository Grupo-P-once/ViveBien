'use client'

import { Settings } from 'lucide-react'
import { Pantalla } from '@/components/portal/Pantalla'
import CuentaYSeguridad from '@/components/cuenta/CuentaYSeguridad'
import PreferenciaCorreo from '@/components/correo/PreferenciaCorreo'

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
      <PreferenciaCorreo />
    </Pantalla>
  )
}
