import { supabaseAdmin, ESTADOS_QUE_ENTRAN, type PerfilUsuario } from '../auth-server'
import { miniaturaCloudinary } from '../cloudinary-url'
import { normalizarTelefono, VERSION_CONSENTIMIENTO } from '../contacto'
import { nombreDe, rutaDe } from '../propiedad-publica'
import { AJUSTES_POR_DEFECTO, HORARIO_POR_DEFECTO, type AjustesCitas, type BloqueHorario } from './ajustes'
import { esHorarioOfrecido, horariosDelRango, type Rango } from './disponibilidad'
import { ESTADOS_ACTIVOS, estadoInicialDeCita, explicar, type AccionCita, type PapelVista } from './estados'
import { papelEn, recortar, type CitaFila, type CitaVista, type PropiedadDeCita } from './vista'
import { instanteLocal, sumarDias } from './zona'
import { hashDe, pareceToken } from './tokens'
import { puede } from '../acceso/permisos'
import { atiendeCitas, nombreDelAsesorVisible, puedeActuarEnCita, veDatosDelInteresado, type CuentaDeCitas } from '../acceso/capacidades'
import { cuentasDeCitas, perfilDeCuenta } from './asesores'
import { rutaDeVisitas } from './enlaces'

export { papelEn }

/**
 * El único servicio de citas.
 *
 * ─────────────────────────────────────────────────────────────
 * Todo lo que crea o cambia una cita pasa por aquí —el panel, el portal, los
 * enlaces de correo y las tareas programadas—, y de aquí a dos funciones de
 * Postgres (`cita_crear`, `cita_transicionar`) que hacen el cambio y dejan el
 * historial en la misma transacción. No hay otro camino para tocar `citas`.
 *
 * Usa la clave de servicio: sólo se llama después de haber verificado la
 * sesión (`requireRole`). Quién puede qué dentro de una cita se decide con
 * `papelEn` y lo vuelve a comprobar la función SQL.
 * ─────────────────────────────────────────────────────────────
 */

type Db = ReturnType<typeof supabaseAdmin>

export type Resultado<T> = { ok: true; valor: T } | { ok: false; status: number; error: string; cita?: CitaVista }

const falla = (status: number, error: string, cita?: CitaVista): { ok: false; status: number; error: string; cita?: CitaVista } =>
  ({ ok: false, status, error, ...(cita ? { cita } : {}) })

/** Estatus con los que una propiedad ya no recibe visitas (los mismos que ocultan una búsqueda). */
const ESTATUS_FUERA = ['pausada', 'vendida', 'rentada', 'eliminada']

const COLUMNAS_PROPIEDAD = 'id, titulo, tipo, operacion, ubicacion, colonia, ciudad, owner_id, responsable_citas_uid, estado_pub, estatus, slug, fotos'

type FilaPropiedad = {
  id: string
  titulo: string | null
  tipo: string | null
  operacion: string | null
  ubicacion: string | null
  colonia: string | null
  ciudad: string | null
  owner_id: string | null
  /** Quien atiende las citas de esta propiedad, si un admin lo asignó (migración 70). Nulo: lo decide `responsableDeCitas`. */
  responsable_citas_uid: string | null
  estado_pub: string | null
  estatus: string | null
  slug: string | null
  fotos: string[] | null
}

/** La propiedad con su responsable de citas ya resuelto. */
type PropiedadAgendable = FilaPropiedad & { responsable_uid: string }

/**
 * Quién atiende las citas de una propiedad (D-1, 5-nov-2026). En este orden:
 *   1. el responsable que un admin asignó a la propiedad (`responsable_citas_uid`) — el caso del Asociado con propiedades asignadas;
 *   2. el dueño, si PUEDE atender citas: el equipo de VIVE BIEN, o un publicador con `recibir_citas` (un asociado);
 *   3. el responsable del equipo configurado (`configuracion.citas.responsable_equipo_uid`): así las solicitudes de las
 *      propiedades de un Publicador las administra VIVE BIEN, y el Publicador solo las ve.
 * Cada candidato se comprueba contra su cuenta real: alguien que ya no atiende citas se salta. Si nadie sirve, `null`
 * (falla cerrado: «esta propiedad todavía no tiene asesor»), no se inventa un responsable.
 */
export async function responsableDeCitas(db: Db, p: Pick<FilaPropiedad, 'owner_id' | 'responsable_citas_uid'>): Promise<string | null> {
  const candidatos: Array<string | null | undefined> = [p.responsable_citas_uid, p.owner_id]
  const equipo = await responsableDelEquipo(db)
  candidatos.push(equipo)
  const uids = [...new Set(candidatos.filter((x): x is string => !!x))]
  if (!uids.length) return null
  const cuentas = await cuentasDeCitas(db, uids)
  for (const uid of candidatos) {
    if (!uid) continue
    const c = cuentas.get(uid)
    if (c && atiendeCitas(c)) return uid
  }
  return null
}

/** El responsable del equipo para las propiedades cuyo dueño no atiende citas. Lo configura un admin; sin él, falla cerrado. */
async function responsableDelEquipo(db: Db): Promise<string | null> {
  const { data, error } = await db.from('configuracion').select('valor').eq('clave', 'citas').maybeSingle()
  if (error || !data) return null
  const v = (data as { valor?: { responsable_equipo_uid?: unknown } }).valor?.responsable_equipo_uid
  return typeof v === 'string' && v.length >= 3 && v.length <= 200 ? v : null
}

// ── Lecturas de apoyo ────────────────────────────────────────────

function lugarDe(p: Pick<FilaPropiedad, 'colonia' | 'ciudad' | 'ubicacion'>): string | null {
  const partes = [p.colonia, p.ciudad].filter((x): x is string => !!x && !!x.trim())
  return partes.length ? partes.join(', ') : p.ubicacion?.trim() || null
}

