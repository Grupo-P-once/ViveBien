import { tipoDeLead } from '@/lib/tipo-registro'
import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/auth-server'
import { desplegar } from '@/lib/columnas'
import { registrar } from '@/lib/auditoria'
import { soloDigitosTelefono, VERSION_CONSENTIMIENTO } from '@/lib/contacto'

const CAMPOS_PLEGADOS_LEAD = ['interes', 'origen', 'consentimiento_version'] as const


/**
 * GET /api/admin/registros — todo el que dejó sus datos, en un solo sitio.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA
 *
 * Hoy los datos de una persona caen en **cuatro tablas distintas** según por
 * dónde entró, y las cuatro se llenan de formas diferentes:
 *
 *   usuarios              ← creó cuenta            (por API, con sesión)
 *   solicitudes_contacto  ← /api/contacto         (validado, CON consentimiento)
 *   leads                 ← ficha, valuador, modal (DIRECTO del navegador)
 *   contactos             ← /contacto y portada    (DIRECTO del navegador)
 *
 * Las dos últimas se escriben desde el navegador saltándose la API, así que
 * llegan **sin validar, sin normalizar el teléfono y sin versión de
 * consentimiento**. Eso último importa: es la prueba de qué aceptó la persona,
 * y es lo que pide la LFPDPPP cuando se comparten sus datos con un anunciante.
 *
 * Arreglar el origen es otro trabajo (ver pendientes). Esta ruta resuelve lo
 * inmediato: **que el administrador pueda ver a todos**, de dónde salió cada
 * uno y cuáles carecen de consentimiento registrado.
 *
 * No inventa el dato que falta: si no hay consentimiento, lo dice.
 * ─────────────────────────────────────────────────────────────
 */

export type TipoRegistro =
  | 'cuenta'        // creó cuenta en el sitio
  | 'publicador'    // creó cuenta y publica
  | 'popup'         // dejó sus datos en la ventana emergente o la portada
  | 'propiedad'     // pidió información de una propiedad concreta
  | 'visita'        // pidió VER una propiedad: el más caliente de todos
  | 'valuacion'     // usó el valuador
  | 'contacto'      // formulario general de contacto
  | 'manual'        // lo dio de alta un administrador desde el panel
  | 'interesado'    // dejó sus datos sin que se sepa por dónde

export type Registro = {
  id: string
  tipo: TipoRegistro
  nombre: string | null
  email: string | null
  telefono: string | null
  mensaje: string | null
  propiedad: string | null
  /** Tabla de la que salió. Útil mientras haya cuatro. */
  fuente: string
  /** Por dónde entró: ficha, portada, valuador, contacto, cuenta… */
  origen?: string | null
  /** Versión del aviso que aceptó, o null si nadie la registró. */
  consentimiento: string | null
  creado: string | null
}

const texto = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/** Lee una tabla sin tumbar la respuesta si no existe o falla. */
async function leer(
  db: ReturnType<typeof supabaseAdmin>,
  tabla: string,
  orden: string,
): Promise<{ filas: Record<string, unknown>[]; fallo: string | null }> {
  try {
    const { data, error } = await db
      .from(tabla)
      .select('*')
      .order(orden, { ascending: false })
      .limit(1000)
    if (error) return { filas: [], fallo: error.message }
    return { filas: (data ?? []) as Record<string, unknown>[], fallo: null }
  } catch (e) {
    return { filas: [], fallo: e instanceof Error ? e.message : 'error' }
  }
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const db = supabaseAdmin()

  // En paralelo: una tabla lenta no debe retrasar a las otras tres.
  const [usuarios, solicitudes, leads, contactos] = await Promise.all([
    leer(db, 'usuarios', 'creado_en'),
    leer(db, 'solicitudes_contacto', 'creado_en'),
    leer(db, 'leads', 'created_at'),
    leer(db, 'contactos', 'created_at'),
  ])

  const registros: Registro[] = []

  for (const u of usuarios.filas) {
    registros.push({
      id: `usuario:${u.uid}`,
      tipo: u.rol === 'publicador' ? 'publicador' : 'cuenta',
      nombre: texto(u.nombre),
      email: texto(u.email),
      telefono: texto(u.telefono) ?? texto(u.whatsapp),
      mensaje: null,
      propiedad: null,
      fuente: 'usuarios',
      origen: 'cuenta',
      // Aceptar los términos al registrarse es otro consentimiento distinto
      // del de compartir datos con un anunciante. No se mezclan.
      consentimiento: null,
      creado: texto(u.creado_en),
    })
  }

  for (const s of solicitudes.filas) {
    registros.push({
      id: `solicitud:${s.id}`,
      // Pidió información —o una visita— de una propiedad concreta, con sesión
      // iniciada. Es el registro de más valor que produce el sitio.
      tipo: s.tipo === 'visita' ? 'visita' : 'propiedad',
      nombre: texto(s.nombre),
      email: texto(s.email),
      telefono: texto(s.telefono),
      mensaje: texto(s.mensaje),
      propiedad: texto(s.propiedad_id),
      fuente: 'solicitudes_contacto',
      origen: 'ficha',
      consentimiento: texto(s.consentimiento_version),
      creado: texto(s.creado_en),
    })
  }

  for (const l of leads.filas) {
    // Sin la migración 08, `interes`, `origen` y el consentimiento viajan
    // plegados dentro de `mensaje` (ver lib/columnas). Se despliegan aquí para
    // que el panel no marque «sin consentimiento» a quien sí lo dio.
    const plegado = desplegar(texto(l.mensaje), CAMPOS_PLEGADOS_LEAD)
    const interes = texto(l.interes) ?? plegado.campos.interes ?? ''
    const origen = texto(l.origen) ?? plegado.campos.origen ?? ''
    registros.push({
      id: `lead:${l.id}`,
      // El valuador escribe su intención en `interes`. Es la única forma de
      // distinguirlo hoy, porque todo cae en la misma tabla.
      tipo: tipoDeLead(origen, interes, texto(l.propiedad_id)),
      origen: origen || null,
      nombre: texto(l.nombre),
      email: texto(l.email),
      telefono: texto(l.telefono),
      mensaje: plegado.texto ?? (interes || null),
      propiedad: texto(l.propiedad_id) ?? texto(l.propiedad),
      fuente: 'leads',
      consentimiento: texto(l.consentimiento_version) ?? plegado.campos.consentimiento_version ?? null,
      creado: texto(l.created_at),
    })
  }

  for (const c of contactos.filas) {
    registros.push({
      id: `contacto:${c.id}`,
      tipo: 'contacto',
      nombre: texto(c.nombre),
      email: texto(c.email),
      telefono: texto(c.telefono),
      mensaje: texto(c.mensaje),
      propiedad: null,
      fuente: 'contactos',
      origen: 'contacto',
      consentimiento: texto(c.consentimiento_version),
      creado: texto(c.created_at),
    })
  }

  registros.sort((a, b) => (b.creado ?? '').localeCompare(a.creado ?? ''))

  const fallos = [usuarios, solicitudes, leads, contactos]
    .map((r) => r.fallo)
    .filter((f): f is string => Boolean(f))

  return NextResponse.json({
    registros,
    total: registros.length,
    sinConsentimiento: registros.filter((r) => r.tipo !== 'cuenta' && r.tipo !== 'publicador' && !r.consentimiento).length,
    // Si alguna tabla falló, se dice. Devolver una lista corta sin avisar
    // haría creer que hay menos gente de la que hay.
    fallos: fallos.length > 0 ? fallos : undefined,
  })
}

