import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearGuardador, MENSAJE_SIN_RED, type Cambios, type ResultadoGuardado } from '../src/lib/publicador/guardador'
import { agregarSinDuplicar } from '../src/lib/publicador/cola-fotos'

/**
 * Autoguardado del asistente de anuncios (15-oct-2026, E-48): un error del PATCH NO puede descartar lo pendiente, el envío a revisión
 * debe poder comprobar el resultado real, y los envíos van de uno en uno. Temporizadores simulados; sin red.
 */
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const ok: ResultadoGuardado = { ok: true }

function servidor(respuestas: Array<ResultadoGuardado | 'lanza'>) {
  const enviados: Cambios[] = []
  let enCurso = 0
  let maxSimultaneos = 0
  const enviar = vi.fn(async (c: Cambios): Promise<ResultadoGuardado> => {
    enviados.push(c)
    enCurso++
    maxSimultaneos = Math.max(maxSimultaneos, enCurso)
    await Promise.resolve()
    enCurso--
    const r = respuestas.shift() ?? ok
    if (r === 'lanza') throw new Error('red caída')
    return r
  })
  return { enviar, enviados, maxSimultaneos: () => maxSimultaneos }
}

describe('guardar y vaciar', () => {
  it('manda lo acumulado tras la pausa, junto, y avisa los estados', async () => {
    const s = servidor([])
    const estados: string[] = []
    const g = crearGuardador({ enviar: s.enviar, retardoMs: 1200, alCambiarEstado: (e) => estados.push(e) })
    g.guardar({ titulo: 'a' })
    g.guardar({ precio: 5 })
    expect(s.enviar).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1200)
    expect(s.enviados).toEqual([{ titulo: 'a', precio: 5 }])
    expect(g.hayPendiente()).toBe(false)
    expect(estados).toEqual(['guardando', 'guardando', 'guardando', 'guardado'])
  })

  it('un error del servidor NO descarta lo pendiente y permite reintentar', async () => {
    const s = servidor([{ ok: false, error: 'Hay datos que no son válidos: fotos' }, ok])
    const estados: Array<[string, string | undefined]> = []
    const g = crearGuardador({ enviar: s.enviar, alCambiarEstado: (e, m) => estados.push([e, m]) })
    g.guardar({ fotos: ['u1', 'u2'] })
    const r1 = await g.vaciar()
    expect(r1).toEqual({ ok: false, error: 'Hay datos que no son válidos: fotos' })
    expect(g.hayPendiente()).toBe(true)
    expect(g.pendiente()).toEqual({ fotos: ['u1', 'u2'] })
    expect(estados.at(-1)).toEqual(['error', 'Hay datos que no son válidos: fotos'])
    const r2 = await g.vaciar() // reintento sin volver a escribir nada
    expect(r2).toEqual(ok)
    expect(s.enviados).toEqual([{ fotos: ['u1', 'u2'] }, { fotos: ['u1', 'u2'] }])
    expect(g.hayPendiente()).toBe(false)
  })

  it('si el envío lanza (sin red) se trata como fallo, con mensaje, y se conserva lo pendiente', async () => {
    const s = servidor(['lanza', ok])
    const g = crearGuardador({ enviar: s.enviar })
    g.guardar({ descripcion: 'texto' })
    const r = await g.vaciar()
    expect(r).toEqual({ ok: false, error: MENSAJE_SIN_RED })
    expect(g.pendiente()).toEqual({ descripcion: 'texto' })
    expect(await g.vaciar()).toEqual(ok)
  })

  it('tras un fallo, lo escrito mientras tanto es más reciente y gana sobre lo que volvió a la cola', async () => {
    let soltar: (r: ResultadoGuardado) => void = () => {}
    const enviados: Cambios[] = []
    const enviar = vi.fn((c: Cambios) => { enviados.push(c); return new Promise<ResultadoGuardado>((res) => { soltar = res }) })
    const g = crearGuardador({ enviar, retardoMs: 10 })
    g.guardar({ fotos: ['viejo'], titulo: 'T' })
    const p = g.vaciar()
    await Promise.resolve()
    g.guardar({ fotos: ['nuevo'] }) // mientras el primer PATCH vuela
    soltar({ ok: false, error: 'falló' })
    expect((await p).ok).toBe(false)
    expect(g.pendiente()).toEqual({ fotos: ['nuevo'], titulo: 'T' })
  })

  it('vaciar sin nada pendiente y sin error previo es éxito; tras un error sin reintentar devuelve el error', async () => {
    const s = servidor([{ ok: false, error: 'x' }])
    const g = crearGuardador({ enviar: s.enviar })
    expect(await g.vaciar()).toEqual(ok)
    g.guardar({ a: 1 })
    await g.vaciar()
    expect(g.hayPendiente()).toBe(true)
  })

  it('nunca hay dos envíos a la vez: lo escrito mientras uno vuela espera su turno', async () => {
    let enCurso = 0
    let maximo = 0
    const enviados: Cambios[] = []
    const liberar: Array<() => void> = []
    const enviar = vi.fn((c: Cambios) => {
      enviados.push(c)
      enCurso++
      maximo = Math.max(maximo, enCurso)
      return new Promise<ResultadoGuardado>((res) => { liberar.push(() => { enCurso--; res(ok) }) })
    })
    const g = crearGuardador({ enviar })
    g.guardar({ a: 1 })
    const p1 = g.vaciar()
    await Promise.resolve()
    await Promise.resolve()
    expect(enviados).toEqual([{ a: 1 }])
    g.guardar({ b: 2 })
    const p2 = g.vaciar() // el primer envío sigue en vuelo
    await Promise.resolve()
    expect(enviados).toEqual([{ a: 1 }]) // el segundo NO arranca todavía
    liberar[0]()
    await p1
    await Promise.resolve()
    await Promise.resolve()
    liberar[1]()
    await p2
    expect(enviados).toEqual([{ a: 1 }, { b: 2 }])
    expect(maximo).toBe(1)
  })

  it('«enviar a revisión»: quien llama puede comprobar el resultado y detenerse si falló', async () => {
    const s = servidor([{ ok: false, error: 'No se pudo guardar.' }])
    const g = crearGuardador({ enviar: s.enviar })
    g.guardar({ fotos: ['a', 'b', 'c', 'd', 'e'] })
    const previo = await g.vaciar()
    // la UI hace exactamente esto: si !previo.ok no pide el cambio de estado
    expect(previo.ok).toBe(false)
  })
})