function propiedadDeCita(p: FilaPropiedad | null | undefined): PropiedadDeCita | null {
  if (!p) return null
  return {
    id: p.id,
    titulo: nombreDe(p),
    tipo: p.tipo,
    ruta: p.estado_pub === 'publicada' ? rutaDe(p) : null,
    foto: miniaturaCloudinary(p.fotos?.[0] ?? null, { lado: 240 }),
  }
}

/** El horario y los ajustes del asesor, o los de por defecto si no ha guardado los suyos. */
export async function agendaDelAsesor(db: Db, asesorUid: string): Promise<{ horario: BloqueHorario[]; ajustes: AjustesCitas }> {
  const [h, a] = await Promise.all([
    db.from('disponibilidad_asesores').select('dia_semana, desde, hasta').eq('asesor_uid', asesorUid),
    db.from('ajustes_citas').select('*').eq('asesor_uid', asesorUid).maybeSingle(),
  ])
  if (h.error) throw h.error
  if (a.error) throw a.error
  const horario = (h.data ?? []).length
    ? (h.data ?? []).map((b) => ({ dia: b.dia_semana as number, desde: String(b.desde).slice(0, 5), hasta: String(b.hasta).slice(0, 5) }))
    : [...HORARIO_POR_DEFECTO]
  const ajustes: AjustesCitas = a.data
    ? {
        duracionMin: a.data.duracion_min,
        margenMin: a.data.margen_min,
        anticipacionHoras: a.data.anticipacion_horas,
        ventanaDias: a.data.ventana_dias,
        confirmacion: a.data.confirmacion,
      }
    : { ...AJUSTES_POR_DEFECTO }
  return { horario, ajustes }
}

const aRango = (desde: string, hasta: string): Rango => ({ desde: new Date(desde), hasta: new Date(hasta) })

/** PostgREST: las citas que APARTAN horario (D-2). Mismo criterio que la restricción de exclusión de la migración 70. */
const FILTRO_APARTAN_HORARIO = 'estado.in.(CONFIRMED,RESCHEDULED,PENDING_CONFIRMATION),and(estado.eq.RESCHEDULE_REQUESTED,estado_previo.in.(CONFIRMED,RESCHEDULED,PENDING_CONFIRMATION))'

async function ocupado(db: Db, filtro: { asesorUid?: string; clienteUid?: string }, desde: Date, hasta: Date, excluirId?: string) {
  let q = db.from('citas').select('id, inicio, fin, ocupa_desde, ocupa_hasta')
    .lt('ocupa_desde', hasta.toISOString())
    .gt('ocupa_hasta', desde.toISOString())
  // El responsable solo tiene ocupado lo firme: una solicitud pendiente no aparta el horario (D-2).
  // Una persona, en cambio, no puede estar en dos visitas activas a la vez.
  if (filtro.asesorUid) q = q.eq('asesor_uid', filtro.asesorUid).or(FILTRO_APARTAN_HORARIO)
  if (filtro.clienteUid) q = q.eq('cliente_uid', filtro.clienteUid).in('estado', ESTADOS_ACTIVOS as string[])
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).filter((c) => c.id !== excluirId)
}

async function bloqueos(db: Db, asesorUid: string, desde: Date, hasta: Date): Promise<Rango[]> {
  const { data, error } = await db.from('bloqueos_asesores').select('desde, hasta')
    .eq('asesor_uid', asesorUid).lt('desde', hasta.toISOString()).gt('hasta', desde.toISOString())
  if (error) throw error
  return (data ?? []).map((b) => aRango(b.desde, b.hasta))
}

/** Todo lo que hace falta para calcular horarios de un asesor en un rango. */
async function entradaDisponibilidad(db: Db, asesorUid: string, clienteUid: string | null, desde: Date, hasta: Date, excluirId?: string) {
  const [{ horario, ajustes }, delAsesor, bloq, delCliente] = await Promise.all([
    agendaDelAsesor(db, asesorUid),
    ocupado(db, { asesorUid }, desde, hasta, excluirId),
    bloqueos(db, asesorUid, desde, hasta),
    clienteUid ? ocupado(db, { clienteUid }, desde, hasta, excluirId) : Promise.resolve([]),
  ])
  return {
    horario,
    ajustes,
    ocupadoAsesor: delAsesor.map((c) => aRango(c.ocupa_desde, c.ocupa_hasta)),
    bloqueos: bloq,
    ocupadoCliente: delCliente.map((c) => aRango(c.inicio, c.fin)),
  }
}

/** La propiedad, si se le pueden agendar visitas, con su responsable de citas ya resuelto. */
async function propiedadAgendable(db: Db, propiedadId: string, soloPublicadas: boolean): Promise<Resultado<PropiedadAgendable>> {
  const { data, error } = await db.from('propiedades').select(COLUMNAS_PROPIEDAD).eq('id', propiedadId).maybeSingle()
  if (error) return falla(500, 'No se pudo leer la propiedad.')
  const p = data as FilaPropiedad | null
  if (!p) return falla(404, 'No encontramos esa propiedad.')
  if (ESTATUS_FUERA.includes(p.estatus ?? '')) return falla(409, 'Esta propiedad ya no recibe visitas.')
  if (soloPublicadas && p.estado_pub !== 'publicada') return falla(404, 'No encontramos esa propiedad.')
  // D-1 (5-nov-2026, enmienda del ADR-0013): el responsable de las citas ya NO es siempre el dueño. Las de un
  // Publicador las administra VIVE BIEN y él solo las ve (es el «propietario» de la cita, ver `papelEn`); las de un
  // Asociado, el Asociado; y un admin puede asignar a otra persona (`propiedades.responsable_citas_uid`).
  // Atender no es ver al interesado: eso es `ver_datos_interesado` (apagado por defecto) y lo recorta `recortar`.
  const responsable = await responsableDeCitas(db, p)
  if (!responsable) return falla(409, SIN_ASESOR)
  return { ok: true, valor: { ...p, responsable_uid: responsable } }
}

