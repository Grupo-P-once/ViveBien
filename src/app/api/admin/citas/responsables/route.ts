import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { atiendeCitas } from '@/lib/acceso/capacidades'
import { cuentasDeCitas, titularAutomaticoDelEquipo } from '@/lib/citas/asesores'

/**
 * Quién atiende las citas de cada propiedad (ADR-0014 §3; decisión del dueño, 9-nov-2026): el responsable asignado por un admin → el dueño si atiende citas → el responsable del equipo.
 *
 *   GET — el estado actual: responsable del equipo, quién puede ser responsable y, por propiedad, el asignado, el dueño y el que de hecho atenderá (con su origen).
 *   PUT — asigna o quita: `{ ambito: 'propiedad' | 'equipo', propiedadId?, antes, a, motivo }`. `antes` es lo que la pantalla vio: si otra persona lo cambió, 409.
 *
 * Solo admin / super admin (`citas.ver_todas`). Quién PUEDE ser responsable (que atienda citas) se comprueba aquí, en el servidor; el cambio y la bitácora van en UNA transacción
 * (migración 76: `citas_asignar_responsable_propiedad` / `_equipo`). Sin responsable del equipo, atiende el titular automático (admin activo más antiguo; Super Admin solo si no hay admins; ADR-0014 decisión 7). Falla cerrado: sin la migración, 503 y no se cambia nada.
 */

export const dynamic = 'force-dynamic'

const RE_UID = /^[A-Za-z0-9_-]{3,200}$/
const RE_PROPIEDAD = /^[A-Za-z0-9_-]{1,120}$/
const MOTIVO_MIN = 10
const MOTIVO_MAX = 500

type Origen = 'asignado' | 'dueno' | 'equipo' | 'automatico'

