import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  destinoTrasEntrar,
  modoClasico,
  pantallaDeDashboard,
  rutaTrasAutenticar,
} from '@/lib/acceso/destino-dashboard'
import { destinoSeguro, rutaDeEntrada } from '@/lib/pantalla/plegables'

/**
 * `/entrar` tiene que ENTRAR, no sólo autenticar.
 *
 * ─────────────────────────────────────────────────────────────
 * EL FALLO (reportado el 30-sep-2026, en producción)
 *
 * «Continuar con Google» abría la ventana, Google autenticaba, Firebase creaba
 * la sesión… y la persona **se quedaba en el formulario de acceso**. Sin error
 * en pantalla y sin error en consola.
 *
 * Causa: `entrarConGoogle()` resuelve `{ estado: 'dentro' }` y
 * `useEntrarConGoogle` sólo tiene ramas para `redirigiendo`, `error`,
 * `navegador-incrustado` y `cancelado`. **Nadie navegaba en el caso de
 * éxito.** Correo y contraseña sí funcionaban porque `enviar()` hacía su
 * propio `router.replace`.
 *
 * Verificado en el commit DESPLEGADO (`3d91424`): un solo `router.replace`,
 * dentro de `enviar()`, y ningún `useAuth` en `Entrar.tsx`.
 *
 * POR QUÉ NO LO CAZÓ NADA (E-19)
 *
 * `scripts/verificar-acceso-google.mjs` tiene 9 casos: **todos contra
 * `/dashboard` o `/admin`, y todos de fallo**. Cero casos de éxito y cero
 * sobre `/entrar`. Y `acceso-google.test.ts` comprueba que el *hook* devuelve
 * `{estado:'dentro'}`, nunca que la *pantalla* navegue.
 * ─────────────────────────────────────────────────────────────
 */

const lee = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const entrar = sinComentarios(lee('src/components/acceso/Entrar.tsx'))

/* ══ 1 · QUIÉN CALCULA EL DESTINO ══════════════════════════════════════════
   Dos funciones, dos momentos, y ninguna duplica a la otra:

     `rutaTrasAutenticar(siguiente)`  — en cuanto hay sesión, sin perfil aún.
     `destinoTrasEntrar(perfil, q)`   — ya con el perfil, reparte por rol.

   `/entrar` usa la primera; `/dashboard` —el único que pide
   `/api/usuarios/me`— aplica la segunda. */

describe('1 · rutaTrasAutenticar — la regla de /entrar, en un solo sitio', () => {
  it('sin `siguiente`, entrega a /dashboard para que reparta', () => {
    expect(rutaTrasAutenticar(null)).toBe('/dashboard')
    expect(rutaTrasAutenticar(undefined)).toBe('/dashboard')
  })

  it('con `siguiente`, respeta el destino pedido salvo las áreas por rol (esas las reparte /dashboard por la sesión actual)', () => {
    // SESSION-SWITCH BUG: /portal/* y /admin/* ya NO se obedecen tal cual: viajan a /dashboard, que decide por el rol.
    expect(rutaTrasAutenticar('/portal/visitas')).toBe('/dashboard?siguiente=%2Fportal%2Fvisitas')
    expect(rutaTrasAutenticar('/propiedades/casa-1')).toBe('/propiedades/casa-1')
    expect(rutaTrasAutenticar('/dashboard?clasico=1')).toBe('/dashboard?clasico=1')
  })

  it('NO reparte por rol: ése es trabajo de destinoTrasEntrar', () => {
    // Si algún día devolviera '/portal' o '/admin' por su cuenta, habría dos
    // reglas de reparto que pueden discrepar. Es justo lo que se evita.
    expect(rutaTrasAutenticar(null)).not.toBe('/portal')
    expect(rutaTrasAutenticar(null)).not.toBe('/admin')
  })
})

/* ══ 2 · MATRIZ ROL → DESTINO ═════════════════════════════════════════════
   La aplica `destinoTrasEntrar`, desde `/dashboard`. `null` = se queda en el
   panel clásico. */

