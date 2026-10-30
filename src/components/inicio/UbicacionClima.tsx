'use client'
import { useEffect, useState } from 'react'
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, MapPin, Sun, type LucideIcon } from 'lucide-react'

/**
 * Ubicación y clima de quien visita, en el hero (22-oct-2026). Sustituye al texto fijo «León · Guanajuato · México» y al widget del header.
 * La ciudad sale de la IP en el SERVIDOR (`/api/clima`, cabeceras de Vercel): aquí no se pide permiso ni se envía la IP a terceros. Sin respuesta
 * (sin red, error), muestra «León, Gto.» —la sede— y ninguna temperatura: nunca un dato inventado.
 */
type Respuesta = { ciudad: string; region: string; clima: { temp: number; icono: string; desc: string } | null }
const ICONOS: Record<string, LucideIcon> = { sol: Sun, poco: CloudSun, nube: Cloud, lluvia: CloudRain, tormenta: CloudLightning, niebla: CloudFog, nieve: CloudSnow }

export default function UbicacionClima() {
  const [d, setD] = useState<Respuesta | null>(null)

  useEffect(() => {
    const c = new AbortController()
    fetch('/api/clima', { signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Respuesta | null) => { if (j && typeof j.ciudad === 'string') setD(j) })
      .catch(() => {})
    return () => c.abort()
  }, [])

  const ciudad = d?.ciudad ?? 'León'
  const region = d ? d.region : 'Gto.'
  const Icono = d?.clima ? (ICONOS[d.clima.icono] ?? Cloud) : null
  return (
    <p className="ini-clima" aria-label={d?.clima ? `Ubicación: ${ciudad}${region ? `, ${region}` : ''}. Clima: ${d.clima.temp} grados, ${d.clima.desc}` : `Ubicación: ${ciudad}${region ? `, ${region}` : ''}`}>
      <MapPin aria-hidden size={15} className="ini-clima-pin" />
      <span className="ini-clima-lugar">{ciudad}{region ? <small>, {region}</small> : null}</span>
      {d?.clima && Icono && (
        <>
          <span aria-hidden className="ini-clima-sep" />
          <Icono aria-hidden size={17} className="ini-clima-icono" />
          <span className="ini-clima-temp">{d.clima.temp}°C</span>
          <span className="ini-clima-desc">{d.clima.desc}</span>
        </>
      )}
    </p>
  )
}
