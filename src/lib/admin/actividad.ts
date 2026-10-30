import { nombreDe } from '../propiedad-publica'
import { ETIQUETA_FLAG, type Flag } from '../config/flags'

/**
 * Actividad reciente del sitio: qué pasó, en orden, de todas las tablas a la vez.
 *
 * No es una tabla nueva. Se reconstruye de las fechas que cada tabla ya guarda:
 * quién dejó sus datos, quién creó cuenta, qué se publicó, qué se mandó a
 * revisar, a quién se le cambió el rol y qué invitaciones salieron. Así no hay
 * que acordarse de «registrar la actividad» en cada ruta que escribe, y lo que
 * ya pasó antes de esta versión también aparece.
 *
 * Lo que se deja fuera a propósito: cada edición de una propiedad
 * (`propiedad.editar` son cientos de filas por guardar un formulario) y lo que
 * repetiría otra fuente (`propiedad.publicada` ya sale de `publicada_en`).
 */

export type TipoActividad =
  | 'registro'
  | 'solicitud'
  | 'contacto'
  | 'cuenta'
  | 'publicada'
  | 'revision'
  | 'propiedad-creada'
  | 'propiedad-borrada'
  | 'usuario-cambio'
  | 'modulo-cambio'
  | 'invitacion'
  | 'invitacion-aceptada'

export type ItemActividad = {
  id: string
  tipo: TipoActividad
  titulo: string
  detalle: string | null
  fecha: string
  enlace: string | null
}

type Texto = string | null | undefined

export type FuentesActividad = {
  leads: { id: number | string; nombre: Texto; interes: Texto; created_at: Texto }[]
  solicitudes: { id: number | string; nombre: Texto; tipo: Texto; propiedad_titulo: Texto; creado_en: Texto }[]
  contactos: { id: number | string; nombre: Texto; created_at: Texto }[]
  usuarios: { uid: string; nombre: Texto; email: Texto; creado_en: Texto }[]
  propiedades: {
    id: string; titulo?: Texto; tipo?: Texto; operacion?: Texto; folio?: Texto
    estado_pub?: Texto; publicada_en?: Texto; enviada_en?: Texto
  }[]
  auditoria: { id: number | string; accion: string; entidad_id: Texto; antes: unknown; despues: unknown; creado_en: string }[]
  invitaciones: { id: number | string; email: string; rol: string; creado_en: Texto; aceptada_en: Texto }[]
}

const ROL: Record<string, string> = { cliente: 'Cliente', publicador: 'Publicador', admin: 'Administrador', super_admin: 'Super Admin' }
const ESTADO: Record<string, string> = { activo: 'Activo', suspendido: 'Suspendido', pendiente: 'Pendiente' }

