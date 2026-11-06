'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { Bell, BarChart3, Bookmark, Building2, Calculator, CalendarDays, ChevronDown, ClipboardList, Heart, House, LayoutDashboard, LogOut, MessageSquare, Plus, Search, Send, Settings, UserRound, type LucideIcon } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FRASES_MARCA } from '@/lib/admin/panel-config'
import { useSesion } from '@/components/admin/sesion'
import { useResumen } from './resumen'
import { puede } from '@/lib/acceso/permisos'
import { pantallaExiste } from '@/lib/portal/rutas'
import { RUTAS_DE_VISITAS } from '@/lib/citas/enlaces'
import { useNuevaPropiedad } from '@/components/admin/acciones'
import { ETIQUETAS_PROPIEDADES, RUTA_EN_REVISION, RUTA_LISTA_PUBLICADOR, ofreceEnRevision } from '@/lib/publicador/espacio'
import { etiquetaDeModalidad } from '@/lib/acceso/capacidades'
import { cn } from '@/lib/utils'

/**
 * Menú del portal, por SECCIONES (24-oct-2026). Antes era una lista de ~16 entradas seguidas —sobre todo para quien publica, que sumaba las suyas a las
 * del cliente— y se hacía enorme y sin orden. Ahora:
 *
 *   Inicio                       (suelto, siempre arriba)
 *   MI CARTERA                   Mis propiedades · Nueva propiedad · En revisión · Mis métricas       (solo quien publica; abierta)
 *   EXPLORAR                     Buscar propiedades · Valuador · (Vender / Rentar mi propiedad, cuando exista)
 *   MI ACTIVIDAD                 Guardadas · Mis búsquedas · Mis alertas · Citas · Mis consultas
 *                                (para quien publica empieza plegada: lo suyo va primero)
 *   MI CUENTA                    Mi perfil · Configuración · Cerrar sesión
 *   ADMINISTRACIÓN               Panel de administración   (solo quien puede)
 *
 * Cada sección se pliega con su título y el menú RECUERDA lo que cada persona plegó (en este navegador). Una sección con la pantalla actual nunca se
 * queda plegada: así siempre se ve dónde estás. Los enlaces de una sección plegada siguen en la página (ocultos), no desaparecen.
 *
 * Es presentación: el servidor decide qué se puede hacer. Barra roja como en su mockup (la del admin es carbón).
 */

type Entrada = { titulo: string; icono: LucideIcon; enlace?: string; contador?: 'alertas'; accion?: 'nueva-propiedad' }
type IdSeccion = 'propias' | 'buscar' | 'actividad' | 'cuenta' | 'admin'

// Lo del CLIENTE. Lo de quien publica va aparte (`propias`), con su capacidad; nunca aquí.
const MENU: Record<'buscar' | 'actividad' | 'cuenta', Entrada[]> = {
  buscar: [
    { titulo: 'Buscar propiedades', icono: Search, enlace: '/propiedades' },
    // El valuador sigue siendo el mismo de la página pública, pero dentro del portal para que la barra no desaparezca.
    { titulo: 'Valuador', icono: Calculator, enlace: '/portal/valuador' },
    // Pendiente (3b-3): no se pinta hasta que exista la pantalla (`pantallaExiste`).
    { titulo: 'Vender mi propiedad', icono: Building2, enlace: '/portal/mi-propiedad?operacion=venta' },
    { titulo: 'Rentar mi propiedad', icono: Building2, enlace: '/portal/mi-propiedad?operacion=renta' },
  ],
  actividad: [
    // «Por revisar» queda fuera (D-27.1): no hay dato que la llene —ninguna visita a una ficha guarda quién la vio— y no se enseña lo que no existe.
    { titulo: 'Guardadas', icono: Heart, enlace: '/portal/propiedades?vista=guardadas' },
    { titulo: 'Mis búsquedas', icono: Bookmark, enlace: '/portal/busquedas' },   // «Mi búsqueda» es la sección «Lo que busco» dentro de esta
    { titulo: 'Mis alertas', icono: Bell, enlace: '/portal/alertas', contador: 'alertas' },
    { titulo: 'Citas', icono: CalendarDays, enlace: RUTAS_DE_VISITAS.cliente },
    { titulo: 'Mis consultas', icono: MessageSquare, enlace: '/portal/consultas' },
  ],
  cuenta: [
    { titulo: 'Mi perfil', icono: UserRound, enlace: '/portal/perfil' },
    { titulo: 'Configuración', icono: Settings, enlace: '/portal/configuracion' },
  ],
}

const TITULO_SECCION: Record<IdSeccion, string> = { propias: 'Mi cartera', buscar: 'Explorar', actividad: 'Mi actividad', cuenta: 'Mi cuenta', admin: 'Administración' }
const BOTON = 'h-10 gap-3 rounded-lg px-3 text-[0.9rem] font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-white data-[active=true]:bg-[#a51d1d] data-[active=true]:text-white data-[active=true]:shadow-sm [&>svg]:size-[1.1rem]'
const CLAVE_MEMORIA = 'vb.portal.menu.v1'

