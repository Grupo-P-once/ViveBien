'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Mapa con pin arrastrable, para que el publicador marque dónde está.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ LEAFLET Y NO GOOGLE MAPS
 *
 * El paso 1.b de Inmuebles24 es autocompletado de dirección más un pin que se
 * arrastra, y es lo mejor de su asistente. Reproducirlo con Google exige una
 * clave de **Maps JavaScript API + Places**, y eso exige **cuenta de
 * facturación con tarjeta**. El crédito mensual gratuito cubre de sobra este
 * volumen, pero es un trámite y una tarjeta a nombre de alguien.
 *
 * Leaflet sobre OpenStreetMap no necesita clave, no cuesta nada y para
 * **colocar un punto en León** la cobertura es buena. El geocodificador es
 * Nominatim, también gratuito.
 *
 * Se instaló `@vis.gl/react-google-maps` antes de comprobar lo de la clave.
 * Queda en el proyecto por si algún día hay cuenta de facturación; hoy no se
 * usa. Mejor decirlo que dejarlo ahí sin explicación.
 * ─────────────────────────────────────────────────────────────
 *
 * Nominatim pide identificarse y **no más de una petición por segundo**. Por
 * eso la búsqueda va con retardo y sólo al soltar el teclado — no en cada
 * pulsación, que es lo que haría un autocompletado ingenuo y lo que hace que
 * te bloqueen.
 */

const LEON: [number, number] = [21.1219, -101.6833]

type Sugerencia = { nombre: string; lat: number; lng: number }

type Props = {
  lat?: number | null
  lng?: number | null
  /** Texto de la dirección, para arrancar la búsqueda con algo. */
  direccion?: string
  onCambio: (v: { lat: number; lng: number; direccion?: string }) => void
  deshabilitado?: boolean
}

