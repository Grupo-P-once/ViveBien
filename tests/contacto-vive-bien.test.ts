import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CAMPOS_RESERVADOS, quitarCamposReservados } from '../src/lib/publicacion'
import { destinoAtencion } from '../src/lib/whatsapp'

/**
 * SEC-01 (V-1.1.77, D-02, ADR-0006): todo contacto público es de VIVE BIEN y
 * el publicador nunca recibe datos personales de un interesado.
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

describe('el contacto público es de VIVE BIEN', () => {
  it('ningún componente público usa el WhatsApp guardado en el anuncio', () => {
    const publicos = [
      'app/propiedades/[id]/page-client.tsx',
      'app/propiedades/page-client.tsx',
      'components/PropertyCard.tsx',
      'components/WAFloat.tsx',
    ]
    for (const p of publicos) {
      const codigo = leer(p)
      expect(codigo, p).not.toMatch(/\b(prop|p)\.whatsapp\b/)
      expect(codigo, p).not.toMatch(/\b(prop|p)\.telefono\b/)
    }
  })

  it('el asistente ya no pide el WhatsApp del anuncio', () => {
    expect(leer('app/publicador/propiedades/[id]/editar/page.tsx')).not.toMatch(/guardar\(\{\s*whatsapp/)
  })

  it('un publicador no puede escribir el teléfono ni el WhatsApp del anuncio', () => {
    expect(CAMPOS_RESERVADOS).toContain('whatsapp')
    expect(CAMPOS_RESERVADOS).toContain('telefono')
    const limpio = quitarCamposReservados({ titulo: 'Casa', whatsapp: '5215555555555', telefono: '5555555555' })
    expect(limpio).toEqual({ titulo: 'Casa' })
  })
})

describe('el publicador no recibe datos del interesado', () => {
  it('ya no existe ningún aviso al publicador', () => {
    const culpables = archivos(SRC)
      .filter((p) =>
        readFileSync(p, 'utf8')
          .split('\n')
          // Los comentarios que cuentan la historia no cuentan.
          .some((l) => /notificarPublicador|telefonoDelPublicador/.test(l) && !/^\s*(\/\/|\*)/.test(l)),
      )
      .map((p) => relative(SRC, p))
    expect(culpables).toEqual([])
  })

  it('el aviso por WhatsApp no consulta la cuenta del dueño', () => {
    const codigo = leer('lib/whatsapp.ts')
    expect(codigo).not.toMatch(/from\('usuarios'\)/)
    expect(codigo).not.toMatch(/owner/i)
  })

  it('el destino del aviso sale sólo de la configuración de VIVE BIEN', () => {
    expect(destinoAtencion({})).toBeNull()
    expect(destinoAtencion({ WHATSAPP_ATENCION: '' })).toBeNull()
    expect(destinoAtencion({ WHATSAPP_ATENCION: '123' })).toBeNull()
    expect(destinoAtencion({ WHATSAPP_ATENCION: '+52 477 000 0000' })).toBe('524770000000')
  })

  it('/api/contacto avisa a atención y no devuelve enlaces ni el estado del aviso', () => {
    const ruta = leer('app/api/contacto/route.ts')
    expect(ruta).toMatch(/notificarAtencion\(/)
    expect(ruta).toMatch(/avisarDeLead\(/)
    expect(ruta).not.toMatch(/whatsappRespaldo|enlaceRespaldo/)
    // La atribución interna se conserva: la fila sigue guardando el dueño.
    expect(ruta).toMatch(/owner_id: prop\.owner_id/)
  })

  it('un publicador sólo ve sus propias solicitudes como cliente', () => {
    // GET /api/contacto: quien no es admin filtra por su uid de cliente, nunca por owner_id.
    // V-1.1.82: con columnas explícitas y DTO de cliente (P3-02).
    const ruta = leer('app/api/contacto/route.ts')
    expect(ruta).toMatch(/\.eq\('cliente_uid', perfil\.uid\)/)
    expect(ruta).not.toMatch(/\.eq\('owner_id'/)
  })
})

describe('visitas: quién puede ser asesor (D-08, enmendada por ADR-0013)', () => {
  it('el equipo siempre; un publicador sólo con `recibir_citas`; un cliente nunca', async () => {
    const { atiendeCitas } = await import('../src/lib/acceso/capacidades')
    expect(atiendeCitas({ rol: 'admin' })).toBe(true)
    expect(atiendeCitas({ rol: 'publicador' })).toBe(false)
    expect(atiendeCitas({ rol: 'publicador', capacidades: { recibir_citas: false } })).toBe(false)
    expect(atiendeCitas({ rol: 'publicador', capacidades: { recibir_citas: true } })).toBe(true)
    expect(atiendeCitas({ rol: 'cliente', capacidades: { recibir_citas: true } })).toBe(false)
  })

  it('la propiedad agendable comprueba los permisos efectivos del dueño', () => {
    expect(leer('lib/citas/servicio.ts')).toMatch(/if \(!asesor \|\| !atiendeCitas\(asesor\)\) return falla\(409/)
  })
})
