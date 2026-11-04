import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { calcularComision, LIMITES, REGLA_BORRADOR_2026_10_24 } from '../src/lib/comision-calculo'
import { ATAJOS, ESCALAS, PCT_VENTA_REGLA } from '../src/lib/comision-formulario'
import { AVISO_SIN_ACUERDO } from '../src/lib/origen-declarado'

/**
 * Cierre de la fase legal (4-nov-2026). Garantías:
 *  1. La comisión de venta es 3.5 % por defecto y editable SOLO entre 3 % y 4 % (decisión del propietario con el abogado), en el cálculo, en los atajos y en la regleta.
 *  2. Con el motor encendido pero SIN texto vigente (estado real de Producción) nada se presenta como acordado ni se registra como cobrable.
 *  3. El Aviso describe con exactitud qué borra el proceso diario y qué no, y los artículos del Centro de Ayuda dicen lo mismo que el Aviso.
 */
const leer = (...r: string[]) => readFileSync(path.join(__dirname, '..', ...r), 'utf8')

describe('comisión de venta: 3.5 % predeterminado, editable de 3 % a 4 %', () => {
  it('el valor por defecto es 3.5 % y está dentro del rango', () => {
    expect(PCT_VENTA_REGLA).toBe('3.5')
    expect(REGLA_BORRADOR_2026_10_24.ventaPuntosBase).toBe(350)
    expect(LIMITES.ventaPuntosBase).toEqual({ min: 300, max: 400 })
  })
  it('el servidor rechaza cualquier valor fuera de 3–4 % aunque el navegador lo mande', () => {
    for (const bp of [50, 299, 401, 500, 1500]) expect(calcularComision({ operacion: 'venta', baseCentavos: 100_000_000, ajustes: { ventaPuntosBase: bp } }).ok, String(bp)).toBe(false)
    for (const bp of [300, 350, 400]) expect(calcularComision({ operacion: 'venta', baseCentavos: 100_000_000, ajustes: { ventaPuntosBase: bp } }).ok, String(bp)).toBe(true)
  })
  it('los atajos de la pantalla y la regleta no ofrecen nada fuera del rango', () => {
    for (const p of ATAJOS.pctVenta) { expect(Number(p) * 100).toBeGreaterThanOrEqual(LIMITES.ventaPuntosBase.min); expect(Number(p) * 100).toBeLessThanOrEqual(LIMITES.ventaPuntosBase.max) }
    expect(ESCALAS.venta.habitualDesde * 100).toBe(LIMITES.ventaPuntosBase.min)
    expect(ESCALAS.venta.habitualHasta * 100).toBe(LIMITES.ventaPuntosBase.max)
  })
  it('solo el equipo registra operaciones y el ajuste exige motivo escrito que queda en la operación', () => {
    const ruta = leer('src', 'app', 'api', 'admin', 'comision', 'operaciones', 'route.ts')
    expect(ruta.match(/exigir\(req, 'propiedad\.moderar'\)/g)?.length).toBe(2)
    expect(ruta).toContain("accion: 'comision.operacion_registrada'")
    expect(leer('src', 'lib', 'comision-operaciones-servidor.ts')).toContain('ajuste_motivo: separaDeLaRegla ? motivo : null')
    expect(LIMITES.motivo).toEqual({ min: 10, max: 300 })
  })
})

describe('motor de comisiones encendido y SIN texto vigente: estado seguro', () => {
  const ops = leer('src', 'lib', 'comision-operaciones-servidor.ts')
  const preparar = ops.slice(ops.indexOf('export async function prepararOperacion'))
  it('no se registra ninguna operación sin texto vigente, y si no se puede comprobar tampoco (falla cerrado), ANTES de leer nada más', () => {
    expect(preparar).toContain('await hayTextoVigente()')
    expect(preparar).toContain("codigo: 'sin_acuerdo_vigente'")
    expect(preparar).toMatch(/vigente === null\) return \{ ok: false, status: 503/)
    expect(preparar.indexOf('hayTextoVigente()')).toBeLessThan(preparar.indexOf('leerContexto('))
  })
  it('hayTextoVigente consulta el texto con estado «vigente» y ante un error devuelve null', () => {
    const s = leer('src', 'lib', 'comision-servidor.ts')
    expect(s).toContain(".from('comision_textos').select('id').eq('estado', 'vigente')")
    expect(s).toMatch(/if \(t\.error\) return null/)
  })
  it('la aceptación del publicador no se exige ni se presenta como hecha si no hay texto (ya era así; se fija)', () => {
    const s = leer('src', 'lib', 'comision-servidor.ts')
    expect(s).toContain('Sin texto vigente no hay nada que aceptar: no se exige.')
    expect(s).toContain("if (!debeAceptar({ flagEncendida: true, esEquipo, exenta, texto })) return { ok: true, estado: SIN_ACEPTACION }")
  })
  it('la pantalla del publicador rotula lo económico como PROPUESTA y lo dice, mientras no haya acuerdo vigente', () => {
    expect(AVISO_SIN_ACUERDO).toContain('todavía no hay un acuerdo vigente')
    expect(AVISO_SIN_ACUERDO).toContain('no aceptas nada ni se te cobra comisión')
    const api = leer('src', 'app', 'api', 'propiedades', '[id]', 'origen', 'route.ts')
    expect(api).toContain('acuerdoVigente === true ? null : AVISO_SIN_ACUERDO')
    const ui = leer('src', 'components', 'publicador', 'OrigenDeclarado.tsx')
    expect(ui).toContain("e.acuerdoVigente === true ? 'Comisión' : 'Comisión (propuesta)'")
    expect(ui).toContain('data-aviso-sin-acuerdo')
  })
})

