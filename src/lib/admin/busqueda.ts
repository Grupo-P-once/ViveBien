/**
 * Limpieza de lo que se escribe en la búsqueda global del panel.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ NO SE PASA TAL CUAL
 *
 * La búsqueda arma filtros de PostgREST del estilo
 *
 *     titulo.ilike.%texto%,folio.ilike.%texto%
 *
 * En esa sintaxis la coma separa condiciones y los paréntesis agrupan. Un texto
 * con `,` o `)` no sólo rompería la consulta: podría **añadir condiciones** que
 * nadie escribió. Así que sólo pasan letras, números, espacios y los signos que
 * aparecen en un correo o un teléfono (`@ . _ + -`). `%` y `*` también fuera:
 * son comodines, y el comodín lo pone el servidor.
 * ─────────────────────────────────────────────────────────────
 */

const MAXIMO = 60
const MINIMO = 2

export function limpiarConsulta(valor: unknown): string {
  if (typeof valor !== 'string') return ''
  const limpio = valor
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s@._+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAXIMO)
    .trim()
  return limpio.length >= MINIMO ? limpio : ''
}

/** Los dígitos de la consulta, para buscar teléfonos escritos con o sin espacios. */
export function digitosDe(consulta: string): string {
  const d = consulta.replace(/\D/g, '')
  return d.length >= 3 ? d : ''
}

/** `%texto%` para `ilike`. */
export function patron(consulta: string): string {
  return `%${consulta}%`
}

/** Condiciones `campo.ilike.%texto%` unidas por comas, para `.or()`. */
export function condicionesIlike(campos: string[], consulta: string): string {
  const p = patron(consulta)
  return campos.map((c) => `${c}.ilike.${p}`).join(',')
}
