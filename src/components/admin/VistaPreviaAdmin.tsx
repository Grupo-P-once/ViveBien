'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from 'firebase/auth'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { ProveedorSesion, type PerfilPanel } from '@/components/admin/sesion'
import BarraLateral from '@/components/admin/BarraLateral'
import BarraSuperior from '@/components/admin/BarraSuperior'
import { servidorDePrueba, type CasoPermisos, type ModoGuardado } from '@/lib/admin/vista-previa-permisos'

/**
 * Vista previa de desarrollo del panel de administración (SÓLO `next dev`).
 *
 * La MISMA carcasa que el panel real (menú, barra superior) y las MISMAS
 * pantallas, con un servidor de prueba en memoria: sin Firebase, sin base, sin
 * API. Sirve para MIRAR cada estado de la pantalla de permisos; la seguridad se
 * prueba en las rutas reales (`tests/admin-permisos.test.ts`).
 */

const USUARIO = {
  uid: 'a-yo',
  email: 'admin@vivebienn.test',
  displayName: 'Admin Prueba',
  photoURL: null,
  getIdToken: async () => 'vista-previa',
} as unknown as User

const PERFIL: PerfilPanel = { uid: 'a-yo', email: 'admin@vivebienn.test', nombre: 'Admin Prueba', foto: null, rol: 'admin', superAdmin: false }

const sinSuscripcion = () => () => {}

export default function VistaPreviaAdmin({ caso, guardado, children }: { caso: CasoPermisos; guardado: ModoGuardado; children: React.ReactNode }) {
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false)
  const pedir = useMemo(() => servidorDePrueba(caso, guardado), [caso, guardado])
  const router = useRouter()

  // Los enlaces del panel real (`/admin/...`) NO pueden sacar de la vista previa:
  // el panel real pediría datos reales con tu sesión. Los de usuarios se quedan
  // dentro (mismo caso y modo de guardado); el resto no hace nada.
  useEffect(() => {
    const alHacerClic = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]')
      const href = a?.getAttribute('href') ?? ''
      if (!href.startsWith('/admin') && !href.startsWith('/api')) return
      e.preventDefault()
      e.stopPropagation()
      if (/^\/admin\/usuarios(\/|$)/.test(href)) router.push(`/vista-previa${href}${window.location.search}`)
    }
    document.addEventListener('click', alHacerClic, true)
    return () => document.removeEventListener('click', alHacerClic, true)
  }, [router])

  useEffect(() => {
    document.body.classList.add('panel-vb')
    return () => document.body.classList.remove('panel-vb')
  }, [])

  if (!montado) return null

  return (
    <ProveedorSesion user={USUARIO} perfil={PERFIL} pedirFijo={pedir}>
      <TooltipProvider delayDuration={200}>
        <SidebarProvider>
          <BarraLateral />
          <SidebarInset className="min-w-0 bg-background">
            <BarraSuperior />
            <div className="flex-1">{children}</div>
          </SidebarInset>
        </SidebarProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
      <p role="note" className="fixed bottom-3 left-3 z-[60] rounded-full bg-black/80 px-3 py-1 text-xs text-white">
        Vista previa de desarrollo · caso «{caso}» · guardado «{guardado}» · nada sale de aquí (los enlaces del panel se quedan en la vista previa)
      </p>
    </ProveedorSesion>
  )
}
