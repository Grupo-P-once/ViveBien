import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PortalShell from '@/components/portal/PortalShell'
import { leerFlags } from '@/lib/config/flags-servidor'
import { aperturaDelPortal } from '@/lib/portal/apertura'

// El portal es de cada cliente: nada aquí debe salir en buscadores.
export const metadata: Metadata = {
  title: 'Mi portal — Vive Bien',
  robots: { index: false, follow: false },
}

// El flag se consulta en cada petición: encenderlo no requiere desplegar.
export const dynamic = 'force-dynamic'

/**
 * V-1.1.77: el portal existe en el código pero no abre hasta encender un flag (ADR-0012).
 * V-1.1.82 (D-27.5): abre por etapas. Aquí sólo se cierra del todo cuando no hay
 * ningún flag; quién entra en la etapa interna lo decide cada API (`exigirPortal`),
 * porque la sesión vive en el navegador.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  if (aperturaDelPortal(await leerFlags()) === 'nadie') notFound()
  return <PortalShell>{children}</PortalShell>
}
