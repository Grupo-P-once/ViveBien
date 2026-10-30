'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Colaboradores, { type ConstanciasPorMovimiento } from '@/components/admin/contabilidad/Colaboradores'
import { construirLineas, type ExternaContable, type MovimientoContable, type CuentaDeGasto } from '@/lib/contabilidad'
import type { OperacionComision } from '@/lib/comision-resumen'
import type { ColaboradorFila } from '@/lib/contabilidad-externas'

/** Directorio de colaboradores dentro de «Cierres y comisiones» (solo Super Admin). Trae por su cuenta el directorio y el libro, que es de donde sale lo ya pagado a cada quien. */
type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
type Libro = { operaciones: OperacionComision[]; movimientos: MovimientoContable[]; cuentas: CuentaDeGasto[]; etiquetasDePropiedad: Record<string, string>; externas?: ExternaContable[]; constancias?: ConstanciasPorMovimiento }

export default function DirectorioDeColaboradores({ pedir }: { pedir: Pedir }) {
  const [colaboradores, setColaboradores] = useState<ColaboradorFila[] | null>(null)
  const [libro, setLibro] = useState<Libro | null>(null)
  const [error, setError] = useState('')
  const [vuelta, setVuelta] = useState(0)
  const recargar = useCallback(() => setVuelta((n) => n + 1), [])

  useEffect(() => {
    let vivo = true
    pedir<{ colaboradores: ColaboradorFila[] }>('/api/admin/contabilidad/colaboradores')
      .then((r) => { if (vivo) { setColaboradores(r.colaboradores ?? []); setError('') } })
      .catch((e) => { if (vivo) { setColaboradores((a) => a ?? []); setError(e instanceof Error ? e.message : 'No se pudo cargar el directorio.') } })
    pedir<Libro>('/api/admin/contabilidad/libro').then((r) => { if (vivo) setLibro(r) }).catch(() => { /* sin libro solo faltan las cifras de «pagado» */ })
    return () => { vivo = false }
  }, [pedir, vuelta])

  const lineas = useMemo(() => (libro ? construirLineas({ operaciones: libro.operaciones, movimientos: libro.movimientos, etiquetasDePropiedad: libro.etiquetasDePropiedad, externas: libro.externas }) : []), [libro])
  return <Colaboradores colaboradores={colaboradores ?? []} cargando={colaboradores === null} error={error} lineas={lineas} constancias={libro?.constancias ?? {}} pedir={pedir} onCambio={recargar} />
}
