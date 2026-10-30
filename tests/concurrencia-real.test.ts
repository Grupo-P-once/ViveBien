import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * R-13 (D-62 · QA-020): CONCURRENCIA REAL de las funciones atómicas, con Postgres 17 de verdad y VARIAS CONEXIONES simultáneas.
 * Las pruebas de PGlite (una sola conexión) demuestran la lógica en serie; esta demuestra que `FOR UPDATE`, la comparación del «antes» y el
 * candado del último super admin aguantan cuando dos administradores pulsan a la vez. No toca Supabase ni producción: levanta un contenedor
 * desechable (`postgres:17.6-alpine`, la misma versión mayor que Supabase) y lo destruye al terminar.
 *
 * Requisitos: `QA_CONCURRENCIA=1`, Docker en marcha y la imagen ya descargada. Si falta algo, las pruebas se REPORTAN como omitidas (no pasadas). Cada sesión espera
 * a un instante común (`pg_sleep` hasta T) para arrancar a la vez; cada escenario se repite varias rondas para dar al reloj ocasión de fallar.
 * El trigger del último super admin es el REAL (se extrae de supabase/21-…sql), no la versión mínima de las pruebas de PGlite.
 */
const IMAGEN = 'postgres:17.6-alpine'
const NOMBRE = 'vb-concurrencia-d62'
const RONDAS = 8
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')

function dockerListo(): boolean {
  const v = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' })
  if (v.status !== 0) return false
  const i = spawnSync('docker', ['image', 'inspect', IMAGEN], { encoding: 'utf8' })
  return i.status === 0
}
// Opt-in (tarda ~3 min y necesita Docker): `QA_CONCURRENCIA=1 npx vitest run tests/concurrencia-real.test.ts`. En la suite normal se REPORTA como omitida.
const LISTO = process.env.QA_CONCURRENCIA === '1' && dockerListo()
const d = LISTO ? describe : describe.skip

