import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { calcular, datosDeDemostracion, diaLocal, diasDelRango, grupoDe, MIN_CELDA, rangoDeUltimosDias, validarRango, type FilaBaja, type FilaEnvio } from '../src/lib/correo/metricas'
import { BIBLIOTECA, MUESTRA_POR_OMISION, muestraPermitida, SIN_VISTA_PREVIA, vistaPrevia } from '../src/lib/correo/biblioteca'
import { correoDeAlertas } from '../src/lib/avisos-cliente'
import { remitenteDe } from '../src/lib/correo/enviar'
import { aplicarEventoProveedor } from '../src/lib/correo/suscripcion'
import type { DbCorreo } from '../src/lib/correo/enviar'
import { SITIO } from '../src/lib/sitio'

/**
 * Métricas de correo y vista previa fiel. Todo con filas SINTÉTICAS y un reloj fijo: ninguna base, ninguna red, ningún correo.
 */
const R = { desde: '2026-10-20', hasta: '2026-10-29' }
const fila = (categoria: string, estado: string, dia: string, tipo = 'alertas', hora = '18:00:00'): FilaEnvio => ({ categoria, tipo, estado, momento: `${dia}T${hora}.000Z` })
const muchas = (n: number, ...resto: Parameters<typeof fila>) => Array.from({ length: n }, () => fila(...resto))
const filtro = (extra: Partial<{ tipo: string | null; grupo: 'todos' | 'servicio' | 'promocional' }> = {}) => ({ ...R, tipo: null, grupo: 'todos' as const, ...extra })
const bloque = (r: ReturnType<typeof calcular>, g: string) => r.bloques.find((b) => b.grupo === g)!

describe('periodos y zona horaria', () => {
  it('el día se cuenta en la zona de VIVE BIEN: 23:30 de México es el día siguiente en UTC', () => {
    expect(diaLocal('2026-10-29T05:59:00.000Z')).toBe('2026-10-28') // 23:59 del 28 en México
    expect(diaLocal('2026-10-29T06:00:00.000Z')).toBe('2026-10-29') // 00:00 del 29 en México
  })
  it('los rangos de 7, 30 y 90 días incluyen hoy y tienen el largo exacto', () => {
    const ahora = new Date('2026-10-30T20:00:00Z')
    for (const n of [7, 30, 90]) {
      const r = rangoDeUltimosDias(n, ahora)
      expect(r.hasta).toBe('2026-10-30')
      expect(diasDelRango(r)).toHaveLength(n)
    }
  })
  it('rechaza fechas imposibles, desordenadas, futuras o de más de 366 días', () => {
    const ahora = new Date('2026-10-30T20:00:00Z')
    expect(validarRango({ desde: '2026-02-30', hasta: '2026-03-01' }, ahora).ok).toBe(false)
    expect(validarRango({ desde: '2026-10-29', hasta: '2026-10-20' }, ahora).ok).toBe(false)
    expect(validarRango({ desde: '2026-10-20', hasta: '2026-10-31' }, ahora).ok).toBe(false)
    expect(validarRango({ desde: '2025-01-01', hasta: '2026-10-30' }, ahora).ok).toBe(false)
    expect(validarRango({ desde: '2026-10-01', hasta: '2026-10-30' }, ahora).ok).toBe(true)
    expect(validarRango({ desde: 'ayer', hasta: 'hoy' }, ahora).ok).toBe(false)
  })
})

