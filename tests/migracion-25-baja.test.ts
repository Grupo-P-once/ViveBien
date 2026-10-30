import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * V-1.1.87 (3b-3) · D-35 — Ensayo de la migración 25 (baja de cuenta).
 *
 * Todo ocurre en PGlite, en memoria. Nada de esto toca producción.
 *
 * Lo que se prueba aquí es el ESQUEMA: que la migración se aplica, que se
 * puede reaplicar, que las restricciones dicen lo que deben decir y —lo más
 * importante— que una lápida con el correo nulo deja ese correo libre para un
 * alta nueva. El procedimiento de baja todavía no está implementado.
 */

let db: PGlite
const leerSql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')

/** Las 23 columnas que apuntan a una persona, y su trato (§4 del diseño). */
const REFERENCIAS = [
  { tabla: 'usuarios', columna: 'uid', trato: 'conservar' },
  { tabla: 'propiedades', columna: 'owner_id', trato: 'conservar' },
  { tabla: 'propiedades', columna: 'revisado_por', trato: 'disociar' },
  { tabla: 'citas', columna: 'cliente_uid', trato: 'conservar' },
  { tabla: 'citas', columna: 'asesor_uid', trato: 'abierto' },
  { tabla: 'citas', columna: 'creada_por', trato: 'disociar' },
  { tabla: 'citas', columna: 'propuesta_por', trato: 'disociar' },
  { tabla: 'ajustes_citas', columna: 'asesor_uid', trato: 'suprimir' },
  { tabla: 'disponibilidad_asesores', columna: 'asesor_uid', trato: 'suprimir' },
  { tabla: 'bloqueos_asesores', columna: 'asesor_uid', trato: 'suprimir' },
  { tabla: 'calendarios_google', columna: 'asesor_uid', trato: 'suprimir' },
  { tabla: 'favoritos', columna: 'uid', trato: 'suprimir' },
  { tabla: 'busquedas_guardadas', columna: 'uid', trato: 'suprimir' },
  { tabla: 'google_oauth_estados', columna: 'uid', trato: 'suprimir' },
  { tabla: 'eventos', columna: 'uid', trato: 'disociar' },
  { tabla: 'solicitudes_contacto', columna: 'cliente_uid', trato: 'conservar' },
  { tabla: 'solicitudes_contacto', columna: 'owner_id', trato: 'conservar' },
  { tabla: 'audit_logs', columna: 'actor_uid', trato: 'bloquear' },
  { tabla: 'audit_logs', columna: 'actor_email', trato: 'disociar' },
  { tabla: 'citas_eventos', columna: 'actor_uid', trato: 'bloquear' },
  { tabla: 'configuracion', columna: 'actualizado_por', trato: 'bloquear' },
  { tabla: 'invitaciones', columna: 'aceptada_por', trato: 'bloquear' },
  { tabla: 'invitaciones', columna: 'invitado_por', trato: 'bloquear' },
] as const

const TRATOS = ['suprimir', 'disociar', 'bloquear', 'conservar', 'abierto']

/** El mismo patrón con el que se barrió el catálogo de producción. */
const PATRON_PERSONA = /(uid|_por$|owner|actor|usuario|asesor|revisor|titular|autor)/

