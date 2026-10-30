import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  aConsultaCliente, COLUMNAS_CONSULTA_CLIENTE, COLUMNAS_CONSULTA_INTERNAS, type FilaConsultaCliente,
} from '../src/lib/consultas'

/**
 * P3-02 (V-1.1.82): el cliente recibe sus consultas SIN nada interno.
 */
const ruta = readFileSync(join(__dirname, '..', 'src/app/api/contacto/route.ts'), 'utf8')

// Una fila como la de la base, con TODO lo interno relleno: nada de esto debe salir.
const FILA_COMPLETA = {
  id: 7,
  cliente_uid: 'uid-del-cliente',
  propiedad_id: 'p-nave',
  owner_id: 'uid-del-dueno',
  nombre: 'Nombre capturado',
  telefono: '4770000000',
  email: 'correo@ejemplo.com',
  mensaje: 'Me interesa',
  propiedad_titulo: 'Nave de prueba',
  tipo: 'visita',
  visita_preferida: 'sábado en la mañana',
  consentimiento_en: '2026-09-19T00:00:00Z',
  consentimiento_version: '2026-09-16',
  whatsapp_estado: 'fallido',
  whatsapp_id: 'wamid.X',
  whatsapp_error: 'HTTP 400',
  origen: 'web',
  creado_en: '2026-09-19T10:00:00Z',
}

describe('DTO de consultas para el cliente', () => {
  const dto = aConsultaCliente(FILA_COMPLETA as unknown as FilaConsultaCliente)

  it('lleva exactamente estos campos', () => {
    expect(dto).toEqual({
      id: 7, propiedadId: 'p-nave', propiedadTitulo: 'Nave de prueba', tipo: 'visita',
      visitaPreferida: 'sábado en la mañana', mensaje: 'Me interesa', creadoEn: '2026-09-19T10:00:00Z', estado: 'enviada',
    })
  })

  it('no filtra ningún valor interno aunque la fila lo traiga', () => {
    const texto = JSON.stringify(dto)
    for (const v of ['uid-del-dueno', 'uid-del-cliente', '4770000000', 'correo@ejemplo.com', 'wamid.X', 'HTTP 400', 'fallido', '2026-09-16', 'Nombre capturado']) {
      expect(texto, v).not.toContain(v)
    }
  })

  it('todas son «enviada»: no se inventa seguimiento', () => {
    expect(aConsultaCliente({ ...FILA_COMPLETA, tipo: 'otra cosa' } as unknown as FilaConsultaCliente)).toMatchObject({ tipo: 'informacion', estado: 'enviada' })
  })

  it('las columnas que se piden para el cliente no incluyen ninguna interna', () => {
    const columnas = COLUMNAS_CONSULTA_CLIENTE.split(',').map((c) => c.trim())
    for (const interna of COLUMNAS_CONSULTA_INTERNAS) expect(columnas, interna).not.toContain(interna)
  })
})

describe('GET /api/contacto', () => {
  it('ninguna consulta usa select(*)', () => {
    expect(ruta).not.toMatch(/\.select\(\s*['"`]\*['"`]/)
  })

  it('el cliente: sus filas, columnas de cliente y el DTO', () => {
    expect(ruta).toMatch(/\.select\(COLUMNAS_CONSULTA_CLIENTE\)\s*\.eq\('cliente_uid', perfil\.uid\)/)
    expect(ruta).toMatch(/\.map\(aConsultaCliente\)/)
  })

  it('sólo el equipo (leads.ver_todos) ve la lista de equipo', () => {
    expect(ruta).toMatch(/if \(puede\(perfil, 'leads\.ver_todos'\)\) \{\s*const \{ data, error \} = await db\.from\('solicitudes_contacto'\)\s*\.select\(COLUMNAS_CONSULTA_EQUIPO\)/)
  })

  it('pasa por exigir (sesión, suspensión y bitácora)', () => {
    expect(ruta).toMatch(/export async function GET\(req: Request\) \{\s*const auth = await exigir\(req, 'cuenta\.propia'\)/)
  })
})
