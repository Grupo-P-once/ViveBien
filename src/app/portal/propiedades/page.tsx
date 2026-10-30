import { notFound, redirect } from 'next/navigation'
import GuardadasPortal from '@/components/portal/GuardadasPortal'

/**
 * «Propiedades» del portal: lo que guardó. «Me interesan» se juntó con «Mis consultas» (24-oct-2026): el enlace viejo sigue funcionando y lleva ahí.
 * Cualquier otra vista responde 404: es la verdad, mejor que una pantalla que promete algo que no hay.
 *
 * «Por revisar» no está ni estará mientras nadie guarde qué fichas vio cada persona (D-27.1).
 */
export default async function PropiedadesDelPortal({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>
}) {
  const { vista } = await searchParams
  if (vista === 'me-interesan') redirect('/portal/consultas')
  if (vista && vista !== 'guardadas') notFound()
  return <GuardadasPortal />
}
