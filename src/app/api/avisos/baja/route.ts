import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { verificarTokenDeBaja } from '@/lib/avisos-token'
import { NEGOCIO } from '@/lib/config/negocio'

/**
 * /api/avisos/baja?t=<token> — dejar de recibir las ALERTAS por correo con un clic, SIN iniciar sesión (derecho de oposición).
 *  GET  → una página de confirmación con un botón (un GET nunca cambia nada: los escáneres de correo abren los enlaces y apagarían los avisos sin que la persona quisiera).
 *  POST → apaga `correo_alertas` de esa cuenta (también es lo que dispara el botón «Cancelar suscripción» del cliente de correo, RFC 8058). Solo APAGA: el token no da acceso a nada más.
 * Un token inválido responde lo mismo que uno válido que ya se usó para no revelar nada sobre las cuentas.
 */
export const dynamic = 'force-dynamic'
const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" }
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
const pagina = (titulo: string, cuerpo: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)} · ${esc(NEGOCIO.nombreCorto)}</title><style>body{font-family:system-ui,sans-serif;background:#f3f0ea;margin:0;display:grid;place-items:center;min-height:100vh;color:#1a1a1a}main{background:#fff;border:1px solid #ece8e1;border-radius:16px;padding:28px;max-width:440px;margin:16px}h1{font-size:20px;margin:0 0 10px;color:#971010}p{font-size:15px;line-height:1.6;margin:0 0 16px}button,a.b{display:inline-block;background:#971010;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none}a.s{color:#1b365d;font-size:14px}</style></head><body><main>${cuerpo}</main></body></html>`

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t') ?? ''
  const v = verificarTokenDeBaja(t)
  if (!v.ok) return new NextResponse(pagina('Enlace no válido', '<h1>Este enlace ya no es válido</h1><p>Puedes cambiar tus avisos iniciando sesión en tu cuenta, en «Configuración».</p><a class="b" href="/portal/configuracion">Ir a Configuración</a>'), { status: 200, headers: HTML })
  return new NextResponse(pagina('Dejar de recibir avisos', `<h1>¿Dejar de recibir avisos por correo?</h1><p>Ya no te enviaremos las alertas de tus búsquedas guardadas ni las de baja de precio. Seguirás viéndolas dentro de tu cuenta.</p><form method="post" action="/api/avisos/baja?t=${encodeURIComponent(t)}"><button type="submit">Sí, dejar de recibirlos</button></form><p style="margin-top:14px"><a class="s" href="/">No, volver al inicio</a></p>`), { status: 200, headers: HTML })
}

export async function POST(req: Request) {
  const frenado = await frenarAsync(`baja-avisos:${origenDe(req)}`, TOPES.contacto)
  if (frenado) return frenado
  const t = new URL(req.url).searchParams.get('t') ?? ''
  const v = verificarTokenDeBaja(t)
  if (v.ok) {
    const db = supabaseAdmin()
    const ahora = new Date().toISOString()
    // Solo se APAGA (nunca se enciende): si no tenía fila, se crea con las alertas apagadas.
    const previo = await db.from('preferencias_notificacion').select('uid, correo_legal, consentimiento_alertas_en').eq('uid', v.uid).maybeSingle()
    const fila = previo.data as { correo_legal: boolean; consentimiento_alertas_en: string | null } | null
    const base = { uid: v.uid, correo_alertas: false, correo_legal: fila?.correo_legal ?? true, consentimiento_alertas_en: fila?.consentimiento_alertas_en ?? null, actualizado_en: ahora }
    // «Dejar de recibirlos» apaga TAMBIÉN el correo de baja de precio (el mismo enlace va en ambos correos). Si la migración 60 aún no existe, se apaga lo que hay (sin romper la baja).
    const conPrecio = await db.from('preferencias_notificacion').upsert({ ...base, correo_precio: false }, { onConflict: 'uid' })
    if (conPrecio.error) await db.from('preferencias_notificacion').upsert(base, { onConflict: 'uid' })
  }
  return new NextResponse(pagina('Listo', '<h1>Listo, ya no recibirás avisos por correo</h1><p>Si cambias de opinión, puedes volver a activarlos desde tu cuenta, en «Configuración».</p><a class="b" href="/portal/configuracion">Ir a Configuración</a>'), { status: 200, headers: HTML })
}
