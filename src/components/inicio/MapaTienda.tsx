'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

/**
 * Mapa pequeño de la tienda de VIVE BIEN (sección «Contáctanos»). Leaflet sobre OpenStreetMap: sin clave, sin costo y con los orígenes que la política
 * de seguridad del sitio ya permite (`lib/csp.ts`, teselas de OpenStreetMap). El mismo motor que ya usan los mapas del catálogo.
 *
 * Cuidados:
 *  · NO captura la página: sin zoom con la rueda y, en pantallas táctiles, sin arrastre con un dedo (el dedo sigue desplazando la página).
 *  · No entra al tabulador por sí mismo (`keyboard: false`): los botones de zoom sí; la dirección y «Cómo llegar» están como texto al lado.
 *  · El pin es CSS (`divIcon`): los iconos por defecto de Leaflet fallan con el empaquetador.
 *  · Se monta solo cuando la sección está por entrar en pantalla (lo decide el contenedor), para no pedir teselas al cargar la portada.
 */
export default function MapaTienda({ lat, lng, nombre, direccion }: { lat: number; lng: number; nombre: string; direccion: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mapa: import('leaflet').Map | undefined
    let cancelado = false
    void (async () => {
      const L = (await import('leaflet')).default
      if (cancelado || !ref.current) return
      mapa = L.map(ref.current, {
        center: [lat, lng], zoom: 16,
        scrollWheelZoom: false, keyboard: false, boxZoom: false, doubleClickZoom: false,
        dragging: !L.Browser.mobile, // en el teléfono el dedo desplaza la página; para moverse se usan los botones +/−
        touchZoom: false, zoomControl: true, attributionControl: true,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      }).addTo(mapa)
      const pin = L.divIcon({ className: 'ini-pin', html: '<span></span>', iconSize: [30, 38], iconAnchor: [15, 36] })
      L.marker([lat, lng], { icon: pin, keyboard: false, title: nombre, alt: nombre }).addTo(mapa)
    })()
    return () => { cancelado = true; mapa?.remove() }
  }, [lat, lng, nombre])

  return <div ref={ref} className="ini-mapa-lienzo" role="img" aria-label={`Mapa con la ubicación de ${nombre}: ${direccion}`} data-mapa-tienda />
}
