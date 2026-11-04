import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { calcularComision, LIMITES, REGLA_BORRADOR_2026_10_24 } from '../src/lib/comision-calculo'
import { ATAJOS, ESCALAS, PCT_VENTA_REGLA } from '../src/lib/comision-formulario'
import { debeAceptar, type TextoComision } from '../src/lib/comision-aceptacion'
import { AVISO_SIN_ACUERDO } from '../src/lib/origen-declarado'

/**
 * Cierre de la fase legal (4-nov-2026). Garantías, cada una por separado:
 *  1. La comisión de venta es 3.5 % por defecto y editable SOLO entre 3 % y 4 %, con motivo y auditoría (cálculo, atajos, regleta y servidor).
 *  2. INTERNO (Admin): el motor es una herramienta de cálculo y contabilidad por propiedad; registrar una operación NO depende de que exista un acuerdo con quien publica.
 *  3. PÚBLICO (publicador): sin texto vigente lo económico es una PROPUESTA y el sitio no registra ni presenta una aceptación inexistente.
 *  4. El Aviso describe con exactitud qué borra el proceso diario y qué no, y los artículos del Centro de Ayuda dicen lo mismo que el Aviso.
 */
const leer = (...r: string[]) => readFileSync(path.join(__dirname, '..', ...r), 'utf8')
const TEXTO = { id: 't1', version: 'v1', titulo: 'Propuesta', cuerpo: 'x', hash: 'h' } as unknown as TextoComision

describe('1 · comisión de venta: 3.5 % predeterminado, editable de 3 % a 4 %', () => {
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
  it('solo el equipo registra operaciones; el ajuste exige motivo escrito que queda en la operación y la acción queda auditada', () => {
    const ruta = leer('src', 'app', 'api', 'admin', 'comision', 'operaciones', 'route.ts')
    expect(ruta.match(/exigir\(req, 'propiedad\.moderar'\)/g)?.length).toBe(2)
    expect(ruta).toContain("accion: 'comision.operacion_registrada'")
    expect(ruta).toContain('actor_uid: perfil.uid')
    expect(leer('src', 'lib', 'comision-operaciones-servidor.ts')).toContain('ajuste_motivo: separaDeLaRegla ? motivo : null')
    expect(LIMITES.motivo).toEqual({ min: 10, max: 300 })
  })
})

describe('2 · INTERNO (Admin): calcular y registrar para contabilidad no depende de un acuerdo con el publicador', () => {
  const ops = leer('src', 'lib', 'comision-operaciones-servidor.ts')
  const preparar = ops.slice(ops.indexOf('export async function prepararOperacion'))
  it('Admin calcula sin ningún acuerdo: el cálculo es una función pura de la regla y los ajustes', () => {
    const r = calcularComision({ operacion: 'venta', baseCentavos: 200_000_000 })
    expect(r.ok && r.totalCentavos).toBe(7_000_000) // 3.5 % de $2,000,000
  })
  it('prepararOperacion NO consulta ni exige un texto vigente ni devuelve «sin acuerdo»', () => {
    expect(ops).not.toContain('hayTextoVigente')
    expect(ops).not.toContain('sin_acuerdo_vigente')
    expect(preparar).not.toContain('comision_textos')
  })
  it('la ruta administrativa solo se detiene por el interruptor del módulo (motor apagado), no por falta de texto de acuerdo', () => {
    const ruta = leer('src', 'app', 'api', 'admin', 'comision', 'operaciones', 'route.ts')
    expect(ruta).toContain("codigo: 'motor_apagado'")
    expect(ruta).not.toContain('comision_textos')
    expect(ruta).not.toContain('sin_acuerdo_vigente')
  })
})

describe('3 · PÚBLICO (publicador): sin texto vigente es una propuesta y no hay aceptación', () => {
  it('sin texto vigente nadie debe aceptar nada; con texto vigente, el publicador sí (el equipo y los exentos, nunca)', () => {
    expect(debeAceptar({ flagEncendida: true, esEquipo: false, exenta: false, texto: null })).toBe(false)
    expect(debeAceptar({ flagEncendida: true, esEquipo: false, exenta: false, texto: TEXTO })).toBe(true)
    expect(debeAceptar({ flagEncendida: true, esEquipo: true, exenta: false, texto: TEXTO })).toBe(false)
    expect(debeAceptar({ flagEncendida: true, esEquipo: false, exenta: true, texto: TEXTO })).toBe(false)
    expect(debeAceptar({ flagEncendida: false, esEquipo: false, exenta: false, texto: TEXTO })).toBe(false)
  })
  it('la ruta de aceptación NO registra nada si no hay texto vigente (no inventa una aceptación)', () => {
    const ruta = leer('src', 'app', 'api', 'comision', 'aceptacion', 'route.ts')
    const post = ruta.slice(ruta.indexOf('export async function POST'))
    expect(post).toContain('if (!requerida || !texto) return NextResponse.json({ ok: true, requerida: false })')
    const srv = leer('src', 'lib', 'comision-servidor.ts')
    expect(srv).toContain('Sin texto vigente no hay nada que aceptar: no se exige.')
    expect(srv).toContain('if (!debeAceptar({ flagEncendida: true, esEquipo, exenta, texto })) return { ok: true, estado: SIN_ACEPTACION }')
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
  it('hayTextoVigente solo alimenta lo público: consulta el texto «vigente» y ante un error devuelve null', () => {
    const s = leer('src', 'lib', 'comision-servidor.ts')
    expect(s).toContain(".from('comision_textos').select('id').eq('estado', 'vigente')")
    expect(s).toMatch(/if \(t\.error\) return null/)
  })
})

describe('4a · retención: el Aviso dice lo que de verdad se borra', () => {
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

describe('4b · Centro de Ayuda (migración 68) coincide con el Aviso y con el producto', () => {
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
