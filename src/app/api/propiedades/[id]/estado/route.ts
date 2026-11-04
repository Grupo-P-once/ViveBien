import { estadoDeAceptacion, estadoDeOrigen } from '@/lib/comision-servidor'
import { MENSAJE_COMISION_NO_DISPONIBLE, MENSAJE_REQUIERE_ACEPTACION } from '@/lib/comision-aceptacion'
import { MENSAJE_REQUIERE_ORIGEN } from '@/lib/origen-declarado'
import { estadoDeAceptacionLegal } from '@/lib/aceptacion-legal-servidor'
import { MENSAJE_LEGAL_NO_DISPONIBLE, MENSAJE_REQUIERE_ACEPTACION_LEGAL } from '@/lib/aceptacion-legal'
import { NextResponse } from 'next/server'
import { avisar } from '@/lib/alertas'
import { supabaseAdmin, exigir, registrarIntentoDenegado } from '@/lib/auth-server'
import { portalCerradoParaEscribir } from '@/lib/portal/exigir-portal'
import { cambiarEstadoDePropiedad, type CambiosDeEstado } from '@/lib/cambiar-estado-propiedad'
import {
  esEstadoPub,
  notaDeRevisionValida,
  puedeTransicionar,
  listaParaRevision,
  calcularCompletitud,
  publicaSinRevisionEfectiva,
  tieneObservacionesDelRevisor,
  type EstadoPub,
} from '@/lib/publicacion'
import { puedePublicar } from '@/lib/perfil'
import { refrescarCatalogo } from '@/lib/refrescar'
import { asignarSlugAlPublicar } from '@/lib/asignar-slug'
import { nombreDe, rutaDe } from '@/lib/propiedad-publica'
import { esVisibleAlPublico } from '@/lib/visibilidad-publica'
import { urlDe } from '@/lib/sitio'
import { puede } from '@/lib/acceso/permisos'
import { tieneCapacidad } from '@/lib/acceso/capacidades'
import { frenarAsync, TOPES } from '@/lib/limites'
import { despuesDeResponder } from '@/lib/correo/transaccionales'
import { avisarPropiedad, type EventoPropiedad } from '@/lib/correo/eventos-cuenta'
import type { DbCorreo } from '@/lib/correo/enviar'

