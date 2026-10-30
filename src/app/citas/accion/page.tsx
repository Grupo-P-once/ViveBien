import type { Metadata } from 'next'
import AccionCita from './AccionCita'

/**
 * /citas/accion#<token> — la página de los botones de los correos de visitas.
 *
 * El token va después del `#`: el navegador no lo manda al servidor, así que
 * no queda en registros ni en el encabezado Referer. La página lo lee, enseña
 * la visita y sólo actúa al pulsar el botón. Ver docs/email-flow.md §2.
 */

export const metadata: Metadata = {
  title: 'Tu visita | Vive Bien',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function Pagina() {
  return <AccionCita />
}
