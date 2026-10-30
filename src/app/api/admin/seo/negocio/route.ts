import { NextResponse } from 'next/server'
import { exigir } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { NEGOCIO, HORARIO_TEXTO } from '@/lib/config/negocio'
import { extraerHechos } from '@/lib/seo/html'
import { compararNegocio } from '@/lib/seo/negocio'
import { resolverOrigen } from '@/lib/seo/origen'
import { AGENTE } from '@/lib/seo/rastreador'
import { SITIO } from '@/lib/sitio'

/**
 * Datos del negocio (NAP) tal como los sirve el sitio vs. lo que declara el código (panel SEO, solo Super Admin). Solo lectura: pide `/` y `/contacto`.
 * Devuelve además lo OBSERVADO en la ficha pública de Google Maps el 22-oct-2026 (anotado a mano por Claude; no se consulta Google desde el servidor).
 */
export const dynamic = 'force-dynamic'

/** Lo observado en la ficha pública «VIVE BIEN GRUPO INMOBILIARIO» de Google Maps. No se actualiza solo: hay que volver a mirarla. */
const OBSERVADO_EN_GOOGLE_MAPS = {
  fecha: '2026-10-23',
  nombre: 'VIVE BIEN GRUPO INMOBILIARIO',
  categoria: 'Agencia inmobiliaria',
  direccion: `${NEGOCIO.cp}, ${NEGOCIO.colonia}, ${NEGOCIO.cp} León de los Aldama, Gto.`, // tal cual la muestra Google: sin calle ni número
  telefono: NEGOCIO.telefonoVisible,
  sitio: 'vivebienn.com',
  horario: 'Lun, mar, jue y vie 9:00–17:30 · sáb y dom cerrado · miércoles «Abierto las 24 horas» (probable error de la ficha)',
  codigoPlus: '573C+6J León de los Aldama, Guanajuato',
  coordenadas: { lat: 21.1530178, lng: -101.7283955 },
} as const

export async function GET(req: Request) {
  const auth = await exigir(req, 'seo.ver')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`seo-lectura:${auth.perfil?.uid ?? 'anon'}`, TOPES.seoLectura)
  if (frenado) return frenado

  const o = resolverOrigen(req, new URL(req.url).searchParams.get('origen'), SITIO)
  if ('error' in o) return NextResponse.json({ error: o.error }, { status: 400 })
  try {
    const pedir = async (ruta: string) => (await fetch(o.origen + ruta, { headers: { 'user-agent': `${AGENTE}/1.0` }, redirect: 'manual', signal: AbortSignal.timeout(15_000) })).text()
    const [inicio, contacto] = await Promise.all([pedir('/'), pedir('/contacto')])
    const hInicio = extraerHechos(inicio), hContacto = extraerHechos(contacto)
    const texto = [inicio, contacto].map((h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).join(' ')
    const comprobaciones = compararNegocio(NEGOCIO, [...hInicio.jsonld, ...hContacto.jsonld], texto)
    return NextResponse.json({
      origen: o.origen, cual: o.cual, generado: new Date().toISOString(),
      negocio: { nombre: NEGOCIO.nombre, telefono: NEGOCIO.telefonoVisible, direccion: `${NEGOCIO.calle}, ${NEGOCIO.colonia}, ${NEGOCIO.ciudad}, ${NEGOCIO.estadoCorto} ${NEGOCIO.cp}`, horario: HORARIO_TEXTO, coordenadas: { lat: NEGOCIO.lat, lng: NEGOCIO.lng } },
      comprobaciones, observadoGoogleMaps: OBSERVADO_EN_GOOGLE_MAPS,
      avisoDireccion: `Decisión del propietario (23-oct-2026): la dirección oficial es la del sitio (${NEGOCIO.calle}) y el horario oficial es el de Google Maps. La ficha la administra la cuenta Super Admin; falta agregarle la calle y el número, y corregir el miércoles (24 horas).`,
    })
  } catch (e) {
    console.error('seo/negocio', e)
    return NextResponse.json({ error: 'No se pudo leer el sitio.' }, { status: 502 })
  }
}