const SIN_ASESOR = 'Esta propiedad todavía no tiene asesor. Escríbenos y te ayudamos a agendar.'

// ── Disponibilidad ───────────────────────────────────────────────

export type Disponibilidad = {
  zona: string
  duracionMin: number
  dias: { dia: string; horarios: { inicio: string; fin: string }[] }[]
}

/** Horarios libres para visitar una propiedad, desde un día y por `dias` días. */
export async function checkAvailability(opts: {
  propiedadId: string
  desde: string
  dias: number
  clienteUid: string | null
  excluirCitaId?: string
  ahora: Date
}): Promise<Resultado<Disponibilidad>> {
  const db = supabaseAdmin()
  const prop = await propiedadAgendable(db, opts.propiedadId, true)
  if (!prop.ok) return prop
  const asesorUid = prop.valor.responsable_uid

  const inicioRango = instanteLocal(opts.desde, '00:00')
  const finRango = instanteLocal(sumarDias(opts.desde, opts.dias), '00:00')
  const entrada = await entradaDisponibilidad(db, asesorUid, opts.clienteUid, inicioRango, finRango, opts.excluirCitaId)
  const dias = horariosDelRango(opts.desde, opts.dias, { ...entrada, ahora: opts.ahora })

  return {
    ok: true,
    valor: {
      zona: 'America/Mexico_City',
      duracionMin: entrada.ajustes.duracionMin,
      dias: dias.map((d) => ({
        dia: d.dia,
        horarios: d.horarios.map((h) => ({ inicio: h.inicio.toISOString(), fin: h.fin.toISOString() })),
      })),
    },
  }
}

// ── Errores de la base, dichos para una persona ──────────────────

type ErrorDb = { code?: string; message?: string } | null

function traducir(e: ErrorDb, accion?: AccionCita): { status: number; error: string; motivo: string } {
  const m = e?.message ?? ''
  if (e?.code === '23P01' || m === 'horario_ocupado') return { status: 409, error: explicar('horario_ocupado'), motivo: 'horario_ocupado' }
  switch (m) {
    case 'version': return { status: 409, error: explicar('version'), motivo: m }
    case 'no_encontrada': return { status: 404, error: explicar('no_encontrada'), motivo: m }
    case 'no_permitido': return { status: 403, error: explicar('no_permitido'), motivo: m }
    case 'transicion_invalida': return { status: 409, error: explicar('transicion_invalida'), motivo: m }
    case 'fuera_de_tiempo': return { status: 409, error: explicar('fuera_de_tiempo', accion), motivo: m }
    case 'menos_de_2_horas': return { status: 409, error: explicar('menos_de_2_horas'), motivo: m }
    case 'motivo_requerido': return { status: 400, error: explicar('motivo_requerido'), motivo: m }
  }
  console.error('[citas] error de base', e)
  return { status: 500, error: 'No se pudo guardar el cambio. Inténtalo otra vez.', motivo: 'desconocido' }
}

// ── Leer ─────────────────────────────────────────────────────────

const SELECT_CITA = `*, propiedad:propiedades(${COLUMNAS_PROPIEDAD}), asesor:usuarios!citas_asesor_uid_fkey(nombre, telefono)`

type FilaConExtras = CitaFila & {
  propiedad: FilaPropiedad | null
  asesor: { nombre: string | null; telefono: string | null } | null
}

/** Quién mira y las cuentas de los asesores de lo que mira: con eso se decide qué se recorta. */
type Contexto = { perfil: PerfilUsuario; asesores: Map<string, CuentaDeCitas> }

async function contextoDe(db: Db, filas: Array<{ asesor_uid: string }>, perfil: PerfilUsuario): Promise<Contexto> {
  return { perfil, asesores: await cuentasDeCitas(db, filas.map((f) => f.asesor_uid)) }
}

function aVista(fila: FilaConExtras, papel: PapelVista, ahora: Date, ctx: Contexto): CitaVista {
  const { propiedad, asesor, ...cita } = fila

  // Al CLIENTE y al PROPIETARIO: por defecto el contacto es VIVE BIEN. Un publicador sólo se
  // nombra si un admin le dio perfil y nombre públicos.
  const cuentaAsesor = ctx.asesores.get(fila.asesor_uid)
  const nombreVisible = (papel !== 'cliente' && papel !== 'propietario') || (cuentaAsesor ? nombreDelAsesorVisible(cuentaAsesor) : false)

  // Si quien mira es un PUBLICADOR atendiendo la cita, se le recorta lo del
  // interesado y lo interno, y sólo se le ofrecen las acciones que puede hacer.
  const mira = ctx.perfil
  const publicador = papel === 'asesor' && mira.rol === 'publicador'
    ? { verInteresado: veDatosDelInteresado(mira), puedeAccion: (a: AccionCita) => puedeActuarEnCita(mira, a, fila.estado) }
    : undefined

  // El PROPIETARIO (D-1) solo lee: sin el permiso `ver_datos_interesado` no recibe nombre, teléfono, correo ni notas.
  const propietario = papel === 'propietario' ? { verInteresado: veDatosDelInteresado(mira) } : undefined

  return recortar(cita, papel, {
    propiedad: propiedadDeCita(propiedad),
    asesorNombre: nombreVisible ? asesor?.nombre ?? null : 'Vive Bien',
    asesorTelefono: asesor?.telefono ?? null,
    ...(publicador ? { publicador } : {}),
    ...(propietario ? { propietario } : {}),
  }, ahora)
}

