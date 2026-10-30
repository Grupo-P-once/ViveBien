import { beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * E-35-01 (QA-021): el SQL de corrección y su rollback, probados contra Postgres real (PGlite) con un esquema idéntico en lo que importa
 * (`eventos.id` GENERATED ALWAYS, `vistas`, `audit_logs`). NO toca producción: demuestra que la limpieza borra EXACTAMENTE las 25 filas, que
 * aborta si el estado no es el esperado y que el rollback las devuelve idénticas. Ejecutar la corrección en producción sigue exigiendo
 * autorización explícita del usuario.
 */
const docs = (n: string) => readFileSync(path.join(__dirname, '..', 'docs', 'QA', n), 'utf8')
const PROP = '5243dab0-e301-4ce1-a5de-f5f57037e613'

const ESQUEMA = `
  create table public.propiedades (id text primary key, vistas int not null default 0);
  create table public.eventos (
    id bigint generated always as identity primary key, nombre text not null, uid text, sesion text,
    propiedad_id text, datos jsonb, creado_en timestamptz not null default now());
  create table public.audit_logs (
    id bigint generated always as identity primary key, actor_uid text not null, actor_email text, actor_rol text,
    accion text not null, entidad text not null, entidad_id text, antes jsonb, despues jsonb, creado_en timestamptz not null default now());
`

/** Estado real de producción el 7-oct-2026: 2 vistas previas (ids 179, 180) + las 25 de la prueba (ids 188-212) = 27. */
async function sembrar(db: PGlite, opciones: { extra?: string } = {}) {
  await db.exec(ESQUEMA)
  await db.exec(`insert into public.propiedades (id, vistas) values ('${PROP}', 27), ('otra', 5)`)
  const filas = docs('QA-021-filas.csv').trim().split('\n').slice(1).map((l) => l.split(','))
  await db.exec(`insert into public.eventos (id, nombre, uid, sesion, propiedad_id, datos, creado_en) overriding system value values
    (179, 'property_view', null, 's-previo-a', '${PROP}', null, '2026-10-05 20:15:51.332122+00'),
    (180, 'property_view', null, 's-previo-b', '${PROP}', null, '2026-10-06 15:25:00.849044+00'),
    ${filas.map((f) => `(${f[0]}, 'property_view', null, '${f[1]}', '${PROP}', null, '${f[2]}')`).join(',\n    ')};
    ${opciones.extra ?? ''}`)
}

const contar = async (db: PGlite, where = `propiedad_id = '${PROP}'`) =>
  Number(((await db.query<{ n: string }>(`select count(*)::text n from public.eventos where ${where}`)).rows[0]).n)
const vistas = async (db: PGlite) => Number(((await db.query<{ v: number }>(`select vistas v from public.propiedades where id = '${PROP}'`)).rows[0]).v)

describe('QA-021 · corrección exacta y rollback (PGlite, sin tocar producción)', () => {
  let db: PGlite
  beforeEach(async () => { db = new PGlite() })

  it('la evidencia son exactamente 25 filas consecutivas 188-212', () => {
    const ids = docs('QA-021-filas.csv').trim().split('\n').slice(1).map((l) => Number(l.split(',')[0]))
    expect(ids).toEqual(Array.from({ length: 25 }, (_, i) => 188 + i))
  })

  it('la corrección borra solo esas 25, deja las 2 previas, ajusta vistas 27→2 y deja huella', async () => {
    await sembrar(db)
    await db.exec(docs('QA-021-correccion.sql'))
    expect(await contar(db)).toBe(2)
    expect((await db.query<{ id: string }>(`select id::text id from public.eventos order by id`)).rows.map((r) => r.id)).toEqual(['179', '180'])
    expect(await vistas(db)).toBe(2)
    const a = (await db.query<{ accion: string; despues: { vistas: number } }>(`select accion, despues from public.audit_logs`)).rows
    expect(a).toHaveLength(1)
    expect(a[0].accion).toBe('qa.telemetria_corregida')
    expect(a[0].despues.vistas).toBe(2)
    // otra propiedad: intacta
    expect(Number(((await db.query<{ v: number }>(`select vistas v from public.propiedades where id = 'otra'`)).rows[0]).v)).toBe(5)
  })

  it('aborta SIN cambios si alguien añadió/quitó una fila del rango (no son exactamente 25)', async () => {
    await sembrar(db)
    await db.exec(`delete from public.eventos where id = 200`)
    await expect(db.exec(docs('QA-021-correccion.sql'))).rejects.toThrow(/se esperaban 25 filas/)
    await db.exec('rollback').catch(() => {})
    expect(await contar(db)).toBe(26)
    expect(await vistas(db)).toBe(27)
  })

  it('aborta SIN cambios si el contador ya no vale 27 (alguien más lo movió)', async () => {
    await sembrar(db)
    await db.exec(`update public.propiedades set vistas = 28 where id = '${PROP}'`)
    await expect(db.exec(docs('QA-021-correccion.sql'))).rejects.toThrow(/vistas = 28/)
    await db.exec('rollback').catch(() => {})
    expect(await contar(db)).toBe(27)
  })

  it('no toca filas del mismo rango que no sean property_view de esa propiedad (otra propiedad con id 190 no existe: se usa sesión distinta)', async () => {
    await sembrar(db)
    // una fila de otra propiedad con id fuera del rango y una property_view de la propiedad ya posterior a la ventana
    await db.exec(`insert into public.eventos (nombre, sesion, propiedad_id, creado_en) values ('property_view', 's-nuevo', '${PROP}', '2026-10-08 10:00:00+00'), ('property_view', 's-otra', 'otra', '2026-10-07 05:00:00+00')`)
    await db.exec(`update public.propiedades set vistas = 28 where id = '${PROP}'`) // simula la visita nueva
    await expect(db.exec(docs('QA-021-correccion.sql'))).rejects.toThrow(/vistas = 28/) // el guard del contador protege la visita legítima
  })

  it('el rollback devuelve las 25 filas idénticas (mismos ids y fechas) y vistas a 27', async () => {
    await sembrar(db)
    const antes = (await db.query(`select id::text id, nombre, uid, sesion, propiedad_id, datos, creado_en::text c from public.eventos order by id`)).rows
    await db.exec(docs('QA-021-correccion.sql'))
    await db.exec(docs('QA-021-rollback.sql'))
    const despues = (await db.query(`select id::text id, nombre, uid, sesion, propiedad_id, datos, creado_en::text c from public.eventos order by id`)).rows
    expect(despues).toEqual(antes)
    expect(await vistas(db)).toBe(27)
    expect((await db.query<{ accion: string }>(`select accion from public.audit_logs order by id`)).rows.map((r) => r.accion)).toEqual(['qa.telemetria_corregida', 'qa.telemetria_restaurada'])
  })

  it('el rollback aborta si la corrección no se aplicó (las filas ya existen)', async () => {
    await sembrar(db)
    await expect(db.exec(docs('QA-021-rollback.sql'))).rejects.toThrow(/ya hay 25 filas/)
  })
})

/**
 * Ejecución REAL del 2026-10-08 (autorizada): se borraron SOLO las 25 filas de `eventos`; `propiedades.vistas` NO se tocó (sigue en 27).
 * Se prueba el script exacto que corrió en producción (con sus totales 122/74 → 97/49) y el rollback de solo-eventos que lo deshace.
 */
describe('QA-021 · borrado ejecutado (solo eventos) y su rollback (PGlite)', () => {
  let db: PGlite
  // La base de producción está en UTC (la huella del script se calculó así); PGlite toma la zona de la máquina: se fija para que `creado_en::text` sea idéntico.
  beforeEach(async () => { db = new PGlite(); await db.exec("set time zone 'UTC'") })

  /** Réplica de las cifras de producción justo antes del borrado: 122 eventos, 74 property_view (27 de VB-2026-00026). */
  async function sembrarProduccion() {
    await db.exec(ESQUEMA)
    await db.exec(`insert into public.propiedades (id, vistas) values ('${PROP}', 27), ('otra', 5)`)
    await db.exec(`insert into public.eventos (nombre, sesion, propiedad_id) select 'property_view', 's-o' || g, 'otra' from generate_series(1, 47) g;
                   insert into public.eventos (nombre, sesion) select 'search', 's-b' || g from generate_series(1, 48) g;`)
    const filas = docs('QA-021-filas.csv').trim().split('\n').slice(1).map((l) => l.split(','))
    await db.exec(`insert into public.eventos (id, nombre, uid, sesion, propiedad_id, datos, creado_en) overriding system value values
      (179, 'property_view', null, 's-previo-a', '${PROP}', null, '2026-10-05 20:15:51.332122+00'),
      (180, 'property_view', null, 's-previo-b', '${PROP}', null, '2026-10-06 15:25:00.849044+00'),
      ${filas.map((f) => `(${f[0]}, 'property_view', null, '${f[1]}', '${PROP}', null, '${f[2]}')`).join(',\n      ')}`)
  }
  const total = async (w = 'true') => Number(((await db.query<{ n: string }>(`select count(*)::text n from public.eventos where ${w}`)).rows[0]).n)
  const foto = async () => (await db.query(`select id::text id, nombre, uid, sesion, propiedad_id, datos, creado_en::text c from public.eventos order by id`)).rows

  it('el script ejecutado borra exactamente 25 (122→97, property_view 74→49, VB-26 27→2), conserva 179 y 180 y NO toca vistas ni audit_logs', async () => {
    await sembrarProduccion()
    expect([await total(), await total(`nombre = 'property_view'`)]).toEqual([122, 74])
    await db.exec(docs('QA-021-borrado-ejecutado.sql'))
    expect([await total(), await total(`nombre = 'property_view'`)]).toEqual([97, 49])
    expect((await db.query<{ id: string }>(`select id::text id from public.eventos where propiedad_id = '${PROP}' order by id`)).rows.map((r) => r.id)).toEqual(['179', '180'])
    expect(await total('id between 188 and 212')).toBe(0)
    expect(await vistas(db)).toBe(27) // el contador NO se modifica en esta operación
    expect(Number(((await db.query<{ n: string }>(`select count(*)::text n from public.audit_logs`)).rows[0]).n)).toBe(0)
  })

  it('aborta SIN borrar nada si una fila no coincide (huella distinta) o si los totales no son los esperados', async () => {
    await sembrarProduccion()
    await db.exec(`update public.eventos set sesion = 'manipulada' where id = 200`)
    await expect(db.exec(docs('QA-021-borrado-ejecutado.sql'))).rejects.toThrow(/precheck NO coincide/)
    expect(await total('id between 188 and 212')).toBe(25)
    await db.exec(`update public.eventos set sesion = 's-muxrjlo2-ugitzjh9' where id = 200`)
    await db.exec(`insert into public.eventos (nombre, sesion) values ('search', 'extra')`) // 123 eventos: el mundo no es el que se autorizó
    await expect(db.exec(docs('QA-021-borrado-ejecutado.sql'))).rejects.toThrow(/totales inesperados/)
    expect(await total('id between 188 and 212')).toBe(25)
  })

  it('NO borra una fila con uid o datos aunque esté en el rango de ids (la condición completa decide, no los ids)', async () => {
    await sembrarProduccion()
    await db.exec(`update public.eventos set uid = 'persona-real' where id = 190`)
    await expect(db.exec(docs('QA-021-borrado-ejecutado.sql'))).rejects.toThrow(/precheck NO coincide/)
    expect(await total('id between 188 and 212')).toBe(25)
  })

  it('el rollback de solo-eventos deja las 25 filas IDÉNTICAS (ids, sesiones, fechas) a las de antes del borrado', async () => {
    await sembrarProduccion()
    const antes = await foto()
    await db.exec(docs('QA-021-borrado-ejecutado.sql'))
    await db.exec(docs('QA-021-rollback-solo-eventos.sql'))
    expect(await foto()).toEqual(antes)
    expect(await vistas(db)).toBe(27)
  })

  it('el rollback de solo-eventos aborta si las filas ya existen (no duplica)', async () => {
    await sembrarProduccion()
    await expect(db.exec(docs('QA-021-rollback-solo-eventos.sql'))).rejects.toThrow(/ya hay 25 filas/)
  })

  it('el rollback ORIGINAL (que también restaura vistas 2→27) aborta a salvo tras el borrado ejecutado, porque vistas sigue en 27', async () => {
    await sembrarProduccion()
    await db.exec(docs('QA-021-borrado-ejecutado.sql'))
    await expect(db.exec(docs('QA-021-rollback.sql'))).rejects.toThrow(/vistas = 27/)
    await db.exec('rollback').catch(() => {})
    expect(await total('id between 188 and 212')).toBe(0) // no reinsertó nada a medias
  })
})

/**
 * E-35.2 (2026-10-08, autorizado): `propiedades.vistas` de VB-2026-00026 27 → 2, y NADA más (ni `eventos`, ni `audit_logs`, ni otras propiedades).
 * Se prueba el script exacto que corrió en producción contra el estado posterior al borrado de QA-021 (97 eventos, 382 filas de auditoría).
 */
describe('E-35.2 · contador QA-021 27 → 2 (PGlite)', () => {
  let db: PGlite
  beforeEach(async () => { db = new PGlite(); await db.exec("set time zone 'UTC'") })

  /** Estado de producción justo antes: 9 propiedades, 97 eventos (VB-26: solo 179 y 180), 382 auditorías, contador en 27. */
  async function sembrar() {
    await db.exec(ESQUEMA)
    // 8 propiedades más: la huella de sus `vistas` ('648001c2…') es la de producción, así que se reproducen los mismos id:vistas con un esquema equivalente
    await db.exec(`insert into public.propiedades (id, vistas) values ('${PROP}', 27)`)
    await db.exec(`insert into public.eventos (nombre, sesion, propiedad_id) select 'search', 's' || g, null from generate_series(1, 95) g;
                   insert into public.eventos (id, nombre, sesion, propiedad_id, creado_en) overriding system value values
                     (179, 'property_view', 's-previo-a', '${PROP}', '2026-10-05 20:15:51.332122+00'),
                     (180, 'property_view', 's-previo-b', '${PROP}', '2026-10-06 15:25:00.849044+00');
                   insert into public.audit_logs (actor_uid, accion, entidad) select 'u', 'a', 'e' from generate_series(1, 382);`)
  }
  /** El script de producción compara la huella de las OTRAS propiedades con la real; aquí se sustituye por la de este esquema de prueba. */
  async function script() {
    const otras = (await db.query<{ h: string }>(`select md5(string_agg(id || ':' || coalesce(vistas::text, 'null'), ',' order by id)) h from public.propiedades where id <> '${PROP}'`)).rows[0].h
    return docs('QA-021-contador-ejecutado.sql').replaceAll('648001c253f9dec5d770d69aad3f72ba', otras ?? 'x')
  }
  const vistasDe = async (id: string) => Number(((await db.query<{ v: number }>(`select vistas v from public.propiedades where id = '${id}'`)).rows[0]).v)
  const n = async (t: string) => Number(((await db.query<{ n: string }>(`select count(*)::text n from public.${t}`)).rows[0]).n)

  async function conOtras() {
    await sembrar()
    await db.exec(`insert into public.propiedades (id, vistas) select 'otra' || g, g * 3 from generate_series(1, 8) g`)
  }

  it('1 · 27 → 2 en esa propiedad y exactamente 1 fila cambia', async () => {
    await conOtras()
    const antes = (await db.query(`select id, vistas from public.propiedades order by id`)).rows
    await db.exec(await script())
    const despues = (await db.query(`select id, vistas from public.propiedades order by id`)).rows
    const cambios = despues.filter((d, i) => JSON.stringify(d) !== JSON.stringify(antes[i]))
    expect(cambios).toEqual([{ id: PROP, vistas: 2 }])
  })
  it('2 · no actualiza (aborta) si vistas ≠ 27', async () => {
    await conOtras()
    await db.exec(`update public.propiedades set vistas = 28 where id = '${PROP}'`)
    await expect(db.exec(await script())).rejects.toThrow(/precheck NO coincide/)
    expect(await vistasDe(PROP)).toBe(28)
  })
  it('3 · no toca otras propiedades', async () => {
    await conOtras()
    const otras = (await db.query(`select id, vistas from public.propiedades where id <> '${PROP}' order by id`)).rows
    await db.exec(await script())
    expect((await db.query(`select id, vistas from public.propiedades where id <> '${PROP}' order by id`)).rows).toEqual(otras)
  })
  it('4 y 5 · no modifica eventos ni audit_logs', async () => {
    await conOtras()
    const ev = (await db.query(`select id::text id, nombre, sesion, creado_en::text c from public.eventos order by id`)).rows
    await db.exec(await script())
    expect((await db.query(`select id::text id, nombre, sesion, creado_en::text c from public.eventos order by id`)).rows).toEqual(ev)
    expect(await n('audit_logs')).toBe(382)
    expect(await n('eventos')).toBe(97)
  })
  it('aborta si los eventos de la propiedad no son exactamente 179 y 180', async () => {
    await conOtras()
    await db.exec(`insert into public.eventos (nombre, sesion, propiedad_id) values ('property_view', 'visita-nueva', '${PROP}')`)
    await expect(db.exec(await script())).rejects.toThrow(/precheck NO coincide/)
    expect(await vistasDe(PROP)).toBe(27)
  })
  it('6 · el rollback preparado devuelve 2 → 27, solo con vistas = 2 y solo en esa propiedad; sin 2 no hace nada', async () => {
    await conOtras()
    await db.exec(await script())
    await db.exec(docs('QA-021-contador-rollback.sql'))
    expect(await vistasDe(PROP)).toBe(27)
    expect(await vistasDe('otra1')).toBe(3)
    // si el contador ya se movió (p. ej. una visita real lo subió a 3), el rollback NO lo pisa
    await db.exec(`update public.propiedades set vistas = 3 where id = '${PROP}'`)
    await db.exec(docs('QA-021-contador-rollback.sql'))
    expect(await vistasDe(PROP)).toBe(3)
  })
})
