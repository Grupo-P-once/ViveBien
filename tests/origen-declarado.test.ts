import { describe, expect, it } from 'vitest'
import { COMO_FUNCIONA, origenListo, resumenEconomico, sanearOrigenDeclarado } from '../src/lib/origen-declarado'
import { REGLA_BORRADOR_2026_10_24, type ReglaComision } from '../src/lib/comision-calculo'

describe('sanearOrigenDeclarado', () => {
  it('sin opción no hay nada que guardar', () => {
    const r = sanearOrigenDeclarado({})
    expect(r.ok).toBe(false)
    expect(sanearOrigenDeclarado(null).ok).toBe(false)
    expect(sanearOrigenDeclarado({ opcion: 'otra' }).ok).toBe(false)
  })
  const DUENO = { nombre_completo: 'Luis Gómez Ramírez', telefono: '477 811 6501', correo: 'luis@correo.mx' }
  it('trato directo exige la declaración de autorización y los datos del propietario (nada preseleccionado)', () => {
    expect(sanearOrigenDeclarado({ opcion: 'trato_directo' }).ok).toBe(false)
    expect(sanearOrigenDeclarado({ opcion: 'trato_directo', ...DUENO }).ok).toBe(false)
    expect(sanearOrigenDeclarado({ opcion: 'trato_directo', declara_autorizacion: 'true', ...DUENO }).ok).toBe(false)
    const r = sanearOrigenDeclarado({ opcion: 'trato_directo', declara_autorizacion: true, ...DUENO, agente_nombre: 'No debe entrar', folio: 'ABC-123' })
    expect(r).toEqual({ ok: true, datos: { origen_tipo: 'trato_directo', declara_autorizacion: true, titular_nombre: 'Luis Gómez Ramírez', titular_empresa: null, titular_telefono: '477 811 6501', titular_correo: 'luis@correo.mx', acreditacion_folio: null, acreditacion_municipio: null } })
  })
  it('trato directo: nombre completo (dos palabras), teléfono y correo válidos, cada uno obligatorio', () => {
    const ok = { opcion: 'trato_directo', declara_autorizacion: true, ...DUENO }
    expect(sanearOrigenDeclarado({ ...ok, nombre_completo: 'Luis' }).ok).toBe(false)
    expect(sanearOrigenDeclarado({ ...ok, nombre_completo: '' }).ok).toBe(false)
    expect(sanearOrigenDeclarado({ ...ok, telefono: 'abc' }).ok).toBe(false)
    expect(sanearOrigenDeclarado({ ...ok, telefono: '' }).ok).toBe(false)
    expect(sanearOrigenDeclarado({ ...ok, correo: 'sin-arroba' }).ok).toBe(false)
    expect(sanearOrigenDeclarado({ ...ok, correo: '' }).ok).toBe(false)
    expect(sanearOrigenDeclarado({ ...ok, nombre_completo: 'a '.repeat(150) }).ok).toBe(false)
    const r = sanearOrigenDeclarado({ ...ok, nombre_completo: '  Luis   Gómez ' })
    expect(r.ok && r.datos.titular_nombre).toBe('Luis Gómez')
  })
  it('agente: pide nombre del agente y de la inmobiliaria; folio y municipio son opcionales', () => {
    expect(sanearOrigenDeclarado({ opcion: 'agente', agente_nombre: 'Ana Ruiz' }).ok).toBe(false)
    expect(sanearOrigenDeclarado({ opcion: 'agente', inmobiliaria: 'Casas del Bajío' }).ok).toBe(false)
    const r = sanearOrigenDeclarado({ opcion: 'agente', agente_nombre: '  Ana   Ruiz ', inmobiliaria: 'Casas del Bajío' })
    expect(r).toEqual({ ok: true, datos: { origen_tipo: 'inmobiliaria', declara_autorizacion: null, titular_nombre: 'Ana Ruiz', titular_empresa: 'Casas del Bajío', titular_telefono: null, titular_correo: null, acreditacion_folio: null, acreditacion_municipio: null } })
  })
  it('guarda el folio y el municipio si se dan, y valida el folio', () => {
    const r = sanearOrigenDeclarado({ opcion: 'agente', agente_nombre: 'Ana', inmobiliaria: 'Casas', folio: ' GTO-123/45 ', municipio: 'León' })
    expect(r).toMatchObject({ ok: true, datos: { acreditacion_folio: 'GTO-123/45', acreditacion_municipio: 'León' } })
    expect(sanearOrigenDeclarado({ opcion: 'agente', agente_nombre: 'Ana', inmobiliaria: 'Casas', folio: '<x>' }).ok).toBe(false)
    expect(sanearOrigenDeclarado({ opcion: 'agente', agente_nombre: 'Ana', inmobiliaria: 'Casas', folio: 'x'.repeat(41) }).ok).toBe(false)
  })
  it('no admite datos sensibles como campos: solo la lista blanca llega a la salida', () => {
    const r = sanearOrigenDeclarado({ opcion: 'agente', agente_nombre: 'Ana', inmobiliaria: 'Casas', curp: 'XXXX', rfc: 'YYYY', identificacion: 'ZZZ', comision_valor: 99 })
    expect(r.ok && Object.keys(r.datos).sort()).toEqual(['acreditacion_folio', 'acreditacion_municipio', 'declara_autorizacion', 'origen_tipo', 'titular_correo', 'titular_empresa', 'titular_nombre', 'titular_telefono'])
    expect(JSON.stringify(r)).not.toMatch(/XXXX|YYYY|ZZZ/)
  })
  it('rechaza textos demasiado largos o de tipo raro', () => {
    expect(sanearOrigenDeclarado({ opcion: 'agente', agente_nombre: 'a'.repeat(201), inmobiliaria: 'Casas' }).ok).toBe(false)
    expect(sanearOrigenDeclarado({ opcion: 'agente', agente_nombre: 5, inmobiliaria: 'Casas' }).ok).toBe(false)
  })
})

