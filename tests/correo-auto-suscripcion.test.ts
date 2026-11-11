import { describe, expect, it } from 'vitest'
import { desdeAltaAutomatica, suscribirAutomaticamente, VERSION_ALTA_AUTOMATICA } from '../src/lib/correo/auto-suscripcion'
import type { DbCorreo } from '../src/lib/correo/enviar'

/**
 * Alta automática al correo de recomendaciones (decisión del dueño, 10-nov-2026). Lo que NO debe pasar jamás: reactivar a quien ya
 * se dio de baja, suscribir al equipo o a cuentas no activas, o empezar sin la fecha del interruptor.
 */
type Tablas = Record<string, Array<Record<string, unknown>>>
function crearDb(tablas: Tablas, o: { falla?: string; respuesta?: (a: Record<string, unknown>) => unknown } = {}) {
  const llamadas: Array<{ fn: string; args: Record<string, unknown> }> = []
  const filtros: Array<{ tabla: string; op: string; args: unknown[] }> = []
  const db: DbCorreo = {
    rpc: async (fn, args = {}) => { llamadas.push({ fn, args }); return { data: (o.respuesta ?? (() => ({ estado: 'activa' })))(args), error: null } },
    from: (tabla: string) => {
      let filas = tablas[tabla] ?? []
      const q: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
        select: () => q,
        eq: (...a: unknown[]) => { filtros.push({ tabla, op: 'eq', args: a }); filas = filas.filter((f) => f[a[0] as string] === a[1]); return q },
        in: (...a: unknown[]) => { filtros.push({ tabla, op: 'in', args: a }); filas = filas.filter((f) => (a[1] as unknown[]).includes(f[a[0] as string])); return q },
        not: (...a: unknown[]) => { filtros.push({ tabla, op: 'not', args: a }); filas = filas.filter((f) => f[a[0] as string] != null); return q },
        order: () => q,
        limit: () => q,
        then: (ok: (v: unknown) => unknown) => ok(o.falla === tabla ? { data: null, error: { message: 'x' } } : { data: filas, error: null }),
      }
      return q
    },
  }
  return { db, llamadas, filtros }
}

const AHORA = new Date('2026-12-01T12:00:00Z')
const base = (): Tablas => ({
  usuarios: [
    { uid: 'u1', email: 'Ana@Ejemplo.test', nombre: 'Ana', rol: 'cliente', estado: 'activo' },
    { uid: 'u2', email: 'pub@ejemplo.test', nombre: 'Pub', rol: 'publicador', estado: 'activo' },
    { uid: 'u3', email: 'equipo@ejemplo.test', nombre: 'Eq', rol: 'admin', estado: 'activo' },
    { uid: 'u4', email: 'susp@ejemplo.test', nombre: 'S', rol: 'cliente', estado: 'suspendido' },
  ],
  solicitudes_contacto: [{ email: 'form@ejemplo.test', nombre: 'Form' }, { email: 'ana@ejemplo.test', nombre: 'Ana otra vez' }],
  leads: [{ email: 'lead@ejemplo.test', nombre: 'Lead' }, { email: null, nombre: 'Sin correo' }],
  correo_suscriptores: [],
})

