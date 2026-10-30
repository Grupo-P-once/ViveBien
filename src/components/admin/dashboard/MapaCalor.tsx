'use client'

import { useEffect, useRef, useState } from 'react'
import type { PuntoMapa } from '@/lib/admin/resumen'

/**
 * Mapa de calor: dónde está lo que la gente mira.
 *
 * ─────────────────────────────────────────────────────────────
 * QUÉ MIDE, Y POR QUÉ NO LAS ZONAS BUSCADAS
 *
 * La referencia pone manchas sobre las zonas buscadas. Pero lo que se escribe
 * en el buscador es texto libre («San Juan Bosco», «norte», «cerca del
 * Poliforum»): no tiene coordenadas, y ubicarlo sería inventar un punto.
 *
 * Lo que sí tiene coordenadas son las propiedades. Así que cada mancha es una
 * propiedad publicada, en su pin real, con el tamaño y el tono según **cuántas
 * vistas tuvo en el período**. Donde se juntan manchas grandes está el interés.
 * ─────────────────────────────────────────────────────────────
 *
 * Los nombres entran al mapa como texto (`textContent`), nunca como HTML: vienen
 * de la base y los escribe quien publica.
 */

const LEON: [number, number] = [21.1219, -101.6833]
const RAMPA = ['var(--rampa-1)', 'var(--rampa-2)', 'var(--rampa-3)', 'var(--rampa-4)']

function mancha(p: PuntoMapa, maximo: number): HTMLElement {
  const el = document.createElement('div')
  const proporcion = maximo > 0 ? p.vistas / maximo : 0
  if (p.vistas === 0) {
    el.style.cssText = 'width:12px;height:12px;border-radius:50%;background:#9c9a93;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.25)'
    return el
  }
  const tamano = Math.round(26 + 58 * Math.sqrt(proporcion))
  const color = RAMPA[Math.min(RAMPA.length - 1, Math.floor(proporcion * RAMPA.length))]
  el.style.cssText = [
    `width:${tamano}px`, `height:${tamano}px`, 'border-radius:50%',
    `background:radial-gradient(circle, ${color} 0%, color-mix(in srgb, ${color} 55%, transparent) 38%, transparent 70%)`,
  ].join(';')
  return el
}

function etiqueta(p: PuntoMapa): HTMLElement {
  const el = document.createElement('div')
  const nombre = document.createElement('strong')
  nombre.textContent = p.nombre
  const datos = document.createElement('div')
  datos.textContent = `${p.vistas} ${p.vistas === 1 ? 'vista' : 'vistas'} · ${p.solicitudes} ${p.solicitudes === 1 ? 'solicitud' : 'solicitudes'}`
  el.append(nombre, datos)
  if (p.folio) {
    const folio = document.createElement('div')
    folio.textContent = p.folio
    folio.style.color = '#8a8882'
    el.append(folio)
  }
  return el
}

export default function MapaCalor({ puntos }: { puntos: PuntoMapa[] }) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<import('leaflet').Map | null>(null)
  const capa = useRef<import('leaflet').LayerGroup | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const L = (await import('leaflet')).default
      if (!vivo || !contenedor.current || mapa.current) return
      const m = L.map(contenedor.current, { scrollWheelZoom: false, attributionControl: true, zoomControl: true }).setView(LEON, 12)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m)
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

  useEffect(() => {
    if (!listo) return
    ;(async () => {
      const L = (await import('leaflet')).default
      const m = mapa.current
      const grupo = capa.current
      if (!m || !grupo) return
      grupo.clearLayers()
      const maximo = Math.max(0, ...puntos.map((p) => p.vistas))
      // Las más vistas encima: si se solapan, la mancha fuerte no queda tapada.
      for (const p of [...puntos].sort((a, b) => a.vistas - b.vistas)) {
        const el = mancha(p, maximo)
        const tamano = parseInt(el.style.width, 10) || 12
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html: el, className: '', iconSize: [tamano, tamano], iconAnchor: [tamano / 2, tamano / 2] }),
          keyboard: true,
          title: p.nombre,
        })
          .bindTooltip(etiqueta(p), { direction: 'top', offset: [0, -tamano / 4] })
          .addTo(grupo)
      }
      if (puntos.length === 1) m.setView([puntos[0].lat, puntos[0].lng], 13)
      else if (puntos.length > 1) m.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 14 })
    })()
  }, [listo, puntos])

  return <div ref={contenedor} className="h-full min-h-[240px] w-full overflow-hidden rounded-lg bg-muted" aria-label="Mapa de calor de vistas por ubicación" role="region" />
}
