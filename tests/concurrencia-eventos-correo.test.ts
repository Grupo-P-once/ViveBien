import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * MKT-49 con CONCURRENCIA REAL: «el emisor anota el resend_id» y «llega el evento del proveedor» a la vez, desde dos conexiones, contra Postgres 17 de verdad.
 * Por mucho que se crucen, el evento no se pierde (acaba aplicado, nunca «visto» sin efecto) y no se aplica dos veces. Contenedor desechable, sin red hacia fuera.
 * Requisitos: `QA_CONCURRENCIA=1`, Docker en marcha y la imagen `postgres:17.6-alpine` ya descargada. Si falta algo, se REPORTA como omitida (no pasada).
 */
const IMAGEN = 'postgres:17.6-alpine'
const NOMBRE = 'vb-concurrencia-eventos'
const RONDAS = 12
const sql = (n: string) => readFileSync(path.join(__dirname, '..', 'supabase', n), 'utf8')
const dockerListo = () => spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' }).status === 0 && spawnSync('docker', ['image', 'inspect', IMAGEN], { encoding: 'utf8' }).status === 0
const LISTO = process.env.QA_CONCURRENCIA === '1' && dockerListo()
const d = LISTO ? describe : describe.skip

type R = { codigo: number; salida: string; error: string }
function psql(entrada: string): Promise<R> {
  return new Promise((resolve) => {
    const p = spawn('docker', ['exec', '-i', NOMBRE, 'psql', '-U', 'postgres', '-tA', '-v', 'ON_ERROR_STOP=1', '-f', '-'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let salida = ''; let error = ''
    p.stdout.on('data', (b) => { salida += b }); p.stderr.on('data', (b) => { error += b })
    p.on('close', (codigo) => resolve({ codigo: codigo ?? -1, salida: salida.trim(), error: error.trim() }))
    p.stdin.end(entrada)
  })
}
const una = async (consulta: string) => { const r = await psql(consulta); if (r.codigo !== 0) throw new Error(r.error); return r.salida }

d('MKT-49 · evento y resend_id a la vez, en Postgres real', () => {
  beforeAll(async () => {
    spawnSync('docker', ['rm', '-f', NOMBRE])
    const r = spawnSync('docker', ['run', '-d', '--name', NOMBRE, '--network', 'none', '-e', 'POSTGRES_PASSWORD=x', IMAGEN], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(r.stderr)
    for (let i = 0; i < 60; i++) { if (spawnSync('docker', ['exec', NOMBRE, 'pg_isready', '-U', 'postgres']).status === 0 && (await psql('select 1')).codigo === 0) break; await new Promise((s) => setTimeout(s, 1000)) }
    await new Promise((s) => setTimeout(s, 1500))
    await una('create role anon; create role authenticated; create role service_role;')
    for (const f of ['62-correo-suscripciones.sql', '63-correo-baja-promocional.sql', '67-correo-eventos-pendientes.sql']) await una(sql(f))
  }, 120_000)
  afterAll(() => { spawnSync('docker', ['rm', '-f', NOMBRE]) })

  it(`${RONDAS} rondas: marcar el ID y recibir el evento a la VEZ (en los dos órdenes) siempre termina «entregado», sin pendientes y con un solo efecto`, async () => {
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const clave = `ronda-${ronda}`; const resend = `re_ronda_${ronda}`; const svix = `svix_ronda_${ronda}`
      const id = Number(await una(`insert into public.correo_envios (clave, categoria, tipo, email_hash, estado, entorno) values ('${clave}', 'servicio', 'alertas', 'h', 'pendiente', 'pruebas') returning id;`).then((s) => s.split('\n')[0]))
      // Los dos arrancan en el mismo instante (pg_sleep hasta T); en rondas pares el evento sale ligeramente antes, en las impares el ID.
      const t = `now() + interval '1.5 seconds'`
      const espera = (extra: number) => `select pg_sleep(extract(epoch from (${t} - now())) + ${extra});`
      const marcar = psql(`${espera(ronda % 2 === 0 ? 0.003 : 0)} select public.correo_marcar_envio(${id}, 'enviado', '${resend}', null);`)
      const evento = psql(`${espera(ronda % 2 === 0 ? 0 : 0.003)} select public.correo_evento('${svix}', 'email.delivered', 'persona@ejemplo.invalid', '${resend}', false);`)
      const [a, b] = await Promise.all([marcar, evento])
      expect(a.error + b.error, `ronda ${ronda}`).toBe('')
      const estado = await una(`select estado from public.correo_envios where clave = '${clave}';`)
      expect(estado, `ronda ${ronda}: el evento no debe perderse`).toBe('entregado')
      expect(Number(await una(`select count(*) from public.correo_eventos_pendientes where resend_id = '${resend}';`)), `ronda ${ronda}: nada se queda en cuarentena`).toBe(0)
      expect(Number(await una(`select count(*) from public.correo_webhook_vistos where svix_id = '${svix}';`)), `ronda ${ronda}`).toBe(1)
    }
  }, 180_000)

  it('el MISMO svix-id entregado a la vez desde dos conexiones se aplica una sola vez', async () => {
    const id = Number((await una(`insert into public.correo_envios (clave, categoria, tipo, email_hash, estado, resend_id, entorno) values ('dup-1', 'servicio', 'alertas', 'h', 'enviado', 're_dup', 'pruebas') returning id;`)).split('\n')[0])
    expect(id).toBeGreaterThan(0)
    const espera = `select pg_sleep(extract(epoch from (now() + interval '1.5 seconds' - now())));`
    const llamada = `${espera} select public.correo_evento('svix_dup_1', 'email.delivered', 'persona@ejemplo.invalid', 're_dup', false);`
    const [a, b] = await Promise.all([psql(llamada), psql(llamada)])
    expect(a.codigo + b.codigo).toBe(0)
    const resultados = [a.salida, b.salida].map((s) => (JSON.parse(s.split('\n').pop() as string) as { resultado: string }).resultado).sort()
    expect(resultados).toEqual(['aplicado', 'duplicado'])
  }, 60_000)
})
