import { subirDesdeServidor } from './medios/firma'

/**
 * Sacar el texto de un archivo que llega por Telegram.
 *
 * Dos caminos, muy distintos en fiabilidad:
 *
 *  · **PDF** — se lee el texto que el archivo ya trae dentro. Es exacto y no
 *    cuesta nada. Casi todas las fichas técnicas se generan desde Word o
 *    Canva, así que traen texto de verdad.
 *
 *  · **Imagen** — hay que reconocer letras en píxeles (OCR). Eso no lo puede
 *    hacer el servidor por su cuenta: se pide al complemento de Cloudinary. Si
 *    la cuenta no lo tiene contratado, **se dice claramente** en vez de callar
 *    y dejar al usuario esperando.
 *
 * Un PDF escaneado —una foto metida dentro de un PDF— no trae texto. Se
 * detecta por lo poco que devuelve y se avisa, que es mejor que rellenar la
 * propiedad con huecos sin explicar por qué.
 */

/** Lo mínimo para considerar que un PDF traía texto de verdad. */
const MINIMO_UTIL = 40

export type Lectura =
  | { ok: true; texto: string }
  | { ok: false; motivo: string }

/** Texto de un PDF. `unpdf` funciona en serverless: no necesita binarios. */
export async function textoDePdf(bytes: ArrayBuffer): Promise<Lectura> {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractText(pdf, { mergePages: true })
    const limpio = (Array.isArray(text) ? text.join('\n') : text).trim()

    if (limpio.length < MINIMO_UTIL) {
      return {
        ok: false,
        motivo:
          'Ese PDF no trae texto: parece un escaneo o una foto dentro de un PDF. ' +
          'Mándame los datos por mensaje y seguimos.',
      }
    }
    return { ok: true, texto: limpio }
  } catch (e) {
    console.error('[pdf] no se pudo leer:', e instanceof Error ? e.message : e)
    return { ok: false, motivo: 'No pude abrir ese PDF. ¿Puedes mandarlo otra vez o escribirme los datos?' }
  }
}

/**
 * Texto de una imagen, con el complemento OCR de Cloudinary.
 *
 * Se pide al subir: Cloudinary guarda la imagen y devuelve lo que leyó. Si el
 * complemento no está activado en la cuenta, contesta con un error propio y
 * aquí se traduce a algo accionable.
 */
export async function textoDeImagen(urlRemota: string): Promise<Lectura> {
  try {
    // V-1.1.78 (SEC-05): firmada en el servidor, sin preset. El error de
    // Cloudinary (p. ej. complemento no contratado) se lee igual que antes.
    const r = await subirDesdeServidor(urlRemota, { ocr: 'adv_ocr', asset_folder: 'vivebien/fichas' })
    if (!r.ok && /sin configurar/.test(r.motivo)) return { ok: false, motivo: 'Cloudinary no está configurado.' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = (r.ok ? r.datos : { error: { message: r.motivo } }) as Record<string, any>

    const ocr = j?.info?.ocr?.adv_ocr
    const texto: string | undefined = ocr?.data?.[0]?.textAnnotations?.[0]?.description

    if (texto && texto.trim().length >= MINIMO_UTIL) {
      return { ok: true, texto: texto.trim() }
    }

    // El complemento contesta su propio error dentro de `info`.
    const fallo = ocr?.status ?? j?.error?.message
    if (fallo) {
      console.warn('[ocr] no disponible o falló:', String(fallo).slice(0, 200))
      return {
        ok: false,
        motivo:
          'No puedo leer texto dentro de imágenes todavía: hace falta activar el complemento de OCR ' +
          'en Cloudinary. Si tienes la ficha en PDF, mándamela y la leo; si no, dime los datos por mensaje.',
      }
    }

    return { ok: false, motivo: 'No encontré texto legible en esa imagen. ¿Me la mandas más de cerca, o en PDF?' }
  } catch (e) {
    console.error('[ocr] fallo:', e instanceof Error ? e.message : e)
    return { ok: false, motivo: 'No pude procesar esa imagen. Inténtalo otra vez.' }
  }
}

/** ¿El pie de foto pide que se lea la imagen, en vez de guardarla como foto? */
export function pideLectura(pie: string | undefined | null): boolean {
  return /\b(ficha|datos|especificaciones|especificacion|leer|l[ée]ela|ocr)\b/i.test(pie ?? '')
}
