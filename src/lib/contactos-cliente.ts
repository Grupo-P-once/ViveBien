/**
 * Bitácora de contactos del cliente (28-oct-2026): cada vez que una persona CON SESIÓN toca «WhatsApp», «Llamar» o «Correo» de una propiedad queda en «Mis consultas»:
 *   «Contactaste por la nave industrial Mandujano (VB-2026-00006) el 28 de octubre por WhatsApp, con Vive Bien.»
 * El formulario ya queda en `solicitudes_contacto`; esto cubre los demás canales. Código puro (sin base ni red).
 *
 * El «a quién» se guarda aparte porque hoy todo contacto público llega a VIVE BIEN (decisión D-02) pero la ficha ya dice quién publica y mañana podría ser otra persona:
 * el historial debe decir con quién se habló EN ESE MOMENTO, no con quién se habla hoy.
 */
export const CANALES = ['whatsapp', 'telefono', 'correo'] as const
export type CanalDeContacto = (typeof CANALES)[number]
export type DestinoDeContacto = 'vivebien' | 'publicador'

export const ETIQUETA_CANAL: Readonly<Record<CanalDeContacto, string>> = Object.freeze({ whatsapp: 'WhatsApp', telefono: 'llamada', correo: 'correo' })
const ETIQUETA_DESTINO: Readonly<Record<DestinoDeContacto, string>> = Object.freeze({ vivebien: 'Vive Bien', publicador: 'quien publica la propiedad' })

export type EntradaDeContacto = { propiedadId?: unknown; canal?: unknown }

