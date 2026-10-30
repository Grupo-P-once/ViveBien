import { describe, expect, it, beforeAll } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * V-1.1.81 — las listas del entorno YA NO DAN NADA.
 *
 * V-1.1.76 hizo que ADMIN_EMAILS exigiera correo verificado (SEC-00). V-1.1.81
 * va más allá: ni ADMIN_EMAILS ni SUPER_ADMIN_EMAILS deciden permisos. El rol
 * vive sólo en `usuarios.rol`.
 */
beforeAll(() => {
  // Aunque alguien las deje configuradas en Vercel, no deben servir de nada.
  process.env.ADMIN_EMAILS = 'admin@vivebienn.com, otro@gp-once.com'
  process.env.SUPER_ADMIN_EMAILS = 'jefe@vivebienn.com'
})

const SRC = join(__dirname, '..', 'src')
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return archivos(p)
    return /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

describe('las listas del entorno no deciden el rol', () => {
  it('estar en ADMIN_EMAILS con el correo verificado no da admin', async () => {
    const { resolverPerfil } = await import('../src/lib/auth-server')
    const p = resolverPerfil({ uid: 'u1', email: 'admin@vivebienn.com', emailVerified: true }, { rol: 'cliente' })
    expect(p).toMatchObject({ rol: 'cliente', superAdmin: false })
  })

  it('estar en SUPER_ADMIN_EMAILS no da super admin', async () => {
    const { resolverPerfil } = await import('../src/lib/auth-server')
    const p = resolverPerfil({ uid: 'u2', email: 'jefe@vivebienn.com', emailVerified: true }, null)
    expect(p).toMatchObject({ rol: 'cliente', superAdmin: false })
  })

  it('el rol sale de la tabla', async () => {
    const { resolverPerfil } = await import('../src/lib/auth-server')
    const u = { uid: 'u3', email: 'x@y.com', emailVerified: false }
    expect(resolverPerfil(u, { rol: 'super_admin' })).toMatchObject({ rol: 'admin', superAdmin: true })
    expect(resolverPerfil(u, { rol: 'admin' })).toMatchObject({ rol: 'admin', superAdmin: false })
    expect(resolverPerfil(u, { rol: 'publicador' })).toMatchObject({ rol: 'publicador', superAdmin: false })
    expect(resolverPerfil(u, { rol: 'root' })).toMatchObject({ rol: 'cliente', superAdmin: false })
  })

  it('sin fila (la base no respondió), cliente: se falla cerrado', async () => {
    const { resolverPerfil } = await import('../src/lib/auth-server')
    expect(resolverPerfil({ uid: 'u4', email: 'admin@vivebienn.com', emailVerified: true }, null))
      .toMatchObject({ rol: 'cliente', superAdmin: false })
  })

  it('ya no existen las funciones de lista', async () => {
    const mod = await import('../src/lib/auth-server') as Record<string, unknown>
    for (const f of ['isAdminEmail', 'esAdminDeLista', 'isSuperAdminEmail', 'enListaDelEntorno']) {
      expect(mod[f], f).toBeUndefined()
    }
  })

  it('ningún archivo del sitio lee ADMIN_EMAILS, SUPER_ADMIN_EMAILS ni NEXT_PUBLIC_ADMIN_EMAILS', () => {
    const culpables = archivos(SRC)
      .filter((p) => readFileSync(p, 'utf8').split('\n').some((l) =>
        /(ADMIN_EMAILS|SUPER_ADMIN_EMAILS)/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)))
      .map((p) => relative(SRC, p))
    expect(culpables).toEqual([])
  })
})