describe('cálculo de métricas y fórmulas', () => {
  const filas = [
    ...muchas(40, 'servicio', 'entregado', '2026-10-21'),
    ...muchas(4, 'servicio', 'enviado', '2026-10-21'),
    ...muchas(6, 'servicio', 'rebotado', '2026-10-22'),
    ...muchas(5, 'servicio', 'error', '2026-10-22'),
    ...muchas(5, 'servicio', 'suprimido', '2026-10-23'),
    ...muchas(50, 'marketing', 'entregado', '2026-10-24', 'recomendaciones'),
    ...muchas(5, 'marketing', 'queja', '2026-10-24', 'recomendaciones'),
  ]
  const bajas: FilaBaja[] = Array.from({ length: 7 }, () => ({ baja_en: '2026-10-25T18:00:00.000Z' }))
  const r = calcular(filas, { filas: bajas, acumuladasAntes: 10, vigentes: 17 }, filtro())

  it('separa servicio y promocional: nunca hay un bloque combinado', () => {
    expect(r.bloques.map((b) => b.grupo)).toEqual(['servicio', 'promocional'])
    expect(bloque(r, 'servicio').totales.enviados).toBe(50) // 40 + 4 + 6 rebotados (aceptados por Resend)
    expect(bloque(r, 'promocional').totales.enviados).toBe(55)
    expect(grupoDe('transaccional')).toBe('servicio')
    expect(grupoDe('servicio')).toBe('servicio')
    expect(grupoDe('marketing')).toBe('promocional')
  })
  it('cuenta entregados, rebotes, fallos, omitidos y quejas con la definición documentada', () => {
    const s = bloque(r, 'servicio').totales
    expect(s).toMatchObject({ entregados: 40, rebotes: 6, fallos: 5, omitidos: 5, quejas: 0, pendientes: 0 })
    const p = bloque(r, 'promocional').totales
    expect(p).toMatchObject({ entregados: 55, quejas: 5 }) // una queja implica que se entregó
  })
  it('las tasas usan la fórmula y el denominador mostrados', () => {
    const s = bloque(r, 'servicio').tasas
    expect(s.find((t) => t.id === 'entrega')).toMatchObject({ valor: 80, numerador: 40, denominador: 50, formula: 'entregados ÷ enviados' })
    expect(s.find((t) => t.id === 'rebote')).toMatchObject({ valor: 12, numerador: 6, denominador: 50 })
    const p = bloque(r, 'promocional').tasas
    expect(p.find((t) => t.id === 'baja')).toMatchObject({ valor: 12.7, numerador: 7, denominador: 55 })
    expect(s.find((t) => t.id === 'baja')).toBeUndefined() // la baja es sólo promocional
  })
  it('las bajas promocionales por día y acumuladas parten de las anteriores al periodo', () => {
    const p = bloque(r, 'promocional')
    expect(p.bajas).toMatchObject({ enPeriodo: 7, vigentes: 17, acumuladasAntes: 10 })
    const d25 = p.serie!.find((d) => d.dia === '2026-10-25')!
    expect(d25).toMatchObject({ bajas: 7, bajasAcumuladas: 17 })
    expect(p.serie!.find((d) => d.dia === '2026-10-24')).toMatchObject({ bajas: 0, bajasAcumuladas: 10 })
    expect(bloque(r, 'servicio').bajas).toBeNull()
  })
  it('las bajas anteriores al periodo que llegan por el margen de lectura se suman a las acumuladas', () => {
    const antes: FilaBaja[] = [{ baja_en: '2026-10-19T20:00:00.000Z' }]
    const x = calcular([...muchas(10, 'marketing', 'entregado', '2026-10-24', 'recomendaciones')], { filas: antes, acumuladasAntes: 3, vigentes: 4 }, filtro())
    expect(bloque(x, 'promocional').bajas?.acumuladasAntes).toBe(4)
    expect(bloque(x, 'promocional').serie![0].bajasAcumuladas).toBe(4)
  })
  it('el filtro de tipo cambia los envíos pero lista todos los tipos del periodo; las bajas no se atribuyen a un tipo', () => {
    const x = calcular(filas, { filas: bajas, acumuladasAntes: 0, vigentes: 7 }, filtro({ tipo: 'recomendaciones' }))
    expect(bloque(x, 'servicio').totales.enviados).toBe(0)
    expect(bloque(x, 'promocional').totales.enviados).toBe(55)
    expect(x.tipos.map((t) => t.id).sort()).toEqual(['alertas', 'recomendaciones'])
    expect(bloque(x, 'promocional').bajas?.atribuibleATipo).toBe(false)
  })
  it('el filtro de grupo devuelve sólo ese bloque', () => {
    expect(calcular(filas, null, filtro({ grupo: 'servicio' })).bloques.map((b) => b.grupo)).toEqual(['servicio'])
  })
  it('las filas fuera del periodo no cuentan (ni por el margen de zona horaria)', () => {
    const x = calcular([fila('servicio', 'entregado', '2026-10-19', 'alertas', '17:00:00'), fila('servicio', 'entregado', '2026-10-30', 'alertas', '17:00:00'), ...muchas(5, 'servicio', 'entregado', '2026-10-20')], null, filtro({ grupo: 'servicio' }))
    expect(bloque(x, 'servicio').totales.enviados).toBe(5)
  })
})

