import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin, registrarIntentoDenegado, type Estado } from '@/lib/auth-server'
import { decidirCambioDeEstado, decidirCambioDeRol } from '@/lib/acceso/roles'
import {
  capacidadesEfectivas,
  clavesDesconocidas,
  compactarOverrides,
  decidirCambioDePermisos,
  esTipoPublicador,
  mismosOverrides,
  normalizarOverrides,
  tipoDe,
  type Overrides,
} from '@/lib/acceso/capacidades'
import { leerExtrasDePublicadores } from '@/lib/citas/asesores'

/**
 * Gestión de usuarios. Sólo administradores.
 *
 * La tabla `usuarios` tiene `estado: activo | suspendido | pendiente` desde la
 * Fase 1, y **nunca hubo pantalla para usarlo**. Suspender a alguien requería
 * entrar a Supabase a mano, así que en la práctica no se podía.
 *
 * La idea de tener esto viene de `zexahq/better-auth-starter` — ver el registro
 * de repos.
 */

const ESTADOS: Estado[] = ['activo', 'suspendido', 'pendiente']

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin()
    .from('usuarios')
    .select('uid, email, nombre, telefono, whatsapp, rol, estado, completitud, creado_en, ultimo_acceso')
    .order('creado_en', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Quién no se puede tocar lo decide el servidor (V-1.1.81): la propia
  // cuenta y el último Super Admin activo. El rol que se muestra es el de la
  // tabla, que es el único que existe.
  const filas = data ?? []
  const superActivos = filas.filter((u) => u.rol === 'super_admin' && u.estado === 'activo').length
  // La modalidad se lee APARTE y sólo de los publicadores (migración 28): si las
  // columnas aún no existen, la lista sigue saliendo y se avisa con
  // `permisosDisponibles: false` en vez de romperse.
  const extras = await leerExtrasDePublicadores(supabaseAdmin(), filas.filter((u) => u.rol === 'publicador').map((u) => u.uid))
  const usuarios = filas.map((u) => ({
    ...u,
    esYo: u.uid === auth.perfil.uid,
    ultimoSuperAdmin: u.rol === 'super_admin' && u.estado === 'activo' && superActivos <= 1,
    ...(u.rol === 'publicador' ? { tipoPublicador: tipoDe(extras.mapa.get(u.uid)?.tipo_publicador) } : {}),
  }))

  return NextResponse.json({ usuarios, puedoDarAdmin: auth.perfil.superAdmin, permisosDisponibles: extras.ok })
}

/**
 * PATCH — cambiar rol o estado. Cuerpo: { uid, rol?, estado?, motivo? }
 *
 * Las reglas viven en lib/acceso/roles.ts. Los candados que evitan fallos
 * irreversibles desde la propia interfaz:
 *
 *  1. **Nadie se cambia a sí mismo** (ni rol ni estado): quien se degrada o
 *     se suspende por error se queda fuera.
 *  2. **Nadie deja al sistema sin Super Admin:** el último activo no se
 *     degrada ni se suspende. La base lo impide también (migración 21).
 *  3. **Dar o quitar admin es cosa de un Super Admin**, con motivo.
 */
