'use client'

import { AlertOctagon, AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { Gravedad } from '@/lib/seo/auditoria'

/** Piezas del apartado SEO. Misma piel que el resto del panel (`rounded-xl border bg-card`). La gravedad lleva icono y texto: nunca solo color. */

export function Tarjeta({ titulo, descripcion, acciones, children, className }: { titulo?: string; descripcion?: string; acciones?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 sm:p-5', className)}>
      {(titulo || acciones) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {titulo && <h2 className="font-heading text-[1.05rem] font-semibold">{titulo}</h2>}
            {descripcion && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{descripcion}</p>}
          </div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Kpi({ etiqueta, valor, nota, tono = 'neutro' }: { etiqueta: string; valor: React.ReactNode; nota?: string; tono?: 'neutro' | 'bien' | 'mal' }) {
  return (
    <div className="rounded-xl border bg-card p-4" data-kpi={etiqueta}>
      <p className="text-[0.72rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{etiqueta}</p>
      <p className={cn('mt-1.5 font-heading text-[1.8rem] leading-none font-bold tabular-nums', tono === 'mal' && 'text-[var(--marca)]', tono === 'bien' && 'text-emerald-700')}>{valor}</p>
      {nota && <p className="mt-2 text-xs text-muted-foreground">{nota}</p>}
    </div>
  )
}

const GRAVEDAD: Record<Gravedad, { texto: string; clases: string; Icono: typeof Info }> = {
  critica: { texto: 'Crítica', clases: 'bg-red-100 text-red-900', Icono: AlertOctagon },
  alta: { texto: 'Alta', clases: 'bg-orange-100 text-orange-900', Icono: ShieldAlert },
  media: { texto: 'Media', clases: 'bg-amber-100 text-amber-900', Icono: AlertTriangle },
  baja: { texto: 'Baja', clases: 'bg-slate-100 text-slate-800', Icono: Info },
}
export function InsigniaGravedad({ g }: { g: Gravedad }) {
  const { texto, clases, Icono } = GRAVEDAD[g]
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold', clases)}><Icono className="size-3.5" aria-hidden />{texto}</span>
}

export function InsigniaEstado({ estado }: { estado: 'ok' | 'diferente' | 'falta' }) {
  const m = { ok: ['Coincide', 'bg-emerald-100 text-emerald-900', CheckCircle2], diferente: ['Es distinto', 'bg-red-100 text-red-900', AlertOctagon], falta: ['No está', 'bg-amber-100 text-amber-900', AlertTriangle] } as const
  const [texto, clases, Icono] = m[estado]
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold', clases)}><Icono className="size-3.5" aria-hidden />{texto}</span>
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{texto}</p>
}

export function ErrorCaja({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="flex-1">{mensaje}</span>
      {reintentar && <Button variant="outline" size="sm" onClick={reintentar}><RefreshCw aria-hidden /> Reintentar</Button>}
    </div>
  )
}

export function Vacio({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center">
      <p className="font-heading font-semibold">{titulo}</p>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{texto}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export type Columna<T> = { clave: string; titulo: string; celda: (f: T) => React.ReactNode; alinear?: 'der'; ancho?: string }
export function Tabla<T>({ columnas, filas, idDe, vacio, etiqueta }: { columnas: Columna<T>[]; filas: T[]; idDe: (f: T, i: number) => string; vacio: string; etiqueta: string }) {
  if (filas.length === 0) return <p className="text-sm text-muted-foreground">{vacio}</p>
  return (
    // Un solo desplazador, enfocable con teclado (axe: scrollable-region-focusable); el contenedor interno de la tabla no desplaza.
    <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-[var(--marca)] [&_[data-slot=table-container]]:overflow-visible" role="region" aria-label={etiqueta} tabIndex={0}>
      <Table aria-label={etiqueta}>
        <TableHeader>
          <TableRow>{columnas.map((c) => <TableHead key={c.clave} className={cn(c.alinear === 'der' && 'text-right', c.ancho)}>{c.titulo}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f, i) => (
            <TableRow key={idDe(f, i)}>
              {columnas.map((c) => <TableCell key={c.clave} className={cn('align-top whitespace-normal', c.alinear === 'der' && 'text-right tabular-nums')}>{c.celda(f)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export const fmt = (n: number | null | undefined, dec = 0) => (n == null ? '—' : n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }))