describe('datos vacíos y grupos pequeños', () => {
  it('sin filas: ceros, sin tasas, sin inventar nada', () => {
    const r = calcular([], { filas: [], acumuladasAntes: 0, vigentes: 0 }, filtro())
    for (const b of r.bloques) {
      expect(b.totales).toMatchObject({ enviados: 0, entregados: 0, rebotes: 0, quejas: 0, fallos: 0, omitidos: 0 })
      expect(b.tasas.every((t) => t.valor === null && t.denominador === 0)).toBe(true)
      expect(b.detalleOculto).toBe(false)
    }
    expect(r.tipos).toEqual([])
  })
  it(`un grupo de menos de ${MIN_CELDA} correos oculta cifras, tasas y detalle por día`, () => {
    const r = calcular([fila('marketing', 'entregado', '2026-10-24', 'recomendaciones'), fila('marketing', 'entregado', '2026-10-25', 'recomendaciones')], { filas: [{ baja_en: '2026-10-25T18:00:00.000Z' }], acumuladasAntes: 0, vigentes: 1 }, filtro({ grupo: 'promocional' }))
    const b = bloque(r, 'promocional')
    expect(b.detalleOculto).toBe(true)
    expect(b.serie).toBeNull()
    expect(b.totales.enviados).toBe('<5')
    expect(b.bajas?.enPeriodo).toBe('<5')
    expect(b.tasas.every((t) => t.valor === null)).toBe(true)
    expect(JSON.stringify(b)).not.toMatch(/"enviados":2/)
  })
  it('menos de 5 rebotes, quejas o bajas se muestran como «<5» y no salen por día', () => {
    const filas = [...muchas(40, 'marketing', 'entregado', '2026-10-24', 'recomendaciones'), ...muchas(2, 'marketing', 'rebotado', '2026-10-25', 'recomendaciones'), ...muchas(3, 'marketing', 'queja', '2026-10-26', 'recomendaciones')]
    const b = bloque(calcular(filas, { filas: [{ baja_en: '2026-10-27T18:00:00.000Z' }], acumuladasAntes: 0, vigentes: 1 }, filtro({ grupo: 'promocional' })), 'promocional')
    expect(b.totales).toMatchObject({ rebotes: '<5', quejas: '<5' })
    expect(b.bajas?.enPeriodo).toBe('<5')
    expect(b.serie!.every((d) => d.rebotes === 0 && d.quejas === 0 && d.bajas === 0)).toBe(true)
    expect(b.tasas.find((t) => t.id === 'rebote')).toMatchObject({ valor: null, numerador: '<5' })
  })
  it('un envío pendiente o con error no se cuenta como enviado', () => {
    const b = bloque(calcular([...muchas(5, 'servicio', 'pendiente', '2026-10-24'), ...muchas(5, 'servicio', 'error', '2026-10-24')], null, filtro({ grupo: 'servicio' })), 'servicio')
    expect(b.totales).toMatchObject({ enviados: 0, fallos: 5, pendientes: 5 })
  })
})

describe('datos de demostración', () => {
  it('son deterministas, sintéticos y pasan por el mismo cálculo; no dependen de ninguna base', () => {
    const a = datosDeDemostracion(R)
    const b = datosDeDemostracion(R)
    expect(a).toEqual(b)
    expect(a.filas.length).toBeGreaterThan(50)
    expect(JSON.stringify(a)).not.toMatch(/@|\bemail\b|hash/i)
    const r = calcular(a.filas, a.bajas, filtro())
    expect(bloque(r, 'servicio').totales.enviados).not.toBe(0)
  })
})

