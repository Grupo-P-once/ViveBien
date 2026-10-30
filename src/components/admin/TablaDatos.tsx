'use client'

import { useState } from 'react'
import {
  createPaginatedRowModel, createSortedRowModel, flexRender, rowPaginationFeature, rowSelectionFeature,
  rowSortingFeature, sortFns, tableFeatures, useTable,
  type ColumnDef, type PaginationState, type RowData, type RowSelectionState, type SortingState,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { entero } from '@/lib/admin/formato'
import { cn } from '@/lib/utils'

/**
 * Las piezas de TanStack Table v9 que usa el panel.
 *
 * En la v9 las funciones se piden una por una (ordenar, paginar, elegir filas)
 * en vez de venir todas: lo que no se declara aquí no se manda al navegador.
 */
export const CARACTERISTICAS = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
})

export type ColumnasPanel<T extends RowData> = ColumnDef<typeof CARACTERISTICAS, T>[]

/**
 * La tabla del panel: orden, selección y paginación en un solo sitio.
 *
 * La usan Registros, Usuarios y Propiedades. Si cada pantalla montara la suya,
 * el arreglo de un detalle —el pie que dice cuántas filas se ven, el vacío que
 * explica qué falta— habría que repetirlo tres veces.
 *
 * En pantallas estrechas la tabla se desplaza en horizontal dentro de su
 * tarjeta, no hace scroll a la página entera.
 */
export default function TablaDatos<T extends RowData>({
  columnas,
  datos,
  idDe,
  vacio,
  nombrePlural,
  seleccion,
  onSeleccion,
  porPagina = 10,
  ordenInicial,
  tarjetaMovil,
}: {
  columnas: ColumnasPanel<T>
  datos: T[]
  idDe: (fila: T) => string
  vacio: React.ReactNode
  nombrePlural: string
  seleccion?: RowSelectionState
  onSeleccion?: (s: RowSelectionState) => void
  porPagina?: number
  ordenInicial?: SortingState
  /**
   * Cómo se ve cada fila en un teléfono. Con ocho columnas, una tabla obliga a
   * arrastrar de lado y se lee a trozos; con esto, cada fila es una tarjeta.
   */
  tarjetaMovil?: (fila: T) => React.ReactNode
}) {
  const [orden, setOrden] = useState<SortingState>(ordenInicial ?? [])
  const [pagina, setPagina] = useState<PaginationState>({ pageIndex: 0, pageSize: porPagina })

  const tabla = useTable({
    features: CARACTERISTICAS,
    data: datos,
    columns: columnas,
    getRowId: idDe,
    state: { sorting: orden, rowSelection: seleccion ?? {}, pagination: pagina },
    onSortingChange: (actualizar) => setOrden((o) => (typeof actualizar === 'function' ? actualizar(o) : actualizar)),
    onPaginationChange: (actualizar) => setPagina((p) => (typeof actualizar === 'function' ? actualizar(p) : actualizar)),
    onRowSelectionChange: onSeleccion
      ? (actualizar) => onSeleccion(typeof actualizar === 'function' ? actualizar(seleccion ?? {}) : actualizar)
      : undefined,
    enableRowSelection: Boolean(onSeleccion),
  })

  const filas = tabla.getRowModel().rows
  const total = datos.length
  const { pageIndex, pageSize } = pagina
  const desde = total === 0 ? 0 : pageIndex * pageSize + 1
  const hasta = Math.min(total, (pageIndex + 1) * pageSize)
  const paginas = tabla.getPageCount()

  if (total === 0) {
    return <div className="rounded-lg bg-muted/60 px-6 py-12 text-center text-sm text-muted-foreground">{vacio}</div>
  }

  return (
    <div>
      {tarjetaMovil && (
        <ul className="space-y-3 sm:hidden">
          {filas.map((fila) => (
            <li key={fila.id} className="rounded-xl border bg-card p-4">{tarjetaMovil(fila.original)}</li>
          ))}
        </ul>
      )}

      <div className={cn('-mx-1 overflow-x-auto px-1', tarjetaMovil && 'hidden sm:block')}>
        <Table className="[&_td]:px-2 [&_td]:whitespace-normal [&_th]:px-2">
          <TableHeader>
            {tabla.getHeaderGroups().map((grupo) => (
              <TableRow key={grupo.id} className="hover:bg-transparent">
                {grupo.headers.map((cabecera) => {
                  const ordenable = cabecera.column.getCanSort()
                  const dir = cabecera.column.getIsSorted()
                  // El texto de la columna, para que el botón de ordenar diga
                  // «Ordenar por Fecha» y no «Ordenar por creado».
                  const titulo = typeof cabecera.column.columnDef.header === 'string' ? cabecera.column.columnDef.header : cabecera.column.id
                  return (
                    <TableHead key={cabecera.id} className="versal !text-[0.62rem] !tracking-[.14em] text-muted-foreground">
                      {cabecera.isPlaceholder ? null : ordenable ? (
                        <button
                          type="button"
                          onClick={cabecera.column.getToggleSortingHandler()}
                          className="flex items-center gap-1 uppercase hover:text-foreground"
                          aria-label={`Ordenar por ${titulo}`}
                        >
                          {flexRender(cabecera.column.columnDef.header, cabecera.getContext())}
                          <ChevronsUpDown className={cn('size-3', dir ? 'text-[var(--marca)]' : 'opacity-50')} aria-hidden />
                        </button>
                      ) : (
                        flexRender(cabecera.column.columnDef.header, cabecera.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {filas.map((fila) => (
              <TableRow key={fila.id} data-state={fila.getIsSelected() ? 'selected' : undefined}>
                {fila.getAllCells().map((celda) => (
                  <TableCell key={celda.id} className="py-3 align-top">
                    {flexRender(celda.column.columnDef.cell, celda.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>
          Mostrando {entero(desde)} a {entero(hasta)} de {entero(total)} {nombrePlural}
        </p>
        {paginas > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => tabla.previousPage()} disabled={!tabla.getCanPreviousPage()} aria-label="Página anterior">
              <ChevronLeft aria-hidden />
            </Button>
            {Array.from({ length: paginas }).slice(0, 7).map((_, i) => (
              <Button
                key={i}
                variant={i === pageIndex ? 'default' : 'outline'}
                size="icon-sm"
                onClick={() => tabla.setPageIndex(i)}
                aria-label={`Página ${i + 1}`}
                aria-current={i === pageIndex ? 'page' : undefined}
              >
                {i + 1}
              </Button>
            ))}
            <Button variant="outline" size="icon-sm" onClick={() => tabla.nextPage()} disabled={!tabla.getCanNextPage()} aria-label="Página siguiente">
              <ChevronRight aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