/** ¿Este enlace es la pantalla actual? Con `?vista=` / `?operacion=` se compara también eso. */
function activa(ruta: string, busqueda: URLSearchParams, enlace: string): boolean {
  const [camino, consulta] = enlace.split('?')
  if (camino === '/portal') return ruta === '/portal'
  if (ruta !== camino && !ruta.startsWith(`${camino}/`)) return false
  // «Mis propiedades» no se queda activa cuando se mira el filtro «En revisión» de la misma pantalla.
  if (!consulta) return !(camino === '/portal/mis-propiedades' && (busqueda.get('estado') || busqueda.get('nueva')))
  const quiere = new URLSearchParams(consulta)
  return [...quiere.entries()].every(([k, v]) => (busqueda.get(k) ?? (k === 'vista' ? 'guardadas' : k === 'operacion' ? 'venta' : '')) === v)
}

function leerMemoria(): Partial<Record<IdSeccion, boolean>> {
  try { const t = window.localStorage.getItem(CLAVE_MEMORIA); const o = t ? JSON.parse(t) : {}; return o && typeof o === 'object' ? o : {} } catch { return {} }
}
function guardarMemoria(m: Partial<Record<IdSeccion, boolean>>) {
  try { window.localStorage.setItem(CLAVE_MEMORIA, JSON.stringify(m)) } catch { /* sin almacenamiento: no se recuerda */ }
}

