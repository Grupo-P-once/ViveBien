import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 36 (D-80): suscripciones, envíos, supresión y presupuesto de correo.
 * Todo en PGlite, en memoria: NADA toca producción. La migración está PREPARADA, no aplicada.
 */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const ROLES = 'create role anon; create role authenticated; create role service_role;'

let db: PGlite
const q = async <T = Record<string, unknown>>(texto: string, params: unknown[] = []) => (await db.query<T>(texto, params)).rows
const fn = async (texto: string, params: unknown[]) => (await db.query<{ r: Record<string, unknown> }>(`select ${texto} as r`, params)).rows[0].r

const PREFS = { operacion: 'venta', tipos: ['nave'], zonas: ['León'] }
const suscribir = (email: string, version: string | null = 'marketing-test', prefs: unknown = PREFS) =>
  fn('public.correo_suscribir($1, $2, $3::jsonb, $4, $5)', [email, 'Ana', JSON.stringify(prefs), 'recomendaciones', version])
const reservar = (clave: string, cat: string, email: string, sus: string | null = null, dia = 70, mes = 2000, reserva = 20) =>
  fn('public.correo_reservar_envio($1, $2, $3, $4, $5::uuid, $6::text[], $7, $8, $9)', [clave, cat, 'prueba', email, sus, null, dia, mes, reserva])
const evento = (id: string, tipo: string, email: string, resend: string | null = null, permanente = false) =>
  fn('public.correo_evento($1, $2, $3, $4, $5)', [id, tipo, email, resend, permanente])

async function activar(email: string): Promise<string> {
  const s = await suscribir(email)
  await fn('public.correo_confirmar($1::uuid)', [s.id])
  return String(s.id)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(ROLES)
  await db.exec('create table public.tabla_ajena (id int primary key); insert into public.tabla_ajena values (1);')
  await db.exec(sql('36-correo-suscripciones.sql'))
}, 90_000)
afterAll(async () => { await db?.close() })