/** Valida lo que manda el navegador: el id de una propiedad (texto corto sin espacios raros) y uno de los tres canales. */
export function sanearContacto(e: EntradaDeContacto): { ok: true; propiedadId: string; canal: CanalDeContacto } | { ok: false; error: string } {
  const id = typeof e.propiedadId === 'string' ? e.propiedadId.trim() : ''
  if (!id || id.length > 120 || /[\s<>"'`\\]/.test(id)) return { ok: false, error: 'Falta la propiedad.' }
  if (typeof e.canal !== 'string' || !(CANALES as readonly string[]).includes(e.canal)) return { ok: false, error: 'Ese canal de contacto no existe.' }
  return { ok: true, propiedadId: id, canal: e.canal as CanalDeContacto }
}

export type FilaContacto = { id: number; propiedad_id: string; propiedad_titulo: string | null; propiedad_folio: string | null; canal: string; destino: string; creado_en: string }
export type ContactoCliente = {
  id: number; propiedadId: string; titulo: string | null; folio: string | null; canal: CanalDeContacto; destino: DestinoDeContacto; creadoEn: string
  /** Ruta de la ficha si la propiedad sigue publicada; `null` si ya no está. */ ruta: string | null
}

/** Columnas que el cliente recibe (el `uid` y cualquier dato interno NO salen). */
export const COLUMNAS_CONTACTO_CLIENTE = 'id, propiedad_id, propiedad_titulo, propiedad_folio, canal, destino, creado_en' as const

export function aContactoCliente(f: FilaContacto, ruta: string | null): ContactoCliente {
  return {
    id: f.id, propiedadId: f.propiedad_id, titulo: f.propiedad_titulo ?? null, folio: f.propiedad_folio ?? null,
    canal: (CANALES as readonly string[]).includes(f.canal) ? (f.canal as CanalDeContacto) : 'whatsapp',
    destino: f.destino === 'publicador' ? 'publicador' : 'vivebien', creadoEn: f.creado_en, ruta,
  }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** «28 de octubre de 2026, 14:05» en la hora de México (UTC-6, sin horario de verano desde 2022). */
export function fechaYHora(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t - 6 * 3_600_000)
  const hh = String(d.getUTCHours()).padStart(2, '0'); const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}, ${hh}:${mm}`
}

/** La frase del historial: qué propiedad, cuándo, por qué canal y con quién. */
export function textoDeContacto(c: Pick<ContactoCliente, 'titulo' | 'folio' | 'canal' | 'destino' | 'creadoEn'>): string {
  const que = (c.titulo ?? '').trim() || 'una propiedad'
  const folio = c.folio ? ` (${c.folio})` : ''
  return `Contactaste por ${que}${folio} el ${fechaYHora(c.creadoEn)} por ${ETIQUETA_CANAL[c.canal]}, con ${ETIQUETA_DESTINO[c.destino]}.`
}

/* ── Historial en tabla (28-oct-2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
   Una fila por contacto: WhatsApp, llamada, correo o cita. Columnas: fecha, canal, ID público (folio), nombre, estatus y enlace. El enlace SIEMPRE existe: si la propiedad ya no está,
   la ficha responde 404 y esa página lo dice con humor (propiedades/[id]/not-found.tsx). «Disponible» = publicada y sin estatus de baja (pausada, vendida, rentada, eliminada). */
export type CanalHistorial = CanalDeContacto | 'cita'
export const ETIQUETA_CANAL_HISTORIAL: Readonly<Record<CanalHistorial, string>> = Object.freeze({ whatsapp: 'WhatsApp', telefono: 'Llamada', correo: 'Correo', cita: 'Cita' })
export type FilaHistorial = { clave: string; creadoEn: string; canal: CanalHistorial; folio: string | null; nombre: string; disponible: boolean; ruta: string }

/** Estatus que sacan a una propiedad de «disponible» (misma lista que `portal/pantallas`). */
export const ESTATUS_NO_DISPONIBLE = ['pausada', 'vendida', 'rentada', 'eliminada'] as const
export const estaDisponible = (p: { estado_pub?: string | null; estatus?: string | null } | null | undefined): boolean =>
  Boolean(p) && p!.estado_pub === 'publicada' && !(ESTATUS_NO_DISPONIBLE as readonly string[]).includes(p!.estatus ?? '')

export type PropiedadDeHistorial = { id: string; slug?: string | null; titulo?: string | null; folio?: string | null; estado_pub?: string | null; estatus?: string | null }
const SIN_NOMBRE_HISTORIAL = 'Propiedad que ya no está publicada'

export function filasDeHistorial(
  contactos: Array<Pick<FilaContacto, 'id' | 'propiedad_id' | 'propiedad_titulo' | 'propiedad_folio' | 'canal' | 'creado_en'>>,
  citas: Array<{ id?: string | number; propiedad_id: string | null; creada_en: string }>,
  propiedades: Map<string, PropiedadDeHistorial>,
): FilaHistorial[] {
  const filas: FilaHistorial[] = []
  const ruta = (id: string, p?: PropiedadDeHistorial) => `/propiedades/${encodeURIComponent(p && p.estado_pub === 'publicada' ? ((p.slug ?? '').trim() || id) : id)}`
  for (const c of contactos) {
    const p = propiedades.get(c.propiedad_id)
    filas.push({
      clave: `c${c.id}`, creadoEn: c.creado_en, canal: (CANALES as readonly string[]).includes(c.canal) ? (c.canal as CanalDeContacto) : 'whatsapp',
      // lo que se guardó EN ESE MOMENTO (el título y el folio ya eran públicos entonces)
      folio: (c.propiedad_folio ?? '').trim() || null, nombre: (c.propiedad_titulo ?? '').trim() || SIN_NOMBRE_HISTORIAL, disponible: estaDisponible(p), ruta: ruta(c.propiedad_id, p),
    })
  }
  citas.forEach((c, n) => {
    if (!c.propiedad_id) return
    const p = propiedades.get(c.propiedad_id)
    const publicada = p?.estado_pub === 'publicada'
    // Una cita de una propiedad que ya no está publicada NO enseña el título actual (podría ser un borrador): solo que ya no está.
    filas.push({
      clave: `v${c.id ?? n}-${c.propiedad_id}`, creadoEn: c.creada_en, canal: 'cita', folio: publicada ? (p?.folio ?? '').trim() || null : null,
      nombre: publicada ? (p?.titulo ?? '').trim() || SIN_NOMBRE_HISTORIAL : SIN_NOMBRE_HISTORIAL, disponible: estaDisponible(p), ruta: ruta(c.propiedad_id, p),
    })
  })
  return filas.sort((a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn))
}