export async function GET(req: Request) {
  const auth = await exigir(req, 'citas.ver_todas')
  if (auth.error) return auth.error

  try {
    const db = supabaseAdmin()
    const [props, cfg, usuarios] = await Promise.all([
      db.from('propiedades').select('id, titulo, owner_id, responsable_citas_uid, estado_pub').order('titulo', { ascending: true }).limit(400),
      db.from('configuracion').select('valor').eq('clave', 'citas').maybeSingle(),
      db.from('usuarios').select('uid, nombre, rol').eq('estado', 'activo').in('rol', ['admin', 'super_admin', 'publicador']).limit(500),
    ])
    if (props.error || usuarios.error) return NextResponse.json({ error: 'No se pudo leer la información.' }, { status: 500 })

    const filas = (props.data ?? []) as Array<{ id: string; titulo: string | null; owner_id: string | null; responsable_citas_uid: string | null; estado_pub: string | null }>
    const personas = (usuarios.data ?? []) as Array<{ uid: string; nombre: string | null; rol: string }>
    const equipoBruto = (cfg.data as { valor?: { responsable_equipo_uid?: unknown } } | null)?.valor?.responsable_equipo_uid
    const equipoUid = typeof equipoBruto === 'string' && RE_UID.test(equipoBruto) ? equipoBruto : null

    // Las cuentas con sus permisos ya calculados (lo que decide si atienden citas): las de la lista y las de todo uid que aparezca en una propiedad.
    const uids = [...new Set([...personas.map((p) => p.uid), ...filas.flatMap((f) => [f.owner_id, f.responsable_citas_uid]), equipoUid].filter((x): x is string => !!x))]
    const cuentas = await cuentasDeCitas(db, uids)
    const titularAuto = await titularAutomaticoDelEquipo(db)   // el admin activo más antiguo (Super Admin solo si no hay admins)
    const nombre = new Map(personas.map((p) => [p.uid, p.nombre]))
    const atiende = (uid: string | null | undefined) => { const c = uid ? cuentas.get(uid) : undefined; return !!c && atiendeCitas(c) }

    const candidatos = personas
      .filter((p) => atiende(p.uid))
      .map((p) => ({ uid: p.uid, nombre: p.nombre, rol: p.rol }))
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'))

    // El que de hecho atenderá: mismo orden que `responsableDeCitas` del servicio (asignado → dueño → equipo), cada uno comprobado contra su cuenta.
    const propiedades = filas.map((f) => {
      const orden: Array<[Origen, string | null]> = [['asignado', f.responsable_citas_uid], ['dueno', f.owner_id], ['equipo', equipoUid]]
      const elegido = orden.find(([, uid]) => uid && atiende(uid)) ?? (titularAuto ? (['automatico', titularAuto] as [Origen, string]) : undefined)
      return {
        id: f.id,
        titulo: f.titulo,
        publicada: f.estado_pub === 'publicada',
        responsableUid: f.responsable_citas_uid,
        duenoUid: f.owner_id,
        duenoNombre: f.owner_id ? nombre.get(f.owner_id) ?? null : null,
        efectivo: elegido ? { uid: elegido[1] as string, nombre: nombre.get(elegido[1] as string) ?? null, origen: elegido[0] } : null,
      }
    })

    return NextResponse.json({
      equipo: equipoUid ? { uid: equipoUid, nombre: nombre.get(equipoUid) ?? null, atiende: atiende(equipoUid) } : null,
      titularAutomatico: titularAuto ? { uid: titularAuto, nombre: nombre.get(titularAuto) ?? null } : null,
      candidatos,
      propiedades,
    })
  } catch (e) {
    console.error('[citas] no se pudieron leer los responsables', e)
    return NextResponse.json({ error: 'No se pudo leer la información.' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const auth = await exigir(req, 'citas.ver_todas')
  if (auth.error) return auth.error
  const { perfil } = auth

  const frenado = await frenarAsync(`citas-resp:${perfil.uid}`, TOPES.citas)
  if (frenado) return frenado

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ambito = cuerpo.ambito
  if (ambito !== 'propiedad' && ambito !== 'equipo') return NextResponse.json({ error: 'Indica si es una propiedad o el equipo.' }, { status: 400 })
  const propiedadId = typeof cuerpo.propiedadId === 'string' ? cuerpo.propiedadId : null
  if (ambito === 'propiedad' && (!propiedadId || !RE_PROPIEDAD.test(propiedadId))) return NextResponse.json({ error: 'Elige la propiedad.' }, { status: 400 })

  // `null` = sin responsable asignado. Cualquier otra cosa tiene que parecerse a un uid.
  const uidONulo = (v: unknown): { ok: true; valor: string | null } | { ok: false } =>
    v === null ? { ok: true, valor: null } : typeof v === 'string' && RE_UID.test(v) ? { ok: true, valor: v } : { ok: false }
  const antes = uidONulo(cuerpo.antes)
  const a = uidONulo(cuerpo.a)
  if (!antes.ok || !a.ok) return NextResponse.json({ error: 'La asignación no es válida. Recarga la página e inténtalo otra vez.' }, { status: 400 })
  if (antes.valor === a.valor) return NextResponse.json({ error: 'No hay nada que cambiar.' }, { status: 400 })

  const motivo = typeof cuerpo.motivo === 'string' ? cuerpo.motivo.trim() : ''
  if (motivo.length < MOTIVO_MIN) return NextResponse.json({ error: `Escribe el motivo (al menos ${MOTIVO_MIN} caracteres).` }, { status: 400 })
  if (motivo.length > MOTIVO_MAX) return NextResponse.json({ error: `El motivo no puede pasar de ${MOTIVO_MAX} caracteres.` }, { status: 400 })

  try {
    const db = supabaseAdmin()

    // Quién PUEDE ser responsable lo decide el servidor, contra la cuenta real: tiene que atender citas (el equipo, o un publicador con `recibir_citas`).
    if (a.valor) {
      const cuentas = await cuentasDeCitas(db, [a.valor])
      const c = cuentas.get(a.valor)
      if (!c || !atiendeCitas(c)) return NextResponse.json({ error: 'Esa persona no atiende citas. Elige a alguien del equipo o a un asociado con el permiso de recibir citas.' }, { status: 400 })
    }

    const audit = {
      actor_uid: perfil.uid,
      actor_email: perfil.email,
      actor_rol: perfil.rol,
      accion: ambito === 'propiedad' ? 'citas.responsable_propiedad' : 'citas.responsable_equipo',
      antes: { responsable: antes.valor },
      despues: { responsable: a.valor, motivo },
    }
    const { data: res, error: errFn } = ambito === 'propiedad'
      ? await db.rpc('citas_asignar_responsable_propiedad', { p_propiedad: propiedadId, p_antes: antes.valor, p_a: a.valor, p_audit: audit })
      : await db.rpc('citas_asignar_responsable_equipo', { p_antes: antes.valor, p_a: a.valor, p_audit: audit })
    if (errFn) {
      const faltaFuncion = errFn.code === 'PGRST202' || errFn.code === '42883' || /could not find the function|does not exist/i.test(errFn.message ?? '')
      return NextResponse.json(
        { error: faltaFuncion ? 'Falta aplicar la migración 76 (asignar al responsable de citas).' : 'No se pudo guardar el cambio ni registrarlo en la bitácora, así que no se hizo nada. Inténtalo otra vez.' },
        { status: 503 },
      )
    }
    const resultado = (res as { resultado?: string } | null)?.resultado
    if (resultado === 'conflicto') return NextResponse.json({ error: 'Otra persona cambió esta asignación mientras la mirabas. Recarga la página para ver cómo quedó.', codigo: 'conflicto' }, { status: 409 })
    if (resultado === 'no_existe') return NextResponse.json({ error: 'No encontramos esa propiedad.' }, { status: 404 })
    if (resultado === 'responsable_invalido') return NextResponse.json({ error: 'Esa cuenta no existe o no está activa.' }, { status: 400 })
    if (resultado !== 'ok') return NextResponse.json({ error: 'No se pudo guardar el cambio.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[citas] no se pudo asignar al responsable', e)
    return NextResponse.json({ error: 'No se pudo guardar el cambio. Inténtalo otra vez.' }, { status: 500 })
  }
}
