import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin, type PerfilUsuario } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { puede } from '@/lib/acceso/permisos'
import { atiendeCitas } from '@/lib/acceso/capacidades'
import { agendaDelAsesor } from '@/lib/citas/servicio'
import { cuentasDeCitas } from '@/lib/citas/asesores'
import { AJUSTES_POR_DEFECTO, HORARIO_POR_DEFECTO } from '@/lib/citas/ajustes'
import { paraLaBase, validarAgenda } from '@/lib/citas/agenda'

/**
 * La disponibilidad de un responsable de citas (D-11: se carga la REAL, no se inventa).
 *
 *  GET /api/citas/ajustes[?uid=…]  → su horario semanal, sus ajustes y sus bloqueos vigentes (y, si es admin, quiénes atienden citas).
 *  PUT /api/citas/ajustes          → { uid?, horario, ajustes, bloqueos } lo reemplaza TODO en una sola transacción auditada.
 *
 * Quién puede: cada responsable (el equipo, o un publicador con `recibir_citas`) edita SU agenda; un admin o super admin, la de
 * cualquiera que atienda citas. Un publicador sin `recibir_citas` no tiene agenda. La validación vive en `lib/citas/agenda.ts`
 * y la escritura en `citas_guardar_agenda` (migración 73): cambio + auditoría juntos o nada.
 */
export const dynamic = 'force-dynamic'

const RE_UID = /^[A-Za-z0-9_-]{3,200}$/

type Destino = { ok: true; uid: string } | { ok: false; status: number; error: string }

/** ¿De quién es la agenda que se quiere ver o editar, y puede esta persona? */
async function destinoDe(perfil: PerfilUsuario, pedido: string | null | undefined): Promise<Destino> {
  const uid = pedido && RE_UID.test(pedido) ? pedido : perfil.uid
  if (pedido && !RE_UID.test(pedido)) return { ok: false, status: 400, error: 'Esa cuenta no es válida.' }
  if (uid === perfil.uid) {
    return atiendeCitas(perfil) ? { ok: true, uid } : { ok: false, status: 403, error: 'Tu cuenta no recibe citas, así que no tiene agenda.' }
  }
  if (!puede(perfil, 'citas.ver_todas')) return { ok: false, status: 403, error: 'Solo puedes ver y editar tu propia agenda.' }
  const cuenta = (await cuentasDeCitas(supabaseAdmin(), [uid])).get(uid)
  if (!cuenta || !atiendeCitas(cuenta)) return { ok: false, status: 409, error: 'Esa cuenta no atiende citas.' }
  return { ok: true, uid }
}

export async function GET(req: Request) {
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const { perfil } = auth
  const d = await destinoDe(perfil, new URL(req.url).searchParams.get('uid'))
  if (!d.ok) return NextResponse.json({ error: d.error }, { status: d.status })

  try {
    const db = supabaseAdmin()
    const [agenda, filas, bloqueos, persona] = await Promise.all([
      agendaDelAsesor(db, d.uid),
      db.from('disponibilidad_asesores').select('id', { count: 'exact', head: true }).eq('asesor_uid', d.uid),
      db.from('bloqueos_asesores').select('desde, hasta, motivo').eq('asesor_uid', d.uid).gt('hasta', new Date().toISOString()).order('desde', { ascending: true }).limit(100),
      db.from('usuarios').select('nombre').eq('uid', d.uid).maybeSingle(),
    ])
    if (bloqueos.error) throw bloqueos.error

    // Para el admin: quiénes atienden citas (para elegir de quién es la agenda que mira).
    let responsables: Array<{ uid: string; nombre: string | null; rol: string }> | undefined
    if (puede(perfil, 'citas.ver_todas')) {
      const { data } = await db.from('usuarios').select('uid, nombre, rol').in('rol', ['admin', 'super_admin', 'publicador']).limit(300)
      const filasU = (data ?? []) as Array<{ uid: string; nombre: string | null; rol: string }>
      const cuentas = await cuentasDeCitas(db, filasU.map((u) => u.uid))
      responsables = filasU.filter((u) => { const c = cuentas.get(u.uid); return !!c && atiendeCitas(c) })
    }

    return NextResponse.json({
      uid: d.uid,
      nombre: (persona.data as { nombre?: string | null } | null)?.nombre ?? null,
      // `false` = todavía no cargó la suya: se le ofrece el horario por defecto, que debe revisar y guardar.
      personalizado: (filas.count ?? 0) > 0,
      horario: agenda.horario,
      ajustes: agenda.ajustes,
      bloqueos: bloqueos.data ?? [],
      porDefecto: { horario: HORARIO_POR_DEFECTO, ajustes: AJUSTES_POR_DEFECTO },
      ...(responsables ? { responsables } : {}),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[citas] no se pudo leer la agenda', e instanceof Error ? e.message.slice(0, 120) : 'error')
    return NextResponse.json({ error: 'No se pudo leer la agenda.' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const { perfil } = auth

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!cuerpo || typeof cuerpo !== 'object') return NextResponse.json({ error: 'Los datos de la agenda no son válidos.' }, { status: 400 })
  const d = await destinoDe(perfil, typeof cuerpo.uid === 'string' ? cuerpo.uid : null)
  if (!d.ok) return NextResponse.json({ error: d.error }, { status: d.status })

  const frenado = await frenarAsync(`citas-agenda:${perfil.uid}`, TOPES.citas)
  if (frenado) return frenado

  const v = validarAgenda(cuerpo)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const b = paraLaBase(v.valor)

  const r = await supabaseAdmin().rpc('citas_guardar_agenda', {
    p_actor_uid: perfil.uid,
    p_actor_email: perfil.email ?? null,
    p_actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol,
    p_uid: d.uid,
    p_horario: b.horario,
    p_ajustes: b.ajustes,
    p_bloqueos: b.bloqueos,
  })
  if (r.error) {
    if (r.error.message === 'no_encontrado') return NextResponse.json({ error: 'No encontramos esa cuenta.' }, { status: 404 })
    // La función puede no existir todavía (migración 73 sin aplicar): falla cerrado, sin inventar que se guardó.
    console.error('[citas] no se pudo guardar la agenda', r.error.code ?? '')
    return NextResponse.json({ error: 'No se pudo guardar la agenda. Inténtalo otra vez.' }, { status: r.error.code === '42883' ? 503 : 500 })
  }
  return NextResponse.json({ ok: true })
}
