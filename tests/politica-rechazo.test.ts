import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * CONFIRMACIÓN DE PUBLICACIÓN SEGÚN ROL Y ESTADO REAL (Etapa 5).
 *
 * Incidencia del propietario en producción: al publicar como Super Admin la pantalla no confirmaba si quedó publicada, decía que se
 * había enviado a un administrador para revisión, y no estaba claro de quién era el anuncio.
 *
 * QUÉ SIMULA ESTA PRUEBA (y qué no): las rutas son las REALES (`/estado`, `/publicador/propiedades`, `PATCH /admin/propiedades/[id]`)
 * y el perfil lo calcula el código REAL (`resolverPerfil`); lo que se simula es la BASE: una tabla en memoria que imita PostgREST y la
 * función SQL `propiedad_cambiar_estado` (el doble que se compara con el SQL real en PGlite). NO prueba Supabase, Vercel ni producción,
 * ni el navegador: la pantalla se prueba en `tests-visual/e48-confirmacion.e2e.ts`. Datos 100 % sintéticos.
 */

const mundo = vi.hoisted(() => ({
  sesion: { uid: 'U1', email: 'u1@ejemplo.test', fila: { rol: 'publicador', estado: 'activo' } as Record<string, unknown> },
  usuarios: [] as Array<Record<string, unknown>>,
  props: [] as Array<Record<string, unknown>>,
  auditoria: [] as Array<Record<string, unknown>>,
  /** La función de cambio de estado falla (p. ej. la base no contesta): el borrador debe quedar intacto. */
  rpcFalla: false,
  /** La relectura posterior al cambio no se puede hacer: la respuesta no debe afirmar nada. */
  fallarRelectura: false,
}))

const NUBE = 'nube-prueba'
const foto = (n: number | string) => `https://res.cloudinary.com/${NUBE}/image/upload/v1/prop/${n}.jpg`
const CONTENIDO = {
  titulo: 'Casa en León', descripcion: 'Una casa muy bonita con jardín amplio y cochera para dos autos.', ubicacion: 'León, Gto.',
  precio: 2_500_000, tipo: 'casa', operacion: 'venta', metros: 180, fotos: ['1', '2', '3', '4', '5', '6'].map(foto),
}
const propiedad = (id: string, owner: string, estado = 'borrador', extra: Record<string, unknown> = {}) =>
  ({ id, owner_id: owner, estado_pub: estado, estatus: 'disponible', folio: `VB-2026-${id}`, ...CONTENIDO, ...extra })

vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const { puede } = await import('../src/lib/acceso/permisos')
  const cadena = (tabla: string) => {
    const filtros: Array<[string, unknown]> = []
    const ins: Array<[string, unknown[]]> = []
    let soloConteo = false
    let columnas = '*'
    let cambios: Record<string, unknown> | null = null
    let fila: Record<string, unknown> | null = null
    const c: Record<string, unknown> = {}
    const filas = () => (tabla === 'propiedades' ? mundo.props : tabla === 'usuarios' ? mundo.usuarios : [])
      .filter((f) => filtros.every(([k, v]) => f[k] === v) && ins.every(([k, vs]) => vs.includes(f[k])))
    c.select = (cols?: string, o?: { head?: boolean }) => { if (cols) columnas = cols; if (o?.head) soloConteo = true; return c }
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    c.in = (k: string, vs: unknown[]) => { ins.push([k, vs]); return c }
    c.order = () => c
    c.delete = () => c
    c.update = (f: Record<string, unknown>) => { cambios = f; return c }
    c.insert = (f: Record<string, unknown>) => { fila = f; return c }
    c.maybeSingle = async () => {
      // La relectura del estado canónico pide exactamente estas columnas: aquí se puede hacer fallar.
      if (mundo.fallarRelectura && /slug, owner_id/.test(columnas)) return { data: null, error: { message: 'sin conexión' } }
      return { data: filas()[0] ? { ...filas()[0] } : null, error: null }
    }
    c.then = (r: (v: unknown) => unknown) => {
      if (fila) { if (tabla === 'propiedades') mundo.props.push({ folio: `VB-2026-N${mundo.props.length + 1}`, ...fila }); return r({ data: null, error: null }) }
      if (cambios) {
        const afectadas = filas()
        for (const f of afectadas) Object.assign(f, cambios)
        return r({ data: afectadas.map((f) => ({ id: f.id })), error: null })
      }
      if (soloConteo) return r({ data: null, error: null, count: filas().length })
      return r({ data: filas().map((f) => ({ ...f })), error: null })
    }
    return c
  }
  const autorizar = () => real.crearAutorizador({
    verificar: async () => ({ uid: mundo.sesion.uid, email: mundo.sesion.email, emailVerified: true }),
    perfil: async (u) => real.resolverPerfil(u, mundo.sesion.fila),
    denegado: async () => {},
  })
  return {
    ...real,
    supabaseAdmin: () => ({
      from: (t: string) => cadena(t),
      rpc: async (fn: string, a: Parameters<typeof propiedadCambiarEstado>[2]) => {
        if (fn !== 'propiedad_cambiar_estado') return { data: null, error: { message: `rpc inesperada ${fn}` } }
        if (mundo.rpcFalla) return { data: null, error: { message: 'connection reset', code: '08006' } }
        return propiedadCambiarEstado(mundo.props, mundo.auditoria, a)
      },
    }),
    exigir: (req: Request, permiso: Parameters<typeof real.exigir>[1]) => autorizar()(req, (p) => puede(p, permiso), permiso),
    registrarIntentoDenegado: async () => {},
  }
})
vi.mock('@/lib/auditoria', () => ({ registrar: async (e: Record<string, unknown>) => { mundo.auditoria.push(e) } }))
vi.mock('@/lib/alertas', () => ({ avisar: async () => {} }))
vi.mock('@/lib/config/flags-servidor', () => import('./dobles/flags-portal')) // R8.6: portal abierto por defecto
vi.mock('@/lib/refrescar', () => ({ refrescarCatalogo: () => {} }))
vi.mock('@/lib/asignar-slug', () => ({ asignarSlugAlPublicar: async () => null, nombrarSiEstaPublicada: async () => {} }))

