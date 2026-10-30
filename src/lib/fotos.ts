/**
 * Las fotos de una propiedad viven en dos sitios, y esto los mantiene de acuerdo.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ DOS SITIOS
 *
 * `propiedades.fotos` es un `text[]`: la lista ordenada de URLs. La lee la
 * ficha pública, el catálogo, las tarjetas y el bot. Cambiarla por una tabla
 * habría roto todo eso de golpe.
 *
 * La tabla `fotos` (migración 07) añade lo que un array no puede guardar: el
 * **pie de foto** y el orden como dato propio.
 *
 * La regla, para que nunca se contradigan: **manda el array**. Es el que dice
 * qué fotos hay y en qué orden; la tabla sólo añade el texto de cada una,
 * atado a su URL. Si una foto se quita del array, su fila sobra.
 * ─────────────────────────────────────────────────────────────
 */

export type FilaFoto = {
  propiedad_id: string
  url: string
  pie: string | null
  orden: number
  es_principal: boolean
}

/** Cuánto puede medir un pie de foto: una frase, no un párrafo. */
export const MAXIMO_PIE = 140

/**
 * Las filas que deberían existir para esta lista de fotos.
 *
 * `pies` viene indexado por URL, no por posición: reordenar las fotos no debe
 * mover los textos de sitio — el pie pertenece a la imagen, no al hueco.
 */
export function filasDeFotos(
  propiedadId: string,
  urls: readonly string[],
  pies: Record<string, string | null | undefined> = {},
): FilaFoto[] {
  const vistas = new Set<string>()
  const filas: FilaFoto[] = []

  for (const url of urls) {
    // La misma URL dos veces rompería el índice único de portada y duplicaría
    // la foto en la galería.
    if (!url || vistas.has(url)) continue
    vistas.add(url)

    const pie = pies[url]
    filas.push({
      propiedad_id: propiedadId,
      url,
      pie: typeof pie === 'string' && pie.trim() ? pie.trim().slice(0, MAXIMO_PIE) : null,
      orden: filas.length,
      // La primera es la portada. Una sola por propiedad: lo garantiza también
      // un índice único en la base.
      es_principal: filas.length === 0,
    })
  }

  return filas
}

/** Los pies que ya había, para no perderlos al reordenar o al añadir una foto. */
export function piesDe(filas: readonly { url: string; pie?: string | null }[]): Record<string, string> {
  const pies: Record<string, string> = {}
  for (const f of filas) {
    if (f.pie) pies[f.url] = f.pie
  }
  return pies
}

/* ── Dónde se guarda cada imagen en Cloudinary ──────────────────
   Antes todo caía en una sola carpeta `vivebien/` con nombres aleatorios:
   `vivebien/ro6y9hrqy6n6n8dcd6ju.jpg`. Con veinte propiedades eso es un cajón
   de sastre — imposible saber qué foto es de qué anuncio, ni borrar las de una
   propiedad retirada sin abrirlas una por una.

   Ahora: `vivebien/<tipo>/<id de la propiedad>`, y los planos en su subcarpeta.
   La carpeta se lee sola en el panel de Cloudinary. */

/** Limpia un trozo de ruta: sin acentos, sin espacios, sin sorpresas. */
function segmento(v: unknown, porDefecto: string): string {
  const s = String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return s || porDefecto
}

/**
 * Cómo se manda a Cloudinary para que quede ordenado **en esta cuenta**.
 *
 * La cuenta nueva usa «carpetas dinámicas»: el parámetro `folder` se ignora y
 * todo cae en la raíz con un nombre aleatorio. Lo que sí manda es:
 *
 *  · `public_id` con la ruta dentro → la dirección queda legible:
 *    `…/upload/v123/vivebien/casa/tzula-castillos/mf2k8-a7x.jpg`
 *  · `asset_folder` → es lo que agrupa las imágenes en el panel.
 *
 * Se mandan los dos: uno arregla la URL, el otro el panel.
 */
export function destinoCloudinary(
  propiedadId: string,
  tipo?: string | null,
  clase: 'fotos' | 'planos' = 'fotos',
  propietarioOpaco?: string,
): { public_id: string; asset_folder: string } {
  const carpeta = carpetaDe(propiedadId, tipo, clase, propietarioOpaco)
  // Nombre único y corto. No se usa el del archivo: «WhatsApp Image 2026-04-20
  // at 1.16.24 PM.jpg» convierte la URL en un jeroglífico.
  const nombre = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return { public_id: `${carpeta}/${nombre}`, asset_folder: carpeta }
}

export function carpetaDe(
  propiedadId: string,
  tipo?: string | null,
  clase: 'fotos' | 'planos' = 'fotos',
  propietarioOpaco?: string,
): string {
  // Con propietario (identificador OPACO derivado en el servidor, nunca el UID): `usuarios/<id>/anuncios/<tipo>/<anuncio>`.
  // Sin él, el esquema anterior `vivebien/<tipo>/<anuncio>` (las imágenes ya subidas conservan su URL).
  const base = propietarioOpaco
    ? `usuarios/${segmento(propietarioOpaco, 'sin-usuario')}/anuncios/${segmento(tipo, 'sin-tipo')}/${segmento(propiedadId, 'sin-id')}`
    : `vivebien/${segmento(tipo, 'sin-tipo')}/${segmento(propiedadId, 'sin-id')}`
  return clase === 'planos' ? `${base}/planos` : base
}
