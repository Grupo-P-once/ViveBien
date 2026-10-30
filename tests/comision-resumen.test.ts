import { describe, expect, it } from 'vitest'
import { etiquetaDeMes, fechaDeOperacion, historialDePropiedad, mesesHasta, resumenComisiones, type OperacionComision } from '../src/lib/comision-resumen'

let contador = 0
const op = (s: Partial<OperacionComision> = {}): OperacionComision => ({
  id: `op-${++contador}`, propiedad_id: 'p1', tipo: 'renta', base_centavos: 2_800_000, total_centavos: 2_800_000, vivebien_centavos: 2_800_000,
  colaborador_centavos: 0, colaborador_retenido_centavos: 0, reparto_estado: 'no_aplica', estado: 'registrada', creado_en: '2026-10-20T15:00:00.000Z',
  fecha_cierre: '2026-10-20', ...s,
})
const HOY = '2026-10-25'

describe('meses y fechas', () => {
  it('mesesHasta cuenta hacia atrás cruzando el año', () => {
    expect(mesesHasta('2026-02-10', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(mesesHasta('2026-10-25', 1)).toEqual(['2026-10'])
    expect(mesesHasta('basura', 3)).toEqual([])
  })
  it('etiquetas legibles', () => {
    expect(etiquetaDeMes('2026-10')).toBe('oct 26')
    expect(etiquetaDeMes('2026-01')).toBe('ene 26')
  })
  it('la fecha de una operación es la de cierre y, si falta, la de registro', () => {
    expect(fechaDeOperacion({ fecha_cierre: '2026-09-30', creado_en: '2026-10-20T10:00:00Z' })).toBe('2026-09-30')
    expect(fechaDeOperacion({ fecha_cierre: null, creado_en: '2026-10-20T10:00:00Z' })).toBe('2026-10-20')
  })
})

describe('resumenComisiones', () => {
  it('sin operaciones todo es cero y la serie trae los 12 meses', () => {
    const r = resumenComisiones([], { hoy: HOY })
    expect(r.kpis.comisionTotal).toBe(0)
    expect(r.kpis.cierreVsLista).toBeNull()
    expect(r.kpis.variacionMes).toBeNull()
    expect(r.serieMensual).toHaveLength(12)
    expect(r.serieMensual.at(-1)?.mes).toBe('2026-10')
    expect(r.topPropiedades).toEqual([])
  })

  it('separa cobrada, por cobrar y anulada; las anuladas no suman en ningún monto', () => {
    const r = resumenComisiones([
      op({ estado: 'confirmada', total_centavos: 1_000_000, vivebien_centavos: 1_000_000 }),
      op({ estado: 'registrada', total_centavos: 500_000, vivebien_centavos: 500_000 }),
      op({ estado: 'anulada', total_centavos: 9_999_999, vivebien_centavos: 9_999_999 }),
    ], { hoy: HOY })
    expect(r.kpis).toMatchObject({ comisionTotal: 1_500_000, cobrada: 1_000_000, porCobrar: 500_000, anulada: 9_999_999, operaciones: 2 })
    expect(r.porEstado.map((e) => [e.estado, e.n, e.total])).toEqual([['registrada', 1, 500_000], ['confirmada', 1, 1_000_000], ['anulada', 1, 9_999_999]])
    expect(r.serieMensual.at(-1)?.total).toBe(1_500_000)
  })

  it('ventas y rentas por mes, por tipo y ticket promedio', () => {
    const r = resumenComisiones([
      op({ tipo: 'venta', total_centavos: 17_500_000, vivebien_centavos: 17_500_000, fecha_cierre: '2026-09-15' }),
      op({ tipo: 'renta', total_centavos: 2_800_000, vivebien_centavos: 2_800_000, fecha_cierre: '2026-10-02' }),
      op({ tipo: 'renta', total_centavos: 1_200_000, vivebien_centavos: 1_200_000, fecha_cierre: '2026-10-10' }),
    ], { hoy: HOY })
    const sep = r.serieMensual.find((p) => p.mes === '2026-09')!
    const oct = r.serieMensual.find((p) => p.mes === '2026-10')!
    expect(sep).toMatchObject({ venta: 17_500_000, renta: 0, total: 17_500_000, n: 1 })
    expect(oct).toMatchObject({ venta: 0, renta: 4_000_000, total: 4_000_000, n: 2 })
    expect(r.porTipo).toEqual([{ tipo: 'venta', total: 17_500_000, n: 1 }, { tipo: 'renta', total: 4_000_000, n: 2 }])
    expect(r.kpis.ticketPromedio).toBe(Math.round(21_500_000 / 3))
    expect(r.kpis).toMatchObject({ ventas: 1, rentas: 2, mesActual: 4_000_000, mesAnterior: 17_500_000, variacionMes: -77 })
  })

  it('una operación fuera de los 12 meses cuenta en los totales pero no en la serie', () => {
    const r = resumenComisiones([op({ fecha_cierre: '2024-01-05', total_centavos: 700_000, vivebien_centavos: 700_000 })], { hoy: HOY })
    expect(r.kpis.comisionTotal).toBe(700_000)
    expect(r.serieMensual.reduce((s, p) => s + p.total, 0)).toBe(0)
  })

  it('el reparto separa lo de VIVE BIEN, lo liberable y lo retenido del agente', () => {
    const r = resumenComisiones([
      op({ estado: 'confirmada', total_centavos: 2_800_000, vivebien_centavos: 1_400_000, colaborador_centavos: 1_400_000, reparto_estado: 'liberable' }),
      op({ estado: 'registrada', total_centavos: 2_800_000, vivebien_centavos: 1_400_000, colaborador_retenido_centavos: 1_400_000, reparto_estado: 'retenido' }),
    ], { hoy: HOY })
    expect(r.reparto).toEqual({ viveBien: 2_800_000, agenteLiberable: 1_400_000, agenteRetenido: 1_400_000 })
    expect(r.kpis).toMatchObject({ netaCobrada: 1_400_000, netaPorCobrar: 1_400_000 })
    expect(r.reparto.viveBien + r.reparto.agenteLiberable + r.reparto.agenteRetenido).toBe(r.kpis.comisionTotal)
  })

  it('las más productivas se agrupan por propiedad y se ordenan por comisión', () => {
    const r = resumenComisiones([
      op({ propiedad_id: 'a', propiedad_folio: 'VB-1', propiedad_titulo: 'Casa A', total_centavos: 1_000_000, vivebien_centavos: 1_000_000 }),
      op({ propiedad_id: 'a', propiedad_folio: 'VB-1', propiedad_titulo: 'Casa A', total_centavos: 1_000_000, vivebien_centavos: 1_000_000, fecha_cierre: '2026-09-01' }),
      op({ propiedad_id: 'b', propiedad_folio: 'VB-2', propiedad_titulo: 'Nave B', total_centavos: 5_000_000, vivebien_centavos: 5_000_000 }),
    ], { hoy: HOY })
    expect(r.topPropiedades.map((p) => [p.folio, p.total, p.n])).toEqual([['VB-2', 5_000_000, 1], ['VB-1', 2_000_000, 2]])
  })

  it('cierre contra precio de lista, solo con las que traen precio de lista', () => {
    const r = resumenComisiones([
      op({ tipo: 'venta', base_centavos: 450_000_000, precio_lista_centavos: 500_000_000 }),
      op({ tipo: 'venta', base_centavos: 999_000_000 }),
    ], { hoy: HOY })
    expect(r.kpis.cierreVsLista).toBe(90)
  })

  it('ignora estados desconocidos y valores que no son números', () => {
    const r = resumenComisiones([op({ estado: 'rara' as never }), op({ total_centavos: 'x' as never, vivebien_centavos: undefined as never })], { hoy: HOY })
    expect(r.kpis.operaciones).toBe(1)
    expect(r.kpis.comisionTotal).toBe(0)
  })
})

describe('historialDePropiedad', () => {
  it('lista las operaciones de una propiedad, la más reciente primero, con lo cobrado y lo pendiente', () => {
    const ops = [
      op({ propiedad_id: 'p1', estado: 'confirmada', total_centavos: 100, fecha_cierre: '2026-01-10' }),
      op({ propiedad_id: 'p1', estado: 'registrada', total_centavos: 50, fecha_cierre: '2026-10-01' }),
      op({ propiedad_id: 'p1', estado: 'anulada', total_centavos: 999, fecha_cierre: '2026-05-01' }),
      op({ propiedad_id: 'otra', estado: 'confirmada', total_centavos: 7000 }),
    ]
    const h = historialDePropiedad(ops, 'p1')
    expect(h.operaciones.map((o) => o.fecha_cierre)).toEqual(['2026-10-01', '2026-05-01', '2026-01-10'])
    expect(h).toMatchObject({ cobrada: 100, porCobrar: 50, total: 150 })
    expect(historialDePropiedad(ops, 'nada')).toMatchObject({ operaciones: [], total: 0 })
  })
})

describe('flujo del dinero: entra, sale y queda', () => {
  const compartida = op({
    tipo: 'venta', total_centavos: 12_000_000, vivebien_centavos: 6_000_000, colaborador_centavos: 5_000_000, colaborador_retenido_centavos: 1_000_000,
    gastos: [{ concepto: 'Fotografía', monto_centavos: 400_000 }, { concepto: 'Publicidad', monto_centavos: 600_000 }], ajuste_motivo: 'Se negoció 4 % con el propietario',
  })
  it('entra la comisión total; sale el colaborador (liberable + retenida) y los gastos; queda el neto de VIVE BIEN', () => {
    const k = resumenComisiones([compartida], { hoy: HOY }).kpis
    expect(k.comisionTotal).toBe(12_000_000)
    expect(k.agenteLiberable + k.agenteRetenido).toBe(6_000_000)
    expect(k.gastos).toBe(1_000_000)
    expect(k.netoViveBien).toBe(5_000_000)
    expect(k.ajustadas).toBe(1)
    expect(k.agenteLiberable + k.agenteRetenido + k.gastos + k.netoViveBien).toBe(k.comisionTotal)
  })
  it('por mes: entra, sale y queda suman lo mismo que entra', () => {
    const oct = resumenComisiones([compartida, op({ total_centavos: 2_800_000, vivebien_centavos: 2_800_000 })], { hoy: HOY }).serieMensual.at(-1)!
    expect(oct.total).toBe(14_800_000)
    expect(oct.colaborador + oct.gastos + oct.neto).toBe(oct.total)
  })
  it('las operaciones anuladas no cuentan en gastos ni en neto', () => {
    const k = resumenComisiones([{ ...compartida, estado: 'anulada' }], { hoy: HOY }).kpis
    expect(k.gastos).toBe(0)
    expect(k.netoViveBien).toBe(0)
    expect(k.ajustadas).toBe(0)
  })
  it('las operaciones anteriores a la migración 47 (sin gastos ni campos nuevos) siguen sumando', () => {
    const k = resumenComisiones([op({ gastos: undefined }), op({ gastos: null }), op({ gastos: 'basura' as never })], { hoy: HOY }).kpis
    expect(k.gastos).toBe(0)
    expect(k.netoViveBien).toBe(8_400_000)
  })
})