import { propiedadCambiarEstado } from './dobles/propiedad-cambiar-estado'
import { POST as cambiarEstado } from '../src/app/api/propiedades/[id]/estado/route'
import { PATCH as editarPropiedad } from '../src/app/api/admin/propiedades/[id]/route'

const R = (url: string, cuerpo?: unknown, metodo = 'POST') =>
  new Request(`https://vivebienn.com${url}`, {
    method: metodo,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const contacto = { nombre: 'Persona de Prueba', telefono: '4771112233', whatsapp: '4771112233' }

/** Inicia sesión como una cuenta sintética (el rol y la modalidad salen de la «fila», como en producción). */
function entrarComo(uid: string, fila: Record<string, unknown>) {
  mundo.sesion = { uid, email: `${uid.toLowerCase()}@ejemplo.test`, fila: { estado: 'activo', ...fila } }
  const ya = mundo.usuarios.find((u) => u.uid === uid)
  if (ya) Object.assign(ya, { ...fila, estado: 'activo' })
  else mundo.usuarios.push({ uid, email: mundo.sesion.email, estado: 'activo', ...contacto, ...fila })
}
const estadoEnBase = (id: string) => mundo.props.find((p) => p.id === id)?.estado_pub
const enviar = (id: string, estado: string, extra: Record<string, unknown> = {}) => cambiarEstado(R(`/api/propiedades/${id}/estado`, { estado, ...extra }), ctx(id))

beforeEach(() => {
  mundo.usuarios = []
  mundo.props = []
  mundo.auditoria = []
  mundo.rpcFalla = false
  mundo.fallarRelectura = false
})


import {
  decidirPublicacionAutomatica, destinoDePublicacion, publicaSinRevisionEfectiva, tieneObservacionesDelRevisor,
} from '../src/lib/publicacion'

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// POLÍTICA (Etapa 6): después de un rechazo o de «cambios solicitados», la publicación directa se cierra hasta que un revisor apruebe.
// Antes: un asociado (o quien tuviera `publicar_sin_revision`) podía ir `rechazada → borrador → publicada` y saltarse al revisor.
// Decisión conservadora: no existía ninguna decisión que lo permitiera (ADR-0013: «sin revisión no es sin reglas»). La publicación directa
// de los anuncios SIN observaciones no cambia. Marca: `nota_moderacion` (el servidor la escribe al rechazar / pedir cambios y la
// reescribe —null si no hay nota— al aprobar).
const NOTA = 'Faltan fotos del interior y el precio no coincide con la descripción.'
const ASOCIADO = { rol: 'publicador', tipo_publicador: 'asociado', permisos_override: {} }
const PUBLICADOR = { rol: 'publicador', tipo_publicador: 'publicador', permisos_override: {} }

describe('un rechazo o unos cambios solicitados cierran la publicación directa hasta que un revisor apruebe', () => {
  for (const previo of ['rechazada', 'cambios_solicitados'] as const) {
    it(`asociado: ${previo} → borrador → publicada se rechaza (403 requiere_revision); por revisión sí se puede`, async () => {
      entrarComo('U1', ASOCIADO)
      mundo.props = [propiedad('p1', 'U1', previo, { nota_moderacion: NOTA, revisado_por: 'rev@vivebienn.com' })]
      // paso 1: volver a borrador está permitido (es lo que hace quien corrige)
      expect((await enviar('p1', 'borrador')).status).toBe(200)
      expect(estadoEnBase('p1')).toBe('borrador')
      // paso 2: publicar directo, NO
      const r = await enviar('p1', 'publicada')
      expect(r.status).toBe(403)
      const j = (await r.json()) as { error: string; codigo?: string }
      expect(j.codigo).toBe('requiere_revision')
      expect(j.error).toMatch(/observaciones del revisor/)
      expect(estadoEnBase('p1')).toBe('borrador')
      expect(mundo.auditoria.some((a) => a.accion === 'propiedad.publicada')).toBe(false)
      // el camino correcto sigue abierto
      expect((await enviar('p1', 'en_revision')).status).toBe(200)
      expect(estadoEnBase('p1')).toBe('en_revision')
    })
  }

  it('sin observaciones (anuncio nuevo, o ya aprobado) la publicación directa del asociado NO cambia', async () => {
    entrarComo('U1', ASOCIADO)
    for (const nota of [undefined, null, '', '   ']) {
      mundo.props = [propiedad('p1', 'U1', 'borrador', { nota_moderacion: nota })]
      const j = (await (await enviar('p1', 'publicada')).json()) as { estado?: string; via?: string }
      expect(j, JSON.stringify(nota)).toMatchObject({ estado: 'publicada', via: 'autopublicacion' })
    }
  })

  it('admin y Super Admin no se ven afectados (ellos SON el revisor), aunque su anuncio tenga nota', async () => {
    for (const fila of [{ rol: 'admin' }, { rol: 'super_admin' }]) {
      entrarComo('U1', fila)
      mundo.props = [propiedad('p1', 'U1', 'borrador', { nota_moderacion: NOTA })]
      expect((await enviar('p1', 'publicada')).status).toBe(200)
      expect(estadoEnBase('p1')).toBe('publicada')
    }
  })

  it('el publicador sin permiso sigue como antes: no publica nunca, con o sin nota; puede enviar a revisión', async () => {
    entrarComo('U1', PUBLICADOR)
    for (const nota of [null, NOTA]) {
      mundo.props = [propiedad('p1', 'U1', 'borrador', { nota_moderacion: nota })]
      expect((await enviar('p1', 'publicada')).status).toBe(403)
      expect((await enviar('p1', 'en_revision')).status).toBe(200)
    }
  })

  it('el navegador no decide: mandar vía, rol o capacidades en el cuerpo no abre la publicación directa', async () => {
    entrarComo('U1', ASOCIADO)
    mundo.props = [propiedad('p1', 'U1', 'borrador', { nota_moderacion: NOTA })]
    const r = await enviar('p1', 'publicada', { rol: 'admin', superAdmin: true, capacidades: { publicar_sin_revision: true }, nota_moderacion: null, via: 'moderacion' })
    expect(r.status).toBe(403)
    expect(estadoEnBase('p1')).toBe('borrador')
    // y la nota no se puede borrar por la ruta de edición
    const e = await editarPropiedad(R('/api/admin/propiedades/p1', { nota_moderacion: null, revisado_por: null }, 'PATCH'), ctx('p1'))
    expect([200, 400]).toContain(e.status)
    expect(mundo.props[0].nota_moderacion).toBe(NOTA)
  })

  it('CICLO COMPLETO por las rutas reales: envío → rechazo → corrección → solo por revisión → aprobación limpia la marca → vuelve la publicación directa', async () => {
    mundo.props = [propiedad('p1', 'U1', 'borrador')]
    // 1. el asociado envía a revisión (p. ej. porque quiso)
    entrarComo('U1', ASOCIADO)
    expect((await enviar('p1', 'en_revision')).status).toBe(200)
    // 2. el revisor rechaza con motivo
    entrarComo('ADM', { rol: 'admin' })
    expect((await enviar('p1', 'rechazada', { nota: NOTA })).status).toBe(200)
    expect(mundo.props[0].nota_moderacion).toBe(NOTA)
    // 3. el asociado corrige: vuelve a borrador, intenta publicar directo (bloqueado) y envía a revisión
    entrarComo('U1', ASOCIADO)
    expect((await enviar('p1', 'borrador')).status).toBe(200)
    expect((await enviar('p1', 'publicada')).status).toBe(403)
    expect((await enviar('p1', 'en_revision')).status).toBe(200)
    // 4. el revisor aprueba (sin nota): la marca se limpia
    entrarComo('ADM', { rol: 'admin' })
    expect((await enviar('p1', 'publicada')).status).toBe(200)
    expect(mundo.props[0].nota_moderacion ?? null).toBeNull()
    // 5. un admin lo devuelve a borrador para corregir algo y el asociado, que ya fue aprobado, vuelve a publicar directo
    expect((await enviar('p1', 'borrador')).status).toBe(200)
    entrarComo('U1', ASOCIADO)
    const j = (await (await enviar('p1', 'publicada')).json()) as { estado?: string; via?: string }
    expect(j).toMatchObject({ estado: 'publicada', via: 'autopublicacion' })
  })
})

describe('las pantallas y los caminos automáticos usan la MISMA regla', () => {
  it('tieneObservacionesDelRevisor / publicaSinRevisionEfectiva', () => {
    expect(tieneObservacionesDelRevisor({ nota_moderacion: NOTA })).toBe(true)
    for (const v of [null, undefined, '', '  ', 0, {}, []]) expect(tieneObservacionesDelRevisor({ nota_moderacion: v }), JSON.stringify(v)).toBe(false)
    expect(tieneObservacionesDelRevisor(null)).toBe(false)
    expect(publicaSinRevisionEfectiva(true, { nota_moderacion: NOTA })).toBe(false)
    expect(publicaSinRevisionEfectiva(true, { nota_moderacion: null })).toBe(true)
    expect(publicaSinRevisionEfectiva(false, { nota_moderacion: null })).toBe(false)
  })

  it('el botón del editor y del panel pide «en_revision» (no «publicada») cuando hay observaciones', () => {
    expect(destinoDePublicacion('borrador', false, publicaSinRevisionEfectiva(true, { nota_moderacion: NOTA }))).toBe('en_revision')
    expect(destinoDePublicacion('borrador', false, publicaSinRevisionEfectiva(true, { nota_moderacion: null }))).toBe('publicada')
    expect(destinoDePublicacion('borrador', true, publicaSinRevisionEfectiva(false, { nota_moderacion: NOTA }))).toBe('publicada') // admin
  })

  it('decidirPublicacionAutomatica (Telegram, alta manual, importadores) tampoco publica con observaciones pendientes', () => {
    const base = { titulo: 'Casa', descripcion: 'x'.repeat(80), ubicacion: 'León', precio: 1, tipo: 'casa', operacion: 'venta', metros: 10, fotos: ['1', '2', '3', '4', '5'].map((n) => `https://res.cloudinary.com/n/image/upload/${n}.jpg`) }
    expect(decidirPublicacionAutomatica({ rol: 'publicador', activa: true, publicaSinRevision: true, prop: { ...base } })).toMatchObject({ ok: true, destino: 'publicada' })
    expect(decidirPublicacionAutomatica({ rol: 'publicador', activa: true, publicaSinRevision: true, prop: { ...base, nota_moderacion: NOTA } })).toMatchObject({ ok: true, destino: 'en_revision', autopublica: false })
    expect(decidirPublicacionAutomatica({ rol: 'admin', activa: true, publicaSinRevision: false, prop: { ...base, nota_moderacion: NOTA } })).toMatchObject({ ok: true, destino: 'publicada' })
  })

  it('la pantalla dice la verdad antes de enviar: con observaciones explica que habrá revisión', async () => {
    const { textoPrevioAlEnvio, modoDeEnvio } = await import('../src/lib/publicador/confirmacion')
    const modo = modoDeEnvio({ permisosCargados: true, esAdmin: false, publicaSinRevision: publicaSinRevisionEfectiva(true, { nota_moderacion: NOTA }) })
    expect(modo).toBe('revision')
    expect(textoPrevioAlEnvio(modo, false, true)).toMatch(/observaciones/)
    expect(textoPrevioAlEnvio('revision', false, false)).not.toMatch(/observaciones/)
  })
})
