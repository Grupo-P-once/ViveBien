import { CORREO_CONTACTO } from '@/lib/contacto'
import type { Metadata } from 'next'
import { paginaSeo } from '@/lib/seo'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { NEGOCIO } from '@/lib/config/negocio'

export const metadata: Metadata = paginaSeo({
  ruta: '/terminos',
  titulo: 'Términos y Condiciones | Vive Bien',
  descripcion: 'Términos y condiciones de uso de la plataforma de Vive Bien Grupo Inmobiliario en León, Guanajuato.',
})

export default function TerminosPage() {
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: 'var(--azul)', fontSize: '1.15rem', marginBottom: '1rem', borderBottom: '2px solid var(--superficie)', paddingBottom: '.5rem' }}>
        {title}
      </h2>
      <div style={{ color: '#555', lineHeight: 1.8, fontSize: '.95rem' }}>{children}</div>
    </div>
  )

  return (
    <>
      <Header />

      <section style={{ background: 'linear-gradient(135deg,var(--azul) 0%,#0d1e2c 100%)', padding: '3rem 2rem', textAlign: 'center', color: '#fff' }}>
        <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.6rem,3vw,2.4rem)', marginBottom: '.6rem' }}>
          Términos y Condiciones
        </h1>
        <p style={{ opacity: .75, fontSize: '.95rem' }}>Última actualización: 22 de octubre de 2026</p>
      </section>

      <main style={{ background: '#fff', padding: '3rem 2rem' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>

          <div style={{ color: '#555', lineHeight: 1.8, fontSize: '.95rem', marginBottom: '2.5rem' }}>
            <p style={{ marginBottom: '1rem' }}><strong>Entrada en vigor:</strong> a partir de su publicación en vivebienn.com.</p>
            <p style={{ marginBottom: '1rem' }}>Estos Términos regulan el acceso y uso de vivebienn.com y de las funciones disponibles en la plataforma. Al navegar, crear una cuenta o usar una función, usted acepta los términos que correspondan a ese uso. Si no está de acuerdo, no utilice la plataforma.</p>
          </div>

          <Section title="1. Quién presta el servicio">
            <p style={{ marginBottom: '1rem' }}>El sitio es operado por <strong>VIVE BIEN GRUPO INMOBILIARIO Y CONSTRUCTOR, S.A. de C.V.</strong>, que utiliza el nombre comercial <strong>VIVE BIEN</strong> (en adelante, “VIVE BIEN”), con domicilio fiscal registrado en <strong>Blvd. J. A. Torres 2319, colonia Panorama, C.P. 37160, León, Guanajuato, México</strong>.</p>
          </Section>

          <Section title="2. Qué ofrece la plataforma">
            <p style={{ marginBottom: '1rem' }}>VIVE BIEN permite consultar propiedades en venta o renta, revisar información y fotografías, guardar propiedades o búsquedas cuando la función esté disponible, solicitar información o una visita, y utilizar herramientas informativas como el valuador.</p>
            <p style={{ marginBottom: '1rem' }}>La disponibilidad de funciones puede cambiar. La plataforma puede incluir casas, departamentos, terrenos, oficinas, locales comerciales, naves industriales, bodegas y otros inmuebles que VIVE BIEN decida incorporar.</p>
            <p style={{ marginBottom: '1rem' }}>VIVE BIEN facilita información y contacto inmobiliario. La participación de VIVE BIEN en una operación concreta dependerá del servicio acordado para esa propiedad. La plataforma por sí sola no crea un contrato de compraventa, arrendamiento, representación o intermediación entre el usuario y VIVE BIEN o el anunciante.</p>
          </Section>

          <Section title="3. Cuentas y uso responsable">
            <p style={{ marginBottom: '1rem' }}>Cuando una función requiera cuenta, el usuario debe proporcionar información veraz y mantenerla actualizada. Es responsable de proteger sus medios de acceso y de avisar a VIVE BIEN si sospecha que alguien utilizó su cuenta sin autorización.</p>
            <p style={{ marginBottom: '1rem' }}>No se permite:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '.5rem', marginBottom: '1rem' }}>
              <li>usar el sitio para actividades ilegales, engañosas, fraudulentas o que afecten a otras personas;</li>
              <li>intentar acceder a cuentas, datos o áreas restringidas;</li>
              <li>interferir con la seguridad o disponibilidad del sitio;</li>
              <li>enviar spam, información falsa o contenido que infrinja derechos de terceros;</li>
              <li>copiar o reutilizar contenido del sitio fuera de los usos permitidos por la ley o por una autorización escrita.</li>
            </ul>
          </Section>

          <Section title="4. Propiedades y anuncios">
            <p style={{ marginBottom: '1rem' }}>La información de cada inmueble —incluidos precio, medidas, características, ubicación, disponibilidad y fotografías— puede ser proporcionada por VIVE BIEN o por quien anuncia la propiedad. Puede cambiar y debe verificarse antes de tomar una decisión, hacer un pago o firmar un documento.</p>
            <p style={{ marginBottom: '1rem' }}>Quien publica un anuncio debe tener autorización para ofrecer el inmueble y para utilizar las fotografías, planos, textos y demás materiales que aporte. También debe procurar que la información sea veraz, vigente y no engañosa. VIVE BIEN puede pedir aclaraciones, rechazar, corregir por motivos de formato, pausar o retirar un anuncio cuando haya datos incompletos, una queja fundada, indicios de fraude, infracción de derechos o incumplimiento de estos términos.</p>
            <p style={{ marginBottom: '1rem' }}>Las propiedades enviadas por un <strong>Publicador</strong> pueden requerir revisión de VIVE BIEN antes de publicarse. Una revisión editorial no constituye una certificación de propiedad, titularidad, estado físico, situación registral, precio o legalidad del inmueble.</p>
            <p style={{ marginBottom: '1rem' }}>El programa de <strong>Asociado sin compartir comisión</strong> está desactivado y no está disponible actualmente. La mención “Próximamente” no constituye una invitación abierta, aprobación, promesa de ingreso ni acuerdo de comisiones. Si el programa se habilita, sus requisitos y condiciones se comunicarán por separado antes del registro.</p>
          </Section>

          <Section title="5. Solicitudes de información y contacto con anunciantes">
            <p style={{ marginBottom: '1rem' }}>Al enviar una solicitud sobre una propiedad y aceptar el aviso de privacidad y la autorización de transferencia que se muestran en el formulario, usted autoriza a VIVE BIEN a recibir sus datos y a compartir manualmente con el anunciante de esa propiedad los datos necesarios para atender la solicitud, como nombre, teléfono, correo, inmueble de interés y mensaje relacionado.</p>
            <p style={{ marginBottom: '1rem' }}>VIVE BIEN recibe primero la solicitud. El equipo canaliza la información al anunciante correspondiente; la plataforma no otorga al anunciante acceso general a la cuenta, búsquedas u otras consultas del usuario. El anunciante debe utilizar los datos únicamente para responder a la solicitud y respetar las obligaciones de protección de datos aplicables.</p>
            <p style={{ marginBottom: '1rem' }}>El tratamiento de datos se explica con más detalle en el <a href="/privacidad" style={{ color: 'var(--azul)', textDecoration: 'underline' }}>Aviso de Privacidad</a>. La autorización para compartir datos no equivale a aceptar promociones de propiedades distintas.</p>
          </Section>

          <Section title="6. Valuador y contenido informativo">
            <p style={{ marginBottom: '1rem' }}>El valuador ofrece una estimación orientativa con base en la información capturada y los datos disponibles. No es un avalúo comercial, fiscal, bancario ni pericial; no sustituye la revisión de un profesional ni garantiza el precio de venta o renta.</p>
            <p style={{ marginBottom: '1rem' }}>Los artículos y guías del sitio son información general y no constituyen asesoría legal, fiscal, financiera, arquitectónica ni de inversión. Antes de tomar una decisión, consulte a la persona profesional que corresponda.</p>
          </Section>

          <Section title="7. Contenido aportado por anunciantes">
            <p style={{ marginBottom: '1rem' }}>El anunciante conserva sus derechos sobre los materiales que aporta y declara tener autorización para publicarlos. Al enviar un anuncio, concede a VIVE BIEN una autorización limitada, no exclusiva y sin transferencia de titularidad para alojar, adaptar únicamente al formato requerido y mostrar esos materiales en la plataforma mientras el anuncio se encuentre activo, además de conservar los respaldos técnicos necesarios durante el plazo aplicable.</p>
            <p style={{ marginBottom: '1rem' }}>VIVE BIEN puede retirar el material cuando el anuncio deje de estar activo, exista una solicitud válida de retiro o sea necesario atender una queja o una obligación legal. Esta autorización no permite utilizar los materiales para fines ajenos a la publicación del anuncio sin permiso adicional.</p>
          </Section>

          <Section title="8. Precios, pagos y comisiones">
            <p style={{ marginBottom: '1rem' }}>Estos Términos no establecen una comisión, cuota o contraprestación para una operación específica. Si un servicio de VIVE BIEN tiene precio, comisión u otra condición comercial, se informará por separado y deberá acordarse antes de contratarlo. Ninguna mención de una función futura reemplaza ese acuerdo.</p>
            <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, color: 'var(--azul)', fontSize: '1rem', margin: '1.25rem 0 .5rem' }}>Servicios inmobiliarios y contratos de contratación</h3>
            <p style={{ marginBottom: '1rem' }}>Estos Términos regulan el uso de la plataforma y no sustituyen un contrato específico para servicios inmobiliarios, asesoría, intermediación, comercialización de una vivienda, publicación pagada u otro servicio contratado. Antes de iniciar un servicio específico, VIVE BIEN deberá informar su alcance, precio o comisión, duración, exclusividad —si se pacta—, cancelación y canales de reclamación, y obtener el acuerdo correspondiente. Ninguna función, etiqueta o texto del sitio crea por sí solo una comisión, mandato o exclusividad.</p>
            <p style={{ marginBottom: '1rem' }}>Cuando por la actividad y el inmueble resulte aplicable la NOM-247-SE-2021 y la legislación de protección al consumidor, el contrato de adhesión correspondiente debe cumplir los requisitos y contar con el registro previo ante PROFECO que legalmente proceda. Estos Términos de uso no sustituyen ese contrato registrado ni autorizan a utilizar un modelo de contrato no revisado.</p>
          </Section>

          <Section title="9. Propiedad intelectual de VIVE BIEN">
            <p style={{ marginBottom: '1rem' }}>Los nombres, marcas, diseño, textos, fotografías y demás materiales propios de VIVE BIEN están protegidos por la legislación aplicable. No se permite reproducirlos o explotarlos comercialmente sin autorización, salvo los usos permitidos por la ley.</p>
            <p style={{ marginBottom: '1rem' }}>Los materiales de terceros se identifican o se tratan conforme a los derechos y licencias que correspondan; no se afirma que todo el contenido publicado pertenezca a VIVE BIEN.</p>
          </Section>

          <Section title="10. Enlaces y servicios de terceros">
            <p style={{ marginBottom: '1rem' }}>El sitio puede enlazar o conectarse con servicios de terceros. Esos servicios tienen sus propios términos y avisos de privacidad. VIVE BIEN no controla sus contenidos, disponibilidad ni políticas.</p>
          </Section>

          <Section title="11. Disponibilidad y responsabilidad">
            <p style={{ marginBottom: '1rem' }}>VIVE BIEN procura mantener disponible la plataforma, pero no garantiza que el acceso sea ininterrumpido o libre de errores. Puede realizar mantenimiento, corregir fallos o retirar funciones.</p>
            <p style={{ marginBottom: '1rem' }}>La información de terceros no sustituye la verificación directa del inmueble y de la documentación correspondiente. Nada en estos Términos excluye derechos irrenunciables de las personas consumidoras ni libera a VIVE BIEN de obligaciones que la ley le imponga. Las limitaciones aplican únicamente en la medida permitida por la legislación vigente.</p>
          </Section>

          <Section title="12. Suspensión y retiro">
            <p style={{ marginBottom: '1rem' }}>VIVE BIEN puede restringir temporalmente una cuenta, anuncio o función si detecta un riesgo de seguridad, actividad posiblemente ilegal o fraudulenta, información engañosa, una infracción de derechos o incumplimiento de estos Términos. Cuando sea razonable y legalmente posible, comunicará el motivo y el canal para solicitar una revisión.</p>
          </Section>

          <Section title="13. Privacidad">
            <p style={{ marginBottom: '1rem' }}>El tratamiento de datos personales se rige por el <a href="/privacidad" style={{ color: 'var(--azul)', textDecoration: 'underline' }}>Aviso de Privacidad</a>. Al enviar formularios, revise el aviso y las autorizaciones aplicables antes de continuar.</p>
          </Section>

          <Section title="14. Cambios a estos Términos">
            <p style={{ marginBottom: '1rem' }}>VIVE BIEN publicará la fecha de actualización y comunicará los cambios relevantes mediante un aviso visible en la plataforma o, cuando corresponda, por correo. Los cambios regirán desde la fecha indicada. Si un cambio requiere un consentimiento adicional, se solicitará antes de realizar el tratamiento correspondiente.</p>
          </Section>

          <Section title="15. Legislación y contacto">
            <p style={{ marginBottom: '1rem' }}>Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Las controversias se atenderán ante las autoridades competentes conforme a la legislación aplicable, respetando los derechos y fueros que correspondan a las personas consumidoras.</p>
            <p style={{ marginBottom: '1rem' }}>Para dudas sobre estos Términos:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '.5rem', marginBottom: '1rem' }}>
              <li><strong>Correo:</strong> {CORREO_CONTACTO}</li>
              <li><strong>WhatsApp:</strong> {NEGOCIO.telefonoInternacional}</li>
              <li><strong>Domicilio fiscal registrado:</strong> Blvd. J. A. Torres 2319, colonia Panorama, C.P. 37160, León, Guanajuato, México.</li>
            </ul>
          </Section>
        </div>
      </main>

      <Footer />
    </>
  )
}
