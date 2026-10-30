'use client'

import { useSesion } from '@/components/admin/sesion'
import { puede } from '@/lib/acceso/permisos'

/**
 * «Marketing y correos» es para Administrador y Super Admin (`correo.ver`). Esto es presentación: la autoridad es la API (`/api/admin/marketing/*`
 * exige el permiso en el servidor), así que quien no lo tenga nunca recibe datos aunque abra la URL.
 */
export default function LayoutMarketing({ children }: { children: React.ReactNode }) {
  const { perfil } = useSesion()
  if (!puede({ rol: perfil.rol ?? 'cliente', superAdmin: perfil.superAdmin }, 'correo.ver')) {
    return (
      <main className="mx-auto w-full max-w-[900px] px-4 py-10">
        <p role="alert" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Esta pantalla es sólo para Administrador y Super Admin.
        </p>
      </main>
    )
  }
  return <>{children}</>
}
