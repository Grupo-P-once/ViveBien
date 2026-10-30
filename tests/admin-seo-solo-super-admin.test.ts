import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { puede } from '../src/lib/acceso/permisos'

/**
 * SEC-9 · SEO es solo de Super Admin: (1) la regla de permisos, (2) TODAS las rutas de la API la exigen (la autoridad), (3) la sección de pantallas
 * lleva el mismo guardia de interfaz que Configuración y Contabilidad. Se vio en producción que un administrador común abría `/admin/seo` completo.
 */
const RAIZ = path.join(__dirname, '..', 'src')
const leer = (rel: string) => readFileSync(path.join(RAIZ, ...rel.split('/')), 'utf8')

describe('permiso seo.ver', () => {
  it('lo tiene el super admin y NO el administrador, el publicador ni el cliente', () => {
    expect(puede({ rol: 'admin', superAdmin: true }, 'seo.ver')).toBe(true)
    for (const rol of ['admin', 'publicador', 'cliente']) expect(puede({ rol, superAdmin: false }, 'seo.ver'), rol).toBe(false)
  })
})

describe('la API de SEO exige seo.ver en cada método', () => {
  const dir = path.join(RAIZ, 'app', 'api', 'admin', 'seo')
  const rutas = readdirSync(dir).map((d) => `app/api/admin/seo/${d}/route.ts`).filter((r) => existsSync(path.join(RAIZ, r)))
  it('hay rutas que revisar', () => { expect(rutas.length).toBeGreaterThanOrEqual(7) })
  it.each(rutas)('%s: cada método HTTP llama a exigir(req, «seo.ver»)', (r) => {
    const t = leer(r)
    const metodos = (t.match(/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g) ?? []).length
    const guardias = (t.match(/exigir\(\s*req\s*,\s*'seo\.ver'\s*\)/g) ?? []).length
    expect(metodos).toBeGreaterThan(0)
    expect(guardias).toBeGreaterThanOrEqual(metodos)
  })
})

describe('las pantallas de SEO tienen el guardia de interfaz', () => {
  it('existe app/admin/seo/layout.tsx, es de cliente, usa la sesión y avisa «sólo para Super Admin» cuando no lo es', () => {
    const t = leer('app/admin/seo/layout.tsx')
    expect(t).toMatch(/^'use client'/)
    expect(t).toMatch(/useSesion\(\)/)
    expect(t).toMatch(/!perfil\.superAdmin/)
    expect(t).toMatch(/sólo para Super Admin/)
    expect(t).toMatch(/children/)
  })
  it('el aviso es el mismo texto que usan Configuración y Contabilidad (coherencia)', () => {
    for (const p of ['app/admin/configuracion/page.tsx', 'app/admin/contabilidad/page.tsx']) expect(leer(p), p).toMatch(/sólo para Super Admin/)
  })
  it('todas las pantallas de la sección quedan DENTRO del layout (no hay otra raíz de /admin/seo)', () => {
    const pantallas = readdirSync(path.join(RAIZ, 'app', 'admin', 'seo'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    expect(pantallas.length).toBeGreaterThanOrEqual(7)
    for (const p of pantallas) expect(existsSync(path.join(RAIZ, 'app', 'admin', 'seo', p, 'layout.tsx')), `${p} no debe saltarse el layout con uno propio sin guardia`).toBe(false)
  })
})