async function leerFila(db: Db, id: string): Promise<FilaConExtras | null> {
  const { data, error } = await db.from('citas').select(SELECT_CITA).eq('id', id).maybeSingle()
  if (error) throw error
  return data as FilaConExtras | null
}

/** Una cita, recortada a lo que esta persona puede ver. null si no existe o no es suya. */
export async function getAppointment(id: string, perfil: PerfilUsuario, ahora = new Date()): Promise<CitaVista | null> {
  const db = supabaseAdmin()
  const fila = await leerFila(db, id)
  if (!fila) return null
  const papel = papelEn(fila, perfil)
  if (!papel) return null
  const vista = aVista(fila, papel, ahora, await contextoDe(db, [fila], perfil))
  return (await marcarConflictos(db, [fila], [vista]))[0]
}

/**
 * Desde dónde se mira el calendario:
 *   · `cliente`     — mis citas como quien va a la visita (incluye las «propias» de un publicador, asociado o miembro del equipo);
 *   · `asesor`      — las que atiendo como responsable;
 *   · `propietario` — las de MIS propiedades que atiende otra persona (solo lectura; D-1);
 *   · `admin`       — todas (solo admin y super admin).
 */
export type VistaCalendario = 'cliente' | 'asesor' | 'propietario' | 'admin'

/** Estados que dejaron de ser una cita viva: solo aparecen en el historial. */
const ESTADOS_INACTIVOS = ['CANCELLED', 'REJECTED', 'EXPIRED']

/** Citas que se cruzan con [desde, hasta), según desde dónde se mira. */
export async function listAppointments(opts: {
  perfil: PerfilUsuario
  vista: VistaCalendario
  desde: Date
  hasta: Date
  asesorUid?: string | null
  tipo?: string | null
  /** Filtra por estado (historial). */
  estados?: string[] | null
  /** Filtra por propiedad. */
  propiedadId?: string | null
  /** `solicitada` | `propia`. */
  tipoCita?: 'solicitada' | 'propia' | null
  /** Incluye canceladas, rechazadas y expiradas (el historial). */
  incluirCanceladas?: boolean
  limite?: number
  ahora?: Date
}): Promise<CitaVista[]> {
  const ahora = opts.ahora ?? new Date()
  // «Citas recibidas» sólo existen para quien atiende citas. Un publicador sin
  // `recibir_citas` no recibe nada, ni vacío fingido de otra cosa.
  if (opts.vista === 'asesor' && !atiendeCitas(opts.perfil)) return []
  // «Mis propiedades» solo para un publicador (el dueño): cualquier otro rol no tiene citas como propietario.
  if (opts.vista === 'propietario' && opts.perfil.rol !== 'publicador') return []
  const db = supabaseAdmin()
  let q = db.from('citas').select(SELECT_CITA)
    .lt('inicio', opts.hasta.toISOString())
    .gt('fin', opts.desde.toISOString())
    .order('inicio', { ascending: true })
    .limit(Math.min(opts.limite ?? 500, 500))

  if (opts.vista === 'cliente') q = q.eq('cliente_uid', opts.perfil.uid)
  else if (opts.vista === 'asesor') q = q.eq('asesor_uid', opts.perfil.uid)
  else if (opts.vista === 'propietario') q = q.eq('propietario_uid', opts.perfil.uid).neq('asesor_uid', opts.perfil.uid).neq('cliente_uid', opts.perfil.uid)
  else if (opts.asesorUid) q = q.eq('asesor_uid', opts.asesorUid)
  if (opts.propiedadId) q = q.eq('propiedad_id', opts.propiedadId)
  if (opts.tipoCita) q = q.eq('tipo', opts.tipoCita)
  if (opts.estados?.length) q = q.in('estado', opts.estados)
  else if (!opts.incluirCanceladas) q = q.not('estado', 'in', `(${ESTADOS_INACTIVOS.join(',')})`)

  const { data, error } = await q
  if (error) throw error
  const filas = (data ?? []) as FilaConExtras[]
  const ctx = await contextoDe(db, filas, opts.perfil)
  const vistas = filas
    .filter((f) => !opts.tipo || f.propiedad?.tipo === opts.tipo)
    .map((f) => {
      // En la vista de cliente, aunque sea admin, se mira como cliente de sus propias visitas.
      const papel = opts.vista === 'cliente' ? 'cliente' : opts.vista === 'propietario' ? 'propietario' : papelEn(f, opts.perfil)
      return papel ? aVista(f, papel, ahora, ctx) : null
    })
    .filter((c): c is CitaVista => c !== null)
  return marcarConflictos(db, filas, vistas)
}

/**
 * D-2/D-12: una solicitud pendiente cuyo horario ya ocupa una cita confirmada del mismo responsable queda «en conflicto».
 * Se calcula, no se guarda: la verdad es la restricción de la base. Solo se marca a quien atiende (el responsable y el equipo);
 * el cliente y el propietario no reciben la marca.
 */
