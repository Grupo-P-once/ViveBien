import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * V-1.1.91 · D-43 / D-44 — La pantalla de «Bajas de cuenta».
 *
 * Es la única forma de terminar la limpieza de Firebase de una cuenta ya
 * cerrada. Lo que se prueba aquí, más que el camino feliz, es **lo que la
 * pantalla no puede hacer**: no acepta un identificador escrito a mano, no
 * enseña PII, no toca `usuarios`, no ejecuta la baja local, y nunca cuenta una
 * historia distinta a la del servidor.
 *
 * La lógica vive en `lib/admin/bajas.ts` —código puro, sin React— para poder
 * probar de verdad cada rama: cancelar, confirmar, doble clic, 409 `en_curso`,
 * estado cambiado y refresco. El componente es una carcasa, y hay guardas que
 * leen su código fuente.
 */

const mundo = vi.hoisted(() => ({
  sesion: null as null | { uid: string; rol: string; superAdmin: boolean; estado: string },
  bajas: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')

  const cadena = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'in', 'or', 'update']) c[m] = () => c
    c.maybeSingle = async () => ({ data: null, error: null })
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: mundo.bajas, error: null }).then(ok)
    return c
  }

  const autorizar = real.crearAutorizador({
    verificar: async (req: Request) => ((mundo.sesion && (req.headers.get('authorization') ?? '').startsWith('Bearer '))
      ? { uid: mundo.sesion.uid, email: 'admin@ejemplo.invalid', emailVerified: true, authTime: null }
      : null),
    perfil: async (u) => ({
      ...u,
      rol: mundo.sesion!.rol as 'cliente' | 'publicador' | 'admin',
      superAdmin: mundo.sesion!.superAdmin,
      estado: mundo.sesion!.estado as never,
      nombre: null,
    }),
    denegado: async () => {},
  })

  return {
    ...real,
    supabaseAdmin: () => ({ from: () => cadena() }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) =>
      autorizar(req, (p) => puede(p, permiso), permiso),
  }
})

import { GET as listarBajas } from '../src/app/api/admin/bajas/route'
import {
  crearControlador, sePuedeTerminar, vistaDeFila, ETIQUETA, LO_QUE_HACE, type FilaBaja,
} from '../src/lib/admin/bajas'

const UID_QA = 'uRnx8chsgdSNkDbOLju5QkGBr4x1'

/** Una fila cruda como la que guarda la base, con PII alrededor a propósito. */
const filaCruda = (uid: string, estado: string) => ({
  uid, estado,
  solicitada_en: '2026-09-25T01:13:56.665Z',
  bloqueada_en: '2026-09-25T01:13:56.665Z',
  firebase_eliminada_en: null,
  completada_en: null,
  intentos: 1,
  ultimo_intento_en: '2026-09-25T01:13:57.232Z',
  ultimo_error: 'Error',
  // Estos NO los devuelve el `select` de la ruta; están aquí para comprobarlo.
  motivo: 'me mudo de ciudad',
  auth_time: '2026-09-25T01:13:55.000Z',
  email: 'jemilianoponceperez+qa1@gmail.com',
})

const fila = (uid: string, estado: FilaBaja['estado'], extra: Partial<FilaBaja> = {}): FilaBaja => ({
  uid, estado,
  solicitadaEn: '2026-09-25T01:13:56.665Z',
  bloqueadaEn: '2026-09-25T01:13:56.665Z',
  firebaseEliminadaEn: null,
  completadaEn: null,
  intentos: 1,
  ultimoIntentoEn: '2026-09-25T01:13:57.232Z',
  ultimoError: 'Error',
  ...extra,
})

/** Un `pedir()` de mentira que anota cada llamada. */
function pedirQue(responder: (ruta: string, opciones?: RequestInit) => unknown) {
  const llamadas: Array<{ ruta: string; metodo: string }> = []
  const pedir = async <T,>(ruta: string, opciones: RequestInit = {}): Promise<T> => {
    llamadas.push({ ruta, metodo: (opciones.method ?? 'GET').toUpperCase() })
    const r = responder(ruta, opciones)
    if (r instanceof Error) throw r
    return r as T
  }
  return { pedir, llamadas }
}

const errorDePeticion = (mensaje: string, estado: number, codigo?: string) =>
  Object.assign(new Error(mensaje), { estado, codigo })

beforeEach(() => { mundo.sesion = null; mundo.bajas = [] })

// ── 1-4 · La API que alimenta la lista ─────────────────────────────────────