export default function MapaSelector({ lat, lng, direccion, onCambio, deshabilitado }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<import('leaflet').Map | null>(null)
  const marcador = useRef<import('leaflet').Marker | null>(null)

  const [listo, setListo] = useState(false)
  const [busqueda, setBusqueda] = useState(direccion ?? '')
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState('')

  const posicion: [number, number] =
    typeof lat === 'number' && typeof lng === 'number' ? [lat, lng] : LEON

  /* ── Montar el mapa ───────────────────────────────────────────
     Leaflet toca `window` al importarse, así que sólo puede cargarse en el
     navegador. Import dinámico dentro del efecto, no arriba del archivo. */
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const L = (await import('leaflet')).default
      if (!vivo || !contenedor.current || mapa.current) return

      // Los iconos de Leaflet vienen con rutas relativas que Next no resuelve;
      // sin esto el marcador sale como imagen rota.
      const icono = L.divIcon({
        className: '',
        html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;
                 background:#C8102E;transform:rotate(-45deg);
                 border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 26],
      })

      const m = L.map(contenedor.current, { attributionControl: true })
        .setView(posicion, lat && lng ? 16 : 12)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(m)

      const mk = L.marker(posicion, { draggable: !deshabilitado, icon: icono }).addTo(m)
      mk.on('dragend', () => {
        const p = mk.getLatLng()
        onCambio({ lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7) })
      })

      // Pulsar en el mapa también mueve el pin: arrastrar en un teléfono es
      // incómodo y mucha gente toca antes de intentar arrastrar.
      if (!deshabilitado) {
        m.on('click', (e: import('leaflet').LeafletMouseEvent) => {
          mk.setLatLng(e.latlng)
          onCambio({ lat: +e.latlng.lat.toFixed(7), lng: +e.latlng.lng.toFixed(7) })
        })
      }

      mapa.current = m
      marcador.current = mk
      setListo(true)
    })()

    return () => {
      vivo = false
      mapa.current?.remove()
      mapa.current = null
      marcador.current = null
    }
    // Se monta una vez. Las posiciones posteriores se aplican en el efecto de
    // abajo, sin recrear el mapa: recrearlo perdería el zoom del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Mover el pin si el valor cambia desde fuera ── */
  useEffect(() => {
    if (!listo || typeof lat !== 'number' || typeof lng !== 'number') return
    marcador.current?.setLatLng([lat, lng])
    mapa.current?.setView([lat, lng], Math.max(mapa.current.getZoom(), 16))
  }, [lat, lng, listo])

  /* ── Buscar dirección (Nominatim) ── */
  const buscar = useCallback(async (texto: string) => {
    const q = texto.trim()
    if (q.length < 4) { setSugerencias([]); return }

    setBuscando(true)
    setError('')
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('q', `${q}, Guanajuato, México`)
      url.searchParams.set('format', 'json')
      url.searchParams.set('limit', '5')
      url.searchParams.set('countrycodes', 'mx')
      url.searchParams.set('accept-language', 'es')

      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(String(res.status))
      const j = (await res.json()) as { display_name: string; lat: string; lon: string }[]

      setSugerencias(j.map(r => ({
        nombre: r.display_name,
        lat: Number(r.lat),
        lng: Number(r.lon),
      })))
    } catch {
      setError('No pudimos buscar esa dirección. Puedes mover el pin a mano.')
      setSugerencias([])
    }
    setBuscando(false)
  }, [])

  // Retardo largo a propósito: Nominatim admite una petición por segundo y
  // bloquea a quien abusa. Un autocompletado por pulsación nos banearía.
  useEffect(() => {
    if (deshabilitado) return
    const t = setTimeout(() => buscar(busqueda), 800)
    return () => clearTimeout(t)
  }, [busqueda, buscar, deshabilitado])

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: '.6rem' }}>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          disabled={deshabilitado}
          placeholder="Escribe la calle y colonia, o mueve el pin"
          style={{
            width: '100%', padding: '11px 13px', borderRadius: 8,
            border: '1px solid var(--borde-frio)', fontSize: '.95rem', fontFamily: 'inherit',
          }}
        />
        {buscando && (
          <span style={{ position: 'absolute', right: 12, top: 12, fontSize: '.78rem', color: '#8B95A3' }}>
            buscando…
          </span>
        )}

        {sugerencias.length > 0 && (
          <ul style={{
            position: 'absolute', zIndex: 500, top: '100%', left: 0, right: 0,
            listStyle: 'none', margin: '4px 0 0', padding: 0,
            background: '#fff', border: '1px solid var(--borde-frio)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(11,11,12,.12)',
            maxHeight: 240, overflowY: 'auto',
          }}>
            {sugerencias.map((s, i) => (
              <li key={i}>
                <button type="button"
                  onClick={() => {
                    setBusqueda(s.nombre)
                    setSugerencias([])
                    onCambio({ lat: s.lat, lng: s.lng, direccion: s.nombre })
                  }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '9px 12px', border: 'none', background: 'none',
                    fontSize: '.85rem', lineHeight: 1.45, cursor: 'pointer',
                    fontFamily: 'inherit', color: '#374151',
                  }}>
                  {s.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div ref={contenedor} style={{
        height: 320, borderRadius: 10, overflow: 'hidden',
        border: '1px solid var(--borde-frio)', background: 'var(--hueso-hundido, #E7E4DF)',
      }} />

      <p style={{ fontSize: '.78rem', color: '#8B95A3', marginTop: '.5rem', lineHeight: 1.55 }}>
        {deshabilitado
          ? 'La ubicación no se puede cambiar mientras el anuncio está en revisión.'
          : 'Arrastra el pin o toca el mapa para ajustar la ubicación exacta.'}
        {typeof lat === 'number' && typeof lng === 'number' && (
          <span style={{ display: 'block', marginTop: 2, color: 'var(--exito-fuerte)' }}>
            Ubicación marcada.
          </span>
        )}
      </p>

      {error && (
        <p style={{ fontSize: '.8rem', color: 'var(--aviso-fuerte)', marginTop: '.35rem' }}>{error}</p>
      )}
    </div>
  )
}
