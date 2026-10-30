'use client'

import Link from 'next/link'
import { signOut } from 'firebase/auth'
import { ChevronDown, ExternalLink, History, LogOut, UserRound } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { iniciales, nombreCorto } from '@/lib/admin/saludo'
import BusquedaGlobal from './BusquedaGlobal'
import Notificaciones from './Notificaciones'
import { useSesion } from './sesion'
import { CUENTA_DEL_PANEL } from '@/lib/cuenta/destino'

/**
 * Barra superior: búsqueda global, campana y cuenta.
 *
 * El botón que abre y cierra la barra lateral se ve en cualquier tamaño: con la
 * ventana estrecha o con zoom, la barra lateral se oculta, y todo lo que se
 * oculta necesita un control visible para volver a abrirlo.
 */
export default function BarraSuperior() {
  const { perfil } = useSesion()
  const nombre = nombreCorto(perfil.nombre, perfil.email)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-white/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:gap-4 sm:px-6">
      <SidebarTrigger className="size-9 shrink-0" aria-label="Mostrar u ocultar el menú" />
      <div className="min-w-0 flex-1">
        <BusquedaGlobal />
      </div>
      <Notificaciones />
      <span aria-hidden className="hidden h-8 w-px bg-border sm:block" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex shrink-0 items-center gap-3 rounded-full py-1 pr-2 pl-1 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Cuenta de ${nombre}`}
          >
            <Avatar className="size-10">
              {perfil.foto && <AvatarImage src={perfil.foto} alt="" referrerPolicy="no-referrer" />}
              <AvatarFallback className="bg-[var(--panel-barra)] text-sm font-semibold text-white">
                {iniciales(perfil.nombre, perfil.email)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden leading-tight md:block">
              <span className="block max-w-[11rem] truncate font-heading text-sm font-semibold">{nombre}</span>
              <span className="block text-xs text-muted-foreground">Administrador</span>
            </span>
            <ChevronDown className="hidden size-4 text-muted-foreground md:block" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-semibold">{perfil.nombre ?? nombre}</span>
            <span className="block truncate text-xs text-muted-foreground">{perfil.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            {/*
              03.08 · Antes esto iba a `/mi-cuenta`, que sólo distinguía
              publicador: un administrador acababa en el asistente del
              cliente, respondiendo «¿Compras o rentas?». Va directo a su
              pantalla, sin rebote.
            */}
            <Link href={CUENTA_DEL_PANEL}><UserRound aria-hidden /> Mi cuenta</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden /> Ver sitio web</a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/admin/actividad"><History aria-hidden /> Actividad</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => signOut(auth)} className="text-[var(--estado-mal)] focus:text-[var(--estado-mal)]">
            <LogOut aria-hidden /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
