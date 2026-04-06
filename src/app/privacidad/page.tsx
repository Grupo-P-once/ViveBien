import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Política de Privacidad – Vive Bien Inmobiliaria',
  description: 'Política de privacidad y tratamiento de datos personales de Vive Bien Inmobiliaria, León, Guanajuato.',
}

export default function PrivacidadPage() {
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

      <section style={{ background: 'linear-gradient(135deg,#8B1A1A 0%,#5a0f0f 100%)', padding: '3rem 2rem', textAlign: 'center', color: '#fff' }}>
        <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.6rem,3vw,2.4rem)', marginBottom: '.6rem' }}>
          Política de Privacidad
        </h1>
        <p style={{ opacity: .75, fontSize: '.95rem' }}>Última actualización: 6 de abril de 2026</p>
      </section>

      <main style={{ background: '#fff', padding: '3rem 2rem' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>

          <Section title="1. Responsable del tratamiento de datos">
            <p><strong>Vive Bien Inmobiliaria / Grupo P-ONCE</strong> con domicilio en León, Guanajuato, México, es el responsable del tratamiento de sus datos personales de acuerdo con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).</p>
          </Section>

          <Section title="2. Datos personales que recopilamos">
            <p>Recopilamos los siguientes datos cuando interactúas con nuestra plataforma:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '.5rem' }}>
              <li><strong>Datos de contacto:</strong> nombre, teléfono, correo electrónico.</li>
              <li><strong>Datos de uso:</strong> propiedades consultadas, búsquedas realizadas.</li>
              <li><strong>Datos de autenticación:</strong> correo y contraseña (encriptados) o cuenta de Google.</li>
            </ul>
          </Section>

          <Section title="3. Finalidad del tratamiento">
            <p>Sus datos son utilizados para:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '.5rem' }}>
              <li>Brindarle asesoría personalizada sobre propiedades de su interés.</li>
              <li>Contactarlo por teléfono, WhatsApp o correo con información inmobiliaria relevante.</li>
              <li>Gestionar su cuenta en la plataforma.</li>
              <li>Mejorar nuestros servicios y experiencia de usuario.</li>
              <li>Enviar comunicaciones de marketing inmobiliario (con posibilidad de cancelar en cualquier momento).</li>
            </ul>
          </Section>

          <Section title="4. Transferencia de datos">
            <p>Sus datos no serán transferidos a terceros sin su consentimiento, salvo en los casos previstos por la LFPDPPP o por orden de autoridad competente. Utilizamos servicios de terceros para el funcionamiento de la plataforma:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '.5rem' }}>
              <li><strong>Firebase (Google):</strong> autenticación de usuarios.</li>
              <li><strong>Supabase:</strong> almacenamiento de datos de propiedades y leads.</li>
              <li><strong>Vercel:</strong> hospedaje de la plataforma.</li>
              <li><strong>Cloudinary:</strong> almacenamiento de imágenes.</li>
            </ul>
          </Section>

          <Section title="5. Derechos ARCO">
            <p>Usted tiene derecho a <strong>Acceder, Rectificar, Cancelar u Oponerse</strong> al tratamiento de sus datos personales (derechos ARCO). Para ejercerlos, envíe una solicitud a:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '.5rem' }}>
              <li>Correo: <strong>contacto@vivebieninmobiliaria.com</strong></li>
              <li>WhatsApp: <strong>+52 477 811 6501</strong></li>
            </ul>
            <p style={{ marginTop: '.8rem' }}>Responderemos en un plazo máximo de 20 días hábiles.</p>
          </Section>

          <Section title="6. Cookies">
            <p>Utilizamos cookies para mejorar la experiencia de navegación y analítica del sitio (Google Analytics). Puede configurar su navegador para rechazar cookies, aunque esto puede afectar la funcionalidad de la plataforma.</p>
          </Section>

          <Section title="7. Seguridad">
            <p>Implementamos medidas técnicas y organizativas para proteger sus datos contra acceso no autorizado, pérdida o alteración. Las contraseñas se almacenan de forma encriptada y las API keys sensibles no están expuestas en el código público.</p>
          </Section>

          <Section title="8. Modificaciones">
            <p>Esta política puede ser actualizada. Le notificaremos cambios significativos a través de la plataforma o por correo electrónico.</p>
          </Section>

          <Section title="9. Contacto">
            <p>Para cualquier consulta sobre esta política de privacidad: <strong>contacto@vivebieninmobiliaria.com</strong></p>
          </Section>
        </div>
      </main>

      <Footer />
    </>
  )
}