describe('la lista viene del servidor, y sólo de ahí', () => {
  const pedirLista = (conSesion = true) => listarBajas(new Request('https://vivebienn.com/api/admin/bajas', {
    headers: conSesion ? { authorization: 'Bearer da-igual' } : {},
  }))

  it('1 · un super admin puede consultarla', async () => {
    mundo.sesion = { uid: 'a-1', rol: 'admin', superAdmin: true, estado: 'activo' }
    mundo.bajas = [filaCruda(UID_QA, 'error')]
    const r = await pedirLista()
    expect(r.status).toBe(200)
    expect((await r.json()).bajas).toHaveLength(1)
  })

  it('1b · un admin normal también: el permiso es `usuarios.gestionar`', async () => {
    mundo.sesion = { uid: 'a-2', rol: 'admin', superAdmin: false, estado: 'activo' }
    expect((await pedirLista()).status).toBe(200)
  })

  it('2 · un cliente no puede → 403', async () => {
    mundo.sesion = { uid: 'c-1', rol: 'cliente', superAdmin: false, estado: 'activo' }
    expect((await pedirLista()).status).toBe(403)
  })

  it('2b · un publicador tampoco → 403', async () => {
    mundo.sesion = { uid: 'p-1', rol: 'publicador', superAdmin: false, estado: 'activo' }
    expect((await pedirLista()).status).toBe(403)
  })

  it('3 · sin sesión → 401', async () => {
    expect((await pedirLista(false)).status).toBe(401)
  })

  it('4 · la respuesta NO lleva PII, aunque la fila de la base la tenga al lado', async () => {
    mundo.sesion = { uid: 'a-1', rol: 'admin', superAdmin: true, estado: 'activo' }
    mundo.bajas = [filaCruda(UID_QA, 'error')]

    const texto = await (await pedirLista()).text()

    for (const prohibido of [/@gmail\.com/, /me mudo/, /auth_time/, /motivo/i, /telefono/i, /nombre/i]) {
      expect(texto, `la lista contiene ${prohibido}`).not.toMatch(prohibido)
    }
    expect(Object.keys(JSON.parse(texto).bajas[0]).sort()).toEqual([
      'bloqueadaEn', 'completadaEn', 'estado', 'firebaseEliminadaEn',
      'intentos', 'solicitadaEn', 'uid', 'ultimoError', 'ultimoIntentoEn',
    ])
  })
})

// ── 6-7 · Qué fila ofrece la acción ────────────────────────────────────────

describe('a quién se le ofrece terminar la limpieza', () => {
  it('6 · una fila en `error` sí', () => {
    expect(vistaDeFila(fila(UID_QA, 'error')).sePuedeTerminar).toBe(true)
    expect(vistaDeFila(fila(UID_QA, 'error')).requiereReintento).toBe(true)
  })

  it('7 · una fila `completada` NO', () => {
    const v = vistaDeFila(fila(UID_QA, 'completada', { completadaEn: '2026-09-25T02:00:00.000Z' }))
    expect(v.sePuedeTerminar).toBe(false)
    expect(v.requiereReintento).toBe(false)
  })

  it('`solicitada` tampoco: no consta que la cuenta esté cerrada', () => {
    expect(sePuedeTerminar('solicitada')).toBe(false)
  })

  it('los estados intermedios sí, porque queda trabajo', () => {
    for (const e of ['bloqueada', 'firebase_eliminada', 'datos_procesados'] as const) {
      expect(sePuedeTerminar(e)).toBe(true)
    }
  })
})

// ── 8-13 · El comportamiento de la acción ──────────────────────────────────

