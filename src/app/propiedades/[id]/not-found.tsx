import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { enlaceWhatsApp } from '@/lib/config/negocio'

/**
 * La ficha de una propiedad que ya no está (vendida, rentada, retirada o que nunca existió). Humor a propósito: quien llega por un enlace viejo del historial no debe sentir que rompió algo.
 * Las propiedades vendidas o rentadas que siguen visibles NO pasan por aquí; esto es solo el 404 de verdad.
 */
export default function PropiedadNoEncontrada() {
  return (
    <>
      <Header />
      <main style={{ background: 'var(--hueso)', minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.25rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '540px' }}>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(5rem,15vw,9rem)', color: 'var(--azul)', lineHeight: 1, letterSpacing: '-4px' }}>404</div>
          <div style={{ width: '60px', height: '4px', background: 'var(--rojo-marca)', borderRadius: '4px', margin: '.5rem auto 1.5rem' }} />
          <h1 data-propiedad-404 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: 'var(--texto)', fontSize: '1.55rem', marginBottom: '1rem' }}>
            ¡Llegaste tarde! Esta casa ya no está en el mercado
          </h1>
          <p style={{ color: '#4b5563', fontSize: '1rem', lineHeight: 1.7, marginBottom: '2rem' }}>
            Error 404: la propiedad que buscas ya se vendió, se rentó o se fue de vacaciones.<br />
            Pero no te vayas con las manos vacías: tenemos más esperándote.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/propiedades" style={{ background: 'var(--rojo-marca)', color: '#fff', padding: '.85rem 1.8rem', borderRadius: '12px', fontWeight: 800, textDecoration: 'none', fontFamily: 'Montserrat, sans-serif' }}>
              Ver propiedades disponibles
            </Link>
            <Link href="/portal/consultas" style={{ background: '#fff', color: 'var(--azul)', padding: '.85rem 1.8rem', borderRadius: '12px', fontWeight: 700, textDecoration: 'none', fontFamily: 'Montserrat, sans-serif', border: '1.5px solid var(--azul)' }}>
              Volver a mi historial
            </Link>
          </div>
          <p style={{ marginTop: '2rem', fontSize: '.9rem', color: '#4b5563' }}>
            ¿Querías justo esa? <a href={enlaceWhatsApp('Hola, quería ver una propiedad que ya no está disponible. ¿Tienen algo parecido?')} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--azul)', fontWeight: 700 }}>Escríbenos por WhatsApp</a> y buscamos algo parecido.
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
