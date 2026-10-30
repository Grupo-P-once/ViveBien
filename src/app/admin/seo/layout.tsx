'use client'

import { useSesion } from '@/components/admin/sesion'

/**
 * SEO es solo de Super Admin (`seo.ver`). Las 7 rutas de `/api/admin/seo/*` ya lo exigen en el servidor, así que un administrador común nunca recibe datos;
 * pero la pantalla se dibujaba completa (SEC-9, 29-oct-2026: se vio con una cuenta de administrador en producción) y es incoherente con
 * Configuración y Contabilidad, que avisan «sólo para Super Admin». Este layout cubre TODAS las pantallas de la sección (resumen, ia, indexación, negocio,
 * rendimiento, robots, salud y tareas) con el mismo aviso. Es presentación: la autoridad sigue siendo la API.
 */
export default function LayoutSeo({ children }: { children: React.ReactNode }) {
  const { perfil } = useSesion()
  if (!perfil.superAdmin) {
    return (
      <main className="mx-auto w-full max-w-[900px] px-4 py-10">
        <p role="alert" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Esta pantalla es sólo para Super Admin.
        </p>
      </main>
    )
  }
  return <>{children}</>
}
