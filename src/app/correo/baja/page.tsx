import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AccionConEnlace from '@/components/correo/AccionConEnlace'

export const metadata: Metadata = { title: 'Darte de baja | Vive Bien', robots: { index: false, follow: false } }

/** La baja funciona SIEMPRE, aunque el marketing esté apagado: por eso esta página no depende de ninguna bandera. */
export default function Pagina() {
  return (
    <>
      <Header />
      <main style={{ background: '#fff', padding: '3.5rem 1.25rem 4rem' }}>
        <AccionConEnlace modo="baja" />
      </main>
      <Footer />
    </>
  )
}
