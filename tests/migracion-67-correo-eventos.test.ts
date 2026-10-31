import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Migración 67 (MKT-49): eventos del proveedor que llegan ANTES de que el envío tenga su resend_id, y eventos de OTRA aplicación.
 * SQL real (62 + 63 + 67) en PGlite: nada toca ninguna base ni proveedor reales.
 */
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
let db: PGlite
const q = async <T = Record<string, unknown>>(texto: string, params: unknown[] = []) => (await db.query<T>(texto, params)).rows
const cuenta = async (t: string) => Number((await q<{ n: string }>(`select count(*) n from public.${t}`))[0].n)
const evento = async (svix: string, tipo: string, email: string | null, resend: string | null, perm = false) =>
  ((await q<{ r: { resultado: string } }>(`select public.correo_evento($1, $2, $3, $4, $5) r`, [svix, tipo, email, resend, perm]))[0].r).resultado
const marcar = (id: number, estado: string, resend: string | null) => q(`select public.correo_marcar_envio($1::bigint, $2, $3, null)`, [id, estado, resend])
const nuevoEnvio = async (clave: string, estado = 'pendiente', resend: string | null = null) =>
  Number((await q<{ id: string }>(`insert into public.correo_envios (clave, categoria, tipo, email_hash, estado, resend_id, entorno) values ($1, 'servicio', 'alertas', public.correo_huella('persona@ejemplo.invalid'), $2, $3, 'pruebas') returning id`, [clave, estado, resend]))[0].id)
const estadoDe = async (clave: string) => (await q<{ estado: string }>('select estado from public.correo_envios where clave = $1', [clave]))[0]?.estado
const PERSONA = 'persona@ejemplo.invalid'

beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role;')
  await db.exec(sql('62-correo-suscripciones.sql')); await db.exec(sql('63-correo-baja-promocional.sql')); await db.exec(sql('67-correo-eventos-pendientes.sql'))
}, 90_000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec('drop trigger if exists falla_prueba on public.correo_envios; drop function if exists public.falla_prueba();')
  await db.exec('delete from public.correo_eventos_pendientes; delete from public.correo_webhook_vistos; delete from public.correo_supresiones; delete from public.correo_suscriptores; delete from public.correo_envios;')
})

describe('migración 67: objetos, permisos, idempotencia y reversa', () => {
  it('crea la cuarentena con RLS, sin permisos para anon/authenticated, y solo guarda huella (nunca el correo)', async () => {
    expect((await q<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where relname = 'correo_eventos_pendientes'`))[0].relrowsecurity).toBe(true)
    const cols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'correo_eventos_pendientes'`)).map((c) => c.column_name)
    expect(cols).toEqual(expect.arrayContaining(['svix_id', 'tipo', 'resend_id', 'email_hash', 'rebote_permanente', 'recibido_en']))
    expect(cols.filter((c) => /^(email|correo|para|to)$/i.test(c))).toEqual([])
    const privs = await q<{ rol: string }>(`select distinct coalesce(r.rolname, 'public') rol from pg_class c cross join lateral aclexplode(c.relacl) p left join pg_roles r on r.oid = p.grantee where c.relname = 'correo_eventos_pendientes'`)
    expect(privs.map((p) => p.rol).filter((r) => ['anon', 'authenticated', 'public'].includes(r))).toEqual([])
    const interna = await q<{ rol: string }>(`select distinct coalesce(r.rolname, 'public') rol from pg_proc pr cross join lateral aclexplode(pr.proacl) p left join pg_roles r on r.oid = p.grantee where pr.proname = 'correo_aplicar_evento'`)
    expect(interna.map((p) => p.rol).filter((r) => ['anon', 'authenticated', 'public'].includes(r))).toEqual([])
  })

  it('se puede reaplicar sin cambios y la reversa restaura las funciones de la 62/63 y quita la cuarentena', async () => {
    const huella = async () => (await q<{ h: string }>(`select md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.proname)) h from pg_proc p where pronamespace = 'public'::regnamespace and proname like 'correo\\_%'`))[0].h
    const a = await huella()
    await db.exec(sql('67-correo-eventos-pendientes.sql'))
    expect(await huella()).toBe(a)
    await db.exec(sql('67-correo-eventos-pendientes.REVERTIR.sql'))
    expect(await q(`select 1 from pg_class where relname = 'correo_eventos_pendientes'`)).toEqual([])
    expect(await q(`select 1 from pg_proc where proname = 'correo_aplicar_evento'`)).toEqual([])
    const original = new PGlite(); await original.exec('create role anon; create role authenticated; create role service_role;'); await original.exec(sql('62-correo-suscripciones.sql')); await original.exec(sql('63-correo-baja-promocional.sql'))
    const h0 = (await original.query<{ h: string }>(`select md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.proname)) h from pg_proc p where pronamespace = 'public'::regnamespace and proname like 'correo\\_%'`)).rows[0].h
    expect(await huella()).toBe(h0) // idéntica a «solo 62 + 63»
    await original.close()
    await db.exec(sql('67-correo-eventos-pendientes.sql')) // y se vuelve a aplicar
    expect(await huella()).toBe(a)
  })
})

