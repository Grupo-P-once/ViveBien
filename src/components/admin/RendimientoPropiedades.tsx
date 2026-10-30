'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSesion } from '@/components/admin/sesion'
import { Cargando, ErrorCaja, Kpi, Tarjeta, fmt } from '@/components/admin/seo/ui'
import GraficasPropias from '@/components/admin/GraficasPropias'
import { TEXTO_SENAL, type RendimientoPropiedad, type Senal } from '@/lib/analitica-propiedades'
import { cn } from '@/lib/utils'

/**
 * Métricas · Rendimiento por propiedad: cuánta gente ve cada propiedad, la elige en el catálogo y se comunica, con el cambio contra el periodo anterior y una
 * señal en palabras. Sale de la telemetría propia del sitio (tabla `eventos`), no de Google Analytics: así se puede atribuir cada clic a SU propiedad.
 */

type Respuesta = {
  dias: number; faltan: string[]
  /** Solo en el modo «propias» (publicador y asociado). */
  resumen?: { porEstado: Record<string, number>; vistasHistorico: number; diasPromedioPublicadas: number | null }
  generales?: { propiedadesPublicadasSitio: number; vistasPromedioSitio: number | null }
  totales: { propiedades: number; vistas: number; tarjeta: number; compartidas: number; citas: number; contactos: number; solicitudes: number; sinVistas: number; contactosPor100: number | null }
  /** Solo para cuentas con la capacidad de atender citas (la decide el servidor): serie diaria y compartidas por modo. */
  avanzado?: { vistasPorDia: Array<{ dia: string; vistas: number; leads: number }>; compartidasNativo: number; compartidasCopiado: number } | null
  propiedades: RendimientoPropiedad[]
}
type Columna = 'nombre' | 'vistas' | 'compartidas' | 'citas' | 'tarjeta' | 'contactos' | 'solicitudes' | 'guardadas' | 'contactosPor100' | 'diasPublicada'

const COLOR_SENAL: Record<Senal, string> = {
  bien: 'bg-emerald-100 text-emerald-900', sin_contacto: 'bg-amber-100 text-amber-900', sin_vistas: 'bg-red-100 text-red-900',
  poca_visibilidad: 'bg-amber-100 text-amber-900', nueva: 'bg-sky-100 text-sky-900', pocos_datos: 'bg-slate-100 text-slate-700', sin_publicar: 'bg-slate-100 text-slate-700',
}
const valor = (f: RendimientoPropiedad, c: Columna): number | string => (c === 'nombre' ? f.nombre.toLowerCase() : (f[c] ?? -1))

const ESTADO: Record<string, string> = { publicada: 'Publicadas', borrador: 'Borradores', en_revision: 'En revisión', cambios_solicitados: 'Con cambios pedidos', rechazada: 'Rechazadas' }

/**
 * `propias`: la versión del PORTAL de publicadores y asociados. Pide `/api/publicador/metricas` (el servidor solo trae lo que esa cuenta subió, y solo
 * cantidades) y agrega el resumen de su cartera y la comparación con el promedio del sitio. Sin `propias` es la versión del panel de administración (todas).
 */
