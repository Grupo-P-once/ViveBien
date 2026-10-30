'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, ChevronRight, History, House, LayoutDashboard, Mail, Megaphone, SearchCheck, ToggleLeft, Users, type LucideIcon, Receipt } from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FRASES_MARCA } from '@/lib/admin/panel-config'
import { useNuevaPropiedad } from './acciones'
import { useSesion } from './sesion'

/**
 * Barra lateral del panel, como en las referencias: cabecera roja con el logo,
 * fondo carbón y la foto con la frase de marca al pie.
 *
 * Sólo lleva lo que existe. Contenido, SEO, Marketing, Configuración,
 * Categorías, Etiquetas y «Roles y permisos» aparecen en las referencias pero no
 * son módulos del sitio: se ocultan hasta que existan (decisión del 16-sep).
 */

type Hijo = { titulo: string; enlace?: string; accion?: 'nueva-propiedad' }
type Entrada = { titulo: string; icono: LucideIcon; enlace?: string; hijos?: Hijo[] }

const MENU: Entrada[] = [
  { titulo: 'Dashboard', icono: LayoutDashboard, enlace: '/admin' },
  {
    titulo: 'Propiedades',
    icono: House,
    hijos: [
      { titulo: 'Mis propiedades', enlace: '/admin/propiedades' },
      { titulo: 'Nueva propiedad', accion: 'nueva-propiedad' },
      { titulo: 'Revisar', enlace: '/admin/propiedades/pendientes' },
    ],
  },
  { titulo: 'Formularios', icono: Mail, hijos: [{ titulo: 'Registros y solicitudes', enlace: '/admin/registros' }] },
  { titulo: 'Métricas', icono: BarChart3, enlace: '/admin/metricas' },
  { titulo: 'Usuarios', icono: Users, hijos: [{ titulo: 'Todos los usuarios', enlace: '/admin/usuarios' }] },
  { titulo: 'Comisiones', icono: Receipt, enlace: '/admin/comisiones' },
  { titulo: 'Actividad', icono: History, enlace: '/admin/actividad' },
  // Marketing es el grupo de los canales de promoción; hoy solo existe «Correos». Meta, Google Ads y publicidad en IA se agregan aquí cuando existan (sin enlaces vacíos).
  { titulo: 'Marketing', icono: Megaphone, hijos: [{ titulo: 'Correos', enlace: '/admin/marketing' }] },
]

/** «Comisiones» para Super Admin: los cierres y, debajo, la contabilidad de lo que entra y lo que sale (25-oct-2026). */
const COMISIONES_SUPER: Entrada = {
  titulo: 'Comisiones',
  icono: Receipt,
  hijos: [{ titulo: 'Cierres y comisiones', enlace: '/admin/comisiones' }, { titulo: 'Contabilidad', enlace: '/admin/contabilidad' }],
}

/** Sólo para Super Admin: encender y apagar módulos (D-31) y el apartado SEO (22-oct-2026, solo lectura). */
const MENU_SUPER: Entrada[] = [
  {
    titulo: 'SEO',
    icono: SearchCheck,
    hijos: [
      { titulo: 'Resumen', enlace: '/admin/seo' },
      { titulo: 'Indexación', enlace: '/admin/seo/indexacion' },
      { titulo: 'Rendimiento', enlace: '/admin/seo/rendimiento' },
      { titulo: 'Salud técnica', enlace: '/admin/seo/salud' },
      { titulo: 'Robots y sitemap', enlace: '/admin/seo/robots' },
      { titulo: 'Negocio y local', enlace: '/admin/seo/negocio' },
      { titulo: 'Qué hacer', enlace: '/admin/seo/tareas' },
      { titulo: 'IA y respuestas', enlace: '/admin/seo/ia' },
    ],
  },
  { titulo: 'Configuración', icono: ToggleLeft, hijos: [{ titulo: 'Feature Flags', enlace: '/admin/configuracion' }] },
]

const BOTON = 'h-11 gap-3 rounded-lg px-3 text-[0.92rem] font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-white data-[active=true]:bg-[var(--marca)] data-[active=true]:text-white data-[active=true]:shadow-sm [&>svg]:size-[1.15rem]'

function activa(ruta: string, enlace: string): boolean {
  if (enlace === '/admin' || enlace === '/admin/seo') return ruta === enlace   // «Resumen» no debe quedar activa dentro de las otras páginas de SEO
  // «Mis propiedades» no debe quedar activa dentro de «Revisar»; sí cuando se trabaja una ficha (el editor se pinta dentro de este mismo panel).
  if (enlace === '/admin/propiedades') return ruta === enlace || (ruta.startsWith(`${enlace}/`) && !ruta.startsWith('/admin/propiedades/pendientes'))
  return ruta === enlace || ruta.startsWith(`${enlace}/`)
}

