'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { Bell, CalendarClock, ChevronDown, ExternalLink, FileText, Home, Info, LogOut, MapPin, Search, Sparkles, TrendingDown, UserRound } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { iniciales, nombreCorto } from '@/lib/admin/saludo'
import { haceCuanto } from '@/lib/admin/formato'
import { useSesion } from '@/components/admin/sesion'
import { useResumen } from './resumen'
import { RUTAS_DE_VISITAS } from '@/lib/citas/enlaces'

const PAPEL = { cliente: 'Cliente', publicador: 'Publicador', admin: 'Administrador' } as const

/** Buscar propiedades desde cualquier pantalla del portal: lleva al listado público con la zona o tipo escritos. */
function Buscador() {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  return (
    <form
      role="search"
      className="relative w-full max-w-xl"
      onSubmit={(e) => {
        e.preventDefault()
        const q = texto.trim()
        router.push(q ? `/propiedades?zona=${encodeURIComponent(q)}` : '/propiedades')
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[var(--marca)]" aria-hidden />
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        type="search"
        placeholder="Buscar propiedades, zonas, tipos…"
        aria-label="Buscar propiedades"
        className="h-10 w-full rounded-lg border-0 bg-[#f1efec] pr-3 pl-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      />
    </form>
  )
}

type NotificacionCampana = { id: number; tipo: 'busqueda_nueva' | 'baja_de_precio' | 'legal' | 'sistema'; titulo: string; cuerpo: string | null; enlace: string | null; creada_en: string; leida_en: string | null }

/**
 * La campana del panel (28-oct-2026): como en las redes sociales, un NÚMERO en rojo con lo que no has visto. Cuenta los avisos SIN LEER de la bandeja (`notificaciones`: bajas de precio,
 * propiedades nuevas para tus búsquedas, cambios legales) más los pendientes del resumen (citas…); la fila «propiedades nuevas» del resumen NO se suma porque ya llega como aviso de la bandeja
 * (se contaría dos veces). Se actualiza sola cada minuto y al volver a la pestaña; abrir un aviso lo marca como leído y el número baja. El número se anuncia a lectores de pantalla.
 */
function Campana() {
  const { resumen } = useResumen()
  const { pedir } = useSesion()
  const [lista, setLista] = useState<NotificacionCampana[]>([])
  const [sinLeer, setSinLeer] = useState(0)
  const [falloAvisos, setFalloAvisos] = useState(false)
  const [abierta, setAbierta] = useState(false)
  // Generación de la lectura: si la persona marca algo MIENTRAS una lectura (el sondeo) viaja, esa respuesta vieja se descarta y no vuelve a subir el número.
  const generacion = useRef(0)

  const cargar = useCallback(async () => {
    const mia = generacion.current
    try {
      const r = await pedir<{ notificaciones: NotificacionCampana[]; sinLeer: number }>('/api/portal/notificaciones')
      if (mia !== generacion.current) return
      setLista(r.notificaciones ?? []); setSinLeer(r.sinLeer ?? 0); setFalloAvisos(false)
    } catch { if (mia === generacion.current) setFalloAvisos(true) }
  }, [pedir])

  useEffect(() => {
    void (async () => { await cargar() })() // la lectura inicial no escribe estado de forma síncrona en el efecto
    const cada = window.setInterval(() => { if (document.visibilityState === 'visible') void cargar() }, 60_000)
    const alVolver = () => { if (document.visibilityState === 'visible') void cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { window.clearInterval(cada); document.removeEventListener('visibilitychange', alVolver) }
  }, [cargar])

  async function marcar(ids?: number[]) {
    // Primero la pantalla (el número baja al instante) y luego el servidor; si falla, se vuelve a leer la verdad.
    generacion.current += 1
    const quita = ids ? lista.filter((n) => !n.leida_en && ids.includes(n.id)).length : sinLeer
    setSinLeer((n) => Math.max(0, n - quita))
    setLista((l) => l.map((n) => (!n.leida_en && (!ids || ids.includes(n.id)) ? { ...n, leida_en: new Date().toISOString() } : n)))
    try { await pedir('/api/portal/notificaciones', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) }) } catch { void cargar() }
  }

  const otros = (resumen?.avisos ?? []).filter((a) => a.id !== 'nuevas')
  const pendientes = sinLeer + otros.length
  const noLeidas = lista.filter((n) => !n.leida_en)
  const etiqueta = pendientes ? `Avisos: ${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}` : 'Avisos'
  return (
    <Popover open={abierta} onOpenChange={(o) => { setAbierta(o); if (o) void cargar() }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-campana-panel
          className="relative flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={etiqueta}
        >
          <Bell className="size-5" aria-hidden />
          {pendientes > 0 && (
            <span data-campana-numero className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#d62828] px-1 text-[0.65rem] leading-none font-bold text-white ring-2 ring-white" aria-hidden>
              {pendientes > 99 ? '99+' : pendientes}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="font-heading text-sm font-semibold">Avisos{pendientes > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{pendientes} sin leer</span>}</p>
          {sinLeer > 0 && <button type="button" onClick={() => void marcar()} className="text-xs font-semibold text-[var(--marca)] underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">Marcar todo como leído</button>}
        </div>
        {falloAvisos && <p role="alert" className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-950">No pudimos actualizar tus avisos. <button type="button" onClick={() => void cargar()} className="font-semibold underline">Reintentar</button></p>}
        {noLeidas.length === 0 && otros.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No tienes nada pendiente.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {noLeidas.slice(0, 8).map((n) => (
              <li key={`n${n.id}`}>
                <Link href={n.enlace ?? '/portal/alertas'} onClick={() => { void marcar([n.id]); setAbierta(false) }} className="flex gap-3 px-4 py-3 text-sm hover:bg-muted" data-aviso-sin-leer={n.id}>
                  {n.tipo === 'baja_de_precio' ? <TrendingDown className="mt-0.5 size-4 shrink-0 text-[var(--marca)]" aria-hidden /> : n.tipo === 'legal' ? <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : n.tipo === 'sistema' ? <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : <Home className="mt-0.5 size-4 shrink-0 text-[var(--marca)]" aria-hidden />}
                  <span className="min-w-0">
                    <span className="block font-semibold">{n.titulo}</span>
                    {n.cuerpo && <span className="block text-xs text-muted-foreground">{n.cuerpo}</span>}
                    <span className="text-xs text-muted-foreground">{haceCuanto(n.creada_en)}</span>
                  </span>
                </Link>
              </li>
            ))}
            {otros.map((a) => (
              <li key={a.id}>
                <Link href={a.enlace} className="flex gap-3 px-4 py-3 text-sm hover:bg-muted">
                  {a.urgente
                    ? <CalendarClock className="mt-0.5 size-4 shrink-0 text-[var(--marca)]" aria-hidden />
                    : <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--estado-aviso)]" aria-hidden />}
                  <span className="min-w-0">
                    <span className="block">{a.texto}</span>
                    {a.en && <span className="text-xs text-muted-foreground">{haceCuanto(a.en)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/portal/alertas" onClick={() => setAbierta(false)} className="block border-t px-4 py-2.5 text-center text-xs font-semibold text-[var(--marca)] hover:bg-muted">Ver todos mis avisos</Link>
      </PopoverContent>
    </Popover>
  )
}

export default function BarraSuperiorPortal() {
  const { perfil } = useSesion()
  const nombre = nombreCorto(perfil.nombre, perfil.email)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-white/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:gap-4 sm:px-6">
      <SidebarTrigger className="size-9 shrink-0" aria-label="Mostrar u ocultar el menú" />
      <div className="min-w-0 flex-1"><Buscador /></div>
      <p className="hidden shrink-0 items-center gap-1.5 text-sm text-[var(--panel-tinta-2)] xl:flex">
        <MapPin className="size-4 text-[var(--marca)]" aria-hidden /> León, Guanajuato, México
      </p>
      <Campana />
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
              <AvatarFallback className="bg-[var(--marca)] text-sm font-semibold text-white">{iniciales(perfil.nombre, perfil.email)}</AvatarFallback>
            </Avatar>
            <span className="hidden leading-tight md:block">
              <span className="block max-w-[11rem] truncate font-heading text-sm font-semibold">Hola, {nombre}</span>
              <span className="block text-xs text-muted-foreground">{PAPEL[perfil.rol ?? 'cliente']}</span>
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
          <DropdownMenuItem asChild><Link href="/portal/perfil"><UserRound aria-hidden /> Mi perfil</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href={RUTAS_DE_VISITAS.cliente}><CalendarClock aria-hidden /> Mis citas</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden /> Ver sitio web</a></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => signOut(auth)} className="text-[var(--estado-mal)] focus:text-[var(--estado-mal)]">
            <LogOut aria-hidden /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
