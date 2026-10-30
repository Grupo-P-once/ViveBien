import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { destinoSeguro, rutaDeEntrada } from '../src/lib/pantalla/plegables'
import { destinoTrasEntrar, modoClasico, rutaTrasAutenticar } from '../src/lib/acceso/destino-dashboard'

/**
 * V-1.1.93 · tarea 03.07 — Las entradas al sistema convergen en `/entrar`.
 *
 * ─────────────────────────────────────────────────────────────
 * ANTES HABÍA TRES SITIOS DONDE ENTRAR
 *
 *   1. `/dashboard`   — la tarjeta con pestañas, correo/contraseña y Google
 *   2. `PortalShell`  — su propio botón de Google + enlace a /dashboard
 *   3. `AdminShell`   — íd.
 *
 * Tres copias del mismo flujo que podían divergir, y de hecho divergían: la
 * del portal y la del panel no ofrecían correo ni contraseña, y ninguna de las
 * tres tenía «¿olvidaste tu contraseña?».
 *
 * Ahora hay una: `/entrar?siguiente=…`. Estas pruebas vigilan que no vuelvan a
 * aparecer copias, y que el parámetro de vuelta no se pueda usar para mandar a
 * nadie fuera del sitio.
 * ─────────────────────────────────────────────────────────────
 */

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const DASHBOARD = 'src/app/dashboard/page.tsx'
const PORTAL = 'src/components/portal/PortalShell.tsx'
const ADMIN = 'src/components/admin/AdminShell.tsx'
const HEADER = 'src/components/Header.tsx'
const ENTRAR = 'src/components/acceso/Entrar.tsx'

describe('la pantalla de acceso es UNA', () => {
  it('sólo `/entrar` implementa el acceso con correo y contraseña', () => {
    const conAcceso = [DASHBOARD, PORTAL, ADMIN, HEADER, ENTRAR]
      .filter((f) => /signInWithEmailAndPassword|createUserWithEmailAndPassword/.test(sinComentarios(leer(f))))

    // El dashboard conserva la suya como ESCOTILLA (`?clasico=1`), a propósito.
    expect(conAcceso.sort()).toEqual([DASHBOARD, ENTRAR].sort())
  })

  it('el portal y el panel ya NO tienen su propio botón de Google', () => {
    for (const f of [PORTAL, ADMIN]) {
      const src = sinComentarios(leer(f))
      expect(src, `${f} sigue entrando por su cuenta`).not.toMatch(/useEntrarConGoogle/)
      expect(src).not.toMatch(/google\.entrar/)
    }
  })

  it('las dos carcasas llevan a `/entrar` conservando dónde estaban', () => {
    for (const f of [PORTAL, ADMIN]) {
      const src = sinComentarios(leer(f))
      expect(src).toMatch(/rutaDeEntrada\(ruta\)/)
      expect(src).toMatch(/usePathname\(\)/)
      // Y ya no mandan al panel viejo a entrar.
      expect(src).not.toMatch(/href="\/dashboard">Entrar/)
    }
  })

  it('el encabezado público manda a `/entrar` a quien no tiene sesión', () => {
    expect(sinComentarios(leer(HEADER))).toMatch(/href="\/entrar"/)
  })

  it('`/dashboard` desvía a `/entrar` sin montar el panel antiguo', () => {
    const src = sinComentarios(leer(DASHBOARD))
    expect(src).toMatch(/router\.replace\(rutaDeEntrada\(aqui\)\)/)
    // La pantalla mínima cubre también ese instante (D-45).
    expect(src).toMatch(/pantalla\.estado === 'acceso' && !clasico/)
  })
})

describe('la escotilla `?clasico=1` sigue entera', () => {
  it('no se desvía a `/entrar` cuando se pide el panel clásico', () => {
    const src = sinComentarios(leer(DASHBOARD))
    // El efecto que desvía se salta el modo clásico.
    expect(src).toMatch(/if \(modoClasico\(busqueda\)\) return/)
  })

  it('la regla de modo clásico no ha cambiado', () => {
    expect(modoClasico('?clasico=1')).toBe(true)
    expect(modoClasico('?clasico')).toBe(true)
    expect(modoClasico('')).toBe(false)
    expect(modoClasico('?otra=1')).toBe(false)
  })

  it('y se conserva al volver de `/entrar`', () => {
    // Quien pidió el panel clásico sin sesión vuelve ahí después de entrar.
    expect(rutaDeEntrada('/dashboard?clasico=1'))
      .toBe('/entrar?siguiente=%2Fdashboard%3Fclasico%3D1')
    expect(destinoSeguro('/dashboard?clasico=1')).toBe('/dashboard?clasico=1')
  })
})

