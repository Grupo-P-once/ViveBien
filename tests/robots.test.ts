import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import robots from '../src/app/robots'
import { RUTAS_PRIVADAS } from '../src/lib/rutas-privadas'

/**
 * P3-06 (V-1.1.82): `robots.txt` bloquea las áreas privadas sin tocar lo público.
 */
const APP = join(__dirname, '..', 'src', 'app')

const regla = () => {
  const r = robots().rules
  return (Array.isArray(r) ? r[0] : r) as { disallow: string[]; allow: string }
}

const bloqueada = (ruta: string) => regla().disallow.some((d) => ruta === d || ruta.startsWith(d.endsWith('/') ? d : `${d}/`) || ruta.startsWith(`${d}?`))

describe('robots.txt', () => {
  it('bloquea todas las áreas privadas, portal y citas incluidos', () => {
    for (const r of ['/portal', '/portal/visitas', '/citas/accion', '/dashboard', '/mi-cuenta', '/admin/usuarios', '/publicador', '/api/salud', '/vista-previa/portal']) {
      expect(bloqueada(r), r).toBe(true)
    }
  })

  it('no bloquea ninguna página pública', () => {
    for (const r of ['/', '/propiedades', '/propiedades/tzula-castillos', '/valuador', '/contacto', '/nosotros', '/terminos', '/privacidad', '/comparar', '/sitemap.xml']) {
      expect(bloqueada(r), r).toBe(false)
    }
    expect(regla().allow).toBe('/')
  })

  it('sigue apuntando al sitemap', () => {
    expect(String(robots().sitemap)).toMatch(/\/sitemap\.xml$/)
  })

  it('cada área privada con página propia lleva además noindex', () => {
    const conNoindex = ['portal/layout.tsx', 'dashboard/layout.tsx', 'mi-cuenta/layout.tsx', 'admin/layout.tsx', 'publicador/layout.tsx']
    for (const f of conNoindex) {
      const p = join(APP, f)
      expect(existsSync(p), f).toBe(true)
      expect(readFileSync(p, 'utf8'), f).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/)
    }
    // Todas las privadas están en la lista que usa robots.
    for (const r of ['/portal', '/citas', '/dashboard', '/mi-cuenta', '/admin', '/publicador']) {
      expect(RUTAS_PRIVADAS as readonly string[]).toContain(r)
    }
  })
})
