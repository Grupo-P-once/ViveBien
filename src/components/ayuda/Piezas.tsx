import Link from 'next/link'
import {
  Bell, BarChart3, Calendar, ChevronRight, FileText, Heart, Home, Lock, Search, Tag, User,
  type LucideIcon,
} from 'lucide-react'
import { ETIQUETA_DEL_PRODUCTO, type EstadoDelProducto } from '@/lib/ayuda/modelo'

/**
 * Las piezas del Centro de Ayuda (V-1.1.94, fase 3c-3).
 *
 * ─────────────────────────────────────────────────────────────
 * LA PIEZA MÁS IMPORTANTE ES `AvisoDelProducto`
 *
 * Trece artículos del Centro describen funcionalidades de fases 4 a 12, y
 * tres describen cosas que funcionan a medias. Esos son los peligrosos,
 * porque **parecen disponibles**: las alertas se ven en el portal pero no
 * mandan correo.
 *
 * El aviso no es un adorno. Es lo que separa «documentar lo que viene» de
 * «prometer lo que no hay». Va arriba, antes del cuerpo, y no se puede
 * cerrar.
 * ─────────────────────────────────────────────────────────────
 */

const ICONOS: Record<string, LucideIcon> = {
  home: Home, user: User, heart: Heart, bell: Bell,
  calendar: Calendar, tag: Tag, chart: BarChart3, lock: Lock, file: FileText,
}

/**
 * Marco rojo suave con el icono dentro, como en el montaje.
 *
 * `pequeno` es para la barra lateral, donde 44 px de marco por cada una de
 * las nueve categorías dejarían la lista en un muro de cuadros rojos.
 */