const limpio = (t: Texto): string | null => {
  const v = (t ?? '').trim()
  return v ? v : null
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

/** «rol: Cliente → Publicador · estado: Activo → Suspendido» */
function cambiosDeUsuario(antes: unknown, despues: unknown): string | null {
  const a = objeto(antes)
  const d = objeto(despues)
  const partes: string[] = []
  if (typeof d.rol === 'string' && d.rol !== a.rol) {
    partes.push(`rol: ${ROL[String(a.rol)] ?? a.rol ?? '—'} → ${ROL[d.rol] ?? d.rol}`)
  }
  if (typeof d.estado === 'string' && d.estado !== a.estado) {
    partes.push(`estado: ${ESTADO[String(a.estado)] ?? a.estado ?? '—'} → ${ESTADO[d.estado] ?? d.estado}`)
  }
  return partes.length > 0 ? partes.join(' · ') : null
}

export function construirActividad(f: FuentesActividad, limite = 20): ItemActividad[] {
  const items: ItemActividad[] = []
  const propiedad = new Map(f.propiedades.map((p) => [p.id, p]))
  const usuario = new Map(f.usuarios.map((u) => [u.uid, u]))
  const nombreUsuario = (uid: Texto) => {
    const u = uid ? usuario.get(uid) : undefined
    return limpio(u?.nombre) ?? limpio(u?.email) ?? 'un usuario'
  }

  for (const l of f.leads) {
    if (!l.created_at) continue
    items.push({
      id: `lead:${l.id}`,
      tipo: 'registro',
      titulo: `Nuevo registro: ${limpio(l.nombre) ?? 'sin nombre'}`,
      detalle: limpio(l.interes),
      fecha: l.created_at,
      enlace: '/admin/registros',
    })
  }

  for (const s of f.solicitudes) {
    if (!s.creado_en) continue
    const visita = s.tipo === 'visita'
    items.push({
      id: `solicitud:${s.id}`,
      tipo: 'solicitud',
      titulo: `${visita ? 'Pidió una visita' : 'Pidió información'}: ${limpio(s.nombre) ?? 'sin nombre'}`,
      detalle: limpio(s.propiedad_titulo),
      fecha: s.creado_en,
      enlace: '/admin/registros',
    })
  }

  for (const c of f.contactos) {
    if (!c.created_at) continue
    items.push({
      id: `contacto:${c.id}`,
      tipo: 'contacto',
      titulo: `Mensaje de contacto: ${limpio(c.nombre) ?? 'sin nombre'}`,
      detalle: null,
      fecha: c.created_at,
      enlace: '/admin/registros',
    })
  }

  for (const u of f.usuarios) {
    if (!u.creado_en) continue
    items.push({
      id: `usuario:${u.uid}`,
      tipo: 'cuenta',
      titulo: `Nueva cuenta: ${limpio(u.nombre) ?? limpio(u.email) ?? 'sin nombre'}`,
      detalle: limpio(u.nombre) ? limpio(u.email) : null,
      fecha: u.creado_en,
      enlace: '/admin/usuarios',
    })
  }

  for (const p of f.propiedades) {
    const nombre = nombreDe(p)
    const folio = limpio(p.folio)
    if (p.estado_pub === 'publicada' && p.publicada_en) {
      items.push({ id: `publicada:${p.id}`, tipo: 'publicada', titulo: `Publicada: ${nombre}`, detalle: folio, fecha: p.publicada_en, enlace: '/admin/propiedades' })
    }
    if (p.estado_pub === 'en_revision' && p.enviada_en) {
      items.push({ id: `revision:${p.id}`, tipo: 'revision', titulo: `Enviada a revisión: ${nombre}`, detalle: folio, fecha: p.enviada_en, enlace: '/admin/propiedades/pendientes' })
    }
  }

  for (const a of f.auditoria) {
    if (a.accion === 'usuario.editar') {
      items.push({
        id: `auditoria:${a.id}`,
        tipo: 'usuario-cambio',
        titulo: `${cambiosDeUsuario(a.antes, a.despues) ? 'Cambio de rol o estado' : 'Cambio de permisos'}: ${nombreUsuario(a.entidad_id)}`,
        detalle: cambiosDeUsuario(a.antes, a.despues),
        fecha: a.creado_en,
        enlace: '/admin/usuarios',
      })
    } else if (a.accion === 'configuracion.flag') {
      // El motivo NO viaja aquí: queda en la bitácora completa.
      const d = objeto(a.despues)
      const nombre = ETIQUETA_FLAG[String(a.entidad_id) as Flag] ?? limpio(a.entidad_id) ?? 'un módulo'
      items.push({
        id: `auditoria:${a.id}`,
        tipo: 'modulo-cambio',
        titulo: `Módulo ${d.valor === true ? 'encendido' : d.valor === false ? 'apagado' : 'cambiado'}: ${nombre}`,
        detalle: null,
        fecha: a.creado_en,
        enlace: '/admin/configuracion',
      })
    } else if (a.accion === 'propiedad.crear' || a.accion === 'propiedad.borrar') {
      const p = a.entidad_id ? propiedad.get(a.entidad_id) : undefined
      const nombre = p ? nombreDe(p) : limpio(a.entidad_id) ?? 'una propiedad'
      const creada = a.accion === 'propiedad.crear'
      items.push({
        id: `auditoria:${a.id}`,
        tipo: creada ? 'propiedad-creada' : 'propiedad-borrada',
        titulo: `${creada ? 'Propiedad creada' : 'Propiedad eliminada'}: ${nombre}`,
        detalle: null,
        fecha: a.creado_en,
        enlace: creada ? '/admin/propiedades' : null,
      })
    }
  }

  for (const i of f.invitaciones) {
    if (i.creado_en) {
      items.push({
        id: `invitacion:${i.id}`,
        tipo: 'invitacion',
        titulo: `Invitación enviada: ${i.email}`,
        detalle: ROL[i.rol] ?? i.rol,
        fecha: i.creado_en,
        enlace: '/admin/usuarios',
      })
    }
    if (i.aceptada_en) {
      items.push({
        id: `invitacion-aceptada:${i.id}`,
        tipo: 'invitacion-aceptada',
        titulo: `Aceptó la invitación: ${i.email}`,
        detalle: ROL[i.rol] ?? i.rol,
        fecha: i.aceptada_en,
        enlace: '/admin/usuarios',
      })
    }
  }

  return items
    .filter((x) => Number.isFinite(Date.parse(x.fecha)))
    .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))
    .slice(0, limite)
}
