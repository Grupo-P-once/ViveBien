'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { LogIn } from 'lucide-react'
import { auth } from '@/lib/firebase'
import PantallaDeEspera from '@/components/acceso/PantallaDeEspera'
import { olvidarPerfilDeSesion, perfilDeSesion } from '@/lib/acceso/perfil-de-sesion'
import { Button } from '@/components/ui/button'
import { rutaDeEntrada } from '@/lib/pantalla/plegables'
import { esAdministracion } from '@/lib/acceso/destino-dashboard'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import DialogoNuevaPropiedad from '@/components/publicador/DialogoNuevaPropiedad'
import { ProveedorSesion, type PerfilPanel } from '@/components/admin/sesion'
import { ProveedorResumen } from './resumen'
import BarraLateralPortal from './BarraLateralPortal'
import BarraSuperiorPortal from './BarraSuperiorPortal'
import { AvisoPortal, TarjetaPortal } from './AvisoPortal'

/**
 * Marco del portal del cliente: la misma casa que el panel de administración
 * (sesión, barra lateral, barra superior, tarjetas), con lo que pide su mockup.
 *
 * Entra cualquier cuenta creada —cliente, publicador o admin—: el portal es
 * «mi cuenta». Sin sesión se ofrece entrar; crear cuenta sigue en /dashboard.
 */

// V-1.1.82: 'no-disponible' (etapa interna, o portal cerrado) y 'suspendida' los decide el servidor.
type Estado = 'cargando' | 'sin-sesion' | 'error' | 'no-disponible' | 'suspendida' | 'listo'

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const ruta = usePathname()
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>('cargando')
  const [user, setUser] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<PerfilPanel | null>(null)

  useEffect(() => {
    document.body.classList.add('panel-vb', 'portal-vb')
    return () => document.body.classList.remove('panel-vb', 'portal-vb')
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (!u) {
        olvidarPerfilDeSesion()
        setPerfil(null)
        setEstado('sin-sesion')
        return
      }
      setEstado('cargando')
      // Cambio de cuenta: una respuesta que llega tarde NO puede pintar ni redirigir según la sesión anterior.
      const vigente = () => auth.currentUser?.uid === u.uid
      try {
        // Una sola consulta por entrada: la respuesta de `/dashboard` se reutiliza unos segundos (ver `perfil-de-sesion.ts`).
        const token = await u.getIdToken()
        const res = await perfilDeSesion(u.uid, async () => token)
        if (!vigente()) return
        if (!res.ok) {
          setEstado(res.status === 401 ? 'sin-sesion' : 'error')
          return
        }
        const p = res.datos ?? {}
        if (!vigente()) return
        // SESSION-SWITCH BUG (P1): el portal es el del CLIENTE. Si el servidor dice que ESTA sesión es administración
        // (rol que llega de /api/usuarios/me, no de la URL ni de lo que hubiera antes), no se pinta ni un fotograma de él.
        if (esAdministracion(p)) {
          setPerfil(null)
          setEstado('cargando')
          router.replace('/admin')
          return
        }
        setPerfil({
          uid: u.uid,
          email: u.email,
          nombre: (typeof p.nombre === 'string' && p.nombre.trim()) || u.displayName || null,
          foto: (typeof p.foto_url === 'string' && p.foto_url) || u.photoURL || null,
          rol: p.rol === 'admin' || p.rol === 'publicador' ? p.rol : 'cliente',
          superAdmin: p.superAdmin === true,
          tipoPublicador: typeof p.tipoPublicador === 'string' ? p.tipoPublicador : undefined,
        })
        // ¿Puede ESTA sesión usar el portal? Lo decide el servidor (apertura por
        // etapas, suspensión); aquí sólo se enseña. V-1.1.82.
        const acceso = await fetch('/api/portal/acceso', { headers: { Authorization: `Bearer ${token}` } })
        if (!vigente()) return
        if (acceso.status === 404) { setEstado('no-disponible'); return }
        if (acceso.status === 403) { setEstado('suspendida'); return }
        if (!acceso.ok) { setEstado(acceso.status === 401 ? 'sin-sesion' : 'error'); return }
        setEstado('listo')
      } catch {
        if (vigente()) setEstado('error')
      }
    })
  }, [router])


  if (estado === 'cargando') {
    return <PantallaDeEspera />
  }

  if (estado === 'sin-sesion') {
    return (
      <TarjetaPortal>
        <h1 className="font-heading text-xl font-bold">Tu portal de Vive Bien</h1>
        <p className="mt-2 text-sm text-muted-foreground">Entra para ver tus propiedades guardadas, tus búsquedas y tus visitas.</p>
        {/* V-1.1.93 (D-29.4) · Una sola pantalla de acceso. Antes esta tarjeta
            tenía su propio botón de Google y un enlace al panel viejo: dos
            formas de entrar que mantener y que podían divergir. Ahora lleva a
            `/entrar`, que vuelve aquí al terminar. */}
        <Button asChild className="mt-6 h-10 w-full !text-primary-foreground">
          <Link href={rutaDeEntrada(ruta)}><LogIn aria-hidden /> Entrar</Link>
        </Button>
      </TarjetaPortal>
    )
  }

  if (estado === 'no-disponible' || estado === 'suspendida') return <AvisoPortal tipo={estado} publica={perfil?.rol === 'publicador'} />

  if (estado === 'error' || !user || !perfil) {
    return (
      <TarjetaPortal>
        <h1 className="font-heading text-lg font-bold">No se pudo abrir tu portal</h1>
        <p className="mt-2 text-sm text-muted-foreground">El servidor no respondió. Recarga la página en un momento.</p>
        <Button className="mt-6 h-10 w-full" onClick={() => window.location.reload()}>Recargar</Button>
      </TarjetaPortal>
    )
  }

  return (
    <ProveedorSesion user={user} perfil={perfil}>
      <ProveedorResumen>
        <TooltipProvider delayDuration={200}>
          <SidebarProvider>
            {/* La barra lee ?vista= para marcar la opción activa: useSearchParams pide Suspense. */}
            <Suspense fallback={null}><BarraLateralPortal /></Suspense>
            <SidebarInset className="min-w-0 bg-background">
              <BarraSuperiorPortal />
              {/* `data-portal-contenido`: globals.css reserva ahí espacio inferior en móvil para que el botón flotante de WhatsApp no tape controles (tests/wafloat-oclusion). */}
              <div className="flex-1" data-portal-contenido>{children}</div>
            </SidebarInset>
          </SidebarProvider>
          <DialogoNuevaPropiedad />
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </ProveedorResumen>
    </ProveedorSesion>
  )
}
