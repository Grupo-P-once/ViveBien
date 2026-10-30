import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { VIGENCIA_PERFIL_MS, olvidarPerfilDeSesion, perfilDeSesion, type RespuestaPerfil } from '../src/lib/acceso/perfil-de-sesion'

/**
 * Etapa 7 · «azul y luego blanco» al iniciar sesión.
 * Causa: `/dashboard` y el marco de destino preguntaban los dos por `/api/usuarios/me` y cada uno tenía su pantalla de espera.
 * Aquí: la consulta es UNA por sesión y entrada, nunca cruza cuentas y nunca guarda un error.
 */

/** El rol que trae la respuesta del servidor simulado. */
const rolDe = (r: RespuestaPerfil) => (r.datos as { rol?: string } | null)?.rol
const ok = (rol: string): RespuestaPerfil => ({ ok: true, status: 200, datos: { rol } })
const raiz = join(__dirname, '..')
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8')

function servidor(respuestas: Array<RespuestaPerfil | Error>, esperaMs = 0) {
  const llamadas: string[] = []
  let i = 0
  const pedir = async (token: string) => {
    llamadas.push(token)
    if (esperaMs) await new Promise((r) => setTimeout(r, esperaMs))
    const r = respuestas[Math.min(i++, respuestas.length - 1)]
    if (r instanceof Error) throw r
    return r
  }
  return { llamadas, pedir }
}

beforeEach(() => olvidarPerfilDeSesion())

describe('perfilDeSesion: una consulta por entrada', () => {
  it('la segunda lectura del mismo uid dentro de la vigencia NO va al servidor', async () => {
    const s = servidor([ok('publicador')])
    const a = await perfilDeSesion('u1', async () => 't1', { pedir: s.pedir })
    const b = await perfilDeSesion('u1', async () => 't1', { pedir: s.pedir })
    expect(s.llamadas).toHaveLength(1)
    expect(b).toBe(a)
  })

  it('dos lecturas SIMULTÁNEAS comparten una sola petición en vuelo', async () => {
    const s = servidor([ok('cliente')], 20)
    const [a, b] = await Promise.all([
      perfilDeSesion('u1', async () => 't', { pedir: s.pedir }),
      perfilDeSesion('u1', async () => 't', { pedir: s.pedir }),
    ])
    expect(s.llamadas).toHaveLength(1)
    expect(a).toBe(b)
  })

  it('pasada la vigencia vuelve a preguntar (un cambio de rol se nota)', async () => {
    let t = 1_000
    const s = servidor([ok('cliente'), ok('publicador')])
    const o = { pedir: s.pedir, ahora: () => t }
    const a = await perfilDeSesion('u1', async () => 't', o)
    t += VIGENCIA_PERFIL_MS + 1
    const b = await perfilDeSesion('u1', async () => 't', o)
    expect(s.llamadas).toHaveLength(2)
    expect(rolDe(a)).toBe('cliente')
    expect(rolDe(b)).toBe('publicador')
  })

  it('OTRA cuenta jamás recibe la respuesta de la anterior', async () => {
    const s = servidor([ok('admin'), ok('cliente')])
    const a = await perfilDeSesion('uid-admin', async () => 'tok-admin', { pedir: s.pedir })
    const b = await perfilDeSesion('uid-cliente', async () => 'tok-cliente', { pedir: s.pedir })
    expect(s.llamadas).toEqual(['tok-admin', 'tok-cliente'])
    expect(rolDe(a)).toBe('admin')
    expect(rolDe(b)).toBe('cliente')
  })

  it('cambio de cuenta con una consulta de la anterior todavía en vuelo: cada una recibe lo suyo', async () => {
    const lenta = servidor([ok('admin')], 30)
    const rapida = servidor([ok('cliente')])
    const pa = perfilDeSesion('uid-admin', async () => 'a', { pedir: lenta.pedir })
    const b = await perfilDeSesion('uid-cliente', async () => 'c', { pedir: rapida.pedir })
    const a = await pa
    expect(rolDe(a)).toBe('admin')
    expect(rolDe(b)).toBe('cliente')
    // y la de ahora (cliente) sigue siendo la vigente
    const otra = await perfilDeSesion('uid-cliente', async () => 'c', { pedir: rapida.pedir })
    expect(rolDe(otra)).toBe('cliente')
  })

  it('un error del servidor NO se guarda: la siguiente lectura vuelve a preguntar', async () => {
    const s = servidor([{ ok: false, status: 500, datos: null }, ok('cliente')])
    const a = await perfilDeSesion('u1', async () => 't', { pedir: s.pedir })
    const b = await perfilDeSesion('u1', async () => 't', { pedir: s.pedir })
    expect(a.ok).toBe(false)
    expect(b.ok).toBe(true)
    expect(s.llamadas).toHaveLength(2)
  })

  it('un 401/403 tampoco se guarda (sesión vencida, cuenta suspendida)', async () => {
    const s = servidor([{ ok: false, status: 401, datos: null }, { ok: false, status: 403, datos: null }])
    await perfilDeSesion('u1', async () => 't', { pedir: s.pedir })
    const b = await perfilDeSesion('u1', async () => 't', { pedir: s.pedir })
    expect(b.status).toBe(403)
    expect(s.llamadas).toHaveLength(2)
  })

  it('una excepción de red se propaga y no deja la petición «en vuelo» para siempre', async () => {
    const s = servidor([new Error('red'), ok('cliente')])
    await expect(perfilDeSesion('u1', async () => 't', { pedir: s.pedir })).rejects.toThrow('red')
    const b = await perfilDeSesion('u1', async () => 't', { pedir: s.pedir })
    expect(b.ok).toBe(true)
  })

  it('`fresco` salta la reutilización (confirmar el correo, editar el perfil)', async () => {
    const s = servidor([ok('cliente'), ok('admin')])
    await perfilDeSesion('u1', async () => 't', { pedir: s.pedir })
    const b = await perfilDeSesion('u1', async () => 't', { pedir: s.pedir, fresco: true })
    expect(rolDe(b)).toBe('admin')
    expect(s.llamadas).toHaveLength(2)
  })

  it('cerrar sesión (olvidar) obliga a preguntar de nuevo aunque sea el mismo uid', async () => {
    const s = servidor([ok('cliente'), ok('cliente')])
    await perfilDeSesion('u1', async () => 't', { pedir: s.pedir })
    olvidarPerfilDeSesion()
    await perfilDeSesion('u1', async () => 't', { pedir: s.pedir })
    expect(s.llamadas).toHaveLength(2)
  })
})

