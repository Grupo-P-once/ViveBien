/**
 * El estado de «guardadas» en el navegador, con la BASE DE DATOS como única
 * fuente de verdad (D-75, corrección de ID-01/02/05 de D-74).
 *
 * Antes el corazón del catálogo escribía en `localStorage` (`vb_favorites`) y
 * «Mis guardadas» leía la tabla `favoritos`: dos verdades que nunca se
 * encontraban. Aquí NO se guarda nada en el navegador: el almacén sólo
 * refleja lo que dice `/api/favoritos` para la cuenta que tiene la sesión.
 *
 * Es código puro (sin React ni Firebase): las dependencias entran por
 * `crearAlmacen`, de modo que se prueba con un servidor falso. Garantías:
 *
 *  · **Una cuenta, un estado.** Al cambiar de cuenta (o cerrar sesión) se
 *    descarta TODO —ids, pendientes, respuestas en vuelo— y nunca se enseña lo
 *    de la cuenta anterior.
 *  · **Una petición a la vez por propiedad.** Un doble clic no manda dos
 *    peticiones que puedan llegar al servidor en desorden: se manda la
 *    primera y, al volver, sólo lo último que la persona quiso.
 *  · **El servidor recibe el estado DESEADO** (`guardado: true|false`), nunca
 *    «alternar»: repetir una petición no cambia nada.
 *  · **Si falla, se vuelve a lo confirmado** y se avisa con el mensaje.
 */

export type Respuesta = { ok: boolean; status: number; json: () => Promise<unknown> }

export type DepsAlmacen = {
  /** Token de la sesión actual, o null si no hay. */
  token: () => Promise<string | null>
  fetch: (ruta: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<Respuesta>
  /** Borra lo que versiones anteriores dejaron en el navegador (`vb_favorites`…). */
  limpiarRastros?: () => void
}

export type Instantanea = {
  /** De quién es este estado; null = nadie con sesión. */
  uid: string | null
  /** Las guardadas confirmadas (o pedidas y aún en camino). */
  ids: ReadonlySet<string>
  /** ¿Ya se leyó la lista de esta cuenta? */
  cargado: boolean
  /** Propiedades que la persona tocó en esta sesión: su estado ya no es «desconocido». */
  tocadas: ReadonlySet<string>
  error: string
}

const VACIA: Instantanea = { uid: null, ids: new Set(), cargado: false, tocadas: new Set(), error: '' }

export function instantaneaVacia(): Instantanea {
  return VACIA
}

export function crearAlmacen(deps: DepsAlmacen) {
  let estado: Instantanea = VACIA
  const oyentes = new Set<() => void>()
  /** Cambia con cada cuenta: lo que vuelve de una época anterior se descarta. */
  let epoca = 0
  const confirmado = new Map<string, boolean>()
  const deseado = new Map<string, boolean>()
  const promesas = new Map<string, Promise<void>>()

  function poner(parcial: Partial<Instantanea>) {
    estado = { ...estado, ...parcial }
    for (const o of oyentes) o()
  }

  function marcar(id: string, guardada: boolean) {
    const ids = new Set(estado.ids)
    if (guardada) ids.add(id)
    else ids.delete(id)
    poner({ ids, tocadas: new Set(estado.tocadas).add(id) })
  }

  async function llamar(ruta: string, metodo: 'GET' | 'POST', cuerpo?: unknown): Promise<Respuesta> {
    const token = await deps.token()
    if (!token) throw new Error('Tu sesión terminó. Entra otra vez para guardar.')
    return deps.fetch(ruta, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    })
  }

  async function mensajeDe(r: Respuesta, porDefecto: string): Promise<string> {
    const j = (await r.json().catch(() => null)) as { error?: unknown } | null
    return typeof j?.error === 'string' ? j.error : porDefecto
  }

  async function cargar(): Promise<void> {
    const ep = epoca
    try {
      const r = await llamar('/api/favoritos', 'GET')
      if (ep !== epoca) return
      if (!r.ok) {
        poner({ error: await mensajeDe(r, 'No pudimos cargar tus guardadas.') })
        return
      }
      const lista = await r.json()
      if (ep !== epoca) return
      const ids = new Set<string>(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [])
      // Lo que la persona ya tocó mientras llegaba la lista manda sobre ella.
      for (const [id, q] of deseado) {
        if (q) ids.add(id)
        else ids.delete(id)
      }
      poner({ ids, cargado: true, error: '' })
    } catch (e) {
      if (ep !== epoca) return
      poner({ error: e instanceof Error ? e.message : 'No pudimos cargar tus guardadas.' })
    }
  }

  /** Manda al servidor lo último que se quiso, de una en una, hasta que coincidan. */
  async function drenar(id: string, ep: number): Promise<void> {
    try {
      await enviarHastaCoincidir(id, ep)
    } finally {
      // Sincrónico con la última comprobación: no queda hueco en el que otro
      // clic se «una» a una promesa que ya terminó y se quede sin enviar.
      if (ep === epoca) promesas.delete(id)
    }
  }

  async function enviarHastaCoincidir(id: string, ep: number): Promise<void> {
    for (;;) {
      const q = deseado.get(id)
      if (q === undefined || confirmado.get(id) === q) return
      let r: Respuesta
      try {
        r = await llamar('/api/favoritos', 'POST', { propiedadId: id, guardado: q })
      } catch (e) {
        if (ep === epoca) volver(id)
        throw e
      }
      if (ep !== epoca) return
      if (!r.ok) {
        const msg = await mensajeDe(r, q ? 'No pudimos guardarla.' : 'No pudimos quitarla.')
        if (ep === epoca) volver(id)
        throw new Error(msg)
      }
      const cuerpo = (await r.json().catch(() => null)) as { guardado?: unknown } | null
      if (ep !== epoca) return
      confirmado.set(id, typeof cuerpo?.guardado === 'boolean' ? cuerpo.guardado : q)
    }
  }

  /** Falló: se vuelve a lo último que el servidor confirmó (o a «no guardada»). */
  function volver(id: string) {
    deseado.delete(id)
    marcar(id, confirmado.get(id) ?? false)
  }

  return {
    suscribir(f: () => void) {
      oyentes.add(f)
      return () => { oyentes.delete(f) }
    },
    instantanea: () => estado,

    /** Llamar cada vez que cambie la sesión. Repetir el mismo uid no hace nada. */
    cambiarUsuario(uid: string | null) {
      if (uid === estado.uid) return
      const salio = estado.uid !== null && uid === null
      epoca++
      confirmado.clear()
      deseado.clear()
      promesas.clear()
      estado = { ...VACIA, uid }
      for (const o of oyentes) o()
      if (salio || uid === null) deps.limpiarRastros?.()
      if (uid) void cargar()
    },

    recargar: cargar,

    /**
     * Fija el estado de una propiedad. Se ve al instante; si el servidor la
     * rechaza, vuelve a lo confirmado y la promesa se rechaza con el mensaje.
     */
    establecer(id: string, guardada: boolean): Promise<void> {
      if (!estado.uid) return Promise.reject(new Error('Entra a tu cuenta para guardar propiedades.'))
      deseado.set(id, guardada)
      marcar(id, guardada)
      const ya = promesas.get(id)
      if (ya) return ya
      const ep = epoca
      const p = drenar(id, ep)
      promesas.set(id, p)
      return p
    },
  }
}

export type AlmacenFavoritos = ReturnType<typeof crearAlmacen>

/** Ciclo de vida de lo que versiones anteriores dejaron en localStorage. */
export const CLAVES_ANTIGUAS = ['vb_favorites', 'vb_historial'] as const