async function falla(sql: string): Promise<string> {
  try {
    await db.exec(sql)
    return ''
  } catch (e) {
    return (e as Error).message
  }
}

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;

    create table public.usuarios (
      uid text primary key,
      email text not null,
      nombre text, telefono text, whatsapp text, foto_url text,
      inmobiliaria text, zonas text[], biografia text,
      rol text not null default 'cliente'
        check (rol in ('cliente','publicador','admin','super_admin')),
      estado text not null default 'activo'
        constraint usuarios_estado_check check (estado in ('activo','suspendido','pendiente')),
      busca_operacion text, presupuesto_max numeric, busca_zonas text[], busca_tipos text[],
      bienvenida_vista boolean not null default false,
      completitud smallint not null default 0,
      ultimo_acceso timestamptz, notificaciones_vistas_en timestamptz,
      creado_en timestamptz not null default now(),
      actualizado_en timestamptz not null default now()
    );
    create unique index usuarios_email_idx on public.usuarios (lower(email));

    create table public.invitaciones (
      id serial primary key, email text not null, nombre text, rol text not null,
      estado text not null default 'pendiente'
        constraint invitaciones_estado_check check (estado in ('pendiente','aceptada','cancelada')),
      invitado_por text not null, aceptada_por text,
      creado_en timestamptz not null default now(), enviado_en timestamptz, aceptada_en timestamptz
    );

    create table public.propiedades (
      id text primary key, estatus text not null default 'disponible',
      owner_id text references public.usuarios(uid), revisado_por text
    );

    create table public.citas (
      id text primary key, propiedad_id text,
      cliente_uid text not null references public.usuarios(uid),
      asesor_uid text not null references public.usuarios(uid),
      inicio timestamptz, fin timestamptz, margen_min int, ocupa_desde timestamptz,
      ocupa_hasta timestamptz, zona_horaria text, estado text, estado_previo text, version int,
      propuesta_inicio timestamptz, propuesta_fin timestamptz, propuesta_por text,
      cliente_nombre text not null, cliente_telefono text not null, cliente_email text,
      consentimiento_version text, consentimiento_en timestamptz,
      propiedad_titulo text, lugar text, notas_cliente text, notas_internas text,
      motivo_cancelacion text, google_event_id text, google_sync text, google_error text,
      google_intentos int, clave_idempotencia text,
      creada_por text not null, creada_en timestamptz default now(), actualizada_en timestamptz
    );

    create table public.solicitudes_contacto (
      id text primary key, cliente_uid text not null, propiedad_id text, owner_id text,
      nombre text not null, telefono text not null, email text not null, mensaje text,
      propiedad_titulo text, tipo text, visita_preferida text,
      consentimiento_en timestamptz not null default now(),
      consentimiento_version text not null default 'v1',
      whatsapp_estado text, whatsapp_id text, whatsapp_error text,
      origen text, creado_en timestamptz not null default now()
    );

    -- El resto de las tablas de la matriz, con lo justo para comprobarla.
    create table public.ajustes_citas (asesor_uid text not null references public.usuarios(uid));
    create table public.disponibilidad_asesores (asesor_uid text not null references public.usuarios(uid));
    create table public.bloqueos_asesores (asesor_uid text not null references public.usuarios(uid));
    create table public.calendarios_google (asesor_uid text not null references public.usuarios(uid));
    create table public.favoritos (uid text not null);
    create table public.busquedas_guardadas (uid text not null);
    create table public.google_oauth_estados (uid text not null);
    create table public.eventos (uid text);
    create table public.audit_logs (actor_uid text not null, actor_email text, actor_rol text);
    create table public.citas_eventos (actor_uid text, actor_rol text not null);
    create table public.configuracion (actualizado_por text);

    insert into public.usuarios (uid, email, rol) values
      ('u-cliente', 'persona@correo.com', 'cliente'),
      ('u-publicador', 'publica@correo.com', 'publicador');
    insert into public.propiedades (id, estatus, owner_id) values ('p-1', 'disponible', 'u-publicador');
  `)
})

afterAll(async () => {
  await db?.close()
})

describe('la migración 25 se aplica', () => {
  it('se aplica y se puede reaplicar (es idempotente)', async () => {
    await db.exec(leerSql('25-baja-de-cuenta.sql'))
    await db.exec(leerSql('25-baja-de-cuenta.sql'))
  })

  it('`usuarios.email` y `citas.creada_por` pasan a admitir nulos', async () => {
    const r = await db.query<{ table_name: string; column_name: string; is_nullable: string }>(`
      select table_name, column_name, is_nullable from information_schema.columns
      where (table_name='usuarios' and column_name='email')
         or (table_name='citas' and column_name='creada_por')`)
    expect(r.rows.every((c) => c.is_nullable === 'YES')).toBe(true)
  })
})

describe('el correo: la lápida lo libera, las cuentas vivas no', () => {
  it('una cuenta VIVA no puede quedarse sin correo', async () => {
    const e = await falla(`insert into public.usuarios (uid, email) values ('u-malo', null)`)
    expect(e).toMatch(/usuarios_email_solo_falta_si_eliminada/)
  })

  it('una cuenta ELIMINADA sí puede, y el estado nuevo es válido', async () => {
    await db.exec(`update public.usuarios set estado='eliminada', email=null, rol='cliente' where uid='u-cliente'`)
    const r = await db.query<{ email: string | null }>(`select email from public.usuarios where uid='u-cliente'`)
    expect(r.rows[0].email).toBeNull()
  })

  it('CABEN VARIAS lápidas con el correo nulo (NULLS DISTINCT: el índice no se tocó)', async () => {
    await db.exec(`update public.usuarios set estado='eliminada', email=null where uid='u-publicador'`)
    const r = await db.query<{ n: number }>(`select count(*)::int n from public.usuarios where email is null`)
    expect(r.rows[0].n).toBe(2)
  })

  it('EL CRITERIO DE ACEPTACIÓN: el mismo correo vuelve a estar libre para una cuenta nueva', async () => {
    await db.exec(`insert into public.usuarios (uid, email, rol) values ('u2-nuevo', 'persona@correo.com', 'cliente')`)
    const r = await db.query<{ uid: string; rol: string }>(
      `select uid, rol from public.usuarios where lower(email)='persona@correo.com'`)
    expect(r.rows).toEqual([{ uid: 'u2-nuevo', rol: 'cliente' }])
    // U1 ≠ U2, y U1 sigue cerrada.
    const u1 = await db.query<{ estado: string }>(`select estado from public.usuarios where uid='u-cliente'`)
    expect(u1.rows[0].estado).toBe('eliminada')
  })

  it('dos cuentas VIVAS siguen sin poder compartir correo', async () => {
    const e = await falla(`insert into public.usuarios (uid, email) values ('u-otro', 'PERSONA@correo.com')`)
    expect(e).toMatch(/usuarios_email_idx|duplicate key/)
  })

  it('un estado inventado se rechaza', async () => {
    const e = await falla(`update public.usuarios set estado='borrada' where uid='u2-nuevo'`)
    expect(e).toMatch(/usuarios_estado_check/)
  })
})

describe('el procedimiento vive aparte y no se puede duplicar', () => {
  it('`bajas_de_cuenta` acepta una baja por cuenta y nada más', async () => {
    await db.exec(`insert into public.bajas_de_cuenta (uid, solicitada_por, auth_time)
                   values ('u-cliente', 'titular', now())`)
    const e = await falla(`insert into public.bajas_de_cuenta (uid, solicitada_por, auth_time)
                           values ('u-cliente', 'titular', now())`)
    expect(e).toMatch(/duplicate key|bajas_de_cuenta_pkey/)
  })

  it('nace en `solicitada` y sólo admite los seis estados', async () => {
    const r = await db.query<{ estado: string }>(`select estado from public.bajas_de_cuenta where uid='u-cliente'`)
    expect(r.rows[0].estado).toBe('solicitada')
    for (const e of ['bloqueada', 'firebase_eliminada', 'datos_procesados', 'completada', 'error']) {
      await db.exec(`update public.bajas_de_cuenta set estado='${e}' where uid='u-cliente'`)
    }
    expect(await falla(`update public.bajas_de_cuenta set estado='a_medias' where uid='u-cliente'`))
      .toMatch(/bajas_de_cuenta_estado_check/)
  })

  it('exige saber quién la pidió y cuándo se reautenticó', async () => {
    expect(await falla(`insert into public.bajas_de_cuenta (uid, solicitada_por, auth_time)
                        values ('u-publicador', 'un_tercero', now())`))
      .toMatch(/solicitada_por/)
    expect(await falla(`insert into public.bajas_de_cuenta (uid, solicitada_por) values ('u-publicador','titular')`))
      .toMatch(/auth_time/)
  })
})

describe('P-1 · la propiedad requiere gestión, no se despublica', () => {
  it('`gestion` acepta la marca y rechaza cualquier otra cosa', async () => {
    await db.exec(`update public.propiedades set gestion='requiere_gestion' where id='p-1'`)
    expect(await falla(`update public.propiedades set gestion='pausada' where id='p-1'`))
      .toMatch(/propiedades_gestion_check/)
  })

  it('el `estatus` comercial y el dueño NO cambian', async () => {
    const r = await db.query<{ estatus: string; owner_id: string; gestion: string }>(
      `select estatus, owner_id, gestion from public.propiedades where id='p-1'`)
    expect(r.rows[0]).toEqual({ estatus: 'disponible', owner_id: 'u-publicador', gestion: 'requiere_gestion' })
  })
})

describe('P-2 · la PII bloqueada no se puede leer por la vista', () => {
  beforeAll(async () => {
    await db.exec(`
      insert into public.solicitudes_contacto (id, cliente_uid, nombre, telefono, email, mensaje, origen)
      values ('s-libre','u2-nuevo','Ana','4770000000','ana@correo.com','Me interesa, llámenme al 477','ficha'),
             ('s-bloq','u-cliente','Ana','4770000000','ana@correo.com','Me interesa, llámenme al 477','ficha');
      update public.solicitudes_contacto set bloqueado_en = now() where id='s-bloq';`)
  })

  it('lo NO bloqueado se lee igual que siempre', async () => {
    const r = await db.query<Record<string, string>>(
      `select nombre, telefono, email, mensaje from public.solicitudes_contacto_operativas where id='s-libre'`)
    expect(r.rows[0]).toEqual({ nombre: 'Ana', telefono: '4770000000', email: 'ana@correo.com', mensaje: 'Me interesa, llámenme al 477' })
  })

  it('lo bloqueado sale VACÍO, incluido el texto libre', async () => {
    const r = await db.query<Record<string, string | null>>(
      `select nombre, telefono, email, mensaje from public.solicitudes_contacto_operativas where id='s-bloq'`)
    expect(r.rows[0]).toEqual({ nombre: null, telefono: null, email: null, mensaje: null })
  })

  it('lo que no es PII se conserva: se sabe QUE hubo consulta y sobre qué', async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int n from public.solicitudes_contacto_operativas
       where id='s-bloq' and origen='ficha' and consentimiento_version is not null and bloqueado_en is not null`)
    expect(r.rows[0].n).toBe(1)
  })
})

