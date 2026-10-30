import ValuadorPage from '@/app/valuador/page-client'

// El mismo valuador de la página pública, pero con la barra del portal: sin su cabecera ni su pie de sitio.
export default function Pagina() {
  return <ValuadorPage enPortal />
}
