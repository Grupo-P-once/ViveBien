import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
import { POST as crear, GET as listar } from '../src/app/api/publicador/propiedades/route'
import { PATCH as editarPropiedad } from '../src/app/api/admin/propiedades/[id]/route'
import {
  confirmacionDeEnvio, confirmacionDeGuardado, confirmacionDeTransicionFallida, etiquetaDelBoton, modoDeEnvio, rutaPublicaValida,
  textoPrevioAlEnvio, type RespuestaDeEstado,
} from '../src/lib/publicador/confirmacion'

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
  vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', NUBE)
  mundo.usuarios = []
  mundo.props = []
  mundo.auditoria = []
  mundo.rpcFalla = false
  mundo.fallarRelectura = false
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('el servidor decide y CONFIRMA el estado real, según el perfil efectivo', () => {
  const quienPublicaDirecto: Array<[string, Record<string, unknown>, 'moderacion' | 'autopublicacion']> = [
    ['Super Admin', { rol: 'super_admin' }, 'moderacion'],
    ['Admin', { rol: 'admin' }, 'moderacion'],
    ['Asociado (permiso de la modalidad)', { rol: 'publicador', tipo_publicador: 'asociado', permisos_override: {} }, 'autopublicacion'],
    ['Publicador con el permiso concedido por ajuste', { rol: 'publicador', tipo_publicador: 'publicador', permisos_override: { publicar_sin_revision: true } }, 'autopublicacion'],
  ]

  it.each(quienPublicaDirecto)('%s: publica → el servidor devuelve publicada, la vía, el enlace y que es suya; la base queda publicada', async (_n, fila, via) => {
    entrarComo('U1', fila)
    mundo.props = [propiedad('p1', 'U1')]
    const res = await enviar('p1', 'publicada')
    const j = (await res.json()) as RespuestaDeEstado
    expect(res.status).toBe(200)
    expect(j).toMatchObject({ ok: true, estado: 'publicada', confirmado: true, via, esTuya: true, ruta: '/propiedades/p1' })
    expect(estadoEnBase('p1')).toBe('publicada')
    // La bitácora distingue la autopublicación (nadie la revisó) de la que hace quien modera.
    const huella = mundo.auditoria.find((a) => a.accion === 'propiedad.publicada') as { despues?: Record<string, unknown> } | undefined
    expect(Boolean(huella?.despues?.sinRevision)).toBe(via === 'autopublicacion')

    // El mensaje que la pantalla muestra con esa respuesta (y con la propiedad recargada): publicación, con enlace, NUNCA revisión.
    const c = confirmacionDeEnvio(j, { estado_pub: 'publicada' })
    expect(c.tipo).toBe('publicada')
    expect(c.titulo).toBe('Propiedad publicada')
    expect(c).toMatchObject({ ruta: '/propiedades/p1' })
    // Una publicación directa nunca dice que un administrador la revisará ni que se envió a revisión.
    expect(`${c.titulo} ${c.detalle}`).not.toMatch(/administrador lo revisa|Enviado a revisi/i)
    if (via === 'moderacion') expect(c.detalle).not.toMatch(/revis/i)
  })

  const quienVaARevision: Array<[string, Record<string, unknown>]> = [
    ['Publicador sin permiso', { rol: 'publicador', tipo_publicador: 'publicador', permisos_override: {} }],
    ['Asociado sin permiso (apagado por ajuste)', { rol: 'publicador', tipo_publicador: 'asociado', permisos_override: { publicar_sin_revision: false } }],
  ]

  it.each(quienVaARevision)('%s: enviar → en_revision, sin enlace; y pedir «publicada» a mano lo rechaza el servidor', async (_n, fila) => {
    entrarComo('U1', fila)
    mundo.props = [propiedad('p1', 'U1')]
    // El navegador puede MANDAR lo que quiera (rol, capacidades, vía): el servidor solo mira el perfil efectivo.
    const trampa = await enviar('p1', 'publicada', { rol: 'admin', superAdmin: true, capacidades: { publicar_sin_revision: true }, via: 'moderacion' })
    expect(trampa.status).toBe(403)
    expect(estadoEnBase('p1')).toBe('borrador')

    const res = await enviar('p1', 'en_revision')
    const j = (await res.json()) as RespuestaDeEstado
    expect(res.status).toBe(200)
    expect(j).toMatchObject({ ok: true, estado: 'en_revision', confirmado: true, via: 'revision', esTuya: true })
    expect(j.ruta).toBeUndefined()
    expect(estadoEnBase('p1')).toBe('en_revision')

    const c = confirmacionDeEnvio(j, { estado_pub: 'en_revision' })
    expect(c.tipo).toBe('en_revision')
    expect(c.titulo).toBe('Enviado a revisión')
    expect(c.detalle).toMatch(/Aún no está publicado/)
    expect(c).not.toHaveProperty('ruta')
  })

  it('la ruta pública es la CANÓNICA: usa el slug si lo hay, y no se da si el anuncio no es visible al público', async () => {
    entrarComo('ADM', { rol: 'admin' })
    mundo.props = [propiedad('p1', 'ADM', 'borrador', { slug: 'casa-en-leon-ab12' }), propiedad('p2', 'ADM', 'borrador', { estatus: 'pausada' })]
    const a = (await (await enviar('p1', 'publicada')).json()) as RespuestaDeEstado
    expect(a.ruta).toBe('/propiedades/casa-en-leon-ab12')
    // Publicada pero pausada: el servidor lo publica y NO ofrece «Ver publicación» (el público no la vería: sería un enlace roto).
    const b = (await (await enviar('p2', 'publicada')).json()) as RespuestaDeEstado
    expect(b).toMatchObject({ estado: 'publicada', confirmado: true })
    expect(b.ruta).toBeUndefined()
  })

  it('si el servidor no puede RELEER el estado, no afirma nada: confirmado=false y la pantalla dice que no pudo confirmar', async () => {
    entrarComo('ADM', { rol: 'admin' })
    mundo.props = [propiedad('p1', 'ADM')]
    mundo.fallarRelectura = true
    const j = (await (await enviar('p1', 'publicada')).json()) as RespuestaDeEstado
    expect(j.confirmado).toBe(false)
    expect(j.ruta).toBeUndefined()
    const c = confirmacionDeEnvio(j, { estado_pub: 'publicada' })
    expect(c.tipo).toBe('sin_confirmar')
    expect(c.titulo).not.toMatch(/Propiedad publicada/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('borrador, fallos y reintento (sin duplicar anuncios ni fotos)', () => {
  it('solo guardar: el estado SIGUE siendo borrador y el mensaje es «Borrador guardado» (nunca publicado ni enviado a revisión)', async () => {
    for (const fila of [{ rol: 'super_admin' }, { rol: 'admin' }, { rol: 'publicador', tipo_publicador: 'asociado' }, { rol: 'publicador', tipo_publicador: 'publicador' }]) {
      mundo.props = [propiedad('p1', 'U1')]
      entrarComo('U1', fila)
      const g = await editarPropiedad(R('/api/admin/propiedades/p1', { descripcion: 'Una casa muy bonita con jardín amplio, cochera para tres autos y cuarto de servicio.' }, 'PATCH'), ctx('p1'))
      expect(g.status).toBe(200)
      const lista = (await (await listar(R('/api/publicador/propiedades', undefined, 'GET'))).json()) as Array<{ id: string; estado_pub: string }>
      const recargada = lista.find((p) => p.id === 'p1')!
      expect(recargada.estado_pub).toBe('borrador')
      const c = confirmacionDeGuardado(recargada)
      expect(c.tipo).toBe('borrador')
      expect(c.titulo).toBe('Borrador guardado')
      expect(`${c.titulo} ${c.detalle}`).not.toMatch(/Propiedad publicada|Enviado a revisión/)
    }
  })

  it('guardado correcto + transición fallida: sigue borrador, se explica que solo se guardó el borrador, y el reintento publica SIN crear otro anuncio', async () => {
    entrarComo('ADM', { rol: 'super_admin' })
    mundo.props = [propiedad('p1', 'ADM')]
    const antes = JSON.stringify(mundo.props)
    mundo.rpcFalla = true
    const fallo = await enviar('p1', 'publicada')
    expect(fallo.status).toBeGreaterThanOrEqual(500)
    const error = ((await fallo.json()) as { error: string }).error
    expect(estadoEnBase('p1')).toBe('borrador')
    expect(JSON.stringify(mundo.props)).toBe(antes) // nada se tocó: ni estado, ni fotos, ni datos
    const c = confirmacionDeTransicionFallida('publicada', error)
    expect(c.tipo).toBe('transicion_fallida')
    expect(c.titulo).toMatch(/borrador sí quedó guardado/)
    expect(c.titulo).toMatch(/la publicación/)
    expect(c.detalle).toMatch(/Solo se guardó el borrador/)
    expect(c.detalle).toMatch(/reintentar sin crear otro anuncio ni volver a subir las fotos/)
    expect(confirmacionDeTransicionFallida('en_revision', 'x').titulo).toMatch(/el envío a revisión/)

    // Reintento: la MISMA propiedad pasa a publicada; no aparece otra fila y las fotos siguen siendo las mismas.
    mundo.rpcFalla = false
    const ok = (await (await enviar('p1', 'publicada')).json()) as RespuestaDeEstado
    expect(ok).toMatchObject({ estado: 'publicada', confirmado: true })
    expect(mundo.props).toHaveLength(1)
    expect((mundo.props[0].fotos as string[]).length).toBe(6)
    expect(mundo.auditoria.filter((a) => a.accion === 'propiedad.publicada')).toHaveLength(1)
    // Un reintento de más (la respuesta anterior se perdió) no duplica nada: el servidor dice que ya estaba así.
    const otra = await enviar('p1', 'publicada')
    expect(otra.status).toBe(403)
    expect(mundo.props).toHaveLength(1)
    expect(mundo.auditoria.filter((a) => a.accion === 'propiedad.publicada')).toHaveLength(1)
  })

  it('error de guardado: el servidor rechaza, NO cambia nada y la respuesta no trae ningún estado que se pueda leer como éxito', async () => {
    entrarComo('U1', { rol: 'publicador', tipo_publicador: 'publicador' })
    mundo.props = [propiedad('p1', 'U1')]
    const antes = JSON.stringify(mundo.props)
    const res = await editarPropiedad(R('/api/admin/propiedades/p1', { fotos: ['https://sitio-ajeno.example/x.jpg'] }, 'PATCH'), ctx('p1'))
    expect(res.status).toBe(400)
    const j = (await res.json()) as Record<string, unknown>
    expect(j.error).toBeTruthy()
    expect(j.ok).toBeUndefined()
    expect(JSON.stringify(mundo.props)).toBe(antes)
  })

  it('el mensaje NO se decide con una variable previa: si la respuesta y la recarga no coinciden (o no hay recarga) no se afirma nada', () => {
    const publicada: RespuestaDeEstado = { ok: true, estado: 'publicada', confirmado: true, via: 'moderacion', ruta: '/propiedades/p1' }
    expect(confirmacionDeEnvio(publicada, { estado_pub: 'en_revision' }).tipo).toBe('sin_confirmar')
    expect(confirmacionDeEnvio(publicada, { estado_pub: 'borrador' }).tipo).toBe('sin_confirmar')
    expect(confirmacionDeEnvio(publicada, null).tipo).toBe('sin_confirmar')
    expect(confirmacionDeEnvio({ ok: true }, { estado_pub: 'publicada' }).tipo).toBe('sin_confirmar') // sin estado en la respuesta
    expect(confirmacionDeEnvio({ ...publicada, confirmado: false }, { estado_pub: 'publicada' }).tipo).toBe('sin_confirmar')
    // Un servidor anterior (solo ok + estado) sigue funcionando si la recarga coincide.
    expect(confirmacionDeEnvio({ ok: true, estado: 'en_revision' }, { estado_pub: 'en_revision' }).tipo).toBe('en_revision')
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('propietario y visibilidad: lo que crea una cuenta es de esa cuenta', () => {
  it('Super Admin crea → el dueño es él (aunque el cuerpo diga otro dueño o estado); aparece en su panel como suyo y NO en el de un asociado', async () => {
    mundo.usuarios = [
      { uid: 'ASOC', email: 'asoc@ejemplo.test', rol: 'publicador', tipo_publicador: 'asociado', permisos_override: {}, estado: 'activo', ...contacto },
    ]
    mundo.props = [propiedad('de-asoc', 'ASOC', 'publicada')]
    entrarComo('SUPER', { rol: 'super_admin' })

    const nuevo = await crear(R('/api/publicador/propiedades', { titulo: 'Anuncio creado por Super Admin', owner_id: 'ASOC', estado_pub: 'publicada' }))
    expect(nuevo.status).toBe(200)
    const { id } = (await nuevo.json()) as { id: string }
    const fila = mundo.props.find((p) => p.id === id)!
    expect(fila.owner_id).toBe('SUPER')
    expect(fila.estado_pub).toBe('borrador') // nace borrador siempre; publicar es una transición aparte

    // Se completa y se publica: sigue siendo del Super Admin.
    Object.assign(fila, { ...CONTENIDO })
    const pub = (await (await enviar(id, 'publicada')).json()) as RespuestaDeEstado
    expect(pub).toMatchObject({ estado: 'publicada', esTuya: true, via: 'moderacion' })
    expect(mundo.props.find((p) => p.id === id)!.owner_id).toBe('SUPER')

    // Panel del Super Admin: ve lo suyo marcado como suyo y lo de otras cuentas marcado como ajeno (regla de visibilidad sin cambios).
    const suyo = (await (await listar(R('/api/publicador/propiedades', undefined, 'GET'))).json()) as Array<{ id: string; es_mia: boolean; estado_pub: string }>
    expect(suyo.find((p) => p.id === id)).toMatchObject({ es_mia: true, estado_pub: 'publicada' })
    expect(suyo.find((p) => p.id === 'de-asoc')).toMatchObject({ es_mia: false })

    // Panel del asociado: ve SOLO lo suyo; lo del Super Admin no aparece.
    entrarComo('ASOC', { rol: 'publicador', tipo_publicador: 'asociado', permisos_override: {} })
    const delAsociado = (await (await listar(R('/api/publicador/propiedades', undefined, 'GET'))).json()) as Array<{ id: string; es_mia: boolean }>
    expect(delAsociado.map((p) => p.id)).toEqual(['de-asoc'])
    expect(delAsociado.every((p) => p.es_mia === true)).toBe(true)
    // …y no puede mover el anuncio ajeno.
    expect((await enviar(id, 'borrador')).status).toBe(403)
  })

  it('la respuesta pública de la lista nunca trae el correo del revisor ni el contacto interno (sin cambios por el campo nuevo)', async () => {
    entrarComo('U1', { rol: 'publicador', tipo_publicador: 'publicador' })
    mundo.props = [propiedad('p1', 'U1', 'publicada', { revisado_por: 'rev@vivebienn.com', whatsapp: '4770000000', telefono: '4770000001' })]
    const lista = (await (await listar(R('/api/publicador/propiedades', undefined, 'GET'))).json()) as Array<Record<string, unknown>>
    expect(lista[0]).not.toHaveProperty('revisado_por')
    expect(lista[0]).not.toHaveProperty('whatsapp')
    expect(lista[0]).not.toHaveProperty('telefono')
    expect(lista[0].es_mia).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('textos de la pantalla (lógica pura)', () => {
  it('el texto previo solo habla de revisión cuando de verdad habrá revisión', () => {
    const directoAdmin = textoPrevioAlEnvio('directo', true)
    const directoAsociado = textoPrevioAlEnvio('directo', false)
    const revision = textoPrevioAlEnvio('revision', false)
    const desconocido = textoPrevioAlEnvio('desconocido', false)
    expect(directoAdmin).toMatch(/se publica en el sitio de inmediato/)
    expect(directoAdmin).not.toMatch(/revisa|revisará|administrador/)
    expect(directoAsociado).toMatch(/permiso para publicar sin revisión/)
    expect(directoAsociado).not.toMatch(/un administrador lo revisa/)
    expect(revision).toMatch(/un administrador lo revisa/)
    // Si todavía no se sabe qué permisos tiene la cuenta, no promete ni una cosa ni la otra.
    expect(desconocido).not.toMatch(/un administrador lo revisa|se publica en el sitio de inmediato/)
  })

  it('el modo sale de los permisos efectivos que dijo el servidor, y mientras no se sepan es «desconocido»', () => {
    expect(modoDeEnvio({ permisosCargados: false, esAdmin: true, publicaSinRevision: true })).toBe('desconocido')
    expect(modoDeEnvio({ permisosCargados: true, esAdmin: true, publicaSinRevision: false })).toBe('directo')
    expect(modoDeEnvio({ permisosCargados: true, esAdmin: false, publicaSinRevision: true })).toBe('directo')
    expect(modoDeEnvio({ permisosCargados: true, esAdmin: false, publicaSinRevision: false })).toBe('revision')
    expect(etiquetaDelBoton('directo', false)).toBe('Publicar ahora')
    expect(etiquetaDelBoton('revision', false)).toBe('Enviar a revisión')
    expect(etiquetaDelBoton('desconocido', false)).toBe('Enviar')
  })

  it('«Ver publicación» solo acepta rutas internas de propiedades (nunca otro sitio, ni esquemas, ni rutas anidadas)', () => {
    expect(rutaPublicaValida('/propiedades/casa-en-leon-ab12')).toBe('/propiedades/casa-en-leon-ab12')
    expect(rutaPublicaValida('/propiedades/Casa%20en%20Le%C3%B3n')).toBe('/propiedades/Casa%20en%20Le%C3%B3n')
    for (const mala of ['https://sitio-ajeno.example/propiedades/x', '//sitio-ajeno.example/x', 'javascript:alert(1)', '/admin', '/propiedades/', '/propiedades/a/b', '/propiedades/x?y=1', '/propiedades/x#z', '/propiedades/a:b', '', null, undefined, 42]) {
      expect(rutaPublicaValida(mala as never), String(mala)).toBeNull()
    }
    // Una respuesta con ruta ajena se confirma igual, pero SIN enlace.
    const c = confirmacionDeEnvio({ ok: true, estado: 'publicada', confirmado: true, ruta: 'https://sitio-ajeno.example/x' }, { estado_pub: 'publicada' })
    expect(c).toMatchObject({ tipo: 'publicada', ruta: null })
  })

  it('guardar cambios en una ya publicada confirma «Cambios guardados» (con enlace solo si la ruta es válida)', () => {
    expect(confirmacionDeGuardado({ estado_pub: 'publicada' }, '/propiedades/p1')).toMatchObject({ tipo: 'cambios_guardados', ruta: '/propiedades/p1' })
    expect(confirmacionDeGuardado({ estado_pub: 'publicada' }, 'https://x.example')).toMatchObject({ tipo: 'cambios_guardados', ruta: null })
    expect(confirmacionDeGuardado(null).tipo).toBe('sin_confirmar')
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('guardas sobre el código fuente de las pantallas (son comprobaciones de texto: la conducta se prueba en e48-confirmacion.e2e.ts)', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, '..', ...ruta), 'utf8')
  const editor = leer('src', 'app', 'publicador', 'propiedades', '[id]', 'editar', 'page.tsx')
  const panel = leer('src', 'components', 'portal', 'MisPropiedades.tsx')

  it('el editor ya no tiene el texto que prometía revisión a todos, y usa la región de estado (no un alert asertivo) para confirmar', () => {
    expect(editor).not.toMatch(/Al enviarlo, un administrador lo revisa/)
    expect(editor).toMatch(/textoPrevioAlEnvio\(modo, esAdmin, /)
    expect(editor).toMatch(/role="status" aria-live="polite" aria-atomic="true" data-confirmacion/)
    // La confirmación nunca se pinta con role="alert" ni mueve el foco.
    const bloque = editor.slice(editor.indexOf('data-confirmacion'), editor.indexOf('Navegación entre pasos'))
    expect(bloque).not.toMatch(/role="alert"|\.focus\(\)/)
  })

  it('el editor no decide el mensaje con el texto del botón: usa la respuesta del servidor y la recarga', () => {
    expect(editor).toMatch(/confirmacionDeEnvio\(j, recargada\)/)
    expect(editor).toMatch(/const recargada = await cargar\(\)/)
    expect(editor).toMatch(/confirmacionDeTransicionFallida\(/)
  })

  it('el panel confirma con lo que respondió el servidor y ya no inventa «Enviada a revisión» según lo que se pidió', () => {
    expect(panel).not.toMatch(/estado === 'en_revision' \? 'Enviada a revisión\.'/)
    expect(panel).toMatch(/confirmacionDeEnvio\(j, lista\?\.find/)
    expect(panel).toMatch(/role="status" aria-live="polite" aria-atomic="true" data-aviso/)
    // La frase «Enviada a revisión» del listado sale solo del estado en_revision.
    expect(panel).not.toMatch(/'Enviada a revisión\.'/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('una propiedad PUBLICADA no se puede dejar incompleta con una edición (hallazgo de la revisión de roles, Etapa 5)', () => {
  const quienesEditanLoPublicado: Array<[string, Record<string, unknown>]> = [
    ['Asociado con editar_publicadas', { rol: 'publicador', tipo_publicador: 'asociado', permisos_override: {} }],
    ['Admin', { rol: 'admin' }],
    ['Super Admin', { rol: 'super_admin' }],
  ]
  const VACIAR: Array<[string, Record<string, unknown>]> = [
    ['quitar todas las fotos', { fotos: [] }],
    ['dejar solo 4 fotos', { fotos: CONTENIDO.fotos.slice(0, 4) }],
    ['quitar el precio', { precio: null }],
    ['dejar el título vacío', { titulo: '' }],
    ['dejar la ubicación vacía', { ubicacion: '' }],
    ['dejar la descripción vacía', { descripcion: '' }],
  ]

  for (const [nombre, fila] of quienesEditanLoPublicado) {
    it(`${nombre}: cada vaciado se rechaza con 400, no cambia nada y el anuncio sigue publicado`, async () => {
      entrarComo('U1', fila)
      for (const [que, cuerpo] of VACIAR) {
        mundo.props = [propiedad('p1', 'U1', 'publicada')]
        const antes = JSON.stringify(mundo.props)
        const r = await editarPropiedad(R('/api/admin/propiedades/p1', cuerpo, 'PATCH'), ctx('p1'))
        expect(r.status, que).toBe(400)
        expect(((await r.json()) as { error: string }).error, que).toMatch(/publicada y tiene que seguir completa/)
        expect(JSON.stringify(mundo.props), que).toBe(antes)
      }
    })

    it(`${nombre}: las ediciones normales de lo publicado siguen funcionando (precio nuevo, más fotos, otra descripción)`, async () => {
      entrarComo('U1', fila)
      mundo.props = [propiedad('p1', 'U1', 'publicada')]
      const nuevaFoto = `https://res.cloudinary.com/${NUBE}/image/upload/v1/prop/7.jpg`
      for (const cuerpo of [{ precio: 2_450_000 }, { fotos: [...CONTENIDO.fotos, nuevaFoto] }, { descripcion: 'Una descripción distinta, igual de completa que la anterior para el anuncio.' }, { titulo: 'Casa remodelada en León' }]) {
        const r = await editarPropiedad(R('/api/admin/propiedades/p1', cuerpo, 'PATCH'), ctx('p1'))
        expect(r.status, JSON.stringify(cuerpo)).toBe(200)
      }
      expect(estadoEnBase('p1')).toBe('publicada')
    })
  }

  it('un anuncio publicado que YA estaba incompleto (inventario heredado) se puede seguir corrigiendo campo por campo', async () => {
    entrarComo('ADM', { rol: 'admin' })
    mundo.props = [propiedad('viejo', 'ADM', 'publicada', { fotos: ['1', '2'].map(foto), precio: null })]
    // Cambiar otra cosa no lo empeora: pasa.
    expect((await editarPropiedad(R('/api/admin/propiedades/viejo', { titulo: 'Título corregido' }, 'PATCH'), ctx('viejo'))).status).toBe(200)
    // Completar lo que faltaba mejora: pasa.
    expect((await editarPropiedad(R('/api/admin/propiedades/viejo', { precio: 1_900_000 }, 'PATCH'), ctx('viejo'))).status).toBe(200)
    // Pero quitarle algo que SÍ tenía lo empeora: se rechaza.
    expect((await editarPropiedad(R('/api/admin/propiedades/viejo', { ubicacion: '' }, 'PATCH'), ctx('viejo'))).status).toBe(400)
  })

  it('un borrador sí se puede dejar a medias: la regla solo protege lo que ya está a la vista del público', async () => {
    entrarComo('U1', { rol: 'publicador', tipo_publicador: 'publicador', permisos_override: {} })
    mundo.props = [propiedad('b1', 'U1', 'borrador')]
    expect((await editarPropiedad(R('/api/admin/propiedades/b1', { fotos: [], precio: null }, 'PATCH'), ctx('b1'))).status).toBe(200)
  })
})
