import type { Metadata } from 'next'
import MarcoPorRol from '@/components/publicador/MarcoPorRol'
import { leerFlags } from '@/lib/config/flags-servidor'
import { aperturaDelPortal } from '@/lib/portal/apertura'

// V-1.1.77 (SEO-01): página privada. `robots.txt` la bloquea, pero eso no
// impide que Google indexe la URL si alguien la enlaza; `noindex` sí.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

// El flag del portal se consulta en cada petición (igual que el layout del portal).
export const dynamic = 'force-dynamic'

/** R8.3: las páginas del publicador se pintan dentro del panel del rol (ver `MarcoPorRol`), no como un panel aparte. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  // Solo con el portal abierto a TODOS (`portalCliente`) el publicador trabaja en él; en la etapa interna o cerrado, la pantalla se pinta sola.
  const portalAbierto = aperturaDelPortal(await leerFlags()) === 'todos'
  return <MarcoPorRol portalAbierto={portalAbierto}>{children}</MarcoPorRol>
}
