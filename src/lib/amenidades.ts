/**
 * Amenidades de una propiedad.
 *
 * ─────────────────────────────────────────────────────────────
 * EL FALLO QUE CIERRA (V-1.1.61)
 *
 * El campo era un `<input>` de texto cuyo valor se calculaba como
 * `amenidades.join(', ')`, y al escribir se hacía `split(',').filter(Boolean)`.
 *
 * Consecuencia: en cuanto tecleabas la coma, el trozo vacío que queda detrás
 * se descartaba, la lista se volvía a unir **sin esa coma**, y el cursor se
 * quedaba con el texto de antes. Era imposible escribir la segunda amenidad.
 * No es que estuviera mal explicado: el campo **sólo aceptaba una**.
 *
 * Ahora son etiquetas: se escribe, se pulsa Enter o coma, y queda una ficha
 * que se puede quitar. De paso se evita el otro problema de un campo libre —
 * «trifasica», «Trifásica» y «TRIFASICA» como tres amenidades distintas.
 * ─────────────────────────────────────────────────────────────
 */

export const MAXIMO_AMENIDADES = 30
export const MAXIMO_LARGO = 40

/** Sin acentos ni mayúsculas, para comparar. No es lo que se guarda. */
function clave(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

/** Limpia una amenidad tal como se va a guardar: como la escribió la persona. */
export function normalizar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, MAXIMO_LARGO)
}

/**
 * Añade una o varias amenidades a la lista.
 *
 * Acepta texto con comas —pegar «alberca, jardín, cochera» de un correo es lo
 * más natural del mundo— y también saltos de línea, que es lo que sale al
 * copiar de una ficha en PDF.
 */
export function agregar(lista: readonly string[], entrada: string): string[] {
  const nuevas = entrada
    .split(/[,;\n]/)
    .map(normalizar)
    .filter(Boolean)

  const resultado = [...lista]
  for (const a of nuevas) {
    if (resultado.length >= MAXIMO_AMENIDADES) break
    // Sin repetir, comparando sin acentos ni mayúsculas: «Trifásica» y
    // «trifasica» son la misma cosa y en el anuncio se verían como dos.
    if (!resultado.some((x) => clave(x) === clave(a))) resultado.push(a)
  }
  return resultado
}

export function quitar(lista: readonly string[], amenidad: string): string[] {
  return lista.filter((x) => clave(x) !== clave(amenidad))
}

export function incluye(lista: readonly string[], amenidad: string): boolean {
  return lista.some((x) => clave(x) === clave(amenidad))
}

/**
 * Lo que se ofrece según el tipo de inmueble.
 *
 * Una nave no tiene alberca y una casa no tiene andén de carga: ofrecer las
 * mismas veinte a todo el mundo es ruido. Sale de las fichas de Inmuebles24
 * revisadas en [[Especificacion - Wizard de publicacion]].
 */
export const SUGERENCIAS: Record<string, string[]> = {
  casa: [
    'Alberca', 'Jardín', 'Cochera techada', 'Seguridad 24/7', 'Cuarto de servicio',
    'Roof garden', 'Amueblada', 'Aire acondicionado', 'Calentador solar', 'Cisterna',
    'Bodega', 'Cuarto de lavado',
  ],
  departamento: [
    'Elevador', 'Seguridad 24/7', 'Gimnasio', 'Alberca', 'Roof garden',
    'Salón de eventos', 'Estacionamiento', 'Amueblado', 'Aire acondicionado', 'Balcón',
  ],
  nave: [
    'Trifásica', 'Patio de maniobras', 'Andén de carga', 'Oficinas', 'Grúa viajera',
    'Caseta de vigilancia', 'Cisterna', 'Sistema contra incendio', 'Piso industrial',
    'Comedor', 'Estacionamiento para tráileres',
  ],
  bodega: [
    'Trifásica', 'Patio de maniobras', 'Andén de carga', 'Oficinas', 'Caseta de vigilancia',
    'Cisterna', 'Sistema contra incendio',
  ],
  terreno: [
    'Servicios municipales', 'Barda perimetral', 'Agua', 'Luz', 'Drenaje',
    'Uso de suelo comercial', 'Uso de suelo industrial', 'Frente a calle principal',
  ],
  comercial: [
    'Estacionamiento', 'Vitrina', 'Aire acondicionado', 'Baños', 'Cortina metálica',
    'Bodega', 'Alta afluencia', 'Seguridad 24/7',
  ],
  local: [
    'Estacionamiento', 'Vitrina', 'Aire acondicionado', 'Baños', 'Cortina metálica',
    'Alta afluencia',
  ],
  oficina: [
    'Elevador', 'Aire acondicionado', 'Recepción', 'Sala de juntas', 'Estacionamiento',
    'Seguridad 24/7', 'Amueblada',
  ],
}

/** Las sugerencias del tipo, o una mezcla razonable si no se sabe el tipo. */
export function sugerenciasDe(tipo?: string | null): string[] {
  return SUGERENCIAS[String(tipo ?? '').toLowerCase()] ?? [
    'Estacionamiento', 'Seguridad 24/7', 'Aire acondicionado', 'Cisterna', 'Bodega',
  ]
}
