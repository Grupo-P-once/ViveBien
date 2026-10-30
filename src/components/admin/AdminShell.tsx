'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { onAuthStateChanged, sendEmailVerification, type User } from 'firebase/auth'
import { Loader2, LogIn, MailCheck, ShieldAlert } from 'lucide-react'
import { auth } from '@/lib/firebase'
import PantallaDeEspera from '@/components/acceso/PantallaDeEspera'
import { olvidarPerfilDeSesion, perfilDeSesion } from '@/lib/acceso/perfil-de-sesion'
import { Button } from '@/components/ui/button'
import { rutaDeEntrada } from '@/lib/pantalla/plegables'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import DialogoNuevaPropiedad from '@/components/publicador/DialogoNuevaPropiedad'
import { ProveedorSesion, type PerfilPanel } from './sesion'
import BarraLateral from './BarraLateral'
import BarraSuperior from './BarraSuperior'
import { puede } from '@/lib/acceso/permisos'

/**
 * Marco del panel de administración: sesión, barra lateral y barra superior.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ LA CLASE `panel-vb` VA EN EL <body>
 *
 * Los colores de la marca del panel están acotados a `.panel-vb` para que el
 * sitio público no los vea. Pero los diálogos, menús y listas desplegables de
 * shadcn se pintan en un portal colgado directamente del <body>, FUERA del
 * contenedor del panel: sin la clase en el body salían con los colores neutros
 * de shadcn. Se pone al entrar al panel y se quita al salir.
 * ─────────────────────────────────────────────────────────────
 */

