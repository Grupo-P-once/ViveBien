'use client'

import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight, BarChart3, Bell, Bookmark, CalendarDays, ChevronRight, Clock, Heart, House, MessageSquare, RefreshCw, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSesion } from '@/components/admin/sesion'
import { useResumen } from '@/components/portal/resumen'
import { useGuardadas } from '@/components/portal/guardadas'
import TarjetaPropiedad from '@/components/portal/TarjetaPropiedad'
import AppointmentStatus from '@/components/citas/AppointmentStatus'
import { nombreCorto, saludoPara } from '@/lib/admin/saludo'
import { entero, fechaCorta, precio } from '@/lib/admin/formato'
import { fechaLarga, horaCorta } from '@/lib/citas/zona'
import { tipoEtiqueta } from '@/lib/portal/tarjeta'
import { cn } from '@/lib/utils'
import { RUTAS_DE_VISITAS, VISITAS_TIENEN_PANTALLA, rutaDeVisitas } from '@/lib/citas/enlaces'

/**
 * Inicio del portal del cliente — mockup design/references/05-portal-inicio.webp.
 *
 * Todo sale de `/api/portal/resumen`. Donde el mockup enseña algo que todavía
 * no existe (estados de seguimiento de una consulta, avisos por correo), aquí
 * no se pinta: se dice lo que sí hay.
 */

const TARJETAS = [
  { clave: 'guardadas', titulo: ['Propiedades', 'guardadas'], icono: Heart, tono: 'bg-[var(--marca-tinte)] text-[var(--marca)]', enlace: '/portal/propiedades?vista=guardadas' },
  { clave: 'busquedas', titulo: ['Búsquedas', 'activas'], icono: Bookmark, tono: 'bg-[#e9f1fb] text-[#1d5fae]', enlace: '/portal/busquedas' },
  { clave: 'nuevas', titulo: ['Nuevas', 'coincidencias'], icono: Bell, tono: 'bg-[var(--marca-tinte)] text-[var(--marca)]', enlace: '/portal/alertas' },
  // Sin pantalla de visitas todavía (3b-2): la tarjeta informa, no enlaza.
  { clave: 'visitas', titulo: ['Visitas', 'agendadas'], icono: CalendarDays, tono: 'bg-[#e8f5ee] text-[#067647]', enlace: VISITAS_TIENEN_PANTALLA ? RUTAS_DE_VISITAS.cliente : null },
] as const

function Seccion({ titulo, icono: Icono, enlace, extra, children, className }: {
  titulo: string
  icono: typeof Heart
  enlace?: string
  extra?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,.04)]', className)}>
      <header className="mb-3 flex items-center gap-3">
        <Icono className="size-5 text-[var(--marca)]" aria-hidden />
        <h2 className="flex-1 font-heading text-[1.02rem] font-semibold">{titulo}</h2>
        {extra}
        {enlace && (
          <Link href={enlace} className="flex items-center gap-1 text-sm font-medium text-[var(--marca)] hover:underline">
            Ver todas <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </header>
      {children}
    </section>
  )
}

/** Enlace si hay a dónde ir; si no, el mismo bloque sin enlazar a un 404. */
function Enlace({ href, className, children }: { href: string | null; className?: string; children: React.ReactNode }) {
  if (!href) return <div className={className}>{children}</div>
  return <Link href={href} className={className}>{children}</Link>
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-[var(--panel-fondo)] px-4 py-5 text-center text-sm text-muted-foreground">{children}</p>
}