export async function PATCH(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const uid = typeof body.uid === 'string' ? body.uid : ''
  if (!uid) return NextResponse.json({ error: 'Falta el usuario.' }, { status: 400 })

  const db = supabaseAdmin()
  const { data: objetivo, error: errObjetivo } = await db
    .from('usuarios')
    .select('uid, email, rol, estado')
    .eq('uid', uid)
    .maybeSingle()

  // Un fallo de lectura no es «no existe»: no se oculta como 404.
  if (errObjetivo) return NextResponse.json({ error: 'No se pudo leer la cuenta. Inténtalo otra vez.' }, { status: 503 })
  if (!objetivo) return NextResponse.json({ error: 'Ese usuario no existe.' }, { status: 404 })

  const { count: superActivos } = await db
    .from('usuarios')
    .select('uid', { count: 'exact', head: true })
    .eq('rol', 'super_admin')
    .eq('estado', 'activo')

  const actor = { uid: perfil.uid, superAdmin: perfil.superAdmin }
  const quien = {
    uid: objetivo.uid,
    rol: objetivo.rol as string,
    estado: objetivo.estado as string,
    esUltimoSuperAdmin: objetivo.rol === 'super_admin' && objetivo.estado === 'activo' && (superActivos ?? 0) <= 1,
  }
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) : ''
  const cambios: Record<string, unknown> = {}

  if (typeof body.rol === 'string') {
    const d = decidirCambioDeRol({ actor, objetivo: quien, nuevo: body.rol, motivo })
    if (!d.ok) {
      if (d.status === 403) await registrarIntentoDenegado(perfil, req, `usuarios.rol:${objetivo.rol}->${body.rol}`)
      return NextResponse.json({ error: d.motivo }, { status: d.status })
    }
    cambios.rol = body.rol
  }

  if (typeof body.estado === 'string') {
    if (!ESTADOS.includes(body.estado as Estado)) {
      return NextResponse.json({ error: 'Ese estado no existe.' }, { status: 400 })
    }
    const d = decidirCambioDeEstado({ actor, objetivo: quien, nuevo: body.estado })
    if (!d.ok) {
      if (d.status === 403) await registrarIntentoDenegado(perfil, req, `usuarios.estado:${objetivo.rol}`)
      return NextResponse.json({ error: d.motivo }, { status: d.status })
    }
    cambios.estado = body.estado
  }

  // Modalidad y permisos por usuario (ADR-0013). Quién lo pide ya pasó por
  // `requireAdmin`; aquí se decide el resto: no a sí mismo, sólo a un
  // publicador, con motivo. El publicador NUNCA llega a esta rama por su
  // cuenta: `/api/usuarios/me` ignora estas claves.
  //
  // Es una operación APARTE de rol y estado: así su auditoría es obligatoria y
  // se puede deshacer entera si la bitácora falla.
  let permisos: {
    antes: { tipo_publicador: string; permisos_override: Overrides }
    despues: { tipo_publicador: string; permisos_override: Overrides }
    /** Lo guardado TAL CUAL se leyó: la función SQL lo compara para detectar que alguien más cambió la cuenta. */
    crudo: { tipo_publicador: string | null; permisos_override: unknown }
  } | undefined
  if ('tipo_publicador' in body || 'permisos' in body) {
    if ('rol' in body || 'estado' in body) {
      return NextResponse.json({ error: 'Cambia la modalidad y los permisos en una operación aparte del rol y del estado.' }, { status: 400 })
    }
    const d = decidirCambioDePermisos({ actor, objetivo: quien, motivo })
    if (!d.ok) {
      if (d.status === 403) await registrarIntentoDenegado(perfil, req, `usuarios.permisos:${objetivo.rol}`)
      return NextResponse.json({ error: d.motivo }, { status: d.status })
    }
    // Columnas de la migración 28: si aún no existen, se dice, no se finge.
    const { data: extra, error: errExtra } = await db
      .from('usuarios')
      .select('tipo_publicador, permisos_override')
      .eq('uid', uid)
      .maybeSingle()
    if (errExtra) {
      return NextResponse.json({ error: 'Falta aplicar la migración 28 (modalidad y permisos de publicador).' }, { status: 503 })
    }
    const antes = { tipo_publicador: tipoDe(extra?.tipo_publicador), permisos_override: normalizarOverrides(extra?.permisos_override) }

    let tipoNuevo = antes.tipo_publicador
    if ('tipo_publicador' in body) {
      if (!esTipoPublicador(body.tipo_publicador)) {
        return NextResponse.json({ error: 'Esa modalidad no existe.' }, { status: 400 })
      }
      tipoNuevo = body.tipo_publicador
    }

    const mezcla: Overrides = { ...antes.permisos_override }
    if ('permisos' in body) {
      const crudo = body.permisos
      if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) {
        return NextResponse.json({ error: 'Los permisos deben ser un objeto {permiso: true | false | null}.' }, { status: 400 })
      }
      const raras = clavesDesconocidas(crudo)
      if (raras.length) {
        return NextResponse.json({ error: `Permiso desconocido: ${raras.join(', ')}.` }, { status: 400 })
      }
      for (const [k, v] of Object.entries(crudo as Record<string, unknown>)) {
        if (v === null) delete mezcla[k as keyof Overrides] // null = volver al valor de la modalidad
        else if (typeof v === 'boolean') mezcla[k as keyof Overrides] = v
        else return NextResponse.json({ error: `El permiso ${k} debe ser true, false o null.` }, { status: 400 })
      }
    }

    // Sin redundancias: sólo se guarda lo que se aparta de los defaults de la
    // modalidad RESULTANTE. Y un cambio que no cambia nada no se escribe ni se
    // audita (no ensucia la bitácora).
    const despues = { tipo_publicador: tipoNuevo as string, permisos_override: compactarOverrides(tipoNuevo, mezcla) }
    const cambiaTipo = despues.tipo_publicador !== antes.tipo_publicador
    const cambiaOverrides = !mismosOverrides(despues.permisos_override, antes.permisos_override)
    if (!cambiaTipo && !cambiaOverrides) {
      return NextResponse.json({ error: 'No hay nada que cambiar: la configuración resultante es la misma.' }, { status: 400 })
    }
    if (cambiaTipo) cambios.tipo_publicador = despues.tipo_publicador
    if (cambiaOverrides) cambios.permisos_override = despues.permisos_override
    permisos = {
      antes,
      despues,
      crudo: { tipo_publicador: (extra?.tipo_publicador as string | null | undefined) ?? null, permisos_override: extra?.permisos_override ?? null },
    }
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'No hay nada que cambiar.' }, { status: 400 })
  }

  if (permisos) {
    // Cambio + bitácora en UNA transacción (`usuario_cambiar_permisos`, migración
    // 28): bloquea la fila, comprueba que nadie la cambió desde que se leyó y
    // escribe la huella (quién, a quién, antes, después y motivo; la fecha la
    // pone la base). Si algo falla, incluida la bitácora, no queda nada.
    const efectivas = (p: { tipo_publicador: string; permisos_override: Overrides }) =>
      capacidadesEfectivas({ rol: 'publicador', tipo: p.tipo_publicador, overrides: p.permisos_override })
    const objetivoAuditado = { uid, email: objetivo.email ?? null, rol: objetivo.rol }
    const { data: res, error: errFn } = await db.rpc('usuario_cambiar_permisos', {
      p_uid: uid,
      p_antes_tipo: permisos.crudo.tipo_publicador,
      p_antes_overrides: permisos.crudo.permisos_override,
      p_tipo: permisos.despues.tipo_publicador,
      p_overrides: permisos.despues.permisos_override,
      p_audit: {
        actor_uid: perfil.uid,
        actor_email: perfil.email,
        actor_rol: perfil.rol,
        accion: 'usuario.editar',
        antes: { ...permisos.antes, capacidades: efectivas(permisos.antes), objetivo: objetivoAuditado },
        despues: { ...permisos.despues, capacidades: efectivas(permisos.despues), motivo, objetivo: objetivoAuditado },
      },
    })
    if (errFn) {
      const faltaFuncion = errFn.code === 'PGRST202' || errFn.code === '42883' || /could not find the function|does not exist/i.test(errFn.message ?? '')
      return NextResponse.json(
        { error: faltaFuncion
          ? 'Falta aplicar la migración 28 (modalidad y permisos de publicador).'
          : 'No se pudo guardar el cambio ni registrarlo en la bitácora, así que no se hizo nada. Inténtalo otra vez.' },
        { status: 503 },
      )
    }
    const resultado = (res as { resultado?: string } | null)?.resultado
    if (resultado === 'ok') return NextResponse.json({ ok: true })
    if (resultado === 'conflicto') {
      return NextResponse.json({ error: 'Alguien cambió esta cuenta mientras la editabas. Recarga la página e inténtalo otra vez.', codigo: 'conflicto' }, { status: 409 })
    }
    if (resultado === 'no_existe') return NextResponse.json({ error: 'Ese usuario no existe.' }, { status: 404 })
    if (resultado === 'no_publicador') return NextResponse.json({ error: 'Sólo se configuran los permisos de un publicador. Primero cambia su rol.' }, { status: 409 })
    return NextResponse.json({ error: 'No se pudo guardar el cambio.' }, { status: 500 })
  }

  // Rol y/o estado + bitácora en UNA transacción (`usuario_cambiar_rol_estado`,
  // migración 31): compara con lo leído (conflicto), exige motivo textual al dar o
  // quitar el nivel de admin, respeta el candado del último Super Admin y escribe
  // la huella. Si algo falla, no queda nada.
  const { data: res, error: errFn } = await db.rpc('usuario_cambiar_rol_estado', {
    p_uid: uid,
    p_antes_rol: objetivo.rol,
    p_antes_estado: objetivo.estado,
    p_rol: typeof cambios.rol === 'string' ? cambios.rol : null,
    p_estado: typeof cambios.estado === 'string' ? cambios.estado : null,
    p_audit: {
      actor_uid: perfil.uid,
      actor_email: perfil.email,
      actor_rol: perfil.rol,
      accion: 'usuario.editar',
      antes: { rol: objetivo.rol, estado: objetivo.estado, objetivo: { uid, email: objetivo.email ?? null } },
      despues: { ...cambios, ...(motivo ? { motivo } : {}), objetivo: { uid, email: objetivo.email ?? null } },
    },
  })
  if (errFn) {
    // La base también protege al último Super Admin (migración 21).
    if (/ultimo_super_admin/.test(errFn.message ?? '')) {
      return NextResponse.json({ error: 'Es el único Super Admin activo: nombra a otro antes.' }, { status: 409 })
    }
    const faltaFuncion = errFn.code === 'PGRST202' || errFn.code === '42883' || /could not find the function|does not exist/i.test(errFn.message ?? '')
    return NextResponse.json(
      { error: faltaFuncion
        ? 'Falta aplicar la migración 31 (cambios de rol y estado en una sola operación).'
        : 'No se pudo guardar el cambio ni registrarlo en la bitácora, así que no se hizo nada. Inténtalo otra vez.' },
      { status: 503 },
    )
  }
  const resultado = (res as { resultado?: string } | null)?.resultado
  if (resultado === 'ok') return NextResponse.json({ ok: true })
  if (resultado === 'conflicto') {
    return NextResponse.json({ error: 'Alguien cambió esta cuenta mientras la editabas. Recarga la página e inténtalo otra vez.', codigo: 'conflicto' }, { status: 409 })
  }
  if (resultado === 'no_existe') return NextResponse.json({ error: 'Ese usuario no existe.' }, { status: 404 })
  return NextResponse.json({ error: 'No se pudo guardar el cambio.' }, { status: 500 })
}
