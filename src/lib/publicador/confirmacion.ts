import type { EstadoPub } from '../publicacion'

/**
 * Qué se le dice a quien termina de guardar, publicar o enviar un anuncio.
 *
 * Por qué existe: el editor decía SIEMPRE «un administrador lo revisa» antes de enviar, aunque quien lo enviaba fuera Super Admin y
 * el botón dijera «Publicar ahora»; y al terminar con éxito no decía NADA (limpiaba el error y recargaba), así que nadie sabía si el
 * anuncio quedó publicado, en revisión o solo guardado.
 *
 * Regla: el mensaje sale de lo que CONFIRMÓ el servidor (`estado` de la respuesta, releído de la base) y de lo que se ve al recargar
 * la propiedad, nunca del texto del botón ni de una variable de React que quedó de antes. Si las dos fuentes no coinciden, no se
 * afirma nada: se dice que no se pudo confirmar.
 */

/** Cómo se decidió el estado: `moderacion` (admin/super admin), `autopublicacion` (publicador con `publicar_sin_revision`) o `revision`. */
export type ViaDePublicacion = 'moderacion' | 'autopublicacion' | 'revision'

/** Lo que devuelve `POST /api/propiedades/[id]/estado` (los campos nuevos son opcionales: un servidor anterior solo trae `ok` y `estado`). */
export type RespuestaDeEstado = {
  ok?: boolean
  estado?: string
  via?: ViaDePublicacion
  /** Ruta pública canónica; solo viene si el anuncio quedó visible al público. */
  ruta?: string | null
  /** `false` si el servidor no pudo releer el estado guardado. */
  confirmado?: boolean
  /** ¿La propiedad es de quien hizo la operación? (sin exponer el uid del dueño). */
  esTuya?: boolean
}

export type Confirmacion =
  | { tipo: 'publicada'; titulo: string; detalle: string; ruta: string | null }
  | { tipo: 'en_revision'; titulo: string; detalle: string }
  | { tipo: 'borrador'; titulo: string; detalle: string }
  | { tipo: 'cambios_guardados'; titulo: string; detalle: string; ruta: string | null }
  | { tipo: 'transicion_fallida'; titulo: string; detalle: string; destino: EstadoPub }
  | { tipo: 'sin_confirmar'; titulo: string; detalle: string }

/** Modo con el que se muestra el texto previo al envío. `desconocido` = todavía no se sabe qué permisos tiene la cuenta. */
export type ModoDeEnvio = 'directo' | 'revision' | 'desconocido'

export function modoDeEnvio(o: { permisosCargados: boolean; esAdmin: boolean; publicaSinRevision: boolean }): ModoDeEnvio {
  if (!o.permisosCargados) return 'desconocido'
  return o.esAdmin || o.publicaSinRevision ? 'directo' : 'revision'
}

/**
 * Etiqueta sobre la barra de progreso del editor.
 *
 * Por qué existe: decía «Listo para enviar a revisión» aunque el anuncio YA estuviera en revisión o publicado, y a una cuenta que
 * publica directo («Publicar ahora») le hablaba de revisión. Ahora sale del estado REAL guardado (`estado_pub`) y del modo de envío:
 * una propiedad ya enviada o publicada no está «lista para enviar», y solo se habla de revisión cuando de verdad habrá revisión.
 */
export function etiquetaDeProgreso(o: { estadoPub: string | null | undefined; lista: boolean; modo: ModoDeEnvio; minimo: number }): string {
  if (o.estadoPub === 'publicada') return 'Publicada'
  if (o.estadoPub === 'en_revision') return 'En revisión: un administrador la revisará'
  if (!o.lista) return `Necesita ${o.minimo}% para poder ${o.modo === 'directo' ? 'publicarse' : 'enviarse'}`
  if (o.modo === 'directo') return 'Lista para publicar'
  if (o.modo === 'revision') return 'Lista para enviar a revisión'
  return 'Lista para enviar'
}

/** Texto del paso «Antes de enviar» cuando el anuncio ya está completo. Solo habla de revisión cuando de verdad habrá revisión. */
export function textoPrevioAlEnvio(modo: ModoDeEnvio, esAdmin: boolean, conObservaciones = false): string {
  if (modo === 'revision' && conObservaciones) {
    return 'El anuncio está completo. El revisor te dejó observaciones: al enviarlo, un administrador lo revisa otra vez antes de publicarlo, aunque tu cuenta normalmente publique sin revisión. Mientras esté en revisión no podrás editarlo.'
  }
  if (modo === 'directo') {
    return esAdmin
      ? 'El anuncio está completo. Al pulsar «Publicar ahora» se publica en el sitio de inmediato: tu cuenta puede publicar sin revisión.'
      : 'El anuncio está completo. Al pulsar «Publicar ahora» se publica en el sitio de inmediato: tu cuenta tiene permiso para publicar sin revisión.'
  }
  if (modo === 'revision') {
    return 'El anuncio está completo. Al enviarlo, un administrador lo revisa y decide si se publica. Mientras esté en revisión no podrás editarlo.'
  }
  return 'El anuncio está completo. Al continuar, el servidor decide según tu cuenta si se publica o pasa a revisión, y te lo confirmaremos aquí.'
}

