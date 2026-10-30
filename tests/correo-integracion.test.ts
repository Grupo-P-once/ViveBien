import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { dbCorreoPglite } from './dobles/correo-pglite'
import type { DbCorreo } from '../src/lib/correo/enviar'
import type { EntornoCorreo } from '../src/lib/correo/config'
import { COLUMNAS_PROPIEDAD_PORTAL } from '../src/lib/portal/tarjeta'
import { aplicarEventoProveedor, confirmarSuscripcion, darDeBaja, fijarMarketingDeCuenta, suscribirVisitante } from '../src/lib/correo/suscripcion'
import { ejecutarTareaMarketing } from '../src/lib/correo/tarea'
import { enviarBienvenida, enviarConfirmacionPublicador } from '../src/lib/correo/transaccionales'
import { crearEnlace, leerEnlace } from '../src/lib/correo/seguridad'

/**
 * D-80 — el sistema de correo DE PUNTA A PUNTA, sin enviar nada: el TypeScript real habla con las funciones SQL reales de la
 * migración 36 (en PGlite) y con un «Resend» falso que sólo anota las peticiones. NADA toca producción ni a nadie.
 */
const SECRETO = 'secreto-de-prueba-'.repeat(3)
const ENV: EntornoCorreo = { transaccional: true, marketing: true, resendKey: 're_prueba_no_real', secreto: SECRETO, webhookSecret: '', remitente: null, remitenteMarketing: null }

type Peticion = { url: string; clave: string; cuerpo: { from: string; to: string[]; reply_to: string; subject: string; html: string; text: string; headers?: Record<string, string> } }
let peticiones: Peticion[] = []
let contador = 0
const fetchFalso = (async (url: string, init: RequestInit) => {
  const h = init.headers as Record<string, string>
  peticiones.push({ url, clave: h['Idempotency-Key'], cuerpo: JSON.parse(String(init.body)) })
  return new Response(JSON.stringify({ id: `re_${++contador}` }), { status: 200 })
}) as unknown as typeof fetch

/**
 * La tabla `propiedades` de la prueba se arma con las columnas de `COLUMNAS_PROPIEDAD_PORTAL` (la lista que el código REALMENTE pide). Antes era una copia escrita a
 * mano: cuando el portal agregó `subtipo`, `videos`, `planos` y `extras` la consulta del catálogo falló en silencio (catálogo vacío) y cuatro pruebas se cayeron por eso,
 * no por las fechas. Una columna nueva ya no puede romperlas.
 */
function tablaDePropiedades(): string {
  const tipo = (c: string) =>
    /^(precio|metros|banos|altura_libre)$/.test(c) ? 'float8'
      : /^(recamaras|andenes)$/.test(c) ? 'int'
        : c === 'precio_incluye_iva' ? 'boolean'
          : /^(fotos|videos|planos)$/.test(c) ? 'text[]'
            : /^(publicada_en|created_at)$/.test(c) ? 'timestamptz'
              : c === 'extras' ? 'jsonb'
                : 'text'
  const definicion = (c: string) => (c === 'id' ? 'id text primary key' : c === 'created_at' ? 'created_at timestamptz default now()' : `${c} ${tipo(c)}`)
  const cols = COLUMNAS_PROPIEDAD_PORTAL.split(',').map((c) => c.trim())
  return `create table public.propiedades (${cols.map(definicion).join(', ')})`
}

let pg: PGlite
let db: DbCorreo
const q = async <T = Record<string, unknown>>(texto: string, p: unknown[] = []) => (await pg.query<T>(texto, p)).rows

