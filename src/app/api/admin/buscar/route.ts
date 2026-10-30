import { NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/auth-server'
import { condicionesIlike, digitosDe, limpiarConsulta } from '@/lib/admin/busqueda'
import { nombreDe } from '@/lib/propiedad-publica'

/**
 * GET /api/admin/buscar?q= — búsqueda global del panel. Sólo admin.
 *
 * Busca a la vez en propiedades, registros (leads, solicitudes y mensajes de
 * contacto) y usuarios. Lo escrito pasa antes por `limpiarConsulta`: en un
 * filtro `.or()` de PostgREST una coma o un paréntesis añadirían condiciones.
 *
 * Las páginas del panel se buscan en el navegador: son una lista fija.
 */

export const dynamic = 'force-dynamic'

const POR_GRUPO = 5

type Resultado = { id: string; titulo: string; detalle: string | null; enlace: string }

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const q = limpiarConsulta(new URL(req.url).searchParams.get('q'))
  if (!q) return NextResponse.json({ q: '', propiedades: [], registros: [], usuarios: [] })

  const digitos = digitosDe(q)
  const conTelefono = (campos: string[]) =>
    condicionesIlike(campos, q) + (digitos ? `,${condicionesIlike(['telefono'], digitos)}` : '')

  const db = supabaseAdmin()
  const [props, leads, solicitudes, contactos, usuarios] = await Promise.all([
    db.from('propiedades')
      .select('id, titulo, tipo, operacion, ubicacion, folio, estado_pub')
      .or(condicionesIlike(['titulo', 'folio', 'ubicacion', 'colonia', 'ciudad'], q))
      .limit(POR_GRUPO),
    db.from('leads').select('id, nombre, email, telefono, interes').or(conTelefono(['nombre', 'email', 'interes'])).limit(POR_GRUPO),
    db.from('solicitudes_contacto').select('id, nombre, email, telefono, propiedad_titulo').or(conTelefono(['nombre', 'email', 'propiedad_titulo'])).limit(POR_GRUPO),
    db.from('contactos').select('id, nombre, email, telefono').or(conTelefono(['nombre', 'email'])).limit(POR_GRUPO),
    db.from('usuarios').select('uid, nombre, email, telefono, rol').or(conTelefono(['nombre', 'email'])).limit(POR_GRUPO),
  ])

  const fallos = [props.error, leads.error, solicitudes.error, contactos.error, usuarios.error].filter(Boolean)
  if (fallos.length) console.error('[admin/buscar]', fallos.map((e) => e?.message).join(' · '))

  const enlaceRegistros = `/admin/registros?q=${encodeURIComponent(q)}`

  const propiedades: Resultado[] = (props.data ?? []).map((p) => ({
    id: p.id as string,
    titulo: nombreDe(p),
    detalle: [texto(p.folio), texto(p.ubicacion)].filter(Boolean).join(' · ') || null,
    enlace: `/admin/propiedades?q=${encodeURIComponent(texto(p.folio) ?? q)}`,
  }))

  const registros: Resultado[] = [
    ...(leads.data ?? []).map((l) => ({
      id: `lead:${l.id}`, titulo: texto(l.nombre) ?? 'Sin nombre', detalle: texto(l.email) ?? texto(l.telefono), enlace: enlaceRegistros,
    })),
    ...(solicitudes.data ?? []).map((s) => ({
      id: `solicitud:${s.id}`, titulo: texto(s.nombre) ?? 'Sin nombre', detalle: texto(s.propiedad_titulo) ?? texto(s.email), enlace: enlaceRegistros,
    })),
    ...(contactos.data ?? []).map((c) => ({
      id: `contacto:${c.id}`, titulo: texto(c.nombre) ?? 'Sin nombre', detalle: texto(c.email) ?? texto(c.telefono), enlace: enlaceRegistros,
    })),
  ].slice(0, POR_GRUPO)

  const listaUsuarios: Resultado[] = (usuarios.data ?? []).map((u) => ({
    id: u.uid as string,
    titulo: texto(u.nombre) ?? texto(u.email) ?? 'Sin nombre',
    detalle: texto(u.nombre) ? texto(u.email) : null,
    enlace: `/admin/usuarios?q=${encodeURIComponent(texto(u.email) ?? q)}`,
  }))

  return NextResponse.json({ q, propiedades, registros, usuarios: listaUsuarios, error: fallos.length > 0 })
}
