import { MousePointerClick } from 'lucide-react'
import type { PasoInteraccion } from '@/lib/admin/resumen'
import { entero, porcentaje } from '@/lib/admin/formato'
import TarjetaGrafica, { TablaSimple, Vacio } from './TarjetaGrafica'

/**
 * Del interés al contacto.
 *
 * La referencia lo dibuja como un embudo, y no lo es: se puede pedir contacto
 * sin haber guardado la propiedad en favoritos. Un embudo afirmaría que cada
 * paso es parte del anterior. Aquí son barras sobre la misma base —las vistas—
 * con su porcentaje: dice lo mismo sin afirmar lo que no pasa.
 */
export default function Interaccion({ pasos }: { pasos: PasoInteraccion[] }) {
  const vistas = pasos.find((p) => p.clave === 'vistas')?.n ?? 0
  const maximo = Math.max(...pasos.map((p) => p.n), 1)

  return (
    <TarjetaGrafica
      icono={MousePointerClick}
      titulo="Del interés al contacto"
      subtitulo="Cuántas vistas terminan en un favorito o en una solicitud"
      tabla={
        <TablaSimple
          columnas={['Paso', 'Cantidad', '% de las vistas']}
          filas={pasos.map((p) => [p.etiqueta, entero(p.n), porcentaje(p.pct)])}
        />
      }
    >
      {vistas === 0 ? (
        <Vacio>Todavía no hay vistas de propiedades en este período.</Vacio>
      ) : (
        <ul className="space-y-5">
          {pasos.map((p) => (
            <li key={p.clave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5">
              <span className="text-sm text-foreground">{p.etiqueta}</span>
              <span className="rounded-md bg-[var(--marca-tinte)] px-2 py-0.5 text-sm font-semibold text-foreground tabular-nums">
                {porcentaje(p.pct)}
              </span>
              <div className="col-span-2 flex items-center gap-3">
                <div className="h-6 flex-1">
                  <div
                    className="h-full rounded-r-[4px] bg-[var(--marca)]"
                    style={{ width: `${Math.max(p.n > 0 ? 1.5 : 0, (p.n / maximo) * 100)}%` }}
                    title={`${p.etiqueta}: ${entero(p.n)}`}
                  />
                </div>
                <span className="w-12 text-right font-heading text-base font-bold tabular-nums">{entero(p.n)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </TarjetaGrafica>
  )
}