/**
 * POST /api/propiedades/[id]/estado — mueve una propiedad por su ciclo de vida.
 *
 * Un solo sitio para todas las transiciones: enviar a revisión, aprobar,
 * rechazar, pedir cambios y despublicar. Concentrarlas aquí evita que cada
 * pantalla invente su propia regla.
 *
 * Cuerpo: { estado: EstadoPub, nota?: string }
 *
 * Respuesta: { ok, estado, via?, ruta?, esTuya, confirmado }. `estado` NO es el que se pidió: es el que la base tiene DESPUÉS del
 * cambio (se vuelve a leer), porque la pantalla confirma al usuario con esto y no con el texto de su botón. `via` dice por qué camino
 * se decidió (moderacion | autopublicacion | revision) y lo calcula este servidor con los permisos efectivos de la cuenta; `ruta` solo
 * viene si el anuncio quedó visible al público. Los campos nuevos son aditivos: quien solo lee `ok` y `estado` sigue funcionando.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await exigir(req, 'propiedad.gestionar_propias')
  if (auth.error) return auth.error
  const { perfil } = auth
  const cerrado = await portalCerradoParaEscribir(perfil)
  if (cerrado) return cerrado

  const frenado = await frenarAsync(`edicion:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const destino = body?.estado

  if (!esEstadoPub(destino)) {
    return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data: prop, error: errLectura } = await db
    .from('propiedades')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (errLectura) return NextResponse.json({ error: errLectura.message }, { status: 500 })
  if (!prop) return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })

  // Un publicador sólo mueve lo suyo. Las propiedades sin dueño son de la
  // casa: las gestiona un administrador.
  const esDueno = prop.owner_id && prop.owner_id === perfil.uid
  if (!puede(perfil, 'propiedad.gestionar_todas') && !esDueno) {
    await registrarIntentoDenegado(perfil, req, `propiedad.ajena:${id}`)
    return NextResponse.json({ error: 'Esa propiedad no es tuya.' }, { status: 403 })
  }

  const origen: EstadoPub = esEstadoPub(prop.estado_pub) ? prop.estado_pub : 'publicada'

  // Un publicador con `publicar_sin_revision` (p. ej. un asociado) publica su
  // borrador sin aprobación previa. El servidor lo decide con los permisos
  // efectivos del perfil, nunca con algo que mande el navegador.
  const capacidadSinRevision = tieneCapacidad(perfil, 'publicar_sin_revision')
  // Con observaciones del revisor sin resolver (rechazo / cambios solicitados) la publicación directa se cierra: tiene que pasar por revisión.
  if (destino === 'publicada' && capacidadSinRevision && !puede(perfil, 'propiedad.moderar') && tieneObservacionesDelRevisor(prop)) {
    return NextResponse.json({
      error: 'Este anuncio tiene observaciones del revisor (lo rechazó o pidió cambios): tiene que pasar por revisión antes de publicarse. Envíalo a revisión.',
      codigo: 'requiere_revision',
    }, { status: 403 })
  }
  const publicaSinRevision = publicaSinRevisionEfectiva(capacidadSinRevision, prop)
  const permiso = puedeTransicionar(origen, destino, perfil.rol, publicaSinRevision)
  if (!permiso.ok) {
    return NextResponse.json({ error: permiso.motivo }, { status: 403 })
  }

  // Revisar (rechazar / pedir cambios) exige decir por qué. La pantalla ya lo pide; aquí lo exige el servidor.
  const nota = notaDeRevisionValida(destino, body?.nota)
  if (!nota.ok) return NextResponse.json({ error: nota.motivo }, { status: 400 })

  // No se manda a revisar —ni se publica— un anuncio a medias. Que el admin
  // se salte la revisión no significa saltarse el contenido mínimo: un anuncio
  // sin precio o sin fotos hace más daño en el catálogo que no estar.
  if (destino === 'en_revision' || (destino === 'publicada' && origen !== 'en_revision')) {
    const listo = listaParaRevision(prop)
    if (!listo.ok) return NextResponse.json({ error: listo.motivo }, { status: 400 })
  }

  // Quien publica por sí mismo (sin pasar por un revisor) cumple lo mismo que
  // quien envía a revisión: el anuncio tiene que poder ser contactado.
  const autopublica = destino === 'publicada' && !puede(perfil, 'propiedad.moderar')
  if (destino === 'en_revision' || autopublica) {

    // Ni tampoco uno cuyo dueño no ha dejado cómo lo contacten: la propiedad
    // estaría completa y el anuncio seguiría siendo un callejón sin salida.
    //
    // Se pide `*` a propósito. Con la lista de columnas, un `whatsapp` que aún
    // no existe —06-perfil.sql sin aplicar— tumba la consulta entera, el perfil
    // llega vacío y se bloquea a TODOS los publicadores por una migración
    // pendiente. Aquí la regla es de negocio, no de seguridad: degradar a lo
    // que la base sí tiene es mejor que cerrar el flujo entero.
    const { data: fila } = await db
      .from('usuarios')
      .select('*')
      .eq('uid', perfil.uid)
      .maybeSingle()

    const cuenta = (fila ?? {}) as Record<string, unknown>
    const conWhatsapp = 'whatsapp' in cuenta
    const contacto = puedePublicar(
      conWhatsapp ? cuenta : { ...cuenta, whatsapp: cuenta.telefono },
      perfil.rol,
    )
    if (!contacto.ok) {
      return NextResponse.json({ error: contacto.motivo, perfilIncompleto: true }, { status: 400 })
    }

    // Motor de comisiones (Etapa B): con el módulo encendido y un texto vigente, quien paga comisión la acepta ANTES de enviar o publicar.
    // Apagado, exenta (`sin_comision`) o del equipo: no se toca la base. Si no se puede comprobar, no pasa (falla cerrado).
    // Términos y Condiciones y Aviso de Privacidad: con `legalAcceptance` encendido, toda cuenta que no es del equipo los acepta ANTES de enviar
    // o publicar (no depende de la comisión). Apagado o del equipo: no se toca la base. Si no se puede comprobar, no pasa (falla cerrado).
    const legal = await estadoDeAceptacionLegal(perfil)
    if (!legal.ok) return NextResponse.json({ error: MENSAJE_LEGAL_NO_DISPONIBLE, codigo: 'legal_no_disponible' }, { status: 503 })
    if (legal.estado.requerida && legal.estado.pendientes.length > 0) {
      return NextResponse.json({ error: MENSAJE_REQUIERE_ACEPTACION_LEGAL, codigo: 'requiere_aceptacion_legal', pendientes: legal.estado.pendientes }, { status: 403 })
    }
    // Antes de aceptar nada, dice cómo maneja la propiedad (trato directo o agente/inmobiliaria). No depende de que haya un texto vigente.
    const org = await estadoDeOrigen(perfil, id)
    if (!org.ok) return NextResponse.json({ error: MENSAJE_COMISION_NO_DISPONIBLE, codigo: 'comision_no_disponible' }, { status: 503 })
    if (org.aplica && !org.listo) return NextResponse.json({ error: MENSAJE_REQUIERE_ORIGEN, codigo: 'requiere_origen' }, { status: 403 })
    const com = await estadoDeAceptacion(perfil)
    if (!com.ok) return NextResponse.json({ error: MENSAJE_COMISION_NO_DISPONIBLE, codigo: 'comision_no_disponible' }, { status: 503 })
    if (com.estado.requerida && !com.estado.aceptada) {
      return NextResponse.json({ error: MENSAJE_REQUIERE_ACEPTACION, codigo: 'requiere_aceptacion_comision' }, { status: 403 })
    }
  }

  const ahora = new Date().toISOString()
  const cambios: CambiosDeEstado = { completitud: calcularCompletitud(prop) }

  if (destino === 'en_revision') cambios.enviada_en = ahora
  if (destino === 'publicada') cambios.publicada_en = ahora

  if (puede(perfil, 'propiedad.moderar') && ['publicada', 'rechazada', 'cambios_solicitados'].includes(destino)) {
    cambios.revisado_por = perfil.email ?? perfil.uid
    cambios.revisado_en = ahora
    cambios.nota_moderacion = nota.nota
  }

  // El cambio y su bitácora son UNA transacción (migración 33): o quedan los dos o ninguno. La base compara el estado que se leyó
  // (si otra persona la movió, 409: una aprobación con la pantalla vieja no pisa un retiro ajeno), valida la máquina de estados
  // y la nota mínima, y escribe `audit_logs`. Antes: `update` y DESPUÉS `registrar()`, sin garantía.
  const cambio = await cambiarEstadoDePropiedad(db, {
    id,
    antes: prop.estado_pub,
    estado: destino,
    cambios,
    actor: perfil,
    accion: `propiedad.${destino}`,
    auditAntes: { estado_pub: origen },
    auditDespues: {
      estado_pub: destino,
      nota: cambios.nota_moderacion ?? null,
      // Queda dicho en la bitácora que nadie la revisó antes: la autorizó la capacidad.
      ...(autopublica ? { sinRevision: true, tipoPublicador: perfil.tipoPublicador ?? null } : {}),
    },
  })
  if (!cambio.ok) {
    return NextResponse.json({ error: cambio.mensaje, ...(cambio.codigo === 'conflicto' ? { codigo: 'conflicto' } : {}) }, { status: cambio.status })
  }

  // El nombre público se decide AHORA, al publicar, que es cuando por fin hay
  // tipo, operación, lugar y título con los que construirlo. Nunca bloquea la
  // publicación: si no se puede, la propiedad sale con su id como antes.
  const ruta = destino === 'publicada'
    ? await asignarSlugAlPublicar(db, prop as Record<string, unknown>)
    : null

  refrescarCatalogo()

  // Correo al DUEÑO de la propiedad (en revisión, publicada, rechazada o con cambios). Después de responder, solo a su correo verificado, una vez por hecho y sin tumbar el flujo.
  // Quien dispara puede ser el propio dueño o un revisor: el destinatario siempre es `owner_id`, nunca quien hace la petición.
  if (destino === 'en_revision' || destino === 'publicada' || destino === 'rechazada' || destino === 'cambios_solicitados') {
    const evento: EventoPropiedad = destino
    despuesDeResponder(() => avisarPropiedad(db as unknown as DbCorreo, { evento, prop: prop as Record<string, unknown>, version: cambios.enviada_en ?? cambios.publicada_en ?? cambios.revisado_en ?? ahora, motivo: cambios.nota_moderacion ?? null }))
  }

  if (destino === 'publicada') {
    void avisar({
      nivel: 'ok',
      titulo: 'Propiedad publicada',
      datos: { Título: nombreDe(prop as Record<string, string>), Por: perfil.email ?? perfil.uid },
      accion: urlDe(ruta ?? `/propiedades/${id}`),
      clave: `publicada:${id}`,
    })
  }

  // Estado canónico: se relee. Un cambio que la base aceptó pero que no se puede confirmar NO se presenta como hecho (PostgREST
  // contesta 204 aunque afecte 0 filas, E-11): se devuelve `confirmado: false` y la pantalla no afirma nada.
  const { data: guardada, error: errRelectura } = await db
    .from('propiedades')
    .select('id, estado_pub, estatus, slug, owner_id')
    .eq('id', id)
    .maybeSingle()
  const relectura = errRelectura || !guardada ? null : (guardada as { estado_pub?: string | null; estatus?: string | null; slug?: string | null; owner_id?: string | null })
  const estadoGuardado = relectura?.estado_pub ?? null
  const confirmado = estadoGuardado === destino
  const via = destino === 'publicada'
    ? (autopublica ? 'autopublicacion' : 'moderacion')
    : destino === 'en_revision' ? 'revision' : undefined
  const rutaCanonica = confirmado && relectura && estadoGuardado === 'publicada' && esVisibleAlPublico(relectura)
    ? rutaDe({ id, slug: relectura.slug })
    : null

  return NextResponse.json({
    ok: true,
    estado: confirmado ? estadoGuardado : destino,
    confirmado,
    ...(via ? { via } : {}),
    ...(rutaCanonica ? { ruta: rutaCanonica } : {}),
    // Sin exponer el uid del dueño: solo si es de quien hizo la operación.
    esTuya: Boolean(relectura?.owner_id && relectura.owner_id === perfil.uid),
  })
}
