import { clienteServidor } from '@/lib/supabase-servidor'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { registrar } from '@/lib/auditoria'
import { cambiarEstadoDePropiedad } from '@/lib/cambiar-estado-propiedad'
import { calcularCompletitud, decidirPublicacionAutomatica, esEstatusComercial, quitarCamposReservados } from '@/lib/publicacion'
import { sanearContenido } from '@/lib/sanear-propiedad'
import { refrescarCatalogo } from '@/lib/refrescar'
import { escribirTolerante } from '@/lib/columnas'
import { nombrarSiEstaPublicada } from '@/lib/asignar-slug'

/** Respuestas con datos internos: ningún intermediario las guarda. */
const PRIVADO = { 'Cache-Control': 'private, no-store' }

// Para escrituras: service role key. IGNORA RLS por completo, así que sólo puede
// usarse después de que requireAdmin() haya validado la sesión.
function adminClient() {
  return clienteServidor(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/admin/propiedades — listado COMPLETO para el panel. Sólo administradores (E-35 / QA-011).
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ YA NO TIENE LECTURA PÚBLICA
 *
 * Hasta E-34, sin sesión de administrador esta ruta devolvía «lo publicado» como lectura pública. Era una segunda puerta de entrada al
 * catálogo, con otro nombre, SIN caché y SIN tope: cada llamada anónima consultaba la base, y una ruta «admin» que contesta a cualquiera
 * confunde a quien revisa la superficie de ataque. La lectura pública es `/api/catalogo` (D-59, con copia de respaldo y caché).
 *
 * Ahora: 401 sin sesión, 403 si la sesión no es de administrador, y 200 con TODO el inventario (borradores, en revisión, pausadas y
 * archivadas incluidas) para `admin` y `super_admin`. Los consumidores del portal del cliente pasaron a `/api/catalogo`.
 * ─────────────────────────────────────────────────────────────
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const { data, error } = await adminClient()
    .from('propiedades')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: PRIVADO })
  return NextResponse.json(data, { headers: PRIVADO })
}

/**
 * POST /api/admin/propiedades — crear nueva (alta heredada del panel clásico). Sólo administradores.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ YA NO INSERTA EL CUERPO TAL CUAL
 *
 * `estado_pub` tiene `DEFAULT 'publicada'` en la base. Esta ruta insertaba lo que llegara, así que un alta SIN `estado_pub`
 * quedaba PUBLICADA sin mirar nada: ni lo mínimo del anuncio, ni bitácora, ni `publicada_en`. Así quedaron `sanjuan` y
 * `tzula-castillos`: publicadas, sin fecha de publicación y sin una sola fila de auditoría.
 *
 * Ahora: el estado lo decide el servidor con la MISMA regla que `/api/propiedades/[id]/estado` (`decidirPublicacionAutomatica`),
 * lo que no debe escribir el cliente se descarta (`quitarCamposReservados`), la propiedad es del admin que la crea, y todo
 * queda en la bitácora. Si no se pide `publicada` explícitamente, nace BORRADOR.
 * ─────────────────────────────────────────────────────────────
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Cuerpo no válido.' }, { status: 400 })
  }
  const db = adminClient()

  // Valores validados y sólo columnas de contenido (un administrador conserva su libertad de origen de medios, no la de escribir basura).
  const saneo = sanearContenido(quitarCamposReservados(body), { moderador: true, actuales: null, nube: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME })
  if (saneo.errores.length) {
    return NextResponse.json({ error: `Hay datos que no son válidos: ${saneo.errores.join('; ')}.`, campos: saneo.errores }, { status: 400 })
  }
  const datos = saneo.datos
  // El panel clásico ponía un id legible (`nave-industrial-san-juan`); se respeta si es una clave limpia. Si no, UUID.
  const idPedido = typeof body.id === 'string' ? body.id.trim() : ''
  const id = /^[a-z0-9][a-z0-9-]{1,79}$/.test(idPedido) ? idPedido : crypto.randomUUID()
  if ('estatus' in datos && !esEstatusComercial(datos.estatus)) {
    return NextResponse.json({ error: 'Esa situación comercial no existe.' }, { status: 400 })
  }

  // Publicar es una decisión explícita y pasa por las mismas comprobaciones que desde la web.
  let estado: 'publicada' | 'borrador' = 'borrador'
  if (body.estado_pub === 'publicada') {
    const d = decidirPublicacionAutomatica({ rol: perfil.rol, activa: true, publicaSinRevision: false, prop: datos })
    if (!d.ok) return NextResponse.json({ error: d.motivo }, { status: 400 })
    if (d.destino !== 'publicada') return NextResponse.json({ error: 'Tu cuenta no puede publicar directamente.' }, { status: 403 })
    estado = 'publicada'
  }

  const ahora = new Date().toISOString()
  // SIEMPRE nace borrador (jamás por el DEFAULT de la base): publicar es una TRANSICIÓN y pasa por la función atómica de abajo.
  const fila = {
    ...datos,
    id,
    owner_id: perfil.uid,
    estado_pub: 'borrador',
    estatus: datos.estatus ?? 'disponible',
    completitud: calcularCompletitud(datos),
  }

  // Tolerante, como el PATCH: si una columna todavía no existe, se guarda el
  // resto y se AVISA (antes, el alta entera daba 500 y no se sabía por qué).
  const r = await escribirTolerante((f) => db.from('propiedades').insert(f), fila)
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 })

  // Nombre público. Este era el hueco: el panel clásico publica escribiendo
  // directo, sin pasar por /estado, y así quedaron dos terrenos en
  // `/propiedades/propiedad-sin-titulo-…` (V-1.1.84).
  await nombrarSiEstaPublicada(db, id)

  refrescarCatalogo()

  // La alta (un INSERT) se registra aparte; la TRANSICIÓN a publicada es atómica con su bitácora (migración 33).
  await registrar({ actor: perfil, accion: 'propiedad.crear', entidad: 'propiedades', entidadId: id, despues: { estado_pub: 'borrador', titulo: datos.titulo ?? null, canal: 'panel-clasico' } })
  if (estado === 'publicada') {
    const cambio = await cambiarEstadoDePropiedad(db, {
      id,
      antes: 'borrador',
      estado: 'publicada',
      cambios: { publicada_en: ahora, revisado_por: perfil.email ?? perfil.uid, revisado_en: ahora },
      actor: perfil,
      accion: 'propiedad.publicada',
      auditAntes: { estado_pub: 'borrador' },
      auditDespues: { estado_pub: estado, canal: 'panel-clasico' },
    })
    if (!cambio.ok) {
      // Falla CERRADO: la propiedad quedó como BORRADOR (no se publica sin su huella). Se dice, no se finge.
      return NextResponse.json({ error: `La propiedad se creó como borrador pero no se pudo publicar: ${cambio.mensaje}`, id, creada: true }, { status: cambio.status })
    }
    await nombrarSiEstaPublicada(db, id)
    refrescarCatalogo()
  }

  return NextResponse.json(
    r.omitidas.length
      ? { ok: true, id, omitidas: r.omitidas, warning: `No se guardó ${r.omitidas.join(', ')}: falta aplicar esa migración.` }
      : { ok: true, id },
  )
}
