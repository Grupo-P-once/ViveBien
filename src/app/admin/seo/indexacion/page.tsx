'use client'

import { useMemo } from 'react'
import Encabezado from '@/components/admin/Encabezado'
import PiePanel from '@/components/admin/PiePanel'
import { useImportacion, ZonaImportar } from '@/components/admin/seo/datos'
import { Kpi, Tabla, Tarjeta, Vacio, fmt } from '@/components/admin/seo/ui'
import { accionParaMotivo, resumirGrafico, type FilaGrafico } from '@/lib/seo/csv'
import { cn } from '@/lib/utils'

/** SEO · Indexación: motivos por los que Google no indexa páginas, qué significan y qué hacer (a partir de las exportaciones de Cobertura). */

function GraficoIndexacion({ filas }: { filas: FilaGrafico[] }) {
  const f = [...filas].filter((x) => x.indexadas != null || x.sinIndexar != null).sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (f.length < 2) return null
  const W = 640, H = 160, P = 28
  const max = Math.max(1, ...f.map((x) => Math.max(x.indexadas ?? 0, x.sinIndexar ?? 0)))
  const x = (i: number) => P + (i / (f.length - 1)) * (W - P * 2)
  const y = (v: number) => H - P - (v / max) * (H - P * 2)
  const linea = (k: 'indexadas' | 'sinIndexar') => f.map((p, i) => (p[k] == null ? '' : `${i === 0 || f[i - 1][k] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[k] as number).toFixed(1)}`)).join(' ')
  const ult = f[f.length - 1]
  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-3xl" role="img" aria-label={`Evolución del ${f[0].fecha} al ${ult.fecha}: indexadas ${ult.indexadas ?? '—'}, sin indexar ${ult.sinIndexar ?? '—'}.`}>
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="currentColor" strokeOpacity=".2" />
        <path d={linea('indexadas')} fill="none" stroke="#047857" strokeWidth="2.5" />
        <path d={linea('sinIndexar')} fill="none" stroke="#b91c1c" strokeWidth="2.5" strokeDasharray="5 4" />
        <text x={P} y={14} fontSize="11" fill="currentColor">máx. {max}</text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span><span aria-hidden className="mr-1 inline-block h-0.5 w-5 bg-emerald-700 align-middle" />Indexadas (línea continua)</span>
        <span><span aria-hidden className="mr-1 inline-block h-0.5 w-5 border-t-2 border-dashed border-red-700 align-middle" />Sin indexar (línea punteada)</span>
      </figcaption>
    </figure>
  )
}

export default function PaginaSeoIndexacion() {
  const imp = useImportacion()
  const filas = useMemo(() => (imp.datos.problemas ?? []).map((p) => ({ ...p, ...accionParaMotivo(p.motivo) })).sort((a, b) => Number(b.esProblema) - Number(a.esProblema) || b.paginas - a.paginas), [imp.datos.problemas])
  const g = imp.datos.grafico ? resumirGrafico(imp.datos.grafico) : null
  const total = filas.reduce((s, f) => s + f.paginas, 0)
  const porCorregir = filas.filter((f) => f.esProblema).reduce((s, f) => s + f.paginas, 0)

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado versal="SEO" titulo="Indexación" descripcion="Por qué Google no indexa algunas páginas y qué hacer con cada motivo. Algunos motivos son normales." />
      <div className="mt-6 space-y-5">
        <Tarjeta titulo="Datos" descripcion="En Search Console: Indexación → Páginas → Exportar. Elige «Gráfico» y «Problemas críticos» (y «no críticos» si hay).">
          <ZonaImportar importar={imp.importar} limpiar={imp.limpiar} hay={imp.hay} archivos={imp.datos.archivos} avisos={imp.avisos} />
          {g && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Kpi etiqueta="Indexadas" valor={fmt(g.indexadas)} tono="bien" nota={g.variacionIndexadas == null ? undefined : `${g.variacionIndexadas >= 0 ? '+' : ''}${g.variacionIndexadas} en 28 días`} />
              <Kpi etiqueta="Sin indexar" valor={fmt(g.sinIndexar)} />
              <Kpi etiqueta="Por corregir" valor={filas.length ? fmt(porCorregir) : '—'} tono={porCorregir ? 'mal' : 'neutro'} nota={filas.length ? `de ${fmt(total)} páginas con algún motivo` : 'Importa «Problemas críticos»'} />
            </div>
          )}
          {imp.datos.grafico && <GraficoIndexacion filas={imp.datos.grafico} />}
        </Tarjeta>

        <Tarjeta titulo="Motivos y qué hacer" descripcion="Los marcados «Normal» no requieren acción: una redirección o un noindex en una página interna es lo esperado.">
          {filas.length === 0 ? (
            <Vacio titulo="Sin motivos importados" texto="Importa «Problemas críticos.csv» para ver aquí cada motivo, cuántas páginas afecta y qué hacer." />
          ) : (
            <Tabla etiqueta="Motivos de no indexación" filas={filas} idDe={(f) => f.motivo} vacio=""
              columnas={[
                { clave: 'motivo', titulo: 'Motivo', celda: (f) => <span className="font-medium">{f.motivo}</span> },
                { clave: 'paginas', titulo: 'Páginas', alinear: 'der', celda: (f) => fmt(f.paginas) },
                { clave: 'tipo', titulo: '¿Corregir?', celda: (f) => <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', f.esProblema ? 'bg-orange-100 text-orange-900' : 'bg-emerald-100 text-emerald-900')}>{f.esProblema ? 'Revisar' : 'Normal'}</span> },
                { clave: 'que', titulo: 'Qué significa', celda: (f) => f.que },
                { clave: 'accion', titulo: 'Qué hacer', celda: (f) => f.accion, ancho: 'min-w-[18rem]' },
                { clave: 'val', titulo: 'Validación', celda: (f) => f.validacion || '—' },
              ]} />
          )}
        </Tarjeta>
      </div>
      <PiePanel />
    </main>
  )
}
