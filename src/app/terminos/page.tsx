import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Términos y Condiciones – Vive Bien Inmobiliaria',
  description: 'Términos y condiciones de uso de la plataforma Vive Bien Inmobiliaria en León, Guanajuato.',
}

export default function TerminosPage() {
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: '#1B365D', fontSize: '1.15rem', marginBottom: '1rem', borderBottom: '2px solid #F4F6F8', paddingBottom: '.5rem' }}>
        {title}
      </h2>
      <div style={{ color: '#555', lineHeight: 1.8, fontSize: '.95rem' }}>{children}</div>
    </div>
  )

  return (
    <>
      <Header />

      <section style={{ background: 'linear-gradient(135deg,#1B365D 0%,#0d1e2c 100%)', padding: '3rem 2rem', textAlign: 'center', color: '#fff' }}>
        <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.6rem,3vw,2.4rem)', marginBottom: '.6rem' }}>
          Términos y Condiciones
        </h1>
        <p style={{ opacity: .75, fontSize: '.95rem' }}>Última actualización: 6 de abril de 2026</p>
      </section>

      <main style={{ background: '#fff', padding: '3rem 2rem' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>

          <Section title="1. Aceptación de los términos">
            <p>Al acceder y utilizar la plataforma Vive Bien Inmobiliaria (<strong>vive-bien.vercel.app</strong>), usted acepta cumplir y quedar vinculado por estos Términos y Condiciones. Si no está de acuerdo con alguno de estos términos, le pedimos que no utilice nuestros servicios.</p>
          </Section>

          <Section title="2. Descripción del servicio">
            <p>Vive Bien Inmobiliaria es una plataforma digital que facilita la búsqueda, consulta y contacto de propiedades inmobiliarias (naves industriales, casas, terrenos y locales comerciales) ubicadas en León, Guanajuato, México. Pertenece a <strong>Grupo P-ONCE</strong>.</p>
          </Section>

          <Section title="3. Uso del sitio">
            <p>El usuario se compromete a:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '.5rem' }}>
              <li>Proporcionar información veraz al completar formularios de contacto.</li>
              <li>No utilizar la plataforma para fines fraudulentos o ilegales.</li>
              <li>No reproducir, distribuir o modificar el contenido del sitio sin autorización escrita.</li>
              <li>No intentar acceder a áreas restringidas de la plataforma.</li>
            </ul>
          </Section>

          <Section title="4. Información de propiedades">
            <p>La información presentada sobre las propiedades (precios, dimensiones, disponibilidad) es referencial y puede cambiar sin previo aviso. Vive Bien no garantiza la exactitud absoluta de los datos y recomienda verificar la información directamente con un asesor antes de tomar decisiones de inversión.</p>
          </Section>

          <Section title="5. Captación de datos (leads)">
            <p>Al completar formularios de contacto o registro en la plataforma, el usuario autoriza a Vive Bien Inmobiliaria a:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '.5rem' }}>
              <li>Contactarlo por teléfono, WhatsApp o correo electrónico para brindar información sobre propiedades.</li>
              <li>Almacenar sus datos de contacto en nuestros sistemas internos.</li>
              <li>Enviar comunicaciones relacionadas con propiedades que puedan ser de su interés.</li>
            </ul>
            <p style={{ marginTop: '.8rem' }}>El usuario puede solicitar la eliminación de sus datos en cualquier momento enviando un correo a <strong>contacto@vivebieninmobiliaria.com</strong>.</p>
          </Section>

          <Section title="6. Propiedad intelectual">
            <p>Todos los contenidos del sitio (logotipos, fotografías, textos, diseños) son propiedad de Vive Bien / Grupo P-ONCE y están protegidos por las leyes de propiedad intelectual vigentes en México. Queda prohibida su reproducción sin autorización expresa.</p>
          </Section>

          <Section title="7. Limitación de responsabilidad">
            <p>Vive Bien no será responsable por daños directos, indirectos o consecuentes derivados del uso de la plataforma, incluyendo decisiones de inversión basadas en la información aquí publicada.</p>
          </Section>

          <Section title="8. Modificaciones">
            <p>Nos reservamos el derecho de modificar estos términos en cualquier momento. El uso continuado de la plataforma tras los cambios implica la aceptación de los nuevos términos.</p>
          </Section>

          <Section title="9. Ley aplicable">
            <p>Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia será sometida a los tribunales competentes de la ciudad de León, Guanajuato.</p>
          </Section>

          <Section title="10. Contacto">
            <p>Para dudas sobre estos términos: <strong>contacto@vivebieninmobiliaria.com</strong> | WhatsApp: +52 477 811 6501</p>
          </Section>
        </div>
      </main>

      <Footer />
    </>
  )
}
