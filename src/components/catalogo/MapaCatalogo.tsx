'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fotoOptimizada } from '@/lib/medios/optimizar'
import { nombreDe, rutaDe } from '@/lib/propiedad-publica'
import { lugarDe } from '@/lib/ubicacion'
import { escapar, htmlPastilla, htmlPin, precioLargo } from '@/lib/catalogo/marcadores'
import type { PropiedadCatalogo } from './TarjetaCompacta'

/**
 * El mapa del catálogo (22-oct-2026): enseña TODAS las propiedades de lo que se está viendo —todo el catálogo, un tipo o el resultado de los
 * filtros— o UNA en concreto cuando se elige desde su tarjeta («Ver en el mapa») o tocando su marcador. Y tiene «Mapa completo»: el mismo mapa a
 * pantalla completa, con la lista de propiedades al lado.
 *
 * Marcadores según la lámina del propietario: pastilla con el precio (blanca con borde rojo; roja y llena la seleccionada) y pin rojo con la casa
 * del logotipo para las que no tienen precio. Dos reglas heredadas del mapa anterior, a propósito:
 *  · NO se enseñan las propiedades sin coordenadas (ponerlas en el centro de León sería inventar una ubicación): se cuentan y se dice cuántas faltan.
 *  · NO se enseñan las marcadas como «aproximada»: si su dueño eligió no publicar el punto exacto, respetarlo a medias no es respetarlo.
 * Leaflet se descarga solo cuando el mapa se abre (la página no carga ~150 KB de más si nadie lo ve).
 */
const LEON: [number, number] = [21.1219, -101.6833]

type Props = {
  propiedades: PropiedadCatalogo[]
  /** Qué se está viendo: «Todas las propiedades», «Casas en Venta», «Resultados de tu búsqueda». */
  etiqueta: string
  seleccionId: string | null
  onSeleccionar: (id: string | null) => void
}

const tienePunto = (p: PropiedadCatalogo) => typeof p.lat === 'number' && typeof p.lng === 'number' && p.precision_ubicacion !== 'aproximada'