describe('la migración aplica y se puede reaplicar', () => {
  it('es idempotente y deja las 4 tablas con RLS activado y SIN políticas', async () => {
    await db.exec(sql('36-correo-suscripciones.sql'))
    const t = await q<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname like 'correo\\_%' and relkind = 'r' order by 1`)
    expect(t.map((x) => x.relname)).toEqual(['correo_envios', 'correo_supresiones', 'correo_suscriptores', 'correo_webhook_vistos'])
    expect(t.every((x) => x.relrowsecurity)).toBe(true)
    expect(await q(`select 1 from pg_policies where schemaname = 'public' and tablename like 'correo\\_%'`)).toEqual([])
  })

  it('la clave pública y los usuarios con sesión NO pueden ejecutar las funciones; service_role sí', async () => {
    for (const rol of ['anon', 'authenticated']) {
      await db.exec(`set role ${rol}`)
      await expect(db.query(`select public.correo_baja('00000000-0000-0000-0000-000000000000'::uuid, 'x')`)).rejects.toThrow(/permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    await expect(db.query(`select public.correo_baja('00000000-0000-0000-0000-000000000000'::uuid, 'x')`)).resolves.toBeDefined()
    await db.exec('reset role')
  })
})

describe('suscripción de un visitante: siempre pendiente hasta confirmar', () => {
  it('rechaza correos mal formados y exige consentimiento (versión del texto)', async () => {
    for (const mal of ['', 'sin-arroba', 'a@b', 'a b@c.com', 'a@b.c', 'uno@x.com,dos@x.com', 'x@y.com;z@w.com']) {
      expect((await suscribir(mal)).accion, mal).toBe('invalida')
    }
    expect((await suscribir('sin.consent@ejemplo.test', null)).accion).toBe('sin_consentimiento')
    expect((await suscribir('sin.consent@ejemplo.test', '   ')).accion).toBe('sin_consentimiento')
    expect(await q(`select 1 from public.correo_suscriptores where email_norm = 'sin.consent@ejemplo.test'`)).toEqual([])
  })

  it('crea «pendiente» con la PRUEBA del consentimiento (versión y fecha), normaliza el correo y no crea duplicados', async () => {
    const a = await suscribir('  Persona.Uno@Ejemplo.TEST ')
    expect(a.accion).toBe('confirmar')
    const b = await suscribir('persona.uno@ejemplo.test')
    expect(b.accion).toBe('confirmar')
    expect(b.id).toBe(a.id)
    const f = await q<Record<string, unknown>>(`select * from public.correo_suscriptores where email_norm = 'persona.uno@ejemplo.test'`)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ estado: 'pendiente', consentimiento_version: 'marketing-test', fuente: 'recomendaciones', proximo_envio_en: null, confirmado_en: null })
    expect(f[0].consentimiento_en).not.toBeNull()
  })

  it('confirmar activa, deja constancia y programa el primer envío; confirmar dos veces no cambia nada', async () => {
    const s = await suscribir('confirma@ejemplo.test')
    const c1 = await fn('public.correo_confirmar($1::uuid)', [s.id])
    expect(c1).toMatchObject({ estado: 'activa', cambio: true })
    const c2 = await fn('public.correo_confirmar($1::uuid)', [s.id])
    expect(c2).toMatchObject({ estado: 'activa', cambio: false })
    const f = (await q<Record<string, unknown>>(`select * from public.correo_suscriptores where id = $1`, [s.id]))[0]
    expect(f.confirmado_en).not.toBeNull()
    expect(f.proximo_envio_en).not.toBeNull()
  })

  it('si ya se mandó un primer lote al pedirlo, confirmar programa lo siguiente 3 días DESPUÉS de él (no «ya mismo»)', async () => {
    const s = await suscribir('primer.lote@ejemplo.test')
    const r = await reservar('inicial/primer-lote', 'transaccional', 'primer.lote@ejemplo.test', String(s.id))
    await db.query(`select public.correo_marcar_envio($1::bigint, 'enviado', 're_1', null)`, [r.id])
    await fn('public.correo_confirmar($1::uuid)', [s.id])
    const [f] = await q<{ dias: number }>(`select extract(epoch from (proximo_envio_en - now())) / 86400 as dias from public.correo_suscriptores where id = $1`, [s.id])
    expect(Number(f.dias)).toBeGreaterThan(2.9)
    expect(Number(f.dias)).toBeLessThan(3.1)
  })

  it('un id desconocido no activa nada ni revela más', async () => {
    expect(await fn(`public.correo_confirmar('11111111-1111-1111-1111-111111111111'::uuid)`, [])).toMatchObject({ estado: 'desconocida' })
  })

  it('una activa NO cambia sus preferencias desde un formulario anónimo', async () => {
    const id = await activar('activa.firme@ejemplo.test')
    const r = await suscribir('activa.firme@ejemplo.test', 'marketing-test', { operacion: 'renta', tipos: ['casa'] })
    expect(r).toMatchObject({ accion: 'ya_activa', id })
    const f = (await q<{ preferencias: { operacion: string } }>(`select preferencias from public.correo_suscriptores where id = $1`, [id]))[0]
    expect(f.preferencias.operacion).toBe('venta')
  })
})

describe('baja: persistente, idempotente, y nunca se reactiva por accidente', () => {
  it('la baja detiene los envíos y se conserva la fecha', async () => {
    const id = await activar('baja.uno@ejemplo.test')
    expect(await fn(`public.correo_baja($1::uuid, 'enlace')`, [id])).toMatchObject({ ok: true, cambio: true })
    expect(await fn(`public.correo_baja($1::uuid, 'enlace')`, [id])).toMatchObject({ ok: true, cambio: false })
    const f = (await q<Record<string, unknown>>(`select * from public.correo_suscriptores where id = $1`, [id]))[0]
    expect(f).toMatchObject({ estado: 'baja', proximo_envio_en: null, baja_motivo: 'enlace' })
    expect(f.baja_en).not.toBeNull()
  })

  it('volver a llenar el formulario NO reactiva: sigue en «baja» hasta que confirme otra vez por correo', async () => {
    const id = await activar('baja.dos@ejemplo.test')
    await fn(`public.correo_baja($1::uuid, 'enlace')`, [id])
    const r = await suscribir('baja.dos@ejemplo.test')
    expect(r).toMatchObject({ accion: 'confirmar', id })
    expect((await q<{ estado: string }>(`select estado from public.correo_suscriptores where id = $1`, [id]))[0].estado).toBe('baja')
    // no se puede reservar un envío de marketing mientras siga en baja
    expect(await reservar('reco/baja.dos/1', 'marketing', 'baja.dos@ejemplo.test', id)).toMatchObject({ accion: 'suprimido' })
    // …y sólo la confirmación expresa por correo lo reactiva
    expect(await fn('public.correo_confirmar($1::uuid)', [id])).toMatchObject({ estado: 'activa', cambio: true })
  })
})

describe('eventos del proveedor: idempotentes y con supresión', () => {
  it('rebote PERMANENTE: suprime la dirección, marca la suscripción y bloquea nuevas suscripciones', async () => {
    const id = await activar('rebota@ejemplo.test')
    expect(await evento('msg_rb_1', 'email.bounced', 'rebota@ejemplo.test', 're_1', true)).toMatchObject({ resultado: 'aplicado' })
    expect(await evento('msg_rb_1', 'email.bounced', 'rebota@ejemplo.test', 're_1', true)).toMatchObject({ resultado: 'duplicado' })
    expect((await q<{ estado: string }>(`select estado from public.correo_suscriptores where id = $1`, [id]))[0].estado).toBe('rebotada')
    expect(await q(`select motivo from public.correo_supresiones where email_norm = 'rebota@ejemplo.test'`)).toEqual([{ motivo: 'rebote' }])
    expect((await suscribir('rebota@ejemplo.test')).accion).toBe('bloqueada')
    expect(await fn('public.correo_confirmar($1::uuid)', [id])).toMatchObject({ estado: 'bloqueada' })
  })

  it('rebote TEMPORAL no suprime nada', async () => {
    const id = await activar('temporal@ejemplo.test')
    await evento('msg_tmp_1', 'email.bounced', 'temporal@ejemplo.test', 're_tmp', false)
    expect((await q<{ estado: string }>(`select estado from public.correo_suscriptores where id = $1`, [id]))[0].estado).toBe('activa')
    expect(await q(`select 1 from public.correo_supresiones where email_norm = 'temporal@ejemplo.test'`)).toEqual([])
  })

  it('queja de spam: suprime, da de baja y bloquea el marketing futuro', async () => {
    const id = await activar('queja@ejemplo.test')
    await evento('msg_q_1', 'email.complained', 'queja@ejemplo.test', 're_q')
    expect((await q<{ estado: string }>(`select estado from public.correo_suscriptores where id = $1`, [id]))[0].estado).toBe('queja')
    expect(await reservar('reco/queja/1', 'marketing', 'queja@ejemplo.test', id)).toMatchObject({ accion: 'suprimido' })
    expect((await suscribir('queja@ejemplo.test')).accion).toBe('bloqueada')
  })

  it('«entregado» actualiza el envío; un evento sin dirección o sin id no rompe nada', async () => {
    await reservar('tx/entrega/1', 'transaccional', 'entrega@ejemplo.test')
    const env = (await q<{ id: number }>(`select id from public.correo_envios where clave = 'tx/entrega/1'`))[0].id
    await fn(`public.correo_marcar_envio($1::bigint, 'enviado', 're_ent', null)`, [env]).catch(() => undefined)
    await db.query(`select public.correo_marcar_envio($1::bigint, 'enviado', 're_ent', null)`, [env])
    await evento('msg_dl_1', 'email.delivered', 'entrega@ejemplo.test', 're_ent')
    expect((await q<{ estado: string }>(`select estado from public.correo_envios where id = $1`, [env]))[0].estado).toBe('entregado')
    expect(await evento('', 'email.delivered', '', null)).toMatchObject({ resultado: 'invalido' })
    expect(await evento('msg_sin_dir', 'email.bounced', '', null, true)).toMatchObject({ resultado: 'aplicado' })
  })
})

describe('reservar un envío: idempotencia, supresión y presupuesto (todo en una transacción)', () => {
  it('la misma clave dos veces = UN solo envío', async () => {
    const a = await reservar('tx/bienvenida/uid-1', 'transaccional', 'nuevo.uno@ejemplo.test')
    const b = await reservar('tx/bienvenida/uid-1', 'transaccional', 'nuevo.uno@ejemplo.test')
    expect(a.accion).toBe('enviar')
    expect(b).toMatchObject({ accion: 'duplicado' })
    expect(await q(`select 1 from public.correo_envios where clave = 'tx/bienvenida/uid-1'`)).toHaveLength(1)
  })

  it('un fallo se puede reintentar pasados 10 minutos con la misma clave; antes, no', async () => {
    const a = await reservar('tx/reintento/1', 'transaccional', 'reintento@ejemplo.test')
    await db.query(`select public.correo_marcar_envio($1::bigint, 'error', null, 'caída')`, [a.id])
    expect((await reservar('tx/reintento/1', 'transaccional', 'reintento@ejemplo.test')).accion).toBe('duplicado')
    await db.exec(`update public.correo_envios set creado_en = now() - interval '11 minutes' where clave = 'tx/reintento/1'`)
    expect(await reservar('tx/reintento/1', 'transaccional', 'reintento@ejemplo.test')).toMatchObject({ accion: 'enviar', reintento: true })
  })

  it('un envío YA enviado nunca se vuelve a reservar', async () => {
    const a = await reservar('tx/enviado/1', 'transaccional', 'enviado@ejemplo.test')
    await db.query(`select public.correo_marcar_envio($1::bigint, 'enviado', 're_x', null)`, [a.id])
    await db.exec(`update public.correo_envios set creado_en = now() - interval '2 hours' where clave = 'tx/enviado/1'`)
    expect((await reservar('tx/enviado/1', 'transaccional', 'enviado@ejemplo.test')).accion).toBe('duplicado')
  })

  it('el marketing exige suscripción ACTIVA; lo transaccional no', async () => {
    const s = await suscribir('pendiente.mkt@ejemplo.test')
    expect(await reservar('reco/pend/1', 'marketing', 'pendiente.mkt@ejemplo.test', String(s.id))).toMatchObject({ accion: 'suprimido' })
    expect((await reservar('tx/pend/1', 'transaccional', 'pendiente.mkt@ejemplo.test')).accion).toBe('enviar')
  })

  it('una queja bloquea marketing pero NO el aviso transaccional; un rebote permanente bloquea ambos', async () => {
    await db.exec(`insert into public.correo_supresiones values ('solo.queja@ejemplo.test', 'queja'), ('solo.rebote@ejemplo.test', 'rebote')`)
    expect((await reservar('tx/q/1', 'transaccional', 'solo.queja@ejemplo.test')).accion).toBe('enviar')
    expect((await reservar('tx/r/1', 'transaccional', 'solo.rebote@ejemplo.test')).accion).toBe('suprimido')
  })

  it('PRESUPUESTO: el marketing se detiene dejando la reserva transaccional; lo transaccional llega hasta el tope', async () => {
    await db.exec('delete from public.correo_envios')
    const id = await activar('presupuesto@ejemplo.test')
    // tope diario 5, reserva 2 → marketing máximo 3
    const acciones: string[] = []
    for (let i = 0; i < 5; i++) acciones.push(String((await reservar(`reco/p/${i}`, 'marketing', 'presupuesto@ejemplo.test', id, 5, 2000, 2)).accion))
    expect(acciones).toEqual(['enviar', 'enviar', 'enviar', 'sin_presupuesto', 'sin_presupuesto'])
    expect((await reservar('tx/p/1', 'transaccional', 'otro1@ejemplo.test', null, 5, 2000, 2)).accion).toBe('enviar')
    expect((await reservar('tx/p/2', 'transaccional', 'otro2@ejemplo.test', null, 5, 2000, 2)).accion).toBe('enviar')
    expect((await reservar('tx/p/3', 'transaccional', 'otro3@ejemplo.test', null, 5, 2000, 2)).accion).toBe('sin_presupuesto')
  })

  it('PRESUPUESTO MENSUAL: se cuenta en los últimos 30 días', async () => {
    await db.exec('delete from public.correo_envios')
    for (let i = 0; i < 3; i++) await reservar(`tx/m/${i}`, 'transaccional', `m${i}@ejemplo.test`, null, 100, 3, 0)
    expect((await reservar('tx/m/3', 'transaccional', 'm3@ejemplo.test', null, 100, 3, 0)).accion).toBe('sin_presupuesto')
    await db.exec(`update public.correo_envios set creado_en = now() - interval '31 days'`)
    expect((await reservar('tx/m/4', 'transaccional', 'm4@ejemplo.test', null, 100, 3, 0)).accion).toBe('enviar')
  })

  it('lo suprimido y lo duplicado NO gastan presupuesto', async () => {
    await db.exec('delete from public.correo_envios; delete from public.correo_supresiones')
    await db.exec(`insert into public.correo_supresiones values ('nogasta@ejemplo.test', 'rebote')`)
    for (let i = 0; i < 4; i++) await reservar(`tx/g/${i}`, 'transaccional', 'nogasta@ejemplo.test', null, 2, 2000, 0)
    expect(await reservar('tx/g/ok1', 'transaccional', 'bien@ejemplo.test', null, 2, 2000, 0)).toMatchObject({ accion: 'enviar' })
    await reservar('tx/g/ok1', 'transaccional', 'bien@ejemplo.test', null, 2, 2000, 0)
    expect(await reservar('tx/g/ok2', 'transaccional', 'bien2@ejemplo.test', null, 2, 2000, 0)).toMatchObject({ accion: 'enviar' })
    expect((await reservar('tx/g/ok3', 'transaccional', 'bien3@ejemplo.test', null, 2, 2000, 0)).accion).toBe('sin_presupuesto')
  })

  it('reservas simultáneas: el tope diario se respeta (el candado de la transacción las ordena)', async () => {
    await db.exec('delete from public.correo_envios; delete from public.correo_supresiones')
    const r = await Promise.all(Array.from({ length: 12 }, (_, i) => reservar(`tx/par/${i}`, 'transaccional', `par${i}@ejemplo.test`, null, 4, 2000, 0)))
    expect(r.filter((x) => x.accion === 'enviar')).toHaveLength(4)
    expect(r.filter((x) => x.accion === 'sin_presupuesto')).toHaveLength(8)
  })
})

describe('salud del marketing (la tarea diaria se pausa con esto)', () => {
  it('cuenta enviados, rebotes y quejas de los últimos 7 días, sólo de marketing', async () => {
    await db.exec('delete from public.correo_envios')
    await db.exec(`insert into public.correo_envios (clave, categoria, tipo, email_norm, estado) values
      ('s/1','marketing','reco','a@x.test','entregado'), ('s/2','marketing','reco','b@x.test','rebotado'), ('s/3','marketing','reco','c@x.test','queja'),
      ('s/4','transaccional','tx','d@x.test','rebotado')`)
    await db.exec(`insert into public.correo_envios (clave, categoria, tipo, email_norm, estado, creado_en) values ('s/5','marketing','reco','e@x.test','queja', now() - interval '9 days')`)
    expect(await fn('public.correo_salud()', [])).toEqual({ enviados7: 3, rebotados7: 1, quejas7: 1 })
  })
})

describe('cuenta con sesión: el marketing es una decisión aparte de crear la cuenta', () => {
  const cuenta = (uid: string, email: string, aceptar: boolean, version: string | null = 'marketing-test') =>
    fn('public.correo_cuenta_marketing($1, $2, $3, $4::jsonb, $5)', [uid, email, aceptar, JSON.stringify(PREFS), version])

  it('sin aceptar no se crea ninguna suscripción; aceptar la crea ACTIVA con constancia; retirarla da de baja', async () => {
    expect(await cuenta('uid-a', 'cuenta.a@ejemplo.test', false)).toMatchObject({ estado: 'baja' })
    expect(await q(`select 1 from public.correo_suscriptores where email_norm = 'cuenta.a@ejemplo.test'`)).toEqual([])
    expect(await cuenta('uid-a', 'Cuenta.A@Ejemplo.test', true)).toMatchObject({ estado: 'activa' })
    const f = (await q<Record<string, unknown>>(`select * from public.correo_suscriptores where email_norm = 'cuenta.a@ejemplo.test'`))[0]
    expect(f).toMatchObject({ uid: 'uid-a', estado: 'activa', fuente: 'cuenta', consentimiento_version: 'marketing-test' })
    expect(await cuenta('uid-a', 'cuenta.a@ejemplo.test', false)).toMatchObject({ estado: 'baja' })
    expect((await q<{ estado: string; proximo_envio_en: unknown }>(`select estado, proximo_envio_en from public.correo_suscriptores where email_norm = 'cuenta.a@ejemplo.test'`))[0]).toMatchObject({ estado: 'baja', proximo_envio_en: null })
  })

  it('exige la versión del texto aceptado; no revive una queja ni un rebote', async () => {
    expect(await cuenta('uid-b', 'cuenta.b@ejemplo.test', true, null)).toMatchObject({ estado: 'sin_consentimiento' })
    await db.exec(`insert into public.correo_supresiones values ('cuenta.c@ejemplo.test', 'queja')`)
    expect(await cuenta('uid-c', 'cuenta.c@ejemplo.test', true)).toMatchObject({ estado: 'bloqueada' })
  })

  it('crear la cuenta vincula al visitante del mismo correo SIN activar ni cambiar su consentimiento', async () => {
    const s = await suscribir('visitante.luego.cuenta@ejemplo.test')
    await db.query(`select public.correo_vincular_cuenta('uid-v', 'Visitante.Luego.Cuenta@Ejemplo.test')`)
    const f = (await q<Record<string, unknown>>(`select uid, estado from public.correo_suscriptores where id = $1`, [s.id]))[0]
    expect(f).toMatchObject({ uid: 'uid-v', estado: 'pendiente' })
    await db.query(`select public.correo_vincular_cuenta('uid-otro', 'visitante.luego.cuenta@ejemplo.test')`)
    expect((await q<{ uid: string }>(`select uid from public.correo_suscriptores where id = $1`, [s.id]))[0].uid).toBe('uid-v') // no se pisa
  })

  it('la misma persona con un lead previo (visitante) se VINCULA, no se duplica', async () => {
    await activar('misma.persona@ejemplo.test')
    await cuenta('uid-d', 'misma.persona@ejemplo.test', true)
    expect(await q(`select uid from public.correo_suscriptores where email_norm = 'misma.persona@ejemplo.test'`)).toEqual([{ uid: 'uid-d' }])
  })
})

describe('la reversa borra sólo lo creado por la migración', () => {
  it('deja las tablas ajenas intactas', async () => {
    await db.exec(sql('36-correo-suscripciones.REVERTIR.sql'))
    expect(await q(`select 1 from pg_class where relnamespace = 'public'::regnamespace and relname like 'correo\\_%'`)).toEqual([])
    expect(await q(`select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname like 'correo\\_%'`)).toEqual([])
    expect(await q('select id from public.tabla_ajena')).toEqual([{ id: 1 }])
    await db.exec(sql('36-correo-suscripciones.sql')) // y se puede volver a aplicar
    expect(await q(`select 1 from pg_class where relnamespace = 'public'::regnamespace and relname = 'correo_envios'`)).toHaveLength(1)
  })
})
