'use client'

import { useEffect, useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Encabezado from '@/components/admin/Encabezado'
import PiePanel from '@/components/admin/PiePanel'
import { useApi } from '@/components/admin/seo/datos'
import { Cargando, ErrorCaja, InsigniaEstado, Tabla, Tarjeta } from '@/components/admin/seo/ui'
import type { RespuestaNegocio } from '@/lib/seo/tipos'

/**
 * SEO · Negocio y local: nombre, dirección y teléfono (NAP) tal como los sirve el sitio, y contra lo OBSERVADO en la ficha de Google Maps. Para el SEO
 * local, Google compara esas fuentes: deben coincidir. La ficha se anota a mano (no se consulta Google desde el servidor): hay que volver a mirarla.
 */

const digitos = (s: string) => s.replace(/\D/g, '')

export default function PaginaSeoNegocio() {
  const api = useApi<RespuestaNegocio>('/api/admin/seo/negocio')
  useEffect(() => { void api.ejecutar('?origen=propio') }, [api.ejecutar]) // eslint-disable-line react-hooks/exhaustive-deps
  const d = api.datos

  const vsMaps = useMemo(() => {
    if (!d) return []
    const m = d.observadoGoogleMaps, n = d.negocio
    const tieneCalle = /\d/.test(m.direccion.replace(/\b\d{5}\b/g, ''))
    return [
      { campo: 'Nombre', sitio: n.nombre, maps: m.nombre, estado: n.nombre.toLowerCase() === m.nombre.toLowerCase() ? 'ok' : 'diferente' },
      { campo: 'Teléfono', sitio: n.telefono, maps: m.telefono, estado: digitos(n.telefono) === digitos(m.telefono) ? 'ok' : 'diferente' },
      { campo: 'Dirección', sitio: n.direccion, maps: m.direccion, estado: tieneCalle ? 'ok' : 'diferente', nota: tieneCalle ? undefined : 'La ficha no tiene la calle ni el número: agregar la dirección del sitio (la oficial).' },
      { campo: 'Horario', sitio: n.horario, maps: m.horario, estado: 'diferente', nota: 'El sitio ya sigue el horario de Maps. Solo difiere el miércoles: Maps dice «Abierto las 24 horas», probable error que se corrige en la ficha.' },
      { campo: 'Sitio web', sitio: 'vivebienn.com', maps: m.sitio, estado: 'ok' },
      { campo: 'Coordenadas', sitio: `${n.coordenadas.lat}, ${n.coordenadas.lng}`, maps: `${m.coordenadas.lat}, ${m.coordenadas.lng}`, estado: 'falta', nota: 'Son las mismas porque se tomaron de la propia ficha; falta validar que el pin cae sobre la tienda.' },
    ] as Array<{ campo: string; sitio: string; maps: string; estado: 'ok' | 'diferente' | 'falta'; nota?: string }>
  }, [d])

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado versal="SEO" titulo="Negocio y local" descripcion="Que el nombre, la dirección y el teléfono digan lo mismo en el sitio, en los datos estructurados y en Google Maps."
        acciones={<Button variant="outline" size="sm" onClick={() => api.ejecutar('?origen=propio')} disabled={api.cargando}><RefreshCw aria-hidden /> Volver a comprobar</Button>} />
      <div className="mt-6 space-y-5">
        {api.cargando && <Cargando />}
        {api.error && <ErrorCaja mensaje={api.error} reintentar={() => api.ejecutar('?origen=propio')} />}
        {d && (
          <>
            <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{d.avisoDireccion}</p>

            <Tarjeta titulo="Lo que sirve el sitio" descripcion={`Leído de ${d.origen} (inicio y contacto) y comparado con los datos oficiales del código.`}>
              <Tabla etiqueta="Datos del negocio en el sitio" filas={d.comprobaciones} idDe={(c) => c.campo} vacio=""
                columnas={[
                  { clave: 'c', titulo: 'Dato', celda: (c) => <span className="font-medium">{c.campo}</span> },
                  { clave: 'e', titulo: 'Debe decir', celda: (c) => c.esperado },
                  { clave: 'f', titulo: 'Dice', celda: (c) => c.encontrado ?? '—' },
                  { clave: 's', titulo: 'Estado', celda: (c) => <InsigniaEstado estado={c.estado} /> },
                  { clave: 'n', titulo: 'Nota', celda: (c) => c.nota ?? '' },
                ]} />
            </Tarjeta>

            <Tarjeta titulo={`Sitio vs. ficha de Google Maps (observada el ${d.observadoGoogleMaps.fecha})`} descripcion="La ficha la administra otra cuenta, así que se anotó a mano desde la vista pública. Si alguien la cambia, hay que volver a mirarla.">
              <Tabla etiqueta="Sitio contra Google Maps" filas={vsMaps} idDe={(f) => f.campo} vacio=""
                columnas={[
                  { clave: 'c', titulo: 'Dato', celda: (f) => <span className="font-medium">{f.campo}</span> },
                  { clave: 's', titulo: 'Sitio', celda: (f) => f.sitio },
                  { clave: 'm', titulo: 'Google Maps', celda: (f) => f.maps },
                  { clave: 'e', titulo: 'Veredicto', celda: (f) => <InsigniaEstado estado={f.estado} /> },
                  { clave: 'n', titulo: 'Nota', celda: (f) => f.nota ?? '' },
                ]} />
              <p className="mt-3 text-xs text-muted-foreground">Categoría en Maps: {d.observadoGoogleMaps.categoria} · Código plus: {d.observadoGoogleMaps.codigoPlus}</p>
            </Tarjeta>
          </>
        )}
      </div>
      <PiePanel />
    </main>
  )
}
