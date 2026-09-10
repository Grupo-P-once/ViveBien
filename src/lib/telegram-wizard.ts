import { normalizarTelefono } from './contacto'

/**
 * El asistente de publicación, en forma de conversación.
 *
 * ─────────────────────────────────────────────────────────────
 * DÓNDE VIVE EL ESTADO — la decisión de diseño que importa
 *
 * Una conversación necesita recordar en qué paso va entre un mensaje y el
 * siguiente. Lo obvio sería un `Map` en memoria, y sería un error: se pierde en
 * cada despliegue y cada instancia tendría el suyo, así que a media conversación
 * el bot preguntaría otra vez lo mismo.
 *
 * En vez de eso, **el borrador se crea con la primera respuesta y el paso vive
 * dentro de él**. Dos cosas salen gratis:
 *
 *  · Nada se pierde. Si alguien abandona a la mitad, queda un borrador
 *    incompleto que se puede terminar en el asistente web.
 *  · No hace falta una tabla nueva ni limpiarla nunca.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ ES CORTO
 *
 * Siete preguntas, no las veinte del asistente web. Quien está frente a una
 * nave con el teléfono no va a contestar veinte veces; y lo que falte se
 * completa después desde el navegador, donde escribir es cómodo.
 *
 * El objetivo no es publicar desde Telegram: es **que el inventario entre**.
 */

export type PasoTelegram =
  | 'inicio'
  | 'operacion'
  | 'tipo'
  | 'ubicacion'
  | 'metros'
  | 'precio'
  | 'titulo'
  | 'fotos'
  | 'listo'

export const OPERACIONES: [string, string][] = [
  ['venta', 'Venta'],
  ['renta', 'Renta'],
]

export const TIPOS: [string, string][] = [
  ['casa', 'Casa'],
  ['departamento', 'Departamento'],
  ['terreno', 'Terreno'],
  ['nave', 'Nave industrial'],
  ['bodega', 'Bodega'],
  ['local', 'Local comercial'],
  ['oficina', 'Oficina'],
]

/** Lo que el bot dice en cada paso, y qué botones ofrece. */
export type Pregunta = {
  texto: string
  botones?: [string, string][]
  /** Se puede saltar: no todo dato es imprescindible para un borrador. */
  saltable?: boolean
}

export const PREGUNTAS: Record<PasoTelegram, Pregunta | null> = {
  inicio: {
    texto:
      '👋 Hola. Puedo crear el borrador de una propiedad en un minuto.\n\n' +
      'Te hago siete preguntas cortas y al final me mandas las fotos. ' +
      'Lo que falte lo completas después desde la web.',
    botones: [['empezar', '🏠 Quiero subir una propiedad']],
  },
  operacion: { texto: '¿Es venta o renta?', botones: OPERACIONES },
  tipo: { texto: '¿Qué tipo de inmueble es?', botones: TIPOS },
  ubicacion: {
    texto: '¿Dónde está? Escribe calle y colonia.\n\n_Ej: Blvd. San Juan Bosco, Cañada del Refugio_',
  },
  metros: { texto: '¿Cuántos m² tiene?', saltable: true },
  precio: { texto: '¿Cuál es el precio en pesos?\n\n_Puedes escribir «2.5 millones» o «2500000»_' },
  titulo: {
    texto:
      'Descríbela en una o dos líneas. Lo que no se ve en las fotos: ' +
      'accesos, estado, para qué sirve, qué hay cerca.',
  },
  fotos: {
    texto:
      '📸 Ahora mándame las fotos, de una en una o varias a la vez.\n\n' +
      'Cuando termines escribe *listo*.',
  },
  listo: null,
}

/** Orden de la conversación. */
const ORDEN: PasoTelegram[] = [
  'inicio', 'operacion', 'tipo', 'ubicacion', 'metros', 'precio', 'titulo', 'fotos', 'listo',
]

export function siguientePaso(actual: PasoTelegram): PasoTelegram {
  const i = ORDEN.indexOf(actual)
  return i < 0 || i >= ORDEN.length - 1 ? 'listo' : ORDEN[i + 1]
}

export type Interpretacion =
  | { ok: true; campos: Record<string, unknown>; siguiente: PasoTelegram }
  | { ok: false; motivo: string }

/**
 * Interpreta la respuesta a un paso.
 *
 * Nunca acepta a medias: si el dato no se entiende, se vuelve a preguntar con
 * un ejemplo. Guardar «dos mil quinientos» como precio y seguir adelante deja
 * un borrador que parece completo y no lo está.
 */