/**
 * Carrera guardador/recarga (E-48, 15-oct-2026). `cargar()` de la página reconcilia así: `{ ...copiaDelServidor, ...guardador.pendiente() }`.
 * Si lo que va en un PATCH sin respuesta no aparece en `pendiente()`, una recarga que termine en ese intervalo devuelve la lista VIEJA de
 * fotos; la siguiente foto que termine de subir parte de ella y su guardado borra en el servidor la anterior.
 */
describe('recarga concurrente con un PATCH en vuelo', () => {
  /** El servidor controlado a mano: cada envío queda en vuelo hasta que se libera. */
  function servidorManual() {
    const enviados: Cambios[] = []
    const liberar: Array<(r: ResultadoGuardado) => void> = []
    const enviar = vi.fn((c: Cambios) => {
      enviados.push(c)
      return new Promise<ResultadoGuardado>((res) => { liberar.push(res) })
    })
    return { enviar, enviados, liberar }
  }
  /** Lo que hace `cargar()` en la página al recibir la copia del servidor. */
  const reconciliar = (copiaDelServidor: Cambios, g: ReturnType<typeof crearGuardador>) => ({ ...copiaDelServidor, ...g.pendiente() })

  it('lo que va en vuelo cuenta como pendiente hasta que el servidor responde', async () => {
    const s = servidorManual()
    const g = crearGuardador({ enviar: s.enviar })
    g.guardar({ fotos: ['a', 'b'] })
    const p = g.vaciar()
    await Promise.resolve()
    await Promise.resolve()
    expect(s.enviados).toEqual([{ fotos: ['a', 'b'] }])
    expect(g.pendiente()).toEqual({ fotos: ['a', 'b'] }) // ya salió, aún sin respuesta
    expect(g.hayPendiente()).toBe(true)                  // y avisar al cerrar la pestaña sigue siendo correcto
    s.liberar[0]({ ok: true })
    await p
    expect(g.pendiente()).toEqual({})
    expect(g.hayPendiente()).toBe(false)
  })

  it('la recarga que termina durante el PATCH no pisa las fotos nuevas, y la foto siguiente no borra la anterior', async () => {
    const s = servidorManual()
    const g = crearGuardador({ enviar: s.enviar })
    let fotos = ['a']                    // lo que la pantalla y el servidor tienen
    const subida = (url: string) => {    // lo que hace la cola de fotos al terminar una subida
      const { lista, agregada } = agregarSinDuplicar(fotos, url, 20)
      if (agregada) { fotos = lista; g.guardar({ fotos: lista }) }
    }

    subida('b')
    const p1 = g.vaciar()                // PATCH {fotos:[a,b]} en vuelo
    await Promise.resolve()
    await Promise.resolve()

    // La recarga había pedido la lista ANTES de este PATCH y llega ahora: trae solo [a].
    fotos = (reconciliar({ fotos: ['a'] }, g).fotos as string[])
    expect(fotos).toEqual(['a', 'b'])

    subida('c')                          // termina otra subida: parte de la lista reconciliada
    s.liberar[0]({ ok: true })
    await p1
    const p2 = g.vaciar()
    await Promise.resolve()
    await Promise.resolve()
    s.liberar[1]({ ok: true })
    await p2
    expect(s.enviados).toEqual([{ fotos: ['a', 'b'] }, { fotos: ['a', 'b', 'c'] }]) // nunca [a, c]
  })

  it('si el PATCH en vuelo falla, sigue en la cola y la recarga posterior tampoco lo pisa', async () => {
    const s = servidorManual()
    const g = crearGuardador({ enviar: s.enviar })
    g.guardar({ titulo: 'Nuevo título' })
    const p = g.vaciar()
    await Promise.resolve()
    await Promise.resolve()
    expect(reconciliar({ titulo: 'Viejo' }, g).titulo).toBe('Nuevo título')   // en vuelo
    s.liberar[0]({ ok: false, error: 'falló' })
    expect((await p).ok).toBe(false)
    expect(reconciliar({ titulo: 'Viejo' }, g).titulo).toBe('Nuevo título')   // de vuelta en la cola
    expect(g.hayPendiente()).toBe(true)
  })

  it('lo escrito después del envío manda sobre lo que va en vuelo', async () => {
    const s = servidorManual()
    const g = crearGuardador({ enviar: s.enviar })
    g.guardar({ precio: 100, titulo: 'A' })
    const p = g.vaciar()
    await Promise.resolve()
    await Promise.resolve()
    g.guardar({ precio: 200 })                                 // mientras el primer PATCH vuela
    expect(g.pendiente()).toEqual({ precio: 200, titulo: 'A' })
    s.liberar[0]({ ok: true })
    await p
    expect(g.pendiente()).toEqual({ precio: 200 })
  })
})
