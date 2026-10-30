import type { TipoRegistro } from '@/app/api/admin/registros/route'

/**
 * De dónde llegó cada persona, en los términos del negocio.
 *
 * Antes todo lo anónimo caía en «interesado» y no se distinguía a quien abrió
 * la ventana emergente al entrar de quien pidió información de una propiedad
 * concreta. Son dos personas muy distintas: la segunda ya eligió un inmueble.
 */
export function tipoDeLead(origen: string, interes: string, propiedad?: string | null): TipoRegistro {
  const o = origen.toLowerCase()
  // Alta hecha por un administrador desde el panel (V-1.1.72): no llegó por
  // ningún formulario del sitio, y mezclarlo con «sin origen» escondería que
  // alguien lo escribió a mano.
  if (o === 'manual') return 'manual'
  if (o === 'valuador') return 'valuacion'
  if (o === 'ficha' || o === 'propiedad') return 'propiedad'
  // El popup se abre desde una ficha: quien lo llena ahí ya eligió un inmueble,
  // y eso es lo que separa a un interesado de alguien que sólo entró al sitio.
  if ((o === 'registro' || o === 'modal') && propiedad) return 'propiedad'
  if (o === 'portada' || o === 'registro' || o === 'modal') return 'popup'
  if (o === 'contacto') return 'contacto'
  // Sólo para registros viejos sin origen. Antes esta comprobación iba PRIMERO,
  // y ahora el interés de un lead de ficha es el título de la propiedad: uno
  // que dijera «…valuada…» se habría contado como solicitud de avalúo.
  if (/valu/i.test(interes)) return 'valuacion'
  return 'interesado'
}
