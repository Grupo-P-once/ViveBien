import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aperturaDelPortal, portalAbiertoPara } from '../src/lib/portal/apertura'
import { FLAGS_APAGADOS } from '../src/lib/config/flags'

/**
 * R8.6 · el portal cerrado para quien publica.
 *
 * Hallazgo del Preview del paquete R8.5 (flag `portalCliente` apagado): el Publicador veía su lista SIN marco y con enlaces de
 * edición a `/portal/mis-propiedades/{id}/editar`, que con el portal cerrado dan 404. R8.6 no dibuja nunca esa pantalla suelta:
 * el marco del portal dice «no disponible» y el servidor cierra las escrituras (ver `publicador-seguridad.test.ts`).
 */
const raiz = join(__dirname, '..')
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8')

describe('R8.6 · quién entra al portal, por flag y por persona (la decisión que usan el marco y las APIs)', () => {
  const cerrado = { ...FLAGS_APAGADOS }
  const interno = { ...FLAGS_APAGADOS, portalClienteInterno: true }
  const abierto = { ...FLAGS_APAGADOS, portalCliente: true }
  const personas = {
    publicador: { rol: 'publicador' },
    asociado: { rol: 'publicador' },
    cliente: { rol: 'cliente' },
    admin: { rol: 'admin' },
    superAdmin: { rol: 'admin', superAdmin: true },
  }

  it('apertura: apagado → nadie; solo interno → interno; encendido → todos', () => {
    expect(aperturaDelPortal(cerrado)).toBe('nadie')
    expect(aperturaDelPortal(interno)).toBe('interno')
    expect(aperturaDelPortal(abierto)).toBe('todos')
  })

  it('con el portal apagado nadie entra; en etapa interna solo la casa; abierto, cualquiera (Publicador y Asociado incluidos)', () => {
    for (const [nombre, p] of Object.entries(personas)) {
      expect(portalAbiertoPara(cerrado, p), `apagado · ${nombre}`).toBe(false)
      expect(portalAbiertoPara(abierto, p), `abierto · ${nombre}`).toBe(true)
    }
    expect(portalAbiertoPara(interno, personas.publicador)).toBe(false)
    expect(portalAbiertoPara(interno, personas.asociado)).toBe(false)
    expect(portalAbiertoPara(interno, personas.cliente)).toBe(false)
    expect(portalAbiertoPara(interno, personas.admin)).toBe(true)
    expect(portalAbiertoPara(interno, personas.superAdmin)).toBe(true)
    expect(portalAbiertoPara(abierto, null)).toBe(false) // sin sesión no hay «persona»
  })
})

describe('R8.6 · el marco del Publicador nunca pinta la pantalla suelta', () => {
  const marco = leer('src/components/publicador/MarcoPorRol.tsx')
  const portal = leer('src/components/portal/PortalShell.tsx')
  const aviso = leer('src/components/portal/AvisoPortal.tsx')

  it('MarcoPorRol no tiene la rama «portal cerrado → <main>{children}</main>»', () => {
    expect(marco).not.toMatch(/<main>\s*\{children\}\s*<\/main>/)
    expect(marco).not.toMatch(/if \(!portalAbierto\) return/)
    // quien no es administración SIEMPRE está dentro del marco del portal
    expect(marco).toMatch(/return <PortalShell>\{children\}<\/PortalShell>/)
  })

  it('con el portal cerrado para esta persona no hay redirección (nadie es llevado a una ruta que da 404)', () => {
    expect(marco).toMatch(/marco === 'portal' && !portalAbierto\)\s*\?\s*null/)
  })

  it('el portal cerrado se dice DENTRO del marco: PortalShell pide el acceso al servidor y le pasa al aviso quién publica', () => {
    expect(portal).toMatch(/acceso\.status === 404\) \{ setEstado\('no-disponible'\)/)
    expect(portal).toMatch(/<AvisoPortal tipo=\{estado\} publica=\{perfil\?\.rol === 'publicador'\}/)
  })

  it('el aviso del que publica es claro, no ofrece acciones de escritura y solo enlaza a pantallas que existen', () => {
    const i = aviso.indexOf("tipo === 'no-disponible' && publica")
    expect(i).toBeGreaterThan(-1)
    const bloque = aviso.slice(i, aviso.indexOf('if (tipo === \'no-disponible\') {', i))
    expect(bloque).toContain('Tus propiedades no están disponibles todavía')
    expect(bloque).toContain('no se pueden crear ni editar propiedades')
    const enlaces = [...bloque.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(enlaces.sort()).toEqual(['/contacto', '/propiedades'])
    expect(bloque).not.toMatch(/Nueva propiedad|Editar|\/portal\/|\/publicador/)
  })
})

describe('R8.6 · las escrituras de propiedades del Publicador se cierran en el servidor', () => {
  for (const [ruta, metodo] of [
    ['src/app/api/publicador/propiedades/route.ts', 'POST'],
    ['src/app/api/admin/propiedades/[id]/route.ts', 'PATCH'],
    ['src/app/api/propiedades/[id]/estado/route.ts', 'POST'],
  ] as const) {
    it(`${metodo} ${ruta.replace('src/app/api', '/api').replace('/route.ts', '')} pregunta si el portal está cerrado ANTES de frenar o escribir`, () => {
      const f = leer(ruta)
      const desde = f.indexOf(`export async function ${metodo}`)
      expect(desde).toBeGreaterThan(-1)
      const cuerpo = f.slice(desde)
      const puerta = cuerpo.indexOf('portalCerradoParaEscribir(perfil)')
      expect(puerta).toBeGreaterThan(-1)
      expect(puerta).toBeLessThan(cuerpo.indexOf('frenarAsync'))
      expect(puerta).toBeLessThan(cuerpo.search(/\.insert\(|\.update\(|escribirTolerante|cambiarEstadoDePropiedad/))
    })
  }

  it('la puerta no deja pasar a nadie por un dato del cuerpo o de la URL y exime solo a la administración', () => {
    const f = leer('src/lib/portal/exigir-portal.ts')
    const i = f.indexOf('export async function portalCerradoParaEscribir')
    const fn = f.slice(i)
    expect(fn).toMatch(/puede\(perfil, 'panel\.admin'\)\) return null/)
    expect(fn).toMatch(/portalAbiertoPara\(await leerFlags\(\), perfil\)/)
    expect(fn).not.toMatch(/req\b|body|searchParams|headers/)
    expect(fn).toContain("codigo: 'portal_cerrado'")
    expect(fn).toContain('status: 403')
  })
})

describe('R8.6 · «Eliminar borrador» NO está en este candidato (decisión pendiente del propietario)', () => {
  it('no existe la ruta DELETE del publicador', () => {
    expect(existsSync(join(raiz, 'src/app/api/publicador/propiedades/[id]/route.ts'))).toBe(false)
    expect(readFileSync(join(raiz, 'src/app/api/publicador/propiedades/route.ts'), 'utf8')).not.toMatch(/export async function DELETE/)
  })

  it('la lista del publicador no ofrece ni confirma eliminar', () => {
    for (const f of ['src/components/portal/MisPropiedades.tsx', 'src/components/portal/TablaMisPropiedades.tsx']) {
      const t = leer(f)
      expect(t, f).not.toMatch(/Eliminar borrador|onEliminar|method: 'DELETE'/)
    }
  })
})
