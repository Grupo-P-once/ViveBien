import { NextResponse } from 'next/server'
import { supabaseAdmin, exigir, registrarIntentoDenegado } from '@/lib/auth-server'
import { portalCerradoParaEscribir } from '@/lib/portal/exigir-portal'
import { registrar } from '@/lib/auditoria'
import { calcularCompletitud, camposProtegidosEn, esEstatusComercial, faltantesNuevos, paraPublicador, puedeEditarAnuncio, quitarCamposReservados } from '@/lib/publicacion'
import { escribirTolerante } from '@/lib/columnas'
import { filasDeFotos, piesDe } from '@/lib/fotos'
import { refrescarCatalogo } from '@/lib/refrescar'
import { nombrarSiEstaPublicada } from '@/lib/asignar-slug'
import { puede } from '@/lib/acceso/permisos'
import { diferenciasDeContenido, sanearContenido, sanearPies } from '@/lib/sanear-propiedad'
import { frenarAsync, TOPES } from '@/lib/limites'
import { tieneCapacidad } from '@/lib/acceso/capacidades'

/**
 * Rehace la tabla `fotos` para que diga lo mismo que el array.
 *
 * Los pies que ya había se conservan aunque no vengan en esta petición: al
 * reordenar o al subir una foto más, el texto de las demás no se toca.
 *
 * Nunca lanza. Si la migración 07 no está aplicada —o la tabla falla—, las
 * fotos siguen guardadas en `propiedades.fotos`, que es lo que ve el público.
 */
async function sincronizarFotos(
  db: ReturnType<typeof supabaseAdmin>,
  id: string,
  urls: string[],
  pies?: Record<string, string>,
) {
  try {
    const { data: antes, error } = await db
      .from('fotos').select('url, pie').eq('propiedad_id', id)
    if (error) return // la tabla no existe todavía: no es un fallo del guardado

    const mezcla = { ...piesDe((antes ?? []) as { url: string; pie?: string | null }[]), ...(pies ?? {}) }
    const filas = filasDeFotos(id, urls, mezcla)

    // Borrar y reinsertar: son diez filas, y así no queda ninguna huérfana de
    // una foto que se quitó. Sin fotos, sólo se borra.
    await db.from('fotos').delete().eq('propiedad_id', id)
    if (filas.length) await db.from('fotos').insert(filas)
  } catch (e) {
    console.error('[fotos] no se pudieron sincronizar:', e instanceof Error ? e.message : e)
  }
}

