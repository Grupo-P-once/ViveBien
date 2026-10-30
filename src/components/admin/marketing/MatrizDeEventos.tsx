'use client'

import { useId, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * «Matriz de eventos» plegable. Plegada: título, aviso y un resumen con la cantidad de eventos por estado. Desplegada: la matriz completa, agrupada, como tabla en
 * pantallas anchas y como tarjetas en el móvil (sin tablas recortadas). El control es un botón nativo: Enter y Espacio lo operan y `aria-expanded` dice su estado.
 */
export type EventoMatriz = { grupo: string; evento: string; destinatario: string; canal: string; categoria: string; preferencia: string; frecuencia: string; estado: string }

const ESTADO: Record<string, { texto: string; clase: string }> = {
  envia_hoy: { texto: 'Se envía hoy', clase: 'border-emerald-300 bg-emerald-50 text-emerald-950' },
  codigo_apagado: { texto: 'Código listo, apagado', clase: 'border-amber-300 bg-amber-50 text-amber-950' },
  apagado_por_texto_legal: { texto: 'Apagado: falta texto legal aprobado', clase: 'border-amber-300 bg-amber-50 text-amber-950' },
  lo_manda_firebase: { texto: 'Lo manda Firebase', clase: 'border-slate-300 bg-slate-50 text-slate-900' },
  no_existe: { texto: 'No existe todavía', clase: 'border-rose-300 bg-rose-50 text-rose-950' },
}
const ORDEN = ['envia_hoy', 'codigo_apagado', 'apagado_por_texto_legal', 'lo_manda_firebase', 'no_existe']

function Estado({ estado }: { estado: string }) {
  const e = ESTADO[estado] ?? { texto: estado, clase: 'bg-background' }
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${e.clase}`}>{e.texto}</span>
}

export default function MatrizDeEventos({ matriz }: { matriz: EventoMatriz[] | null }) {
  const [abierta, setAbierta] = useState(false)
  const id = useId()
  const cuerpo = `${id}-cuerpo`
  const grupos = matriz ? [...new Set(matriz.map((m) => m.grupo))] : []
  const conteo = (estado: string) => (matriz ?? []).filter((m) => m.estado === estado).length

  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-xl border bg-card p-5" data-matriz={abierta ? 'abierta' : 'plegada'}>
      <h2 id={`${id}-titulo`} className="font-heading text-lg font-semibold">
        <button type="button" aria-expanded={abierta} aria-controls={cuerpo} onClick={() => setAbierta((a) => !a)} className="flex w-full items-center gap-2 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          {abierta ? <ChevronDown className="size-5 shrink-0" aria-hidden /> : <ChevronRight className="size-5 shrink-0" aria-hidden />}
          <span>Matriz de eventos</span>
          <span className="ml-auto text-xs font-normal text-muted-foreground">{abierta ? 'Plegar' : 'Desplegar'}</span>
        </button>
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Catálogo tentativo: no significa que exista cada correo. Las categorías son provisionales hasta la asesoría legal; la campana y el correo son canales independientes.</p>
      {!matriz ? <p role="status" className="mt-2 text-sm text-muted-foreground">Cargando…</p> : (
        <p className="mt-2 text-sm" data-resumen-matriz>
          <strong>{matriz.length} eventos:</strong>{' '}
          {ORDEN.filter((e) => conteo(e) > 0).map((e, i, a) => <span key={e}>{conteo(e)} {ESTADO[e].texto.toLowerCase()}{i < a.length - 1 ? ' · ' : ''}</span>)}
        </p>
      )}
      <div id={cuerpo} hidden={!abierta} className="mt-3 space-y-5">
        {matriz && grupos.map((g) => {
          const filas = matriz.filter((m) => m.grupo === g)
          return (
            <div key={g}>
              <h3 className="text-sm font-semibold">{g} <span className="font-normal text-muted-foreground">({filas.length})</span></h3>
              <div className="mt-2 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <caption className="sr-only">Eventos de correo del grupo {g} y su estado</caption>
                  <thead><tr className="border-b">{['Evento', 'Destinatario', 'Canal', 'Categoría', 'Preferencia', 'Frecuencia', 'Estado'].map((h) => <th key={h} scope="col" className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {filas.map((m) => (
                      <tr key={m.evento} className="border-b align-top">
                        <th scope="row" className="px-2 py-2 font-medium">{m.evento}</th><td className="px-2 py-2">{m.destinatario}</td><td className="px-2 py-2">{m.canal}</td>
                        <td className="px-2 py-2">{m.categoria}</td><td className="px-2 py-2">{m.preferencia}</td><td className="px-2 py-2">{m.frecuencia}</td><td className="px-2 py-2"><Estado estado={m.estado} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="mt-2 space-y-2 md:hidden">
                {filas.map((m) => (
                  <li key={m.evento} className="rounded-lg border bg-background p-3 text-sm">
                    <p className="font-medium">{m.evento}</p>
                    <p className="mt-1"><Estado estado={m.estado} /></p>
                    <dl className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">Destinatario</dt><dd>{m.destinatario}</dd>
                      <dt className="text-muted-foreground">Canal</dt><dd>{m.canal}</dd>
                      <dt className="text-muted-foreground">Categoría</dt><dd>{m.categoria}</dd>
                      <dt className="text-muted-foreground">Preferencia</dt><dd>{m.preferencia}</dd>
                      <dt className="text-muted-foreground">Frecuencia</dt><dd>{m.frecuencia}</dd>
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