export default function BarraLateral() {
  const ruta = usePathname() ?? ''
  const { setOpenMobile, isMobile } = useSidebar()
  const { crear, creando } = useNuevaPropiedad()
  const { perfil } = useSesion()
  const cerrarEnMovil = () => setOpenMobile(false)
  // En el teléfono la barra es un cajón (otra capa modal): se cierra PRIMERO y la ventana de «Nueva propiedad» se abre cuando ya terminó.
  // Abrir las dos a la vez deja la página sin recibir clics (el primer clic posterior, p. ej. en «Revisar», se perdía).
  const abrirNueva = () => { if (isMobile) { cerrarEnMovil(); window.setTimeout(crear, 350) } else crear() }
  // Super Admin: «Comisiones» se despliega y trae «Contabilidad» (libro diario, gastos y análisis del dinero). Para el resto sigue siendo un solo enlace.
  const menu = perfil.superAdmin ? [...MENU.map((e) => (e.titulo === 'Comisiones' ? COMISIONES_SUPER : e)), ...MENU_SUPER] : MENU

  return (
    <Sidebar collapsible="offcanvas" className="border-r-0">
      <SidebarHeader className="relative gap-0 p-0">
        <Link
          href="/admin"
          onClick={cerrarEnMovil}
          className="relative flex h-[74px] items-center justify-center bg-[var(--marca)] outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="Vive Bien — ir al dashboard"
        >
          <Image src="/panel/logo-blanco.png" alt="Vive Bien Grupo Inmobiliario" width={96} height={64} className="h-12 w-auto" priority />
        </Link>
        {/* La muesca roja bajo el logo, como en la referencia. */}
        <span aria-hidden className="absolute -bottom-2 left-1/2 size-4 -translate-x-1/2 rotate-45 bg-[var(--marca)]" />
      </SidebarHeader>

      <SidebarContent className="px-3 pt-6 pb-4">
        <nav aria-label="Panel de administración">
          <SidebarMenu className="gap-1">
            {menu.map((entrada) => {
              const Icono = entrada.icono
              if (!entrada.hijos) {
                return (
                  <SidebarMenuItem key={entrada.titulo}>
                    <SidebarMenuButton asChild isActive={activa(ruta, entrada.enlace!)} className={BOTON}>
                      <Link href={entrada.enlace!} onClick={cerrarEnMovil}>
                        <Icono aria-hidden />
                        <span>{entrada.titulo}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              }

              const algunaActiva = entrada.hijos.some((h) => h.enlace && activa(ruta, h.enlace))
              return (
                <Collapsible key={entrada.titulo} asChild defaultOpen={algunaActiva} className="group/grupo">
                  {/* `asChild`: la lista sólo puede contener <li> (axe: list/listitem). */}
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton isActive={algunaActiva} className={BOTON}>
                        <Icono aria-hidden />
                        <span>{entrada.titulo}</span>
                        <ChevronRight
                          aria-hidden
                          className="ml-auto !size-4 opacity-70 transition-transform group-data-[state=open]/grupo:rotate-90"
                        />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="mx-0 mt-1 gap-0.5 border-l-0 px-0 pl-9">
                        {entrada.hijos.map((hijo) => (
                          <SidebarMenuSubItem key={hijo.titulo}>
                            {hijo.accion === 'nueva-propiedad' ? (
                              <SidebarMenuSubButton asChild className="h-9 cursor-pointer text-[0.86rem] text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white">
                                <button type="button" onClick={abrirNueva} disabled={creando}>
                                  {creando ? 'Creando borrador…' : hijo.titulo}
                                </button>
                              </SidebarMenuSubButton>
                            ) : (
                              <SidebarMenuSubButton
                                asChild
                                isActive={activa(ruta, hijo.enlace!)}
                                className="h-9 text-[0.86rem] text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-white"
                              >
                                <Link href={hijo.enlace!} onClick={cerrarEnMovil}>{hijo.titulo}</Link>
                              </SidebarMenuSubButton>
                            )}
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )
            })}
          </SidebarMenu>
        </nav>
      </SidebarContent>

      <SidebarFooter className="p-0 [@media(max-height:760px)]:hidden">
        <div className="relative h-52 overflow-hidden">
          <Image src="/panel/barra-foto.webp" alt="" fill sizes="16rem" className="object-cover" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[var(--panel-barra)] via-[var(--panel-barra)]/30 to-black/60" />
          <p className="frase-marca absolute right-6 bottom-9 left-6 text-[1.2rem] leading-snug text-white">
            “{FRASES_MARCA.historias}”
          </p>
          <span aria-hidden className="absolute bottom-6 left-6 h-0.5 w-9 bg-[var(--marca)]" />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
