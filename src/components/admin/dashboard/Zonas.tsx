'use client'

import dynamic from 'next/dynamic'
import { MapPin } from 'lucide-react'
import type { PuntoMapa, ZonaBuscada } from '@/lib/admin/resumen'
import { entero } from '@/lib/admin/formato'
import TarjetaGrafica, { TablaSimple, Vacio } from './TarjetaGrafica'

// Leaflet toca `window`: sólo en el navegador.
const MapaCalor = dynamic(() => import('./MapaCalor'), {
  ssr: false,
  loading: () => <div className="h-full min-h-[240px] w-full animate-pulse rounded-lg bg-muted" />,
})

/**
 * Zonas más buscadas, y al lado, dónde está el interés sobre el mapa.
 *
 * Son dos preguntas distintas y se dice así: las barras cuentan lo que la gente
 * ESCRIBE en el buscador; el mapa, lo que MIRA (ver `MapaCalor`).
 */
export default function Zonas({ zonas, puntos, sinCoordenadas }: { zonas: ZonaBuscada[]; puntos: PuntoMapa[]; sinCoordenadas: number }) {
  const maximo = Math.max(...zonas.map((z) => z.busquedas), 1)

  return (
    <TarjetaGrafica
      icono={MapPin}
      titulo="Zonas más buscadas"
      subtitulo="Lo que la gente escribe en el buscador, y dónde está lo que mira"
      tabla={
        <div className="space-y-4">
          <TablaSimple
            columnas={['Zona buscada', 'Búsquedas', 'Publicadas en la zona']}
            filas={zonas.map((z) => [z.zona, entero(z.busquedas), entero(z.activas)])}
          />
          <TablaSimple
            columnas={['Propiedad', 'Folio', 'Vistas', 'Solicitudes']}
            filas={puntos.map((p) => [p.nombre, p.folio || '—', entero(p.vistas), entero(p.solicitudes)])}
          />
        </div>
      }
    >
      {/* Lado a lado sólo si la tarjeta es ancha, no la ventana: con la barra
          lateral abierta, una ventana grande puede dejar la tarjeta estrecha. */}
      <div className="grid gap-6 @xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          {zonas.length === 0 ? (
            <Vacio>Todavía no hay búsquedas por zona en este período.</Vacio>
          ) : (
            <ul className="space-y-3.5">
              {zonas.map((z) => (
                <li key={z.zona} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_1.75rem] items-center gap-3 text-sm">
                  <span className="truncate" title={z.zona}>{z.zona}</span>
                  <span className="h-3.5">
                    <span
                      className="block h-full rounded-r-[4px] bg-[var(--marca)]"
                      style={{ width: `${Math.max(3, (z.busquedas / maximo) * 100)}%` }}
                      title={`${z.zona}: ${z.busquedas} búsquedas, ${z.activas} publicadas en la zona`}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{entero(z.busquedas)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex min-h-[260px] flex-col">
          {puntos.length === 0 ? (
            <Vacio>Ninguna propiedad publicada tiene ubicación en el mapa.</Vacio>
          ) : (
            <>
              <div className="min-h-[240px] flex-1"><MapaCalor puntos={puntos} /></div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  Vistas en el período: menos
                  {['var(--rampa-1)', 'var(--rampa-2)', 'var(--rampa-3)', 'var(--rampa-4)'].map((c) => (
                    <span key={c} className="size-3 rounded-full" style={{ background: c }} aria-hidden />
                  ))}
                  más
                </span>
                {sinCoordenadas > 0 && <span>{sinCoordenadas} {sinCoordenadas === 1 ? 'publicada sin ubicación' : 'publicadas sin ubicación'}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </TarjetaGrafica>
  )
}
