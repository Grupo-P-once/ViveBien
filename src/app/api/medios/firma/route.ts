import { NextResponse } from 'next/server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { tieneCapacidad } from '@/lib/acceso/capacidades'
import { autorizar, camposFirmados, credencialesCloudinary, destinoDe, leerPedido, urlDeSubida } from '@/lib/medios/firma'

/**
 * POST /api/medios/firma — firma UNA subida a Cloudinary (SEC-05, ADR-0008).
 *
 * El navegador pide «quiero subir una foto de la propiedad X» y recibe los
 * campos firmados: carpeta, nombre y formatos los decide el servidor. Con eso
 * sube directo a Cloudinary (el archivo no pasa por aquí, que en serverless
 * costaría memoria y tiempo). Una firma por archivo: cada uno lleva su nombre.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // V-1.1.87 (etapa 1): por el autorizador central, y ANTES del tope. Esta
  // ruta entrega firmas de subida a Cloudinary: una cuenta eliminada no debe
  // conseguir ninguna, y hasta ahora sólo se miraba `suspendido` a mano.
  const chequeo = await exigir(req, 'cuenta.propia')
  if (chequeo.error) return chequeo.error
  const { perfil } = chequeo

  // Tope por cuenta: una firma por foto; nadie sube cientos en diez minutos.
  const frenado = await frenarAsync(`medios:${perfil.uid}`, TOPES.medios)
  if (frenado) return frenado

  const pedido = leerPedido(await req.json().catch(() => null))
  if (!pedido) return NextResponse.json({ error: 'Pedido de subida no válido.' }, { status: 400 })

  let prop: { owner_id: string | null; tipo: string | null; estado_pub: string | null } | null = null
  if (pedido.proposito === 'propiedad' && pedido.propiedadId) {
    const { data, error } = await supabaseAdmin()
      .from('propiedades')
      .select('owner_id, tipo, estado_pub')
      .eq('id', pedido.propiedadId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: 'No se pudo comprobar la propiedad.' }, { status: 500 })
    prop = data
  }

  const permiso = autorizar(pedido, { uid: perfil.uid, rol: perfil.rol, editaPublicadas: tieneCapacidad(perfil, 'editar_publicadas') }, prop)
  if (!permiso.ok) return NextResponse.json({ error: permiso.motivo }, { status: permiso.status })

  const cred = credencialesCloudinary()
  if (!cred) {
    console.error('[medios] faltan CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET')
    return NextResponse.json({ error: 'La subida de fotos no está disponible. Avísanos.' }, { status: 503 })
  }

  return NextResponse.json({
    url: urlDeSubida(cred.nube),
    // La carpeta se deriva en el servidor: dueña de la propiedad (fila de la base) o, si no hay, la sesión validada; nunca algo del navegador.
    campos: camposFirmados(destinoDe(pedido, prop, { uid: perfil.uid, secreto: cred.secreto }), cred),
  })
}
