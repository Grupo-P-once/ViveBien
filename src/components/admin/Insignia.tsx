import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TIPOS_REGISTRO } from '@/lib/admin/panel-config'
import { cn } from '@/lib/utils'

/**
 * Insignia del tipo de registro, con su explicación al pasar el ratón.
 *
 * Una etiqueta que hay que adivinar no informa: «Ventana» o «Sin origen» no
 * dicen nada por sí solas, así que cada una lleva qué significa.
 */
export function InsigniaTipo({ tipo }: { tipo: string }) {
  const t = TIPOS_REGISTRO[tipo]
  const etiqueta = (
    <span
      className="inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-xs font-semibold"
      style={{ background: t?.fondo ?? '#F3F4F6', color: t?.texto_color ?? '#4B5563' }}
    >
      {t?.texto ?? tipo}
    </span>
  )
  if (!t) return etiqueta
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="cursor-help">{etiqueta}</span></TooltipTrigger>
      <TooltipContent className="max-w-[16rem]">{t.explica}</TooltipContent>
    </Tooltip>
  )
}

/** Pastilla de estado: punto de color y texto, nunca sólo color. */
export function Estado({
  texto,
  tono,
  className,
}: {
  texto: string
  tono: 'bien' | 'aviso' | 'mal' | 'neutro'
  className?: string
}) {
  const colores = {
    bien: 'bg-[var(--estado-bien-fondo)] text-[var(--estado-bien)]',
    aviso: 'bg-[var(--estado-aviso-fondo)] text-[var(--estado-aviso)]',
    mal: 'bg-[var(--estado-mal-fondo)] text-[var(--estado-mal)]',
    neutro: 'bg-muted text-muted-foreground',
  }[tono]
  const punto = {
    bien: 'bg-[var(--estado-bien)]',
    aviso: 'bg-[var(--estado-aviso)]',
    mal: 'bg-[var(--estado-mal)]',
    neutro: 'bg-muted-foreground',
  }[tono]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', colores, className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', punto)} />
      {texto}
    </span>
  )
}