async function marcarConflictos(db: Db, filas: FilaConExtras[], vistas: CitaVista[]): Promise<CitaVista[]> {
  const pendientes = filas.filter((f) => f.estado === 'REQUESTED')
  if (!pendientes.length) return vistas
  const asesores = [...new Set(pendientes.map((f) => f.asesor_uid))]
  const minimo = new Date(Math.min(...pendientes.map((f) => new Date(f.ocupa_desde).getTime())))
  const maximo = new Date(Math.max(...pendientes.map((f) => new Date(f.ocupa_hasta).getTime())))
  const { data, error } = await db.from('citas').select('id, asesor_uid, ocupa_desde, ocupa_hasta')
    .in('asesor_uid', asesores).or(FILTRO_APARTAN_HORARIO)
    .lt('ocupa_desde', maximo.toISOString()).gt('ocupa_hasta', minimo.toISOString())
  if (error) return vistas      // si no se puede calcular, no se inventa nada: sin marca
  const firmes = (data ?? []) as Array<{ id: string; asesor_uid: string; ocupa_desde: string; ocupa_hasta: string }>
  const enConflicto = new Set(pendientes.filter((p) => firmes.some((o) =>
    o.id !== p.id && o.asesor_uid === p.asesor_uid &&
    new Date(o.ocupa_desde).getTime() < new Date(p.ocupa_hasta).getTime() && new Date(o.ocupa_hasta).getTime() > new Date(p.ocupa_desde).getTime(),
  )).map((p) => p.id))
  return vistas.map((v) => (enConflicto.has(v.id) && (v.papel === 'asesor' || v.papel === 'admin') ? { ...v, conflicto: true } : v))
}

// ── Crear ────────────────────────────────────────────────────────

export type EntradaCita = {
  propiedadId: string
  /** ISO del inicio. */
  inicio: string
  /** Sólo asesor/admin: la cuenta del cliente para quien se registra. */
  clienteUid?: string | null
  nombre?: string | null
  telefono?: string | null
  notas?: string | null
  notasInternas?: string | null
  /** Aceptó compartir sus datos con el asesor (o el asesor da fe de que el cliente aceptó). */
  consentimiento: boolean
}

export async function createAppointment(perfil: PerfilUsuario, entrada: EntradaCita, clave: string, ahora = new Date()): Promise<Resultado<CitaVista>> {
  const db = supabaseAdmin()

  // Lo primero: si esta misma solicitud ya se guardó (doble clic, reintento de
  // la red), se devuelve la cita que existe. Después sería tarde: su propio
  // horario ya figura como ocupado y contestaríamos «ese horario se ocupó».
  const { data: previa } = await db.from('citas').select('id')
    .eq('creada_por', perfil.uid).eq('clave_idempotencia', clave).maybeSingle()
  if (previa) {
    const vista = await getAppointment(previa.id, perfil, ahora)
    if (vista) return { ok: true, valor: vista }
  }

  const inicio = new Date(entrada.inicio)
  if (Number.isNaN(inicio.getTime())) return falla(400, 'Elige un horario.')
  if (!entrada.consentimiento) return falla(400, 'Falta aceptar que compartamos tus datos con el asesor de la propiedad.')

  const paraOtro = !!entrada.clienteUid && entrada.clienteUid !== perfil.uid

  const prop = await propiedadAgendable(db, entrada.propiedadId, !paraOtro)
  if (!prop.ok) return prop
  const propiedad = prop.valor
  // El RESPONSABLE de las citas de la propiedad (D-1): no siempre es el dueño.
  const asesorUid = propiedad.responsable_uid

  // Quién la crea: el cliente para sí mismo, o el asesor/admin para un cliente con cuenta.
  let creador: 'cliente' | 'asesor' | 'admin' = 'cliente'
  if (paraOtro) {
    if (puede(perfil, 'citas.ver_todas')) creador = 'admin'
    // Registrar una visita por otra persona es cosa del equipo; un publicador
    // sólo atiende lo que le piden (ADR-0013).
    else if (perfil.uid === asesorUid && puede(perfil, 'panel.admin')) creador = 'asesor'
    else return falla(403, 'Sólo puedes agendar visitas para ti.')
  }
  const clienteUid = paraOtro ? entrada.clienteUid! : perfil.uid
  // Nadie visita su propia propiedad, salvo el equipo (D-8: un miembro del equipo puede ir a ver una propiedad que atiende).
  const esDelEquipo = puede(perfil, 'panel.admin')
  if (clienteUid === propiedad.owner_id && !esDelEquipo) return falla(400, 'No se puede agendar una visita a una propiedad propia.')
  if (clienteUid === asesorUid && !esDelEquipo) return falla(400, 'No se puede agendar una visita a una propiedad que tú mismo atiendes.')

  // Sólo agenda quien tiene cuenta creada: una fila en `usuarios`, activa.
  // Quien sólo llenó el formulario de registro no la tiene.
  const { data: cuenta, error: errCuenta } = await db.from('usuarios')
    .select('uid, nombre, telefono, whatsapp, email, estado').eq('uid', clienteUid).maybeSingle()
  if (errCuenta) return falla(500, 'No se pudo leer la cuenta.')
  if (!cuenta) {
    return falla(403, paraOtro
      ? 'Esa persona no tiene cuenta. Sólo se pueden agendar visitas para cuentas creadas.'
      : 'Crea tu cuenta para agendar visitas.')
  }
  if (cuenta.estado === 'suspendido') return falla(403, 'Esa cuenta está suspendida.')

  const nombre = (entrada.nombre?.trim() || cuenta.nombre?.trim() || '').slice(0, 120)
  if (nombre.length < 2) return falla(400, 'Escribe el nombre de quien va a la visita.')
  const telefono = normalizarTelefono(entrada.telefono?.trim() || cuenta.telefono || cuenta.whatsapp || '')
  if (!telefono) return falla(400, 'Escribe un teléfono de 10 dígitos para que el asesor pueda contactarte.')

  const { horario, ajustes } = await agendaDelAsesor(db, asesorUid)
  const fin = new Date(inicio.getTime() + ajustes.duracionMin * 60_000)
  if (inicio.getTime() <= ahora.getTime()) return falla(400, 'Elige un horario que todavía no haya pasado.')

  // El cliente sólo puede elegir de los horarios que se le ofrecen. El asesor y
  // el admin registran lo que acordaron (por teléfono, en persona): basta con
  // que sea futuro y no choque, y eso lo garantiza la base.
  if (creador === 'cliente') {
    const desde = new Date(inicio.getTime() - 86_400_000)
    const hasta = new Date(inicio.getTime() + 2 * 86_400_000)
    const e = await entradaDisponibilidad(db, asesorUid, clienteUid, desde, hasta)
    if (!esHorarioOfrecido(inicio, { ...e, horario, ajustes, ahora })) {
      return falla(409, explicar('horario_ocupado'))
    }
  }

  // D-8: lo que un miembro del equipo agenda PARA SÍ MISMO se confirma solo si es el responsable asignado de esa propiedad
  // (nadie más tiene que autorizarlo) y el horario está disponible (ya se comprobó arriba contra la oferta del responsable).
  // Si el responsable es otra persona, necesita su aprobación y queda pendiente. Lo que registra el equipo para un cliente
  // queda pendiente de que el cliente lo confirme.
  const estado = estadoInicialDeCita({ creador, paraOtro, clienteUid, asesorUid, confirmacion: ajustes.confirmacion })
  // «Visita propia»: un publicador, asociado o miembro del equipo que agenda para ir a ver. «Solicitada»: la pide un cliente
  // (o el equipo la registra para un cliente).
  const tipoDeCita = !paraOtro && perfil.rol !== 'cliente' ? 'propia' : 'solicitada'

  const { data, error } = await db.rpc('cita_crear', {
    p: {
      propiedad_id: propiedad.id,
      cliente_uid: clienteUid,
      asesor_uid: asesorUid,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      margen_min: ajustes.margenMin,
      estado,
      cliente_nombre: nombre,
      cliente_telefono: telefono,
      cliente_email: cuenta.email ?? perfil.email ?? null,
      consentimiento_version: VERSION_CONSENTIMIENTO,
      propiedad_titulo: nombreDe(propiedad),
      lugar: lugarDe(propiedad),
      notas_cliente: entrada.notas?.trim().slice(0, 500) || null,
      notas_internas: creador === 'cliente' ? null : entrada.notasInternas?.trim().slice(0, 2000) || null,
      clave_idempotencia: clave,
      creada_por: perfil.uid,
      actor_rol: creador,
      via: 'panel',
      tipo: tipoDeCita,
      propietario_uid: propiedad.owner_id,
    },
  })

  if (error) {
    // Dos envíos idénticos al mismo tiempo: el segundo choca con la clave única.
    if (error.code === '23505') {
      const { data: previa } = await db.from('citas').select('id').eq('creada_por', perfil.uid).eq('clave_idempotencia', clave).maybeSingle()
      if (previa) {
        const vista = await getAppointment(previa.id, perfil, ahora)
        if (vista) return { ok: true, valor: vista }
      }
    }
    const t = traducir(error)
    return falla(t.status, t.error)
  }

  const creada = data as CitaFila
  const vista = await getAppointment(creada.id, perfil, ahora)
  return vista ? { ok: true, valor: vista } : falla(500, 'La visita se guardó, pero no se pudo leer.')
}