export function IconoDeCategoria({ nombre, grande, pequeno }: {
  nombre?: string | null; grande?: boolean; pequeno?: boolean
}) {
  const Icono = ICONOS[nombre ?? ''] ?? FileText
  const marco = grande ? 'size-14' : pequeno ? 'size-7 rounded-lg' : 'size-11'
  const dentro = grande ? 'size-6' : pequeno ? 'size-4' : 'size-5'
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--rojo-marca)_9%,transparent)] ${marco}`}
    >
      <Icono className={dentro} style={{ color: 'var(--rojo-marca)' }} />
    </span>
  )
}

/**
 * Lo que impide que el Centro mienta.
 *
 * `disponible` no pinta nada: la mayoría de los artículos describen algo que
 * funciona, y un aviso en cada uno los volvería ruido.
 */
export function AvisoDelProducto({ estado, aviso }: { estado: EstadoDelProducto; aviso?: string | null }) {
  const etiqueta = ETIQUETA_DEL_PRODUCTO[estado]
  if (!etiqueta || !aviso) return null
  return (
    <div
      role="note"
      className="mb-6 rounded-xl border border-[#E8D9B8] bg-[#FDF8EC] px-4 py-3.5 text-[0.92rem] leading-relaxed text-[#6B4E16]"
    >
      <span className="mr-2 inline-block rounded-md bg-[#F0E2C4] px-2 py-0.5 text-[0.72rem] font-semibold tracking-wide uppercase">
        {etiqueta}
      </span>
      {aviso}
    </div>
  )
}

/** La misma etiqueta, en pequeño, para las listas. */
export function EtiquetaDelProducto({ estado }: { estado: EstadoDelProducto }) {
  const etiqueta = ETIQUETA_DEL_PRODUCTO[estado]
  if (!etiqueta) return null
  return (
    <span className="ml-2 inline-block rounded-md bg-[#F0E2C4] px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide text-[#6B4E16] uppercase">
      {etiqueta}
    </span>
  )
}

export function TarjetaDeCategoria({ href, icono, nombre, descripcion }: {
  href: string; icono?: string | null; nombre: string; descripcion?: string | null
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-[#E7E2DA] bg-white p-5 transition-colors hover:border-[color-mix(in_srgb,var(--rojo-marca)_35%,transparent)]"
    >
      <IconoDeCategoria nombre={icono} />
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-[1.02rem] font-semibold text-[#15181C]">{nombre}</span>
        {descripcion && <span className="mt-0.5 block text-[0.88rem] leading-snug text-[#5A626B]">{descripcion}</span>}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-[#9AA1A9] transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

export function TarjetaDeArticulo({ href, titulo, resumen, estado }: {
  href: string; titulo: string; resumen?: string | null; estado?: EstadoDelProducto
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-2xl border border-[#E7E2DA] bg-white p-5 transition-colors hover:border-[color-mix(in_srgb,var(--rojo-marca)_35%,transparent)]"
    >
      <IconoDeCategoria nombre="file" />
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-[1.02rem] font-semibold text-[#15181C]">
          {titulo}
          {estado && <EtiquetaDelProducto estado={estado} />}
        </span>
        {resumen && <span className="mt-0.5 block text-[0.88rem] leading-snug text-[#5A626B]">{resumen}</span>}
      </span>
      <ChevronRight aria-hidden className="mt-0.5 size-5 shrink-0 text-[#9AA1A9] transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

/** El buscador. Es un `form` de verdad: funciona sin JavaScript. */
export function Buscador({ inicial, autoFoco }: { inicial?: string; autoFoco?: boolean }) {
  return (
    <form action="/ayuda/buscar" method="get" role="search" className="flex w-full gap-2">
      <div className="relative flex-1">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-[#5A626B]" />
        <input
          type="search"
          name="q"
          defaultValue={inicial}
          autoFocus={autoFoco}
          maxLength={200}
          placeholder="Busca una pregunta o describe lo que necesitas…"
          aria-label="Buscar en el Centro de Ayuda"
          className="h-[54px] w-full rounded-[12px] border border-[#E3DED6] bg-white pr-4 pl-[52px] text-[0.98rem] text-[#15181C] outline-none transition-colors placeholder:text-[#6B7280] focus:border-[var(--rojo-marca)]"
        />
      </div>
      <button
        type="submit"
        className="h-[54px] shrink-0 rounded-[12px] px-7 text-[0.98rem] font-semibold text-white transition-opacity hover:opacity-95"
        style={{ background: 'var(--rojo-marca)' }}
      >
        Buscar
      </button>
    </form>
  )
}

/** «No encontraste lo que buscabas» — el pie del Centro. */
export function NoEncontraste({ whatsapp }: { whatsapp: string }) {
  return (
    <section className="mt-14 rounded-2xl bg-[#F3F0EA] px-7 py-8 sm:px-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-[1.5rem] font-bold text-[#15181C]">¿No encontraste lo que buscabas?</h2>
          <p className="mt-1.5 text-[0.95rem] text-[#5A626B]">
            Nuestro equipo está listo para ayudarte. Contáctanos por el canal de tu preferencia.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link
            href="/contacto"
            className="flex h-[50px] items-center gap-2.5 rounded-[11px] border bg-white px-6 text-[0.95rem] font-semibold"
            style={{ borderColor: 'var(--rojo-marca)', color: 'var(--rojo-marca)' }}
          >
            Contactar a VIVE BIEN
          </Link>
          {/*
            Texto OSCURO sobre el verde, no blanco. El blanco sobre
            `--whatsapp` (#25D366) da 1,98:1 y no pasa ni de lejos; el carbón
            del manual da 8,78:1 y conserva el verde reconocible. El montaje
            lo dibuja en blanco, pero eso no se puede leer.
          */}
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-[50px] items-center gap-2.5 rounded-[11px] bg-[var(--whatsapp)] px-6 text-[0.95rem] font-semibold text-[#1A1A1A]"
          >
            Escribir por WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}

/** Se dice cuando lo que se enseña puede no estar al día. Nunca se calla. */
export function AvisoDesactualizado() {
  return (
    <p role="status" className="mb-6 rounded-xl bg-[#FEF3F2] px-4 py-3 text-[0.88rem] text-[#A81B1B]">
      No pudimos consultar el Centro ahora mismo, así que esto puede no estar al día. Vuelve a intentarlo en un momento.
    </p>
  )
}

export function Migas({ partes }: { partes: { nombre: string; href?: string }[] }) {
  return (
    <nav aria-label="Dónde estás" className="mb-6 flex flex-wrap items-center gap-1.5 text-[0.85rem] text-[#5A626B]">
      <Link href="/ayuda" className="hover:underline">Centro de Ayuda</Link>
      {partes.map((p) => (
        <span key={p.nombre} className="flex items-center gap-1.5">
          <ChevronRight aria-hidden className="size-3.5 text-[#9AA1A9]" />
          {p.href ? <Link href={p.href} className="hover:underline">{p.nombre}</Link>
                  : <span className="text-[#15181C]">{p.nombre}</span>}
        </span>
      ))}
    </nav>
  )
}