describe('vista previa fiel', () => {
  it('sólo acepta nombres y cantidades de la lista permitida; lo demás vuelve al valor por omisión', () => {
    expect(muestraPermitida('Ana Ejemplo', 3)).toEqual({ nombre: 'Ana Ejemplo', propiedades: 3, imagenes: true })
    expect(muestraPermitida('<script>alert(1)</script>', 99)).toEqual(MUESTRA_POR_OMISION)
    expect(muestraPermitida('maria@cliente.real', '0')).toEqual(MUESTRA_POR_OMISION)
    expect(muestraPermitida(null, '2.5')).toEqual(MUESTRA_POR_OMISION)
  })
  it('usa la MISMA plantilla que el envío real: el HTML coincide con el de la función real con los mismos datos', () => {
    const t = BIBLIOTECA.find((x) => x.id === 'alertas')!
    const v = vistaPrevia('alertas', MUESTRA_POR_OMISION)!
    const real = correoDeAlertas({ nombre: MUESTRA_POR_OMISION.nombre, grupos: [{ busquedaNombre: 'Naves en venta (ejemplo)', href: '/propiedades', items: [{ titulo: 'Nave industrial de ejemplo A', cuerpo: '1,800 m²', url: `${SITIO}/propiedades` }] }], sitio: SITIO, urlBaja: `${SITIO}/?enlace=deshabilitado-en-pruebas`, urlPreferencias: `${SITIO}/portal/configuracion` })
    expect(v.html).toBe(real.html)
    expect(v.asunto).toBe(real.asunto)
    expect(t.vista(MUESTRA_POR_OMISION).texto).toBe(real.texto)
  })
  it('el cambio de muestra cambia el contenido y sólo con datos de ejemplo', () => {
    const uno = vistaPrevia('recomendaciones', { nombre: 'Ana Ejemplo', propiedades: 1, imagenes: false })!
    const tres = vistaPrevia('recomendaciones', { nombre: 'Luis Ejemplo', propiedades: 3, imagenes: true })!
    expect(uno.html).toContain('Ana Ejemplo')
    expect(tres.html).toContain('Luis Ejemplo')
    expect(tres.html).toContain('Terreno de ejemplo C')
    expect(uno.html).not.toContain('Terreno de ejemplo C')
  })
  it('el remitente es el mismo cálculo que usa el envío real, por categoría', () => {
    for (const t of BIBLIOTECA) expect(vistaPrevia(t.id)!.remitente).toBe(remitenteDe(t.categoria))
  })
  it('lista asunto, enlaces y pie; los enlaces de baja y preferencias son inertes (sin token ni persona real)', () => {
    const v = vistaPrevia('primeras_propiedades')!
    expect(v.enlaces.length).toBeGreaterThan(0)
    expect(v.enlaces.some((e) => e.includes('deshabilitado-en-pruebas'))).toBe(true)
    for (const e of v.enlaces) expect(e).toMatch(/^https:\/\/|^mailto:/)
    expect(v.enlaces.join(' ')).not.toMatch(/token|firma=|uid=|sig=/i)
    expect(v.texto.length).toBeGreaterThan(20)
  })
  it('un correo sin plantilla visualizable aparece con su motivo, no como si funcionara', () => {
    expect(SIN_VISTA_PREVIA.length).toBeGreaterThanOrEqual(3)
    for (const s of SIN_VISTA_PREVIA) { expect(s.nombre.length).toBeGreaterThan(5); expect(s.motivo.length).toBeGreaterThan(30) }
    expect(vistaPrevia('no-existe')).toBeNull()
  })
  it('la biblioteca no puede leer la base ni a Resend (guardia estática)', () => {
    const texto = readFileSync(path.join(__dirname, '..', 'src', 'lib', 'correo', 'biblioteca.ts'), 'utf8')
    expect(texto).not.toMatch(/supabase|auth-server|fetch\(|llamarResend|process\.env/i)
    const ruta = readFileSync(path.join(__dirname, '..', 'src', 'app', 'api', 'admin', 'marketing', 'vista-previa', 'route.ts'), 'utf8')
    expect(ruta).not.toMatch(/supabaseAdmin|\.from\(|\.rpc\(/)
  })
})

describe('eventos del proveedor que alimentan los números', () => {
  const dbFalsa = () => {
    const llamadas: Array<{ fn: string; args: Record<string, unknown> }> = []
    const db = { rpc: async (fn: string, args: Record<string, unknown>) => { llamadas.push({ fn, args }); return { data: { resultado: 'aplicado' }, error: null } }, from: () => { throw new Error('no debe leer tablas') } } as unknown as DbCorreo
    return { db, llamadas }
  }
  it('email.failed se aplica; aperturas y clics se ignoran a propósito (no se guardan)', async () => {
    const { db, llamadas } = dbFalsa()
    expect(await aplicarEventoProveedor(db, 'svix-1', { type: 'email.failed', data: { to: ['x@ejemplo.test'], email_id: 're_1' } })).toBe('aplicado')
    expect(llamadas[0].args).toMatchObject({ p_tipo: 'email.failed', p_resend_id: 're_1' })
    expect(await aplicarEventoProveedor(db, 'svix-2', { type: 'email.opened', data: { to: ['x@ejemplo.test'] } })).toBe('ignorado')
    expect(await aplicarEventoProveedor(db, 'svix-3', { type: 'email.clicked', data: {} })).toBe('ignorado')
    expect(llamadas).toHaveLength(1)
  })
  it('un rebote temporal no se marca como permanente; uno permanente sí', async () => {
    const { db, llamadas } = dbFalsa()
    await aplicarEventoProveedor(db, 's-a', { type: 'email.bounced', data: { to: ['x@ejemplo.test'], bounce: { type: 'Transient' } } })
    await aplicarEventoProveedor(db, 's-b', { type: 'email.bounced', data: { to: ['x@ejemplo.test'], bounce: { type: 'Permanent' } } })
    expect(llamadas.map((l) => l.args.p_rebote_permanente)).toEqual([false, true])
  })
})

vi.setConfig({ testTimeout: 20_000 })
