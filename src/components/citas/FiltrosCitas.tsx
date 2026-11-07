'use client'

import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CitaVista } from '@/lib/citas/vista'
import { ETIQUETA_GRUPO, SIN_FILTROS, hayFiltros, opcionesDe, type Filtros, type GrupoEstado } from './filtros'
import { TEXTO_DE_TIPO } from './uiCitas'

/** Los filtros de la pantalla. Selectores nativos con etiqueta visible: funcionan con teclado, lector de pantalla y en el celular sin trampas. */
const CAMPO = 'h-11 w-full rounded-lg border bg-card px-3 text-sm'

export default function FiltrosCitas({
  citas, filtros, onCambio, conResponsable, conTipos = true, conMias = false,
}: {
  citas: CitaVista[]
  filtros: Filtros
  onCambio: (f: Filtros) => void
  /** Solo para quien ve a varios responsables (el equipo). */
  conResponsable?: boolean
  /** Ofrecer el filtro «Tipo» (solicitud de cliente / visita propia). El cliente no lo necesita. */
  conTipos?: boolean
  /** Ofrecer «Mis visitas» (solo las citas donde yo soy quien va): para quien ve también las de otros (equipo, asociado). */
  conMias?: boolean
}) {
  const { propiedades, responsables } = opcionesDe(citas)
  const poner = (c: Partial<Filtros>) => onCambio({ ...filtros, ...c })
  return (
    <form role="search" aria-label="Filtrar citas" className="flex flex-wrap items-end gap-3" onSubmit={(e) => e.preventDefault()} data-filtros-citas>
      <label className="min-w-[11rem] flex-1 text-xs font-semibold text-muted-foreground">Buscar
        <span className="relative mt-1 block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <input type="search" value={filtros.texto} onChange={(e) => poner({ texto: e.target.value })} placeholder="Propiedad, lugar o persona" className={`${CAMPO} pl-9 font-normal text-foreground`} />
        </span>
      </label>
      <label className="min-w-[10rem] flex-1 text-xs font-semibold text-muted-foreground">Estado
        <select value={filtros.estado} onChange={(e) => poner({ estado: e.target.value as GrupoEstado })} className={`${CAMPO} mt-1 font-normal text-foreground`}>
          {(Object.keys(ETIQUETA_GRUPO) as GrupoEstado[]).map((g) => <option key={g} value={g}>{ETIQUETA_GRUPO[g]}</option>)}
        </select>
      </label>
      {conTipos && <label className="min-w-[10rem] flex-1 text-xs font-semibold text-muted-foreground">Tipo
        <select value={filtros.tipo} onChange={(e) => poner({ tipo: e.target.value as Filtros['tipo'] })} className={`${CAMPO} mt-1 font-normal text-foreground`}>
          <option value="todos">Todos los tipos</option>
          <option value="solicitada">{TEXTO_DE_TIPO.solicitada}</option>
          <option value="propia">{TEXTO_DE_TIPO.propia}</option>
        </select>
      </label>}
      {propiedades.length > 1 && (
        <label className="min-w-[10rem] flex-1 text-xs font-semibold text-muted-foreground">Propiedad
          <select value={filtros.propiedad} onChange={(e) => poner({ propiedad: e.target.value })} className={`${CAMPO} mt-1 font-normal text-foreground`}>
            <option value="">Todas las propiedades</option>
            {propiedades.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      )}
      {conResponsable && responsables.length > 1 && (
        <label className="min-w-[10rem] flex-1 text-xs font-semibold text-muted-foreground">Responsable
          <select value={filtros.responsable} onChange={(e) => poner({ responsable: e.target.value })} className={`${CAMPO} mt-1 font-normal text-foreground`}>
            <option value="">Todos los responsables</option>
            {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      )}
      {conMias && (
        <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold">
          <input type="checkbox" className="size-4" checked={filtros.mias} onChange={(e) => poner({ mias: e.target.checked })} />Mis visitas
        </label>
      )}
      {hayFiltros(filtros) && (
        <Button type="button" variant="ghost" className="h-11" onClick={() => onCambio(SIN_FILTROS)}><X aria-hidden /> Quitar filtros</Button>
      )}
    </form>
  )
}
