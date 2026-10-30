import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  destinoTrasEntrar, modoClasico, pantallaDeDashboard, type Entrada, type EstadoDelPerfil,
} from '../src/lib/acceso/destino-dashboard'

/**
 * V-1.1.92 — El destello del panel antiguo.
 *
 * ─────────────────────────────────────────────────────────────
 * EL FALLO
 *
 * `/dashboard` decidía con `const isAdmin = rol === 'admin'`, y `rol` empieza
 * en `null`. Ese `null` significaba **dos cosas a la vez**: «todavía no sé» y
 * «ya lo sé y no es admin». Como `null !== 'admin'`, la página se metía por la
 * puerta de «no es admin» y pintaba el portal antiguo entero durante los
 * 200-600 ms que tarda `/api/usuarios/me`. Después, `router.replace()` se
 * llevaba a esa persona a `/portal` o `/admin`. Eso era el destello — y lo
 * sufrían también los administradores.
 *
 * La prueba que importa es `reproduce el fallo`: si alguien vuelve a confundir
 * «no sé» con «decidí», se pone en rojo.
 * ─────────────────────────────────────────────────────────────
 */

const CLIENTE = { rol: 'cliente', superAdmin: false, portal: true }
const PUBLICADOR = { rol: 'publicador', superAdmin: false, portal: true }
const ADMIN = { rol: 'admin', superAdmin: false, portal: true }
const SUPER_ADMIN = { rol: 'admin', superAdmin: true, portal: true }
/** Con el portal cerrado por flag, el servidor manda `portal: false`. */
const CLIENTE_SIN_PORTAL = { rol: 'cliente', superAdmin: false, portal: false }

const entrada = (perfil: EstadoDelPerfil, extra: Partial<Entrada> = {}): Entrada => ({
  authLoading: false,
  hayUsuario: true,
  perfil,
  busqueda: '',
  ...extra,
})

describe('LA PRUEBA DEL FALLO', () => {
  it('reproduce el fallo: sesión resuelta, perfil todavía NO → `resolviendo`, jamás `clasico`', () => {
    const p = pantallaDeDashboard({
      authLoading: false,          // Firebase ya contestó…
      hayUsuario: true,            // …y hay sesión…
      perfil: 'cargando',          // …pero el rol todavía viaja por la red.
      busqueda: '',
    })

    expect(p).toEqual({ estado: 'resolviendo' })
    // Lo que no puede pasar nunca: montar el panel antiguo en ese instante.
    expect(p.estado).not.toBe('clasico')
    expect(p.estado).not.toBe('redirigir')
  })

  it('`cargando` y `sin_perfil` son estados DISTINTOS', () => {
    // Ésta es la ambigüedad que produjo el fallo: un solo valor no puede
    // significar «no sé» y «decidí quedarme».
    expect(pantallaDeDashboard(entrada('cargando')).estado).toBe('resolviendo')
    expect(pantallaDeDashboard(entrada('sin_perfil')).estado).toBe('clasico')
  })
})

describe('los destinos', () => {
  const casos: Array<[string, EstadoDelPerfil, string]> = [
    ['2 · CLIENTE → /portal', CLIENTE, '/portal'],
    ['3 · PUBLICADOR → /portal', PUBLICADOR, '/portal'],
    ['4 · ADMIN → /admin', ADMIN, '/admin'],
    ['5 · SUPER_ADMIN → /admin', SUPER_ADMIN, '/admin'],
  ]

  for (const [nombre, perfil, destino] of casos) {
    it(nombre, () => {
      expect(pantallaDeDashboard(entrada(perfil))).toEqual({ estado: 'redirigir', destino })
      expect(destinoTrasEntrar(perfil as object, '')).toBe(destino)
    })
  }

  it('el administrador va a SU panel aunque el portal esté abierto', () => {
    expect(pantallaDeDashboard(entrada({ ...ADMIN, portal: true })).estado).toBe('redirigir')
    expect(destinoTrasEntrar({ ...ADMIN, portal: true }, '')).toBe('/admin')
  })

  it('un super admin marcado sólo por `superAdmin` también va a /admin', () => {
    expect(destinoTrasEntrar({ rol: 'cliente', superAdmin: true }, '')).toBe('/admin')
  })

  it('`rol: super_admin` NO cuenta: la API nunca lo emite', () => {
    // La tabla guarda `super_admin`, pero `/api/usuarios/me` lo traduce a
    // `rol: 'admin'` + `superAdmin: true`. Recibir `'super_admin'` significaría
    // que algo no es lo que dice ser, así que no abre nada.
    expect(destinoTrasEntrar({ rol: 'super_admin' }, '')).toBeNull()
    expect(pantallaDeDashboard(entrada({ rol: 'super_admin' })).estado).toBe('clasico')
  })
})

