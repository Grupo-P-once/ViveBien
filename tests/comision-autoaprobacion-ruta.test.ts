import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** El rol que se manda a la bitácora al confirmar lo decide el SERVIDOR (migración 52): solo el Super Admin puede confirmar la operación que él mismo registró. */
const ruta = readFileSync(path.join(__dirname, '..', 'src', 'app', 'api', 'admin', 'comision', 'operaciones', '[id]', 'route.ts'), 'utf8')

describe('ruta de seguimiento de operaciones — autoaprobación', () => {
  it('el rol de la bitácora sale de la sesión validada (perfil.superAdmin), nunca del cuerpo de la petición', () => {
    expect(ruta).toContain("actor_rol: perfil.superAdmin ? 'super_admin' : perfil.rol")
    // el cuerpo solo aporta accion, antes y motivo
    expect(ruta).toContain('{ accion?: unknown; antes?: unknown; motivo?: unknown }')
    expect(ruta).not.toMatch(/c\.(rol|actor_rol|super_admin|superAdmin)/)
  })
  it('para quien no es Super Admin el mensaje sigue siendo un 403 claro', () => {
    expect(ruta).toContain("codigo: 'autoaprobacion' }, { status: 403 }")
    expect(ruta).toContain('solo el Super Admin puede confirmar la suya')
  })
})
