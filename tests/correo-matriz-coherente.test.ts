import { describe, expect, it } from 'vitest'
import { BIBLIOTECA, catalogoCompleto, MATRIZ_DE_EVENTOS } from '../src/lib/correo/biblioteca'

/**
 * La matriz de eventos del panel de Marketing y el catálogo deben decir lo mismo: una plantilla que existe no puede figurar como «por crear», y las preferencias por omisión
 * deben reflejar la decisión vigente (avisos de alertas y de baja de precio activados por omisión SOLO en cuentas nuevas; las existentes conservan su elección).
 */
const ids = new Set(BIBLIOTECA.map((t) => t.id))

describe('matriz de eventos ↔ catálogo', () => {
  it('toda plantilla nombrada en la matriz existe en la biblioteca y ninguna que exista figura como «por crear»', () => {
    const nombradas = MATRIZ_DE_EVENTOS.map((e) => e.plantilla.split(/[\s(]/)[0]).filter((p) => ids.has(p))
    expect(nombradas.length).toBeGreaterThan(10)
    const porCrear = MATRIZ_DE_EVENTOS.filter((e) => /^por crear/.test(e.plantilla)).map((e) => e.evento)
    // Lo único que sigue «por crear» es lo que de verdad no tiene plantilla.
    expect(porCrear.sort()).toEqual([
      'Cambio de disponibilidad de una propiedad guardada', 'Campañas y promociones manuales', 'Inicio de sesión inusual',
      'Invitación aceptada / vencida / revocada', 'Pausa, vencimiento, reactivación o venta', 'Resumen opcional de búsqueda',
    ].sort())
    for (const e of MATRIZ_DE_EVENTOS.filter((x) => /^por crear/.test(x.plantilla))) expect(['no_existe'], e.evento).toContain(e.estado)
  })

  it('las preferencias por omisión dicen lo vigente: activadas en cuentas nuevas, las existentes conservan su elección, y nunca «apagada por defecto»', () => {
    const textos = MATRIZ_DE_EVENTOS.map((e) => e.preferencia).join(' | ')
    expect(textos).not.toMatch(/apagada por defecto/)
    for (const campo of ['correo_alertas', 'correo_precio']) {
      const fila = MATRIZ_DE_EVENTOS.find((e) => e.preferencia.startsWith(campo))
      expect(fila, campo).toBeTruthy()
      expect(fila!.preferencia).toMatch(/activada por omisión en cuentas nuevas/)
      expect(fila!.preferencia).toMatch(/ya existían conservan su elección/)
    }
  })

  it('el catálogo completo y la matriz comparten los mismos tipos con evento real que envían hoy', () => {
    const envianHoy = catalogoCompleto().filter((e) => e.existencia === 'envia_hoy').map((e) => e.id).sort()
    expect(envianHoy).toEqual(['alertas', 'aviso_lead', 'baja_de_precio', 'invitacion_equipo', 'legal'])
    const filasEnviaHoy = MATRIZ_DE_EVENTOS.filter((e) => e.estado === 'envia_hoy').length
    expect(filasEnviaHoy).toBeGreaterThanOrEqual(5)
  })

  it('marketing sigue bloqueado por el texto legal: ningún tipo promocional figura como «envia_hoy»', () => {
    expect(MATRIZ_DE_EVENTOS.filter((e) => e.categoria === 'marketing' && e.estado === 'envia_hoy')).toEqual([])
    expect(catalogoCompleto().filter((e) => e.categoria === 'marketing' && e.existencia === 'envia_hoy')).toEqual([])
  })
})