describe('las pantallas de espera del recorrido de entrada son UNA sola', () => {
  const marcos = [
    'src/app/dashboard/page.tsx',
    'src/components/portal/PortalShell.tsx',
    'src/components/admin/AdminShell.tsx',
  ]

  it.each(marcos)('%s pinta <PantallaDeEspera /> y no una pantalla propia', (r) => {
    const t = leer(r)
    expect(t).toContain('<PantallaDeEspera />')
    expect(t).not.toMatch(/Cargando tu (portal|panel)…|Cargando el panel…/)
    expect(t).not.toMatch(/fa-spinner fa-spin[^]{0,40}#fff/)
  })

  it.each(marcos)('%s consulta el perfil por `perfilDeSesion`, no con un fetch propio a /api/usuarios/me', (r) => {
    const t = leer(r)
    expect(t).toContain('perfilDeSesion(')
    // En el dashboard queda el PATCH (guardar nombre), pero ningún GET directo.
    const gets = t.match(/fetch\('\/api\/usuarios\/me',\s*\{\s*headers/g) ?? []
    expect(gets).toHaveLength(0)
  })

  it('la pantalla es idéntica por construcción: fondo y color LITERALES (no cambian con `panel-vb`) y logo oficial', () => {
    const t = leer('src/components/acceso/PantallaDeEspera.tsx')
    expect(t).toContain("background: '#ffffff'")
    expect(t).toContain("color: '#971010'")
    expect(t).not.toMatch(/var\(--(background|marca|azul)/)
    expect(t).toContain('/logo_transparent.png')
    expect(t).toContain('role="status"')
    expect(t).toContain('sr-only')
  })

  it('el panel antiguo sigue sin montarse mientras se resuelve el destino (D-45)', () => {
    const t = leer('src/app/dashboard/page.tsx')
    const puerta = t.indexOf("pantalla.estado === 'resolviendo' || pantalla.estado === 'redirigir' || aEntrar) return <PantallaDeEspera />")
    const panel = t.indexOf('if (!isAdmin) return (')
    expect(puerta).toBeGreaterThan(-1)
    expect(panel).toBeGreaterThan(-1)
    expect(puerta).toBeLessThan(panel)
  })
})

describe('editar el perfil invalida lo reutilizado', () => {
  // Barrera estructural: un archivo nuevo que haga PATCH a /api/usuarios/me sin invalidar dejaría un nombre/foto viejo en los marcos.
  const archivos: string[] = []
  const recorrer = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) recorrer(p)
      else if (/\.(ts|tsx)$/.test(n)) archivos.push(p)
    }
  }
  recorrer(join(raiz, 'src'))

  it('todo archivo del cliente que hace PATCH a /api/usuarios/me llama a olvidarPerfilDeSesion()', () => {
    const faltan = archivos.filter((p) => {
      if (p.includes(`${join('src', 'app', 'api')}`) || p.endsWith('perfil-de-sesion.ts')) return false
      const t = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      // la llamada que edita: la ruta del perfil y, a continuación, `method: 'PATCH'` en la misma llamada
      return /\/api\/usuarios\/me'[^;]{0,160}method:\s*'PATCH'/.test(t) && !/olvidarPerfilDeSesion\(\)/.test(t)
    })
    expect(faltan).toEqual([])
  })

  it('nadie consulta el perfil de entrada con un fetch propio fuera de los que no se comparten a propósito', () => {
    // Los GET que quedan son de pantallas de datos (mi cuenta, portal, métricas), no del recorrido de entrada.
    const permitidos = ['mi-cuenta', 'MetricasCliente', 'PerfilPortal', 'MiBusquedaPortal', 'cuenta', 'usuarios', 'publicador'].map((s) => s.toLowerCase())
    const sueltos = archivos.filter((p) => {
      if (p.includes(join('src', 'app', 'api')) || p.endsWith('perfil-de-sesion.ts')) return false
      const t = readFileSync(p, 'utf8')
      return /fetch\('\/api\/usuarios\/me',\s*\{\s*headers/.test(t) && !permitidos.some((s) => p.toLowerCase().includes(s))
    })
    expect(sueltos).toEqual([])
  })
})

describe('una consulta que llega tarde no sobrevive a «olvidar»', () => {
  it('cerrar sesión con la consulta en vuelo: su respuesta NO se guarda y la siguiente lectura va al servidor', async () => {
    const lenta = servidor([ok('admin')], 30)
    const p = perfilDeSesion('u1', async () => 't', { pedir: lenta.pedir })
    olvidarPerfilDeSesion() // la persona cerró sesión mientras la respuesta venía en camino
    await p
    const nueva = servidor([ok('cliente')])
    const b = await perfilDeSesion('u1', async () => 't', { pedir: nueva.pedir })
    expect(nueva.llamadas).toHaveLength(1)
    expect(rolDe(b)).toBe('cliente')
  })

  it('cambio de cuenta con la consulta anterior en vuelo: la respuesta tardía de la anterior no se guarda', async () => {
    const lenta = servidor([ok('admin')], 40)
    const pa = perfilDeSesion('uid-admin', async () => 'a', { pedir: lenta.pedir })
    const rapida = servidor([ok('cliente')])
    await perfilDeSesion('uid-cliente', async () => 'c', { pedir: rapida.pedir })
    await pa
    // ahora entra otra vez «uid-admin»: no debe encontrar la respuesta tardía, sino preguntar
    const otra = servidor([ok('publicador')])
    const r = await perfilDeSesion('uid-admin', async () => 'a2', { pedir: otra.pedir })
    expect(otra.llamadas).toHaveLength(1)
    expect(rolDe(r)).toBe('publicador')
  })
})
