import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { resolverPerfil, revisarEstado } from '../src/lib/auth-server'

/**
 * V-1.1.87 · D-43 — LA FRONTERA QUE MÁS DUELE: Supabase confirma y Firebase falla.
 *
 * Esto se prueba **antes** de escribir el endpoint, porque es la frontera que
 * decide si el diseño aguanta. Lo que hay aquí es el contrato que el endpoint
 * tendrá que cumplir, escrito como pasos sueltos contra la base real (PGlite
 * con el esquema de producción y la función de la migración 26 ya aplicada).
 *
 * La regla que gobierna todo:
 *
 *   El COMMIT del cierre local es el punto de no retorno. A partir de ahí, que
 *   Firebase responda o no NO cambia si la cuenta está cerrada. Sólo cambia
 *   cuánto trabajo queda pendiente.
 *
 * Nada aquí borra ninguna cuenta real, y no se llama a Firebase: se inyecta un
 * doble que puede fallar a voluntad.
 */

let db: PGlite
const raiz = path.join(__dirname, '..')
const leer = (p: string) => readFileSync(path.join(raiz, p), 'utf8')
const uno = async <T>(sql: string): Promise<T> => ((await db.query<T>(sql)).rows[0])

/** El doble de Firebase. `fallo` decide qué pasa en `deleteUser`. */
type Firebase = {
  revokeRefreshTokens: (uid: string) => Promise<void>
  deleteUser: (uid: string) => Promise<void>
}
const firebaseQue = (fallo: null | 'red' | 'user-not-found'): Firebase & { llamadas: string[] } => {
  const llamadas: string[] = []
  return {
    llamadas,
    revokeRefreshTokens: async (uid) => { llamadas.push(`revoke:${uid}`) },
    deleteUser: async (uid) => {
      llamadas.push(`delete:${uid}`)
      if (fallo === 'red') throw Object.assign(new Error('network'), { code: 'ECONNRESET' })
      if (fallo === 'user-not-found') throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' })
    },
  }
}

/** Un código corto y sin datos dentro, como el que guardará el endpoint. */
const codigoDe = (e: unknown): string => {
  const c = (e as { code?: unknown })?.code
  return typeof c === 'string' && /^[\w.\-/]{1,60}$/.test(c) ? c : 'desconocido'
}

/**
 * EL PASO DE FIREBASE, tal y como lo hará el endpoint.
 *
 * Devuelve el estado en el que queda el proceso. No lanza: un fallo de Firebase
 * NO es un fallo de la baja, porque la baja ya está hecha.
 */
async function pasoFirebase(uid: string, fb: Firebase): Promise<'firebase_eliminada' | 'error'> {
  try {
    // Revocar ANTES de borrar: si el borrado falla, las sesiones abiertas ya no
    // pueden renovar su token. Cuesta una llamada y cierra la ventana.
    await fb.revokeRefreshTokens(uid)
    await fb.deleteUser(uid)
  } catch (e) {
    // `user-not-found` es ÉXITO: significa que el paso ya ocurrió.
    if (codigoDe(e) !== 'auth/user-not-found') {
      await db.exec(`
        update public.bajas_de_cuenta
           set estado = 'error',
               intentos = intentos + 1,
               ultimo_intento_en = now(),
               ultimo_error = '${codigoDe(e)}'
         where uid = '${uid}' and estado in ('bloqueada','error')`)
      return 'error'
    }
  }
  await db.exec(`
    update public.bajas_de_cuenta
       set estado = 'firebase_eliminada', firebase_eliminada_en = now(), ultimo_error = null
     where uid = '${uid}' and estado in ('bloqueada','error')`)
  return 'firebase_eliminada'
}

/** Lo que el navegador recibe. El correo SÓLO se promete con `completada`. */
const respuesta = (estado: string) => ({
  estado,
  puedeRegistrarseDeNuevo: estado === 'completada',
})

beforeEach(async () => {
  await db?.close()
  db = await PGlite.create()
  await db.exec(leer('docker/esquema.sql'))
  await db.exec(leer('supabase/25-baja-de-cuenta.REVERTIR.sql'))
  await db.exec(leer('supabase/25-baja-de-cuenta.sql'))
  await db.exec(leer('supabase/26-baja-de-cuenta-funcion.sql'))
  await db.exec(leer('docker/datos-sinteticos.sql'))
}, 120_000)

afterAll(async () => { await db?.close() })

const estadoDe = async (uid: string) =>
  uno<{ cuenta: string; proceso: string | null; correo: boolean; intentos: number; error: string | null }>(`
    select u.estado cuenta, b.estado proceso, (u.email is null) correo,
           coalesce(b.intentos,0) intentos, b.ultimo_error error
      from public.usuarios u left join public.bajas_de_cuenta b on b.uid = u.uid
     where u.uid = '${uid}'`)

