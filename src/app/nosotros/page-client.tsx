'use client'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { HeroNosotros, HistoriaNosotros, ValoresNosotros, PorQueNosotros, FamiliaNosotros, CierreNosotros, useRevelarNosotros } from '@/components/nosotros/SeccionesNosotros'
import '@/components/nosotros/nosotros.css'

/**
 * «Nosotros»: seis secciones con un mismo patrón visual, según las láminas de diseño del propietario (carpeta `pg web/nosotros`):
 * hero con cifras → historia e hitos → valores → por qué nosotros y cobertura → Grupo P-ONCE → cierre. Los textos y cifras son los que ya
 * tenía la página (más lo que traen las láminas); el equipo con fotos de GitHub se retiró del diseño original y no se reincorpora.
 */
export default function NosotrosPage() {
  useRevelarNosotros()
  return (
    <>
      <Header />
      <main className="nos" id="contenido">
        <HeroNosotros />
        <HistoriaNosotros />
        <ValoresNosotros />
        <PorQueNosotros />
        <FamiliaNosotros />
        <CierreNosotros />
      </main>
      <Footer />
    </>
  )
}