// ── Cambiar de estado ────────────────────────────────────────────

/** Qué evento del historial deja cada acción (y qué correos manda). */
export const EVENTO_DE: Partial<Record<AccionCita, string>> = {
  confirmar: 'CONFIRMED',
  rechazar: 'REJECTED',
  proponer: 'RESCHEDULE_PROPOSED',
  aceptar_cambio: 'RESCHEDULE_ACCEPTED',
  rechazar_cambio: 'RESCHEDULE_REJECTED',
  retirar_cambio: 'RESCHEDULE_WITHDRAWN',
  cancelar: 'CANCELLED',
  completar: 'COMPLETED',
  no_asistio: 'NO_SHOW',
  corregir: 'CORRECTED',
}

export type DatosTransicion = { inicio?: string | null; motivo?: string | null }

/**
 * Aplica una acción. Si la misma persona repite la misma acción (doble clic,
 * reintento de red) y ya quedó hecha, contesta como si nada: sin error y sin
 * repetir efectos.
 */
export async function transicionar(opts: {
  id: string
  version: number
  accion: AccionCita
  perfil: PerfilUsuario
  datos?: DatosTransicion
  via?: 'panel' | 'correo'
  ahora?: Date
}): Promise<Resultado<CitaVista>> {
  const db = supabaseAdmin()
  const ahora = opts.ahora ?? new Date()
  const fila = await leerFila(db, opts.id)
  if (!fila) return falla(404, explicar('no_encontrada'))
  const papelVista = papelEn(fila, opts.perfil)
  if (!papelVista) return falla(404, explicar('no_encontrada'))
  // D-1: el propietario de la propiedad VE la cita pero no la administra; las solicitudes de su propiedad las atiende
  // VIVE BIEN. Se corta aquí, antes de la base: ni siquiera se intenta.
  if (papelVista === 'propietario') {
    return falla(403, 'Las citas de tus propiedades las administra VIVE BIEN. Escríbenos si necesitas un cambio.')
  }
  const papel = papelVista

  // Un publicador atendiendo la cita sólo hace lo que su permiso efectivo
  // autoriza: aceptar, rechazar, reprogramar y cancelar son cuatro permisos
  // independientes. El permiso viene del PERFIL calculado en el servidor, nunca
  // del cuerpo de la petición.
  if (papel === 'asesor' && opts.perfil.rol === 'publicador' && !puedeActuarEnCita(opts.perfil, opts.accion, fila.estado)) {
    return falla(403, 'Tu cuenta no tiene permiso para hacer eso con esta visita. Escríbenos y te ayudamos.')
  }

  const datos: Record<string, string> = {}
  if (opts.datos?.motivo?.trim()) datos.motivo = opts.datos.motivo.trim().slice(0, 500)

  if (opts.accion === 'proponer') {
    const nuevo = new Date(opts.datos?.inicio ?? '')
    if (Number.isNaN(nuevo.getTime())) return falla(400, 'Elige el nuevo horario.')
    const duracion = new Date(fila.fin).getTime() - new Date(fila.inicio).getTime()
    const nuevoFin = new Date(nuevo.getTime() + duracion)
    // Como al crear: el cliente elige de lo que se ofrece; el equipo, lo que acordó.
    if (papel === 'cliente') {
      const { horario, ajustes } = await agendaDelAsesor(db, fila.asesor_uid)
      const e = await entradaDisponibilidad(db, fila.asesor_uid, fila.cliente_uid,
        new Date(nuevo.getTime() - 86_400_000), new Date(nuevo.getTime() + 2 * 86_400_000), fila.id)
      if (!esHorarioOfrecido(nuevo, { ...e, horario, ajustes: { ...ajustes, duracionMin: duracion / 60_000 }, ahora })) {
        return falla(409, explicar('horario_ocupado'))
      }
    }
    datos.inicio = nuevo.toISOString()
    datos.fin = nuevoFin.toISOString()
  }

  const { error } = await db.rpc('cita_transicionar', {
    p_id: fila.id,
    p_version: opts.version,
    p_accion: opts.accion,
    p_actor_uid: opts.perfil.uid,
    p_actor_rol: papel,
    p_via: opts.via ?? 'panel',
    p_datos: datos,
  })

  if (error) {
    const t = traducir(error, opts.accion)
    const actual = await leerFila(db, fila.id)
    const vista = actual ? aVista(actual, papel, ahora, await contextoDe(db, [actual], opts.perfil)) : undefined
    if (t.motivo === 'version' && actual && actual.version === opts.version + 1) {
      const { data: ultimo } = await db.from('citas_eventos').select('tipo, actor_uid')
        .eq('cita_id', fila.id).order('id', { ascending: false }).limit(1).maybeSingle()
      if (ultimo && ultimo.tipo === EVENTO_DE[opts.accion] && ultimo.actor_uid === opts.perfil.uid && vista) {
        return { ok: true, valor: vista }
      }
    }
    return falla(t.status, t.error, vista)
  }

  const actual = await leerFila(db, fila.id)
  return actual ? { ok: true, valor: aVista(actual, papel, ahora, await contextoDe(db, [actual], opts.perfil)) } : falla(500, 'No se pudo leer la visita.')
}

