import { NextResponse } from 'next/server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { exigir, supabaseAdmin } from '@/lib/auth-server'

/**
 * Favoritos del cliente.
 *
 * Antes vivían en localStorage: se perdían al cambiar de dispositivo o al
 * limpiar el navegador. Ahora van a la base, atados al uid del token —
 * nunca a un identificador que venga en la petición.
 *
 * V-1.1.82 (P3-03): todo pasa por `exigir('cuenta.propia')`: sin sesión 401;
 * cuenta suspendida 403 (y el intento de escribir queda en la bitácora).
 */

/** GET /api/favoritos — ids de las propiedades guardadas. */
export async function GET(req: Request) {
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const uid = auth.perfil.uid

  const { data, error } = await supabaseAdmin()
    .from('favoritos')
    .select('propiedad_id, creado_en')
    .eq('uid', uid)
    .order('creado_en', { ascending: false })

  if (error) return NextResponse.json({ error: 'No pudimos cargar tus guardadas.' }, { status: 500 })
  return NextResponse.json((data ?? []).map(f => f.propiedad_id))
}

/**
 * POST /api/favoritos — fija el estado de UNA propiedad. Body:
 * `{ propiedadId, guardado }`, con `guardado` booleano (el estado DESEADO).
 *
 * D-75 (corrección de ID-05 de D-74): la operación es **idempotente**. Antes
 * alternaba según lo que hubiera en la base, así que un doble clic o dos
 * pestañas a la vez producían un 500 falso («No pudimos guardarla») o el
 * estado contrario al que se veía. Ahora pedir «guardado: true» dos veces es
 * lo mismo que pedirlo una (upsert que ignora el duplicado) y quitar algo que
 * ya no está también responde bien.
 *
 * Sin `guardado` (clientes con la versión anterior en caché) se conserva el
 * comportamiento de alternar, pero ya sin la carrera: insertar es un upsert.
 */
const ID_VALIDO = /^[A-Za-z0-9_.-]{1,120}$/

export async function POST(req: Request) {
  // Tope por origen. Sin esto, cualquiera con la consola abierta llena
  // esta tabla en un minuto. Ver lib/limites.ts para lo que cubre y lo
  // que no.
  const frenado = await frenarAsync(`favoritos:${origenDe(req)}`, TOPES.favoritos)
  if (frenado) return frenado

  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const uid = auth.perfil.uid

  const body = await req.json().catch(() => ({}))
  const propiedadId = typeof body.propiedadId === 'string' ? body.propiedadId.trim() : ''
  if (!propiedadId) return NextResponse.json({ error: 'Falta la propiedad.' }, { status: 400 })
  if (!ID_VALIDO.test(propiedadId)) return NextResponse.json({ error: 'La propiedad no es válida.' }, { status: 400 })
  if (body.guardado !== undefined && typeof body.guardado !== 'boolean') {
    return NextResponse.json({ error: 'El estado pedido no es válido.' }, { status: 400 })
  }

  const db = supabaseAdmin()

  let quiere: boolean
  if (typeof body.guardado === 'boolean') {
    quiere = body.guardado
  } else {
    const { data: existente, error: errLectura } = await db
      .from('favoritos')
      .select('propiedad_id')
      .eq('uid', uid)
      .eq('propiedad_id', propiedadId)
      .maybeSingle()
    if (errLectura) return NextResponse.json({ error: 'No pudimos guardarla.' }, { status: 500 })
    quiere = !existente
  }

  if (!quiere) {
    // Quitar siempre se permite, aunque la propiedad ya no exista o no esté
    // publicada: así una guardada huérfana se puede limpiar.
    const { error } = await db
      .from('favoritos')
      .delete()
      .eq('uid', uid)
      .eq('propiedad_id', propiedadId)
    if (error) return NextResponse.json({ error: 'No pudimos quitarla.' }, { status: 500 })
    return NextResponse.json({ ok: true, guardado: false })
  }

  // Guardar sólo lo que el público puede ver: no se acumulan identificadores
  // inventados ni de borradores ajenos.
  const { data: prop, error: errProp } = await db
    .from('propiedades')
    .select('id, estado_pub')
    .eq('id', propiedadId)
    .maybeSingle()
  if (errProp) return NextResponse.json({ error: 'No pudimos guardarla.' }, { status: 500 })
  if (!prop || (prop.estado_pub && prop.estado_pub !== 'publicada')) {
    return NextResponse.json({ error: 'Esa propiedad no está disponible.' }, { status: 404 })
  }

  const { error } = await db
    .from('favoritos')
    .upsert({ uid, propiedad_id: propiedadId }, { onConflict: 'uid,propiedad_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: 'No pudimos guardarla.' }, { status: 500 })
  return NextResponse.json({ ok: true, guardado: true })
}