describe('2 · matriz rol → destino (destinoTrasEntrar)', () => {
  const PORTAL_ABIERTO = { portal: true }
  const PORTAL_CERRADO = { portal: false }

  it('CLIENTE con portalCliente=true → /portal', () => {
    expect(destinoTrasEntrar({ rol: 'cliente', ...PORTAL_ABIERTO }, '')).toBe('/portal')
  })

  it('CLIENTE con portalCliente=false → se queda (null)', () => {
    expect(destinoTrasEntrar({ rol: 'cliente', ...PORTAL_CERRADO }, '')).toBeNull()
  })

  it('PUBLICADOR conserva su destino: /portal con el portal abierto', () => {
    expect(destinoTrasEntrar({ rol: 'publicador', ...PORTAL_ABIERTO }, '')).toBe('/portal')
    expect(destinoTrasEntrar({ rol: 'publicador', ...PORTAL_CERRADO }, '')).toBeNull()
  })

  it('ADMIN → /admin, esté el portal como esté', () => {
    expect(destinoTrasEntrar({ rol: 'admin', ...PORTAL_ABIERTO }, '')).toBe('/admin')
    expect(destinoTrasEntrar({ rol: 'admin', ...PORTAL_CERRADO }, '')).toBe('/admin')
  })

  it('SUPER_ADMIN → /admin (llega como admin + superAdmin)', () => {
    /* `/api/usuarios/me` nunca emite `rol: 'super_admin'`: `resolverPerfil` lo
       traduce a `'admin' + superAdmin: true`. Se prueban las dos formas en que
       puede llegar un Super Admin. */
    expect(destinoTrasEntrar({ rol: 'admin', superAdmin: true, ...PORTAL_ABIERTO }, '')).toBe('/admin')
    expect(destinoTrasEntrar({ rol: 'admin', superAdmin: true, ...PORTAL_CERRADO }, '')).toBe('/admin')
    // Y aunque llegara sólo con la marca, sin rol.
    expect(destinoTrasEntrar({ superAdmin: true, ...PORTAL_CERRADO }, '')).toBe('/admin')
  })

  it('`rol: super_admin` NO se infiere: la API no lo produce', () => {
    // Recibirlo significaría que algo no es lo que dice ser.
    expect(destinoTrasEntrar({ rol: 'super_admin', ...PORTAL_CERRADO }, '')).toBeNull()
  })

  it('`portal` tiene que ser EXACTAMENTE true', () => {
    expect(destinoTrasEntrar({ rol: 'cliente', portal: 'true' }, '')).toBeNull()
    expect(destinoTrasEntrar({ rol: 'cliente', portal: 1 }, '')).toBeNull()
    expect(destinoTrasEntrar({ rol: 'cliente' }, '')).toBeNull()
  })

  it('sin perfil no se mueve nadie', () => {
    expect(destinoTrasEntrar(null, '')).toBeNull()
    expect(destinoTrasEntrar(undefined, '')).toBeNull()
  })
})

/* ══ 3 · LA ESCOTILLA `?clasico=1` ════════════════════════════════════════ */

describe('3 · ?clasico=1 conserva su comportamiento', () => {
  it('gana sobre el reparto por rol, para cualquiera', () => {
    for (const p of [
      { rol: 'cliente', portal: true },
      { rol: 'publicador', portal: true },
      { rol: 'admin', portal: true },
      { rol: 'admin', superAdmin: true, portal: true },
    ]) {
      expect(destinoTrasEntrar(p, '?clasico=1')).toBeNull()
    }
  })

  it('vale incluso antes de saber el rol', () => {
    const p = pantallaDeDashboard({
      authLoading: false, hayUsuario: true, perfil: 'cargando', busqueda: '?clasico=1',
    })
    expect(p).toEqual({ estado: 'clasico' })
  })

  it('sobrevive al viaje por /entrar sin perderse', () => {
    // `/dashboard?clasico=1` → /entrar → de vuelta, con la escotilla intacta.
    const ida = rutaDeEntrada('/dashboard?clasico=1')
    const siguiente = new URL(`https://x${ida}`).searchParams.get('siguiente')
    expect(destinoSeguro(siguiente)).toBe('/dashboard?clasico=1')
    const vuelta = rutaTrasAutenticar(destinoSeguro(siguiente))
    expect(vuelta).toBe('/dashboard?clasico=1')
    expect(modoClasico('?clasico=1')).toBe(true)
  })
})

