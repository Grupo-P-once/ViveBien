'use client'

import Link from 'next/link'
import { ChevronRight, Heart, House, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PropiedadTarjeta } from '@/lib/portal/tarjeta'

/**
 * Tarjeta de propiedad del portal (mockup: «Nuevas propiedades para ti»):
 * foto con el tipo y el corazón, título, lugar, datos y precio.
 */
export default function TarjetaPropiedad({
  p,
  guardada,
  onAlternar,
  className,
}: {
  p: PropiedadTarjeta
  guardada?: boolean
  onAlternar?: (id: string) => void
  className?: string
}) {
  return (
    <article className={cn('group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(20,20,20,.04)] transition-shadow hover:shadow-md', className)}>
      <div className="relative aspect-[16/10] bg-muted">
        {p.foto
          // Foto de Cloudinary ya recortada a su tamaño (miniaturaCloudinary); como en el resto del sitio, <img> y no next/image.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.foto} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
          : <div className="flex h-full items-center justify-center text-muted-foreground"><House className="size-8" aria-hidden /></div>}
        {p.tipoEtiqueta && (
          <span className="absolute top-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-foreground shadow-sm">{p.tipoEtiqueta}</span>
        )}
        {onAlternar && (
          <button
            type="button"
            onClick={() => onAlternar(p.id)}
            aria-pressed={!!guardada}
            aria-label={guardada ? `Quitar ${p.titulo} de guardadas` : `Guardar ${p.titulo}`}
            className="absolute top-2 right-2 z-10 flex size-9 items-center justify-center rounded-full text-white drop-shadow transition-colors hover:bg-black/15 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            <Heart className={cn('size-5', guardada && 'fill-[var(--marca)] text-[var(--marca)]')} strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-heading text-[0.98rem] leading-snug font-semibold">
          <Link href={p.ruta} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{p.titulo}</Link>
        </h3>
        {p.lugar && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0 text-[var(--marca)]" aria-hidden />
            <span className="truncate">{p.lugar}</span>
          </p>
        )}
        {p.datos.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[0.82rem] text-[var(--panel-tinta-2)]">
            {p.datos.map((d, i) => (
              <span key={d} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden className="h-3 w-px bg-border" />}
                {d}
              </span>
            ))}
          </p>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="font-heading text-[1.1rem] font-bold text-[var(--marca)]">{p.precio ?? <span className="text-sm font-medium text-muted-foreground">Consultar precio</span>}</p>
            {/* V-1.1.85: lo que dice la ficha pública, también aquí. */}
            {p.iva && (
              <span className={cn(
                'rounded border px-1.5 py-0.5 text-[0.62rem] font-bold tracking-wide',
                p.iva === 'incluido'
                  ? 'border-[#6ee7b7] bg-[#ecfdf5] text-[#065f46]'
                  : 'border-[#fcd34d] bg-[var(--aviso-fondo-calido)] text-[var(--aviso-fuerte)]',
              )}>
                {p.iva === 'incluido' ? 'IVA inc.' : '+ IVA'}
              </span>
            )}
          </div>
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f1efec] text-foreground transition-colors group-hover:bg-[var(--marca)] group-hover:text-white">
            <ChevronRight className="size-4" />
          </span>
        </div>
      </div>
    </article>
  )
}
