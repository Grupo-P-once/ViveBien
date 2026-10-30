/**
 * Catálogo de permisos (ADR-0004). Código puro: sin base ni red.
 *
 * ─────────────────────────────────────────────────────────────
 * V-1.1.79 — fase 2 del PRD v2.0
 *
 * Una ruta no pregunta «¿eres admin?», pregunta «¿puedes hacer ESTO?». El
 * servidor responde con esta tabla y con nada más (`exigir()` en
 * `auth-server.ts`). Así, cuando cambie quién puede qué, cambia aquí y en
 * ningún otro sitio.
 *
 * Papeles: cliente ⊂ publicador ⊂ admin ⊂ super_admin. El Super Admin es un
 * admin con poderes extra; por compatibilidad su `perfil.rol` sigue siendo
 * 'admin' y lo distingue `perfil.superAdmin`.
 *
 * El catálogo crece con cada fase (publicar, comisiones, jurídico…). Sólo se
 * agrega un permiso cuando una ruta lo usa de verdad.
 * ─────────────────────────────────────────────────────────────
 */

export type Papel = 'cliente' | 'publicador' | 'admin' | 'super_admin'

export const PERMISOS = {
  /** Su propia cuenta: perfil, favoritos, búsquedas, sus citas. */
  'cuenta.propia': ['cliente', 'publicador', 'admin', 'super_admin'],
  /** Crear y editar SUS propiedades (el dueño lo comprueba cada ruta). */
  'propiedad.gestionar_propias': ['publicador', 'admin', 'super_admin'],
  /** Ver, editar y borrar CUALQUIER propiedad, no sólo las propias. */
  'propiedad.gestionar_todas': ['admin', 'super_admin'],
  /** Publicar, rechazar, pedir cambios y cambiar el estatus comercial. */
  'propiedad.moderar': ['admin', 'super_admin'],
  /** Ver todos los leads y solicitudes, no sólo los propios. */
  'leads.ver_todos': ['admin', 'super_admin'],
  /** El calendario completo y agendar por un cliente. */
  'citas.ver_todas': ['admin', 'super_admin'],
  /** Todo el panel de administración (/admin y /api/admin). */
  'panel.admin': ['admin', 'super_admin'],
  /** Ver usuarios, suspender, y cambiar entre cliente y publicador. */
  'usuarios.gestionar': ['admin', 'super_admin'],
  /** Dar o quitar el rol de admin o super admin (con motivo, auditado). */
  'usuarios.roles_admin': ['super_admin'],
  /** Encender y apagar módulos (`configuracion.flags`). */
  'configuracion.flags': ['super_admin'],
  /** Apartado «SEO» del panel: auditoría del sitio, robots y sitemap, Search Console (solo lectura). Solo Super Admin. */
  'seo.ver': ['super_admin'],
  /** Contabilidad de comisiones (libro diario, gastos, análisis): ver. Solo Super Admin; es el dinero de la empresa. */
  'contabilidad.ver': ['super_admin'],
  /** Contabilidad de comisiones: registrar gastos, devoluciones, anulaciones y cuentas de gasto. Solo Super Admin; lo registrado no se edita ni se borra. */
  'contabilidad.registrar': ['super_admin'],
  /** Centro de Ayuda: escribir y editar borradores (3c-3). */
  'ayuda.redactar': ['admin', 'super_admin'],
  /**
   * Centro de Ayuda: aprobar y **publicar**.
   *
   * Separado de `ayuda.redactar` a propósito. La regla del Centro es que la
   * IA propone y **una persona publica**; si redactar y publicar fueran el
   * mismo permiso, esa frontera no existiría en ninguna parte del sistema.
   */
  'ayuda.publicar': ['admin', 'super_admin'],
} as const satisfies Record<string, readonly Papel[]>

export type Permiso = keyof typeof PERMISOS

/** Lo mínimo de un perfil que hace falta para decidir. */
export type QuienDecide = { rol: string; superAdmin?: boolean }

export function papelDe(p: QuienDecide): Papel {
  if (p.superAdmin) return 'super_admin'
  if (p.rol === 'admin' || p.rol === 'publicador') return p.rol
  return 'cliente'
}

export function puede(p: QuienDecide, permiso: Permiso): boolean {
  return (PERMISOS[permiso] as readonly Papel[]).includes(papelDe(p))
}

/** Roles que se pueden guardar en `usuarios.rol` (migración 20). */
export const ROLES_GUARDADOS = ['cliente', 'publicador', 'admin', 'super_admin'] as const
export type RolGuardado = (typeof ROLES_GUARDADOS)[number]

export function esNivelAdmin(rol: unknown): boolean {
  return rol === 'admin' || rol === 'super_admin'
}