describe('MKT-49: el orden evento / resend_id no pierde el evento', () => {
  it('1) el ID se guarda primero y el evento llega después: se aplica directo', async () => {
    const id = await nuevoEnvio('clave-1')
    await marcar(id, 'enviado', 're_1')
    expect(await evento('svix_aaa', 'email.delivered', PERSONA, 're_1')).toBe('aplicado')
    expect(await estadoDe('clave-1')).toBe('entregado'); expect(await cuenta('correo_eventos_pendientes')).toBe(0)
  })

  it('2) el evento llega primero: queda en cuarentena SIN efectos y se aplica al anotar el resend_id (misma transacción)', async () => {
    const id = await nuevoEnvio('clave-2')
    expect(await evento('svix_bbb', 'email.delivered', PERSONA, 're_2')).toBe('pendiente')
    expect(await estadoDe('clave-2')).toBe('pendiente'); expect(await cuenta('correo_eventos_pendientes')).toBe(1); expect(await cuenta('correo_webhook_vistos')).toBe(1)
    await marcar(id, 'enviado', 're_2')
    expect(await estadoDe('clave-2')).toBe('entregado'); expect(await cuenta('correo_eventos_pendientes')).toBe(0)
  })

  it('3) rebote PERMANENTE antes del ID: no suprime a nadie hasta que se asocia; después sí (supresión por huella, suscripción rebotada, envío rebotado)', async () => {
    await q(`insert into public.correo_suscriptores (email, email_norm, estado, consentimiento_en, confirmado_en) values ($1, $1, 'activa', now(), now())`, [PERSONA])
    const id = await nuevoEnvio('clave-3')
    expect(await evento('svix_ccc', 'email.bounced', PERSONA, 're_3', true)).toBe('pendiente')
    expect(await cuenta('correo_supresiones')).toBe(0)
    expect((await q<{ estado: string }>('select estado from public.correo_suscriptores'))[0].estado).toBe('activa')
    await marcar(id, 'enviado', 're_3')
    expect(await cuenta('correo_supresiones')).toBe(1)
    expect((await q<{ estado: string }>('select estado from public.correo_suscriptores'))[0].estado).toBe('rebotada')
    expect(await estadoDe('clave-3')).toBe('rebotado')
  })

  it('4) varios eventos antes del ID, en cualquier orden: el resultado final es el mismo (rebotado)', async () => {
    for (const orden of [['email.delivered', 'email.bounced'], ['email.bounced', 'email.delivered']]) {
      await db.exec('delete from public.correo_eventos_pendientes; delete from public.correo_webhook_vistos; delete from public.correo_supresiones; delete from public.correo_envios;')
      const id = await nuevoEnvio('clave-4')
      await evento('svix_d01', orden[0], PERSONA, 're_4', true); await evento('svix_d02', orden[1], PERSONA, 're_4', true)
      expect(await cuenta('correo_eventos_pendientes')).toBe(2)
      await marcar(id, 'enviado', 're_4')
      expect(await estadoDe('clave-4'), orden.join('→')).toBe('rebotado'); expect(await cuenta('correo_eventos_pendientes')).toBe(0)
    }
  })

  it('5) repetir el mismo svix-id (reintento o replay) no duplica: ni en cuarentena ni ya reconciliado', async () => {
    const id = await nuevoEnvio('clave-5')
    expect(await evento('svix_eee', 'email.delivered', PERSONA, 're_5')).toBe('pendiente')
    expect(await evento('svix_eee', 'email.delivered', PERSONA, 're_5')).toBe('duplicado')
    expect(await cuenta('correo_eventos_pendientes')).toBe(1)
    await marcar(id, 'enviado', 're_5')
    expect(await estadoDe('clave-5')).toBe('entregado')
    await q(`update public.correo_envios set estado = 'enviado' where clave = 'clave-5'`) // si se reaplicara, volvería a «entregado»
    expect(await evento('svix_eee', 'email.delivered', PERSONA, 're_5')).toBe('duplicado')
    expect(await estadoDe('clave-5')).toBe('enviado')
  })

  it('6) un evento del MISMO envío con otro svix-id (un segundo evento real) sí se procesa', async () => {
    const id = await nuevoEnvio('clave-6'); await marcar(id, 'enviado', 're_6')
    expect(await evento('svix_f01', 'email.delivered', PERSONA, 're_6')).toBe('aplicado')
    expect(await evento('svix_f02', 'email.complained', PERSONA, 're_6')).toBe('aplicado')
    expect(await estadoDe('clave-6')).toBe('queja')
  })

  it('7) FALLO PARCIAL al aplicar: se deshace TAMBIÉN el «visto» y el reintento del proveedor sí se aplica', async () => {
    const id = await nuevoEnvio('clave-7'); await marcar(id, 'enviado', 're_7')
    await db.exec(`create function public.falla_prueba() returns trigger language plpgsql as $f$ begin raise exception 'fallo de prueba'; end $f$; create trigger falla_prueba before update on public.correo_envios for each row execute function public.falla_prueba();`)
    await expect(evento('svix_g01', 'email.delivered', PERSONA, 're_7')).rejects.toThrow(/fallo de prueba/)
    expect(await cuenta('correo_webhook_vistos')).toBe(0); expect(await estadoDe('clave-7')).toBe('enviado')
    await db.exec('drop trigger falla_prueba on public.correo_envios')
    expect(await evento('svix_g01', 'email.delivered', PERSONA, 're_7')).toBe('aplicado')
    expect(await estadoDe('clave-7')).toBe('entregado')
  })

  it('8) FALLO PARCIAL al reconciliar: anotar el resend_id se deshace entero (el evento sigue en cuarentena) y al reintentar se aplica', async () => {
    const id = await nuevoEnvio('clave-8')
    await evento('svix_h01', 'email.delivered', PERSONA, 're_8')
    await db.exec(`create function public.falla_prueba() returns trigger language plpgsql as $f$ begin if new.estado = 'entregado' then raise exception 'fallo de prueba'; end if; return new; end $f$; create trigger falla_prueba before update on public.correo_envios for each row execute function public.falla_prueba();`)
    await expect(marcar(id, 'enviado', 're_8')).rejects.toThrow(/fallo de prueba/)
    expect((await q<{ resend_id: string | null }>(`select resend_id from public.correo_envios where clave = 'clave-8'`))[0].resend_id).toBeNull()
    expect(await cuenta('correo_eventos_pendientes')).toBe(1)
    await db.exec('drop trigger falla_prueba on public.correo_envios')
    await marcar(id, 'enviado', 're_8')
    expect(await estadoDe('clave-8')).toBe('entregado'); expect(await cuenta('correo_eventos_pendientes')).toBe(0)
  })
})

