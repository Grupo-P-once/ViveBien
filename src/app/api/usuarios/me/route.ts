import { NextResponse } from 'next/server'
import { verifyIdToken, getPerfil, supabaseAdmin, isAdminEmail, type Rol } from '@/lib/auth-server'
import {
  CAMPOS_EDITABLES,
  calcularCompletitudPerfil,
  faltantesPerfil,
} from '@/lib/perfil'

/** Columnas del perfil que puede no haber si 06-perfil.sql no está aplicado. */
const COLUMNAS = [
  'uid', 'email', 'nombre', 'telefono', 'rol', 'estado',
  'whatsapp', 'foto_url', 'inmobiliaria', 'zonas', 'biografia',
  'busca_operacion', 'busca_zona', 'busca_tipo', 'presupuesto_max',
  'bienvenida_vista', 'completitud',
].join(', ')

/**
 * GET /api/usuarios/me — perfil del usuario de la sesión.
 *
 * Crea la fila la primera vez que alguien entra, para que no haga falta un
 * paso de alta separado ni migrar a los usuarios que ya existen en Firebase.
 */
export async function GET(req: Request) {
  const user = await verifyIdToken(req)
  if (!user) return NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 })

  const perfil = await getPerfil(user)

  // Alta silenciosa en el primer acceso. Si la tabla aún no existe, se ignora:
  // el perfil de arriba ya trae valores por defecto utilizables.
  let fila: Record<string, unknown> | null = null
  try {
    const db = supabaseAdmin()
    await db
      .from('usuarios')
      .upsert(
        {
          uid: user.uid,
          email: user.email ?? '',
          rol: perfil.rol,
          estado: perfil.estado,
        },
        { onConflict: 'uid', ignoreDuplicates: true },
      )

    const { data } = await db.from('usuarios').select(COLUMNAS).eq('uid', user.uid).maybeSingle()
    fila = (data as Record<string, unknown> | null) ?? null
  } catch {
    // Migración sin aplicar todavía.
  }

  // Sin fila, se responde con lo que se sabe del token. Devolver 500 aquí
  // dejaría la sesión sin panel por una migración pendiente.
  const base: Record<string, unknown> = fila ?? {
    uid: perfil.uid,
    email: perfil.email,
    nombre: perfil.nombre,
    telefono: null,
  }

  return NextResponse.json({
    ...base,
    // El rol y el estado los manda `getPerfil`, que ya aplica ADMIN_EMAILS
    // por encima de la tabla. La fila puede ir por detrás.
    rol: perfil.rol,
    estado: perfil.estado,
    bienvenidaVista: Boolean(base.bienvenida_vista),
    completitud: calcularCompletitudPerfil(base, perfil.rol),
    faltantes: faltantesPerfil(base, perfil.rol),
  })
}

const ROLES_ELEGIBLES: Rol[] = ['cliente', 'publicador']

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
 * desde ADMIN_EMAILS o editando la tabla directamente.
 */
export async function PATCH(req: Request) {
  const user = await verifyIdToken(req)
  if (!user) return NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 })

  const perfil = await getPerfil(user)
  if (perfil.estado === 'suspendido') {
    return NextResponse.json({ error: 'Tu cuenta está suspendida.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const cambios: Record<string, unknown> = {}

  const LARGO: Record<string, number> = {
    nombre: 120, telefono: 40, whatsapp: 40, foto_url: 600,
    inmobiliaria: 120, biografia: 600, busca_zona: 120, busca_tipo: 60,
  }

  for (const campo of CAMPOS_EDITABLES) {
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

    if (campo === 'presupuesto_max') {
      const n = Number(body.presupuesto_max)
      cambios.presupuesto_max = Number.isFinite(n) && n > 0 ? n : null
      continue
    }

    if (campo === 'busca_operacion') {
      const v = body.busca_operacion
      // El CHECK de la base sólo admite estos tres o null. Mandar otra cosa
      // rompería el guardado entero, no sólo este campo.
      cambios.busca_operacion =
        v === 'venta' || v === 'renta' || v === 'ambas' ? v : null
      continue
    }

    const t = texto(body[campo], LARGO[campo] ?? 200)
    if (t !== undefined) cambios[campo] = t === '' ? null : t
  }

  if (typeof body.rol === 'string') {
    if (!ROLES_ELEGIBLES.includes(body.rol as Rol)) {
      return NextResponse.json({ error: 'Ese rol no se puede elegir.' }, { status: 400 })
    }
    // Un administrador no se degrada a sí mismo sin querer al guardar el perfil.
    if (!isAdminEmail(user.email)) cambios.rol = body.rol
  }

  // Marcar la bienvenida como vista es lo único que el navegador decide de
  // verdad: es una preferencia de interfaz, no un permiso.
  if (body.bienvenidaVista === true) cambios.bienvenida_vista = true

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ ok: true, sinCambios: true })
  }

  const db = supabaseAdmin()
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

  return NextResponse.json({
    ok: true,
    completitud: cambios.completitud,
    faltantes: faltantesPerfil(fusionado, rolFinal),
  })
}