export default function RendimientoPropiedades({ propias = false }: { propias?: boolean }) {
  const { pedir } = useSesion()
  const [dias, setDias] = useState<7 | 30 | 90>(30)
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: 'vistas', asc: false })

  const cargar = useCallback(async (d: number) => {
    setCargando(true); setError('')
    try { setDatos(await pedir<Respuesta>(`${propias ? '/api/publicador/metricas' : '/api/admin/analitica/propiedades'}?dias=${d}`)) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer el rendimiento por propiedad.') } finally { setCargando(false) }
  }, [pedir, propias])
  useEffect(() => { const t = setTimeout(() => void cargar(dias), 0); return () => clearTimeout(t) }, [cargar, dias])

  const filas = useMemo(() => {
    const l = [...(datos?.propiedades ?? [])]
    l.sort((a, b) => { const x = valor(a, orden.col), y = valor(b, orden.col); const r = x < y ? -1 : x > y ? 1 : 0; return orden.asc ? r : -r })
    return l
  }, [datos, orden])

  const cab = (col: Columna, texto: string, der = true) => {
    const activa = orden.col === col
    return (
      <TableHead className={cn(der && 'text-right')} aria-sort={activa ? (orden.asc ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={cn('inline-flex items-center gap-1 font-medium hover:underline', der && 'flex-row-reverse')} onClick={() => setOrden({ col, asc: activa ? !orden.asc : false })}>
          {texto}{activa ? (orden.asc ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />) : <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />}
        </button>
      </TableHead>
    )
  }
  const t = datos?.totales

  return (
    <section aria-labelledby="titulo-propiedades" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titulo-propiedades" className="text-lg font-semibold">{propias ? 'Rendimiento de tus propiedades' : 'Rendimiento por propiedad'}</h2>
          <p className="text-sm text-muted-foreground">{propias ? 'Cuánta gente ve cada propiedad que subiste, la elige en el catálogo y se comunica. Solo ves cantidades de tus propiedades; nunca datos de las personas.' : 'Cuánta gente ve cada propiedad, la elige en el catálogo y se comunica.'} Haz clic en un encabezado para ordenar.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">Periodo
            <select className="rounded-md border bg-background px-2 py-1.5 text-sm" value={dias} aria-label="Periodo del rendimiento por propiedad" onChange={(e) => setDias(Number(e.target.value) as 7 | 30 | 90)}>
              <option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option>
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={() => void cargar(dias)} disabled={cargando} aria-label="Actualizar rendimiento por propiedad"><RefreshCw aria-hidden /> Actualizar</Button>
        </div>
      </div>

      {cargando && !datos && <Cargando />}
      {error && <ErrorCaja mensaje={error} reintentar={() => void cargar(dias)} />}
      {datos && datos.faltan.length > 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No pude leer: {datos.faltan.join(', ')}. Los números de abajo pueden estar incompletos.</p>}

      {t && datos?.resumen && (
        <Tarjeta titulo="Tu cartera" descripcion="Lo básico de lo que has subido y cómo te comparas con el promedio de todo el sitio.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi etiqueta="Propiedades" valor={fmt(t.propiedades)} nota={Object.entries(datos.resumen.porEstado).map(([e, n]) => `${n} ${(ESTADO[e] ?? e).toLowerCase()}`).join(' · ') || 'Aún no has subido ninguna'} />
            <Kpi etiqueta="Días promedio publicadas" valor={datos.resumen.diasPromedioPublicadas == null ? '—' : fmt(datos.resumen.diasPromedioPublicadas)} nota="Desde que se publicó cada una" />
            <Kpi etiqueta="Vistas desde siempre" valor={fmt(datos.resumen.vistasHistorico)} nota="Todas tus propiedades" />
            <Kpi etiqueta="Promedio del sitio" valor={datos.generales?.vistasPromedioSitio == null ? '—' : fmt(datos.generales.vistasPromedioSitio, 1)} nota={`Vistas por propiedad publicada en ${datos.dias} días (las tuyas: ${t.propiedades ? fmt(Math.round((t.vistas / Math.max(1, datos.resumen.porEstado.publicada ?? 0)) * 10) / 10, 1) : '—'})`} />
          </div>
        </Tarjeta>
      )}

      {t && datos?.avanzado && (
        <Tarjeta titulo="Más detalle de tu cuenta" descripcion="Lo ves porque tu cuenta atiende citas. Citas pedidas en el periodo y cómo se compartió.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi etiqueta="Citas pedidas" valor={fmt(t.citas)} nota="Los datos de cada una están en «Citas recibidas»" />
            <Kpi etiqueta="Compartida por la hoja del teléfono" valor={fmt(datos.avanzado.compartidasNativo)} />
            <Kpi etiqueta="Compartida copiando el enlace" valor={fmt(datos.avanzado.compartidasCopiado)} />
          </div>
        </Tarjeta>
      )}

      {t && datos && (
        <GraficasPropias totales={t} filas={datos.propiedades} porEstado={datos.resumen?.porEstado} porDia={datos.avanzado?.vistasPorDia ?? null} dias={datos.dias} />
      )}

      {t && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi etiqueta="Vistas de fichas" valor={fmt(t.vistas)} nota={`${fmt(t.propiedades)} propiedades`} />
            <Kpi etiqueta="Clics en tarjetas" valor={fmt(t.tarjeta)} nota={`${fmt(t.compartidas)} veces compartidas`} />
            <Kpi etiqueta="Clics de contacto" valor={fmt(t.contactos)} nota="WhatsApp, teléfono y correo" />
            <Kpi etiqueta="Interesados" valor={fmt(t.solicitudes)} nota="Personas que pidieron información" />
            <Kpi etiqueta="Contactos por 100 vistas" valor={t.contactosPor100 == null ? '—' : fmt(t.contactosPor100, 1)} nota={`${fmt(t.sinVistas)} sin ninguna vista`} />
          </div>

          <Tarjeta titulo="Por propiedad" descripcion="«Vistas» cuenta una por persona y propiedad. Con pocos datos en el sitio, las señales no se dan: un diagnóstico con seis visitas sería ruido.">
            {filas.length === 0 ? <p className="text-sm text-muted-foreground">No hay propiedades publicadas con actividad en este periodo.</p> : (
              <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-[var(--marca)] [&_[data-slot=table-container]]:overflow-visible" role="region" aria-label="Rendimiento por propiedad" tabIndex={0}>
                <Table aria-label="Rendimiento por propiedad">
                  <TableHeader>
                    <TableRow>
                      {cab('nombre', 'Propiedad', false)}{cab('vistas', 'Vistas')}{cab('compartidas', 'Compartida')}{cab('tarjeta', 'Clics tarjeta')}{cab('contactos', 'Contacto (clics)')}{cab('solicitudes', 'Interesados')}
                      {cab('guardadas', 'Guardadas')}{datos?.avanzado && cab('citas', 'Citas')}{cab('contactosPor100', 'Por 100 vistas')}{cab('diasPublicada', 'Días publicada')}
                      <TableHead>Qué revisar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="min-w-[14rem] whitespace-normal">
                          <Link href={`/propiedades/${encodeURIComponent(f.folio || f.id)}`} className="font-medium hover:underline" target="_blank" rel="noopener">{f.nombre}</Link>
                          {f.folio && <span className="block text-xs text-muted-foreground">{f.folio}</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(f.vistas)}
                          {f.cambioVistas != null && <span className={cn('ml-1 text-xs', f.cambioVistas >= 0 ? 'text-emerald-700' : 'text-red-700')} aria-label={`${f.cambioVistas >= 0 ? 'subió' : 'bajó'} ${Math.abs(f.cambioVistas)} por ciento contra el periodo anterior`}>{f.cambioVistas >= 0 ? '▲' : '▼'} {Math.abs(f.cambioVistas)} %</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums" title={`Hoja del teléfono ${f.compartidasNativo} · Enlace copiado ${f.compartidasCopiado}`}>{fmt(f.compartidas)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(f.tarjeta)}</TableCell>
                        <TableCell className="text-right tabular-nums" title={`WhatsApp ${f.whatsapp} · Teléfono ${f.telefono} · Correo ${f.correo}`}>{fmt(f.contactos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(f.solicitudes)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(f.guardadas)}</TableCell>
                        {datos?.avanzado && <TableCell className="text-right tabular-nums" title={`Confirmadas ${f.citasConfirmadas} · Hechas ${f.citasCompletadas}`}>{fmt(f.citas)}</TableCell>}
                        <TableCell className="text-right tabular-nums">{f.contactosPor100 == null ? '—' : fmt(f.contactosPor100, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.diasPublicada == null ? '—' : fmt(f.diasPublicada)}</TableCell>
                        <TableCell className="whitespace-normal"><span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', COLOR_SENAL[f.senal])}>{TEXTO_SENAL[f.senal]}</span></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Tarjeta>
        </>
      )}
    </section>
  )
}
