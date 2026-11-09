import { after, NextResponse } from 'next/server'
import { exigir } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { createAppointment, listAppointments, type VistaCalendario } from '@/lib/citas/servicio'
import { avisarCambio } from '@/lib/citas/enviar'
import { puede } from '@/lib/acceso/permisos'
import { atiendeCitas } from '@/lib/acceso/capacidades'
import { flagEncendido } from '@/lib/config/flags-servidor'

/**
 * GET  /api/citas — las citas del rango que el calendario tiene a la vista.
 * POST /api/citas — agendar una visita.
 *
 * Sólo con sesión: sólo agenda quien tiene cuenta creada (lo comprueba el
 * servicio contra `usuarios`). Ver docs/appointments-architecture.md.
 */

export const dynamic = 'force-dynamic'

const VISTAS: VistaCalendario[] = ['cliente', 'asesor', 'propietario', 'admin']
const DIAS_MAXIMOS = 100
const RE_CLAVE = /^[A-Za-z0-9_-]{8,100}$/
const RE_PROPIEDAD = /^[A-Za-z0-9_-]{1,120}$/
const RE_UID = /^[A-Za-z0-9_-]{3,200}$/
const ESTADOS_VALIDOS = ['REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED', 'NO_SHOW']

export async function GET(req: Request) {
  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const { perfil } = auth

  const url = new URL(req.url)
  const desde = new Date(url.searchParams.get('desde') ?? '')
  const hasta = new Date(url.searchParams.get('hasta') ?? '')
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || hasta <= desde) {
    return NextResponse.json({ error: 'Indica el rango de fechas.' }, { status: 400 })
  }
  if (hasta.getTime() - desde.getTime() > DIAS_MAXIMOS * 86_400_000) {
    return NextResponse.json({ error: `El rango no puede pasar de ${DIAS_MAXIMOS} días.` }, { status: 400 })
  }

  const pedida = url.searchParams.get('vista') as VistaCalendario | null
  const vista: VistaCalendario = pedida && VISTAS.includes(pedida) ? pedida : puede(perfil, 'citas.ver_todas') ? 'admin' : 'cliente'
  if (vista === 'admin' && !puede(perfil, 'citas.ver_todas')) {
    return NextResponse.json({ error: 'Tu cuenta no tiene permisos para esta vista.' }, { status: 403 })
  }

  // «Citas recibidas»: sólo quien atiende citas (el equipo, o un publicador con
  // `recibir_citas`). «Mis citas» (vista cliente) es de cualquier cuenta.
  if (vista === 'asesor' && !atiendeCitas(perfil)) {
    return NextResponse.json({ error: 'Tu cuenta no recibe citas.' }, { status: 403 })
  }
  // «Mis propiedades» (D-1): solo un publicador, dueño de propiedades; ve las citas que otra persona atiende, sin acciones.
  if (vista === 'propietario' && perfil.rol !== 'publicador') {
    return NextResponse.json({ error: 'Tu cuenta no tiene propiedades con citas.' }, { status: 403 })
  }

  // Solo un entero positivo acota la lista; `-5` o `2.5` llegarían a `.limit()` y la base los rechaza (un 500 por un parámetro mal escrito). El tope de 500 lo pone el servicio.
  const limitePedido = Number(url.searchParams.get('limite') ?? '')
  const limite = Number.isInteger(limitePedido) && limitePedido > 0 ? limitePedido : undefined

  // Filtros (todos opcionales y validados; la vista ya limita QUÉ citas puede ver cada rol, esto solo las acota).
  const estados = (url.searchParams.get('estados') ?? '').split(',').map((s) => s.trim()).filter((s) => ESTADOS_VALIDOS.includes(s)).slice(0, 10)
  const propiedadPedida = url.searchParams.get('propiedad')
  const asesorPedido = url.searchParams.get('asesor')
  const tipoCita = url.searchParams.get('tipoCita')

  try {
    const citas = await listAppointments({
      perfil,
      vista,
      desde,
      hasta,
      asesorUid: vista === 'admin' && asesorPedido && RE_UID.test(asesorPedido) ? asesorPedido : null,
      tipo: url.searchParams.get('tipo'),
      estados: estados.length ? estados : null,
      propiedadId: propiedadPedida && RE_PROPIEDAD.test(propiedadPedida) ? propiedadPedida : null,
      tipoCita: tipoCita === 'solicitada' || tipoCita === 'propia' ? tipoCita : null,
      incluirCanceladas: url.searchParams.get('canceladas') === '1',
      limite,
    })
    return NextResponse.json({ citas, vista })
  } catch (e) {
    console.error('[citas] no se pudieron leer', e)
    return NextResponse.json({ error: 'No se pudieron leer las visitas.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  // V-1.1.82 (P3-01): con `citasEnLinea` apagado no se crea ninguna visita, y
  // por lo tanto no sale ningún correo con enlaces a pantallas que aún no
  // existen. Va primero: ni siquiera se lee la sesión.
  if (!(await flagEncendido('citasEnLinea'))) {
    return NextResponse.json(
      { error: 'Todavía no se pueden agendar visitas en línea. Escríbenos por WhatsApp y te ayudamos.', citasEnLinea: false },
      { status: 409 },
    )
  }

  const auth = await exigir(req, 'cuenta.propia')
  if (auth.error) return auth.error
  const { perfil } = auth

  const frenado = await frenarAsync(`citas:${perfil.uid}`, TOPES.citas)
  if (frenado) return frenado

  // La clave la genera el formulario al abrirse: un doble clic o un reintento
  // de la red devuelven la misma cita en vez de crear otra.
  const clave = req.headers.get('idempotency-key') ?? ''
  if (!RE_CLAVE.test(clave)) {
    return NextResponse.json({ error: 'Falta la clave de la solicitud. Recarga la página e inténtalo otra vez.' }, { status: 400 })
  }

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null)

  const propiedadId = texto(cuerpo.propiedadId, 120)
  const inicio = texto(cuerpo.inicio, 40)
  if (!propiedadId || !inicio) {
    return NextResponse.json({ error: 'Elige la propiedad y el horario.' }, { status: 400 })
  }

  try {
    const r = await createAppointment(perfil, {
      propiedadId,
      inicio,
      clienteUid: texto(cuerpo.clienteUid, 128),
      nombre: texto(cuerpo.nombre, 120),
      telefono: texto(cuerpo.telefono, 30),
      notas: texto(cuerpo.notas, 500),
      notasInternas: texto(cuerpo.notasInternas, 2000),
      consentimiento: cuerpo.consentimiento === true,
    }, clave)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    // Los correos salen después de contestar. Si la misma solicitud se repite,
    // el registro de correos evita mandarlos otra vez.
    after(() => avisarCambio(r.valor.id, 'CREATED', perfil.uid))
    return NextResponse.json({ cita: r.valor }, { status: 201 })
  } catch (e) {
    console.error('[citas] no se pudo crear', e)
    return NextResponse.json({ error: 'No se pudo agendar la visita. Inténtalo otra vez.' }, { status: 500 })
  }
}