/**
 * Hace expirar las solicitudes que nadie respondió antes de la hora, y las propuestas de cambio cuyo horario ya pasó.
 * Lo ejecuta la tarea programada como `sistema`. Devuelve los ids que quedaron `EXPIRED` (a esas, y solo a esas, se les avisa:
 * una propuesta de cambio vencida deja la cita como estaba y no merece un «expiró»).
 */
export async function vencerCitas(ahora = new Date(), limite = 100): Promise<{ revisadas: number; expiradas: string[] }> {
  const db = supabaseAdmin()
  const t = ahora.toISOString()
  const { data, error } = await db.from('citas').select('id, version')
    .or(`and(estado.in.(REQUESTED,PENDING_CONFIRMATION),inicio.lte.${t}),and(estado.eq.RESCHEDULE_REQUESTED,or(inicio.lte.${t},propuesta_inicio.lte.${t}))`)
    .order('inicio', { ascending: true }).limit(limite)
  if (error) throw error
  const filas = (data ?? []) as Array<{ id: string; version: number }>
  const expiradas: string[] = []
  for (const c of filas) {
    const r = await db.rpc('cita_transicionar', { p_id: c.id, p_version: c.version, p_accion: 'vencer', p_actor_uid: null, p_actor_rol: 'sistema', p_via: 'sistema', p_datos: {} })
    if (r.error) {
      // Otra persona la cambió justo antes: no es un fallo.
      if (r.error.message !== 'version' && r.error.message !== 'transicion_invalida') console.error('[citas] no se pudo expirar una cita', r.error.code ?? '')
      continue
    }
    if ((r.data as { estado?: string } | null)?.estado === 'EXPIRED') expiradas.push(c.id)
  }
  return { revisadas: filas.length, expiradas }
}

// Los nombres del encargo, para que el código se pueda cotejar con él.
type Base = { id: string; version: number; perfil: PerfilUsuario; via?: 'panel' | 'correo' }
export const confirmAppointment = (o: Base) => transicionar({ ...o, accion: 'confirmar' })
export const cancelAppointment = (o: Base & { motivo?: string | null }) => transicionar({ ...o, accion: 'cancelar', datos: { motivo: o.motivo } })
export const requestReschedule = (o: Base & { inicio: string }) => transicionar({ ...o, accion: 'proponer', datos: { inicio: o.inicio } })
export const rescheduleAppointment = (o: Base) => transicionar({ ...o, accion: 'aceptar_cambio' })
export const completeAppointment = (o: Base) => transicionar({ ...o, accion: 'completar' })
export const markNoShow = (o: Base) => transicionar({ ...o, accion: 'no_asistio' })

// ── Enlaces de los correos ───────────────────────────────────────

export type VistaToken =
  | {
      valido: true
      accion: 'confirmar' | 'cancelar' | 'aceptar_cambio' | 'rechazar_cambio'
      para: 'cliente' | 'asesor'
      /** Dónde ve la visita esa persona (panel del admin o su portal). */
      enlace: string
      cita: {
        propiedad: string
        lugar: string | null
        inicio: string
        fin: string
        propuesta: { inicio: string; fin: string } | null
        estado: string
        cliente: string | null
      }
    }
  | { valido: false; motivo: 'no_existe' | 'usado' | 'vencido' | 'cambio' | 'permiso' }

