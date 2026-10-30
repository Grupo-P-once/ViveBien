import { NextResponse } from 'next/server'
import { conMetricas } from '@/lib/http-metricas'
import { exigir, getPerfil, supabaseAdmin, type Rol } from '@/lib/auth-server'
import { aplicarInvitacion } from '@/lib/invitaciones'
import { registrar } from '@/lib/auditoria'
import type { RolGuardado } from '@/lib/acceso/permisos'
import {
  camposEditablesPara,
  calcularCompletitudPerfil,
  faltantesPerfil,
} from '@/lib/perfil'
import { normalizarOperacion, normalizarPresupuesto, normalizarTipos, normalizarZonas } from '@/lib/cliente/busqueda'
import { leerFlags } from '@/lib/config/flags-servidor'
import { portalAbiertoPara } from '@/lib/portal/apertura'
import { despuesDeResponder, enviarBienvenida } from '@/lib/correo/transaccionales'
import type { DbCorreo } from '@/lib/correo/enviar'

/** Columnas del perfil que puede no haber si 06-perfil.sql no está aplicado. */
const COLUMNAS = [
  'uid', 'email', 'nombre', 'telefono', 'rol', 'estado',
  'whatsapp', 'foto_url', 'inmobiliaria', 'zonas', 'biografia',
  // «Qué estoy buscando»: el modelo único (P3-07, V-1.1.82).
  'busca_operacion', 'busca_zonas', 'busca_tipos', 'presupuesto_max',
  'bienvenida_vista', 'completitud',
].join(', ')

/**
 * «Último acceso» del panel de usuarios (migración 14).
 *
 * Esta ruta se llama cada vez que alguien abre su cuenta, su panel o el
 * asistente, a veces varias veces en la misma pantalla. Escribir en cada una
 * sería gastar escrituras en nada: sólo se actualiza si el último acceso
 * guardado tiene más de 10 minutos.
 *
 * Nunca rompe la respuesta: sin la migración aplicada, la columna no existe y
 * el error se ignora. Saber cuándo entró alguien no vale tanto como que entre.
 */
async function registrarAcceso(db: ReturnType<typeof supabaseAdmin>, uid: string) {
  const ahora = new Date()
  const hace10 = new Date(ahora.getTime() - 10 * 60_000).toISOString()
  const { error } = await db
    .from('usuarios')
    .update({ ultimo_acceso: ahora.toISOString() })
    .eq('uid', uid)
    .or(`ultimo_acceso.is.null,ultimo_acceso.lt."${hace10}"`)
  if (error) console.warn('[usuarios/me] no se pudo guardar el último acceso:', error.message)
}

/**
 * GET /api/usuarios/me — perfil del usuario de la sesión.
 *
 * Crea la fila la primera vez que alguien entra, para que no haga falta un
 * paso de alta separado ni migrar a los usuarios que ya existen en Firebase.
 */
/**
 * La respuesta del perfil, igual en GET y en PATCH (V-1.1.86, D-32).
 *
 * Que las dos digan lo mismo importa: al guardar, la pantalla pinta **esto**,
 * que es lo que quedó en la base —ya limpio: zonas sin repetir, tipos por su
 * clave, presupuesto convertido—, y no lo que se tecleó.
 */
function respuestaDePerfil(
  base: Record<string, unknown>,
  quien: { rol: Rol; superAdmin: boolean; estado: string; tipoPublicador?: string; capacidades?: Record<string, boolean> },
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json({
    ...base,
    rol: quien.rol,
    superAdmin: quien.superAdmin,
    estado: quien.estado,
    // Sólo de lectura y sólo para pintar: los calcula el servidor (ADR-0013) y
    // ninguna ruta los acepta del cuerpo. Quien autoriza sigue siendo el servidor.
    ...(quien.rol === 'publicador' ? { tipoPublicador: quien.tipoPublicador ?? 'publicador', capacidades: quien.capacidades ?? {} } : {}),
    bienvenidaVista: Boolean(base.bienvenida_vista),
    completitud: calcularCompletitudPerfil(base, quien.rol),
    faltantes: faltantesPerfil(base, quien.rol),
    ...extra,
  })
}

/**
 * Bitácora de una invitación que NO se aplicó por un fallo (E-30). Los demás motivos con invitación pendiente
 * (correo sin verificar, rol ya suficiente, cuenta no activa) los audita la propia función SQL, una vez por hora.
 * Con la migración 32 sin aplicar solo se avisa en el log: de lo contrario cada pantalla de cada persona escribiría
 * una fila. Tope por cuenta para que un fallo repetido tampoco llene la tabla.
 */
