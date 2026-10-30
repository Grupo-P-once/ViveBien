import { describe, expect, it } from 'vitest'
import { prepararCambioDeColaborador, prepararCambioDeExterna, prepararColaborador, prepararConstancia, prepararExterna, RUTA_DE_ADJUNTO } from '@/lib/contabilidad-externas'

const HOY = '2026-10-26'
const UUID = '4c68eb9b-7cba-4590-a629-1d6e45c520ce'
const RUTA = '2026/4c68eb9b-7cba-4590-a629-1d6e45c520ce.pdf'

describe('prepararColaborador (la acreditación es OPCIONAL)', () => {
  it('con solo tipo y nombre alcanza: nada más es obligatorio', () => {
    const r = prepararColaborador({ tipo: 'agente', nombre: '  Ana   Pérez ' }, 'super@vb.mx')
    expect(r).toEqual({ ok: true, datos: { tipo: 'agente', nombre: 'Ana Pérez', creado_por: 'super@vb.mx' } })
  })
  it('acepta empresa, teléfono, correo, municipio y el folio (opcional)', () => {
    const r = prepararColaborador({ tipo: 'inmobiliaria', nombre: 'Bajío Bienes Raíces', telefono: '477 123 4567', correo: 'contacto@bajio.mx', municipio: 'León', folio_acreditacion: 'GTO-2026-77', notas: 'Buena comunicación' }, 'x@vb.mx')
    expect(r.ok && r.datos).toMatchObject({ telefono: '477 123 4567', correo: 'contacto@bajio.mx', folio_acreditacion: 'GTO-2026-77' })
  })
  it('rechaza tipo inválido, nombre corto o con correo/teléfono largo, correo y teléfono mal formados', () => {
    for (const c of [{ tipo: 'otro_tipo' }, { nombre: 'x' }, { nombre: 'Ana ana@correo.mx' }, { nombre: 'Tel 4771234567' }, { correo: 'no-es-correo' }, { telefono: 'abc' }, { empresa: 'Mi empresa @ya' }]) {
      expect(prepararColaborador({ tipo: 'agente', nombre: 'Ana Pérez', ...c }, 'x@vb.mx'), JSON.stringify(c)).toMatchObject({ ok: false, status: 400 })
    }
  })
  it('el cambio es parcial: solo lo que viene; vacío no hace nada; desactivar es un booleano', () => {
    expect(prepararCambioDeColaborador({ folio_acreditacion: 'GTO-1' })).toEqual({ ok: true, datos: { folio_acreditacion: 'GTO-1' } })
    expect(prepararCambioDeColaborador({ telefono: '' })).toEqual({ ok: true, datos: { telefono: null } }) // vaciar un dato
    expect(prepararCambioDeColaborador({ activo: false })).toEqual({ ok: true, datos: { activo: false } })
    expect(prepararCambioDeColaborador({})).toMatchObject({ ok: false })
    expect(prepararCambioDeColaborador({ activo: 'si' })).toMatchObject({ ok: false })
  })
})

describe('prepararExterna (comisión que no viene de una propiedad del sitio)', () => {
  const base = { fecha: '2026-10-20', descripcion: 'Cliente buscaba casa en Cañada, 3 recámaras', tipo: 'renta', parte_pesos: '10000', clave_idempotencia: 'ext-clave-0001' }
  it('lo mínimo: qué fue, de qué tipo, fecha y cuánto le tocó a VIVE BIEN (por cobrar)', () => {
    const r = prepararExterna(base, 'super@vb.mx', HOY)
    expect(r).toEqual({ ok: true, datos: { fecha: '2026-10-20', descripcion: 'Cliente buscaba casa en Cañada, 3 recámaras', tipo: 'renta', parte_centavos: 1_000_000, clave_idempotencia: 'ext-clave-0001', creado_por: 'super@vb.mx' } })
  })
  it('con total, porcentaje, con quién se compartió y ya cobrada (algo rápido)', () => {
    const r = prepararExterna({ ...base, total_pesos: '20000', porcentaje: '50 %', colaborador_id: UUID, contraparte: 'Inmobiliaria Del Bajío', cobrada: true, cobrada_en: '2026-10-22', metodo_cobro: 'efectivo', referencia: 'Recibo 118', adjunto: RUTA }, 'x@vb.mx', HOY)
    expect(r.ok && r.datos).toMatchObject({ total_centavos: 2_000_000, porcentaje_bp: 5000, colaborador_id: UUID, contraparte: 'Inmobiliaria Del Bajío', cobrada: true, cobrada_en: '2026-10-22', metodo_cobro: 'efectivo', referencia: 'Recibo 118', adjunto: RUTA })
  })
  it('rechaza fechas futuras, parte en cero o mayor que el total, datos personales, cobro sin método y archivos inventados', () => {
    for (const c of [{ fecha: '2999-01-01' }, { fecha: '2026-02-30' }, { parte_pesos: '0' }, { parte_pesos: 'abc' }, { total_pesos: '5000' }, { porcentaje: '150' }, { descripcion: 'Cliente ana@correo.mx quería casa' }, { descripcion: 'Tel 4771234567 casa' }, { descripcion: 'x' }, { tipo: 'regalo' }, { contraparte: 'Ana 4771234567' }, { colaborador_id: 'no-uuid' }, { referencia: 'ana@correo.mx' }, { clave_idempotencia: 'corta' }, { adjunto: '../../etc/passwd' }, { adjunto: 'https://malo.example/archivo.pdf' },
      { cobrada: true, cobrada_en: '2026-10-22' }, { cobrada: true, metodo_cobro: 'efectivo' }, { cobrada: true, cobrada_en: '2026-10-01', metodo_cobro: 'efectivo' }, { cobrada: true, cobrada_en: '2999-01-01', metodo_cobro: 'efectivo' }]) {
      expect(prepararExterna({ ...base, ...c }, 'x@vb.mx', HOY), JSON.stringify(c)).toMatchObject({ ok: false, status: 400 })
    }
  })
})