/**
 * POST /api/admin/registros — alta manual de un registro. Sólo admin.
 *
 * ─────────────────────────────────────────────────────────────
 * PARA QUÉ, Y DÓNDE SE GUARDA
 *
 * Alguien llama por teléfono o llega a la oficina: ese contacto no entró por
 * ningún formulario y hasta ahora no había forma de anotarlo sin abrir Supabase.
 * Se guarda en `leads` con `origen: 'manual'`, así que sale en la misma tabla
 * que los demás y se distingue de un «sin origen».
 *
 * ─────────────────────────────────────────────────────────────
 * EL AVISO DE PRIVACIDAD NO SE DA POR HECHO
 *
 * Quien llena un formulario del sitio acepta el aviso con una casilla, y eso
 * queda guardado. Por teléfono no ocurre: el administrador marca si **le
 * informó** el aviso, y si no lo marca, el registro queda como «sin registrar»
 * —igual que los que llegan de los formularios antiguos—. Marcarlo por defecto
 * sería fabricar un consentimiento que nadie dio.
 * ─────────────────────────────────────────────────────────────
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const leer = (clave: string, maximo: number): string => {
    const v = cuerpo[clave]
    return typeof v === 'string' ? v.trim().slice(0, maximo) : ''
  }

  const nombre = leer('nombre', 120)
  const telefono = soloDigitosTelefono(leer('telefono', 30))
  const email = leer('email', 160)
  const interes = leer('interes', 200)
  const mensaje = leer('mensaje', 1000)
  const propiedadId = leer('propiedadId', 120)
  const avisoInformado = cuerpo.avisoInformado === true

  if (nombre.length < 2) {
    return NextResponse.json({ error: 'Escribe el nombre de la persona.' }, { status: 400 })
  }
  if (!telefono && !email) {
    return NextResponse.json({ error: 'Hace falta un teléfono o un correo para poder atenderlo.' }, { status: 400 })
  }
  if (telefono && telefono.length !== 10) {
    return NextResponse.json({ error: 'El teléfono debe tener 10 dígitos.' }, { status: 400 })
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: 'Ese correo no parece válido.' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Si se elige una propiedad, tiene que existir: un id inventado dejaría el
  // registro apuntando a una ficha que no abre.
  if (propiedadId) {
    const { data: propiedad, error } = await db.from('propiedades').select('id').eq('id', propiedadId).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!propiedad) return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 400 })
  }

  const { data, error } = await db
    .from('leads')
    .insert({
      nombre,
      telefono: telefono || null,
      email: email || null,
      mensaje: mensaje || null,
      interes: interes || null,
      origen: 'manual',
      propiedad_id: propiedadId || null,
      privacy_accepted: avisoInformado,
      consentimiento_version: avisoInformado ? VERSION_CONSENTIMIENTO : null,
    })
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await registrar({
    actor: perfil,
    accion: 'registro.crear_manual',
    entidad: 'leads',
    entidadId: String(data?.id ?? ''),
    despues: { nombre, telefono: telefono || null, email: email || null, propiedad_id: propiedadId || null, aviso_informado: avisoInformado },
  })

  return NextResponse.json({ ok: true, id: data?.id ?? null })
}