const omisionesRegistradas = new Map<string, { n: number; desde: number }>()
async function registrarOmision(perfil: Awaited<ReturnType<typeof getPerfil>>, motivo: string) {
  if (motivo === 'funcion_ausente') { console.warn('[invitaciones] falta aplicar la migración 32 (invitacion_aplicar): no se aplican invitaciones'); return }
  if (motivo !== 'error_aplicando_rol') return
  const ahora = Date.now()
  const r = omisionesRegistradas.get(perfil.uid)
  if (!r || ahora - r.desde > 10 * 60_000) omisionesRegistradas.set(perfil.uid, { n: 1, desde: ahora })
  else if (r.n >= 3) return
  else r.n++
  await registrar({ actor: perfil, accion: 'invitacion.omitida', entidad: 'invitaciones', entidadId: perfil.uid, despues: { motivo } })
}

async function leerMiPerfil(req: Request) {
  // V-1.1.87 (etapa 1): pasa por el autorizador central. Antes sólo verificaba
  // el token y NO miraba el estado —ni siquiera `suspendido`—, y es la única
  // ruta que crea cuentas: una lápida habría recibido 200 y su perfil.
  const chequeo = await exigir(req, 'cuenta.propia')
  if (chequeo.error) return chequeo.error

  const user = chequeo.perfil
  let perfil = chequeo.perfil

  // Alta silenciosa en el primer acceso. Si la tabla aún no existe, se ignora:
  // el perfil de arriba ya trae valores por defecto utilizables.
  let fila: Record<string, unknown> | null = null
  try {
    const db = supabaseAdmin()

    // ¿Hay una invitación esperando este correo (migración 14)? E-30: la aplica la BASE en una sola transacción
    // (`invitacion_aplicar`, migración 32): crea la cuenta o SUBE el rol (solo si el invitado es de rango MAYOR; una
    // invitación nunca baja ni iguala), y acepta la invitación SOLO si el rol quedó escrito. Identidad = el correo
    // VERIFICADO de la sesión, por igualdad. Se llama también a quien ya tiene cuenta (publicador, admin…) para que un
    // ascenso invitado funcione; a un Super Admin no hace falta (nada puede subirlo más).
    const { data: yaExiste } = await db.from('usuarios').select('uid, rol').eq('uid', user.uid).maybeSingle()
    let rolInicial: RolGuardado = perfil.superAdmin ? 'super_admin' : perfil.rol
    let invitado: RolGuardado | null = null
    if (!yaExiste || yaExiste.rol !== 'super_admin') {
      const r = await aplicarInvitacion(db, user)
      if (r?.estado === 'aplicada') {
        invitado = r.rol
        rolInicial = r.rol
      } else if (r?.estado === 'omitida') {
        await registrarOmision(perfil, r.motivo)
      }
    }

    // Idempotente: si la base ya creó la cuenta (invitación aplicada) no hace nada; si no había invitación, la alta
    // silenciosa de siempre.
    await db
      .from('usuarios')
      .upsert(
        {
          uid: user.uid,
          email: user.email ?? '',
          rol: rolInicial,
          estado: perfil.estado,
        },
        { onConflict: 'uid', ignoreDuplicates: true },
      )

    // Si la invitación cambió el rol, el perfil de arriba se quedó viejo: se vuelve a resolver para que la respuesta
    // diga el rol de verdad. (La bitácora `invitacion.aplicada` ya la escribió la base, en la misma transacción.)
    if (invitado) perfil = await getPerfil(user)

    const { data } = await db.from('usuarios').select(COLUMNAS).eq('uid', user.uid).maybeSingle()
    fila = (data as Record<string, unknown> | null) ?? null

    await registrarAcceso(db, user.uid)

    // D-80: cuenta NUEVA → bienvenida transaccional (apagada por defecto; después de responder; nunca tumba el alta).
    if (!yaExiste) {
      despuesDeResponder(() => enviarBienvenida(db as unknown as DbCorreo, user.uid, { correo: user.email, verificado: user.emailVerified, nombre: perfil.nombre }))
    }
  } catch (e) {
    // Antes esto era `catch {}` a secas, pensando sólo en «la migración no
    // está aplicada». Pero también se traga que la base esté caída — y
    // entonces el alta silenciosa NO OCURRE.
    //
    // Consecuencia real: quien se registra durante una caída existe en
    // Firebase pero no en `usuarios`. No sale en el panel, no tiene rol, y
    // sólo aparece si vuelve a entrar. Si no vuelve, es invisible para
    // siempre y nadie sabe que se perdió.
    //
    // No se puede arreglar aquí -si la base no responde, no responde- pero
    // sí se puede dejar de perder en silencio.
    console.error(
      '[usuarios/me] no se pudo dar de alta a %s (%s):',
      user.email ?? 'sin correo', user.uid,
      e instanceof Error ? e.message : e,
    )
  }

  // Sin fila, se responde con lo que se sabe del token. Devolver 500 aquí
  // dejaría la sesión sin panel por una migración pendiente.
  const base: Record<string, unknown> = fila ?? {
    uid: perfil.uid,
    email: perfil.email,
    nombre: perfil.nombre,
    telefono: null,
  }

  // El rol y el estado los manda `getPerfil` (la tabla; V-1.1.81). Un Super
  // Admin llega con rol efectivo 'admin' y `superAdmin: true` (V-1.1.79).
  //
  // `portal` (V-1.1.89): si el portal nuevo está abierto PARA ESTA PERSONA. Lo
  // decide `portalAbiertoPara`, el mismo predicado que el layout de /portal y
  // sus APIs, para que la puerta y la cerradura no puedan discrepar. El
  // navegador no lee flags: recibe ya la respuesta.
  return respuestaDePerfil(base, perfil, {
    portal: portalAbiertoPara(await leerFlags(), perfil),
  })
}