describe('eventos de OTRA aplicación (misma cuenta de Resend): ninguna actualización ni supresión', () => {
  it('un rebote permanente / queja / supresión con un resend_id que no es nuestro NO cambia estados, NO suprime ni toca suscripciones', async () => {
    await q(`insert into public.correo_suscriptores (email, email_norm, estado, consentimiento_en, confirmado_en) values ($1, $1, 'activa', now(), now())`, [PERSONA])
    const id = await nuevoEnvio('clave-9'); await marcar(id, 'enviado', 're_nuestro')
    for (const [i, tipo] of ['email.bounced', 'email.complained', 'email.suppressed', 'email.failed', 'email.delivered'].entries()) {
      expect(await evento(`svix_x0${i}`, tipo, PERSONA, 're_de_otra_app', true)).toBe('pendiente')
    }
    expect(await cuenta('correo_supresiones')).toBe(0)
    expect((await q<{ estado: string }>('select estado from public.correo_suscriptores'))[0].estado).toBe('activa')
    expect(await estadoDe('clave-9')).toBe('enviado')
  })

  it('los pendientes ajenos se purgan a los 7 días y nunca guardan el correo; el tope de 5 000 evita crecer sin límite', async () => {
    await evento('svix_y01', 'email.bounced', PERSONA, 're_otra_1', true)
    await q(`update public.correo_eventos_pendientes set recibido_en = now() - interval '8 days'`)
    await evento('svix_y02', 'email.bounced', PERSONA, 're_otra_2', true)
    const r = (await q<{ r: { eventos_sin_envio: number } }>('select public.correo_purgar() r'))[0].r
    expect(r.eventos_sin_envio).toBe(1); expect(await cuenta('correo_eventos_pendientes')).toBe(1)
    expect(JSON.stringify(await q('select * from public.correo_eventos_pendientes'))).not.toContain('ejemplo.invalid')
    await q(`insert into public.correo_eventos_pendientes (svix_id, tipo, resend_id) select 'tope_' || g, 'email.delivered', 're_t' || g from generate_series(1, 5000) g where 'tope_' || g not in (select svix_id from public.correo_eventos_pendientes)`)
    expect(await evento('svix_z01', 'email.delivered', PERSONA, 're_nuevo')).toBe('descartado')
    expect(await cuenta('correo_webhook_vistos')).toBe(2) // (y01, y02) el descartado NO queda «visto»: un replay posterior puede aplicarse
  })

  it('olvidar una cuenta borra también sus eventos en cuarentena (por huella)', async () => {
    await evento('svix_w01', 'email.bounced', PERSONA, 're_w', true)
    expect(await cuenta('correo_eventos_pendientes')).toBe(1)
    await q(`select public.correo_olvidar_cuenta(null, $1)`, [PERSONA])
    expect(await cuenta('correo_eventos_pendientes')).toBe(0)
  })
})

describe('entradas inválidas: no se atribuyen ni se marcan vistas', () => {
  it('sin resend_id → «sin_identidad»; tipo no soportado → «ignorado»; svix-id corto → «invalido»; ninguno queda visto ni pendiente', async () => {
    expect(await evento('svix_v01', 'email.delivered', PERSONA, null)).toBe('sin_identidad')
    expect(await evento('svix_v02', 'email.delivered', PERSONA, '   ')).toBe('sin_identidad')
    expect(await evento('svix_v03', 'email.opened', PERSONA, 're_v')).toBe('ignorado')
    expect(await evento('ab', 'email.delivered', PERSONA, 're_v')).toBe('invalido')
    expect(await cuenta('correo_webhook_vistos')).toBe(0); expect(await cuenta('correo_eventos_pendientes')).toBe(0)
  })
})