type Resultado = { codigo: number; salida: string; error: string }
function psql(entrada: string): Promise<Resultado> {
  return new Promise((resolve) => {
    const p = spawn('docker', ['exec', '-i', NOMBRE, 'psql', '-U', 'postgres', '-tA', '-v', 'ON_ERROR_STOP=1', '-f', '-'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let salida = ''; let error = ''
    p.stdout.on('data', (b) => { salida += b }); p.stderr.on('data', (b) => { error += b })
    p.on('close', (codigo) => resolve({ codigo: codigo ?? -1, salida: salida.trim(), error: error.trim() }))
    p.stdin.end(entrada)
  })
}
/** Varias sesiones que arrancan a la vez (misma marca de tiempo). */
async function enParalelo(sentencias: string[]): Promise<Resultado[]> {
  const T = new Date(Date.now() + 2500).toISOString()
  const espera = `select pg_sleep(greatest(0, extract(epoch from ('${T}'::timestamptz - clock_timestamp()))));\n`
  return Promise.all(sentencias.map((s) => psql(espera + s)))
}
const uno = async (consulta: string) => (await psql(consulta)).salida
const resultado = (r: Resultado) => (r.codigo !== 0 ? 'error:' + r.error : (JSON.parse(r.salida.split('\n').pop() as string) as { resultado: string }).resultado)

const AUD = (extra: Record<string, unknown> = {}) => JSON.stringify({ actor_uid: 'ADM', actor_email: 'adm@x.test', actor_rol: 'admin', accion: 'prueba.concurrencia', antes: {}, despues: {}, ...extra }).replace(/'/g, "''")

const BASE = `
  create role anon; create role authenticated; create role service_role;
  create table public.usuarios (
    uid text primary key, email text, rol text not null default 'cliente' check (rol in ('cliente','publicador','admin','super_admin')),
    estado text not null default 'activo' check (estado in ('activo','suspendido','pendiente','eliminada')),
    check (email is not null or estado = 'eliminada'));
  create table public.invitaciones (
    id bigint generated always as identity primary key, email text not null, nombre text,
    rol text not null check (rol in ('cliente','publicador','admin','super_admin')),
    estado text not null default 'pendiente' check (estado in ('pendiente','aceptada','cancelada')),
    invitado_por text not null, creado_en timestamptz not null default now(), enviado_en timestamptz, aceptada_en timestamptz, aceptada_por text);
  create unique index invitaciones_email_pendiente on public.invitaciones (lower(email)) where estado = 'pendiente';
  create table public.audit_logs (
    id bigint generated always as identity primary key, actor_uid text not null, actor_email text, actor_rol text,
    accion text not null, entidad text not null, entidad_id text, antes jsonb, despues jsonb, creado_en timestamptz not null default now());
  create table public.configuracion (
    clave text primary key, valor jsonb not null check (jsonb_typeof(valor) = 'object'),
    version integer not null default 1, actualizado_por text, actualizado_en timestamptz not null default now());
  create table public.propiedades (
    id text primary key, estado_pub text not null default 'publicada'
      check (estado_pub in ('borrador','en_revision','cambios_solicitados','rechazada','publicada')),
    estatus text default 'disponible', completitud smallint not null default 0,
    enviada_en timestamptz, publicada_en timestamptz, revisado_por text, revisado_en timestamptz, nota_moderacion text,
    owner_id text, folio text, slug text, vistas integer not null default 0);
`
function triggerReal(): string {
  const t = sql('21-roles-solo-en-la-base.sql')
  const a = t.indexOf('create or replace function public.proteger_ultimo_super_admin()')
  const z = t.indexOf('for each row execute function public.proteger_ultimo_super_admin();')
  if (a < 0 || z < 0) throw new Error('no encuentro el trigger real en la migración 21')
  return t.slice(a, z + 'for each row execute function public.proteger_ultimo_super_admin();'.length)
    .replace(/revoke execute on function[^;]*;/g, '') // los roles de Supabase no existen aquí
}

d('concurrencia real (Postgres 17, varias conexiones simultáneas)', () => {
  beforeAll(async () => {
    spawnSync('docker', ['rm', '-f', NOMBRE], { encoding: 'utf8' })
    const r = spawnSync('docker', ['run', '-d', '--rm', '--name', NOMBRE, '-e', 'POSTGRES_PASSWORD=x', IMAGEN], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error('no se pudo arrancar el contenedor: ' + r.stderr)
    for (let i = 0; i < 40; i++) {
      if (spawnSync('docker', ['exec', NOMBRE, 'pg_isready', '-U', 'postgres'], { encoding: 'utf8' }).status === 0) break
      await new Promise((res) => setTimeout(res, 500))
    }
    await new Promise((res) => setTimeout(res, 1500)) // pg_isready responde antes de aceptar el psql con -f
    for (const s of [BASE, triggerReal(), sql('31-superadmin-mutaciones-atomicas.sql'), sql('32-invitacion-aplicar-atomica.sql'), sql('33-propiedad-cambiar-estado.sql')]) {
      const x = await psql(s)
      if (x.codigo !== 0) throw new Error('migración fallida: ' + x.error)
    }
  }, 120_000)
  afterAll(() => { spawnSync('docker', ['rm', '-f', NOMBRE], { encoding: 'utf8' }) }, 60_000)

  it('el trigger usado es el REAL (candado con advisory lock), no una versión mínima', async () => {
    expect(await uno(`select prosrc like '%pg_advisory_xact_lock%' from pg_proc where proname='proteger_ultimo_super_admin';`)).toBe('t')
  })

  it('ROL/ESTADO: dos administradores cambian al MISMO usuario con el mismo «antes» → un solo ganador, un conflicto, una huella', async () => {
    const vistos = new Set<string>()
    for (let i = 0; i < RONDAS; i++) {
      await uno(`truncate public.audit_logs, public.usuarios; insert into public.usuarios (uid,email,rol) values ('U1','u1@x.test','cliente');`)
      const a = `select public.usuario_cambiar_rol_estado('U1','cliente','activo','publicador',null,'${AUD({ accion: 'usuario.editar' })}'::jsonb);`
      const b = `select public.usuario_cambiar_rol_estado('U1','cliente','activo','admin',null,'${AUD({ accion: 'usuario.editar', despues: { motivo: 'Prueba de concurrencia real D-62' } })}'::jsonb);`
      const [ra, rb] = (await enParalelo([a, b])).map(resultado)
      expect([ra, rb].sort(), `ronda ${i}`).toEqual(['conflicto', 'ok'])
      vistos.add(ra === 'ok' ? 'A' : 'B')
      expect(await uno(`select count(*) from public.audit_logs;`), `ronda ${i}: una huella`).toBe('1')
      const rol = await uno(`select rol from public.usuarios where uid='U1';`)
      expect(rol).toBe(ra === 'ok' ? 'publicador' : 'admin')
    }
    expect(vistos.size).toBeGreaterThanOrEqual(1) // (ganan uno u otro según el reloj; lo que importa es que NUNCA ganen los dos)
  }, 240_000)

  it('ÚLTIMO SUPER ADMIN: dos degradaciones simultáneas de super admins distintos → NUNCA se queda en 0', async () => {
    let bloqueos = 0
    for (let i = 0; i < RONDAS; i++) {
      await uno(`truncate public.audit_logs, public.usuarios; insert into public.usuarios (uid,email,rol) values ('SA1','a@x.test','super_admin'),('SA2','b@x.test','super_admin');`)
      const bajar = (uid: string) => `select public.usuario_cambiar_rol_estado('${uid}','super_admin','activo','admin',null,'${AUD({ accion: 'usuario.editar', despues: { motivo: 'Prueba de concurrencia real D-62' } })}'::jsonb);`
      const rs = await enParalelo([bajar('SA1'), bajar('SA2')])
      const ok = rs.filter((r) => r.codigo === 0 && resultado(r) === 'ok').length
      const rechazados = rs.filter((r) => r.codigo !== 0 && /ultimo_super_admin/.test(r.error)).length
      const detalle = JSON.stringify(rs.map((r) => ({ c: r.codigo, s: r.salida.slice(0, 80), e: r.error.slice(0, 160) })))
      expect(ok, `ronda ${i}: solo una degradación puede salir bien — ${detalle}`).toBe(1)
      expect(rechazados, `ronda ${i}: la otra la frena el candado — ${detalle}`).toBe(1)
      expect(await uno(`select count(*) from public.usuarios where rol='super_admin' and estado='activo';`), `ronda ${i}: queda un super admin`).toBe('1')
      expect(await uno(`select count(*) from public.audit_logs;`), `ronda ${i}: solo la huella del que sí cambió`).toBe('1')
      bloqueos += rechazados
    }
    expect(bloqueos).toBe(RONDAS)
  }, 240_000)

  it('FLAGS: el mismo flag a la vez → un ganador; flags distintos a la vez → ninguno se pierde', async () => {
    for (let i = 0; i < RONDAS; i++) {
      await uno(`truncate public.audit_logs, public.configuracion; insert into public.configuracion (clave, valor) values ('flags','{"citasEnLinea": false, "marketingHub": false, "portalCliente": true}');`)
      const flag = (f: string) => `select public.configuracion_cambiar_flag('${f}', false, true, '${AUD({ accion: 'configuracion.flag', antes: { valor: false }, despues: { valor: true, motivo: 'Prueba de concurrencia real D-62' } })}'::jsonb);`
      const [x, y] = (await enParalelo([flag('citasEnLinea'), flag('citasEnLinea')])).map(resultado)
      expect([x, y].sort(), `ronda ${i} (mismo flag)`).toEqual(['conflicto', 'ok'])
      expect(await uno(`select version from public.configuracion where clave='flags';`)).toBe('2')
      expect(await uno(`select count(*) from public.audit_logs;`)).toBe('1')
    }
    for (let i = 0; i < RONDAS; i++) {
      await uno(`truncate public.audit_logs, public.configuracion; insert into public.configuracion (clave, valor) values ('flags','{"citasEnLinea": false, "marketingHub": false, "portalCliente": true}');`)
      const flag = (f: string) => `select public.configuracion_cambiar_flag('${f}', false, true, '${AUD({ accion: 'configuracion.flag', antes: { valor: false }, despues: { valor: true, motivo: 'Prueba de concurrencia real D-62' } })}'::jsonb);`
      const rs = (await enParalelo([flag('citasEnLinea'), flag('marketingHub')])).map(resultado)
      expect(rs, `ronda ${i} (flags distintos)`).toEqual(['ok', 'ok'])
      expect(await uno(`select (valor->>'citasEnLinea')||(valor->>'marketingHub') from public.configuracion where clave='flags';`), 'sin actualización perdida').toBe('truetrue')
      expect(await uno(`select version from public.configuracion where clave='flags';`)).toBe('3')
      expect(await uno(`select count(*) from public.audit_logs;`)).toBe('2')
    }
  }, 300_000)

  it('INVITACIÓN: dos sesiones aplican la MISMA invitación a la vez → se aplica UNA vez y la otra se omite', async () => {
    for (let i = 0; i < RONDAS; i++) {
      await uno(`truncate public.audit_logs, public.invitaciones, public.usuarios; insert into public.usuarios (uid,email,rol) values ('U-X','x@x.test','cliente'); insert into public.invitaciones (email, rol, invitado_por) values ('x@x.test','admin','SUP');`)
      const ap = `select public.invitacion_aplicar('U-X','x@x.test',true);`
      const crudos = await enParalelo([ap, ap])
      const rs = crudos.map(resultado)
      expect([...rs].sort(), `ronda ${i} — ${JSON.stringify(crudos.map((r) => r.salida || r.error))}`).toEqual(['aplicada', 'omitida'])
      expect(await uno(`select rol from public.usuarios where uid='U-X';`)).toBe('admin')
      expect(await uno(`select count(*) from public.invitaciones where estado='aceptada';`)).toBe('1')
      expect(await uno(`select count(*) from public.invitaciones where estado='pendiente';`)).toBe('0')
    }
  }, 240_000)

  it('ESTADO DE PROPIEDAD: aprobar y rechazar a la vez desde «en_revisión» → un ganador, un conflicto, una huella', async () => {
    for (let i = 0; i < RONDAS; i++) {
      await uno(`truncate public.audit_logs, public.propiedades; insert into public.propiedades (id, estado_pub, owner_id, folio) values ('p1','en_revision','A','VB-2026-00001');`)
      const mover = (a: string, cambios: object, accion: string) =>
        `select public.propiedad_cambiar_estado('p1','en_revision','${a}','${JSON.stringify(cambios)}'::jsonb,'${AUD({ accion, antes: { estado_pub: 'en_revision' }, despues: { estado_pub: a } })}'::jsonb);`
      const rs = (await enParalelo([
        mover('publicada', { publicada_en: '2026-10-07T00:00:00Z' }, 'propiedad.publicada'),
        mover('rechazada', { nota_moderacion: 'Fotos borrosas: repetir la sesión.' }, 'propiedad.rechazada'),
      ])).map(resultado)
      expect([...rs].sort(), `ronda ${i}`).toEqual(['conflicto', 'ok'])
      expect(await uno(`select count(*) from public.audit_logs;`)).toBe('1')
      const estado = await uno(`select estado_pub from public.propiedades where id='p1';`)
      expect(estado).toBe(rs[0] === 'ok' ? 'publicada' : 'rechazada')
    }
  }, 240_000)
})