/**
 * Lo que una persona puede elegir para sí misma: **sólo cliente**.
 *
 * Antes incluía `publicador`, así que cualquiera con la consola del navegador
 * abierta —o el botón de «quiero publicar»— se ascendía solo. Publicar no es
 * una preferencia: es permiso para meter contenido en el catálogo público de
 * la casa, con su teléfono al lado.
 *
 * Ahora lo concede un administrador desde el panel de usuarios. Quien quiera
 * publicar lo **solicita**, y alguien lo revisa.
 *
 * Este es el candado que cuenta. El de la interfaz sólo evita que se ofrezca;
 * éste evita que se consiga.
 */
const ROLES_ELEGIBLES: Rol[] = ['cliente']

/** Recorta y normaliza un valor de texto, o devuelve undefined si viene vacío. */
function texto(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim().slice(0, max)
  return t.length > 0 ? t : ''
}

/**
 * PATCH /api/usuarios/me — el usuario edita su propio perfil.
 *
 * Puede cambiar sus datos de contacto, lo que busca y elegir entre buscar o
 * publicar. No puede concederse el rol de administrador: eso sólo se otorga
 * con las reglas de lib/acceso/roles.ts (un Super Admin) o en la tabla a mano.
 */
export async function PATCH(req: Request) {
  // V-1.1.87 (etapa 1): la comprobación de estado deja de ser una copia a mano
  // que sólo conocía `suspendido`.
  const chequeo = await exigir(req, 'cuenta.propia')
  if (chequeo.error) return chequeo.error

  const user = chequeo.perfil
  const perfil = chequeo.perfil

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const cambios: Record<string, unknown> = {}

  const LARGO: Record<string, number> = {
    nombre: 120, telefono: 40, whatsapp: 40, foto_url: 600,
    inmobiliaria: 120, biografia: 600,
  }

  // 03.08 · La lista blanca del rol, no la lista entera. Antes este bucle
  // recorría `CAMPOS_EDITABLES` sin mirar quién escribía, y un administrador
  // podía guardarse `busca_operacion` o `presupuesto_max`. Un Super Admin
  // llega con rol efectivo `admin`, así que cae aquí con el mismo alcance.
  const editables = camposEditablesPara(perfil.rol)
  if (!editables) {
    // Rol que no reconocemos: no se hereda el permiso de nadie. Se rechaza.
    return NextResponse.json({ error: 'Tu cuenta no puede editar el perfil.' }, { status: 403 })
  }

  for (const campo of editables) {
    if (!(campo in body)) continue

    if (campo === 'zonas') {
      if (Array.isArray(body.zonas)) {
        cambios.zonas = body.zonas
          .filter((z): z is string => typeof z === 'string')
          .map((z) => z.trim())
          .filter(Boolean)
          .slice(0, 12)
      }
      continue
    }

    // «Qué estoy buscando» (P3-07, V-1.1.82): un solo modelo y una sola
    // limpieza (lib/cliente/busqueda.ts). Ya no se copia a columnas viejas.
    if (campo === 'busca_zonas') {
      if (Array.isArray(body.busca_zonas)) cambios.busca_zonas = normalizarZonas(body.busca_zonas)
      continue
    }
    if (campo === 'busca_tipos') {
      if (Array.isArray(body.busca_tipos)) cambios.busca_tipos = normalizarTipos(body.busca_tipos)
      continue
    }

    if (campo === 'presupuesto_max') {
      cambios.presupuesto_max = normalizarPresupuesto(body.presupuesto_max)
      continue
    }

    if (campo === 'busca_operacion') {
      // El CHECK de la base sólo admite venta, renta, ambas o null.
      cambios.busca_operacion = normalizarOperacion(body.busca_operacion)
      continue
    }

    const t = texto(body[campo], LARGO[campo] ?? 200)
    if (t !== undefined) cambios[campo] = t === '' ? null : t
  }

  if (typeof body.rol === 'string') {
    if (!ROLES_ELEGIBLES.includes(body.rol as Rol)) {
      return NextResponse.json(
        {
          error: body.rol === 'publicador'
            ? 'Publicar lo autoriza un administrador. Escríbenos y te damos acceso.'
            : 'Ese rol no se puede elegir.',
        },
        { status: 403 },
      )
    }
    // Un administrador no se degrada a sí mismo sin querer al guardar el perfil.
    // V-1.1.79: antes sólo protegía a los de la lista del entorno; un admin puesto en la
    // tabla (o un super admin) que guardaba con rol 'cliente' perdía el acceso.
    if (perfil.rol !== 'admin') cambios.rol = body.rol
  }

  // Marcar la bienvenida como vista es lo único que el navegador decide de
  // verdad: es una preferencia de interfaz, no un permiso.
  if (body.bienvenidaVista === true) cambios.bienvenida_vista = true

  // Lo que llegó y NO se guarda: campos que no son editables (o que ya no
  // existen, como las columnas viejas de «qué busco»). Se devuelven para que la
  // pantalla lo diga en vez de fingir que se guardó todo (D-32).
  // Se mide contra la lista del ROL: si un cliente manda `inmobiliaria`, no se
  // guarda y además se le dice (D-32), en vez de fingir que sí.
  const conocidos = new Set<string>([...editables, 'rol', 'bienvenidaVista'])
  const ignorados = Object.keys(body).filter((k) => !conocidos.has(k))

  const db = supabaseAdmin()

  if (Object.keys(cambios).length === 0) {
    // Nada que escribir, pero se contesta con el perfil de verdad igualmente.
    const { data } = await db.from('usuarios').select(COLUMNAS).eq('uid', user.uid).maybeSingle()
    return respuestaDePerfil((data ?? {}) as Record<string, unknown>, perfil, { ok: true, sinCambios: true, ignorados })
  }

  const { data: antes } = await db.from('usuarios').select(COLUMNAS).eq('uid', user.uid).maybeSingle()

  const rolFinal = (cambios.rol as Rol) ?? perfil.rol
  const previo = (antes ?? {}) as Record<string, unknown>
  const fusionado = { ...previo, ...cambios }
  cambios.completitud = calcularCompletitudPerfil(fusionado, rolFinal)

  const { error } = await db
    .from('usuarios')
    .upsert({ uid: user.uid, email: user.email ?? '', ...cambios }, { onConflict: 'uid' })

  if (error) {
    // Columna que todavía no existe: 06-perfil.sql sin aplicar. Decirlo, en
    // vez de devolver el mensaje crudo de Postgres.
    if (/column|schema cache/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Falta aplicar la migración 06-perfil.sql en Supabase.', detalle: error.message },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Se relee: lo que vale es lo que quedó en la base, no lo que se mandó.
  const { data: guardado } = await db.from('usuarios').select(COLUMNAS).eq('uid', user.uid).maybeSingle()
  const base = (guardado ?? fusionado) as Record<string, unknown>
  return respuestaDePerfil(base, { rol: rolFinal, superAdmin: perfil.superAdmin, estado: perfil.estado, tipoPublicador: perfil.tipoPublicador, capacidades: perfil.capacidades }, {
    ok: true,
    ignorados,
  })
}

export const GET = conMetricas('usuarios_me', leerMiPerfil)
