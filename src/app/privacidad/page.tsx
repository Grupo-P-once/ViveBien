import { CORREO_CONTACTO } from '@/lib/contacto'
import type { Metadata } from 'next'
import { paginaSeo } from '@/lib/seo'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { NEGOCIO } from '@/lib/config/negocio'

export const metadata: Metadata = paginaSeo({
  ruta: '/privacidad',
  titulo: 'Aviso de Privacidad | Vive Bien',
  descripcion: 'Cómo trata Vive Bien Grupo Inmobiliario tus datos personales, conforme a la LFPDPPP. León, Guanajuato.',
})

/*
 * Estado (10-nov-2026): versión 2026-11-10 = APROBADA por el abogado de forma VERBAL (comunicada por el dueño el 10-nov-2026): la confirmación ESCRITA sigue pendiente de guardarse en Obsidian con su huella; mientras tanto no se cambia ni una palabra de este texto. Añade el sistema de citas (datos, finalidades, quién atiende una cita, correos y recordatorios,
 * conservación) sobre la versión 2026-11-03, que SÍ fue APROBADA por el abogado (comunicado por el dueño el 3-nov-2026; el documento escrito del abogado debe guardarse en Obsidian con su hash).
 * Desde el 10-nov-2026 recoge las decisiones del dueño del 9-nov-2026: la persona asociada propietaria ve nombre, teléfono y notas aunque la cita la atienda otra persona (la casilla de la tarjeta lo dice),
 * el equipo ve en el historial quién hizo cada cambio y la cancelación llega al cliente con archivo de calendario. Preguntas para el abogado: «Citas — revisión del Aviso de Privacidad y los Términos tras las seis decisiones (9-nov-2026)» en Obsidian.
 * Memo para el abogado con cada párrafo nuevo y las decisiones que le tocan: «Citas — memo para el abogado (6-nov-2026)» en Obsidian.
 * La fecha visible de abajo, `VERSIONES.privacidad` en src/lib/aceptacion-legal.ts y `VERSION_CONSENTIMIENTO` en src/lib/contacto.ts cambian JUNTAS: una prueba lo vigila. Cualquier cambio posterior de texto exige nueva aprobación y nueva versión.
 * Describe lo que el producto hace en el código; si el código cambia, hay que cambiar este texto. Ver «Resolución del expediente legal» en Obsidian.
 */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: '2.5rem' }}>
    <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: 'var(--azul)', fontSize: '1.15rem', marginBottom: '1rem', borderBottom: '2px solid var(--superficie)', paddingBottom: '.5rem' }}>
      {title}
    </h2>
    <div style={{ color: '#555', lineHeight: 1.8, fontSize: '.95rem' }}>{children}</div>
  </div>
)

