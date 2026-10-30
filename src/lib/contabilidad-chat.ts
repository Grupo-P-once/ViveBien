/**
 * Lógica pura del chat con el asesor (26-oct-2026): cómo se leen las respuestas del modelo, cómo se rotula la hora y qué parte de la conversación viaja como contexto.
 * Sin React, sin red y sin reloj (la hora entra como argumento): se prueba aparte. Lo que escribe un modelo es TEXTO NO CONFIABLE: aquí solo se parte en bloques de texto plano;
 * jamás se interpreta como HTML ni como Markdown ejecutable.
 */

export type Rol = 'persona' | 'asesor'
export type MensajeDeChat = { id: string; rol: Rol; texto: string; hora: number; tipo?: 'normal' | 'error' | 'bienvenida' }

export type Bloque =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'numero'; n: string; texto: string }
  | { tipo: 'vineta'; texto: string }
  | { tipo: 'texto'; texto: string }

const TITULOS = /^(diagn[oó]stico|hallazgos?|acciones?|acciones prioritarias|pendientes?( de verificar)?|riesgos?|resumen|conclusi[oó]n|recomendaciones?)\s*[:：]?\s*$/i
const TITULO_CON_TEXTO = /^(diagn[oó]stico|hallazgos?|acciones|pendientes de verificar|resumen|conclusi[oó]n)\s*[:：]\s*(.+)$/i

/** Parte la respuesta en bloques: títulos (Diagnóstico, Hallazgos…), numeradas, viñetas y párrafos. Quita el formato Markdown (**negritas**, # encabezados) en lugar de interpretarlo. */
export function bloquesDeRespuesta(entrada: string): Bloque[] {
  const quitar = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/^#{1,6}\s+/, '').trim()
  const bloques: Bloque[] = []
  for (const cruda of entrada.split('\n')) {
    const l = quitar(cruda)
    if (!l) continue
    const num = /^(\d{1,2})[.)]\s+(.+)$/.exec(l)
    const vin = /^[-*•]\s+(.+)$/.exec(l)
    const conTexto = TITULO_CON_TEXTO.exec(l)
    if (TITULOS.test(l)) bloques.push({ tipo: 'titulo', texto: l.replace(/[:：]\s*$/, '') })
    else if (conTexto) { bloques.push({ tipo: 'titulo', texto: conTexto[1][0].toUpperCase() + conTexto[1].slice(1).toLowerCase() }); bloques.push({ tipo: 'texto', texto: conTexto[2] }) }
    else if (num) bloques.push({ tipo: 'numero', n: num[1], texto: num[2] })
    else if (vin) bloques.push({ tipo: 'vineta', texto: vin[1] })
    else bloques.push({ tipo: 'texto', texto: l })
  }
  return bloques
}

const dos = (n: number) => String(n).padStart(2, '0')
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const mismaFecha = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** «Hoy 10:42», «Ayer 18:05» o «26 oct 10:42», como los separadores de Mensajes. */
export function etiquetaDeHora(cuando: number, ahora: number): string {
  const d = new Date(cuando)
  const a = new Date(ahora)
  const hora = `${dos(d.getHours())}:${dos(d.getMinutes())}`
  if (mismaFecha(d, a)) return `Hoy ${hora}`
  if (mismaFecha(d, new Date(a.getFullYear(), a.getMonth(), a.getDate() - 1))) return `Ayer ${hora}`
  return `${d.getDate()} ${MESES[d.getMonth()]} ${hora}`
}

/** ¿Va un separador de hora antes de este mensaje? Al inicio y cada vez que pasan más de 30 minutos, como en Mensajes. */
export const llevaSeparador = (anterior: MensajeDeChat | undefined, actual: MensajeDeChat): boolean => !anterior || actual.hora - anterior.hora > 30 * 60_000

/** ¿Es la última burbuja de un grupo del mismo autor? Solo esa lleva «cola». */
export const cierraGrupo = (mensajes: MensajeDeChat[], i: number): boolean => !mensajes[i + 1] || mensajes[i + 1].rol !== mensajes[i].rol || llevaSeparador(mensajes[i], mensajes[i + 1])

export const MAX_MENSAJES_DE_CONTEXTO = 6
export const MAX_TEXTO_DE_CONTEXTO = 600
/** Lo que se manda como contexto de la conversación: los últimos mensajes reales (sin bienvenida ni errores), recortados. Un seguimiento («¿y eso qué recorto primero?») lo necesita. */
export function historialParaEnviar(mensajes: MensajeDeChat[]): Array<{ rol: Rol; texto: string }> {
  return mensajes.filter((m) => m.tipo !== 'bienvenida' && m.tipo !== 'error' && m.texto.trim()).slice(-MAX_MENSAJES_DE_CONTEXTO).map((m) => ({ rol: m.rol, texto: m.texto.slice(0, MAX_TEXTO_DE_CONTEXTO) }))
}
