/**
 * La política de contenido del sitio, con los orígenes **medidos**, no supuestos.
 *
 * Se sacaron abriendo cada página en un navegador y leyendo qué pidió de
 * verdad (`performance.getEntriesByType('resource')`), más un barrido del
 * código en busca de direcciones escritas a mano. Escribirla de memoria es
 * como se rompen los sitios en silencio: una fuente que no carga, un mapa en
 * blanco, un botón que deja de funcionar y nadie sabe por qué.
 *
 * R-05 (D-62): la política puede aplicarse de verdad con `CSP_MODO=bloquear` en las variables del despliegue (ver `next.config.ts`); por
 * defecto sigue en informe hasta validar el inicio de sesión real en un entorno de staging. Inventario de violaciones: `docs/QA/`.
 *
 * Estrategia: primero en **modo informe** (`-Report-Only`), que no bloquea
 * nada y sólo avisa en la consola. Cuando se compruebe que no hay avisos en
 * las páginas reales, se pasa a bloquear.
 */

/** De dónde viene cada cosa, y por qué está permitida. */
const ORIGENES = {
  /** Google Analytics y su gestor de etiquetas. */
  analitica: ['https://www.googletagmanager.com', 'https://www.google-analytics.com'],
  /** Tipografías de Google. El CSS viene de una, los archivos de la otra. */
  fuentes: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
  /** Font Awesome, los iconos de todo el sitio. */
  iconos: ['https://cdnjs.cloudflare.com'],
  /** Las fotos de las propiedades y las de relleno. */
  imagenes: [
    'https://res.cloudinary.com',
    'https://images.unsplash.com',
    'https://i.ytimg.com',
    'https://unavatar.io',
    'https://*.tile.openstreetmap.org',
    'https://maps.gstatic.com',
    'https://maps.googleapis.com',
  ],
  /** La base de datos y la sesión. */
  datos: [
    'https://*.supabase.co',
    'https://api.cloudinary.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://*.googleapis.com',
    'https://*.firebaseapp.com',
    // El inicio de sesión con Google. No aparece midiendo las páginas públicas
    // —sólo se carga al pulsar «Entrar»—, y si falta, entrar deja de funcionar.
    'https://accounts.google.com',
    'https://apis.google.com',
  ],
  /** Mapas: el buscador de direcciones del asistente y las teselas. */
  mapas: ['https://nominatim.openstreetmap.org', 'https://*.tile.openstreetmap.org'],
  /** Lo que se incrusta: videos de propiedades y el mapa de la ficha. */
  incrustado: [
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
    'https://maps.google.com',
    'https://www.google.com',
    'https://*.firebaseapp.com',
    'https://accounts.google.com',
    'https://apis.google.com',
  ],
}

const unir = (...listas: string[][]) => [...new Set(listas.flat())].join(' ')

/**
 * `unsafe-inline` en estilos no es opcional hoy: el sitio tiene **380
 * elementos con `style=` en línea**. Quitarlo exige moverlos a CSS, que es
 * trabajo real y va aparte. En scripts hace falta por el arranque que Next
 * inyecta; se quita el día que se usen nonces.
 */
export const CSP = [
  `default-src 'self'`,
  // R-05 (D-62): SIN 'unsafe-eval'. Medido con Chromium en 17 páginas del build de producción: cero violaciones con y sin él (el `eval` era
  // del modo desarrollo de React/Next). 'unsafe-inline' sigue por el arranque que Next inyecta; se quita el día que se usen nonces.
  `script-src 'self' 'unsafe-inline' ${unir(ORIGENES.analitica, ['https://apis.google.com'])}`,
  `style-src 'self' 'unsafe-inline' ${unir(ORIGENES.fuentes, ORIGENES.iconos)}`,
  `font-src 'self' data: ${unir(ORIGENES.fuentes, ORIGENES.iconos)}`,
  `img-src 'self' data: blob: ${unir(ORIGENES.imagenes, ORIGENES.analitica)}`,
  `connect-src 'self' ${unir(ORIGENES.datos, ORIGENES.mapas, ORIGENES.analitica)}`,
  `frame-src ${unir(ORIGENES.incrustado)}`,
  `media-src 'self' https://res.cloudinary.com`,
  `worker-src 'self' blob:`,
  // Nada de Flash ni applets, y que nadie cambie la base de las rutas.
  `object-src 'none'`,
  `base-uri 'self'`,
  // Los formularios sólo pueden enviar aquí: si alguien inyecta un formulario,
  // no puede mandarse los datos a otro sitio.
  // Entrar con Google manda un formulario a su dominio: sin esto, el botón de
  // «Entrar» dejaría de funcionar y el error sería de los que no se ven venir.
  `form-action 'self' https://accounts.google.com`,
  `frame-ancestors 'self'`,
  `upgrade-insecure-requests`,
].join('; ')