describe('los destinos de siempre no se tocan', () => {
  it('cliente y publicador siguen yendo a /portal; admin y super admin a /admin', () => {
    expect(destinoTrasEntrar({ rol: 'cliente', portal: true }, '')).toBe('/portal')
    expect(destinoTrasEntrar({ rol: 'publicador', portal: true }, '')).toBe('/portal')
    expect(destinoTrasEntrar({ rol: 'admin' }, '')).toBe('/admin')
    expect(destinoTrasEntrar({ rol: 'admin', superAdmin: true }, '')).toBe('/admin')
  })

  it('sin `siguiente`, `/entrar` deja que el destino lo resuelva el rol', () => {
    /* `/entrar` manda a /dashboard, que resuelve por rol. Así no hay dos
       reglas de destino que puedan discrepar.

       Antes esto fijaba el literal `siguiente ?? '/dashboard'`. La regla vive
       ahora en `rutaTrasAutenticar()`, porque estaba escrita DOS veces en
       `Entrar.tsx` —el camino de correo y el de sesión— y podían separarse.
       Se comprueba la conducta, que es lo que importa, y que la pantalla no
       se invente un destino por rol. */
    expect(rutaTrasAutenticar(null)).toBe('/dashboard')
    expect(rutaTrasAutenticar('/portal/visitas')).toBe('/dashboard?siguiente=%2Fportal%2Fvisitas') // SESSION-SWITCH BUG: lo reparte /dashboard

    const fuente = sinComentarios(leer(ENTRAR))
    expect(fuente).toMatch(/router\.replace\(rutaTrasAutenticar\(siguiente\)\)/)
    expect(fuente).not.toMatch(/router\.replace\('\/(portal|admin)'\)/)
    expect(fuente).not.toContain('destinoTrasEntrar')
  })
})

describe('SEGURIDAD del parámetro `siguiente`', () => {
  it('no hay open redirect: sólo rutas de este sitio', () => {
    const fuera = [
      'https://otro.com', 'http://otro.com', '//otro.com', '///otro.com',
      '/\\otro.com', '\\\\otro.com', 'javascript:alert(1)', 'data:text/html,x',
      'otro.com', '', ' /portal', '/ /otro.com', '/portal\nSet-Cookie: x',
      '/portal\r\nLocation: http://otro.com',
    ]
    for (const malo of fuera) {
      expect(destinoSeguro(malo), `pasó «${malo}»`).toBeNull()
      expect(rutaDeEntrada(malo), `se escribió «${malo}» en la URL`).toBe('/entrar')
    }
  })

  it('un destino de otro sitio NO llega ni a la URL', () => {
    // Se valida ANTES de escribirlo, no después de leerlo.
    expect(rutaDeEntrada('https://otro.com/roban-tu-sesion')).toBe('/entrar')
    expect(rutaDeEntrada('https://otro.com')).not.toContain('otro.com')
  })

  it('el destino se codifica: un `?` o un `&` no parten la query', () => {
    expect(rutaDeEntrada('/propiedades?tipo=casa&zona=leon'))
      .toBe('/entrar?siguiente=%2Fpropiedades%3Ftipo%3Dcasa%26zona%3Dleon')
  })

  it('las rutas legítimas pasan enteras', () => {
    for (const buena of ['/portal', '/admin', '/portal/configuracion', '/dashboard?clasico=1']) {
      expect(destinoSeguro(buena)).toBe(buena)
      expect(rutaDeEntrada(buena)).toBe(`/entrar?siguiente=${encodeURIComponent(buena)}`)
    }
  })

  it('`/entrar` valida lo que recibe, no confía en la URL', () => {
    expect(sinComentarios(leer(ENTRAR))).toMatch(/destinoSeguro\(params\.get\('siguiente'\)\)/)
  })
})

describe('lo que `/entrar` tiene y las tres pantallas no tenían', () => {
  const src = sinComentarios(leer(ENTRAR))

  it('correo y contraseña', () => {
    expect(src).toMatch(/signInWithEmailAndPassword/)
    expect(src).toMatch(/createUserWithEmailAndPassword/)
  })

  it('Google, por el flujo de siempre', () => {
    // Se reutiliza `useEntrarConGoogle`, no se reimplementa el acceso.
    expect(src).toMatch(/useEntrarConGoogle\('entrar'\)/)
    expect(src).toMatch(/AvisoEntrada/)
    expect(src).not.toMatch(/signInWithPopup|signInWithRedirect/)
  })

  it('recuperar la contraseña (D-29.3), que antes no existía en ninguna', () => {
    expect(src).toMatch(/sendPasswordResetEmail/)
    for (const f of [PORTAL, ADMIN]) {
      expect(sinComentarios(leer(f))).not.toMatch(/sendPasswordResetEmail/)
    }
  })

  it('no se indexa: es una pantalla privada', () => {
    expect(leer('src/app/entrar/page.tsx')).toMatch(/robots:\s*\{\s*index:\s*false/)
  })
})
