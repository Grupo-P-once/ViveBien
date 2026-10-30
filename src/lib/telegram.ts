import { esRelleno } from './slug'
/**
 * Lectura de un mensaje suelto de Telegram.
 *
 * Vive aparte de la ruta a propósito: es lógica pura, sin nada de HTTP ni de
 * base de datos, así que se puede probar sin levantar medio Next. La ruta se
 * queda con lo que sí es suyo — autenticar, guardar y responder.
 */

/**
 * Saca lo que se pueda del texto suelto.
 *
 * A propósito **sin IA por ahora**: una extracción con modelo cuesta una clave
 * de API y una llamada por mensaje, y para el 80 % de los casos —«Casa en Las
 * Trojes, 180 m2, 2.5 millones»— basta con leer números y palabras conocidas.
 *
 * Lo que no reconozca se queda en la descripción, que es donde el publicador
 * lo va a ver y corregir en el asistente. **Nada se descarta en silencio.**
 */
export function extraerDeTexto(texto: string): Record<string, unknown> {
  const t = (texto ?? '').trim()
  if (!t) return {}

  const datos: Record<string, unknown> = { descripcion: t }
  const bajo = t.toLowerCase()

  // Operación
  if (/\brenta|rentar|arriendo\b/.test(bajo)) datos.operacion = 'renta'
  else if (/\bventa|vender|se vende\b/.test(bajo)) datos.operacion = 'venta'

  // Tipo
  const TIPOS: [RegExp, string][] = [
    [/\bnave|bodega industrial\b/, 'nave'],
    [/\bbodega\b/, 'bodega'],
    [/\bdepartamento|depa\b/, 'departamento'],
    [/\bterreno|lote\b/, 'terreno'],
    [/\blocal\b/, 'local'],
    [/\boficina\b/, 'oficina'],
    [/\bcasa\b/, 'casa'],
  ]
  for (const [re, tipo] of TIPOS) {
    if (re.test(bajo)) { datos.tipo = tipo; break }
  }

  // Superficie: «180 m2», «180m²», «180 metros»
  // Sin `\b` al final: `²` no es carácter de palabra, así que `m²\b` nunca
  // encaja. Se usa un limite explicito de "no seguido de letra o digito".
  const m = bajo.match(/(\d[\d,.]*)\s*(?:m2|m²|metros cuadrados|metros)(?![a-z0-9])/)
  if (m) {
    const n = Number(m[1].replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0) datos.metros = n
  }

  // Precio: «2.5 millones», «2,500,000», «$2500000»
  const millones = bajo.match(/(\d+(?:[.,]\d+)?)\s*(?:millones|mdp|millon)/)
  if (millones) {
    const n = Number(millones[1].replace(',', '.'))
    if (Number.isFinite(n) && n > 0) datos.precio = Math.round(n * 1_000_000)
  } else {
    const pesos = t.match(/\$\s*(\d[\d,.]*)/)
    if (pesos) {
      const n = Number(pesos[1].replace(/[,.]/g, ''))
      if (Number.isFinite(n) && n > 1000) datos.precio = n
    }
  }

  // Recámaras y baños
  const rec = bajo.match(/(\d+)\s*(?:rec|recamaras|recámaras|habitaciones|cuartos)/)
  if (rec) datos.recamaras = Number(rec[1])
  const ban = bajo.match(/(\d+)\s*(?:banos|baños)/)
  if (ban) datos.banos = Number(ban[1])

  // Título: la primera línea, que es como escribe la gente.
  const primera = t.split('\n')[0].trim()
  if (primera.length >= 10) datos.titulo = primera.slice(0, 140)

  return datos
}

/* ── Dónde vive la conversación ─────────────────────────────────
   Sin columnas nuevas: el chat va en el id del borrador y el paso en
   `nota_moderacion`. La alternativa era `extras`, de la migración 07, que
   sigue sin aplicarse — y mientras tanto el bot no funcionaba en absoluto. */

export type PasoGuardado =
  | 'inicio' | 'operacion' | 'tipo' | 'ubicacion' | 'metros' | 'precio'
  | 'titulo' | 'fotos' | 'listo'

/**
 * Prefijo del id de los borradores de un chat.
 * Los ids de grupo de Telegram son negativos («-1003782780222»), y el signo no
 * cabe en un id que también es la URL pública de la propiedad.
 */
export function prefijoDe(chatId: string): string {
  return `tg-${chatId.replace(/[^0-9]/g, 'n')}-`
}

/** El paso guardado en `nota_moderacion`, o el inicio. */
export function pasoDe(borrador: { nota_moderacion?: unknown } | null | undefined): PasoGuardado {
  const nota = typeof borrador?.nota_moderacion === 'string' ? borrador.nota_moderacion : ''
  const m = nota.match(/^tg:([a-z]+)$/)
  return (m?.[1] as PasoGuardado) ?? 'inicio'
}

/**
 * Qué le falta para publicarse sola, en palabras.
 *
 * Lo que entra por Telegram lo manda el dueño desde su teléfono, así que no
 * pasa por revisión. Pero un anuncio sin foto o sin precio hace más daño en el
 * catálogo que no estar: eso sí se exige.
 */
export function faltaParaPublicar(p: Record<string, unknown>): string[] {
  const falta: string[] = []
  // Los borradores viejos tienen guardado 'Borrador desde Telegram'.
  if (esRelleno(typeof p.titulo === 'string' ? p.titulo : null)) falta.push('el título')
  if (!p.precio) falta.push('el precio')
  if (!p.ubicacion) falta.push('la ubicación')
  if (!p.tipo) falta.push('el tipo')
  if (!p.operacion) falta.push('la operación')
  if (!Array.isArray(p.fotos) || (p.fotos as unknown[]).length === 0) falta.push('al menos una foto')
  return falta
}