const iniciales = (nombre: string | null, email: string | null) => ((nombre || email || '?').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?')

export default function BarraLateralPortal() {
  const ruta = usePathname() ?? ''
  const busqueda = useSearchParams()
  const { setOpenMobile, isMobile } = useSidebar()
  const { perfil } = useSesion()
  const { resumen } = useResumen()
  const cerrarEnMovil = () => setOpenMobile(false)
  // En el teléfono la barra es un cajón (otra capa modal): se cierra PRIMERO y la ventana de «Nueva propiedad» se abre cuando ya terminó.
  // Abrir las dos a la vez deja la página sin recibir clics (el primer clic posterior, p. ej. en «Revisar», se perdía).
  const abrirNueva = () => { if (isMobile) { cerrarEnMovil(); window.setTimeout(crear, 350) } else crear() }
  const { crear, creando } = useNuevaPropiedad()
  const alertas = resumen?.tarjetas.nuevas ?? 0

  // Lo que la persona plegó o abrió a mano (se lee al montar: el almacenamiento no existe en el servidor).
  const [memoria, setMemoria] = useState<Partial<Record<IdSeccion, boolean>>>({})
  useEffect(() => { const t = setTimeout(() => setMemoria(leerMemoria()), 0); return () => clearTimeout(t) }, [])
  const poner = useCallback((id: IdSeccion, abierta: boolean) => setMemoria((m) => { const n = { ...m, [id]: abierta }; guardarMemoria(n); return n }), [])

  // Sólo se enseña lo que ya existe: un enlace a un 404 es peor que no tener el enlace (D-32). Las pantallas que faltan entran solas al añadir su
  // ruta en `lib/portal/rutas.ts`.
  const existentes = (l: Entrada[]) => l.filter((e) => pantallaExiste(e.enlace ?? '/portal'))

  // Lo que publica quien tiene la capacidad: «Mis propiedades», «Nueva propiedad», «Mis métricas» y, sólo para el publicador que NO es asociado,
  // «En revisión». Todo dentro de este mismo portal (R8.3): nada lleva a otro panel. Es presentación; el servidor decide qué se ve.
  const publica = puede({ rol: perfil.rol ?? 'cliente', superAdmin: perfil.superAdmin }, 'propiedad.gestionar_propias')
  const propias: Entrada[] = publica
    ? [
        { titulo: ETIQUETAS_PROPIEDADES.mis, icono: ClipboardList, enlace: RUTA_LISTA_PUBLICADOR },
        { titulo: ETIQUETAS_PROPIEDADES.nueva, icono: Plus, accion: 'nueva-propiedad' },
        ...(ofreceEnRevision(perfil) ? [{ titulo: ETIQUETAS_PROPIEDADES.enRevision, icono: Send, enlace: RUTA_EN_REVISION }] : []),
        { titulo: 'Mis métricas', icono: BarChart3, enlace: '/portal/mis-metricas' },
      ]
    : []
  const esAdmin = puede({ rol: perfil.rol ?? 'cliente', superAdmin: perfil.superAdmin }, 'panel.admin')
  const admin: Entrada[] = esAdmin ? [{ titulo: 'Panel de administración', icono: LayoutDashboard, enlace: '/admin' }] : []

  // Quien publica ve primero lo suyo y su actividad como cliente empieza plegada; el cliente ve su actividad abierta.
  const secciones: Array<{ id: IdSeccion; entradas: Entrada[]; porDefecto: boolean }> = [
    { id: 'propias' as const, entradas: propias, porDefecto: true },
    { id: 'buscar' as const, entradas: existentes(MENU.buscar), porDefecto: true },
    { id: 'actividad' as const, entradas: existentes(MENU.actividad), porDefecto: !publica },
    { id: 'cuenta' as const, entradas: existentes(MENU.cuenta), porDefecto: true },
    { id: 'admin' as const, entradas: admin, porDefecto: true },
  ].filter((s) => s.entradas.length > 0)

  const rolTexto = esAdmin ? 'Administración' : publica ? etiquetaDeModalidad(perfil.tipoPublicador) : 'Cliente'
  const nombre = perfil.nombre || perfil.email || 'Tu cuenta'

  const fila = (entrada: Entrada) => {
    const Icono = entrada.icono
    if (entrada.accion === 'nueva-propiedad') {
      return (
        <SidebarMenuItem key={entrada.titulo}>
          <SidebarMenuButton className={BOTON} disabled={creando} onClick={abrirNueva}>
            <Icono aria-hidden />
            <span>{entrada.titulo}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    }
    const cuenta = entrada.contador === 'alertas' ? alertas : 0
    return (
      <SidebarMenuItem key={entrada.titulo}>
        <SidebarMenuButton asChild isActive={activa(ruta, busqueda, entrada.enlace!)} className={BOTON}>
          <Link href={entrada.enlace!} onClick={cerrarEnMovil}>
            <Icono aria-hidden />
            <span>{entrada.titulo}</span>
          </Link>
        </SidebarMenuButton>
        {cuenta > 0 && (
          <SidebarMenuBadge className="top-2 right-2 flex size-6 items-center justify-center rounded-full bg-[#d62828] p-0 text-[0.72rem] font-bold text-white">
            {cuenta > 9 ? '9+' : cuenta}
            <span className="sr-only"> nuevas</span>
          </SidebarMenuBadge>
        )}
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar collapsible="offcanvas" className="border-r-0">
      <SidebarHeader className="px-5 pt-5 pb-1">
        <Link href="/portal" onClick={cerrarEnMovil} className="flex items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/70" aria-label="Vive Bien — ir al inicio de tu portal">
          <Image src="/panel/logo-blanco.png" alt="Vive Bien Grupo Inmobiliario" width={132} height={87} className="h-12 w-auto" priority />
        </Link>
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-black/15 px-3 py-2" data-persona-menu>
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-[0.82rem] font-bold text-white">{iniciales(perfil.nombre, perfil.email)}</span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[0.88rem] font-semibold text-white">{nombre}</span>
            <span className="block text-[0.72rem] text-white/70">{rolTexto}</span>
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-3 pt-3 pb-3">
        <nav aria-label="Tu portal">
          <SidebarMenu className="gap-0.5">
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={activa(ruta, busqueda, '/portal')} className={BOTON}>
                <Link href="/portal" onClick={cerrarEnMovil}><House aria-hidden /><span>Inicio</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          {secciones.map((s) => {
            const conActiva = s.entradas.some((e) => e.enlace && activa(ruta, busqueda, e.enlace))
            const abierta = conActiva ? true : (memoria[s.id] ?? s.porDefecto)
            return (
              <SidebarGroup key={s.id} className="p-0 pt-3">
                <Collapsible open={abierta} onOpenChange={(v) => poner(s.id, v)}>
                  <CollapsibleTrigger className="group/sec flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[0.68rem] font-semibold tracking-[0.14em] text-white/65 uppercase outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/70">
                    <span>{TITULO_SECCION[s.id]}</span>
                    <ChevronDown aria-hidden className={cn('size-3.5 transition-transform', !abierta && '-rotate-90')} />
                  </CollapsibleTrigger>
                  {/* `forceMount` deja los enlaces en la página aunque la sección esté plegada, pero NO los oculta (Radix solo oculta lo que desmonta):
                      la clase `data-[state=closed]:hidden` es lo que los esconde. */}
                  <CollapsibleContent forceMount className="data-[state=closed]:hidden">
                    <SidebarMenu className="mt-0.5 gap-0.5">
                      {s.entradas.map(fila)}
                      {s.id === 'cuenta' && (
                        <SidebarMenuItem>
                          <SidebarMenuButton className={BOTON} onClick={() => signOut(auth)}>
                            <LogOut aria-hidden />
                            <span>Cerrar sesión</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                    </SidebarMenu>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarGroup>
            )
          })}
        </nav>
      </SidebarContent>

      <SidebarFooter className="p-0 [@media(max-height:820px)]:hidden">
        <div className="relative h-40 overflow-hidden">
          <Image src="/panel/barra-foto.webp" alt="" fill sizes="16rem" className="object-cover" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[var(--sidebar)] via-[var(--sidebar)]/35 to-black/55" />
          <p className="frase-marca absolute right-6 bottom-7 left-6 text-[1.15rem] leading-snug text-white">
            {FRASES_MARCA.espacios}
          </p>
          <span aria-hidden className="absolute bottom-5 left-6 h-0.5 w-9 bg-white/80" />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