export default function MapaCatalogo({ propiedades, etiqueta, seleccionId, onSeleccionar }: Props) {
  // El mapa empieza abierto en pantallas anchas y plegado en teléfonos (ahí ocuparía casi toda la pantalla antes de ver una propiedad).
  // Este componente solo se pinta en el navegador (`ssr: false`), así que se puede leer el ancho al iniciar.
  const [abierto, setAbierto] = useState<boolean>(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches)
  const [selPrevia, setSelPrevia] = useState<string | null>(null)
  const [completo, setCompleto] = useState(false)
  const [listo, setListo] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)
  const observador = useRef<ResizeObserver | null>(null)
  const mapa = useRef<import('leaflet').Map | null>(null)
  const capa = useRef<import('leaflet').LayerGroup | null>(null)
  const marcadores = useRef(new Map<string, import('leaflet').Marker>())
  const Lref = useRef<typeof import('leaflet') | null>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const cerrar = useRef<HTMLButtonElement>(null)
  const ultimoEncuadre = useRef('')

  const conPunto = useMemo(() => propiedades.filter(tienePunto), [propiedades])
  const sinPunto = propiedades.length - conPunto.length
  const clave = conPunto.map((p) => p.id).join('|')
  const elegida = seleccionId ? conPunto.find((p) => p.id === seleccionId) ?? null : null

  // Elegir una propiedad desde su tarjeta abre el mapa si estaba plegado (ajuste durante el pintado, no en un efecto).
  if (seleccionId !== selPrevia) { setSelPrevia(seleccionId); if (seleccionId) setAbierto(true) }

  /* ── Crear el mapa (una sola vez, la primera que se abre) ── */
  useEffect(() => {
    if (!abierto || mapa.current) return
    let vivo = true
    ;(async () => {
      const L = (await import('leaflet')).default
      if (!vivo || !contenedor.current || mapa.current) return
      Lref.current = L
      const m = L.map(contenedor.current, { scrollWheelZoom: false, zoomControl: true }).setView(LEON, 12)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m)
      // La rueda hace zoom solo tras pulsar dentro: si no, bajar por la página con la rueda te deja haciendo zoom sin querer.
      m.on('click', () => m.scrollWheelZoom.enable())
      m.on('mouseout', () => { if (!document.body.dataset.mapaCompleto) m.scrollWheelZoom.disable() })
      capa.current = L.layerGroup().addTo(m)
      mapa.current = m
      // El mapa se crea justo al desplegarse el panel: sin esto Leaflet mide el contenedor antes de que tenga su tamaño y pinta solo una parte.
      if (typeof ResizeObserver !== 'undefined') { observador.current = new ResizeObserver(() => m.invalidateSize()); observador.current.observe(contenedor.current) }
      setListo(true)
    })()
    return () => { vivo = false }
  }, [abierto])
  useEffect(() => () => { observador.current?.disconnect(); mapa.current?.remove(); mapa.current = null; capa.current = null; marcadores.current.clear() }, [])

  const html = useCallback((p: PropiedadCatalogo, sel: boolean) => {
    const nombre = nombreDe(p)
    const precio = typeof p.precio === 'number' && p.precio > 0 ? p.precio : null
    const etiquetaMk = precio ? `${nombre}, ${precioLargo(precio)}` : nombre
    return precio ? htmlPastilla(precio, sel ? 'seleccionada' : 'normal', etiquetaMk) : htmlPin(sel, etiquetaMk)
  }, [])

  const icono = useCallback((p: PropiedadCatalogo, sel: boolean) => {
    const L = Lref.current!
    const pin = !(typeof p.precio === 'number' && p.precio > 0)
    return L.divIcon({ className: 'mk-envoltura', html: html(p, sel), iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, pin ? -52 : -46] })
  }, [html])

  const popup = (p: PropiedadCatalogo) => {
    const foto = p.fotos?.[0] ? fotoOptimizada(p.fotos[0], 360) : ''
    const precio = typeof p.precio === 'number' && p.precio > 0 ? precioLargo(p.precio) : 'Consultar precio'
    return `<div class="mp">${foto ? `<img src="${escapar(foto)}" alt="" loading="lazy" decoding="async">` : ''}`
      + `<strong>${escapar(nombreDe(p))}</strong><span class="mp-lugar">${escapar(lugarDe(p).completo)}</span>`
      + `<span class="mp-precio">${escapar(precio)}</span><a href="${escapar(rutaDe(p))}" target="_blank" rel="noopener noreferrer">Ver ficha →</a></div>`
  }

  /* ── Pintar los marcadores cuando cambia QUÉ se está viendo ── */
  useEffect(() => {
    const L = Lref.current, grupo = capa.current
    if (!listo || !L || !grupo) return
    grupo.clearLayers(); marcadores.current.clear()
    for (const p of conPunto) {
      const mk = L.marker([p.lat as number, p.lng as number], { icon: icono(p, p.id === seleccionId), title: nombreDe(p), alt: nombreDe(p), riseOnHover: true })
      mk.bindPopup(popup(p), { closeButton: true, autoPanPadding: [30, 30] })
      mk.on('click', () => onSeleccionar(p.id))
      mk.addTo(grupo)
      marcadores.current.set(p.id, mk)
    }
    // Encuadrar lo que hay (una sola vez por cambio de lista), salvo que haya una elegida: esa se enfoca más abajo.
    if (conPunto.length && ultimoEncuadre.current !== clave && !seleccionId) {
      ultimoEncuadre.current = clave
      mapa.current?.fitBounds(L.latLngBounds(conPunto.map((p) => [p.lat as number, p.lng as number])), { padding: [48, 48], maxZoom: 15, animate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, clave])

  /* ── Cambiar la elegida: pintarla distinta y enfocarla ── */
  useEffect(() => {
    const L = Lref.current, m = mapa.current
    if (!listo || !L || !m) return
    for (const p of conPunto) marcadores.current.get(p.id)?.setIcon(icono(p, p.id === seleccionId)).setZIndexOffset(p.id === seleccionId ? 1000 : 0)
    m.invalidateSize()
    if (elegida) {
      m.flyTo([elegida.lat as number, elegida.lng as number], Math.max(m.getZoom(), 16), { duration: 0.6 })
      marcadores.current.get(elegida.id)?.openPopup()
    } else {
      m.closePopup()
      if (conPunto.length) { ultimoEncuadre.current = clave; m.fitBounds(L.latLngBounds(conPunto.map((p) => [p.lat as number, p.lng as number])), { padding: [48, 48], maxZoom: 15 }) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, seleccionId])

  /* ── Redimensionar al plegar/desplegar o pasar a pantalla completa ── */
  useEffect(() => {
    if (!listo) return
    const id = window.setTimeout(() => mapa.current?.invalidateSize(), 60)
    return () => window.clearTimeout(id)
  }, [listo, abierto, completo])

  /* ── Pantalla completa: Esc cierra, el fondo no se desplaza y el foco entra y vuelve ── */
  useEffect(() => {
    if (!completo) return
    const antes = document.activeElement as HTMLElement | null
    const abridor = boton.current
    document.body.style.overflow = 'hidden'; document.body.dataset.mapaCompleto = '1'
    cerrar.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setCompleto(false) }
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('keydown', tecla); document.body.style.overflow = ''; delete document.body.dataset.mapaCompleto
      ;(antes && document.contains(antes) ? antes : abridor)?.focus()
    }
  }, [completo])

  const estado = elegida ? nombreDe(elegida) : etiqueta
  const total = conPunto.length
  const el = (
    <section className={`mc${completo ? ' mc-completo' : ''}`} {...(completo ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Mapa completo de propiedades' } : { 'aria-label': 'Mapa de propiedades' })}>
      <header className="mc-cab">
        <div className="mc-estado" role="status" aria-live="polite">
          <i className="fa fa-map-location-dot" aria-hidden="true" />
          <span className="mc-estado-t"><strong>{elegida ? 'En el mapa:' : 'Mostrando:'}</strong> {estado}{!elegida && <> · <b>{total}</b> con ubicación</>}</span>
          {elegida && <button type="button" className="mc-todas" onClick={() => onSeleccionar(null)}>Ver todas ({total})</button>}
        </div>
        <div className="mc-botones">
          {!completo && (
            <button type="button" className="mc-btn" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
              <i className={`fa ${abierto ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" /> {abierto ? 'Ocultar mapa' : 'Ver mapa'}
            </button>
          )}
          {abierto && !completo && (
            <button ref={boton} type="button" className="mc-btn mc-btn-rojo" onClick={() => setCompleto(true)}>
              <i className="fa fa-expand" aria-hidden="true" /> Mapa completo
            </button>
          )}
          {completo && (
            <button ref={cerrar} type="button" className="mc-btn mc-btn-rojo" onClick={() => setCompleto(false)}>
              <i className="fa fa-xmark" aria-hidden="true" /> Cerrar mapa
            </button>
          )}
        </div>
      </header>

      <div className="mc-cuerpo" hidden={!abierto && !completo}>
        {completo && (
          <aside className="mc-lista" aria-label="Propiedades en el mapa">
            <ul>
              {conPunto.map((p) => (
                <li key={p.id}>
                  <button type="button" className="mc-item" aria-current={p.id === seleccionId ? 'true' : undefined} onClick={() => onSeleccionar(p.id)}>
                    {p.fotos?.[0]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={fotoOptimizada(p.fotos[0], 160)} alt="" width={64} height={48} loading="lazy" decoding="async" />
                      : <span className="mc-item-sin" aria-hidden="true" />}
                    <span><b>{nombreDe(p)}</b><small>{typeof p.precio === 'number' && p.precio > 0 ? precioLargo(p.precio) : 'Consultar precio'}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
        <div className="mc-lienzo">
          <div ref={contenedor} className="mc-mapa" />
          {!listo && abierto && <p className="mc-cargando" role="status">Cargando el mapa…</p>}
        </div>
      </div>

      {abierto && sinPunto > 0 && (
        <p className="mc-nota"><strong>{sinPunto}</strong> {sinPunto === 1 ? 'propiedad no aparece' : 'propiedades no aparecen'} en el mapa: todavía no {sinPunto === 1 ? 'tiene' : 'tienen'} punto marcado, o su dueño eligió no publicar la ubicación exacta. {sinPunto === 1 ? 'Está' : 'Están'} en las tarjetas de abajo.</p>
      )}
      {abierto && propiedades.length > 0 && total === 0 && (
        <p className="mc-nota mc-nota-info">Ninguna de estas propiedades tiene todavía su punto en el mapa. Aparecerán conforme se vayan marcando.</p>
      )}
    </section>
  )
  return el
}
