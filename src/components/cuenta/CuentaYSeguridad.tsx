'use client'

import { useState } from 'react'
import Link from 'next/link'
import { KeyRound, Loader2, LogOut, Mail, ShieldCheck } from 'lucide-react'
import { sendPasswordResetEmail, signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useSesion } from '@/components/admin/sesion'
import { auth } from '@/lib/firebase'
import { mensajeDeAcceso } from '@/lib/acceso/google'
import { comoEntra } from '@/lib/portal/perfil'
import EliminarCuenta from '@/components/portal/EliminarCuenta'

/**
 * Cuenta y seguridad: correo, cómo entras, privacidad, cerrar sesión y cerrar
 * la cuenta (03.08).
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ ESTÁ AQUÍ Y NO DENTRO DEL PORTAL
 *
 * Esto vivía dentro de `ConfiguracionPortal`, envuelto en `<Pantalla>`, que es
 * el chrome del portal. El panel de administración usa `Encabezado`, otro
 * marco distinto, así que reutilizarlo tal cual habría metido una pantalla de
 * portal dentro del panel.
 *
 * La solución no es copiarlo: es sacar el contenido —que es idéntico para
 * todos los roles— y dejar que cada sitio le ponga su propio marco. Un
 * administrador y un cliente cambian la contraseña exactamente igual.
 * ─────────────────────────────────────────────────────────────
 *
 * Decisiones que se conservan tal cual estaban:
 *  · No hay interruptores de notificaciones: hoy no se envía ninguna, y un
 *    interruptor apagado que no hace nada promete algo que no existe.
 *  · «Cambiar contraseña» sólo aparece si la cuenta tiene contraseña (D-28.4):
 *    a quien entra con Google se le dice eso en vez de ofrecerle un imposible.
 *  · «Eliminar mi cuenta» va al final y separada (D-35): es lo único
 *    irreversible, y no debe quedar junto a un botón inocente.
 */
export default function CuentaYSeguridad({ metodos, propiedades }: { metodos?: string[]; propiedades?: number }) {
  const { perfil, user } = useSesion()
  const [enviando, setEnviando] = useState(false)
  const proveedores = metodos ?? (user?.providerData ?? []).map((p) => p.providerId)
  const { conContrasena, texto } = comoEntra(proveedores)

  async function restablecer() {
    if (!perfil.email) return
    setEnviando(true)
    try {
      await sendPasswordResetEmail(auth, perfil.email)
      toast.success('Te mandamos un correo para cambiar tu contraseña')
    } catch (e) {
      toast.error(mensajeDeAcceso(e))
    }
    setEnviando(false)
  }

  return (
    <div className="max-w-2xl space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-heading font-semibold">
          <Mail className="size-4 text-[var(--marca)]" aria-hidden /> Tu correo
        </h2>
        <p className="mt-2 break-all text-sm">{perfil.email ?? '—'}</p>
        <p className="mt-1 text-xs text-muted-foreground">Es con el que entras. Para cambiarlo, escríbenos.</p>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-heading font-semibold">
          <ShieldCheck className="size-4 text-[var(--marca)]" aria-hidden /> Cómo entras
        </h2>
        <p className="mt-2 text-sm">{texto}</p>

        {conContrasena ? (
          <div className="mt-4">
            <Button variant="outline" onClick={restablecer} disabled={enviando}>
              {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
              Cambiar mi contraseña
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Te llega un correo con un enlace para ponerla de nuevo. Nosotros nunca vemos tu contraseña.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Como entras con Google, no hay contraseña que cambiar: tu acceso lo administras desde tu cuenta de Google.
          </p>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-heading font-semibold">Privacidad</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Puedes consultar qué datos guardamos y para qué en el{' '}
          <Link href="/privacidad" className="underline">aviso de privacidad</Link>.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-heading font-semibold">Cerrar sesión</h2>
        <p className="mt-2 text-sm text-muted-foreground">Se cierra en este dispositivo. Tus datos se quedan como están.</p>
        <Button variant="outline" className="mt-4" onClick={() => signOut(auth)}>
          <LogOut aria-hidden /> Cerrar sesión
        </Button>
      </section>

      <EliminarCuenta propiedades={propiedades} />
    </div>
  )
}
