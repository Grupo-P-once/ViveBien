import { NextResponse } from 'next/server'
import { supabaseAdmin, exigir, registrarIntentoDenegado } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import { MAXIMO_BORRADORES_POR_CUENTA, calcularCompletitud, camposProtegidosEn, paraPublicador, quitarCamposReservados } from '@/lib/publicacion'
import { sanearContenido } from '@/lib/sanear-propiedad'
import { frenarAsync, TOPES } from '@/lib/limites'
import { despuesDeResponder } from '@/lib/correo/transaccionales'
import { avisarPropiedad } from '@/lib/correo/eventos-cuenta'
import type { DbCorreo } from '@/lib/correo/enviar'
import { escribirTolerante } from '@/lib/columnas'
import { esRelleno } from '@/lib/slug'
import { puede } from '@/lib/acceso/permisos'
import { portalCerradoParaEscribir } from '@/lib/portal/exigir-portal'
import { COLUMNAS_RESUMEN, MAXIMO_EN_MENU, resumenParaMenu } from '@/lib/publicador/lista'

/** GET /api/publicador/propiedades — sólo las del publicador de la sesión. */
export async function GET(req: Request) {
  const auth = await exigir(req, 'propiedad.gestionar_propias')
  if (auth.error) return auth.error
  const { perfil } = auth

  const db = supabaseAdmin()

  // `?resumen=1` (menú lateral, R8): SOLO las propias, SIEMPRE — también para un administrador, que aquí no pide el inventario entero
  // sino «lo que yo subí». El filtro por dueño lo pone el servidor con la sesión; nada del navegador decide de quién son. Columnas
  // mínimas (sin contacto, sin dueño, sin notas del revisor) y tope de filas; el total real viaja aparte para «Ver todas».
  if (new URL(req.url).searchParams.get('resumen') === '1') {
    const r = await db.from('propiedades').select(COLUMNAS_RESUMEN, { count: 'exact' })
      .eq('owner_id', perfil.uid).order('created_at', { ascending: false }).limit(MAXIMO_EN_MENU)
    if (r.error) return NextResponse.json({ error: 'No se pudieron cargar tus propiedades.' }, { status: 500 })
    const propiedades = resumenParaMenu(r.data)
    return NextResponse.json({ propiedades, total: typeof r.count === 'number' ? r.count : propiedades.length })
  }

  let q = db.from('propiedades').select('*').order('created_at', { ascending: false })

  // Un admin ve el inventario entero; un publicador, sólo lo suyo.
  if (!puede(perfil, 'propiedad.gestionar_todas')) q = q.eq('owner_id', perfil.uid)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Sin el correo del revisor ni el contacto interno (ADR-0006): sólo la casa los ve.
  const filas = (data ?? []) as Record<string, unknown>[]
  // `es_mia`: lo calcula el servidor (sin exponer el uid de nadie). Un admin ve el inventario entero y necesita distinguir lo que creó
  // él de lo de otras cuentas; para un publicador siempre es verdadero porque solo recibe lo suyo.
  const conDueno = filas.map((f) => ({ ...f, es_mia: Boolean(f.owner_id && f.owner_id === perfil.uid) }))
  return NextResponse.json(puede(perfil, 'propiedad.moderar') ? conDueno : conDueno.map(paraPublicador))
}

/**
 * POST /api/publicador/propiedades — crea un borrador.
 *
 * Nace siempre en 'borrador'. El dueño y el estado los pone el servidor:
 * si vinieran del cuerpo, cualquiera publicaría a nombre de otro.
 */