describe('las 23 referencias a una persona', () => {
  it('son 23, sin repetidos, y cada una con un trato válido', () => {
    expect(REFERENCIAS).toHaveLength(23)
    expect(new Set(REFERENCIAS.map((r) => `${r.tabla}.${r.columna}`)).size).toBe(23)
    expect(REFERENCIAS.every((r) => TRATOS.includes(r.trato))).toBe(true)
    // Los cuatro tratamientos se usan de verdad; nada se resuelve «por descarte».
    for (const t of ['suprimir', 'disociar', 'bloquear', 'conservar']) {
      expect(REFERENCIAS.some((r) => r.trato === t), t).toBe(true)
    }
  })

  it('todas existen en el esquema (si se renombra una columna, esto falla)', async () => {
    const r = await db.query<{ t: string; c: string }>(
      `select table_name t, column_name c from information_schema.columns where table_schema='public'`)
    const hay = new Set(r.rows.map((x) => `${x.t}.${x.c}`))
    const faltan = REFERENCIAS.filter((x) => !hay.has(`${x.tabla}.${x.columna}`))
    expect(faltan).toEqual([])
  })

  it('NINGUNA columna que apunte a una persona se queda sin tratamiento', async () => {
    const r = await db.query<{ t: string; c: string }>(`
      select c.table_name t, c.column_name c
      from information_schema.columns c
      join information_schema.tables x
        on x.table_schema=c.table_schema and x.table_name=c.table_name and x.table_type='BASE TABLE'
      where c.table_schema='public' and c.data_type in ('text','character varying','uuid')`)
    const candidatas = r.rows
      .filter((x) => PATRON_PERSONA.test(x.c))
      // `actor_rol` y la propia tabla del procedimiento no son referencias nuevas.
      .filter((x) => x.c !== 'actor_rol' && x.t !== 'bajas_de_cuenta')
      .map((x) => `${x.t}.${x.c}`)
    const declaradas = new Set(REFERENCIAS.map((x) => `${x.tabla}.${x.columna}`))
    const sinTratamiento = candidatas.filter((x) => !declaradas.has(x))
    expect(sinTratamiento).toEqual([])
  })
})

