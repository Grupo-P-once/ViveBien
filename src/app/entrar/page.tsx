import type { Metadata } from 'next'
import { Suspense } from 'react'
import { headers } from 'next/headers'
import { medidaInicialDe } from '@/lib/pantalla/plegables'
import Entrar from '@/components/acceso/Entrar'

/**
 * `/entrar` — la única pantalla de acceso (D-29.4, tarea 03.07).
 *
 * Sustituye a las tres que había: la tarjeta de `/dashboard` y las dos mínimas
 * de `/portal` y `/admin`. Un sitio que mantener, un diseño, un flujo de
 * Google.
 *
 * Privada: no se indexa. `?siguiente=` dice a dónde volver, y sólo admite
 * rutas de este sitio (`destinoSeguro`), que si no sería un redirector abierto.
 */

export const metadata: Metadata = {
  title: 'Entrar — Vive Bien',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function PaginaEntrar() {
  // R-08 / QA-008: el primer pintado ya acierta la disposición del dispositivo (ver `medidaInicialDe`): sin saltos al hidratar.
  const h = await headers()
  const medidaInicial = medidaInicialDe(h.get('user-agent'), h.get('sec-ch-ua-mobile'))
  return (
    <Suspense fallback={null}>
      <Entrar medidaInicial={medidaInicial} />
    </Suspense>
  )
}
