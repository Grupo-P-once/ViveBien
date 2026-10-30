import { NextResponse } from 'next/server'
import { supabaseAdmin, exigir } from '@/lib/auth-server'
import { portalCerradoParaEscribir } from '@/lib/portal/exigir-portal'
import { registrar } from '@/lib/auditoria'
import { frenarAsync, TOPES } from '@/lib/limites'
import { estadoDeAceptacion } from '@/lib/comision-servidor'
import { MENSAJE_COMISION_NO_DISPONIBLE } from '@/lib/comision-aceptacion'

/**
 * /api/comision/aceptacion — la propuesta de comisión que un publicador tiene que aceptar antes de enviar o publicar (migración 39).
 *
 *  GET  → { requerida, aceptada, texto }. `texto` solo viene si la aceptación es requerida (con el módulo apagado: { requerida: false }).
 *  POST → { texto_id, hash }: registra que esta persona leyó y aceptó ESA versión. Si el texto cambió mientras lo leía: 409 `texto_cambio`.
 *
 * Con el módulo `commissionEngine` apagado, o sin texto vigente, no hay nada que aceptar. Si está encendido y no se puede comprobar: 503.
 */

const NO_DISPONIBLE = () => NextResponse.json({ error: MENSAJE_COMISION_NO_DISPONIBLE, codigo: 'no_disponible' }, { status: 503 })

export async function GET(req: Request) {
  const auth = await exigir(req, 'propiedad.gestionar_propias')
  if (auth.error) return auth.error
  const r = await estadoDeAceptacion(auth.perfil)
  if (!r.ok) return NO_DISPONIBLE()
  return NextResponse.json(r.estado)
}

export async function POST(req: Request) {
  const auth = await exigir(req, 'propiedad.gestionar_propias')
  if (auth.error) return auth.error
  const { perfil } = auth
  const cerrado = await portalCerradoParaEscribir(perfil)
  if (cerrado) return cerrado
  const frenado = await frenarAsync(`comision:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado

  const r = await estadoDeAceptacion(perfil)
  if (!r.ok) return NO_DISPONIBLE()
  const { requerida, aceptada, texto } = r.estado
  if (!requerida || !texto) return NextResponse.json({ ok: true, requerida: false })
  if (aceptada) return NextResponse.json({ ok: true, requerida: true, aceptada: true })

  const cuerpo = (await req.json().catch(() => ({}))) as { texto_id?: unknown; hash?: unknown }
  if (cuerpo.texto_id !== texto.id || cuerpo.hash !== texto.hash) {
    return NextResponse.json({ error: 'El texto cambió mientras lo leías. Léelo de nuevo antes de aceptar.', codigo: 'texto_cambio' }, { status: 409 })
  }

  const agente = (req.headers.get('user-agent') ?? '').slice(0, 300) || null
  const w = await supabaseAdmin().from('comision_aceptaciones').insert({ uid: perfil.uid, texto_id: texto.id, version: texto.version, hash: texto.hash, agente })
  // 23505 = ya la había aceptado (doble clic): idempotente.
  if (w.error && (w.error as { code?: string }).code !== '23505') return NO_DISPONIBLE()

  await registrar({ actor: perfil, accion: 'comision.aceptada', entidad: 'comision_texto', entidadId: texto.id, despues: { version: texto.version, hash: texto.hash } })
  return NextResponse.json({ ok: true, requerida: true, aceptada: true }, { status: 201 })
}
