/**
 * Las consultas (solicitudes de informes o de visita) tal como las ve EL
 * CLIENTE que las hizo. DTO explícito — P3-02 (V-1.1.82).
 *
 * `solicitudes_contacto` guarda también lo que es de VIVE BIEN y no del
 * cliente: el dueño de la propiedad (`owner_id`, atribución interna —
 * ADR-0006), el estado de entrega del aviso por WhatsApp, el consentimiento
 * con su versión, el origen. Antes `GET /api/contacto` devolvía la fila entera
 * (`select('*')`). Ahora el cliente recibe sólo esto, y la consulta a la base
 * pide sólo estas columnas: lo que no se lee no se puede filtrar por error.
 *
 * Estado: hoy no existe seguimiento de consultas (llega en la fase 7, Leads),
 * así que todas son «enviada». No se inventa «recibida» ni «en revisión».
 */

export const COLUMNAS_CONSULTA_CLIENTE = 'id, propiedad_id, propiedad_titulo, tipo, visita_preferida, mensaje, creado_en' as const

/** Columnas que el cliente NUNCA recibe (lo vigila una prueba). */
export const COLUMNAS_CONSULTA_INTERNAS = [
  'cliente_uid', 'owner_id', 'nombre', 'telefono', 'email', 'consentimiento_en', 'consentimiento_version',
  'whatsapp_estado', 'whatsapp_id', 'whatsapp_error', 'origen',
] as const

/** Lo que ve el equipo de VIVE BIEN (`leads.ver_todos`). Lista explícita, también. */
export const COLUMNAS_CONSULTA_EQUIPO =
  'id, cliente_uid, propiedad_id, owner_id, nombre, telefono, email, mensaje, propiedad_titulo, tipo, visita_preferida, consentimiento_en, consentimiento_version, whatsapp_estado, whatsapp_error, origen, creado_en' as const

export type FilaConsultaCliente = {
  id: number
  propiedad_id: string
  propiedad_titulo: string | null
  tipo: string | null
  visita_preferida: string | null
  mensaje: string | null
  creado_en: string
}

export type ConsultaCliente = {
  id: number
  propiedadId: string
  propiedadTitulo: string | null
  tipo: 'visita' | 'informacion'
  visitaPreferida: string | null
  mensaje: string | null
  creadoEn: string
  estado: 'enviada'
}

/** Arma el DTO campo por campo: si la fila trae más, no pasa. */
export function aConsultaCliente(f: FilaConsultaCliente): ConsultaCliente {
  return {
    id: f.id,
    propiedadId: f.propiedad_id,
    propiedadTitulo: f.propiedad_titulo ?? null,
    tipo: f.tipo === 'visita' ? 'visita' : 'informacion',
    visitaPreferida: f.visita_preferida ?? null,
    mensaje: f.mensaje ?? null,
    creadoEn: f.creado_en,
    estado: 'enviada',
  }
}
