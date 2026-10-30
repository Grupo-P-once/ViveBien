'use client'

import { useId, useState } from 'react'
import { normalizarFiltros } from '@/lib/busquedas'
import { ANTIGUEDADES, GRUPOS_MAS_UI, ITEMS_MAS, PUBLICACIONES, normalizarMas, type GrupoMultiple } from '@/lib/filtros-mas'

/**
 * «Más filtros» del catálogo (28-oct-2026). Presentación agrupada, con «Ver más / Ver menos» donde hay opciones de más.
 * Reglas que la pantalla NO decide (viven en `lib/filtros-mas.ts`): solo datos estructurados, OR dentro de un grupo, AND entre grupos, sin acentos ni mayúsculas.
 * Las opciones SIN dato que las respalde (Tipo de anunciante, Recorrido 360, Sauna…) NO se muestran: ver `BLOQUEADOS` y la nota de trazabilidad.
 *
 * Accesibilidad: cada grupo es un `<fieldset>` con su `<legend>`; las opciones múltiples son casillas; las de elección única (antigüedad, fecha) son un grupo de radios con
 * «Cualquiera»; los mínimos (Baños, Estacionamientos) son botones con `aria-pressed` y nombre accesible completo («Baños: 2 o más»); «Ver más» lleva `aria-expanded` y
 * `aria-controls`; el conteo se anuncia con `role="status"`. Objetivos táctiles de 40 px. Los estilos están en `globals.css` (`.mf-*`) para poder mostrar el foco con `:focus-visible`.
 */
export type ValoresMas = Record<string, string>
export type CambioMas = Record<string, string>

const lista = (v: string | undefined): string[] => (v ? v.split(',').filter(Boolean) : [])
/** Un campo de metros no admite notación científica ni signos (`1e3`, `-5`): la normalización los descartaría en silencio. */
const sinNotacion = (e: React.KeyboardEvent<HTMLInputElement>) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault() }
const MINIMOS_BANOS =['1', '2', '3', '4', '5'] as const
const MINIMOS_EST = ['0', '1', '2', '3', '4'] as const