describe('Supabase confirma y Firebase falla', () => {
  it('la cuenta QUEDA CERRADA aunque Firebase se caiga', async () => {
    const r = await uno<{ r: { resultado: string } }>(`select public.baja_de_cuenta('u-cliente') as r`)
    expect(r.r.resultado).toBe('bloqueada')

    const fb = firebaseQue('red')
    expect(await pasoFirebase('u-cliente', fb)).toBe('error')

    const e = await estadoDe('u-cliente')
    expect(e.cuenta).toBe('eliminada')      // ← cerrada
    expect(e.correo).toBe(true)             // ← correo liberado
    expect(e.proceso).toBe('error')         // ← con trabajo pendiente
    expect(e.intentos).toBe(1)
    expect(e.error).toBe('ECONNRESET')
  })

  it('revoca las sesiones ANTES de borrar, para cerrar la ventana', async () => {
    await db.exec(`select public.baja_de_cuenta('u-cliente')`)
    const fb = firebaseQue('red')
    await pasoFirebase('u-cliente', fb)
    expect(fb.llamadas).toEqual(['revoke:u-cliente', 'delete:u-cliente'])
  })

  it('el token anterior NO vuelve a entrar: el autorizador lo corta por estado', async () => {
    await db.exec(`select public.baja_de_cuenta('u-cliente')`)
    await pasoFirebase('u-cliente', firebaseQue('red'))

    const fila = await uno<{ rol: string; estado: string; nombre: string | null }>(
      `select rol, estado, nombre from public.usuarios where uid = 'u-cliente'`)
    const perfil = resolverPerfil({ uid: 'u-cliente', email: null, emailVerified: true }, fila)

    expect(perfil.estado).toBe('eliminada')
    expect(revisarEstado(perfil.estado)).toMatchObject({ status: 403, que: 'cuenta.eliminada' })
  })

  it('NO se le promete el correo mientras el proceso no esté completado', async () => {
    await db.exec(`select public.baja_de_cuenta('u-cliente')`)
    await pasoFirebase('u-cliente', firebaseQue('red'))
    expect(respuesta('error')).toEqual({ estado: 'error', puedeRegistrarseDeNuevo: false })
    expect(respuesta('firebase_eliminada').puedeRegistrarseDeNuevo).toBe(false)
    expect(respuesta('completada').puedeRegistrarseDeNuevo).toBe(true)
  })

  it('el mensaje guardado es un CÓDIGO, nunca PII', async () => {
    await db.exec(`select public.baja_de_cuenta('u-cliente')`)
    await pasoFirebase('u-cliente', firebaseQue('red'))
    const { error } = await estadoDe('u-cliente')
    expect(error).toBe('ECONNRESET')
    expect(error).not.toMatch(/@|ficticia|477/)
  })
})

describe('el reintento', () => {
  it('no repite el cierre local: la función devuelve ya_eliminada', async () => {
    await db.exec(`select public.baja_de_cuenta('u-cliente')`)
    await pasoFirebase('u-cliente', firebaseQue('red'))

    const r = await uno<{ r: { resultado: string; estado_proceso: string } }>(
      `select public.baja_de_cuenta('u-cliente') as r`)
    expect(r.r.resultado).toBe('ya_eliminada')
    expect(r.r.estado_proceso).toBe('error')
    expect((await uno<{ n: number }>(`select count(*)::int n from public.bajas_de_cuenta`)).n).toBe(1)
  })

  it('avanza cuando Firebase vuelve', async () => {
    await db.exec(`select public.baja_de_cuenta('u-cliente')`)
    expect(await pasoFirebase('u-cliente', firebaseQue('red'))).toBe('error')
    expect(await pasoFirebase('u-cliente', firebaseQue(null))).toBe('firebase_eliminada')

    const e = await estadoDe('u-cliente')
    expect(e.proceso).toBe('firebase_eliminada')
    expect(e.error).toBeNull()
    expect(e.cuenta).toBe('eliminada')
  })

  it('`user-not-found` en el reintento cuenta como ÉXITO', async () => {
    await db.exec(`select public.baja_de_cuenta('u-cliente')`)
    await pasoFirebase('u-cliente', firebaseQue('red'))
    expect(await pasoFirebase('u-cliente', firebaseQue('user-not-found'))).toBe('firebase_eliminada')
    expect((await estadoDe('u-cliente')).proceso).toBe('firebase_eliminada')
  })

  it('fallar varias veces cuenta los intentos y NUNCA reabre la cuenta', async () => {
    await db.exec(`select public.baja_de_cuenta('u-cliente')`)
    for (let i = 0; i < 3; i++) await pasoFirebase('u-cliente', firebaseQue('red'))

    const e = await estadoDe('u-cliente')
    expect(e.intentos).toBe(3)
    expect(e.proceso).toBe('error')
    expect(e.cuenta).toBe('eliminada')   // ← lo que no puede pasar jamás
    expect(e.correo).toBe(true)
  })

  it('el proceso sólo avanza: de firebase_eliminada no se vuelve a error', async () => {
    await db.exec(`select public.baja_de_cuenta('u-cliente')`)
    await pasoFirebase('u-cliente', firebaseQue(null))
    expect((await estadoDe('u-cliente')).proceso).toBe('firebase_eliminada')

    // Un fallo posterior no puede devolverlo a `error`: la condición del UPDATE
    // sólo actúa sobre `bloqueada` o `error`.
    await pasoFirebase('u-cliente', firebaseQue('red'))
    expect((await estadoDe('u-cliente')).proceso).toBe('firebase_eliminada')
  })
})

describe('el otro lado: Supabase falla ANTES del commit', () => {
  it('si el cierre local no se aplica, la cuenta sigue ACTIVA y no hay baja', async () => {
    await db.exec(`
      create or replace function reventar() returns trigger language plpgsql as $$
      begin raise exception 'fallo_intencional'; end $$;
      create trigger t_reventar before update on public.propiedades
        for each row execute function reventar();`)

    await expect(db.query(`select public.baja_de_cuenta('u-publicador')`)).rejects.toThrow()

    const e = await estadoDe('u-publicador')
    expect(e.cuenta).toBe('activo')
    expect(e.correo).toBe(false)     // conserva su correo
    expect(e.proceso).toBeNull()     // no hay registro de baja

    await db.exec(`drop trigger t_reventar on public.propiedades`)
  })
})