type Estado = 'cargando' | 'sin-sesion' | 'sin-permiso' | 'error' | 'listo'

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-40 items-center justify-center rounded-xl bg-[var(--marca)] px-4">
          <Image src="/panel/logo-blanco.png" alt="Vive Bien Grupo Inmobiliario" width={120} height={79} className="h-12 w-auto" priority />
        </div>
        {children}
      </div>
    </div>
  )
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const ruta = usePathname()
  const [estado, setEstado] = useState<Estado>('cargando')
  const [user, setUser] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<PerfilPanel | null>(null)
  const [verificacion, setVerificacion] = useState<'' | 'enviando' | 'enviado' | 'revisando' | 'sin-verificar' | 'error'>('')
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    document.body.classList.add('panel-vb')
    return () => document.body.classList.remove('panel-vb')
  }, [])

  useEffect(() => {
    // `vuelta` sube al confirmar el correo: vuelve a suscribirse y a revisar el perfil.
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (!u) {
        olvidarPerfilDeSesion()
        setPerfil(null)
        setEstado('sin-sesion')
        return
      }
      setEstado('cargando')
      // Cambio de cuenta: una respuesta que llega tarde no puede decidir por la sesión anterior.
      const vigente = () => auth.currentUser?.uid === u.uid
      try {
        // Una sola consulta por entrada (la de `/dashboard` se reutiliza unos segundos); tras confirmar el correo (`vuelta`), siempre fresca.
        const token = await u.getIdToken()
        const res = await perfilDeSesion(u.uid, async () => token, { fresco: vuelta > 0 })
        if (!vigente()) return
        if (!res.ok) {
          setEstado(res.status === 401 || res.status === 403 ? 'sin-permiso' : 'error')
          return
        }
        const p = res.datos ?? {}
        if (!vigente()) return
        // V-1.1.80: el mismo catálogo que usa el servidor (lib/acceso/permisos).
        if (!puede({ rol: p?.rol ?? 'cliente', superAdmin: p?.superAdmin === true }, 'panel.admin')) {
          setEstado('sin-permiso')
          return
        }
        setPerfil({
          uid: u.uid,
          email: u.email,
          nombre: (typeof p.nombre === 'string' && p.nombre.trim()) || u.displayName || null,
          foto: (typeof p.foto_url === 'string' && p.foto_url) || u.photoURL || null,
          rol: 'admin',
          superAdmin: p.superAdmin === true,
        })
        setEstado('listo')
      } catch {
        if (vigente()) setEstado('error')
      }
    })
  }, [vuelta])

  // V-1.1.76 — la lista de administradores exige correo verificado. Quien
  // entra con correo y contraseña confirma su correo aquí mismo.
  async function mandarVerificacion() {
    if (!user) return
    setVerificacion('enviando')
    try {
      await sendEmailVerification(user)
      setVerificacion('enviado')
    } catch {
      setVerificacion('error')
    }
  }

  async function yaVerifique() {
    if (!user) return
    setVerificacion('revisando')
    try {
      await user.reload()
      // El token viejo dice «sin verificar»: hay que pedir uno nuevo.
      await user.getIdToken(true)
      if (!auth.currentUser?.emailVerified) {
        setVerificacion('sin-verificar')
        return
      }
      setVerificacion('')
      setVuelta((n) => n + 1)
    } catch {
      setVerificacion('error')
    }
  }


  if (estado === 'cargando') {
    return <PantallaDeEspera />
  }

  if (estado === 'sin-sesion') {
    return (
      <Tarjeta>
        <h1 className="font-heading text-xl font-bold">Panel de administración</h1>
        <p className="mt-2 text-sm text-muted-foreground">Inicia sesión con tu cuenta de administrador.</p>
        {/* V-1.1.93 (D-29.4) · Una sola pantalla de acceso: ver PortalShell. */}
        <Button asChild className="mt-6 h-10 w-full">
          <Link href={rutaDeEntrada(ruta)}><LogIn aria-hidden /> Entrar</Link>
        </Button>
      </Tarjeta>
    )
  }

  if (estado === 'sin-permiso' || estado === 'error' || !user || !perfil) {
    return (
      <Tarjeta>
        <ShieldAlert className="mx-auto size-8 text-[var(--marca)]" aria-hidden />
        <h1 className="mt-3 font-heading text-lg font-bold">
          {estado === 'error' ? 'No se pudo comprobar tu cuenta' : 'Tu cuenta no tiene acceso al panel'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {estado === 'error'
            ? 'El servidor no respondió. Recarga la página en un momento.'
            : 'El panel de administración es sólo para administradores. Tu cuenta sigue disponible en tu portal.'}
        </p>
        {estado === 'sin-permiso' && user && !user.emailVerified && (
          <div className="mt-5 rounded-lg border bg-muted/40 p-4 text-left text-sm">
            <p className="flex items-center gap-2 font-medium"><MailCheck className="size-4 text-[var(--marca)]" aria-hidden /> ¿Eres administrador?</p>
            <p className="mt-1 text-muted-foreground">
              Por seguridad, primero confirma tu correo ({user.email}). Te mandamos un enlace; ábrelo y vuelve aquí.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={mandarVerificacion} disabled={verificacion === 'enviando' || verificacion === 'revisando'}>
                {verificacion === 'enviado' ? 'Reenviar correo' : 'Mandar correo de confirmación'}
              </Button>
              <Button size="sm" onClick={yaVerifique} disabled={verificacion === 'revisando'}>
                {verificacion === 'revisando' ? <Loader2 className="animate-spin" aria-hidden /> : null} Ya lo confirmé
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              {verificacion === 'enviado' && 'Listo: revisa tu bandeja (y la carpeta de spam).'}
              {verificacion === 'sin-verificar' && 'Todavía aparece sin confirmar. Abre el enlace del correo y vuelve a intentar.'}
              {verificacion === 'error' && 'No se pudo. Espera un minuto e inténtalo otra vez.'}
            </p>
          </div>
        )}
        <Button asChild className="mt-6 h-10 w-full">
          <Link href="/dashboard">Ir a mi cuenta</Link>
        </Button>
      </Tarjeta>
    )
  }

  return (
    <ProveedorSesion user={user} perfil={perfil}>
      <TooltipProvider delayDuration={200}>
        <SidebarProvider>
          <BarraLateral />
          <SidebarInset className="min-w-0 bg-background">
            <BarraSuperior />
            <div className="flex-1">{children}</div>
          </SidebarInset>
        </SidebarProvider>
        <DialogoNuevaPropiedad />
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    </ProveedorSesion>
  )
}
