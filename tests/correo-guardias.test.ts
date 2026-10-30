import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * D-80 — guardias estáticas del sistema de correo. Leen el código; no lo ejecutan.
 * Fallan si alguien: expone la clave de Resend, importa código de servidor en el navegador, abre un envío a destinatarios
 * arbitrarios, quita el límite o la verificación del webhook, o crea tablas de correo abiertas.
 */
const RAIZ = join(__dirname, '..')
const SRC = join(RAIZ, 'src')
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8')
const codigo = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
function archivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) archivos(p, acc)
    else if (/\.(ts|tsx)$/.test(n)) acc.push(p)
  }
  return acc
}
const rel = (p: string) => relative(RAIZ, p).split('\\').join('/')
const TODOS = archivos(SRC)
const RUTAS = TODOS.filter((f) => /src[\\/]app[\\/]api[\\/]correo[\\/].*route\.ts$/.test(f))
const SERVIDOR = ['enviar', 'suscripcion', 'seguridad', 'tarea', 'transaccionales']

describe('secretos: la clave de Resend y el secreto de los enlaces sólo viven en el servidor', () => {
  it('ninguna variable pública (NEXT_PUBLIC_) lleva la clave, el secreto o el webhook de correo', () => {
    for (const f of TODOS) expect(codigo(readFileSync(f, 'utf8')), rel(f)).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(RESEND|CORREO_SECRETO|WEBHOOK)/)
    if (existsSync(join(RAIZ, '.env.example'))) expect(leer('.env.example')).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(RESEND|CORREO_SECRETO)/)
  })

  it('ningún componente de cliente ("use client") importa los módulos de servidor del correo', () => {
    const malos = TODOS.filter((f) => /^['"]use client['"]/m.test(readFileSync(f, 'utf8').slice(0, 200)))
      .filter((f) => SERVIDOR.some((m) => new RegExp(`from ['"][^'"]*correo/${m}['"]`).test(readFileSync(f, 'utf8'))))
      .map(rel)
    expect(malos).toEqual([])
  })

  it('RESEND_API_KEY, CORREO_SECRETO y RESEND_WEBHOOK_SECRET sólo se leen en el módulo de configuración (y en los diagnósticos que comprueban que EXISTAN)', () => {
    const lectores = TODOS.filter((f) => /process\.env\.(RESEND_API_KEY|CORREO_SECRETO|RESEND_WEBHOOK_SECRET)/.test(codigo(readFileSync(f, 'utf8')))).map(rel).sort()
    expect(lectores.filter((f) => !['src/lib/correo/config.ts', 'src/lib/alertas.ts', 'src/lib/salud-diagnostico.ts', 'src/app/api/alertas/resumen/route.ts'].includes(f))).toEqual([])
  })

  it('los registros del módulo de correo no imprimen direcciones, cuerpos, claves ni tokens', () => {
    for (const f of TODOS.filter((x) => /[\\/]lib[\\/]correo[\\/]|api[\\/]correo[\\/]/.test(x))) {
      for (const l of readFileSync(f, 'utf8').split('\n')) {
        if (!/console\.(error|warn|log|info)\(/.test(l) || /^\s*(\*|\/\/)/.test(l)) continue
        const resto = l.slice(l.indexOf('console.')).replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '')
        expect(resto, `${rel(f)}: ${l.trim()}`).not.toMatch(/\b(para|correo|email|html|texto|cuerpo|token|clave|secreto|resendKey)\b/i)
      }
    }
  })
})

