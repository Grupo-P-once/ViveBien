import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AccionConEnlace from '@/components/correo/AccionConEnlace'

export const metadata: Metadata = { title: 'Seguir recibiendo propiedades | Vive Bien', robots: { index: false, follow: false } }

export default function Pagina() {
  return (
    <>
      <Header />
      <main style={{ background: '#fff', padding: '3.5rem 1.25rem 4rem' }}>
        <AccionConEnlace modo="confirmar" />
      </main>
      <Footer />
    </>
  )
}