export function interpretar(paso: PasoTelegram, respuesta: string): Interpretacion {
  const t = (respuesta ?? '').trim()
  const bajo = t.toLowerCase()

  switch (paso) {
    case 'inicio':
      return { ok: true, campos: {}, siguiente: 'operacion' }

    case 'operacion': {
      if (/^(venta|vender|vendo)/.test(bajo)) return { ok: true, campos: { operacion: 'venta' }, siguiente: 'tipo' }
      if (/^(renta|rentar|rento)/.test(bajo)) return { ok: true, campos: { operacion: 'renta' }, siguiente: 'tipo' }
      return { ok: false, motivo: 'No entendí. Pulsa *Venta* o *Renta*.' }
    }

    case 'tipo': {
      const encontrado = TIPOS.find(([v, etiqueta]) =>
        bajo === v || bajo === etiqueta.toLowerCase() || bajo.includes(v),
      )
      if (encontrado) return { ok: true, campos: { tipo: encontrado[0] }, siguiente: 'ubicacion' }
      return { ok: false, motivo: 'No reconocí ese tipo. Usa uno de los botones.' }
    }

    case 'ubicacion': {
      if (t.length < 5) return { ok: false, motivo: 'Necesito algo más: calle y colonia al menos.' }
      return { ok: true, campos: { ubicacion: t.slice(0, 200) }, siguiente: 'metros' }
    }

    case 'metros': {
      if (/^(salt|omit|no s|no se|luego|despu)/.test(bajo)) {
        return { ok: true, campos: {}, siguiente: 'precio' }
      }
      // Se toma el PRIMER grupo de digitos, no se limpian las letras: con
      // `replace(/[^\d]/g,'')`, «450 m2» daba 4502 — se colaba el 2 de «m2».
      const m = bajo.match(/(\d+(?:[.,]\d+)?)/)
      const n = m ? Number(m[1].replace(',', '.')) : NaN
      if (!Number.isFinite(n) || n <= 0) {
        return { ok: false, motivo: 'Escribe sólo el número de metros, o «salto» si no lo sabes.' }
      }
      return { ok: true, campos: { metros: Math.round(n) }, siguiente: 'precio' }
    }

    case 'precio': {
      const millones = bajo.match(/(\d+(?:[.,]\d+)?)\s*(?:millones|millon|mdp)/)
      let n: number | null = null
      if (millones) {
        const v = Number(millones[1].replace(',', '.'))
        if (Number.isFinite(v)) n = Math.round(v * 1_000_000)
      } else {
        const v = Number(bajo.replace(/[^\d]/g, ''))
        if (Number.isFinite(v) && v > 0) n = v
      }
      if (!n || n < 1000) {
        return { ok: false, motivo: 'No entendí el precio. Escribe «2.5 millones» o «2500000».' }
      }
      return { ok: true, campos: { precio: n }, siguiente: 'titulo' }
    }

    case 'titulo': {
      if (t.length < 10) return { ok: false, motivo: 'Un poco más, por favor: al menos una frase.' }
      // La primera línea sirve de título; el texto entero, de descripción.
      const primera = t.split('\n')[0].trim()
      return {
        ok: true,
        campos: {
          titulo: (primera.length >= 10 ? primera : t).slice(0, 140),
          descripcion: t.slice(0, 5000),
        },
        siguiente: 'fotos',
      }
    }

    case 'fotos': {
      // Palabras completas. Con prefijos, «ya casi» -que significa lo
      // contrario- terminaba la conversacion.
      if (/^(listo|ya está|ya esta|ya|terminé|termine|terminado|fin|acabé|acabe)$/.test(bajo)) {
        return { ok: true, campos: {}, siguiente: 'listo' }
      }
      return { ok: false, motivo: 'Mándame las fotos, o escribe *listo* cuando termines.' }
    }

    default:
      return { ok: false, motivo: 'Ya terminamos con esa propiedad.' }
  }
}

/** Resumen de lo capturado, para el mensaje final. */
export function resumen(p: Record<string, unknown>): string {
  const pesos = (n: number) => `$${n.toLocaleString('es-MX')}`
  const tipo = TIPOS.find(([v]) => v === p.tipo)?.[1] ?? String(p.tipo ?? '—')
  const op = p.operacion === 'renta' ? 'Renta' : 'Venta'

  return [
    `*${String(p.titulo ?? 'Sin título')}*`,
    ``,
    `${tipo} · ${op}`,
    p.ubicacion ? `📍 ${p.ubicacion}` : null,
    p.metros ? `📐 ${p.metros} m²` : null,
    p.precio ? `💰 ${pesos(Number(p.precio))}` : null,
    Array.isArray(p.fotos) ? `📸 ${(p.fotos as unknown[]).length} fotos` : null,
  ].filter(Boolean).join('\n')
}

/** Reexportado para que la ruta no tenga que importar de dos sitios. */
export { normalizarTelefono }
