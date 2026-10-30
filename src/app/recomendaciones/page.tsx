import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { paginaSeo } from '@/lib/seo'
import { entornoCorreo, SECRETO_MINIMO } from '@/lib/correo/config'
import { valoresInicialesDeUrl } from '@/lib/correo/recomendaciones'
import FormularioRecomendaciones from '@/components/correo/FormularioRecomendaciones'

export const metadata: Metadata = paginaSeo({
  ruta: '/recomendaciones',
  titulo: 'Recibe propiedades por correo | Vive Bien',
  descripcion: 'Cuéntanos qué buscas y te enviamos, como máximo cada tres días, propiedades publicadas en VIVE BIEN que se ajusten. Sin crear cuenta y con baja en un clic.',
})
export const dynamic = 'force-dynamic'

/** D-80. Hasta que se active `CORREO_MARKETING` la página no existe (404): desplegar este código no abre nada nuevo. */
export default async function RecomendacionesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const env = entornoCorreo()
  if (!env.marketing || env.secreto.length < SECRETO_MINIMO) notFound()
  // Valores iniciales desde un enlace (ficha, catálogo): pasan por el mismo filtro que las preferencias guardadas.
  const q = await searchParams
  const inicial = valoresInicialesDeUrl(q)
  return (
    <>
      <Header />
      <section style={{ background: 'linear-gradient(135deg,var(--azul) 0%,#0d1e2c 100%)', padding: '3rem 2rem', textAlign: 'center', color: '#fff' }}>
        <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.6rem,3vw,2.4rem)', marginBottom: '.6rem' }}>Recibe propiedades por correo</h1>
        <p style={{ opacity: 0.8, fontSize: '.98rem', maxWidth: 560, margin: '0 auto' }}>Cuéntanos qué buscas y te mandamos al momento las primeras propiedades. Sin crear cuenta ni contraseñas.</p>
      </section>
      <main style={{ background: '#fff', padding: '2.5rem 1.25rem 3.5rem' }}>
        <div style={{ maxWidth: 620, margin: '0 auto' }}>
          <FormularioRecomendaciones inicial={inicial} />
        </div>
      </main>
      <Footer />
    </>
  )
}