describe('los casos de borde', () => {
  it('6 · `?clasico=1` → clásico, para cualquiera', () => {
    for (const perfil of [CLIENTE, PUBLICADOR, ADMIN, SUPER_ADMIN, 'cargando', 'sin_perfil'] as EstadoDelPerfil[]) {
      expect(pantallaDeDashboard(entrada(perfil, { busqueda: '?clasico=1' })).estado).toBe('clasico')
    }
    expect(modoClasico('?clasico=1')).toBe(true)
    expect(modoClasico('?clasico')).toBe(true)
    expect(modoClasico('?otra=1')).toBe(false)
    expect(modoClasico('')).toBe(false)
  })

  it('7 · sin sesión → pantalla de acceso, nunca el panel antiguo', () => {
    const p = pantallaDeDashboard(entrada('cargando', { hayUsuario: false }))
    expect(p).toEqual({ estado: 'acceso' })
    // Ni siquiera con `?clasico=1`: primero hay que entrar.
    expect(pantallaDeDashboard(entrada('cargando', { hayUsuario: false, busqueda: '?clasico=1' })).estado)
      .toBe('acceso')
  })

  it('mientras Firebase no contesta → `resolviendo`', () => {
    expect(pantallaDeDashboard(entrada('cargando', { authLoading: true })).estado).toBe('resolviendo')
    // Aunque ya hubiera perfil de una sesión anterior.
    expect(pantallaDeDashboard(entrada(CLIENTE, { authLoading: true })).estado).toBe('resolviendo')
  })

  it('8 · portal cerrado por flag → clásico, y es una DECISIÓN, no una espera', () => {
    const p = pantallaDeDashboard(entrada(CLIENTE_SIN_PORTAL))
    expect(p).toEqual({ estado: 'clasico' })
    expect(destinoTrasEntrar(CLIENTE_SIN_PORTAL, '')).toBeNull()
  })

  it('9 y 10 · suspendido o eliminado: `/api/usuarios/me` da 403 → `sin_perfil` → clásico', () => {
    // El navegador no decide esto: la cuenta ya no pasa el autorizador, así que
    // la petición falla y el perfil queda resuelto como «no hay». No se deja a
    // nadie mirando un spinner para siempre.
    expect(pantallaDeDashboard(entrada('sin_perfil'))).toEqual({ estado: 'clasico' })
  })

  it('un `portal` que no sea exactamente `true` no abre nada', () => {
    for (const raro of ['true', 1, {}, null, undefined]) {
      expect(destinoTrasEntrar({ rol: 'cliente', portal: raro }, '')).toBeNull()
    }
  })

  it('14 · no hay bucles: ningún destino es /dashboard', () => {
    const destinos = new Set<string>()
    for (const perfil of [CLIENTE, PUBLICADOR, ADMIN, SUPER_ADMIN, CLIENTE_SIN_PORTAL]) {
      const p = pantallaDeDashboard(entrada(perfil))
      if (p.estado === 'redirigir') destinos.add(p.destino)
    }
    expect([...destinos].sort()).toEqual(['/admin', '/portal'])
    expect(destinos.has('/dashboard' as never)).toBe(false)
  })

  it('la decisión es estable: repetirla no cambia el resultado', () => {
    // Si no lo fuera, `router.replace` podría dispararse en bucle.
    for (const perfil of [CLIENTE, ADMIN, CLIENTE_SIN_PORTAL, 'cargando', 'sin_perfil'] as EstadoDelPerfil[]) {
      const a = pantallaDeDashboard(entrada(perfil))
      const b = pantallaDeDashboard(entrada(perfil))
      expect(a).toEqual(b)
    }
  })
})

