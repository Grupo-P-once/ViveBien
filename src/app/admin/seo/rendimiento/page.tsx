'use client'

import { useMemo, useState } from 'react'
import { CloudDownload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Encabezado from '@/components/admin/Encabezado'
import PiePanel from '@/components/admin/PiePanel'
import { useApi, useImportacion, ZonaImportar } from '@/components/admin/seo/datos'
import Historial from '@/components/admin/seo/Historial'
import { Cargando, ErrorCaja, Kpi, Tabla, Tarjeta, Vacio, fmt } from '@/components/admin/seo/ui'
import { oportunidades, type FilaRendimiento } from '@/lib/seo/csv'

/** Respuesta de `/api/admin/seo/gsc`: o falta configuración (nombres de variables) o trae filas de Search Console. */
type RespuestaGsc = { configurado: false; faltan: string[] } | { configurado: true; generado: string; rango: { desde: string; hasta: string; dias: number }; filas: FilaRendimiento[] }

/** SEO · Rendimiento: consultas y páginas (clics, impresiones, CTR, posición) a partir de las exportaciones de Rendimiento de Search Console. */

const columnas = (titulo: string) => [
  { clave: 'clave', titulo, celda: (f: FilaRendimiento) => <span className="font-medium break-all">{f.clave}</span> },
  { clave: 'clics', titulo: 'Clics', alinear: 'der' as const, celda: (f: FilaRendimiento) => fmt(f.clics) },
  { clave: 'imp', titulo: 'Impresiones', alinear: 'der' as const, celda: (f: FilaRendimiento) => fmt(f.impresiones) },
  { clave: 'ctr', titulo: 'CTR', alinear: 'der' as const, celda: (f: FilaRendimiento) => `${fmt(f.ctr, 1)} %` },
  { clave: 'pos', titulo: 'Posición', alinear: 'der' as const, celda: (f: FilaRendimiento) => fmt(f.posicion, 1) },
]

export default function PaginaSeoRendimiento() {
  const imp = useImportacion()
  const [dias, setDias] = useState<7 | 28 | 90>(28)
  const apiConsultas = useApi<RespuestaGsc>('/api/admin/seo/gsc')
  const apiPaginas = useApi<RespuestaGsc>('/api/admin/seo/gsc')
  const apiFechas = useApi<RespuestaGsc>('/api/admin/seo/gsc')
  const traer = () => Promise.all([`query`, `page`, `date`].map((d, i) => [apiConsultas, apiPaginas, apiFechas][i].ejecutar(`?dimension=${d}&dias=${dias}`)))
  const cargandoVivo = apiConsultas.cargando || apiPaginas.cargando || apiFechas.cargando
  const errorVivo = apiConsultas.error || apiPaginas.error || apiFechas.error
  const sinConfigurar = apiConsultas.datos && !apiConsultas.datos.configurado ? apiConsultas.datos.faltan : null
  // Lo traído en vivo manda; si no se ha traído, valen las exportaciones importadas.
  const vivo = (r: RespuestaGsc | null) => (r && r.configurado ? r.filas : null)
  const rangoVivo = apiConsultas.datos && apiConsultas.datos.configurado ? apiConsultas.datos.rango : null
  const consultas = useMemo(() => vivo(apiConsultas.datos) ?? imp.datos.consultas ?? [], [apiConsultas.datos, imp.datos.consultas])
  const paginas = useMemo(() => vivo(apiPaginas.datos) ?? imp.datos.paginas ?? [], [apiPaginas.datos, imp.datos.paginas])
  const fechas = useMemo(() => vivo(apiFechas.datos) ?? imp.datos.fechas ?? [], [apiFechas.datos, imp.datos.fechas])
  const topConsultas = useMemo(() => [...consultas].sort((a, b) => b.clics - a.clics || b.impresiones - a.impresiones).slice(0, 15), [consultas])
  const topPaginas = useMemo(() => [...paginas].sort((a, b) => b.clics - a.clics || b.impresiones - a.impresiones).slice(0, 15), [paginas])
  const oportunidad = useMemo(() => oportunidades(consultas), [consultas])
  const clics = (fechas.length ? fechas : consultas).reduce((s, f) => s + f.clics, 0)
  const impresiones = (fechas.length ? fechas : consultas).reduce((s, f) => s + f.impresiones, 0)
  const hay = consultas.length + paginas.length + fechas.length > 0

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado versal="SEO" titulo="Rendimiento en Google" descripcion="Qué búsquedas llevan a vivebienn.com, con qué frecuencia se ve y cuántos clics recibe." />
      <div className="mt-6 space-y-5">
        <Tarjeta titulo="Search Console en vivo" descripcion="Trae los datos directo de Google con una cuenta de servicio de solo lectura (sin claves). Los datos de Google llegan con 2–3 días de retraso.">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              Periodo
              <select className="rounded-md border bg-background px-2 py-1.5 text-sm" value={dias} onChange={(e) => setDias(Number(e.target.value) as 7 | 28 | 90)} aria-label="Periodo de Search Console">
                <option value={7}>7 días</option><option value={28}>28 días</option><option value={90}>90 días</option>
              </select>
            </label>
            <Button size="sm" onClick={() => void traer()} disabled={cargandoVivo}><CloudDownload aria-hidden /> Traer de Search Console</Button>
            {rangoVivo && <p className="text-xs text-muted-foreground">Del {rangoVivo.desde} al {rangoVivo.hasta} · en vivo</p>}
          </div>
          {cargandoVivo && <div className="mt-3"><Cargando /></div>}
          {errorVivo && <div className="mt-3"><ErrorCaja mensaje={errorVivo} reintentar={() => void traer()} /></div>}
          {sinConfigurar && (
            <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Aún no está conectado a Google en este entorno. Falta: {sinConfigurar.join(', ')}. Mientras tanto puedes importar los CSV.
            </p>
          )}
        </Tarjeta>

        <Historial dias={dias} />

        <Tarjeta titulo="Datos" descripcion="En Search Console: Rendimiento → Resultados de búsqueda → Exportar. Elige «Consultas», «Páginas» y, si quieres, «Fechas». Si activaste el informe de IA generativa, aparece como un informe aparte.">
          <ZonaImportar importar={imp.importar} limpiar={imp.limpiar} hay={imp.hay} archivos={imp.datos.archivos} avisos={imp.avisos} />
          {hay && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Kpi etiqueta="Clics" valor={fmt(clics)} />
              <Kpi etiqueta="Impresiones" valor={fmt(impresiones)} />
              <Kpi etiqueta="CTR" valor={impresiones ? `${fmt((clics / impresiones) * 100, 1)} %` : '—'} nota="Clics ÷ impresiones" />
            </div>
          )}
        </Tarjeta>

        {!hay ? (
          <Vacio titulo="Sin datos de rendimiento" texto="Importa «Consultas.csv» y «Páginas.csv» de Rendimiento. Aún no necesitas la API: con las exportaciones ya se ve todo lo importante." />
        ) : (
          <>
            <Tarjeta titulo="Oportunidades (heurística propia)" descripcion="Consultas con al menos 10 impresiones, posición entre 4 y 20 y CTR menor a 3 %. Es una guía para decidir qué mejorar primero, no una regla de Google.">
              <Tabla etiqueta="Oportunidades" filas={oportunidad} idDe={(f) => f.clave} vacio="No hay consultas que cumplan el criterio con los datos importados." columnas={columnas('Consulta')} />
            </Tarjeta>
            <div className="grid gap-5 xl:grid-cols-2">
              <Tarjeta titulo="Consultas principales"><Tabla etiqueta="Consultas principales" filas={topConsultas} idDe={(f) => f.clave} vacio="Importa «Consultas.csv»." columnas={columnas('Consulta')} /></Tarjeta>
              <Tarjeta titulo="Páginas principales"><Tabla etiqueta="Páginas principales" filas={topPaginas} idDe={(f) => f.clave} vacio="Importa «Páginas.csv»." columnas={columnas('Página')} /></Tarjeta>
            </div>
          </>
        )}
      </div>
      <PiePanel />
    </main>
  )
}