describe('prepararCambioDeExterna', () => {
  it('cobrar: fecha, método, referencia y comprobante opcionales', () => {
    const r = prepararCambioDeExterna({ accion: 'cobrar', antes: 'por_cobrar', cobrada_en: '2026-10-25', metodo_cobro: 'transferencia', referencia: 'SPEI 998877', adjunto: RUTA }, HOY)
    expect(r).toEqual({ ok: true, datos: { antes: 'por_cobrar', nuevo: 'cobrada', datos: { cobrada_en: '2026-10-25', metodo_cobro: 'transferencia', referencia: 'SPEI 998877', adjunto: RUTA } } })
  })
  it('anular pide motivo; ya cobrada no se cobra otra vez; sin el estado que se ve no hay cambio', () => {
    expect(prepararCambioDeExterna({ accion: 'anular', antes: 'cobrada', motivo: 'Se capturó dos veces la misma comisión' }, HOY)).toMatchObject({ ok: true })
    expect(prepararCambioDeExterna({ accion: 'anular', antes: 'cobrada', motivo: 'corto' }, HOY)).toMatchObject({ ok: false })
    expect(prepararCambioDeExterna({ accion: 'cobrar', antes: 'cobrada', cobrada_en: '2026-10-25', metodo_cobro: 'efectivo' }, HOY)).toMatchObject({ ok: false })
    expect(prepararCambioDeExterna({ accion: 'cobrar', cobrada_en: '2026-10-25', metodo_cobro: 'efectivo' }, HOY)).toMatchObject({ ok: false })
    expect(prepararCambioDeExterna({ accion: 'cobrar', antes: 'por_cobrar', cobrada_en: '2999-01-01', metodo_cobro: 'efectivo' }, HOY)).toMatchObject({ ok: false })
    expect(prepararCambioDeExterna({ accion: 'borrar', antes: 'por_cobrar' }, HOY)).toMatchObject({ ok: false })
  })
})

describe('prepararConstancia', () => {
  it('lo mínimo: el pago, a quién y cómo; el comprobante es opcional', () => {
    expect(prepararConstancia({ movimiento_id: UUID, colaborador_nombre: 'Ana Pérez', metodo: 'efectivo' }, 'super@vb.mx')).toEqual({ ok: true, datos: { movimiento_id: UUID, colaborador_nombre: 'Ana Pérez', metodo: 'efectivo', creado_por: 'super@vb.mx' } })
    const t = prepararConstancia({ movimiento_id: UUID, colaborador_id: UUID, colaborador_nombre: 'Ana Pérez', metodo: 'transferencia', referencia: 'SPEI 1', comprobante: RUTA, descripcion: 'la renta de la bodega' }, 'x@vb.mx')
    expect(t.ok && t.datos).toMatchObject({ referencia: 'SPEI 1', comprobante: RUTA, descripcion: 'la renta de la bodega' })
  })
  it('rechaza lo mal formado', () => {
    for (const c of [{ movimiento_id: 'x' }, { colaborador_nombre: 'A' }, { colaborador_nombre: 'Ana ana@correo.mx' }, { metodo: 'cheque' }, { referencia: 'a@b.mx' }, { comprobante: 'otra/cosa.pdf' }, { colaborador_id: 'no' }]) {
      expect(prepararConstancia({ movimiento_id: UUID, colaborador_nombre: 'Ana Pérez', metodo: 'efectivo', ...c }, 'x@vb.mx'), JSON.stringify(c)).toMatchObject({ ok: false })
    }
  })
})

describe('ruta de adjunto', () => {
  it('solo AAAA/uuid.ext de los tipos permitidos', () => {
    expect(RUTA_DE_ADJUNTO.test(RUTA)).toBe(true)
    for (const mala of ['', '2026/x.pdf', '../2026/4c68eb9b-7cba-4590-a629-1d6e45c520ce.pdf', '2026/4c68eb9b-7cba-4590-a629-1d6e45c520ce.exe', '2026/4c68eb9b-7cba-4590-a629-1d6e45c520ce.pdf/../x', 'https://a.b/2026/4c68eb9b-7cba-4590-a629-1d6e45c520ce.pdf']) expect(RUTA_DE_ADJUNTO.test(mala), mala).toBe(false)
  })
})