describe('interruptor MARKETING_A_TODOS', () => {
  it('sólo una fecha AAAA-MM-DD válida lo enciende; vacío, basura o fecha imposible = apagado', () => {
    expect(desdeAltaAutomatica('2026-12-01')?.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    for (const v of [undefined, null, '', '1', 'true', '2026-13-01', '2026-02-30', '01/12/2026', ' ']) expect(desdeAltaAutomatica(v as never)).toBeNull()
  })
  it('apagado o con fecha futura: no lee ni escribe nada', async () => {
    for (const desde of [undefined, '', 'true', '2026-12-02']) {
      const { db, llamadas } = crearDb(base())
      const r = await suscribirAutomaticamente(db, { desde, ahora: AHORA })
      expect(r.activa).toBe(false)
      expect(llamadas).toEqual([])
    }
  })
})

describe('quién queda suscrito', () => {
  it('cuentas de cliente/publicador y correos de formularios; sin duplicar (misma persona en cuenta y formulario) ni el equipo ni suspendidos ni correos vacíos', async () => {
    const { db, llamadas } = crearDb(base())
    const r = await suscribirAutomaticamente(db, { desde: '2026-12-01', desdeFormularios: '2026-12-01', ahora: AHORA })
    expect(r.activa).toBe(true)
    const correos = llamadas.map((l) => l.args.p_email).sort()
    expect(correos).toEqual(['ana@ejemplo.test', 'form@ejemplo.test', 'lead@ejemplo.test', 'pub@ejemplo.test'])
    expect(r.altas).toBe(4)
  })
  it('guarda versión y origen como prueba de qué se informó; la cuenta lleva su uid y el formulario no', async () => {
    const { db, llamadas } = crearDb(base())
    await suscribirAutomaticamente(db, { desde: '2026-12-01', desdeFormularios: '2026-12-01', ahora: AHORA })
    const ana = llamadas.find((l) => l.args.p_email === 'ana@ejemplo.test')!.args
    expect(ana).toMatchObject({ p_uid: 'u1', p_aceptar: true, p_version: `${VERSION_ALTA_AUTOMATICA}-cuenta` })
    const form = llamadas.find((l) => l.args.p_email === 'form@ejemplo.test')!.args
    expect(form).toMatchObject({ p_uid: null, p_version: `${VERSION_ALTA_AUTOMATICA}-formulario` })
  })
  it('sólo se leen cuentas activas y roles cliente/publicador (nunca admin)', async () => {
    const { db, filtros } = crearDb(base())
    await suscribirAutomaticamente(db, { desde: '2026-12-01', desdeFormularios: '2026-12-01', ahora: AHORA })
    expect(filtros).toContainEqual({ tabla: 'usuarios', op: 'eq', args: ['estado', 'activo'] })
    expect(filtros).toContainEqual({ tabla: 'usuarios', op: 'in', args: ['rol', ['cliente', 'publicador']] })
  })
})

describe('lo que nunca se revierte', () => {
  it('quien ya tiene fila (baja, rebote, queja o activa) NO se toca: una baja jamás se reactiva', async () => {
    const t = base()
    t.correo_suscriptores = [
      { email_norm: 'ana@ejemplo.test', estado: 'baja' }, { email_norm: 'pub@ejemplo.test', estado: 'queja' },
      { email_norm: 'form@ejemplo.test', estado: 'rebotada' }, { email_norm: 'lead@ejemplo.test', estado: 'activa' },
    ]
    const { db, llamadas } = crearDb(t)
    const r = await suscribirAutomaticamente(db, { desde: '2026-12-01', desdeFormularios: '2026-12-01', ahora: AHORA })
    expect(llamadas).toEqual([])
    expect(r).toMatchObject({ altas: 0, yaEstaban: 4 })
  })
  it('si no se puede leer la lista de suscriptores existentes, no se suscribe a nadie', async () => {
    const { db, llamadas } = crearDb(base(), { falla: 'correo_suscriptores' })
    const r = await suscribirAutomaticamente(db, { desde: '2026-12-01', desdeFormularios: '2026-12-01', ahora: AHORA })
    expect(llamadas).toEqual([])
    expect(r.altas).toBe(0)
    expect(r.fallidas).toBeGreaterThan(0)
  })
  it('una supresión o rebote que decide la base (bloqueada) se cuenta aparte y no cuenta como alta', async () => {
    const { db } = crearDb(base(), { respuesta: (a) => ({ estado: a.p_email === 'ana@ejemplo.test' ? 'bloqueada' : 'activa' }) })
    const r = await suscribirAutomaticamente(db, { desde: '2026-12-01', desdeFormularios: '2026-12-01', ahora: AHORA })
    expect(r).toMatchObject({ altas: 3, bloqueadas: 1, fallidas: 0 })
  })
  it('un error de la base en un alta no detiene a los demás y se cuenta como fallida', async () => {
    const { db } = crearDb(base(), { respuesta: (a) => (a.p_email === 'pub@ejemplo.test' ? null : { estado: 'activa' }) })
    const r = await suscribirAutomaticamente(db, { desde: '2026-12-01', desdeFormularios: '2026-12-01', ahora: AHORA })
    expect(r).toMatchObject({ altas: 3, fallidas: 1 })
  })
  it('el tope por corrida limita las altas', async () => {
    const { db, llamadas } = crearDb(base())
    const r = await suscribirAutomaticamente(db, { desde: '2026-12-01', desdeFormularios: '2026-12-01', ahora: AHORA, tope: 2 })
    expect(llamadas).toHaveLength(2)
    expect(r.altas).toBe(2)
  })
})

describe('piloto escalonado: interruptor separado por origen', () => {
  it('sólo cuentas: los correos de formularios y leads no se suscriben', async () => {
    const { db, llamadas } = crearDb(base())
    const r = await suscribirAutomaticamente(db, { desde: '2026-12-01', desdeFormularios: '2026-12-08', ahora: AHORA })
    expect(r.activa).toBe(true)
    expect(llamadas.map((l) => l.args.p_email).sort()).toEqual(['ana@ejemplo.test', 'pub@ejemplo.test'])
  })
  it('sólo formularios: las cuentas no se suscriben', async () => {
    const { db, llamadas } = crearDb(base())
    await suscribirAutomaticamente(db, { desde: '2026-12-08', desdeFormularios: '2026-12-01', ahora: AHORA })
    expect(llamadas.map((l) => l.args.p_email).sort()).toEqual(['ana@ejemplo.test', 'form@ejemplo.test', 'lead@ejemplo.test'])
  })
  it('con las dos fechas futuras o inválidas no se lee ni se escribe nada', async () => {
    const { db, llamadas } = crearDb(base())
    const r = await suscribirAutomaticamente(db, { desde: '2026-12-08', desdeFormularios: 'ya', ahora: AHORA })
    expect(r.activa).toBe(false)
    expect(llamadas).toEqual([])
  })
})