describe('las rutas /api/correo', () => {
  it('existen las seis y la carpeta está marcada como privada (Cache-Control private, no-store)', () => {
    expect(RUTAS.map(rel).sort()).toEqual([
      'src/app/api/correo/baja/route.ts', 'src/app/api/correo/confirmar/route.ts', 'src/app/api/correo/preferencias/route.ts',
      'src/app/api/correo/suscribir/route.ts', 'src/app/api/correo/tarea/route.ts', 'src/app/api/correo/webhook/route.ts',
    ])
    expect(leer('next.config.ts')).toMatch(/"\/api\/correo\/:path\*"/)
  })

  it('toda escritura pública pasa por el limitador, acota el cuerpo y NO acepta destinatarios del cliente', () => {
    for (const f of RUTAS.filter((x) => !/tarea[\\/]route|preferencias[\\/]route/.test(x))) {
      const t = readFileSync(f, 'utf8')
      expect(t, rel(f)).toMatch(/frenarAsync\(/)
      expect(t, rel(f)).toMatch(/MAX_CUERPO/)
    }
    // el único destinatario posible es el correo del propio formulario (que sólo recibe una CONFIRMACIÓN) o el de la sesión
    expect(codigo(leer('src/app/api/correo/baja/route.ts'))).not.toMatch(/enviarCorreo|para:/)
    expect(codigo(leer('src/app/api/correo/confirmar/route.ts'))).not.toMatch(/enviarCorreo|para:/)
    expect(codigo(leer('src/app/api/correo/preferencias/route.ts'))).not.toMatch(/body\??\.correo|cuerpo\??\.correo|cuerpo\??\.email/)
  })

  it('el webhook verifica la firma ANTES de leer el JSON y responde 503 sin secreto; el cron exige CRON_SECRET en tiempo constante', () => {
    const w = codigo(leer('src/app/api/correo/webhook/route.ts'))
    expect(w.indexOf('verificarWebhook(')).toBeGreaterThan(-1)
    expect(w.indexOf('verificarWebhook(')).toBeLessThan(w.indexOf('JSON.parse'))
    expect(w).toMatch(/status: 503/)
    expect(w).toMatch(/limpiarTexto/)
    const c = codigo(leer('src/app/api/correo/tarea/route.ts'))
    expect(c).toMatch(/timingSafeEqual/)
    expect(c).toMatch(/CRON_SECRET/)
    expect(c).toMatch(/status: 401/)
  })

  it('CRON: se queda el cron diario existente (el del parte) y NO se añade ninguno para el correo (decisión del 29-oct: sin otro cron todavía)', () => {
    const v = JSON.parse(leer('vercel.json')) as { crons: Array<{ path: string; schedule: string }> }
    // Los dos que ya existían en producción; ninguno apunta a /api/correo/tarea.
    expect(v.crons.map((x) => x.path)).toEqual(['/api/alertas/resumen', '/api/alertas/contabilidad-quincenal'])
    expect(v.crons.find((x) => x.path === '/api/alertas/resumen')!.schedule).toBe('0 15 * * *') // una vez al día: lo que admite Vercel Hobby
  })
})

describe('integración con el resto del sitio', () => {
  it('la bienvenida sólo se dispara al CREAR la cuenta, después de responder y sin tumbar el alta', () => {
    const t = codigo(leer('src/app/api/usuarios/me/route.ts'))
    expect(t).toMatch(/if \(!yaExiste\) \{\s*despuesDeResponder\(\(\) => enviarBienvenida\(/)
    expect(t).toMatch(/verificado: user\.emailVerified/)
  })

  it('la confirmación de publicador sólo sale con el correo VERIFICADO de la sesión y sólo para esa solicitud', () => {
    const t = codigo(leer('src/app/api/registro-lead/route.ts'))
    expect(t).toMatch(/interes === INTERES_PUBLICAR/)
    expect(t).toMatch(/verifyIdToken\(req\)/)
    expect(t).toMatch(/correo: usuario\.email, verificado: usuario\.emailVerified/)
    expect(t).not.toMatch(/enviarConfirmacionPublicador\([^)]*body\./)
  })

  it('«Quiero publicar» y la ruta comparten UNA constante (no dos textos que puedan separarse)', () => {
    expect(codigo(leer('src/components/QuieroPublicar.tsx'))).toMatch(/interes: INTERES_PUBLICAR/)
    expect(codigo(leer('src/lib/correo/constantes.ts'))).toMatch(/INTERES_PUBLICAR = 'Quiere publicar una propiedad'/)
  })

  it('el aviso interno de nuevos interesados NO cambió (sigue yendo al correo institucional)', () => {
    expect(codigo(leer('src/lib/aviso-lead.ts'))).toMatch(/to: \[CORREO_CONTACTO\]/)
  })

  it('la página pública del formulario no existe (404) mientras el marketing esté apagado', () => {
    const t = codigo(leer('src/app/recomendaciones/page.tsx'))
    expect(t).toMatch(/if \(!env\.marketing \|\| env\.secreto\.length < SECRETO_MINIMO\) notFound\(\)/)
  })

  it('el consentimiento es el botón del formulario (sin casilla ni trámite), con el aviso visible, y el servidor exige `acepto === true`', () => {
    const f = leer('src/components/correo/FormularioRecomendaciones.tsx')
    expect(f).not.toMatch(/setAcepto|name="acepto"|Marca la casilla/)
    expect(f).toMatch(/acepto: true/)
    expect(f).toMatch(/TEXTO_CONSENTIMIENTO_MARKETING/)
    expect(f).toMatch(/\/privacidad/)
    expect(codigo(leer('src/lib/correo/suscripcion.ts'))).toMatch(/acepto: c\.acepto === true/)
  })
})

describe('la migración 62 (era la 36 de D-80)', () => {
  const sql = leer('supabase/62-correo-suscripciones.sql')
  it('todas las tablas nuevas activan RLS y NO crean ninguna política (sólo service_role)', () => {
    const tablas = [...sql.matchAll(/create table if not exists public\.(correo_[a-z_]+)/g)].map((m) => m[1])
    expect(tablas.sort()).toEqual(['correo_envios', 'correo_supresiones', 'correo_suscriptores', 'correo_webhook_vistos'])
    for (const t of tablas) expect(sql, t).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`))
    expect(sql).not.toMatch(/create policy/i)
  })

  it('no toca ninguna tabla existente (sólo crea y concede sobre lo suyo)', () => {
    expect(sql).not.toMatch(/\b(alter table|drop table|delete from|truncate)\s+public\.(?!correo_)/i)
    expect(sql).not.toMatch(/\binsert into public\.(?!correo_)/i)
    expect(sql).not.toMatch(/\bupdate public\.(?!correo_)/i)
  })

  it('toda función revoca el acceso público y concede sólo a service_role', () => {
    const funciones = [...sql.matchAll(/create or replace function public\.(correo_[a-z_]+)\(/g)].map((m) => m[1])
    expect(funciones).toHaveLength(10)
    for (const fn of funciones) {
      expect(sql, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`))
      expect(sql, fn).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`))
    }
    expect(sql.match(/security definer set search_path = public/g)?.length ?? 0).toBeGreaterThanOrEqual(8)
  })
})

describe('MODO DE PRUEBAS y CUPO: todo emisor de correo del código pasa por un único punto', () => {
  const CENTRAL = 'src/lib/correo/resend.ts'
  const EMISOR_UNICO = 'src/lib/correo/emisor.ts'
  /** Los cinco emisores: el de D-80 llama directo a `llamarResend` (después de reservar); los otros cuatro, por el emisor único. */
  const POR_EMISOR_UNICO = ['src/lib/aviso-lead.ts', 'src/lib/avisos-cliente-servidor.ts', 'src/lib/citas/enviar.ts', 'src/lib/invitacion-correo.ts']
  const D80 = 'src/lib/correo/enviar.ts'

  it('sólo `correo/resend.ts` conoce la API de Resend: ningún otro archivo llama a api.resend.com ni a otro host de resend', () => {
    const conApi = TODOS.filter((f) => /resend\.com/.test(codigo(readFileSync(f, 'utf8')))).map(rel)
    expect(conApi).toEqual([CENTRAL])
  })

  it('exactamente estos archivos llaman a `llamarResend`: el central, el emisor único y el de D-80 (que reserva cupo antes); nadie más sin que se decida a propósito', () => {
    const usan = TODOS.filter((f) => /\bllamarResend\(/.test(codigo(readFileSync(f, 'utf8')))).map(rel).sort()
    expect(usan).toEqual([CENTRAL, D80, EMISOR_UNICO].sort())
    for (const f of TODOS.filter((x) => rel(x) !== CENTRAL)) expect(codigo(readFileSync(f, 'utf8')), rel(f)).not.toMatch(/\bfetch\([^)]*(resend|URL_RESEND)/i)
  })

  it('los cuatro emisores heredados usan el emisor único (y NINGUNO lee la clave ni llama al proveedor por su cuenta)', () => {
    const usan = TODOS.filter((f) => /\benviarPorEmisorUnico\(/.test(codigo(readFileSync(f, 'utf8')))).map(rel).sort()
    expect(usan).toEqual([...POR_EMISOR_UNICO, EMISOR_UNICO].sort())
    for (const f of POR_EMISOR_UNICO) {
      const c = codigo(readFileSync(join(RAIZ, f), 'utf8'))
      expect(c, f).not.toMatch(/process\.env\.RESEND_API_KEY/)
      expect(c, f).not.toMatch(/\bfetch\(/)
      expect(c, f).toMatch(/claveResend\(\)/)
    }
  })

  it('CUPO: el emisor único y el de D-80 reservan en el libro ANTES de llamar al proveedor, y sin cupo confirmado no llaman', () => {
    for (const f of [EMISOR_UNICO, D80]) {
      const t = codigo(leer(f))
      expect(t.indexOf('reservarCupo('), f).toBeGreaterThan(0)
      expect(t.indexOf('reservarCupo('), f).toBeLessThan(t.indexOf('llamarResend('))
      expect(t, f).toMatch(/sin_confirmar/)
    }
    const e = codigo(leer(D80))
    expect(e.indexOf("r.accion === 'sin_confirmar'")).toBeLessThan(e.indexOf('llamarResend('))
    const u = codigo(leer(EMISOR_UNICO))
    expect(u.indexOf("r.accion === 'sin_confirmar'")).toBeLessThan(u.indexOf('llamarResend('))
    expect(u.indexOf("r.accion === 'sin_cupo'")).toBeLessThan(u.indexOf('llamarResend('))
  })

  it('CUPO: los topes NO son configurables (ninguna variable de entorno ni parámetro los cambia) y el plan gratuito queda por encima', () => {
    const c = codigo(leer('src/lib/correo/config.ts'))
    expect(c).not.toMatch(/process\.env\.[A-Z_]*(CUPO|TOPE|LIMITE|DIA_MAX|MES_MAX)/)
    expect(c).toMatch(/export const CUPO_TOTAL = \{ dia: 90, mes: 2700, reservaDia: 30, reservaMes: 300 \}/)
    const e = codigo(leer(D80))
    expect(e).not.toMatch(/p_dia_max|p_mes_max|p_reserva_transaccional/)
  })

  it('FUERA DE PRODUCCIÓN: ambos emisores comprueban envioPermitido ANTES de reservar o llamar (no se suman contadores de otras bases)', () => {
    for (const f of [EMISOR_UNICO, D80]) {
      const t = codigo(leer(f))
      expect(t.indexOf('envioPermitido('), f).toBeGreaterThan(0)
      expect(t.indexOf('envioPermitido('), f).toBeLessThan(t.indexOf('await reservarCupo('))
    }
    const c = codigo(leer('src/lib/correo/config.ts'))
    expect(c).toContain("entornoCupo === 'produccion' || modoPruebas")
    expect(c).toContain("env.VERCEL_ENV === 'production' ? 'produccion' : 'pruebas'")
  })

  it('MARKETING: sigue apagado por una constante de código mientras no exista texto legal aprobado (la variable de entorno sola no lo enciende)', () => {
    const c = codigo(leer('src/lib/correo/config.ts'))
    // Para encender el correo promocional hay que cambiar esta línea en una revisión de código, con el texto y su versión aprobados.
    expect(c).toMatch(/export const MARKETING_AUTORIZADO = false/)
    expect(c).toMatch(/marketing: env\.CORREO_MARKETING === '1' && MARKETING_AUTORIZADO/)
    // Ningún cron programado llama a la tarea de recomendaciones.
    expect(leer('vercel.json')).not.toMatch(/api\/correo\/tarea/)
  })

  it('el punto central reconstruye el cuerpo y lo revisa ANTES de llamar al proveedor, con el destino como constante de código', () => {
    const t = codigo(leer(CENTRAL))
    expect(t.indexOf('cuerpoDePruebas(l.cuerpo, idDePrueba(l.idempotencia))')).toBeGreaterThan(0)
    expect(t.indexOf('exigirSoloDestinoDePruebas(cuerpo)')).toBeGreaterThan(t.indexOf('cuerpoDePruebas(l.cuerpo'))
    expect(t.indexOf('exigirSoloDestinoDePruebas(cuerpo)')).toBeLessThan(t.indexOf('URL_RESEND, {'))
    expect(t).toMatch(/body: JSON\.stringify\(cuerpo\)/)
    const c = codigo(leer('src/lib/correo/config.ts'))
    expect(c).toMatch(/export const DESTINO_PRUEBAS: string = NEGOCIO\.email/)
    expect(c).not.toMatch(/process\.env\.[A-Z_]*DESTINO/)
    expect(c).toMatch(/modoPruebas: env\.CORREO_MODO_PRUEBAS === '1'/)
  })

  it('el emisor de D-80 (`enviar.ts`) también revisa su cuerpo antes de llamar y deja el envío en error si algo no cuadra', () => {
    const t = codigo(leer(D80))
    expect(t).toMatch(/cuerpoDePruebas\(base, idDePrueba\(s\.clave\)\)/)
    expect(t.indexOf('exigirSoloDestinoDePruebas(cuerpo)')).toBeLessThan(t.indexOf('llamarResend({'))
    expect(t).toMatch(/fuga_modo_pruebas/)
  })
})
