import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { puede, type Permiso } from '../src/lib/acceso/permisos'
import { camposProtegidosEn, CAMPOS_PROTEGIDOS_AUDITADOS, CAMPOS_RESERVADOS } from '../src/lib/publicacion'

/**
 * Fase 2b (V-1.1.80): las comprobaciones sueltas de rol pasan al catálogo.
 * Lo que se prueba aquí es que NADIE gana ni pierde acceso con el cambio.
 */
const SRC = join(__dirname, '..', 'src')
const leer = (p: string) => readFileSync(join(SRC, p), 'utf8')

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return archivos(p)
    return /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

// Los cuatro papeles como los ve el servidor (el Super Admin tiene rol 'admin').
const PERFILES = [
  { nombre: 'cliente', rol: 'cliente', superAdmin: false },
  { nombre: 'publicador', rol: 'publicador', superAdmin: false },
  { nombre: 'admin', rol: 'admin', superAdmin: false },
  { nombre: 'super admin', rol: 'admin', superAdmin: true },
] as const

describe('equivalencia: el mismo acceso que antes del cambio', () => {
  it("lo que antes era `perfil.rol === 'admin'` sigue siendo exactamente admin y super admin", () => {
    const antesAdmin: Permiso[] = ['propiedad.gestionar_todas', 'propiedad.moderar', 'leads.ver_todos', 'citas.ver_todas', 'panel.admin']
    for (const p of PERFILES) {
      for (const permiso of antesAdmin) {
        expect(puede(p, permiso), `${p.nombre} · ${permiso}`).toBe(p.rol === 'admin')
      }
    }
  })

  it("requireRole(['publicador','admin']) ≡ exigir('propiedad.gestionar_propias')", () => {
    for (const p of PERFILES) {
      expect(puede(p, 'propiedad.gestionar_propias'), p.nombre).toBe((['publicador', 'admin'] as string[]).includes(p.rol))
    }
  })

  it("requireRole(['cliente','publicador','admin']) ≡ exigir('cuenta.propia')", () => {
    for (const p of PERFILES) {
      expect(puede(p, 'cuenta.propia'), p.nombre).toBe((['cliente', 'publicador', 'admin'] as string[]).includes(p.rol))
    }
  })
})

describe('ya no hay comprobaciones de rol sueltas en el servidor', () => {
  // Lo único permitido, con su porqué:
  //  · usuarios/me: «un admin no se degrada al guardar su perfil» es sobre el
  //    rol mismo, no un permiso.
  const PERMITIDAS = ['app/api/usuarios/me/route.ts']

  it("ninguna ruta usa requireRole ni compara perfil.rol con 'admin'", () => {
    const servidor = [...archivos(join(SRC, 'app/api')), ...archivos(join(SRC, 'lib'))]
    const culpables = servidor
      .map((p) => relative(SRC, p).replace(/\\/g, '/'))
      .filter((r) => !PERMITIDAS.includes(r) && r !== 'lib/auth-server.ts')
      .filter((r) => leer(r).split('\n').some((l) =>
        !/^\s*(\/\/|\*)/.test(l) && (/requireRole\(req/.test(l) || /\bperfil\.rol\s*(===|!==)\s*'admin'/.test(l))))
    expect(culpables).toEqual([])
  })

  it('las tres pantallas que reflejan permisos usan el mismo catálogo', () => {
    expect(leer('components/admin/AdminShell.tsx')).toMatch(/puede\([^)]*'panel\.admin'\)/)
    expect(leer('app/publicador/propiedades/[id]/editar/page.tsx')).toMatch(/puede\([\s\S]*?'propiedad\.moderar'\)/)
    const barra = leer('components/portal/BarraLateralPortal.tsx')
    expect(barra).toMatch(/'propiedad\.gestionar_propias'/)
    expect(barra).toMatch(/'panel\.admin'/)
  })
})

describe('bitácora de intentos sobre lo ajeno y lo protegido (02.03, §60.4)', () => {
  it('detecta los campos protegidos que llegan en el cuerpo', () => {
    expect(camposProtegidosEn({ titulo: 'Casa', precio: 1 })).toEqual([])
    expect(camposProtegidosEn({ titulo: 'Casa', owner_id: 'otro', estado_pub: 'publicada' })).toEqual(['owner_id', 'estado_pub'])
  })

  it('todo campo auditado es además reservado (se ignora al guardar)', () => {
    for (const c of CAMPOS_PROTEGIDOS_AUDITADOS) expect(CAMPOS_RESERVADOS, c).toContain(c)
  })

  it('editar o cambiar el estado de una propiedad ajena queda registrado', () => {
    for (const r of ['app/api/admin/propiedades/[id]/route.ts', 'app/api/propiedades/[id]/estado/route.ts']) {
      expect(leer(r), r).toMatch(/registrarIntentoDenegado\([^)]*`propiedad\.ajena:/)
    }
  })

  it('mandar campos protegidos sin poder moderar queda registrado', () => {
    for (const r of ['app/api/admin/propiedades/[id]/route.ts', 'app/api/publicador/propiedades/route.ts']) {
      expect(leer(r), r).toMatch(/camposProtegidosEn\(/)
      expect(leer(r), r).toMatch(/registrarIntentoDenegado\([^)]*`propiedad\.campos:/)
    }
  })
})