describe('11-13, 15-16 · los refrescos y las dos formas de entrar', () => {
  it('11 · refrescar /dashboard recorre el mismo camino, sin pasar por el panel antiguo', () => {
    // Al recargar, Firebase empieza en `authLoading` y el perfil en `cargando`:
    // los dos estados llevan a la pantalla mínima, nunca al clásico.
    expect(pantallaDeDashboard(entrada('cargando', { authLoading: true, hayUsuario: false })).estado)
      .toBe('resolviendo')
    expect(pantallaDeDashboard(entrada('cargando')).estado).toBe('resolviendo')
    expect(pantallaDeDashboard(entrada(CLIENTE)).estado).toBe('redirigir')
  })

  it('12 y 13 · /portal y /admin no pasan por esta decisión: tienen sus propios guardas', async () => {
    const raiz = process.cwd()
    const portal = readFileSync(join(raiz, 'src/app/portal/layout.tsx'), 'utf8')
    const admin = readFileSync(join(raiz, 'src/app/admin/layout.tsx'), 'utf8')

    // El portal sigue cerrándose por flag en el SERVIDOR. El redirect no
    // sustituye a la autorización.
    expect(portal).toMatch(/aperturaDelPortal\(await leerFlags\(\)\) === 'nadie'/)
    expect(portal).toMatch(/notFound\(\)/)
    // Y ninguno devuelve a /dashboard por su cuenta: no hay bucle posible.
    for (const f of [portal, admin]) {
      expect(f).not.toMatch(/router\.(replace|push)\(\s*['"]\/dashboard/)
      expect(f).not.toMatch(/redirect\(\s*['"]\/dashboard/)
    }
  })

  it('15 y 16 · Google y contraseña acaban en el mismo sitio', () => {
    // Las dos formas de entrar terminan en `onAuthStateChanged`, así que la
    // decisión es la misma: depende del perfil, no de cómo se entró.
    expect(destinoTrasEntrar(CLIENTE, '')).toBe('/portal')
    expect(destinoTrasEntrar(ADMIN, '')).toBe('/admin')
  })
})

describe('el panel antiguo es inalcanzable mientras se resuelve', () => {
  const fuente = readFileSync(join(process.cwd(), 'src/app/dashboard/page.tsx'), 'utf8')
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('la puerta de `resolviendo` y `redirigir` está ANTES que la del panel antiguo', () => {
    const puerta = sinComentarios.indexOf("pantalla.estado === 'resolviendo'")
    const antiguo = sinComentarios.indexOf('if (!isAdmin) return (')
    expect(puerta, 'falta la puerta de resolución').toBeGreaterThan(0)
    expect(antiguo, 'falta el panel antiguo').toBeGreaterThan(0)
    expect(puerta, 'el panel antiguo se monta antes de resolver').toBeLessThan(antiguo)
  })

  it('no se esconde con CSS: nada de display:none, opacity ni visibility sobre el panel', () => {
    for (const truco of [/display:\s*['"]?none/i, /opacity:\s*0/, /visibility:\s*['"]?hidden/i]) {
      expect(sinComentarios, `se está escondiendo con ${truco}`).not.toMatch(truco)
    }
  })

  it('la navegación sale de la MISMA función que decide qué se pinta', () => {
    // Si fueran dos reglas distintas podrían discrepar, que es como nació el
    // fallo. `router.replace` sólo se llama con lo que devuelve la decisión.
    expect(sinComentarios).toMatch(/const decision = pantallaDeDashboard\(/)
    expect(sinComentarios).toMatch(/router\.replace\(decision\.destino\)/)
    // Y no queda ningún destino escrito a mano.
    expect(sinComentarios).not.toMatch(/router\.(replace|push)\(\s*['"]\/portal['"]\s*\)/)
    expect(sinComentarios).not.toMatch(/router\.(replace|push)\(\s*['"]\/admin['"]\s*\)/)
  })

  it('cuando se navega NO se cargan datos del panel que nadie verá', () => {
    expect(sinComentarios).toMatch(/if \(decision\.estado === 'redirigir'\) \{\s*router\.replace\(decision\.destino\)\s*return/)
  })

  it('la pantalla mínima no trae nada del panel antiguo', () => {
    // Se ancla en los `return (`, no en la primera aparición del estado: desde
    // V-1.1.93 `'acceso'` también sale antes, al calcular si hay que desviar
    // a `/entrar`, y anclar ahí dejaba el trozo vacío — la prueba pasaba sin
    // mirar nada.
    const i = sinComentarios.indexOf("pantalla.estado === 'resolviendo'")
    const j = sinComentarios.lastIndexOf("pantalla.estado === 'acceso') return (")
    expect(i, 'no se encontró la puerta de resolución').toBeGreaterThan(0)
    expect(j, 'no se encontró la puerta de acceso').toBeGreaterThan(i)
    const minima = sinComentarios.slice(i, j)
    // Etapa 7: la pantalla mínima ya no se escribe aquí, es el componente único `PantallaDeEspera` (el mismo de los
    // marcos de destino). Se comprueba la puerta Y el componente, que es lo que realmente se pinta.
    expect(minima.length, 'el trozo de la pantalla mínima salió vacío').toBeGreaterThan(40)
    expect(minima).toContain('<PantallaDeEspera />')
    const espera = readFileSync(join(process.cwd(), 'src/components/acceso/PantallaDeEspera.tsx'), 'utf8')

    expect(espera).toContain('Vive Bien')
    for (const trozo of [
      'Portal de Cliente', 'Primeros pasos', 'QuieroPublicar', 'Metricas', 'MisFavoritos',
      'MisBusquedas', 'header', 'Cerrar Sesión', 'Mi perfil',
    ]) {
      expect(minima, `la pantalla mínima trae «${trozo}»`).not.toContain(trozo)
      expect(espera, `la pantalla de espera trae «${trozo}»`).not.toContain(trozo)
    }
  })
})
