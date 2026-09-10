'use client'
import { useState, useEffect, useRef } from 'react'
import { lugarDe } from '@/lib/ubicacion'

/**
 * El catálogo sobre un mapa.
 *
 * Es la mitad de un portal inmobiliario moderno: mucha gente no busca por
 * filtros, busca por **dónde**. «Cerca del trabajo», «en esta zona», «no al
 * otro lado de la ciudad» son criterios que una lista no puede expresar.
 *
 * ─────────────────────────────────────────────────────────────
 * DOS COSAS QUE NO HACE, A PROPÓSITO
 *
 * **No enseña las propiedades sin coordenadas.** Ponerlas en el centro de León
 * para que «aparezcan» sería inventar una ubicación: alguien iría a ver una
 * casa que no está ahí. Se cuentan aparte y se dice cuántas faltan.
 *
 * **No enseña las marcadas como aproximadas.** Si el dueño eligió no publicar
 * el punto exacto, respetarlo a medias no es respetarlo. Es la misma regla que
 * avisa Inmuebles24 en su paso de ubicación.
 * ─────────────────────────────────────────────────────────────
 */

const LEON: [number, number] = [21.1219, -101.6833]

type Propiedad = {
  id: string
  titulo?: string
  ubicacion?: string
  ciudad?: string
  estado_dir?: string
  precio?: number
  operacion?: string
  metros?: number
  fotos?: string[]
  lat?: number | null
  lng?: number | null
  precision_ubicacion?: string | null
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

export default function MapaListado({
  propiedades,
  onElegir,
}: {
  propiedades: Propiedad[]
  onElegir?: (id: string) => void
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<import('leaflet').Map | null>(null)
  const capa = useRef<import('leaflet').LayerGroup | null>(null)
  const [listo, setListo] = useState(false)

  const conPunto = propiedades.filter(
    p =>
      typeof p.lat === 'number' &&
      typeof p.lng === 'number' &&
      p.precision_ubicacion !== 'aproximada',
  )
  const sinPunto = propiedades.length - conPunto.length

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const L = (await import('leaflet')).default
      if (!vivo || !contenedor.current || mapa.current) return

      const m = L.map(contenedor.current, { scrollWheelZoom: false }).setView(LEON, 12)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(m)

      // El scroll del ratón se activa sólo al pulsar dentro: si no, bajar por
      // la página con la rueda te deja haciendo zoom en el mapa sin querer.
      m.on('click', () => m.scrollWheelZoom.enable())
      m.on('mouseout', () => m.scrollWheelZoom.disable())

      capa.current = L.layerGroup().addTo(m)
      mapa.current = m
      setListo(true)
    })()

    return () => {
      vivo = false
      mapa.current?.remove()
      mapa.current = null
      capa.current = null
    }
  }, [])

  /* ── Pintar los marcadores ── */
  useEffect(() => {
    if (!listo || !capa.current) return
    ;(async () => {
      const L = (await import('leaflet')).default
      const grupo = capa.current
      if (!grupo) return
      grupo.clearLayers()

      if (conPunto.length === 0) return

      for (const p of conPunto) {
        const precio = typeof p.precio === 'number' && p.precio > 0 ? p.precio : null

        // El precio va EN el marcador. Un pin genérico obliga a pulsar uno por
        // uno para saber cuánto cuesta; con el precio a la vista se lee el
        // mapa de un vistazo, que es para lo que sirve un mapa.
        const icono = L.divIcon({
          className: '',
          html: `<div style="
            background:${precio ? '#C8102E' : '#5A6472'};color:#fff;
            padding:3px 9px;border-radius:14px;white-space:nowrap;
            font:700 11px/1.3 Montserrat,system-ui,sans-serif;
            border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)">
            ${precio ? pesos(precio) : 'Consultar'}
          </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        })

        const mk = L.marker([p.lat as number, p.lng as number], { icon: icono })

        mk.bindPopup(`
          <div style="min-width:170px;font-family:system-ui,sans-serif">
            ${p.fotos?.[0] ? `<img src="${p.fotos[0]}" alt="" style="width:100%;height:96px;object-fit:cover;border-radius:6px;margin-bottom:6px">` : ''}
            <strong style="display:block;font-size:.86rem;color:#1B365D;line-height:1.3">
              ${(p.titulo ?? p.id).replace(/</g, '&lt;')}
            </strong>
            <span style="font-size:.76rem;color:#8B95A3">
              ${lugarDe(p).completo.replace(/</g, '&lt;')}
            </span>
            <a href="/propiedades/${encodeURIComponent(p.id)}"
               style="display:block;margin-top:7px;font-size:.78rem;font-weight:700;color:#C8102E;text-decoration:none">
              Ver ficha →
            </a>
          </div>
        `)

        if (onElegir) mk.on('click', () => onElegir(p.id))
        mk.addTo(grupo)
      }

      // Encuadrar todo lo que hay, en vez de dejar un zoom fijo que puede
      // dejar la mitad fuera de pantalla.
      const limites = L.latLngBounds(conPunto.map(p => [p.lat as number, p.lng as number]))
      mapa.current?.fitBounds(limites, { padding: [40, 40], maxZoom: 15 })
    })()
  }, [listo, conPunto, onElegir])

  return (
    <div>
      <div ref={contenedor} style={{
        height: 460, borderRadius: 12, overflow: 'hidden',
        border: '1px solid var(--linea-oscura, rgba(11,11,12,.12))',
        background: 'var(--hueso-hundido, #E7E4DF)',
      }} />

      {/* Lo que el mapa no puede enseñar se dice, no se esconde. */}
      {sinPunto > 0 && (
        <p style={{
          fontSize: '.82rem', color: 'var(--aviso-fuerte)',
          background: 'var(--aviso-fondo-calido)', padding: '9px 13px',
          borderRadius: 8, marginTop: '.7rem', lineHeight: 1.55,
        }}>
          <strong>{sinPunto}</strong>{' '}
          {sinPunto === 1 ? 'propiedad no aparece' : 'propiedades no aparecen'} en el mapa:
          todavía no tienen punto marcado, o su dueño eligió no publicar la ubicación
          exacta. {sinPunto === 1 ? 'Está' : 'Están'} en la lista de abajo.
        </p>
      )}

      {conPunto.length === 0 && (
        <p style={{ fontSize: '.85rem', color: '#8B95A3', marginTop: '.7rem', lineHeight: 1.6 }}>
          Ninguna propiedad tiene todavía su punto en el mapa. Aparecerán aquí conforme
          se vayan marcando desde el asistente de publicación.
        </p>
      )}
    </div>
  )
}