export default function PrivacidadPage() {
  return (
    <>
      <Header />

      <section style={{ background: 'linear-gradient(135deg,var(--rojo) 0%,#5a0f0f 100%)', padding: '3rem 2rem', textAlign: 'center', color: '#fff' }}>
        <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 'clamp(1.6rem,3vw,2.4rem)', marginBottom: '.6rem' }}>
          Aviso de Privacidad Integral
        </h1>
        <p style={{ opacity: .75, fontSize: '.95rem' }}>Última actualización: 10 de noviembre de 2026</p>
      </section>

      <main style={{ background: '#fff', padding: '3rem 2rem' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>

          <div style={{ color: '#555', lineHeight: 1.8, fontSize: '.95rem', marginBottom: '2.5rem' }}>
            <p style={{ marginBottom: '1rem' }}><strong>Aplicable a:</strong> vivebienn.com y las funciones digitales de VIVE BIEN.</p>
          </div>

          <Section title="1. Responsable">
            <p style={{ marginBottom: '1rem' }}><strong>VIVE BIEN GRUPO INMOBILIARIO Y CONSTRUCTOR, S.A. de C.V.</strong>, que utiliza el nombre comercial <strong>VIVE BIEN</strong>, es responsable del tratamiento de los datos personales recabados a través de vivebienn.com.</p>
            <p style={{ marginBottom: '1rem' }}><strong>Domicilio fiscal registrado:</strong> Blvd. J. A. Torres 2319, colonia Panorama, C.P. 37160, León, Guanajuato, México.<br /><strong>Correo para privacidad y derechos ARCO:</strong> {CORREO_CONTACTO}<br /><strong>WhatsApp de contacto:</strong> {NEGOCIO.telefonoInternacional}</p>
          </Section>

          <Section title="2. Datos personales que podemos tratar">
            <p style={{ marginBottom: '1rem' }}>Según la función que utilice, podemos tratar:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '.5rem', marginBottom: '1rem' }}>
              <li><strong>Identificación y contacto:</strong> nombre, correo electrónico y teléfono.</li>
              <li><strong>Cuenta y autenticación:</strong> correo, nombre visible e identificadores necesarios para iniciar sesión y mantener su cuenta.</li>
              <li><strong>Solicitudes:</strong> propiedad consultada, tipo de solicitud, mensaje, preferencia de visita y seguimiento de la atención.</li>
              <li><strong>Citas para visitar una propiedad:</strong> nombre y teléfono de quien asistirá a la visita, el correo de su cuenta, las notas que usted escriba, la propiedad, el día y la hora, el estado de la cita (pendiente, confirmada, rechazada, cancelada, con reprogramación solicitada, realizada, no asistió o expirada), el motivo de un rechazo o de una cancelación, el historial de cambios de la cita con el papel de quien los hizo (usted, la persona que atiende la visita, el equipo de VIVE BIEN o el sistema) y la constancia de su autorización (fecha y versión del texto aceptado).</li>
              <li><strong>Preferencias e interacción:</strong> propiedades guardadas, búsquedas, filtros, páginas o fichas consultadas y ajustes de la cuenta.</li>
              <li><strong>Datos de valuación:</strong> características y ubicación aproximada del inmueble que usted introduzca en el valuador.</li>
              <li><strong>Datos de propietarios, representantes y agentes:</strong> cuando una persona publica un inmueble nos indica cómo lo maneja. Si es trato directo, nos da el nombre completo, teléfono y correo del propietario o de su representante autorizado; si es por agente o inmobiliaria, el nombre del agente, la inmobiliaria y, de forma opcional, el folio de acreditación y el municipio. Quien publica declara contar con autorización para aportar esos datos. No se publican en el sitio.</li>
              <li><strong>Datos técnicos:</strong> dirección IP y datos del navegador o dispositivo que intervengan en la seguridad y operación del sitio, así como identificadores técnicos o de sesión.</li>
            </ul>
            <p style={{ marginBottom: '1rem' }}>No solicitamos intencionalmente datos personales sensibles. No incluya datos de salud, financieros, biométricos u otros datos sensibles en mensajes o campos libres.</p>
          </Section>

          <Section title="3. Finalidades">
            <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, color: 'var(--azul)', fontSize: '1rem', margin: '1.25rem 0 .5rem' }}>Finalidades necesarias para atender el servicio</h3>
            <p style={{ marginBottom: '1rem' }}>Utilizamos los datos para crear y administrar cuentas; recibir y responder consultas o solicitudes de visita; dar seguimiento a la propiedad seleccionada; administrar propiedades y anuncios; verificar de quién es el inmueble y la acreditación de agentes o inmobiliarias; atribuir operaciones a VIVE BIEN y calcular el reparto de comisiones; proporcionar el resultado orientativo del valuador; mantener la seguridad y resolver incidencias; y atender solicitudes de derechos ARCO u obligaciones legales.</p>
            <p style={{ marginBottom: '1rem' }}><strong>Correos de servicio y seguridad.</strong> Utilizamos su correo electrónico para enviarle los mensajes necesarios para usar su cuenta o que usted solicitó: bienvenida, confirmación de solicitudes, avisos y recordatorios de citas, alertas de búsquedas guardadas y de baja de precio, y avisos de cambios a los Términos o a este Aviso. Estos correos no son publicidad. Las alertas de búsquedas y los avisos de baja de precio por correo vienen activados por omisión; la persona puede apagarlos en cualquier momento desde los ajustes de su portal y cada correo incluye un enlace para dejar de recibirlos con un clic.</p>
            <p style={{ marginBottom: '1rem' }}><strong>Citas.</strong> Cuando usted agenda una cita utilizamos sus datos para registrar su solicitud; mostrarla a la persona que atiende esa propiedad —el equipo de VIVE BIEN o, si corresponde, la persona asociada responsable— para que la confirme, la rechace o proponga otro horario; evitar que dos citas confirmadas se encimen en el mismo horario; avisarle cada cambio de estado, en la plataforma y por correo; enviarle un recordatorio por correo 24 horas y 1 hora antes de una cita confirmada; ofrecerle un archivo de calendario (.ics) y un enlace para añadirla a su calendario, que contienen el nombre de la propiedad, el lugar y la hora pero no su nombre, teléfono ni correo; registrar si la visita se realizó o si usted no asistió; y atender incidencias. Los correos de citas son de servicio, no son publicidad y no traen botones que cambien la cita: para confirmarla, cambiarla o cancelarla debe iniciar sesión y hacerlo dentro de su panel.</p>
            <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, color: 'var(--azul)', fontSize: '1rem', margin: '1.25rem 0 .5rem' }}>Finalidades que se informan y autorizan por separado</h3>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '.5rem', marginBottom: '1rem' }}>
              <li><strong>Transferencia al anunciante:</strong> hoy VIVE BIEN no entrega al anunciante los datos de una consulta; las consultas las atiende VIVE BIEN (sección 4). Si algún día se ofreciera canalizarla al anunciante, se pedirá antes, por separado, una autorización que identifique al anunciante receptor, sin casilla marcada de antemano y sin combinarla con aceptar este Aviso ni con recibir publicidad.</li>
              <li><strong>Promociones:</strong> solo enviaremos promociones o información sobre otras propiedades si la persona elige recibirlas, con un consentimiento expreso y separado. Hoy no enviamos correos promocionales. Cuando existan, cada correo incluirá un enlace para darse de baja con un clic; la baja deja una supresión (una huella derivada del correo, no el correo mismo) que impide futuros envíos promocionales y no afecta a los correos de servicio necesarios. Si la persona desea volver a recibirlos, deberá solicitarlo y confirmarlo de nuevo. También puede retirar esa elección escribiendo a {CORREO_CONTACTO}.</li>
              <li><strong>Medición y mejora:</strong> Google Analytics solo se activa si la persona lo acepta en el aviso de analítica del sitio, y puede cambiar su elección en cualquier momento (sección 6). Además, el sitio guarda en su propia base eventos de uso sin datos personales (por ejemplo, que se vio una propiedad) para estadísticas y para las métricas de quienes publican.</li>
            </ul>
            <p style={{ marginBottom: '1rem' }}>Negarse a una finalidad secundaria no impide navegar el catálogo ni contactar a VIVE BIEN.</p>
          </Section>

          <Section title="4. Transferencia de datos al anunciante">
            <p style={{ marginBottom: '1rem' }}>Cuando una persona consulte por una propiedad, la solicitud es de VIVE BIEN: la recibe y atiende el equipo de VIVE BIEN, y el anunciante no recibe el nombre, teléfono, correo ni mensaje de quien consulta. VIVE BIEN conserva internamente el dato de qué propiedad generó la consulta para dar seguimiento y atribución.</p>
            <p style={{ marginBottom: '1rem' }}>Si en el futuro VIVE BIEN ofreciera canalizar una consulta al anunciante, antes de enviarla pedirá una autorización expresa y separada de la aceptación de este Aviso y de cualquier opción de publicidad. La casilla no vendrá marcada, el formulario identificará al anunciante receptor y explicará que recibirá los datos únicamente para responder esa solicitud. Si no se acepta, la solicitud no se enviará al anunciante. Mientras esa autorización no exista, el equipo no entregará esos datos al anunciante por ningún medio, salvo una excepción prevista por la legislación aplicable.</p>
            <p style={{ marginBottom: '1rem' }}>Cuando exista esa autorización, VIVE BIEN comunicará al anunciante receptor este Aviso y las finalidades aplicables; el anunciante deberá tratar los datos conforme a ellas y asumir las obligaciones de protección de datos que correspondan, y la transferencia no le dará acceso a la cuenta, búsquedas ni otras consultas de la persona.</p>
            <p style={{ marginBottom: '1rem' }}>La persona podrá retirar su consentimiento para transferencias futuras en {CORREO_CONTACTO}; la revocación no deshará una transferencia ya realizada, pero podrá solicitar a VIVE BIEN y al anunciante que cesen los usos que ya no sean necesarios, sujeto a las obligaciones legales aplicables.</p>
            <p style={{ marginBottom: '1rem' }}><strong>Quien atiende una cita.</strong> Para que una cita pueda confirmarse, quien la atiende debe poder saber quién asistirá. Si la atiende el equipo de VIVE BIEN, ve su nombre, teléfono y notas como parte del servicio. Si la atiende una persona asociada que publica la propiedad, por omisión recibe, para atender y coordinar la visita, su nombre, su teléfono y las notas que usted escribió para la visita, siempre que usted haya marcado la casilla de autorización de la tarjeta «Agenda una cita», que no viene marcada de antemano y es independiente de aceptar este Aviso; no recibe su correo electrónico, ni las notas internas del equipo de VIVE BIEN, salvo un permiso específico que VIVE BIEN le conceda para ver los datos de contacto completos. Una persona publicadora (sin la modalidad de asociada) ve, en solo lectura, las visitas a sus propiedades que coordina VIVE BIEN, solo con su día, hora y estado, y no su nombre, teléfono, correo ni notas. La persona propietaria de un inmueble que no atiende la cita puede ver que existe una cita en su propiedad, con su día, hora y estado. Si es una persona asociada de VIVE BIEN con el permiso de recibir citas, ve además, solo para su consulta y aunque la cita la atienda otra persona, su nombre, su teléfono y las notas que usted escribió para la visita, con la misma autorización de la casilla de la tarjeta «Agenda una cita»; no recibe su correo electrónico ni las notas internas del equipo, salvo ese mismo permiso específico. Si es una persona publicadora sin ese permiso, no ve su nombre, teléfono, correo ni notas.</p>
            <p style={{ marginBottom: '1rem' }}>Fuera de las transferencias descritas en este Aviso, VIVE BIEN no vende datos personales. Solo los comunica cuando exista consentimiento o se actualice una excepción prevista por la legislación aplicable.</p>
          </Section>

          <Section title="5. Proveedores y servicios tecnológicos">
            <p style={{ marginBottom: '1rem' }}>Para operar el sitio podemos utilizar proveedores tecnológicos que tratan datos por cuenta de VIVE BIEN o que reciben solicitudes técnicas del navegador, de acuerdo con la función usada:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '.5rem', marginBottom: '1rem' }}>
              <li><strong>Firebase y Google:</strong> autenticación y acceso mediante cuenta.</li>
              <li><strong>Supabase:</strong> almacenamiento y consulta de cuentas, propiedades, solicitudes y citas.</li>
              <li><strong>Vercel:</strong> alojamiento del sitio y operación técnica.</li>
              <li><strong>Cloudinary:</strong> almacenamiento y entrega de imágenes.</li>
              <li><strong>Resend:</strong> envío de los correos de VIVE BIEN (a su equipo y a las personas usuarias, incluidos los avisos y recordatorios de citas) y recepción de los avisos de entrega, rebote y queja de cada envío.</li>
              <li><strong>WhatsApp/Meta:</strong> aviso interno al equipo de VIVE BIEN cuando alguien envía una consulta (con el nombre y teléfono que la persona escribió) y comunicaciones de atención relacionadas con solicitudes.</li>
              <li><strong>Google Analytics:</strong> medición de uso, solo si la persona la acepta en el aviso de analítica (sección 6).</li>
              <li><strong>Google Maps, OpenStreetMap y servicios de distribución de iconos:</strong> recursos que pueden solicitarse directamente desde el navegador. Las tipografías del sitio se sirven desde el propio sitio, no desde Google.</li>
              <li><strong>Open-Meteo:</strong> consulta del clima mediante coordenadas aproximadas, cuando esa función esté habilitada.</li>
              <li><strong>YouTube:</strong> reproducción de videos incrustados cuando la persona elige reproducirlos.</li>
            </ul>
            <p style={{ marginBottom: '1rem' }}>Algunos servicios pueden recibir datos técnicos como la dirección IP, el navegador o la solicitud de contenido cuando el dispositivo se conecta a ellos. Cada proveedor puede tratar esos datos conforme a sus propios términos y avisos. La relación de proveedores debe mantenerse actualizada si cambia la tecnología del sitio.</p>
          </Section>

          <Section title="6. Ubicación, almacenamiento local y analítica">
            <p style={{ marginBottom: '1rem' }}>Si la portada muestra una ciudad o el clima aproximado, la ubicación puede estimarse a partir de información técnica de la conexión o de coordenadas aproximadas. El sitio puede guardar en el navegador preferencias, sesión o elementos que usted haya decidido guardar. Las herramientas de medición pueden registrar interacciones para analizar el funcionamiento del sitio, cuando estén habilitadas.</p>
            <p style={{ marginBottom: '1rem' }}>Puede borrar o bloquear cookies y almacenamiento local desde la configuración del navegador. Si bloquea tecnologías necesarias para iniciar sesión, proteger la cuenta o recordar una preferencia solicitada, ciertas funciones pueden dejar de trabajar correctamente.</p>
            <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, color: 'var(--azul)', fontSize: '1rem', margin: '1.25rem 0 .5rem' }}>Cookies y tecnologías similares</h3>
            <p style={{ marginBottom: '1rem' }}>VIVE BIEN puede utilizar cookies, almacenamiento local, identificadores de sesión y tecnologías equivalentes para mantener la sesión, proteger el sitio, recordar preferencias solicitadas por la persona y, cuando esté habilitado, medir el uso de la plataforma. Al cargar contenido externo —por ejemplo mapas o videos— el navegador puede comunicarse directamente con el proveedor correspondiente y transmitirle datos técnicos como la dirección IP y el tipo de navegador.</p>
            <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, color: 'var(--azul)', fontSize: '1rem', margin: '1.25rem 0 .5rem' }} id="analitica">Google Analytics y medición propia</h3>
            <p style={{ marginBottom: '1rem' }}>Google Analytics permanece desactivado hasta que usted lo acepte en el aviso que aparece al entrar al sitio, con los botones «Aceptar» y «Rechazar» del mismo peso. Si no lo acepta, no se descarga su código ni se guardan sus cookies (_ga y _ga_*), y el sitio funciona igual. Puede cambiar su elección cuando quiera con «Preferencias de analítica» en el pie de página; si rechaza, se borran las cookies de Google Analytics que ya existieran. Las áreas con sesión (panel, cuenta y portal) no se miden. A Google Analytics solo se envían acciones sin datos personales (páginas vistas, búsquedas por categoría, clics en WhatsApp, teléfono o correo sin el número ni la dirección); la duración de sus cookies la fija Google.</p>
            <p style={{ marginBottom: '1rem' }}>Aparte, el sitio guarda en su propia base eventos de uso (por ejemplo, que se vio una propiedad) con un identificador aleatorio guardado en el almacenamiento local del navegador (vivebien:sesion). No identifica a una persona y sirve para no contar varias veces la misma visita y para las métricas de quienes publican. Puede borrarlo desde la configuración del navegador.</p>
            <p style={{ marginBottom: '1rem' }}>No se activan tecnologías de publicidad o promoción. Si algún día se habilitaran, se informarán su finalidad, proveedor y duración y se pedirá su aceptación antes de cargarlas.</p>
          </Section>

          <Section title="7. Conservación y eliminación">
            <p style={{ marginBottom: '1rem' }}>Conservaremos los datos de cuentas, formularios, consultas, citas y de propietarios, representantes y agentes <strong>hasta por dos años desde la última actividad o interacción relacionada</strong>. Al cumplirse ese plazo, los datos se bloquearán cuando corresponda y después se suprimirán, salvo que una obligación legal, la atención de una controversia o la defensa de derechos exija conservarlos durante un plazo mayor. <strong>Hoy esa supresión no es automática:</strong> VIVE BIEN la realiza al revisar los datos o cuando usted la solicita; solo el registro de correos, descrito a continuación, se elimina de forma automática. Los datos de respaldos técnicos pueden permanecer hasta que concluya el ciclo de reemplazo del respaldo y no se utilizarán para nuevas finalidades.</p>
            <p style={{ marginBottom: '1rem' }}><strong>Registro de correos.</strong> De cada correo que enviamos guardamos la fecha, el tipo y el resultado (enviado, entregado, rebotado, omitido o fallido), asociados a una huella derivada de su correo y no a su dirección, hasta por dos años desde el envío. Los registros técnicos de avisos del proveedor se conservan hasta noventa días, las suscripciones terminadas hasta dos años desde la baja y las solicitudes de suscripción sin confirmar hasta treinta días. Al eliminar su cuenta borramos sus suscripciones y los registros de envío asociados; solo conservamos la supresión de baja o rebote para no volver a escribirle. No registramos si usted abre un correo ni si hace clic en sus enlaces.</p>
            <p style={{ marginBottom: '1rem' }}><strong>Citas.</strong> De cada cita se conserva su historial de cambios (qué pasó, cuándo, con qué papel y, para el equipo de VIVE BIEN, el nombre de la persona del equipo o asociada que hizo el cambio) y de cada correo de cita se guarda, junto a la cita, su tipo, su estado de envío y la dirección del destinatario, durante el mismo plazo que la cita. Cada recordatorio se programa una sola vez para cada cita, horario y destinatario y no se repite si ya salió; si la cita cambia de horario, se programan de nuevo para el nuevo horario.</p>
            <p style={{ marginBottom: '1rem' }}>Usted también puede solicitar la cancelación de sus datos. La cancelación puede dar lugar a un periodo de bloqueo antes de su supresión cuando la ley así lo requiera.</p>
          </Section>

          <Section title="8. Derechos ARCO, revocación y límites de uso">
            <p style={{ marginBottom: '1rem' }}>Usted puede solicitar <strong>Acceso, Rectificación, Cancelación u Oposición (ARCO)</strong>, revocar su consentimiento o pedir que limitemos el uso o divulgación de sus datos mediante:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '.5rem', marginBottom: '1rem' }}>
              <li><strong>Correo:</strong> {CORREO_CONTACTO}</li>
              <li><strong>WhatsApp:</strong> {NEGOCIO.telefonoInternacional}</li>
              <li><strong>Domicilio:</strong> Blvd. J. A. Torres 2319, colonia Panorama, C.P. 37160, León, Guanajuato, México.</li>
            </ul>
            <p style={{ marginBottom: '1rem' }}>Indique su nombre, un medio para recibir respuesta, el derecho que desea ejercer, una descripción clara de los datos involucrados y elementos para acreditar su identidad o representación. Para solicitudes de rectificación, indique los cambios y aporte la información que los sustente. VIVE BIEN podrá pedir aclaraciones o documentación adicional cuando la ley lo permita y sea necesaria para verificar identidad o localizar los datos.</p>
            <p style={{ marginBottom: '1rem' }}>Comunicaremos la determinación en un plazo máximo de veinte días hábiles desde que recibamos la solicitud; si resulta procedente, la haremos efectiva dentro de los quince días hábiles siguientes. Estos plazos pueden ampliarse una sola vez por un periodo igual cuando las circunstancias lo justifiquen. El ejercicio de derechos ARCO es gratuito; solo podrán cobrarse, en su caso, los costos permitidos por la ley para reproducción, copias o envío.</p>
            <p style={{ marginBottom: '1rem' }}>Si considera vulnerado su derecho a la protección de datos personales, puede acudir a la Secretaría Anticorrupción y Buen Gobierno o a la autoridad garante competente conforme a la LFPDPPP vigente.</p>
          </Section>

          <Section title="9. Seguridad">
            <p style={{ marginBottom: '1rem' }}>VIVE BIEN aplica medidas administrativas, técnicas y físicas razonables para proteger los datos contra pérdida, uso o acceso no autorizado. Ningún sistema de transmisión o almacenamiento puede garantizar seguridad absoluta. Si ocurre un incidente que afecte significativamente sus derechos patrimoniales o morales, se comunicará conforme a la legislación aplicable.</p>
          </Section>

          <Section title="10. Cambios al Aviso">
            <p style={{ marginBottom: '1rem' }}>La versión vigente estará disponible en vivebienn.com/privacidad e indicará su fecha de actualización. Los cambios relevantes se comunicarán en el sitio o por correo cuando corresponda. Si una nueva finalidad requiere consentimiento, se solicitará antes de realizar ese tratamiento.</p>
          </Section>

          <Section title="11. Autoridad y legislación aplicable">
            <p style={{ marginBottom: '1rem' }}>Este Aviso se interpreta conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares y demás disposiciones mexicanas aplicables. La Secretaría Anticorrupción y Buen Gobierno y las autoridades garantes ejercerán las atribuciones que les correspondan conforme al marco vigente.</p>
          </Section>

          <Section title="12. Aviso simplificado y textos para formularios">
            <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, color: 'var(--azul)', fontSize: '1rem', margin: '1.25rem 0 .5rem' }}>Aviso simplificado para formularios digitales</h3>
            <p style={{ marginBottom: '1rem' }}><strong>VIVE BIEN GRUPO INMOBILIARIO Y CONSTRUCTOR, S.A. de C.V.</strong>, con domicilio en Blvd. J. A. Torres 2319, colonia Panorama, C.P. 37160, León, Guanajuato, México, tratará tu nombre y datos de contacto, así como la información de la propiedad y el mensaje que envíes, para recibir, responder y dar seguimiento a tu solicitud. Si agendas una cita, también tratará tu teléfono, el correo de tu cuenta, tus notas y el horario elegido para registrarla, avisarte de sus cambios y recordártela por correo. Si marcas la autorización independiente, VIVE BIEN compartirá manualmente los datos necesarios con el anunciante de esa propiedad para que pueda responderte. Las promociones y la medición no esencial son finalidades separadas y opcionales; puedes limitar el uso o divulgación de tus datos escribiendo a <strong>{CORREO_CONTACTO}</strong>. Consulta el <a href="/privacidad" style={{ color: 'var(--azul)', textDecoration: 'underline' }}>Aviso de Privacidad Integral</a>.</p>
          </Section>
        </div>
      </main>

      <Footer />
    </>
  )
}
