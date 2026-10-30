import { NextResponse } from 'next/server'

/**
 * GET /api/clima — la ubicación y el clima de QUIEN visita la portada (22-oct-2026).
 *
 * La ubicación sale de las cabeceras que Vercel pone en cada petición según la IP (`x-vercel-ip-*`): la IP NO se guarda ni se manda a ningún tercero.
 * Al proveedor del clima (Open-Meteo) solo van unas coordenadas REDONDEADAS (aprox. 11 km), nunca la IP. Sin cabeceras (desarrollo local, pruebas, IP sin
 * geolocalizar) se responde León, Gto., la sede. Si el clima falla, se responde igual la ciudad (sin temperatura): la portada nunca se rompe por esto.
 */
export const dynamic = 'force-dynamic'

const LEON = { ciudad: 'León', region: 'Gto.', lat: 21.1236, lon: -101.6832 }

/** Región de México (ISO 3166-2) → abreviatura que se usa en el sitio. */
const ESTADOS: Record<string, string> = {
  AGU: 'Ags.', BCN: 'B.C.', BCS: 'B.C.S.', CAM: 'Camp.', CHP: 'Chis.', CHH: 'Chih.', CMX: 'CDMX', COA: 'Coah.', COL: 'Col.', DUR: 'Dgo.', GUA: 'Gto.',
  GRO: 'Gro.', HID: 'Hgo.', JAL: 'Jal.', MEX: 'Méx.', MIC: 'Mich.', MOR: 'Mor.', NAY: 'Nay.', NLE: 'N.L.', OAX: 'Oax.', PUE: 'Pue.', QUE: 'Qro.',
  ROO: 'Q. Roo', SLP: 'S.L.P.', SIN: 'Sin.', SON: 'Son.', TAB: 'Tab.', TAM: 'Tamps.', TLA: 'Tlax.', VER: 'Ver.', YUC: 'Yuc.', ZAC: 'Zac.',
}

/** Código de clima de Open-Meteo (WMO) → ícono (clave) y descripción en español. */
function describir(code: number): { icono: 'sol' | 'poco' | 'nube' | 'lluvia' | 'tormenta' | 'niebla' | 'nieve'; desc: string } {
  if (code === 0) return { icono: 'sol', desc: 'Despejado' }
  if (code === 1) return { icono: 'sol', desc: 'Mayormente despejado' }
  if (code === 2) return { icono: 'poco', desc: 'Parcialmente nublado' }
  if (code === 3) return { icono: 'nube', desc: 'Nublado' }
  if (code === 45 || code === 48) return { icono: 'niebla', desc: 'Neblina' }
  if (code >= 51 && code <= 57) return { icono: 'lluvia', desc: 'Llovizna' }
  if (code >= 61 && code <= 67) return { icono: 'lluvia', desc: 'Lluvia' }
  if (code >= 71 && code <= 77) return { icono: 'nieve', desc: 'Nieve' }
  if (code >= 80 && code <= 82) return { icono: 'lluvia', desc: 'Chubascos' }
  if (code >= 95) return { icono: 'tormenta', desc: 'Tormenta' }
  return { icono: 'nube', desc: 'Variable' }
}

/** Nombres oficiales largos que la gente no usa: «León de los Aldama» → «León». */
const CORTOS: Record<string, string> = { 'león de los aldama': 'León', 'santiago de querétaro': 'Querétaro', 'heroica puebla de zaragoza': 'Puebla' }

function decodificar(v: string | null): string {
  if (!v) return ''
  try {
    const c = decodeURIComponent(v).trim().slice(0, 60)
    return CORTOS[c.toLowerCase()] ?? c
  } catch { return '' }
}

export async function GET(req: Request) {
  const h = req.headers
  const pais = (h.get('x-vercel-ip-country') ?? '').toUpperCase()
  const ciudadIp = decodificar(h.get('x-vercel-ip-city'))
  const regionIp = (h.get('x-vercel-ip-country-region') ?? '').toUpperCase()
  const latIp = Number(h.get('x-vercel-ip-latitude')), lonIp = Number(h.get('x-vercel-ip-longitude'))
  const hayIp = ciudadIp !== '' && Number.isFinite(latIp) && Number.isFinite(lonIp) && Math.abs(latIp) <= 90 && Math.abs(lonIp) <= 180

  const sitio = hayIp
    ? { ciudad: ciudadIp, region: pais === 'MX' ? (ESTADOS[regionIp] ?? '') : pais, lat: latIp, lon: lonIp, porIp: true }
    : { ...LEON, porIp: false }

  // Coordenadas redondeadas (≈ 11 km): suficiente para el clima y nada preciso de la persona.
  const lat = sitio.lat.toFixed(1), lon = sitio.lon.toFixed(1)
  let clima: { temp: number; icono: string; desc: string } | null = null
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`, { next: { revalidate: 900 }, signal: AbortSignal.timeout(4000) })
    if (r.ok) {
      const d = await r.json() as { current_weather?: { temperature?: number; weathercode?: number } }
      const t = d.current_weather?.temperature
      if (typeof t === 'number' && Number.isFinite(t)) {
        const { icono, desc } = describir(d.current_weather?.weathercode ?? 0)
        clima = { temp: Math.round(t), icono, desc }
      }
    }
  } catch { /* sin clima: se muestra solo la ciudad */ }

  return NextResponse.json(
    { ciudad: sitio.ciudad, region: sitio.region, porIp: sitio.porIp, clima },
    { headers: { 'Cache-Control': 'private, max-age=600' } },
  )
}
