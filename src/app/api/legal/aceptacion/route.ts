import { NextResponse } from 'next/server'
import { supabaseAdmin, exigir } from '@/lib/auth-server'
import { portalCerradoParaEscribir } from '@/lib/portal/exigir-portal'
import { registrar } from '@/lib/auditoria'
import { frenarAsync, TOPES } from '@/lib/limites'
import { estadoDeAceptacionLegal } from '@/lib/aceptacion-legal-servidor'
import { MENSAJE_LEGAL_NO_DISPONIBLE, sanearAceptacionLegal, VERSIONES } from '@/lib/aceptacion-legal'

/**
 * /api/legal/aceptacion — aceptación de los Términos y Condiciones y del Aviso de Privacidad antes de enviar una propiedad (migración 44).
 *
 *  GET  → { requerida, pendientes, documentos[] }. Con el módulo `legalAcceptance` apagado, o para el equipo: { requerida: false }.
 *  POST → { documentos: ['terminos' | 'privacidad'], versiones: { terminos, privacidad } }: registra que esta persona aceptó ESAS versiones. Si la
 *         versión que vio ya no es la vigente: 409 `version_cambio`. Aceptar de nuevo lo ya aceptado es idempotente.
 *
 * Si el módulo está encendido y no se puede comprobar (migración sin aplicar): 503 y no cambia nada.
 */

const NO_DISPONIBLE = () => NextResponse.json({ error: MENSAJE_LEGAL_NO_DISPONIBLE, codigo: 'no_disponible' }, { status: 503 })

export async function GET(req: Request) {
  const auth = await exigir(req, 'propiedad.gestionar_propias')
  if (auth.error) return auth.error
  const r = await estadoDeAceptacionLegal(auth.perfil)
  if (!r.ok) return NO_DISPONIBLE()
  return NextResponse.json(r.estado)
}

export async function POST(req: Request) {
  const auth = await exigir(req, 'propiedad.gestionar_propias')
  if (auth.error) return auth.error
  const { perfil } = auth
  const cerrado = await portalCerradoParaEscribir(perfil)
  if (cerrado) return cerrado
  const frenado = await frenarAsync(`legal:${perfil.uid}`, TOPES.edicion)
  if (frenado) return frenado

  const e = await estadoDeAceptacionLegal(perfil)
  if (!e.ok) return NO_DISPONIBLE()
  if (!e.estado.requerida) return NextResponse.json({ ok: true, requerida: false })

  const s = sanearAceptacionLegal(await req.json().catch(() => ({})))
  if (!s.ok) return NextResponse.json({ error: s.error, codigo: s.codigo }, { status: s.codigo === 'version_cambio' ? 409 : 400 })

  const agente = (req.headers.get('user-agent') ?? '').slice(0, 300) || null
  const pendientes = s.documentos.filter((d) => e.estado.pendientes.includes(d))
  for (const documento of pendientes) {
    const w = await supabaseAdmin().from('legal_aceptaciones').insert({ uid: perfil.uid, documento, version: VERSIONES[documento], agente })
    // 23505 = ya la había aceptado (doble clic o dos pestañas): idempotente.
    if (w.error && (w.error as { code?: string }).code !== '23505') return NO_DISPONIBLE()
  }
  if (pendientes.length) {
    await registrar({ actor: perfil, accion: 'legal.aceptada', entidad: 'cuenta', entidadId: perfil.uid, despues: { documentos: pendientes, versiones: Object.fromEntries(pendientes.map((d) => [d, VERSIONES[d]])) } })
  }
  const despues = await estadoDeAceptacionLegal(perfil)
  return NextResponse.json({ ok: true, ...(despues.ok ? despues.estado : {}) }, { status: pendientes.length ? 201 : 200 })
}