function Chips({ legend, claveEstado, opciones, valor, onElegir, nombre }: { legend: string; claveEstado: string; opciones: readonly string[]; valor: string; onElegir: (c: CambioMas) => void; nombre: (v: string) => string }) {
  return (
    <fieldset className="mf-grupo">
      <legend>{legend}</legend>
      <div className="mf-chips">
        {opciones.map((o) => (
          <button key={o} type="button" className="mf-chip" aria-pressed={valor === o} aria-label={nombre(o)}
            onClick={() => onElegir({ [claveEstado]: valor === o ? '' : o })}>
            {o === '0' ? '0' : `${o}+`}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function GrupoOpciones({ id, titulo, claveEstado, valores, onCambio }: { id: GrupoMultiple; titulo: string; claveEstado: GrupoMultiple; valores: ValoresMas; onCambio: (c: CambioMas) => void }) {
  const items = ITEMS_MAS.filter((i) => i.grupo === id)
  const elegidas = lista(valores[claveEstado])
  const hayExtras = items.some((i) => i.extra)
  const [abierto, setAbierto] = useState(false)
  const idExtras = useId()
  // Si algo de «Ver más» está elegido NO se puede esconder (quedaría activo sin verse).
  const extraElegida = items.some((i) => i.extra && elegidas.includes(i.id))
  const mostrarExtras = abierto || extraElegida
  const alternar = (opcion: string, marcada: boolean) => {
    const siguientes = marcada ? [...new Set([...elegidas, opcion])] : elegidas.filter((x) => x !== opcion)
    onCambio({ [claveEstado]: siguientes.join(',') })
  }
  const pintar = (i: (typeof items)[number]) => (
    <label key={i.id} className="mf-opcion">
      <input type="checkbox" checked={elegidas.includes(i.id)} onChange={(e) => alternar(i.id, e.target.checked)} />
      <span>{i.etiqueta}</span>
    </label>
  )
  return (
    <fieldset className="mf-grupo">
      <legend>{titulo}</legend>
      <div className="mf-opciones">{items.filter((i) => !i.extra).map(pintar)}</div>
      {hayExtras && (
        <>
          <div id={idExtras} className="mf-opciones" hidden={!mostrarExtras}>{items.filter((i) => i.extra).map(pintar)}</div>
          <button type="button" className="mf-mas" aria-expanded={mostrarExtras} aria-controls={idExtras} disabled={extraElegida}
            onClick={() => setAbierto((v) => !v)}>
            {mostrarExtras ? 'Ver menos' : 'Ver más'}
          </button>
        </>
      )}
    </fieldset>
  )
}

function Radios({ legend, nombre, opciones, valor, onElegir, claveEstado }: { legend: string; nombre: string; opciones: readonly (readonly [string, string])[]; valor: string; onElegir: (c: CambioMas) => void; claveEstado: string }) {
  return (
    <fieldset className="mf-grupo">
      <legend>{legend}</legend>
      <div className="mf-opciones">
        {[['', 'Cualquiera'] as const, ...opciones].map(([v, t]) => (
          <label key={v || 'cualquiera'} className="mf-opcion">
            <input type="radio" name={nombre} checked={valor === v} onChange={() => onElegir({ [claveEstado]: v })} />
            <span>{t}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Rango({ etiqueta, minimo, maximo, vMin, vMax, onCambio, claves }: { etiqueta: string; minimo: string; maximo: string; vMin: string; vMax: string; onCambio: (c: CambioMas) => void; claves: [string, string] }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={`${id}-t`} className="mf-campo">
      <span id={`${id}-t`}>{etiqueta}</span>
      <div className="mf-rango">
        <input type="number" inputMode="decimal" min={0} step="any" placeholder="Desde" aria-label={minimo} value={vMin} onKeyDown={sinNotacion} onChange={(e) => onCambio({ [claves[0]]: e.target.value })} />
        <input type="number" inputMode="decimal" min={0} step="any" placeholder="Hasta" aria-label={maximo} value={vMax} onKeyDown={sinNotacion} onChange={(e) => onCambio({ [claves[1]]: e.target.value })} />
      </div>
    </div>
  )
}

export default function PanelMasFiltros({ valores, onCambio, onLimpiar, onVer, total, buscando }: {
  valores: ValoresMas
  onCambio: (c: CambioMas) => void
  /** Limpia SOLO los filtros de este panel. */
  onLimpiar: () => void
  /** «Ver resultados»: cierra el panel y lleva a los resultados. */
  onVer: () => void
  total: number
  buscando: boolean
}) {
  const idCar = useId(), idAyudaCar = useId(), idDir = useId()
  // Mínimo mayor que máximo: la búsqueda los intercambia (igual que el precio); se DICE para que no sorprenda.
  const invertido = (a?: string, b?: string) => !!a && !!b && Number(a) > Number(b)
  const avisoInvertido = invertido(valores.cmin, valores.cmax) || invertido(valores.tmin, valores.tmax)
  return (
    <div id="mas-filtros-contenido" className="mf-panel">
      <div className="mf-rejilla">
        <div className="mf-campo">
          <label htmlFor={idCar}>Características</label>
          <input id={idCar} type="text" autoComplete="off" maxLength={200} aria-describedby={idAyudaCar} placeholder="Ej.: alberca, amueblado, permite mascotas…"
            value={valores.car ?? ''} onChange={(e) => onCambio({ car: e.target.value })} />
          <small id={idAyudaCar}>Separa con comas. Se buscan solo características declaradas por el anunciante; deben cumplirse todas.</small>
        </div>
        <div className="mf-campo">
          <label htmlFor={idDir}>Dirección</label>
          <input id={idDir} type="text" autoComplete="off" maxLength={80} placeholder="Buscar por dirección" value={valores.dir ?? ''} onChange={(e) => onCambio({ dir: e.target.value })} />
          <small>Calle o colonia; no distingue acentos ni mayúsculas.</small>
        </div>
      </div>

      <div className="mf-rejilla">
        <fieldset className="mf-grupo">
          <legend>Superficie</legend>
          <Rango etiqueta="Construida (m²)" minimo="Superficie construida desde (m²)" maximo="Superficie construida hasta (m²)" vMin={valores.cmin ?? ''} vMax={valores.cmax ?? ''} onCambio={onCambio} claves={['cmin', 'cmax']} />
          <Rango etiqueta="Terreno (m²)" minimo="Superficie de terreno desde (m²)" maximo="Superficie de terreno hasta (m²)" vMin={valores.tmin ?? ''} vMax={valores.tmax ?? ''} onCambio={onCambio} claves={['tmin', 'tmax']} />
          {avisoInvertido && <small role="status">El mínimo era mayor que el máximo: los intercambiamos para no darte cero resultados.</small>}
        </fieldset>
        <Chips legend="Baños" claveEstado="ban" opciones={MINIMOS_BANOS} valor={valores.ban ?? ''} onElegir={onCambio} nombre={(v) => `${v}+ baños`} />
        <Chips legend="Estacionamientos" claveEstado="est" opciones={MINIMOS_EST} valor={valores.est ?? ''} onElegir={onCambio} nombre={(v) => (v === '0' ? '0 estacionamientos' : `${v}+ estacionamientos`)} />
      </div>

      <div className="mf-rejilla">
        {GRUPOS_MAS_UI.map((g) => <GrupoOpciones key={g.id} id={g.id} titulo={g.titulo} claveEstado={g.id} valores={valores} onCambio={onCambio} />)}
        <Radios legend="Antigüedad" nombre="mf-antiguedad" opciones={ANTIGUEDADES} valor={valores.ant ?? ''} onElegir={onCambio} claveEstado="ant" />
        <Radios legend="Fecha de publicación" nombre="mf-publicacion" opciones={PUBLICACIONES} valor={valores.pub ?? ''} onElegir={onCambio} claveEstado="pub" />
      </div>

      <div className="mf-acciones">
        <span role="status" aria-live="polite" className="mf-conteo">{buscando ? 'Buscando…' : `${total} resultado${total === 1 ? '' : 's'}`}</span>
        <button type="button" className="mf-secundario" onClick={onLimpiar}>Limpiar</button>
        <button type="button" className="mf-primario" onClick={onVer}>{buscando ? 'Ver resultados' : `Ver ${total} resultado${total === 1 ? '' : 's'}`}</button>
      </div>
    </div>
  )
}

/* ── Filtros activos: etiquetas que se quitan una a una ───────────────────── */

type Etiqueta = { id: string; texto: string; quitar: CambioMas }
const quitarDe = (valor: string | undefined, id: string) => lista(valor).filter((x) => x !== id).join(',')

export function etiquetasActivas(valores: ValoresMas): Etiqueta[] {
  const n = normalizarMas(valores)
  const e: Etiqueta[] = []
  for (const t of n.car ?? []) e.push({ id: `car:${t}`, texto: t, quitar: { car: (n.car ?? []).filter((x) => x !== t).join(', ') } })
  const rango = (a: number | undefined, b: number | undefined, nombre: string, ka: string, kb: string) => {
    if (a || b) e.push({ id: `${ka}${kb}`, texto: a && b ? `${nombre} ${a}–${b} m²` : a ? `${nombre} desde ${a} m²` : `${nombre} hasta ${b} m²`, quitar: { [ka]: '', [kb]: '' } })
  }
  rango(n.cmin, n.cmax, 'Construcción', 'cmin', 'cmax')
  rango(n.tmin, n.tmax, 'Terreno', 'tmin', 'tmax')
  // Etiquetas de lo que REALMENTE filtra: salen de la normalización (ban=99 o est=60 se descartan y no deben parecer activos).
  const norm = normalizarFiltros(valores)
  if (norm?.ban) e.push({ id: 'ban', texto: `${norm.ban}+ baños`, quitar: { ban: '' } })
  if (norm?.est !== undefined) e.push({ id: 'est', texto: norm.est === 0 ? 'Sin estacionamiento' : `${norm.est}+ estacionamientos`, quitar: { est: '' } })
  for (const g of GRUPOS_MAS_UI) for (const id of n[g.id] ?? []) {
    const it = ITEMS_MAS.find((i) => i.grupo === g.id && i.id === id)
    if (it) e.push({ id: `${g.id}:${id}`, texto: it.etiqueta, quitar: { [g.id]: quitarDe(valores[g.id], id) } })
  }
  if (n.ant) e.push({ id: 'ant', texto: ANTIGUEDADES.find(([v]) => v === n.ant)?.[1] ?? n.ant, quitar: { ant: '' } })
  if (n.pub) e.push({ id: 'pub', texto: PUBLICACIONES.find(([v]) => v === n.pub)?.[1] ?? n.pub, quitar: { pub: '' } })
  if (n.dir) e.push({ id: 'dir', texto: `Dirección: ${n.dir}`, quitar: { dir: '' } })
  if (valores.amu === '1' || valores.amu === 'si') e.push({ id: 'amu', texto: 'Amueblado (renta)', quitar: { amu: '' } })
  if (norm?.smin || norm?.smax) e.push({ id: 'smin', texto: `Superficie principal ${norm.smin ?? '…'}–${norm.smax ?? '…'} m²`, quitar: { smin: '', smax: '' } })
  return e
}

export function FiltrosActivos({ valores, onCambio }: { valores: ValoresMas; onCambio: (c: CambioMas) => void }) {
  const etiquetas = etiquetasActivas(valores)
  if (!etiquetas.length) return null
  return (
    <ul className="mf-activos" aria-label="Filtros activos">
      {etiquetas.map((t) => (
        <li key={t.id}>
          <button type="button" className="mf-activo" aria-label={`Quitar filtro: ${t.texto}`} onClick={() => onCambio(t.quitar)}>
            <span>{t.texto}</span> <span aria-hidden="true">×</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