describe('la acción', () => {
  const OK = { estado: 'completada', terminada: true, requiereReintento: false }
  const listaVacia = { bajas: [] }

  it('8 · cancelar no llama a NADA', async () => {
    const p = pedirQue(() => listaVacia)
    const c = crearControlador({ pedir: p.pedir })
    await c.listar()                       // la pantalla carga la lista…
    // …y la persona cancela: `terminarLimpieza` no se llama nunca.
    expect(p.llamadas.filter((l) => l.metodo === 'POST')).toEqual([])
  })

  it('9 · confirmar llama UNA vez al endpoint correcto, con POST', async () => {
    const p = pedirQue((ruta) => (ruta.includes('reintentar') ? OK : listaVacia))
    const c = crearControlador({ pedir: p.pedir })

    const { resultado } = await c.terminarLimpieza(UID_QA)

    expect(resultado).toEqual({ tipo: 'completada' })
    const posts = p.llamadas.filter((l) => l.metodo === 'POST')
    expect(posts).toEqual([{ ruta: `/api/admin/bajas/${UID_QA}/reintentar`, metodo: 'POST' }])
  })

  it('10 · doble clic NO manda dos POST', async () => {
    let soltar: (v: unknown) => void = () => {}
    const colgado = new Promise((r) => { soltar = r })
    const p = pedirQue((ruta) => (ruta.includes('reintentar') ? colgado : listaVacia))
    const c = crearControlador({ pedir: p.pedir })

    const primero = c.terminarLimpieza(UID_QA)
    const segundo = await c.terminarLimpieza(UID_QA)   // el segundo clic, con el primero en vuelo

    expect(segundo.resultado).toEqual({ tipo: 'en_curso' })
    soltar(OK)
    await primero

    expect(p.llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(1)
  })

  it('11 · un 409 `en_curso` se distingue y refresca', async () => {
    const p = pedirQue((ruta) => (ruta.includes('reintentar')
      ? errorDePeticion('Ya hay un reintento en curso. Espera un par de minutos.', 409, 'en_curso')
      : { bajas: [fila(UID_QA, 'error')] }))
    const c = crearControlador({ pedir: p.pedir })

    const { resultado, bajas } = await c.terminarLimpieza(UID_QA)

    expect(resultado).toEqual({ tipo: 'en_curso' })
    expect(bajas).toHaveLength(1)                       // vino del servidor
    expect(p.llamadas.map((l) => l.metodo)).toEqual(['POST', 'GET'])
  })

  it('12 · 404 y 409 por estado cambiado → `ya_no_procede` y refresco', async () => {
    for (const [estado, codigo] of [[404, 'sin_registro'], [409, 'ya_completada'], [409, 'sin_paso_pendiente'], [409, 'cuenta_no_eliminada']] as const) {
      const p = pedirQue((ruta) => (ruta.includes('reintentar')
        ? errorDePeticion('Eso ya cambió.', estado, codigo)
        : listaVacia))
      const c = crearControlador({ pedir: p.pedir })

      const { resultado, bajas } = await c.terminarLimpieza(UID_QA)
      expect(resultado, `${estado} ${codigo}`).toEqual({ tipo: 'ya_no_procede' })
      expect(bajas).toEqual([])
      expect(p.llamadas.map((l) => l.metodo)).toEqual(['POST', 'GET'])
    }
  })

  it('13 · el éxito refresca DESDE EL SERVIDOR, no a mano', async () => {
    const p = pedirQue((ruta) => (ruta.includes('reintentar') ? OK : { bajas: [fila('otra-1', 'error')] }))
    const c = crearControlador({ pedir: p.pedir })

    const { bajas } = await c.terminarLimpieza(UID_QA)

    // Lo que se pinta después sale del GET: la fila que queda es la del server,
    // no una versión local de la que se acaba de tocar.
    expect(bajas).toEqual([fila('otra-1', 'error')])
    expect(p.llamadas.map((l) => l.metodo)).toEqual(['POST', 'GET'])
  })

  it('si Firebase vuelve a fallar, se dice `pendiente` y se refresca', async () => {
    const p = pedirQue((ruta) => (ruta.includes('reintentar')
      ? { estado: 'error', terminada: false, requiereReintento: true }
      : { bajas: [fila(UID_QA, 'error', { intentos: 2 })] }))
    const c = crearControlador({ pedir: p.pedir })

    const { resultado, bajas } = await c.terminarLimpieza(UID_QA)
    expect(resultado).toEqual({ tipo: 'pendiente' })
    expect(bajas?.[0].intentos).toBe(2)
  })

  it('un fallo inesperado enseña el mensaje del servidor, no una traza', async () => {
    const p = pedirQue(() => errorDePeticion('No se pudo leer la lista.', 500))
    const c = crearControlador({ pedir: p.pedir })

    const { resultado } = await c.terminarLimpieza(UID_QA)
    expect(resultado).toEqual({ tipo: 'fallo', mensaje: 'No se pudo leer la lista.' })
  })
})

// ── 14-15 + adversarial · Lo que la pantalla no puede hacer ────────────────

describe('lo que la pantalla no puede hacer', () => {
  /**
   * El código SIN comentarios: los dos archivos explican en su encabezado por
   * qué NO llaman a `baja_de_cuenta` ni escriben en `usuarios`, y citarlo para
   * explicarlo no puede hacer fallar la prueba. Lo que se vigila es lo que se
   * ejecuta, no lo que se escribió para quien mantiene el código.
   */
  const leer = (ruta: string) =>
    readFileSync(join(process.cwd(), ruta), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
  const fuente = () => leer('src/components/admin/BajasDeCuenta.tsx')
  const logica = () => leer('src/lib/admin/bajas.ts')

  it('5 · usa `pedir()` y NUNCA un `fetch` pelado', () => {
    expect(logica()).toMatch(/d\.pedir</)
    for (const f of [fuente(), logica()]) {
      expect(f).not.toMatch(/\bfetch\(/)
      expect(f).not.toMatch(/XMLHttpRequest/)
    }
  })

  it('14 · en ningún estado de la interfaz aparece PII', () => {
    const v = vistaDeFila(fila(UID_QA, 'error'))
    const pintado = JSON.stringify(v) + Object.values(ETIQUETA).join(' ') + LO_QUE_HACE.join(' ')

    for (const prohibido of [/@/, /telefono/i, /correo de/i, /nombre/i, /motivo/i, /USER_NOT_FOUND/, /Error/]) {
      expect(pintado, `se pinta ${prohibido}`).not.toMatch(prohibido)
    }
    // El uid entero tampoco: sólo una referencia de seis caracteres.
    expect(v.referencia).toBe('uRnx8c…')
    expect(pintado).not.toContain(UID_QA)
  })

  it('14b · `ultimoError` llega de la API pero NO se pinta', () => {
    expect(fila(UID_QA, 'error').ultimoError).toBe('Error')
    expect(JSON.stringify(vistaDeFila(fila(UID_QA, 'error')))).not.toContain('Error')
    // Y el componente no lo saca por ninguna parte.
    expect(fuente()).not.toMatch(/ultimoError/)
  })

  it('15 · ningún código de cliente llama a `baja_de_cuenta` ni escribe en `usuarios`', () => {
    for (const f of [fuente(), logica()]) {
      expect(f).not.toMatch(/baja_de_cuenta/)
      expect(f).not.toMatch(/from\(['"]usuarios['"]\)/)
      expect(f).not.toMatch(/estado:\s*['"]activo['"]/)
      expect(f).not.toMatch(/propiedades|invitaciones/)
    }
  })

  it('ADVERSARIAL · no hay forma de escribir un uid a mano', () => {
    const f = fuente()
    // Sin campos de texto: el uid sólo puede venir de la lista del servidor.
    for (const entrada of [/<input/i, /<Input/, /<Textarea/, /contentEditable/, /prompt\(/]) {
      expect(f, `hay una entrada de texto (${entrada})`).not.toMatch(entrada)
    }
    // Y el que se manda es el de la fila, no uno construido.
    expect(f).toMatch(/terminarLimpieza\(pendiente\.uid\)/)
    expect(f).toMatch(/setPendiente\(b\)/)
  })

  it('ADVERSARIAL · un uid inventado por el cliente lo rechaza el SERVIDOR, no la pantalla', async () => {
    // La pantalla no es la barrera: si alguien llamara al controlador con un
    // uid cualquiera desde la consola, el endpoint responde 404 y aquí sólo se
    // refresca la lista. Nada se toca.
    const p = pedirQue((ruta) => (ruta.includes('reintentar')
      ? errorDePeticion('No hay ninguna baja registrada para esa cuenta.', 404, 'sin_registro')
      : { bajas: [] }))
    const c = crearControlador({ pedir: p.pedir })

    const { resultado } = await c.terminarLimpieza('uid-completamente-inventado')
    expect(resultado).toEqual({ tipo: 'ya_no_procede' })
    // El uid viajó tal cual, sin que la pantalla lo "arreglara": que lo juzgue
    // quien tiene la base delante.
    expect(p.llamadas[0].ruta).toBe('/api/admin/bajas/uid-completamente-inventado/reintentar')
  })

  it('el aviso de confirmación dice las cuatro cosas que importan', () => {
    const texto = LO_QUE_HACE.join(' ')
    expect(texto).toMatch(/no la reactiva/i)
    expect(texto).toMatch(/no se restaura/i)
    expect(texto).toMatch(/no se vuelve a ejecutar la baja local/i)
    expect(texto).toMatch(/pendiente de reintento/i)
    // Y el componente los pinta, no los reescribe.
    expect(fuente()).toMatch(/LO_QUE_HACE\.map/)
  })
})
