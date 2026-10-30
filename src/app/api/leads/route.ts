import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { puede } from '@/lib/acceso/permisos'

/**
 * GET /api/leads — solicitudes de contacto.
 *
 * Un admin recibe todas; cualquier otro usuario autenticado recibe únicamente
 * las suyas. El filtro usa el email del token verificado, nunca un parámetro
 * de la petición: si viniera de la URL, cualquiera podría pedir los leads de
 * otra persona escribiendo su correo.
 *
 * Antes el dashboard leía la tabla directamente con la anon key, que viaja en
 * el bundle del navegador.
 */
/** Lo que ve el dueño de una solicitud en «Mis solicitudes». */
const COLUMNAS_LEAD_PROPIO = 'id, interes, mensaje, propiedad_id, created_at'

export async function GET(req: Request) {
  // V-1.1.87 (etapa 1): por el autorizador central. Sigue entrando cualquier
  // cuenta con sesión —quien no es admin ve sólo lo suyo—, pero el estado lo
  // decide un único sitio.
  const chequeo = await exigir(req, 'cuenta.propia')
  if (chequeo.error) return chequeo.error
  const { perfil } = chequeo
  const user = perfil

  const db = supabaseAdmin()
  const verTodos = puede(perfil, 'leads.ver_todos')
  // Quien no es admin recibe sólo lo que su pantalla pinta: nunca `select('*')`
  // (consentimiento, origen y otras columnas internas del flujo comercial).
  let q = db.from('leads').select(verTodos ? '*' : COLUMNAS_LEAD_PROPIO).order('created_at', { ascending: false })

  // V-1.1.76: el admin lo decide el perfil (que exige correo verificado para
  // la lista de administradores), no el correo del token a secas.
  // Las consultas que hizo CON SESIÓN viven en `solicitudes_contacto` (ligadas a la cuenta, por uid: no dependen de ningún correo). La
  // ficha las crea con `/api/contacto`; sin esta lectura la vista clásica del dashboard («Mis consultas enviadas») no las vería.
  let propias: Array<{ id: string; interes: unknown; mensaje: unknown; propiedad_id: unknown; created_at: unknown }> = []
  if (!verTodos) {
    const { data: sols } = await db
      .from('solicitudes_contacto')
      .select('id, propiedad_titulo, mensaje, propiedad_id, creado_en')
      .eq('cliente_uid', user.uid)
      .order('creado_en', { ascending: false })
      .limit(100)
    propias = ((sols ?? []) as unknown as Array<{ id: number; propiedad_titulo: unknown; mensaje: unknown; propiedad_id: unknown; creado_en: unknown }>)
      .map((s) => ({ id: `s-${s.id}`, interes: s.propiedad_titulo, mensaje: s.mensaje, propiedad_id: s.propiedad_id, created_at: s.creado_en }))
  }

  if (!verTodos) {
    // Filtrar por correo sólo si está verificado: si no, cualquiera podría
    // registrarse con el correo de otra persona y leer sus solicitudes.
    if (!user.email || !user.emailVerified) return NextResponse.json(propias)
    q = q.eq('email', user.email)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (verTodos) return NextResponse.json(data ?? [])
  // Lo suyo: las de la cuenta + los formularios que dejó con su correo verificado, de la más nueva a la más vieja.
  const todas = [...propias, ...((data ?? []) as unknown as Array<{ created_at?: unknown }>)] as Array<{ created_at?: unknown }>
  todas.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
  return NextResponse.json(todas)
}