describe('retención: el Aviso dice lo que de verdad se borra', () => {
  const aviso = leer('src', 'app', 'privacidad', 'page.tsx')
  const sql = leer('supabase', '67-correo-eventos-pendientes.sql')
  it('los plazos del registro de correos del Aviso son los de la función diaria de purga', () => {
    const f = sql.slice(sql.indexOf('create or replace function public.correo_purgar'))
    expect(f).toContain("correo_envios where creado_en < now() - interval '730 days'")
    expect(f).toContain("correo_webhook_vistos where creado_en < now() - interval '90 days'")
    expect(f).toContain("estado = 'pendiente' and creado_en < now() - interval '30 days'")
    expect(aviso).toContain('hasta por dos años desde el envío')
    expect(aviso).toContain('hasta noventa días')
    expect(aviso).toContain('hasta treinta días')
  })
  it('la purga diaria NO toca cuentas, consultas, formularios ni datos de propietarios, y el Aviso no afirma que sí', () => {
    const f = sql.slice(sql.indexOf('create or replace function public.correo_purgar'))
    for (const tabla of ['usuarios', 'leads', 'solicitudes_contacto', 'propiedad_origen']) expect(f).not.toContain(`from public.${tabla}`)
    expect(aviso).toContain('Hoy esa supresión no es automática:')
    expect(aviso).toContain('solo el registro de correos, descrito a continuación, se elimina de forma automática')
    expect(aviso).toContain('consultas y de propietarios, representantes y agentes')
  })
})

describe('Centro de Ayuda (migración 68) coincide con el Aviso y con el producto', () => {
  const ayuda = leer('supabase', '68-ayuda-privacidad-medicion-consultas-arco.sql')
  const aviso = leer('src', 'app', 'privacidad', 'page.tsx')
  it('la medición: lo que dice el artículo es lo que dice el Aviso y hace el aviso del sitio', () => {
    for (const frase of ['Aceptar', 'Rechazar', 'Preferencias de analítica']) { expect(ayuda).toContain(frase); expect(aviso + leer('src', 'components', 'AvisoAnalitica.tsx') + leer('src', 'components', 'Footer.tsx')).toContain(frase) }
    expect(ayuda).toContain('Tu cuenta, el portal y el panel de administración nunca se miden')
    expect(aviso).toContain('Las áreas con sesión (panel, cuenta y portal) no se miden')
    expect(ayuda).toContain('borramos las cookies de Google Analytics que ya existieran')
    expect(aviso).toContain('se borran las cookies de Google Analytics que ya existieran')
  })
  it('la consulta no llega al anunciante: igual en el artículo, el Aviso y la casilla', () => {
    expect(ayuda).toContain('Quien publica la propiedad no recibe tu nombre')
    expect(aviso).toContain('el anunciante no recibe el nombre, teléfono, correo ni mensaje de quien consulta')
    expect(leer('src', 'lib', 'contacto.ts')).toContain('VIVE BIEN no los entrega al anunciante de la propiedad sin pedirme antes una autorización aparte.')
  })
  it('ARCO: mismos plazos y mismo canal en el artículo y en el Aviso', () => {
    expect(ayuda).toContain('**veinte días hábiles**'); expect(ayuda).toContain('**quince días hábiles**')
    expect(aviso).toContain('veinte días hábiles'); expect(aviso).toContain('quince días hábiles')
    expect(aviso).toContain('El ejercicio de derechos ARCO es gratuito')
    expect(ayuda).toContain('Es gratuito')
  })
})
