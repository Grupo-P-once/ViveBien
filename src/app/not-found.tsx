import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function NotFound() {
  return (
    <>
      <Header />
      <main style={{ background: '#F4F6F8', minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '520px' }}>
          {/* Número grande */}
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(5rem,15vw,9rem)', color: '#1B365D', lineHeight: 1, marginBottom: '.5rem', letterSpacing: '-4px' }}>
            404
          </div>
          <div style={{ width: '60px', height: '4px', background: '#8B1A1A', borderRadius: '4px', margin: '0 auto 1.5rem' }} />
          <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: '#222831', fontSize: '1.5rem', marginBottom: '1rem' }}>
            Página no encontrada
          </h1>
          <p style={{ color: '#666', fontSize: '1rem', lineHeight: 1.7, marginBottom: '2.5rem' }}>
            La página que buscas no existe o fue movida.<br />
            Pero tenemos muchas propiedades esperándote.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/propiedades"
              style={{ background: 'linear-gradient(135deg,#8B1A1A,#C0392B)', color: '#fff', padding: '.85rem 1.8rem', borderRadius: '12px', fontWeight: 800, textDecoration: 'none', fontFamily: 'Montserrat, sans-serif', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <i className="fa fa-home" /> Ver propiedades
            </Link>
            <Link href="/"
              style={{ background: '#fff', color: '#1B365D', padding: '.85rem 1.8rem', borderRadius: '12px', fontWeight: 700, textDecoration: 'none', fontFamily: 'Montserrat, sans-serif', border: '2px solid #1B365D', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <i className="fa fa-arrow-left" /> Ir al inicio
            </Link>
          </div>
          <div style={{ marginTop: '3rem', padding: '1.5rem', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,.06)' }}>
            <p style={{ fontSize: '.85rem', color: '#888', marginBottom: '.8rem' }}>¿Necesitas ayuda? Contáctanos directamente:</p>
            <a href={`https://wa.me/${process.env.NEXT_PUBLIC_WA_NUMBER || '524778116501'}?text=${encodeURIComponent('Hola, necesito ayuda en el sitio de Vive Bien.')}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', background: '#25D366', color: '#fff', padding: '.65rem 1.3rem', borderRadius: '8px', fontWeight: 700, textDecoration: 'none', fontSize: '.9rem' }}>
              <i className="fab fa-whatsapp" /> WhatsApp
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
