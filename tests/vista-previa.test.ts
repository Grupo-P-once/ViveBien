import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vistaPreviaPermitida } from '../src/lib/vista-previa'
import { RUTAS_PRIVADAS } from '../src/lib/rutas-privadas'

/**
 * Fase 3a.8 (V-1.1.82): la vista previa de desarrollo existe sólo en local,
 * responde 404 en producción y no toca nada real.
 */
const SRC = join(__dirname, '..', 'src')
const leer = (p: string) => readFileSync(join(SRC, p), 'utf8')
const PAGINA = 'app/vista-previa/portal/page.tsx'
const VISTA = 'components/portal/VistaPreviaPortal.tsx'

describe('sólo en desarrollo local', () => {
  it('next dev en una máquina: sí', () => {
    expect(vistaPreviaPermitida({ NODE_ENV: 'development' })).toBe(true)
  })

  it('producción, pruebas o cualquier despliegue de Vercel: no', () => {
    expect(vistaPreviaPermitida({ NODE_ENV: 'production' })).toBe(false)
    expect(vistaPreviaPermitida({ NODE_ENV: 'test' })).toBe(false)
    expect(vistaPreviaPermitida({})).toBe(false)
    expect(vistaPreviaPermitida({ NODE_ENV: 'development', VERCEL: '1' })).toBe(false)
    expect(vistaPreviaPermitida({ NODE_ENV: 'development', VERCEL_ENV: 'preview' })).toBe(false)
  })

  it('la página se cierra con 404 antes de hacer nada, y no se indexa ni se rastrea', () => {
    const pagina = leer(PAGINA)
    expect(pagina).toMatch(/\{\s*if \(!vistaPreviaPermitida\(\)\) notFound\(\)/)
    expect(pagina).toMatch(/robots: \{ index: false, follow: false \}/)
    expect(RUTAS_PRIVADAS as readonly string[]).toContain('/vista-previa')
  })
})

describe('no toca nada real', () => {
  it('ni la página ni la vista piden datos: ni fetch, ni API, ni Supabase, ni Firebase', () => {
    for (const p of [PAGINA, VISTA]) {
      const codigo = leer(p)
      expect(codigo, p).not.toMatch(/fetch\(/)
      expect(codigo, p).not.toMatch(/['"`]\/api\//)
      expect(codigo, p).not.toMatch(/supabase/i)
      expect(codigo, p).not.toMatch(/from '@\/lib\/firebase'/)
      expect(codigo, p).not.toMatch(/registro-lead|api\/citas|api\/contacto|api\/favoritos/)
    }
  })

  it('los datos salen del archivo de prueba, no de la base', () => {
    expect(leer(PAGINA)).toMatch(/from '@\/lib\/portal\/datos-de-prueba'/)
  })

  it('la sesión no puede pedir nada y el resumen llega fijo', () => {
    const vista = leer(VISTA)
    expect(vista).toMatch(/pedirFijo=\{sinRed\}/)
    expect(vista).toMatch(/<ProveedorResumen fijo=\{resumen\}>/)
    const sinRed = vista.slice(vista.indexOf('const sinRed'), vista.indexOf('export default'))
    expect(sinRed).toMatch(/throw new ErrorDePeticion/)
  })

  it('con resumen fijo, el proveedor no pide ni recarga', () => {
    const proveedor = leer('components/portal/resumen.tsx')
    expect((proveedor.match(/if \(fijo\) return/g) ?? []).length).toBe(2)
  })

  it('los datos de prueba no contienen nada real (ni teléfonos ni correos de verdad)', () => {
    const datos = leer('lib/portal/datos-de-prueba.ts')
    expect(datos).not.toMatch(/@(gmail|vivebienn|gp-once|live)\./)
    expect(datos).not.toMatch(/\b\d{10}\b/)
    expect(datos).not.toMatch(/res\.cloudinary\.com/)
  })
})
