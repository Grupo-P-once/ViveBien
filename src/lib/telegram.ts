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