/** Etiqueta del botón final. Solo describe la acción; quien decide el resultado es el servidor. */
export function etiquetaDelBoton(modo: ModoDeEnvio, enviando: boolean): string {
  if (modo === 'directo') return enviando ? 'Publicando…' : 'Publicar ahora'
  if (modo === 'revision') return enviando ? 'Enviando…' : 'Enviar a revisión'
  return enviando ? 'Enviando…' : 'Enviar'
}

/**
 * Solo se acepta una ruta interna del sitio hacia una propiedad (`/propiedades/<algo>`). Una ruta externa, con esquema o con `//` no
 * se convierte en enlace: «Ver publicación» nunca debe llevar a otro sitio.
 */
export function rutaPublicaValida(ruta: unknown): string | null {
  if (typeof ruta !== 'string') return null
  if (!/^\/propiedades\/[^/\s?#:\\]+$/.test(ruta)) return null
  return ruta
}

/** Resultado de un envío (publicar o mandar a revisión) a partir de la respuesta del servidor y de lo que se ve al recargar. */
export function confirmacionDeEnvio(resp: RespuestaDeEstado, recargado: { estado_pub?: string | null } | null): Confirmacion {
  const delServidor = typeof resp.estado === 'string' ? resp.estado : null
  const alRecargar = recargado ? (recargado.estado_pub ?? null) : null

  if (!delServidor || resp.confirmado === false) {
    return {
      tipo: 'sin_confirmar',
      titulo: 'No pudimos confirmar el estado',
      detalle: 'El servidor no confirmó cómo quedó el anuncio. Revisa «Mis propiedades» antes de repetir la operación.',
    }
  }
  if (!recargado || alRecargar !== delServidor) {
    return {
      tipo: 'sin_confirmar',
      titulo: 'No pudimos confirmar el estado',
      detalle: recargado
        ? 'La respuesta del servidor y el estado que vemos al recargar no coinciden. Revisa «Mis propiedades» antes de repetir la operación.'
        : 'La operación respondió, pero no pudimos recargar la propiedad para comprobarlo. Revisa «Mis propiedades» antes de repetir la operación.',
    }
  }

  if (delServidor === 'publicada') {
    return {
      tipo: 'publicada',
      titulo: 'Propiedad publicada',
      detalle: resp.via === 'autopublicacion'
        ? 'Ya se ve en el sitio. Se publicó sin pasar por revisión porque tu cuenta tiene ese permiso.'
        : 'Ya se ve en el sitio.',
      ruta: rutaPublicaValida(resp.ruta),
    }
  }
  if (delServidor === 'en_revision') {
    return { tipo: 'en_revision', titulo: 'Enviado a revisión', detalle: 'Aún no está publicado: un administrador lo revisará. Mientras esté en revisión no podrás editarlo.' }
  }
  if (delServidor === 'borrador') {
    return { tipo: 'borrador', titulo: 'Borrador guardado', detalle: 'Aún no está publicado ni enviado a revisión.' }
  }
  return {
    tipo: 'sin_confirmar',
    titulo: 'No pudimos confirmar el estado',
    detalle: 'El anuncio quedó en un estado que esta pantalla no sabe explicar. Revisa «Mis propiedades».',
  }
}

/** Resultado de «Guardar borrador» / de guardar cambios, a partir del estado que se ve DESPUÉS de recargar (no de lo que había antes). */
export function confirmacionDeGuardado(recargado: { estado_pub?: string | null } | null, ruta: string | null = null): Confirmacion {
  const estado = recargado ? (recargado.estado_pub ?? null) : null
  if (!recargado) {
    return { tipo: 'sin_confirmar', titulo: 'No pudimos confirmar que se guardó', detalle: 'No se pudo recargar la propiedad. Tus cambios siguen en esta pantalla; vuelve a intentarlo.' }
  }
  if (estado === 'publicada') {
    return { tipo: 'cambios_guardados', titulo: 'Cambios guardados', detalle: 'La propiedad ya está publicada: los cambios se ven en el sitio.', ruta: rutaPublicaValida(ruta) }
  }
  if (estado === 'en_revision') {
    return { tipo: 'sin_confirmar', titulo: 'Cambios guardados', detalle: 'La propiedad está en revisión, no publicada.' }
  }
  return { tipo: 'borrador', titulo: 'Borrador guardado', detalle: 'Aún no está publicado ni enviado a revisión.' }
}

/** El guardado salió bien pero el paso a publicada / a revisión no: el borrador existe y no hay que crear otro anuncio. */
export function confirmacionDeTransicionFallida(destino: EstadoPub, mensaje: string): Confirmacion {
  const accion = destino === 'publicada' ? 'la publicación' : 'el envío a revisión'
  return {
    tipo: 'transicion_fallida',
    titulo: `Tu borrador sí quedó guardado, pero no se completó ${accion}`,
    detalle: `${mensaje} Solo se guardó el borrador. Puedes reintentar sin crear otro anuncio ni volver a subir las fotos.`,
    destino,
  }
}
