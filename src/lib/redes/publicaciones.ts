/**
 * Publicaciones de las redes sociales de VIVE BIEN que se muestran en el inicio («Conoce nuestras últimas publicaciones»).
 *
 * FUENTE DE VERDAD: este archivo + las imágenes de `public/redes/`. Sin scripts ni iframes de Meta: las imágenes son locales (privacidad, CSP y
 * velocidad) y cada tarjeta es un enlace externo seguro.
 *
 * Para agregar o quitar una publicación (sin tocar el diseño):
 *   1. Copiar la imagen a `public/redes/` en WebP de 800 px de ancho (`ffmpeg -i original.png -vf "scale=800:-2:flags=lanczos" -c:v libwebp -quality 82 nombre.webp`).
 *   2. Añadir una entrada aquí (la primera es la más reciente).
 *   3. Si se conoce el enlace de la publicación, ponerlo en `permalink` (solo https de instagram.com / facebook.com); si no, la tarjeta lleva al perfil.
 *   4. `npm test` (la guardia `tests/redes-publicaciones.test.ts` comprueba imagen, texto alternativo, enlaces y límites).
 *
 * NO se muestran conteos de «me gusta» ni de comentarios: no se conocen y un número inventado engaña.
 * Supuesto inicial (pendiente de confirmar con el propietario): las piezas están en Instagram y en Facebook (`redes`).
 */
export type Red = 'instagram' | 'facebook'

export type Publicacion = {
  id: string
  /** Archivo en `public/redes/`. */
  imagen: string
  /** Proporción real del archivo (para reservar el espacio y evitar saltos). */
  ancho: number
  alto: number
  /** Texto alternativo: qué se ve y qué dice la pieza. */
  alt: string
  /** Pie de la publicación (resumen de lo que dice la pieza; confirmar contra el texto publicado). */
  texto: string
  redes: readonly Red[]
  /** Enlace a la publicación concreta, si se conoce. */
  permalink?: string
}

export const PERFIL = {
  usuario: 'vive_bien_mx',
  paginaFacebook: 'Vive Bien Grupo Inmobiliario',
} as const

const AMBAS: readonly Red[] = ['instagram', 'facebook']

export const PUBLICACIONES: readonly Publicacion[] = [
  {
    id: 'mandujano', imagen: 'mandujano-nave-industrial.webp', ancho: 800, alto: 1000, redes: AMBAS,
    alt: 'Nave industrial «Mandujano» en venta: fachada blanca con portones negros, 616 m² de superficie, 3 baños y 9 m de altura.',
    texto: 'Nave industrial Mandujano. Espacio para hacer crecer tu negocio: 616 m², 3 baños y 9 m de altura libre, en León.',
  },
  {
    id: 'terrenos-hoy', imagen: 'terrenos-hoy-oportunidades.webp', ancho: 800, alto: 1000, redes: AMBAS,
    alt: 'Terreno con vista a las montañas de León y una franja roja de la marca; texto «Terrenos hoy, oportunidades mañana».',
    texto: 'Terrenos hoy, oportunidades mañana. Invierte en ubicaciones con potencial y asegura tu próximo gran proyecto.',
  },
  {
    id: 'antes-de-rentar', imagen: 'antes-de-rentar-nave.webp', ancho: 800, alto: 1000, redes: AMBAS,
    alt: 'Lista de cinco puntos para considerar antes de rentar una nave industrial: ubicación, espacio y altura, condiciones del contrato, servicios e instalaciones, y proyección de crecimiento.',
    texto: 'Antes de rentar una nave industrial, considera lo esencial: ubicación, espacio, contrato, servicios y crecimiento.',
  },
  {
    id: 'explora', imagen: 'explora-tu-proximo-espacio.webp', ancho: 800, alto: 960, redes: AMBAS,
    alt: 'Una laptop mostrando el sitio vivebienn.com sobre una mesa, con el texto «Explora tu próximo espacio».',
    texto: 'Explora tu próximo espacio. Visita nuestro sitio vivebienn.com: residencial, industrial, comercial y terrenos.',
  },
  {
    id: 'espacios-historia', imagen: 'espacios-que-construyen-tu-historia.webp', ancho: 800, alto: 1054, redes: AMBAS,
    alt: 'Logotipo de Vive Bien Grupo Inmobiliario sobre una terraza luminosa; texto «Espacios que construyen tu historia».',
    texto: 'Espacios que construyen tu historia. Residencial, industrial, comercial y terrenos.',
  },
  {
    id: 'nuevas-oportunidades', imagen: 'espacios-nuevas-oportunidades.webp', ancho: 800, alto: 1054, redes: AMBAS,
    alt: 'Fachada moderna de una nave industrial con portón y el número 10; texto «Espacios para nuevas oportunidades».',
    texto: 'Espacios para nuevas oportunidades. Inmuebles que mueven grandes planes: inversión, desarrollo y crecimiento.',
  },
  {
    id: 'mejor-futuro', imagen: 'espacios-mejor-futuro.webp', ancho: 800, alto: 1054, redes: AMBAS,
    alt: 'Fachada de una casa moderna con puerta de madera; texto «Espacios para un mejor futuro».',
    texto: 'Espacios para un mejor futuro. Tu patrimonio, nuestra prioridad.',
  },
]

export const MAX_PUBLICACIONES = 12
export const HOSTS_PERMITIDOS = ['www.instagram.com', 'instagram.com', 'www.facebook.com', 'facebook.com'] as const