/**
 * GET /api/admin/propiedades/[id] — la propiedad y los pies de sus fotos.
 *
 * Los pies viven en la tabla `fotos`, y de un **borrador** no los puede leer
 * el navegador: el RLS sólo abre las fotos de lo publicado. Por eso pasan por
 * aquí, donde ya se comprobó quién pregunta.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await exigir(req, 'propiedad.gestionar_propias')
  if (auth.error) return auth.error

  const { id } = await params
  const db = supabaseAdmin()

  const { data: prop } = await db.from('propiedades').select('*').eq('id', id).maybeSingle()
  if (!prop) return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })

  const esDueno = prop.owner_id && prop.owner_id === auth.perfil.uid
  if (!puede(auth.perfil, 'propiedad.gestionar_todas') && !esDueno) {
    await registrarIntentoDenegado(auth.perfil, req, `propiedad.ajena:${id}`)
    return NextResponse.json({ error: 'Esa propiedad no es tuya.' }, { status: 403 })
  }

  const { data: fotos } = await db.from('fotos').select('url, pie').eq('propiedad_id', id)
  return NextResponse.json({
    propiedad: puede(auth.perfil, 'propiedad.moderar') ? prop : paraPublicador(prop),
    pies: piesDe((fotos ?? []) as { url: string; pie?: string | null }[]),
  })
}

/**
 * PATCH /api/admin/propiedades/[id] — editar el contenido de una propiedad.
 *
 * Un administrador edita cualquiera; un publicador, sólo la suya. El estado
 * de publicación NO se cambia aquí: para eso está
 * /api/propiedades/[id]/estado, que aplica la máquina de estados.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await exigir(req, 'propiedad.gestionar_propias')
  if (auth.error) return auth.error
  const { perfil } = auth
  const cerrado = await portalCerradoParaEscribir(perfil)
  if (cerrado) return cerrado

  // El autoguardado dispara seguido; un script, más. El tope existía y no se aplicaba (lib/limites.ts).
  const frenado = await frenarAsync(`edicion:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado

  const { id } = await params
  const db = supabaseAdmin()

  const { data: prop, error: errLectura } = await db
    .from('propiedades')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (errLectura) return NextResponse.json({ error: errLectura.message }, { status: 500 })
  if (!prop) return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })

  const esDueno = prop.owner_id && prop.owner_id === perfil.uid
  if (!puede(perfil, 'propiedad.gestionar_todas') && !esDueno) {
    await registrarIntentoDenegado(perfil, req, `propiedad.ajena:${id}`)
    return NextResponse.json({ error: 'Esa propiedad no es tuya.' }, { status: 403 })
  }

  // La misma regla que ya aplica la pantalla (`puedeEditarAnuncio`, V-1.1.72),
  // ahora también en el servidor: mientras la propiedad está en revisión o
  // publicada, un publicador no la toca (precio, dirección o fotos incluidos).
  // Para cambiar algo la devuelve a borrador / cambios solicitados un admin.
  if (!puede(perfil, 'propiedad.gestionar_todas') && !puedeEditarAnuncio(prop.estado_pub, false, tieneCapacidad(perfil, 'editar_publicadas'))) {
    await registrarIntentoDenegado(perfil, req, `propiedad.bloqueada:${id}:${prop.estado_pub}`)
    return NextResponse.json(
      { error: 'Esta propiedad está en revisión o publicada: no se puede editar. Pide a un administrador que la devuelva a borrador.' },
      { status: 409 },
    )
  }

  const body = await req.json().catch(() => ({}))

  // Los pies de foto no son una columna de `propiedades`: van a la tabla
  // `fotos`, indexados por URL. Se sacan antes de tocar la fila.
  const saneoPies = sanearPies((body as Record<string, unknown>).pies)
  if (!saneoPies.ok) return NextResponse.json({ error: 'Los pies de foto no son válidos.' }, { status: 400 })
  const pies = saneoPies.pies
  delete (body as Record<string, unknown>).pies

  // Un admin puede tocar el estatus comercial; nadie escribe owner_id ni
  // estado_pub por esta vía.
  // 02.03 / §60.4: quien no modera y manda campos protegidos (dueño, estado
  // publicado, contadores…) queda en la bitácora; los campos se ignoran igual.
  const protegidos = camposProtegidosEn(body as Record<string, unknown>)
  if (protegidos.length && !puede(perfil, 'propiedad.moderar')) {
    await registrarIntentoDenegado(perfil, req, `propiedad.campos:${protegidos.join(',')}`)
  }
  // LISTA BLANCA de contenido y valores validados en el servidor (no sólo en el navegador): ver lib/sanear-propiedad.ts. Lo que la
  // propiedad ya tenía (fotos, tipo…) sigue valiendo aunque no cumpla las reglas nuevas.
  const moderador = puede(perfil, 'propiedad.moderar')
  const saneo = sanearContenido(quitarCamposReservados(body as Record<string, unknown>), {
    moderador,
    actuales: prop as Record<string, unknown>,
    nube: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  })
  if (saneo.errores.length) {
    return NextResponse.json({ error: `Hay datos que no son válidos: ${saneo.errores.join('; ')}.`, campos: saneo.errores }, { status: 400 })
  }
  if (saneo.descartados.length && !moderador) {
    await registrarIntentoDenegado(perfil, req, `propiedad.campos_no_permitidos:${saneo.descartados.slice(0, 8).join(',')}`)
  }
  const datos = saneo.datos
  if (!moderador) delete datos.estatus
  // La situación comercial es un conjunto cerrado: antes el servidor guardaba cualquier texto.
  if ('estatus' in datos && !esEstatusComercial(datos.estatus)) {
    return NextResponse.json({ error: 'Esa situación comercial no existe.' }, { status: 400 })
  }

  // Una propiedad PUBLICADA tiene que seguir cumpliendo lo mínimo: antes cualquiera que pudiera editarla (admin, Super Admin, o un
  // publicador con `editar_publicadas`) podía dejarla sin fotos, sin precio o sin título y seguía a la vista del público.
  if (prop.estado_pub === 'publicada') {
    const nuevas = faltantesNuevos(prop as Record<string, unknown>, { ...(prop as Record<string, unknown>), ...datos })
    if (nuevas.length) {
      return NextResponse.json(
        { error: `Esta propiedad está publicada y tiene que seguir completa. Con este cambio quedaría sin: ${nuevas.join(', ')}. Si quieres quitarlo, primero devuélvela a borrador.`, campos: nuevas },
        { status: 400 },
      )
    }
  }

  if (Object.keys(datos).length === 0) {
    // Escribir un pie de foto no cambia ninguna columna de `propiedades`: sin
    // esto, guardar sólo un pie se iba por «sin cambios» y se perdía.
    if (pies) {
      await sincronizarFotos(db, id, (prop.fotos as string[]) ?? [], pies)
      return NextResponse.json({ ok: true, pies: true })
    }
    return NextResponse.json({ ok: true, sinCambios: true })
  }

  const cambios = { ...datos, completitud: calcularCompletitud({ ...prop, ...datos }) }

  // Columnas que todavía no existen (migración 07 sin aplicar): se quitan
  // TODAS y se guarda el resto. Antes sólo se quitaba una, y el paso del mapa
  // —que manda `lat` y `lng`— daba 500.
  // Sólo se escribe si el estado de publicación SIGUE siendo el que se leyó (la regla de bloqueo de arriba se decidió con
  // ese estado): si otra persona la envió a revisión o la publicó entretanto, no se pisa.
  let escritas = -1
  const r = await escribirTolerante(async (f) => {
    const x = await db.from('propiedades').update(f).eq('id', id).eq('estado_pub', prop.estado_pub).select('id')
    if (!x.error) escritas = x.data?.length ?? 0
    return x
  }, cambios)
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 })
  if (escritas === 0) {
    return NextResponse.json(
      { error: 'Esta propiedad cambió de estado mientras la editabas. Recarga la página y vuelve a intentarlo.', codigo: 'conflicto' },
      { status: 409 },
    )
  }

  // La tabla `fotos` se rehace a partir del array, que es el que manda. Si
  // falla, el guardado NO se pierde: los pies son un extra, las fotos ya están.
  const fotosNuevas = Array.isArray(datos.fotos) ? (datos.fotos as string[]) : null
  if (fotosNuevas || pies) {
    await sincronizarFotos(db, id, fotosNuevas ?? (prop.fotos as string[] ?? []), pies)
  }

  // Si está publicada y aún no tiene nombre público, se le pone ahora: hubo
  // propiedades publicadas por caminos que no pasaban por /estado (V-1.1.84).
  await nombrarSiEstaPublicada(db, id)

  // El listado sirve una copia de hasta cinco minutos: sin esto, lo editado
  // no se veía ahí aunque la ficha ya lo mostrara.
  refrescarCatalogo()

  const detalle = prop.estado_pub === 'publicada' || 'estatus' in datos || 'gestion' in datos
  const dif = diferenciasDeContenido(prop as Record<string, unknown>, datos)
  await registrar({
    actor: perfil,
    accion: 'propiedad.editar',
    entidad: 'propiedades',
    entidadId: id,
    // Lo YA publicado (se ve en el sitio en cuanto se guarda, sin revisión previa si hay `editar_publicadas`) y la situación comercial
    // se quieren poder reconstruir: queda qué cambió, antes → después. Un borrador que se autoguarda no lleva detalle (serían miles de filas).
    ...(detalle ? { antes: dif.antes } : {}),
    despues: { campos: Object.keys(datos), sinColumna: r.omitidas.length ? r.omitidas : undefined, ...(detalle ? dif.despues : {}) },
  })

  return NextResponse.json(
    r.omitidas.length
      ? { ok: true, omitidas: r.omitidas, warning: `No se guardó ${r.omitidas.join(', ')}: falta aplicar la migración 07.` }
      : { ok: true },
  )
}

/** DELETE /api/admin/propiedades/[id] — borrado definitivo. Sólo admin. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await exigir(req, 'propiedad.gestionar_todas')
  if (auth.error) return auth.error

  const { id } = await params
  const db = supabaseAdmin()

  const { data: antes } = await db.from('propiedades').select('*').eq('id', id).maybeSingle()

  const { error } = await db.from('propiedades').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  refrescarCatalogo()

  await registrar({
    actor: auth.perfil,
    accion: 'propiedad.borrar',
    entidad: 'propiedades',
    entidadId: id,
    antes: antes ? { titulo: antes.titulo, estado_pub: antes.estado_pub } : null,
  })

  return NextResponse.json({ ok: true })
}
