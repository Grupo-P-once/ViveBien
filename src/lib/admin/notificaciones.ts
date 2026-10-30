/**
 * Las notificaciones de la campana del panel.
 *
 * Se calculan de lo que ya hay en la base; no hay tabla de notificaciones que
 * mantener. Cada administrador guarda sólo **hasta cuándo leyó**
 * (`usuarios.notificaciones_vistas_en`): lo posterior es nuevo.
 *
 * Dos clases de aviso:
 *
 *  · **Pendientes que piden acción** — propiedades enviadas a revisión. Siguen
 *    en la lista mientras estén pendientes, aunque ya se hayan visto: leer el
 *    aviso no las revisa.
 *  · **Lo que pasó** — registros, cuentas nuevas e invitaciones aceptadas de los
 *    últimos 30 días.
 *
 * Quien nunca abrió la campana no tiene fecha de lectura: se cuentan como
 * nuevas sólo las de la última semana, para no estrenar la campana con «40».
 */

export type TipoNotificacion = 'revision' | 'registro' | 'cuenta' | 'invitacion'

export type Notificacion = {
  id: string
  tipo: TipoNotificacion
  titulo: string
  detalle: string | null
  fecha: string
  enlace: string
  nueva: boolean
}

export type Aviso = { id: string; titulo: string; detalle: string | null; fecha: string | null | undefined }

export type FuentesNotificaciones = {
  porRevisar: Aviso[]
  registros: Aviso[]
  cuentas: Aviso[]
  invitacionesAceptadas: Aviso[]
}

const DIA_MS = 86_400_000
const VENTANA_HISTORIA_DIAS = 30
const NUEVAS_SIN_LECTURA_DIAS = 7
const MAXIMO = 20

export function construirNotificaciones(
  f: FuentesNotificaciones,
  vistasEn: string | null | undefined,
  ahora: Date,
): { items: Notificacion[]; sinLeer: number } {
  const limiteNueva = vistasEn && Number.isFinite(Date.parse(vistasEn))
    ? Date.parse(vistasEn)
    : ahora.getTime() - NUEVAS_SIN_LECTURA_DIAS * DIA_MS
  const limiteHistoria = ahora.getTime() - VENTANA_HISTORIA_DIAS * DIA_MS

  const convertir = (a: Aviso, tipo: TipoNotificacion, enlace: string): Notificacion | null => {
    const t = a.fecha ? Date.parse(a.fecha) : NaN
    if (!Number.isFinite(t)) return null
    return { id: `${tipo}:${a.id}`, tipo, titulo: a.titulo, detalle: a.detalle, fecha: a.fecha as string, enlace, nueva: t > limiteNueva }
  }

  const pendientes = f.porRevisar
    .map((a) => convertir(a, 'revision', '/admin/propiedades/pendientes'))
    .filter((x): x is Notificacion => x !== null)

  const historia = [
    ...f.registros.map((a) => convertir(a, 'registro', '/admin/registros')),
    ...f.cuentas.map((a) => convertir(a, 'cuenta', '/admin/usuarios')),
    ...f.invitacionesAceptadas.map((a) => convertir(a, 'invitacion', '/admin/usuarios')),
  ].filter((x): x is Notificacion => x !== null && Date.parse(x.fecha) >= limiteHistoria)

  const porFecha = (a: Notificacion, b: Notificacion) => Date.parse(b.fecha) - Date.parse(a.fecha)
  const items = [...pendientes.sort(porFecha), ...historia.sort(porFecha)].slice(0, MAXIMO)

  return { items, sinLeer: items.filter((x) => x.nueva).length }
}