export async function POST(req: Request) {
  const auth = await exigir(req, 'propiedad.gestionar_propias')
  if (auth.error) return auth.error
  const { perfil } = auth
  const cerrado = await portalCerradoParaEscribir(perfil)
  if (cerrado) return cerrado

  // Escrituras del publicador: el autoguardado dispara seguido, un script más (el tope existía y no se aplicaba en ninguna ruta).
  const frenado = await frenarAsync(`edicion:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado

  const body = await req.json().catch(() => ({}))
  const moderador = puede(perfil, 'propiedad.moderar')
  const protegidos = camposProtegidosEn(body as Record<string, unknown>)
  if (protegidos.length && !moderador) {
    await registrarIntentoDenegado(perfil, req, `propiedad.campos:${protegidos.join(',')}`)
  }
  // LISTA BLANCA de contenido y valores validados en el servidor (no sólo en el navegador): ver lib/sanear-propiedad.ts.
  const saneo = sanearContenido(quitarCamposReservados(body as Record<string, unknown>), {
    moderador,
    actuales: null,
    nube: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  })
  if (saneo.errores.length) {
    return NextResponse.json({ error: `Hay datos que no son válidos: ${saneo.errores.join('; ')}.`, campos: saneo.errores }, { status: 400 })
  }
  if (saneo.descartados.length && !moderador) {
    await registrarIntentoDenegado(perfil, req, `propiedad.campos_no_permitidos:${saneo.descartados.slice(0, 8).join(',')}`)
  }
  const datos = saneo.datos

  // Tope de borradores abiertos por cuenta (quien modera no lo tiene).
  if (!moderador) {
    const { count } = await supabaseAdmin()
      .from('propiedades')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', perfil.uid)
      .in('estado_pub', ['borrador', 'cambios_solicitados', 'rechazada'])
    if ((count ?? 0) >= MAXIMO_BORRADORES_POR_CUENTA) {
      return NextResponse.json(
        { error: `Ya tienes ${MAXIMO_BORRADORES_POR_CUENTA} borradores abiertos. Termina o envía a revisión alguno antes de crear otro.` },
        { status: 409 },
      )
    }
  }

  /* ── De aquí salían las URLs «propiedad-sin-titulo» ──
     Antes esta ruta EXIGÍA un título y convertía ese título en el id, que es
     también la URL. Como al pulsar «Nueva propiedad» todavía no hay nada que
     poner, el panel mandaba 'Propiedad sin título' para pasar la exigencia…
     y ese relleno quedaba sellado como dirección pública para siempre. Una
     nave industrial publicada, con ocho fotos, vive hoy en
     `/propiedades/propiedad-sin-titulo-d52n`.

     La exigencia además ya no tenía sentido: la migración 09 quitó el NOT NULL
     de `titulo` precisamente porque un borrador puede estar incompleto.

     Ahora el id es una clave interna y nada más: no intenta parecerse al
     anuncio. El nombre público se calcula al publicar (columna `slug`,
     migración 10), cuando por fin se sabe qué es la propiedad. */
  const tituloRecibido = typeof datos.titulo === 'string' ? datos.titulo.trim() : ''
  const titulo = esRelleno(tituloRecibido) ? null : tituloRecibido

  const fila = {
    ...datos,
    // Un relleno no se guarda como si fuera un título: se guarda que no hay.
    // Así el asistente puede decir «falta el título» en vez de dar por bueno
    // 'Propiedad sin título' y sumarle 15 puntos de completitud.
    titulo,
    // Clave técnica: un UUID, aparte del folio (identificador público permanente) y del slug (la dirección).
    // Antes era `borrador-<hora>`: predecible y enumerable.
    id: crypto.randomUUID(),
    owner_id: perfil.uid,
    estado_pub: 'borrador',
    estatus: 'disponible',
    completitud: calcularCompletitud({ ...datos, titulo }),
  }

  const db = supabaseAdmin()
  const r = await escribirTolerante((f) => db.from('propiedades').insert(f), fila)
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 })

  // El conteo de arriba y este insert no son una sola operación: peticiones PARALELAS podían pasar todas con 29 y dejar 35. Se vuelve
  // a contar con la fila ya dentro; si se pasó del tope, esta alta se revierte (es un borrador recién creado por esta misma cuenta).
  if (!moderador) {
    const { count: despues } = await db
      .from('propiedades')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', perfil.uid)
      .in('estado_pub', ['borrador', 'cambios_solicitados', 'rechazada'])
    if ((despues ?? 0) > MAXIMO_BORRADORES_POR_CUENTA) {
      const { error: errReversa } = await db.from('propiedades').delete().eq('id', fila.id).eq('owner_id', perfil.uid).eq('estado_pub', 'borrador')
      if (errReversa) {
        // No se pudo quitar el sobrante: se dice (no se finge un 409 limpio) y queda en el registro del servidor.
        console.error('[publicador] no se pudo revertir el borrador sobrante:', errReversa.message)
        return NextResponse.json({ error: 'No se pudo completar el alta. Inténtalo otra vez en un momento.' }, { status: 503 })
      }
      return NextResponse.json(
        { error: `Ya tienes ${MAXIMO_BORRADORES_POR_CUENTA} borradores abiertos. Termina o envía a revisión alguno antes de crear otro.` },
        { status: 409 },
      )
    }
  }

  await registrar({
    actor: perfil,
    accion: 'propiedad.crear',
    entidad: 'propiedades',
    entidadId: fila.id,
    despues: { estado_pub: 'borrador', titulo: fila.titulo },
  })

  // Correo «Recibimos tu propiedad» (borrador guardado). Después de responder, solo al correo verificado de la cuenta dueña, una vez por propiedad y sin tumbar el alta.
  // Se relee la fila: el folio lo genera la base, no está en lo que se insertó.
  despuesDeResponder(async () => {
    const { data } = await db.from('propiedades').select('*').eq('id', fila.id).maybeSingle()
    if (data) await avisarPropiedad(db as unknown as DbCorreo, { evento: 'recibida', prop: data as Record<string, unknown>, version: '1' })
  })

  return NextResponse.json({ ok: true, id: fila.id })
}
