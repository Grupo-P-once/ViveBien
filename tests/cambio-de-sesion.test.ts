import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { destinoTrasEntrar, esAdministracion, rutaTrasAutenticar } from '../src/lib/acceso/destino-dashboard'

/**
 * SESSION-SWITCH BUG (P1). Cerré sesión de un cliente en /portal, entró un administrador y la aplicación
 * siguió mostrando el portal del cliente: `/entrar?siguiente=/portal` obedecía el destino previo sin mirar
 * QUIÉN acababa de entrar. El destino de las áreas por rol sale de la sesión ACTUAL (vía /dashboard), nunca de la URL.
 * (La regresión de navegación completa, en 4 anchos, está en tests-visual/sesion.e2e.ts.)
 */

describe('rutaTrasAutenticar: el destino por rol no sale de la URL previa', () => {
  it.each([
    '/portal', '/portal/', '/portal/visitas', '/portal?vista=guardadas', '/portal#x',
    '/admin', '/admin/', '/admin/usuarios', '/admin/usuarios?x=1', '/ADMIN/usuarios', '/Portal',
  ])('«%s» (área de un rol) se delega en /dashboard, llevando el destino', (s) => {
    expect(rutaTrasAutenticar(s)).toBe(`/dashboard?siguiente=${encodeURIComponent(s)}`)
  })

  it('sin destino: /dashboard', () => {
    expect(rutaTrasAutenticar(null)).toBe('/dashboard')
    expect(rutaTrasAutenticar(undefined)).toBe('/dashboard')
    expect(rutaTrasAutenticar('')).toBe('/dashboard')
  })

  it.each(['/propiedades/casa-1', '/ayuda', '/citas/accion?t=abc', '/dashboard?invitado=a%40b.co', '/portalito', '/administracion', '/'])(
    '«%s» no depende del rol: se respeta', (s) => {
      expect(rutaTrasAutenticar(s)).toBe(s)
    },
  )
})

describe('/dashboard reparte por el rol del SERVIDOR; `siguiente` solo cuenta dentro del área de ese rol', () => {
  const q = (s: string) => `?siguiente=${encodeURIComponent(s)}`
  const cliente = { rol: 'cliente', portal: true }
  const admin = { rol: 'admin', portal: true }
  const superAdmin = { rol: 'admin', superAdmin: true, portal: true }
  it('el administrador NUNCA va al portal, aunque venga de /portal', () => {
    for (const s of ['/portal', '/portal/visitas', '/portal?vista=x']) {
      expect(destinoTrasEntrar(admin, q(s))).toBe('/admin')
      expect(destinoTrasEntrar(superAdmin, q(s))).toBe('/admin')
    }
  })
  it('el cliente NUNCA va al panel, aunque venga de /admin', () => {
    for (const s of ['/admin', '/admin/usuarios']) expect(destinoTrasEntrar(cliente, q(s))).toBe('/portal')
  })
  it('conserva el regreso a una subpágina de SU área', () => {
    expect(destinoTrasEntrar(cliente, q('/portal/visitas'))).toBe('/portal/visitas')
    expect(destinoTrasEntrar(admin, q('/admin/usuarios'))).toBe('/admin/usuarios')
  })
  it('destinos hostiles o ajenos no se siguen: vuelve al área del rol', () => {
    const hostiles = ['//evil.com', '/' + String.fromCharCode(92) + 'evil.com', 'https://evil.com/portal', '/portal/../evil', '/ portal', '/portalx', '/portal' + String.fromCharCode(10) + '/x', '/admin/usuarios', '/portal/%2e%2e/admin', '/portal/%252e%252e/admin', '/portal/%2E%2E/x', '/portal%2f..%2fadmin', '/portal/%5cx']
    for (const s of hostiles) expect(destinoTrasEntrar(cliente, q(s))).toBe('/portal')
  })
  it('sin siguiente, igual que siempre', () => {
    expect(destinoTrasEntrar(admin, '')).toBe('/admin')
    expect(destinoTrasEntrar(cliente, '')).toBe('/portal')
    expect(destinoTrasEntrar({ rol: 'cliente', portal: false }, q('/portal/visitas'))).toBeNull()
  })
})

describe('esAdministracion: lo que dice el servidor', () => {
  it('admin y super admin sí; cliente, publicador y respuestas raras no', () => {
    expect(esAdministracion({ rol: 'admin' })).toBe(true)
    expect(esAdministracion({ rol: 'admin', superAdmin: true })).toBe(true)
    expect(esAdministracion({ rol: 'cliente', superAdmin: true })).toBe(true)
    expect(esAdministracion({ rol: 'cliente' })).toBe(false)
    expect(esAdministracion({ rol: 'publicador' })).toBe(false)
    expect(esAdministracion({ rol: 'super_admin' })).toBe(false) // /me nunca lo emite así
    expect(esAdministracion({})).toBe(false)
  })
})

describe('el cableado (Entrar y PortalShell)', () => {
  const leer = (r: string) => readFileSync(new URL(`../src/${r}`, import.meta.url), 'utf8')

  it('/entrar usa SIEMPRE rutaTrasAutenticar y no navega directo a `siguiente`', () => {
    const e = leer('components/acceso/Entrar.tsx')
    expect(e).toContain('router.replace(rutaTrasAutenticar(siguiente))')
    expect(e).not.toMatch(/router\.(replace|push)\(siguiente/)
  })

  it('PortalShell no pinta el portal a una sesión de administración: redirige a /admin antes de mostrar nada', () => {
    const p = leer('components/portal/PortalShell.tsx')
    const i = p.indexOf('esAdministracion(p)')
    expect(i).toBeGreaterThan(-1)
    expect(p.indexOf("router.replace('/admin')", i)).toBeGreaterThan(i)
    // y esa decisión va ANTES de guardar el perfil que desbloquea la pantalla
    expect(p.indexOf('setPerfil({', i)).toBeGreaterThan(p.indexOf("router.replace('/admin')", i))
  })

  it('al entrar se borra el correo escrito de sessionStorage (no queda para la persona siguiente)', () => {
    expect(leer('components/acceso/Entrar.tsx')).toMatch(/sessionStorage\.removeItem\(CLAVE_ESTADO\)/)
  })
})

describe('respuestas atrasadas de /api/usuarios/me (cambio de cuenta)', () => {
  const leer = (r: string) => readFileSync(new URL(`../src/${r}`, import.meta.url), 'utf8')
  it.each(['components/portal/PortalShell.tsx', 'components/admin/AdminShell.tsx'])('%s descarta lo que llega de una sesión que ya no es la vigente', (f) => {
    const s = leer(f)
    expect(s).toContain('const vigente = () => auth.currentUser?.uid === u.uid')
    // se comprueba DESPUÉS de cada await y ANTES de guardar o navegar
    expect((s.match(/if \(!vigente\(\)\) return/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
  it('/dashboard también', () => {
    expect(leer('app/dashboard/page.tsx')).toContain('if (auth.currentUser?.uid !== u.uid) return')
  })
})
