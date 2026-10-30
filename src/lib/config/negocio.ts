/**
 * Los datos del negocio (NAP), en UN solo lugar.
 *
 * ─────────────────────────────────────────────────────────────
 * V-1.1.77 — fase 1 del PRD v2.0 (hallazgo DAT-03, ADR-0012)
 *
 * El teléfono, el WhatsApp, el correo y la dirección estaban escritos a mano
 * 32 veces en 19 archivos. Para Google (SEO local) el nombre, la dirección y
 * el teléfono tienen que ser idénticos en todas partes; para el negocio, un
 * cambio de número no puede depender de encontrar las 32 copias.
 *
 * Todo el sitio —footer, contacto, ficha, tarjetas, botón flotante, JSON-LD,
 * términos, privacidad, correos— lee de aquí. Una prueba falla si el número
 * vuelve a aparecer escrito fuera de este archivo.
 *
 * Constantes, no variables de entorno, a propósito (ver `CORREO_CONTACTO`):
 * un dato legal y de contacto no debe depender de que alguien se acuerde de
 * actualizar una variable en Vercel. Más adelante el Super Admin podrá
 * editarlos desde el panel (fase 13), con éstos como valores por defecto.
 *
 * Decisión del 18-sep-2026 (D-02): todo contacto público es de VIVE BIEN y
 * usa el número oficial; nunca el de un publicador.
 * ─────────────────────────────────────────────────────────────
 */

export const NEGOCIO = {
  nombre: 'VIVE BIEN Grupo Inmobiliario',
  nombreCorto: 'Vive Bien',

  /** E.164, para `tel:` y datos estructurados. */
  telefono: '+524778116501',
  /** Como se lee en México. */
  telefonoVisible: '477 811 6501',
  /** Con lada de país, para textos legales y la página de contacto. */
  telefonoInternacional: '+52 477 811 6501',
  /** Sólo dígitos, para `wa.me`. */
  whatsapp: '524778116501',

  /**
   * El correo INSTITUCIONAL de VIVE BIEN (D-76): el que se publica (pie, contacto, términos, privacidad, error,
   * datos estructurados) y al que llegan los avisos del equipo. Es del negocio, no de una persona.
   */
  email: 'informes@vivebienn.com',
  /** Remitente de los correos automáticos (Resend). `RESEND_FROM` lo sustituye si existe. El dominio está verificado en Resend. */
  remitente: 'Vive Bien <informes@vivebienn.com>',

  calle: 'Blvd. Campestre 2910, Local 10',
  /** Sin el local, para textos cortos. */
  calleCorta: 'Blvd. Campestre 2910',
  colonia: 'Cañada del Refugio',
  ciudad: 'León',
  estado: 'Guanajuato',
  estadoCorto: 'Gto.',
  cp: '37358',
  pais: 'MX',

  /**
   * Ubicación de la tienda (para el mapita de «Contáctanos»). Salen de la ficha pública de Google Maps «VIVE BIEN GRUPO INMOBILIARIO»
   * (agencia inmobiliaria, 37358 Cañada del Refugio; mismo teléfono 477 811 6501 y vivebienn.com), 21-oct-2026. OpenStreetMap NO tiene el
   * número 2910: solo el tramo del Blvd. Campestre, ~300 m más al este; por eso no se usó ese punto. Si la tienda se mueve, se cambia aquí.
   */
  lat: 21.1530178,
  lng: -101.7283955,
  /** «Cómo llegar»: abre la ficha del negocio en Google Maps (se busca por nombre y dirección, no por coordenadas sueltas). */
  mapaUrl: 'https://www.google.com/maps/search/?api=1&query=VIVE%20BIEN%20GRUPO%20INMOBILIARIO%20Blvd.%20Campestre%202910%20Le%C3%B3n%20Guanajuato',

  instagram: 'https://www.instagram.com/vive_bien_mx/',
  facebook: 'https://www.facebook.com/profile.php?id=61582687400323',

  /**
   * Horario de atención. 23-oct-2026: el propietario decidió que el OFICIAL es el de la ficha de Google Maps (lun, mar, jue y vie 9:00–17:30; sáb y dom
   * cerrado). Maps también marca el miércoles «Abierto las 24 horas», que casi seguro es un error de la ficha: aquí el miércoles sigue el horario normal.
   */
  horario: [
    { dias: 'Lun – Vie', horas: '9:00 – 17:30' },
    { dias: 'Sáb – Dom', horas: 'Cerrado' },
  ],

  /** Google Analytics 4. */
  ga4: 'G-7TQQEQ97S2',
  /**
   * Segundo ID de medición (23-oct-2026): el flujo «Vive Bien Web» de la propiedad de Analytics que el propietario ve en su cuenta (propiedad 531571829). Esa
   * propiedad llevaba 48 h sin recibir datos porque el sitio solo enviaba al ID anterior. Se envía a LAS DOS (Google lo permite) para no perder lo que ya
   * hubiera en la anterior; el panel de Super Admin lee la 531571829.
   */
  ga4Adicional: 'G-BKCPFJVTG5',
  /** Propiedad de GA4 que lee el panel (API de datos). No es un secreto. */
  ga4Propiedad: '531571829',
} as const

/** «Lun – Vie: 9:00 – 17:30 | Sáb – Dom: Cerrado» */
export const HORARIO_TEXTO = NEGOCIO.horario.map((h) => `${h.dias}: ${h.horas}`).join(' | ')

/** «Blvd. Campestre 2910, Local 10, Cañada del Refugio» */
export const DIRECCION_CORTA = `${NEGOCIO.calle}, ${NEGOCIO.colonia}`

/** Enlace de WhatsApp al número de VIVE BIEN, con mensaje opcional ya codificado. */
export function enlaceWhatsApp(texto?: string): string {
  return texto
    ? `https://wa.me/${NEGOCIO.whatsapp}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/${NEGOCIO.whatsapp}`
}

/** Enlace para llamar a VIVE BIEN. */
export function enlaceTelefono(): string {
  return `tel:${NEGOCIO.telefono}`
}
