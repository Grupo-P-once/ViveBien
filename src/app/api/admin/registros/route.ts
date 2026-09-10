import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/auth-server'

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
  | 'cuenta'        // se registró en el sitio
  | 'publicador'    // se registró y quiere publicar
  | 'interesado'    // preguntó por una propiedad concreta
  | 'valuacion'     // usó el valuador
  | 'contacto'      // formulario general

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
      // Aceptar los términos al registrarse es otro consentimiento distinto
      // del de compartir datos con un anunciante. No se mezclan.
      consentimiento: null,
      creado: texto(u.creado_en),
    })
  }

  for (const s of solicitudes.filas) {
    registros.push({
      id: `solicitud:${s.id}`,
      tipo: 'interesado',
      nombre: texto(s.nombre),
      email: texto(s.email),
      telefono: texto(s.telefono),
      mensaje: texto(s.mensaje),
      propiedad: texto(s.propiedad_id),
      fuente: 'solicitudes_contacto',
      consentimiento: texto(s.consentimiento_version),
      creado: texto(s.creado_en),
    })
  }

  for (const l of leads.filas) {
    const interes = texto(l.interes) ?? ''
    registros.push({
      id: `lead:${l.id}`,
      // El valuador escribe su intención en `interes`. Es la única forma de
      // distinguirlo hoy, porque todo cae en la misma tabla.
      tipo: /valu/i.test(interes) ? 'valuacion' : 'interesado',
      nombre: texto(l.nombre),
      email: texto(l.email),
      telefono: texto(l.telefono),
      mensaje: texto(l.mensaje) ?? (interes || null),
      propiedad: texto(l.propiedad_id) ?? texto(l.propiedad),
      fuente: 'leads',
      consentimiento: texto(l.consentimiento_version),
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