describe('origenListo', () => {
  it('ausente = no', () => {
    expect(origenListo(null)).toBe(false)
    expect(origenListo(undefined)).toBe(false)
    expect(origenListo({})).toBe(false)
  })
  it('trato directo necesita la declaración; agente, los dos nombres', () => {
    const dueno = { titular_nombre: 'Luis Gómez', titular_telefono: '4778116501', titular_correo: 'luis@correo.mx' }
    expect(origenListo({ origen_tipo: 'trato_directo', declara_autorizacion: null, ...dueno })).toBe(false)
    expect(origenListo({ origen_tipo: 'trato_directo', declara_autorizacion: true })).toBe(false)
    expect(origenListo({ origen_tipo: 'trato_directo', declara_autorizacion: true, ...dueno, titular_correo: ' ' })).toBe(false)
    expect(origenListo({ origen_tipo: 'trato_directo', declara_autorizacion: true, ...dueno })).toBe(true)
    expect(origenListo({ origen_tipo: 'inmobiliaria', titular_nombre: 'Ana', titular_empresa: '  ' })).toBe(false)
    expect(origenListo({ origen_tipo: 'inmobiliaria', titular_nombre: 'Ana', titular_empresa: 'Casas' })).toBe(true)
    expect(origenListo({ origen_tipo: 'broker', titular_nombre: 'Ana', titular_empresa: 'Casas' })).toBe(true)
    expect(origenListo({ origen_tipo: 'otro' })).toBe(false)
  })
  it('el folio NO es requisito', () => {
    expect(origenListo({ origen_tipo: 'inmobiliaria', titular_nombre: 'Ana', titular_empresa: 'Casas' })).toBe(true)
  })
})

describe('textos mostrados al publicador', () => {
  it('el resumen sale de la regla versionada, no de números escritos aparte', () => {
    const r = resumenEconomico()
    expect(r.borrador).toBe(true)
    expect(r.lineas.join(' ')).toContain('3.5 %')
    expect(r.lineas.join(' ')).toContain('un mes de renta base')
    expect(r.lineas.join(' ')).toContain('50 %')
    expect(r.lineas).toHaveLength(6)
    const otra: ReglaComision = { ...REGLA_BORRADOR_2026_10_24, version: 'x', ventaPuntosBase: 400, colaboradorPuntosBase: 4000 }
    const t = resumenEconomico(otra).lineas.join(' ')
    expect(t).toContain('4 %')
    expect(t).toContain('40 %')
    expect(t).not.toContain('3.5 %')
  })
  it('es EXACTAMENTE el texto fijado por el propietario (25-oct-2026), sin añadidos', () => {
    expect(resumenEconomico().lineas).toEqual([
      'Venta: comisión total del 3.5 % del precio final establecido en el contrato de compraventa firmado. Se genera al cierre de la operación y cuando se recibe el pago correspondiente.',
      'Renta: comisión total equivalente a un mes de renta base. Se genera cuando se firma el contrato de arrendamiento y se recibe la primera renta.',
      'Sin exclusividad: puedes anunciar tu propiedad con otras inmobiliarias y también venderla o rentarla por tu cuenta.',
      'Operaciones atribuibles a VIVE BIEN: solo se cobra comisión si la operación se concreta con una persona interesada cuya relación con VIVE BIEN pueda verificarse conforme a las reglas del acuerdo.',
      'Agente colaborador: si participa un agente o una inmobiliaria colaboradora y se verifican su participación y acreditación conforme al acuerdo, la comisión se reparte 50 % para cada parte. Este reparto no añade un cargo a la comisión total acordada contigo.',
      'Impuestos: los importes de comisión se calculan antes del IVA cuando corresponda. Los impuestos aplicables se desglosarán conforme al acuerdo y al comprobante fiscal.',
    ])
  })
  it('no promete atención 24/7, respuesta a toda consulta ni agenda automática en línea', () => {
    const t = COMO_FUNCIONA.join(' ')
    expect(t).not.toMatch(/24\s*\/\s*7|24 horas|todas las consultas|toda consulta/i)
    expect(t).toMatch(/manualmente/)
    expect(t).toMatch(/no hay agenda automática en línea/)
  })
})