/** Fecha relativa a hoy: los datos de la prueba no envejecen (antes eran 2026-10-01…20 fijas). */
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()
const NAVE = (id: string, extra: Record<string, unknown> = {}) => ({
  id, titulo: `Nave ${id}`, tipo: 'nave', operacion: 'venta', precio: 12_500_000, ubicacion: 'León, Gto.', colonia: 'Puerto Interior', ciudad: 'León',
  metros: 1800, estatus: 'disponible', estado_pub: 'publicada', slug: `nave-${id}`, fotos: ['https://res.cloudinary.com/demo/image/upload/v1/viv/casa.jpg'],
  publicada_en: hace(30), ...extra,
})
async function insertarPropiedad(p: Record<string, unknown>) {
  const cols = Object.keys(p)
  await pg.query(`insert into public.propiedades (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, cols.map((c) => p[c]))
}
// El «ahora» de la tarea debe ir por DELANTE del reloj real de la base: la migración 62 calcula `proximo_envio_en = greatest(now(), …)` con el reloj
// de PGlite, así que con una hora fija (antes 2026-10-10T16:00Z) las suscriptoras confirmadas después de esa hora «aún no tocaban» y dos pruebas fallaban
// según la hora del día. Se ancla a la fecha fija o al reloj real, lo que sea posterior (+1 min): determinista y sin tocar el código de producción.
const ahoraBase = new Date(Date.now() + 60_000)

async function suscriptoraActiva(correo: string, prefs: Record<string, unknown> = { operacion: 'venta', tipos: ['nave'] }) {
  const fila = await q<{ id: string }>(`select (public.correo_suscribir($1, 'Ana', $2::jsonb, 'recomendaciones', 'marketing-2026-10')->>'id') as id`, [correo, JSON.stringify(prefs)])
  await pg.query(`select public.correo_confirmar($1::uuid)`, [fila[0].id])
  return fila[0].id
}

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec('create role anon; create role authenticated; create role service_role;')
  await pg.exec(tablaDePropiedades())
  await pg.exec(readFileSync(path.join(__dirname, '..', 'supabase', '62-correo-suscripciones.sql'), 'utf8'))
  db = dbCorreoPglite(pg) as unknown as DbCorreo
}, 90_000)
afterAll(async () => { await pg?.close() })
beforeEach(async () => {
  peticiones = []
  await pg.exec('delete from public.correo_envios; delete from public.correo_suscriptores; delete from public.correo_supresiones; delete from public.correo_webhook_vistos; delete from public.propiedades; delete from public.correo_conciliacion')
  // El correo opcional en producción exige una lectura reciente del panel de Resend (conciliación): aquí, una sintética en cero.
  await pg.query("select public.correo_conciliar(0, 0, 'prueba-sintetica')")
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('visitante sin cuenta → confirmar → recomendaciones → baja', () => {
  it('el ciclo completo, y nada comercial sale antes de confirmar', async () => {
    await insertarPropiedad(NAVE('uno'))
    await insertarPropiedad(NAVE('dos', { publicada_en: hace(26) }))
    await insertarPropiedad(NAVE('borrador', { estado_pub: 'borrador' }))
    await insertarPropiedad(NAVE('pausada', { estatus: 'pausada' }))
    await insertarPropiedad(NAVE('casa-renta', { tipo: 'casa', operacion: 'renta' }))

    // 1 · solicita: la respuesta inmediata son SUS PRIMERAS PROPIEDADES (reales, vigentes y que encajan), con baja y con el «sí» al final
    const s = await suscribirVisitante(db, { correo: '  Ana.Visitante@Ejemplo.TEST ', nombre: 'Ana Visitante', tipos: ['nave'], operacion: 'venta', zona: 'León', acepto: true }, { entorno: ENV, fetch: fetchFalso, ahoraMs: ahoraBase.getTime() })
    expect(s).toEqual({ ok: true })
    expect(peticiones).toHaveLength(1)
    const primero = peticiones[0]
    expect(primero.cuerpo.to).toEqual(['ana.visitante@ejemplo.test'])
    expect(primero.cuerpo.from).toBe('Vive Bien <informes@vivebienn.com>')
    expect(primero.cuerpo.reply_to).toBe('informes@vivebienn.com')
    expect(primero.cuerpo.subject).toBe('Tus primeras 2 propiedades en VIVE BIEN')
    for (const bueno of ['Nave uno', 'Nave dos']) expect(primero.cuerpo.html).toContain(bueno)
    for (const malo of ['borrador', 'pausada', 'casa-renta']) expect(primero.cuerpo.html).not.toContain(malo)
    expect(primero.cuerpo.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click') // también el primer correo se puede dejar de recibir con un clic
    const [fila] = await q<Record<string, unknown>>(`select * from public.correo_suscriptores`)
    expect(fila).toMatchObject({ estado: 'pendiente', email_norm: 'ana.visitante@ejemplo.test', consentimiento_version: 'marketing-2026-10-v2', proximo_envio_en: null })
    const [inicial] = await q<Record<string, unknown>>(`select * from public.correo_envios`)
    expect(inicial).toMatchObject({ categoria: 'transaccional', tipo: 'primeras_propiedades', estado: 'enviado' })
    expect((inicial.propiedades as string[]).sort()).toEqual(['dos', 'uno'])

    // 2 · la tarea diaria NO le escribe mientras no haya pulsado «sí, quiero seguir recibiéndolas»
    expect((await ejecutarTareaMarketing(db, { entorno: ENV, fetch: fetchFalso, ahora: ahoraBase })).enviadas).toBe(0)
    expect(peticiones).toHaveLength(1)

    // 3 · pulsa el botón del correo (enlace firmado)
    const enlace = decodeURIComponent(/\/correo\/confirmar#t=([^"&\s]+)/.exec(primero.cuerpo.html)![1])
    expect(leerEnlace(SECRETO, 'confirmar', enlace, ahoraBase.getTime())).toEqual({ id: fila.id })
    expect(await confirmarSuscripcion(db, enlace, { entorno: ENV, ahoraMs: ahoraBase.getTime() })).toEqual({ estado: 'activa' })

    // 4 · el siguiente envío toca 3 días DESPUÉS del primero (no «ya mismo»): antes, la tarea no hace nada
    const [{ proximo_envio_en: prox }] = await q<{ proximo_envio_en: string }>(`select proximo_envio_en from public.correo_suscriptores`)
    const proximo = new Date(prox)
    expect(Math.abs(proximo.getTime() - (Date.now() + 3 * 86_400_000))).toBeLessThan(120_000)
    expect((await ejecutarTareaMarketing(db, { entorno: ENV, fetch: fetchFalso, ahora: new Date(proximo.getTime() - 60_000) })).procesadas).toBe(0)
    expect(peticiones).toHaveLength(1)

    // 5 · a los 3 días, sin novedades (las dos ya se le mandaron): NO se manda un correo vacío ni se repiten
    const dia3 = new Date(proximo.getTime() + 60_000)
    expect(await ejecutarTareaMarketing(db, { entorno: ENV, fetch: fetchFalso, ahora: dia3 })).toMatchObject({ procesadas: 1, enviadas: 0, sinNovedades: 1 })
    expect(peticiones).toHaveLength(1)

    // 6 · llega una propiedad nueva: a los 3 días siguientes se manda SÓLO la nueva, ya como correo comercial con baja de un clic
    await insertarPropiedad(NAVE('tres', { publicada_en: hace(19) }))
    const dia6 = new Date(dia3.getTime() + 3 * 86_400_000 + 60_000)
    expect(await ejecutarTareaMarketing(db, { entorno: ENV, fetch: fetchFalso, ahora: dia6 })).toMatchObject({ enviadas: 1 })
    const reco = peticiones[1]
    expect(reco.cuerpo.subject).toBe('Una propiedad que podría interesarte')
    expect(reco.cuerpo.html).toContain('Nave tres')
    expect(reco.cuerpo.html).not.toContain('Nave uno')
    expect(reco.cuerpo.html).toContain('$12,500,000')
    expect(reco.cuerpo.html).toContain('/propiedades/nave-tres')
    const cab = reco.cuerpo.headers!
    expect(cab['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    const tokenBaja = decodeURIComponent(/\/api\/correo\/baja\?t=([^>,\s]+)/.exec(cab['List-Unsubscribe'])![1])
    expect(leerEnlace(SECRETO, 'baja', tokenBaja)).toEqual({ id: fila.id })
    expect(reco.cuerpo.html).toContain('/correo/baja#t=')
    expect(reco.cuerpo.text).toContain('Darme de baja:')
    expect(reco.cuerpo.html + reco.cuerpo.text).not.toContain('ana.visitante') // el correo de la persona nunca va en un enlace
    const [env] = await q<Record<string, unknown>>(`select * from public.correo_envios where categoria = 'marketing'`)
    expect(env).toMatchObject({ estado: 'enviado', tipo: 'recomendaciones' })
    expect(env.propiedades).toEqual(['tres'])

    // 8 · se da de baja con el enlace (sin sesión, sin banderas) y ya no sale nada
    expect(await darDeBaja(db, tokenBaja, { entorno: { ...ENV, marketing: false, transaccional: false } })).toEqual({ ok: true })
    expect(await darDeBaja(db, tokenBaja, { entorno: ENV })).toEqual({ ok: true }) // idempotente
    await insertarPropiedad(NAVE('cuatro', { publicada_en: hace(10) }))
    const dia9 = new Date(dia6.getTime() + 4 * 86_400_000)
    expect((await ejecutarTareaMarketing(db, { entorno: ENV, fetch: fetchFalso, ahora: dia9 })).procesadas).toBe(0)
    expect(peticiones).toHaveLength(2)

    // 9 · llenar otra vez el formulario NO la reactiva: manda de nuevo el correo con propiedades y sigue en baja hasta que pulse el botón
    await suscribirVisitante(db, { correo: 'ana.visitante@ejemplo.test', acepto: true, tipos: ['nave'] }, { entorno: ENV, fetch: fetchFalso, ahoraMs: dia9.getTime() })
    expect((await q<{ estado: string }>(`select estado from public.correo_suscriptores`))[0].estado).toBe('baja')
    expect((await ejecutarTareaMarketing(db, { entorno: ENV, fetch: fetchFalso, ahora: new Date(dia9.getTime() + 10 * 86_400_000) })).enviadas).toBe(0)
  })

  it('doble clic en «suscribirme»: UN solo correo inicial; un contacto duplicado no crea otra suscripción', async () => {
    const f = { correo: 'doble@ejemplo.test', acepto: true }
    await Promise.all([suscribirVisitante(db, f, { entorno: ENV, fetch: fetchFalso }), suscribirVisitante(db, f, { entorno: ENV, fetch: fetchFalso })])
    await suscribirVisitante(db, { ...f, correo: 'DOBLE@ejemplo.test' }, { entorno: ENV, fetch: fetchFalso })
    expect(peticiones).toHaveLength(1)
    expect(await q(`select 1 from public.correo_suscriptores`)).toHaveLength(1)
  })

  it('sin el gesto EXPRESO (acepto:true del botón) no se registra nada y no sale correo (ni con «on», 1, «true» ni por omisión)', async () => {
    for (const acepto of [undefined, false, 'on', 1, 'true', null]) {
      expect(await suscribirVisitante(db, { correo: 'sin.gesto@ejemplo.test', acepto }, { entorno: ENV, fetch: fetchFalso })).toEqual({ ok: false, motivo: 'sin_consentimiento' })
    }
    expect(await suscribirVisitante(db, { correo: 'malo', acepto: true }, { entorno: ENV, fetch: fetchFalso })).toEqual({ ok: false, motivo: 'invalido' })
    expect(await q(`select 1 from public.correo_suscriptores`)).toEqual([])
    expect(peticiones).toEqual([])
  })

  it('la respuesta es igual para una dirección suprimida o ya activa (no sirve para averiguar quién está en la lista)', async () => {
    await pg.exec(`insert into public.correo_supresiones values (public.correo_huella('suprimida@ejemplo.test'), 'queja')`)
    await suscriptoraActiva('activa@ejemplo.test')
    for (const correo of ['suprimida@ejemplo.test', 'activa@ejemplo.test', 'nueva@ejemplo.test']) {
      expect(await suscribirVisitante(db, { correo, acepto: true }, { entorno: ENV, fetch: fetchFalso })).toEqual({ ok: true })
    }
    expect(peticiones.map((p) => p.cuerpo.to[0])).toEqual(['nueva@ejemplo.test'])
  })

  it('un enlace de confirmación alterado, de otro tipo o vencido NO activa nada', async () => {
    await suscribirVisitante(db, { correo: 'enlace@ejemplo.test', acepto: true }, { entorno: ENV, fetch: fetchFalso, ahoraMs: ahoraBase.getTime() })
    const t = decodeURIComponent(/\/correo\/confirmar#t=([^"&\s]+)/.exec(peticiones[0].cuerpo.html)![1])
    expect(await confirmarSuscripcion(db, t.slice(0, -2) + 'xx', { entorno: ENV, ahoraMs: ahoraBase.getTime() })).toEqual({ estado: 'invalido' })
    expect(await confirmarSuscripcion(db, t, { entorno: ENV, ahoraMs: ahoraBase.getTime() + 8 * 86_400_000 })).toEqual({ estado: 'invalido' })
    expect(await darDeBaja(db, t, { entorno: ENV })).toEqual({ ok: false }) // un enlace de confirmar no sirve de baja, ni al revés
    expect((await q<{ estado: string }>(`select estado from public.correo_suscriptores`))[0].estado).toBe('pendiente')
  })
})

describe('enlaces de ejemplo o inventados no funcionan', () => {
  it('«EJEMPLO», vacío, sin firma, de otro secreto o con otro tipo: rechazados sin tocar la base', async () => {
    await suscriptoraActiva('ejemplo@ejemplo.test')
    const antes = await q(`select estado from public.correo_suscriptores`)
    for (const malo of ['EJEMPLO', '', 'a.b', 'x.0.y', null, undefined, 12345]) {
      expect(await confirmarSuscripcion(db, malo, { entorno: ENV, ahoraMs: ahoraBase.getTime() })).toEqual({ estado: 'invalido' })
      expect(await darDeBaja(db, malo, { entorno: ENV })).toEqual({ ok: false })
    }
    const ajeno = crearEnlace('otro-secreto-'.repeat(4), 'baja', '00000000-0000-0000-0000-000000000000')
    expect(await darDeBaja(db, ajeno, { entorno: ENV })).toEqual({ ok: false })
    expect(await q(`select estado from public.correo_suscriptores`)).toEqual(antes)
  })
})

describe('proveedor: rebotes, quejas y presupuesto', () => {
  it('un rebote permanente suprime la dirección y la tarea ya no le escribe', async () => {
    await insertarPropiedad(NAVE('uno'))
    await suscriptoraActiva('rebota@ejemplo.test')
    expect(await aplicarEventoProveedor(db, 'msg_1', { type: 'email.bounced', data: { email_id: 're_x', to: ['Rebota@ejemplo.test'], bounce: { type: 'Permanent', subType: 'General' } } })).toBe('aplicado')
    expect(await aplicarEventoProveedor(db, 'msg_1', { type: 'email.bounced', data: { to: ['rebota@ejemplo.test'], bounce: { type: 'Permanent' } } })).toBe('duplicado')
    expect(await aplicarEventoProveedor(db, 'msg_2', { type: 'email.opened', data: {} })).toBe('ignorado')
    expect((await ejecutarTareaMarketing(db, { entorno: ENV, fetch: fetchFalso, ahora: ahoraBase })).procesadas).toBe(0)
    expect(peticiones).toEqual([])
  })

  it('UNA queja pausa TODO el marketing de la tarea (y se reporta como pausada)', async () => {
    await insertarPropiedad(NAVE('uno'))
    await suscriptoraActiva('ok@ejemplo.test')
    await pg.exec(`insert into public.correo_envios (clave, categoria, tipo, email_hash, estado) values ('q/1','marketing','reco','otra@ejemplo.test','queja')`)
    expect(await ejecutarTareaMarketing(db, { entorno: ENV, fetch: fetchFalso, ahora: ahoraBase })).toMatchObject({ estado: 'pausada', motivo: 'quejas', enviadas: 0 })
    expect(peticiones).toEqual([])
  })

  it('el cupo diario detiene al marketing en 50 y deja la reserva de 30 a lo transaccional (rebanada de producción, cifras fijas de la base)', async () => {
    await insertarPropiedad(NAVE('uno'))
    for (let i = 0; i < 5; i++) await suscriptoraActiva(`p${i}@ejemplo.test`)
    // 48 envíos ya hechos hoy: quedan 2 lugares para lo opcional (50 - 48).
    await pg.query(`insert into public.correo_envios (clave, categoria, tipo, email_hash, estado, entorno)
                    select 'previo/' || g, 'transaccional', 'x', 'previo@ejemplo.test', 'enviado', 'produccion' from generate_series(1, 48) g`)
    const r = await ejecutarTareaMarketing(db, { entorno: ENV, fetch: fetchFalso, ahora: ahoraBase, entornoCupo: 'produccion' })
    expect(r).toMatchObject({ enviadas: 2, presupuestoAgotado: true })
    expect(peticiones).toHaveLength(2)
    const b = await enviarBienvenida(db, 'uid-reserva', { correo: 'reserva@ejemplo.test', verificado: true }, { entorno: ENV, fetch: fetchFalso, entornoCupo: 'produccion' })
    expect(b.estado).toBe('enviado')
  })

  it('si no se puede confirmar el cupo, la tarea de marketing no envía a nadie', async () => {
    await insertarPropiedad(NAVE('uno'))
    for (let i = 0; i < 3; i++) await suscriptoraActiva(`c${i}@ejemplo.test`)
    const sinLibro = { ...db, rpc: async (fn: string, args?: Record<string, unknown>) => (fn === 'correo_reservar_envio' ? { data: null, error: { message: 'caído' } } : db.rpc(fn, args)) } as DbCorreo
    const r = await ejecutarTareaMarketing(sinLibro, { entorno: ENV, fetch: fetchFalso, ahora: ahoraBase })
    expect(r).toMatchObject({ enviadas: 0, presupuestoAgotado: true })
    expect(peticiones).toEqual([])
  })

  it('las marcas del proveedor y las banderas apagadas no envían ni gastan nada', async () => {
    await insertarPropiedad(NAVE('uno'))
    await suscriptoraActiva('apagado@ejemplo.test')
    for (const entorno of [{ ...ENV, marketing: false }, { ...ENV, resendKey: '' }, { ...ENV, secreto: 'corto' }]) {
      expect(await ejecutarTareaMarketing(db, { entorno, fetch: fetchFalso, ahora: ahoraBase })).toMatchObject({ estado: 'desactivada', enviadas: 0 })
    }
    expect(peticiones).toEqual([])
    expect(await q(`select 1 from public.correo_envios`)).toEqual([])
  })

  it('si Resend falla, el envío queda en «error», sin duplicar y sin tumbar a las demás personas', async () => {
    await insertarPropiedad(NAVE('uno'))
    await suscriptoraActiva('a1@ejemplo.test'); await suscriptoraActiva('a2@ejemplo.test')
    let n = 0
    const casiSiempreFalla = (async (url: string, init: RequestInit) => {
      if (++n === 1) return new Response('{"message":"interno secreto"}', { status: 500 })
      return fetchFalso(url, init)
    }) as unknown as typeof fetch
    const r = await ejecutarTareaMarketing(db, { entorno: ENV, fetch: casiSiempreFalla, ahora: ahoraBase })
    expect(r).toMatchObject({ enviadas: 1, fallidas: 1 })
    expect(await q<{ estado: string }>(`select estado from public.correo_envios order by id`)).toEqual([{ estado: 'error' }, { estado: 'enviado' }])
    // nada del cuerpo del error del proveedor llegó a los registros
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain('interno secreto')
  })
})

describe('transaccionales de D-80', () => {
  it('bienvenida: una sola vez por cuenta, sólo al correo VERIFICADO y sin publicidad', async () => {
    const c = { correo: 'Nueva@Ejemplo.test', verificado: true, nombre: 'Luis Pérez' }
    expect((await enviarBienvenida(db, 'uid-1', c, { entorno: ENV, fetch: fetchFalso })).estado).toBe('enviado')
    expect((await enviarBienvenida(db, 'uid-1', c, { entorno: ENV, fetch: fetchFalso })).estado).toBe('duplicado')
    expect((await enviarBienvenida(db, 'uid-2', { ...c, verificado: false }, { entorno: ENV, fetch: fetchFalso })).motivo).toBe('correo_sin_verificar')
    expect((await enviarBienvenida(db, 'uid-3', c, { entorno: { ...ENV, transaccional: false }, fetch: fetchFalso })).motivo).toBe('transaccional_apagado')
    expect(peticiones).toHaveLength(1)
    const m = peticiones[0].cuerpo
    expect(m.to).toEqual(['nueva@ejemplo.test'])
    expect(m.subject).toBe('Te damos la bienvenida a VIVE BIEN')
    expect(m.html).toContain('Te damos la bienvenida, Luis.')
    expect(m.headers).toBeUndefined()
    expect(m.html).not.toMatch(/\/api\/correo\/baja/) // no es una campaña
    expect(await q(`select 1 from public.correo_suscriptores`)).toEqual([]) // crear la cuenta NO suscribe a nadie
  })

  it('la bienvenida vincula a un visitante previo con la cuenta, pero NO cambia su consentimiento', async () => {
    const id = await suscriptoraActiva('mismo@ejemplo.test')
    await pg.exec(`update public.correo_suscriptores set estado = 'pendiente', confirmado_en = null where id = '${id}'`)
    await enviarBienvenida(db, 'uid-vinculo', { correo: 'mismo@ejemplo.test', verificado: true }, { entorno: ENV, fetch: fetchFalso })
    expect((await q(`select uid, estado from public.correo_suscriptores where id = $1`, [id]))[0]).toEqual({ uid: 'uid-vinculo', estado: 'pendiente' })
  })

  it('solicitud de publicador: UNA confirmación con su referencia, que dice «no aprobada» y no lleva publicidad', async () => {
    const c = { correo: 'duenio@ejemplo.test', verificado: true, nombre: 'Rosa' }
    expect((await enviarConfirmacionPublicador(db, 41, c, { entorno: ENV, fetch: fetchFalso })).estado).toBe('enviado')
    expect((await enviarConfirmacionPublicador(db, 41, c, { entorno: ENV, fetch: fetchFalso })).estado).toBe('duplicado')
    expect((await enviarConfirmacionPublicador(db, 42, { ...c, verificado: false }, { entorno: ENV, fetch: fetchFalso })).estado).toBe('omitido')
    expect(peticiones).toHaveLength(1)
    expect(peticiones[0].cuerpo.html).toContain('SOL-41')
    expect(peticiones[0].cuerpo.html).toMatch(/no está aprobada/)
    expect(peticiones[0].cuerpo.html).not.toMatch(/baja|recomendaciones/i)
  })

  it('cuenta con sesión: aceptar el marketing es aparte, exige correo verificado y se puede retirar', async () => {
    const cuenta = { uid: 'u-1', correo: 'cuenta@ejemplo.test', verificado: true }
    expect(await fijarMarketingDeCuenta(db, { ...cuenta, verificado: false }, { aceptar: true })).toEqual({ estado: 'correo_sin_verificar' })
    expect(await q(`select 1 from public.correo_suscriptores`)).toEqual([])
    expect(await fijarMarketingDeCuenta(db, cuenta, { aceptar: true, prefs: { tipos: ['casa'] } })).toEqual({ estado: 'activa' })
    expect((await q(`select estado, fuente, consentimiento_version from public.correo_suscriptores`))[0]).toEqual({ estado: 'activa', fuente: 'cuenta', consentimiento_version: 'marketing-2026-10-v2' })
    expect(await fijarMarketingDeCuenta(db, { ...cuenta, verificado: false }, { aceptar: false })).toEqual({ estado: 'baja' })
  })
})

describe('MODO DE PRUEBAS de punta a punta: nada sale a nadie más que al destino de pruebas', () => {
  const PRUEBAS: EntornoCorreo = { ...ENV, modoPruebas: true }
  const DESTINO = 'informes@vivebienn.com'
  const soloDestino = () => {
    for (const p of peticiones) {
      expect(p.cuerpo.to).toEqual([DESTINO])
      expect(Object.keys(p.cuerpo).filter((k) => /^(cc|bcc|cco)$/i.test(k))).toEqual([])
      expect(p.cuerpo.reply_to).toBe('informes@vivebienn.com')
      expect(p.cuerpo.subject).toMatch(/^\[PRUEBA VB · [0-9A-F]{8}\] /)
    }
  }

  it('visitante: el primer correo, la confirmación y la baja no llegan a la dirección real; el registro en la base tampoco la guarda en correo_envios', async () => {
    await insertarPropiedad(NAVE('uno'))
    const s = await suscribirVisitante(db, { correo: 'cliente.real@empresa-real.test', nombre: 'Cliente Real', tipos: ['nave'], operacion: 'venta', zona: 'León', acepto: true }, { entorno: PRUEBAS, fetch: fetchFalso, ahoraMs: ahoraBase.getTime() })
    expect(s).toEqual({ ok: true })
    expect(peticiones).toHaveLength(1)
    soloDestino()
    expect(JSON.stringify(peticiones.map((p) => p.cuerpo.to))).not.toContain('empresa-real')
    expect((await q<{ email_hash: string; h: string }>(`select email_hash, public.correo_huella($1) h from public.correo_envios`, [DESTINO])).map((r) => r.email_hash === r.h)).toEqual([true])
  })

  it('transaccionales (bienvenida y confirmación a publicador): ambos van al destino de pruebas', async () => {
    const c = { correo: 'propietario.real@empresa-real.test', verificado: true }
    expect((await enviarBienvenida(db, 'uid-p1', c, { entorno: PRUEBAS, fetch: fetchFalso })).estado).toBe('enviado')
    expect((await enviarConfirmacionPublicador(db, 41, c, { entorno: PRUEBAS, fetch: fetchFalso })).estado).toBe('enviado')
    expect(peticiones).toHaveLength(2)
    soloDestino()
    expect((await q<{ email_hash: string; h: string }>(`select distinct email_hash, public.correo_huella($1) h from public.correo_envios`, [DESTINO])).map((r) => r.email_hash === r.h)).toEqual([true])
  })

  it('tarea de recomendaciones: con varias suscriptoras reales sólo salen al destino de pruebas y nunca más de 3 personas por ejecución', async () => {
    await insertarPropiedad(NAVE('uno'))
    for (let i = 1; i <= 6; i++) await suscriptoraActiva(`real${i}@empresa-real.test`)
    const lejos = new Date(ahoraBase.getTime() + 30 * 86_400_000)
    const r = await ejecutarTareaMarketing(db, { entorno: PRUEBAS, fetch: fetchFalso, ahora: lejos })
    expect(r.procesadas).toBeLessThanOrEqual(3)
    expect(peticiones.length).toBeGreaterThanOrEqual(1)
    expect(peticiones.length).toBeLessThanOrEqual(3)
    soloDestino()
    expect(JSON.stringify(peticiones)).not.toContain('empresa-real')
  })

  it('destinatarios múltiples o con inyección no llegan ni a la base ni al proveedor', async () => {
    const antes = peticiones.length
    for (const correo of ['a@x.test, b@x.test', 'a@x.test\r\nBcc: b@x.test']) {
      const r = await enviarBienvenida(db, 'uid-multi', { correo, verificado: true }, { entorno: PRUEBAS, fetch: fetchFalso })
      expect(r.estado).toBe('omitido')
    }
    expect(peticiones.length).toBe(antes)
    expect(await q(`select 1 from public.correo_envios`)).toEqual([])
  })
})
