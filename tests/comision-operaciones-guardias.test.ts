import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Guardias de código del registro de operaciones de comisión (25-oct-2026): ausente = sin permiso, y el navegador no manda importes. */
const leer = (...r: string[]) => readFileSync(path.join(__dirname, '..', ...r), 'utf8')

describe('registro de operaciones de comisión', () => {
  const lib = leer('src', 'lib', 'comision-operaciones-servidor.ts')
  const preparar = lib.slice(lib.indexOf('export async function prepararOperacion'))

  it('si la cuenta dueña no existe, NO se registra (no se cobra por omisión)', () => {
    expect(lib).toContain('if (!u.data) cuentaEncontrada = false')
    expect(preparar).toContain("codigo: 'cuenta_no_encontrada'")
    // se comprueba ANTES de decidir si está exenta: sin la fila no se sabe
    expect(preparar.indexOf("codigo: 'cuenta_no_encontrada'")).toBeLessThan(preparar.indexOf("ctx.exenta === 'sin_comision'"))
  })

  it('SOLO una cuenta dueña con sin_comision queda exenta: una propiedad sin cuenta dueña también genera comisión (decisión del dueño, 26-oct-2026; revierte D-11)', () => {
    expect(lib).not.toContain("exenta = 'sin_dueno'")
    expect(preparar).not.toContain("ctx.exenta === 'sin_dueno'")
    expect(lib).toContain("'sin_comision')) exenta = 'sin_comision'")
    expect(preparar).toContain("codigo: 'exenta'")
  })

  it('los importes se calculan en el servidor: la entrada solo trae qué operación es', () => {
    // Se revisa el código, no los comentarios; los porcentajes pactados (comision_pct, colaborador_pct) son TÉRMINOS del trato, no importes calculados.
    const entrada = lib.slice(lib.indexOf('export type EntradaOperacion'), lib.indexOf('export type ContextoComision')).replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/colaborador_pct/g, '')
    for (const prohibido of ['total_centavos', 'vivebien', 'colaborador', 'retenido', 'reparto', 'regla']) expect(entrada).not.toContain(prohibido)
    for (const permitido of ['propiedad_id', 'tipo', 'base_pesos', 'atribuible', 'clave_idempotencia', 'fecha_cierre']) expect(entrada).toContain(permitido)
  })

  it('la copia de la propiedad (folio, título, precio de lista) la pone el servidor, no el navegador', () => {
    expect(preparar).toContain('propiedad_folio: ctx.propiedad.folio')
    expect(preparar).toContain('precio_lista_centavos: ctx.propiedad.precioCentavos')
  })

  it('la fecha de cierre no puede ser futura ni inválida', () => {
    expect(preparar).toContain('La fecha de cierre no puede ser futura.')
    expect(preparar).toContain('La fecha de cierre no es una fecha válida.')
  })

  it('las rutas exigen poder moderar y el motor encendido para escribir', () => {
    for (const ruta of [['operaciones', 'route.ts'], ['operaciones', '[id]', 'route.ts']]) {
      const t = leer('src', 'app', 'api', 'admin', 'comision', ...ruta)
      expect(t).toContain("exigir(req, 'propiedad.moderar')")
    }
    expect(leer('src', 'app', 'api', 'admin', 'comision', 'operaciones', 'route.ts')).toContain('motor_apagado')
    expect(leer('src', 'app', 'api', 'admin', 'comision', 'operaciones', '[id]', 'route.ts')).toContain('motor_apagado')
  })
})

describe('ajustes del trato real (porcentaje, meses, reparto, gastos)', () => {
  const lib = leer('src', 'lib', 'comision-operaciones-servidor.ts')
  const preparar = lib.slice(lib.indexOf('export async function prepararOperacion'))

  it('un valor de ajuste ilegible es un error, nunca se ignora en silencio', () => {
    for (const m of ['El porcentaje de la comisión debe ser un número', 'Los meses de renta deben ser un número', 'El reparto del colaborador debe ser un porcentaje', 'Cada gasto lleva un concepto y un monto en pesos']) expect(preparar).toContain(m)
  })

  it('separarse de la regla exige motivo escrito, también si se cambia si hay colaborador', () => {
    expect(preparar).toContain('const separaDeLaRegla = calculo.ajustada || participa !== ctx.participa')
    expect(preparar).toContain("codigo: 'falta_motivo'")
    expect(preparar).toContain('ajuste_motivo: separaDeLaRegla ? motivo : null')
  })

  it('aunque se diga que hay colaborador, su parte se libera solo con acreditación verificada (la decide el cálculo, no el formulario)', () => {
    expect(preparar).toContain('colaborador: { participa, acreditacion: ctx.acreditacion, atribuible: e.atribuible }')
    expect(preparar).not.toMatch(/acreditacion:\s*'verificado'/)
  })

  it('los gastos y los porcentajes aplicados los fija el servidor con el cálculo', () => {
    for (const c of ['comision_bp: calculo.comisionPuntosBase', 'renta_meses_cent: calculo.rentaMesesCent', 'colaborador_bp: calculo.colaboradorPuntosBase']) expect(preparar).toContain(c)
  })
})
