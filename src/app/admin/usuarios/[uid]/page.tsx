'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Mail, MessageCircle, RefreshCw, UserRound } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Estado } from '@/components/admin/Insignia'
import PiePanel from '@/components/admin/PiePanel'
import PermisosPublicador from '@/components/admin/usuarios/PermisosPublicador'
import { ErrorDePeticion, useSesion } from '@/components/admin/sesion'
import type { MapaCapacidades, Overrides, TipoPublicador } from '@/lib/acceso/capacidades'
import { fechaCorta, hora } from '@/lib/admin/formato'
import { ETIQUETA_ROL } from '@/lib/admin/panel-config'
import { iniciales } from '@/lib/admin/saludo'
import type { UsuarioPanel } from '@/lib/admin/usuarios'

type Respuesta = {
  usuario: UsuarioPanel
  citasEnLinea: boolean
  permisos: null | { disponibles: boolean; tipoPublicador: TipoPublicador; overrides: Overrides; efectivos: MapaCapacidades }
}

const TONO_ESTADO: Record<string, { texto: string; tono: 'bien' | 'aviso' | 'mal' | 'neutro' }> = {
  activo: { texto: 'Activo', tono: 'bien' },
  suspendido: { texto: 'Suspendido', tono: 'mal' },
  pendiente: { texto: 'Pendiente', tono: 'aviso' },
}

/**
 * Ficha de una cuenta: datos básicos y, si es publicador, su modalidad y sus
 * permisos. Dividida en dos piezas: esta página carga y enseña la cuenta;
 * `PermisosPublicador` sólo se ocupa de los permisos.
 */
export default function FichaDeUsuario() {
  const { uid } = useParams<{ uid: string }>()
  const { pedir } = useSesion()
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [error, setError] = useState<{ mensaje: string; noExiste: boolean } | null>(null)
  const [vuelta, setVuelta] = useState(0)

  const cargar = useCallback(async () => {
    try {
      setDatos(await pedir<Respuesta>(`/api/admin/usuarios/${encodeURIComponent(uid)}`))
      setError(null)
    } catch (e) {
      setError({ mensaje: e instanceof Error ? e.message : 'No se pudo cargar la cuenta.', noExiste: e instanceof ErrorDePeticion && e.estado === 404 })
    }
  }, [pedir, uid])

  useEffect(() => { void cargar() }, [cargar, vuelta])

  const volver = (
    <Link href="/admin/usuarios" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--marca)] hover:underline">
      <ArrowLeft className="size-4" aria-hidden /> Usuarios
    </Link>
  )

  if (error) {
    return (
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {volver}
        <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-5">
          <AlertTriangle className="size-5 text-[var(--estado-aviso)]" aria-hidden />
          <p className="flex-1 text-sm">{error.noExiste ? 'Esa cuenta no existe.' : error.mensaje}</p>
          {!error.noExiste && <Button variant="outline" size="sm" onClick={() => setVuelta((n) => n + 1)}><RefreshCw aria-hidden /> Reintentar</Button>}
        </div>
      </main>
    )
  }

  if (!datos) {
    return (
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8" aria-busy="true">
        {volver}
        <div className="mt-6 h-32 animate-pulse rounded-xl border bg-card" />
        <div className="mt-5 h-72 animate-pulse rounded-xl border bg-card" />
      </main>
    )
  }

  const u = datos.usuario
  const e = TONO_ESTADO[u.estado] ?? { texto: u.estado, tono: 'neutro' as const }
  const tel = (u.telefono ?? u.whatsapp ?? '').replace(/\D/g, '')

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {volver}

      <section className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,.04)]" aria-label="Datos de la cuenta">
        <Avatar className="size-14 shrink-0">
          <AvatarFallback className="bg-[var(--marca)] font-bold text-white">{iniciales(u.nombre, u.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 basis-[15rem]">
          <h1 className="font-heading text-xl font-semibold [overflow-wrap:anywhere]">{u.nombre?.trim() || 'Sin nombre'}</h1>
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{u.email ?? 'Sin correo'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-semibold">
              <UserRound className="size-3.5" aria-hidden /> {ETIQUETA_ROL[u.rol] ?? u.rol}
            </span>
            <Estado texto={e.texto} tono={e.tono} />
            {u.esYo && <span className="text-xs text-muted-foreground">Esta es tu cuenta</span>}
          </div>
        </div>
        <dl className="grid w-full gap-x-8 gap-y-1 text-sm sm:w-auto sm:text-right">
          <div><dt className="inline text-muted-foreground">Último acceso: </dt><dd className="inline">{u.ultimo_acceso ? `${fechaCorta(u.ultimo_acceso)}, ${hora(u.ultimo_acceso)}` : 'Sin registro'}</dd></div>
          <div><dt className="inline text-muted-foreground">Perfil completo: </dt><dd className="inline">{typeof u.completitud === 'number' ? `${u.completitud}%` : '—'}</dd></div>
        </dl>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {u.email && <Button asChild variant="outline" size="sm"><a href={`mailto:${u.email}`}><Mail aria-hidden /> Correo</a></Button>}
          {tel && <Button asChild variant="outline" size="sm"><a href={`https://wa.me/${tel.length === 10 ? `52${tel}` : tel}`} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden /> WhatsApp</a></Button>}
        </div>
      </section>

      <div className="mt-6">
        {datos.permisos ? (
          <PermisosPublicador
            key={JSON.stringify([datos.permisos.tipoPublicador, datos.permisos.overrides])}
            uid={u.uid}
            nombre={u.nombre?.trim() || u.email || ''}
            tipoInicial={datos.permisos.tipoPublicador}
            overridesIniciales={datos.permisos.overrides}
            disponibles={datos.permisos.disponibles}
            citasEnLinea={datos.citasEnLinea}
            esYo={Boolean(u.esYo)}
            alGuardar={() => setVuelta((n) => n + 1)}
          />
        ) : (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            Los permisos de publicación, citas y contacto sólo se configuran en cuentas de <b>publicador</b>. Esta cuenta es de «{ETIQUETA_ROL[u.rol] ?? u.rol}»: su acceso lo define su rol.
            Para darle esos permisos primero hay que cambiarle el rol desde la lista de usuarios.
          </p>
        )}
      </div>

      <PiePanel />
    </main>
  )
}