describe('el REVERTIR deshace el esquema', () => {
  it('vuelve a dejarlo como estaba (sobre una base sin lápidas)', async () => {
    const limpia = await PGlite.create()
    await limpia.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.usuarios (
        uid text primary key, email text not null,
        rol text not null default 'cliente',
        estado text not null default 'activo'
          constraint usuarios_estado_check check (estado in ('activo','suspendido','pendiente')));
      create unique index usuarios_email_idx on public.usuarios (lower(email));
      create table public.invitaciones (id serial primary key, email text not null,
        estado text not null default 'pendiente'
          constraint invitaciones_estado_check check (estado in ('pendiente','aceptada','cancelada')));
      create table public.propiedades (id text primary key, estatus text, owner_id text, revisado_por text);
      create table public.citas (id text primary key, cliente_uid text, asesor_uid text,
        inicio timestamptz, fin timestamptz, margen_min int, ocupa_desde timestamptz, ocupa_hasta timestamptz,
        zona_horaria text, estado text, estado_previo text, version int, propuesta_inicio timestamptz,
        propuesta_fin timestamptz, propuesta_por text, propiedad_id text,
        cliente_nombre text not null, cliente_telefono text not null, cliente_email text,
        consentimiento_version text, consentimiento_en timestamptz, propiedad_titulo text, lugar text,
        notas_cliente text, notas_internas text, motivo_cancelacion text, google_event_id text,
        google_sync text, google_error text, google_intentos int, clave_idempotencia text,
        creada_por text not null, creada_en timestamptz, actualizada_en timestamptz);
      create table public.solicitudes_contacto (id text primary key, cliente_uid text not null,
        propiedad_id text, owner_id text, nombre text not null, telefono text not null, email text not null,
        mensaje text, propiedad_titulo text, tipo text, visita_preferida text,
        consentimiento_en timestamptz, consentimiento_version text, whatsapp_estado text, whatsapp_id text,
        whatsapp_error text, origen text, creado_en timestamptz);`)

    await limpia.exec(leerSql('25-baja-de-cuenta.sql'))
    await limpia.exec(leerSql('25-baja-de-cuenta.REVERTIR.sql'))

    const r = await limpia.query<{ n: number }>(`
      select (select count(*) from information_schema.columns
              where table_name='propiedades' and column_name='gestion')
           + (select count(*) from information_schema.tables where table_name='bajas_de_cuenta')
           + (select count(*) from information_schema.views  where table_name='citas_operativas') as n`)
    expect(r.rows[0].n).toBe(0)

    const correo = await limpia.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns where table_name='usuarios' and column_name='email'`)
    expect(correo.rows[0].is_nullable).toBe('NO')
    await limpia.close()
  })
})