/* ══ 4 · `?siguiente=` SÓLO ADMITE DESTINOS PERMITIDOS ════════════════════ */

describe('4 · ?siguiente= no abre un redirector', () => {
  it('acepta rutas de este sitio', () => {
    for (const r of ['/portal', '/portal/visitas', '/admin', '/dashboard?clasico=1']) {
      expect(destinoSeguro(r)).toBe(r)
    }
  })

  it('rechaza todo lo que lleve fuera', () => {
    for (const malo of [
      'https://otro.com', '//otro.com', '/\\otro.com', 'otro.com',
      ' /otro.com', '/ /otro.com', '/evil\nX', 'javascript:alert(1)',
    ]) {
      expect(destinoSeguro(malo)).toBeNull()
    }
  })

  it('un `siguiente` rechazado cae en /dashboard, no en el sitio ajeno', () => {
    // `destinoSeguro` devuelve null y `rutaTrasAutenticar` usa su reserva.
    expect(rutaTrasAutenticar(destinoSeguro('//otro.com'))).toBe('/dashboard')
    expect(rutaTrasAutenticar(destinoSeguro('https://otro.com'))).toBe('/dashboard')
  })
})

/* ══ 5 · EL EFECTO DE /entrar ═════════════════════════════════════════════ */

describe('5 · el efecto que navega al aparecer la sesión', () => {
  it('vigila la sesión de Firebase', () => {
    expect(entrar).toContain("from '@/lib/useAuth'")
    expect(entrar).toMatch(/useAuth\(\)/)
  })

  it('navega fuera de `enviar()`, no sólo desde el formulario', () => {
    const dentroDeEnviar = entrar.slice(entrar.indexOf('async function enviar'))
    const todos = entrar.match(/router\.replace\(/g) ?? []
    const enEnviar = dentroDeEnviar.match(/router\.replace\(/g) ?? []
    expect(todos.length).toBeGreaterThan(enEnviar.length)
  })

  it('una sesión previa también entra: no exige que sea nueva', () => {
    // La condición mira `isLoggedIn`, no «acaba de autenticarse».
    expect(entrar).toMatch(/if \(cargandoSesion \|\| !isLoggedIn \|\| yaNavegue\.current\) return/)
  })

  it('espera a que Firebase resuelva antes de decidir (E-18)', () => {
    // `isLoggedIn === false` el primer instante no significa «no hay sesión».
    expect(entrar).toMatch(/if \(cargandoSesion \|\|/)
  })

  it('una sesión que aparece tras el montaje navega EXACTAMENTE una vez', () => {
    /* Se comprueba la guarda y que el efecto dependa del estado de sesión:
       `onAuthStateChanged` puede emitir varias veces (renovación de token) y
       sin `yaNavegue` cada emisión dispararía otra navegación. */
    expect(entrar).toContain('const yaNavegue = useRef(false)')
    expect(entrar).toMatch(/yaNavegue\.current = true\s*\n\s*router\.replace/)
    expect(entrar).toMatch(/\}, \[cargandoSesion, isLoggedIn, router, siguiente\]\)/)
  })

  it('cancelar Google sin autenticar NO navega', () => {
    /* El efecto no mira el resultado del botón: sólo la sesión. Cancelar deja
       `isLoggedIn` en false, así que la guarda corta antes de navegar. Y el
       manejador de `cancelado` sólo pone un aviso. */
    const hook = sinComentarios(lee('src/components/acceso/EntrarConGoogle.tsx'))
    /* Sólo el cuerpo de `entrar()`: más abajo, `AvisoEntrada` lee
       `location.href` para enseñarlo y copiarlo — eso no navega. */
    const i = hook.indexOf('function entrar()')
    const cuerpo = hook.slice(i, hook.indexOf('return { entrar,', i))
    expect(cuerpo).toContain("r.estado === 'cancelado'")
    expect(cuerpo).not.toMatch(/router|location\.(href|assign|replace)/)
    // Y el hook no tiene router en absoluto: quien navega es la pantalla.
    expect(hook).not.toMatch(/\brouter\b/)
  })

  it('usa la función oficial y no reescribe la regla', () => {
    expect(entrar).toContain('rutaTrasAutenticar(siguiente)')
    // La regla ya no está copiada a mano en ningún sitio de este archivo.
    expect(entrar).not.toMatch(/siguiente \?\? '\/dashboard'/)
  })

  it('los DOS caminos (correo y sesión) usan la misma función', () => {
    const usos = entrar.match(/rutaTrasAutenticar\(siguiente\)/g) ?? []
    expect(usos.length).toBe(2)
  })

  it('no decide el rol en el navegador', () => {
    expect(entrar).not.toMatch(/rol === '(admin|super_admin)'/)
    expect(entrar).not.toContain('superAdmin')
    // Y no se salta a /portal ni a /admin por su cuenta.
    expect(entrar).not.toMatch(/router\.replace\('\/(portal|admin)'\)/)
  })
})

/* ══ 6 · NO HAY REDIRECCIÓN ACCIDENTAL NI BUCLE ═══════════════════════════ */

describe('6 · /entrar → /dashboard no sustituye la lógica oficial', () => {
  const dash = sinComentarios(lee('src/app/dashboard/page.tsx'))

  it('/dashboard sigue siendo quien aplica el reparto', () => {
    expect(dash).toContain('pantallaDeDashboard')
    expect(dash).toMatch(/router\.replace\(decision\.destino\)/)
  })

  it('/entrar NO calcula el destino por rol', () => {
    // Si importara `destinoTrasEntrar` tendría que pedir el perfil también
    // aquí: dos peticiones y dos sitios que pueden discrepar.
    expect(entrar).not.toContain('destinoTrasEntrar')
    expect(entrar).not.toContain('/api/usuarios/me')
  })

  it('bucle imposible: las dos guardas se excluyen', () => {
    /* `/dashboard` manda a `/entrar` SÓLO sin usuario (`if (authLoading ||
       user) return`); `/entrar` navega SÓLO con usuario. No pueden dispararse
       a la vez. */
    expect(dash).toMatch(/if \(authLoading \|\| user\) return/)
    expect(entrar).toMatch(/\|\| !isLoggedIn \|\|/)
  })

  it('mientras /dashboard resuelve, no pinta el panel equivocado (E-18)', () => {
    // `resolviendo` y `redirigir` comparten pantalla de carga; el clásico sólo
    // se pinta cuando la decisión ya está tomada.
    expect(dash).toMatch(/pantalla\.estado === 'resolviendo' \|\| pantalla\.estado === 'redirigir'/)
    const p = pantallaDeDashboard({
      authLoading: false, hayUsuario: true, perfil: 'cargando', busqueda: '',
    })
    expect(p).toEqual({ estado: 'resolviendo' })
  })

  it('`sin_perfil` es una decisión tomada, no una espera', () => {
    // 403 de cuenta suspendida, 503, red caída: panel clásico, no spinner eterno.
    const p = pantallaDeDashboard({
      authLoading: false, hayUsuario: true, perfil: 'sin_perfil', busqueda: '',
    })
    expect(p).toEqual({ estado: 'clasico' })
  })
})

/* ══ 7 · EL HUECO DEL INSTRUMENTO ═════════════════════════════════════════ */

describe('7 · lo que dejó pasar el fallo', () => {
  const script = lee('scripts/verificar-acceso-google.mjs')

  it('queda registrado que el verificador no cubre /entrar', () => {
    /* No exige arreglar el script —es tarea propia—, pero deja escrito el
       hueco para no volver a confundir «el verificador pasa» con «el acceso
       funciona». Si algún día cubre `/entrar`, esta prueba se cae y se
       actualiza el comentario. */
    const casos = script.match(/await caso\(/g) ?? []
    expect(casos.length).toBeGreaterThanOrEqual(9)
    expect(script).not.toMatch(/caso\([^)]*\/entrar/)
  })
})