type FilaToken = {
  id: string
  cita_id: string
  accion: 'confirmar' | 'cancelar' | 'aceptar_cambio' | 'rechazar_cambio'
  para_rol: 'cliente' | 'asesor'
  version_cita: number
  expira_en: string
  usado_en: string | null
  revocado_en: string | null
}

async function leerToken(db: Db, plano: unknown, ahora: Date): Promise<{ token: FilaToken; cita: CitaFila } | { motivo: 'no_existe' | 'usado' | 'vencido' | 'cambio' }> {
  if (!pareceToken(plano)) return { motivo: 'no_existe' }
  const { data } = await db.from('citas_tokens').select('*').eq('hash', hashDe(plano)).maybeSingle()
  const token = data as FilaToken | null
  if (!token) return { motivo: 'no_existe' }
  if (token.usado_en) return { motivo: 'usado' }
  const { data: cita } = await db.from('citas').select('*').eq('id', token.cita_id).maybeSingle()
  if (!cita) return { motivo: 'no_existe' }
  // Revocado casi siempre quiere decir que la cita cambió después del correo.
  if (token.revocado_en || (cita as CitaFila).version !== token.version_cita) return { motivo: 'cambio' }
  if (new Date(token.expira_en).getTime() <= ahora.getTime()) return { motivo: 'vencido' }
  return { token, cita: cita as CitaFila }
}

/** Qué hace este enlace, sin hacer nada. Es lo que ve la página antes del botón. */
export async function verToken(plano: unknown, ahora = new Date()): Promise<VistaToken> {
  const r = await leerToken(supabaseAdmin(), plano, ahora)
  if ('motivo' in r) return { valido: false, motivo: r.motivo }
  const { token, cita } = r
  // V-1.1.82 (P3-01): la ruta sale de lib/citas/enlaces.ts. El asesor va al
  // panel del equipo o, si es un publicador (ADR-0013), a sus citas recibidas;
  // y sólo ve el nombre del interesado con `ver_datos_interesado`.
  const esAsesor = token.para_rol === 'asesor'
  const asesor = esAsesor ? (await cuentasDeCitas(supabaseAdmin(), [cita.asesor_uid])).get(cita.asesor_uid) : undefined
  // Falla CERRADO: si no se puede comprobar quién es el asesor (la lectura
  // falló o la cuenta ya no existe), no se enseña el nombre del interesado.
  if (esAsesor && !asesor) return { valido: false, motivo: 'permiso' }
  const esPublicador = asesor?.rol === 'publicador'
  // El enlace sólo se ofrece si la cuenta TODAVÍA puede hacer esa acción: un
  // permiso retirado después de mandar el correo no deja un botón que no sirve.
  if (esAsesor && asesor && !puedeActuarEnCita(asesor, token.accion, cita.estado)) return { valido: false, motivo: 'permiso' }
  const veInteresado = !esAsesor || (asesor ? veDatosDelInteresado(asesor) : false)
  return {
    valido: true,
    accion: token.accion,
    para: token.para_rol,
    enlace: rutaDeVisitas(token.para_rol === 'cliente' ? 'cliente' : esPublicador ? 'publicador' : 'equipo', cita.id),
    cita: {
      propiedad: cita.propiedad_titulo ?? 'La propiedad',
      lugar: cita.lugar,
      inicio: cita.inicio,
      fin: cita.fin,
      propuesta: cita.propuesta_inicio && cita.propuesta_fin ? { inicio: cita.propuesta_inicio, fin: cita.propuesta_fin } : null,
      estado: cita.estado,
      // Al asesor le sirve saber de quién es la visita; al cliente, no hace falta.
      cliente: token.para_rol === 'asesor' && veInteresado ? cita.cliente_nombre : null,
    },
  }
}

/**
 * Hace lo que dice el enlace. Sólo se llama al pulsar el botón (POST).
 *
 * Actúa como la persona a la que se mandó el correo, con las mismas reglas
 * que el panel (`cita_transicionar`). El cambio revoca todos los enlaces
 * vigentes de la cita, incluido éste, y además se marca como usado.
 */
export async function usarToken(plano: unknown, ahora = new Date()): Promise<Resultado<{ cita: CitaVista; evento: string; actorUid: string }>> {
  const db = supabaseAdmin()
  const r = await leerToken(db, plano, ahora)
  if ('motivo' in r) {
    const mensajes = {
      no_existe: 'Este enlace no es válido.',
      usado: 'Este enlace ya se usó.',
      vencido: 'Este enlace ya venció.',
      cambio: 'La visita cambió después de este correo, así que el enlace ya no sirve.',
    }
    return falla(410, mensajes[r.motivo])
  }
  const { token, cita } = r
  const uid = token.para_rol === 'cliente' ? cita.cliente_uid : cita.asesor_uid
  // Actúa como esa persona, con SUS permisos efectivos (V-1.1.79: un
  // super_admin guardado es admin con poderes extra; ADR-0013: un publicador
  // sólo hace lo que `aceptar/rechazar/reprogramar/cancelar_citas` le permite).
  const perfil = await perfilDeCuenta(db, uid)
  if (!perfil || !ESTADOS_QUE_ENTRAN.includes(perfil.estado)) return falla(403, 'Esta cuenta no puede hacer cambios.')
  const hecho = await transicionar({ id: cita.id, version: token.version_cita, accion: token.accion, perfil, via: 'correo', ahora })
  if (!hecho.ok) return hecho

  await db.from('citas_tokens').update({ usado_en: ahora.toISOString() }).eq('id', token.id).is('usado_en', null)
  return { ok: true, valor: { cita: hecho.valor, evento: EVENTO_DE[token.accion] ?? '', actorUid: uid } }
}