export default function PortalInicio() {
  const { perfil } = useSesion()
  const { resumen, error, recargar } = useResumen()
  const { esGuardada, alternar } = useGuardadas()
  const nombre = nombreCorto(perfil.nombre, perfil.email)

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Portada */}
      <section className="relative overflow-hidden rounded-2xl border bg-card">
        <Image src="/hero-industrial.jpg" alt="" fill priority sizes="(min-width:1024px) 70vw, 100vw" className="object-cover object-[70%_60%]" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-white via-white/92 to-white/10 sm:via-white/85 lg:via-white/70 lg:to-transparent" />
        <div className="relative flex flex-col gap-6 px-6 py-8 sm:px-10 sm:py-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="versal text-muted-foreground">Portal de cliente</p>
            <h1 className="mt-3 font-[family-name:var(--font-frase)] text-[2rem] leading-tight text-foreground sm:text-[2.4rem]">
              ¡{saludoPara(new Date())}, <span className="font-heading font-bold text-[var(--marca)]">{nombre}!</span>
            </h1>
            <p className="mt-3 text-[1.05rem] text-[var(--panel-tinta-2)]">Encuentra el espacio ideal para lo que quieres construir.</p>
            <Button asChild className="mt-6 h-11 bg-[var(--marca)] px-5 text-white hover:bg-[var(--marca-hover)]">
              <Link href="/propiedades"><Search aria-hidden /> Buscar propiedades <ArrowRight aria-hidden /></Link>
            </Button>
          </div>
          <p className="frase-marca hidden max-w-[13rem] self-start text-[1.45rem] leading-snug text-foreground lg:block">
            Más que propiedades, mejores historias.
            <span aria-hidden className="mt-3 block h-0.5 w-10 bg-[var(--marca)]" />
          </p>
        </div>
      </section>

      {error && !resumen && (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-10 text-center" role="alert">
          <p className="font-medium">No se pudo cargar tu portal.</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={recargar}><RefreshCw aria-hidden /> Reintentar</Button>
        </div>
      )}

      {/* Cuatro accesos */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TARJETAS.map((t) => {
          const Icono = t.icono
          const n = resumen?.tarjetas[t.clave]
          return (
            <Enlace
              key={t.clave}
              href={t.enlace}
              className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(20,20,20,.04)] transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
            >
              <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', t.tono)}><Icono className="size-6" aria-hidden /></span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block font-heading text-2xl font-bold">{n === undefined ? <span className="inline-block h-6 w-8 animate-pulse rounded bg-muted align-middle" /> : entero(n)}</span>
                <span className="mt-0.5 block text-sm text-[var(--panel-tinta-2)]">{t.titulo[0]} {t.titulo[1]}</span>
              </span>
              {t.enlace && <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />}
            </Enlace>
          )
        })}
      </div>

      {/* Nuevas para ti + Tu búsqueda */}
      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="xl:col-span-9">
          <header className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-3 font-heading text-[1.3rem] font-bold">
                <span aria-hidden className="h-0.5 w-8 bg-[var(--marca)]" />
                {resumen?.paraTi.criterio === 'recientes' ? 'Lo más reciente' : 'Nuevas propiedades para ti'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {resumen?.paraTi.criterio === 'recientes'
                  ? 'Todavía no sabemos qué buscas: cuéntanos en «Mis búsquedas» y elegimos por ti.'
                  : 'Basadas en tus búsquedas y preferencias'}
              </p>
            </div>
            <Link href="/propiedades" className="flex items-center gap-1 text-sm font-medium text-[var(--marca)] hover:underline">
              Ver todas <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </header>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {!resumen && Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[330px] animate-pulse rounded-xl border bg-card" />)}
            {resumen?.paraTi.propiedades.map((p) => (
              <TarjetaPropiedad key={p.id} p={p} guardada={esGuardada(p.id)} onAlternar={alternar} />
            ))}
            {resumen && resumen.paraTi.propiedades.length === 0 && <Vacio>Por ahora no hay propiedades publicadas.</Vacio>}
          </div>
        </section>

        <Seccion
          titulo="Tu búsqueda"
          icono={BarChart3}
          className="xl:col-span-3"
          extra={resumen?.tuBusqueda ? <Link href="/portal/busquedas#lo-que-busco" className="text-sm font-medium text-[var(--marca)] hover:underline">Editar</Link> : null}
        >
          {!resumen ? <div className="h-48 animate-pulse rounded-lg bg-muted" /> : !resumen.tuBusqueda ? (
            <div className="flex flex-1 flex-col justify-between gap-4">
              <p className="text-sm text-muted-foreground">Dinos tu presupuesto, zonas y tipo de propiedad, y te enseñamos primero lo que te sirve.</p>
              <Button asChild variant="outline" className="border-[var(--marca)] text-[var(--marca)] hover:bg-[var(--marca-tinte)] hover:text-[var(--marca)]">
                <Link href="/portal/busquedas#lo-que-busco">Contar qué busco</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {resumen.tuBusqueda.presupuestoMax ? (
                <div className="border-t pt-3">
                  <p className="text-sm text-muted-foreground">Presupuesto máximo</p>
                  <p className="font-heading text-2xl font-bold">{precio(resumen.tuBusqueda.presupuestoMax)}</p>
                </div>
              ) : null}
              {resumen.tuBusqueda.zonas.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">Zonas de interés</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {resumen.tuBusqueda.zonas.map((z) => <li key={z} className="rounded-full border px-3 py-1 text-sm">{z}</li>)}
                  </ul>
                </div>
              )}
              {resumen.tuBusqueda.tipos.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">Tipos de propiedad</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {resumen.tuBusqueda.tipos.map((t) => <li key={t} className="rounded-full border px-3 py-1 text-sm">{tipoEtiqueta(t)}</li>)}
                  </ul>
                </div>
              )}
              <p className="flex gap-3 rounded-lg bg-[var(--marca-tinte)] p-3 text-sm text-[var(--panel-tinta-2)]">
                <BarChart3 className="mt-0.5 size-4 shrink-0 text-[var(--marca)]" aria-hidden />
                Con esto elegimos las propiedades de «Nuevas para ti».
              </p>
            </div>
          )}
        </Seccion>
      </div>

      {/* Consultas, visitas, búsquedas */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Seccion titulo="Mis consultas" icono={MessageSquare} enlace="/portal/consultas">
          {!resumen ? <div className="h-32 animate-pulse rounded-lg bg-muted" /> : resumen.consultas.length === 0 ? (
            <Vacio>Todavía no has preguntado por ninguna propiedad.</Vacio>
          ) : (
            <ul className="space-y-2.5">
              {resumen.consultas.map((c) => (
                <li key={c.id}>
                  <Link href={c.propiedad?.ruta ?? '/portal/consultas'} className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-muted/50">
                    <Miniatura src={c.propiedad?.foto ?? null} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{c.titulo}</span>
                      <span className="block text-xs text-muted-foreground">{fechaCorta(c.creadoEn)}</span>
                    </span>
                    <span className="shrink-0 rounded-md bg-[#e8f5ee] px-2 py-0.5 text-xs font-semibold text-[#067647]">Enviada</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <Seccion titulo="Próximas visitas" icono={CalendarDays} enlace={VISITAS_TIENEN_PANTALLA ? rutaDeVisitas('cliente') : undefined}>
          {!resumen ? <div className="h-32 animate-pulse rounded-lg bg-muted" /> : (
            <div className="flex flex-1 flex-col gap-3">
              {resumen.proximasVisitas.length === 0 ? <Vacio>No tienes visitas agendadas.</Vacio> : (
                <ul className="space-y-2.5">
                  {resumen.proximasVisitas.map((v) => (
                    <li key={v.id}>
                      <Enlace href={VISITAS_TIENEN_PANTALLA ? rutaDeVisitas('cliente', v.id) : null} className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-muted/50">
                        <Miniatura src={v.propiedad?.foto ?? null} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{v.propiedad?.titulo ?? 'Visita'}</span>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3" aria-hidden /><span className="first-letter:uppercase">{fechaLarga(new Date(v.inicio))}</span></span>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="size-3" aria-hidden />{horaCorta(new Date(v.inicio))}</span>
                        </span>
                        <AppointmentStatus estado={v.estado} />
                        {VISITAS_TIENEN_PANTALLA && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                      </Enlace>
                    </li>
                  ))}
                </ul>
              )}
              {/* Agendar en línea sólo existe si el módulo está encendido (D-32). */}
              {resumen.citasEnLinea && (
                <div className="mt-auto flex flex-col gap-3 rounded-lg bg-[var(--marca-tinte)] p-3 sm:flex-row sm:items-center">
                  <CalendarDays className="hidden size-6 shrink-0 text-[var(--marca)] sm:block" aria-hidden />
                  <p className="flex-1 text-sm text-[var(--panel-tinta-2)]">¿Te interesa agendar una visita? Nuestro equipo te acompaña en todo el proceso.</p>
                  <Button asChild variant="outline" className="shrink-0 border-[var(--marca)] bg-white text-[var(--marca)] hover:bg-[var(--marca-tinte)] hover:text-[var(--marca)]">
                    <Link href={`${rutaDeVisitas('cliente')}?agendar=1`}>Solicitar visita</Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </Seccion>

        <Seccion titulo="Búsquedas guardadas" icono={Bookmark} enlace="/portal/busquedas">
          {!resumen ? <div className="h-32 animate-pulse rounded-lg bg-muted" /> : resumen.busquedas.length === 0 ? (
            <Vacio>Guarda una búsqueda desde el listado de propiedades y aquí verás cuántas hay y cuántas son nuevas.</Vacio>
          ) : (
            <ul className="space-y-2.5">
              {resumen.busquedas.map((b) => (
                <li key={b.id}>
                  <Link href={b.href} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{b.nombre}</span>
                      <span className="block text-xs text-muted-foreground">
                        {b.total === 1 ? '1 resultado' : `${entero(b.total)} resultados`}
                        {b.nuevas > 0 && <span className="ml-2 font-semibold text-[var(--marca)]">{b.nuevas === 1 ? '1 nueva' : `${b.nuevas} nuevas`}</span>}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      </div>
    </main>
  )
}

function Miniatura({ src }: { src: string | null }) {
  return (
    <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" loading="lazy" className="size-full object-cover" />
        : <House className="size-5" aria-hidden />}
    </span>
  )
}
