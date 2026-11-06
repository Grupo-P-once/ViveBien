import { redirect } from 'next/navigation'

/**
 * Ruta vieja de «Mis visitas». Se conserva solo para no dejar enlaces rotos (correos y marcadores anteriores):
 * manda a «Mis citas» conservando `?cita=` cuando es un identificador válido.
 */
export default async function VisitasVieja({ searchParams }: { searchParams: Promise<{ cita?: string }> }) {
  const { cita } = await searchParams
  if (cita && /^[0-9a-f-]{36}$/i.test(cita)) redirect(`/portal/citas?cita=${cita}`)
  redirect('/portal/citas')
}
