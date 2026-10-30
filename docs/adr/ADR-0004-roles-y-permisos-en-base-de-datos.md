# ADR-0004 · Roles y permisos en la base de datos, verificados en cada petición

- **Estado:** Aceptada (18-sep-2026)
- **Relacionado:** DECISIONS D-13, D-14 · PRD §4, §12 · prompt §5, §14

## Context

Hoy hay tres roles (`cliente`, `publicador`, `admin`) en `usuarios.rol`, más la lista `ADMIN_EMAILS` que convierte en admin y sirve de recuperación. Algunas rutas autorizan por la lista y otras por el rol. El PRD pide cuatro roles (añade `SUPER_ADMIN`), permisos desacoplados del rol y custom claims.

## Decision

- Roles: `cliente`, `publicador`, `admin`, `super_admin` (sin más).
- **Permisos** en código como catálogo (`src/lib/acceso/permisos.ts`: `propiedad.publicar`, `comision.proponer`, `legal.version.activar`…) con su asignación por rol; opcionalmente ajustable por Super Admin en `configuracion` (fase 13).
- Una sola función de autorización en servidor: `exigir(req, permiso, recurso?)` → sesión + rol + permiso + propiedad del recurso + estado. Todas las rutas migran a ella; se retiran los `isAdminEmail` sueltos.
- ~~`ADMIN_EMAILS` queda sólo como **arranque de super admin**~~ → **enmendado el 19-sep (V-1.1.81), ver abajo.**
- El rol **nunca** se cambia desde el navegador: sólo operaciones de servidor auditadas (elevación a publicador por flujo, cambios de rol por Super Admin).
- **Sin custom claims:** el servidor ya consulta la base en cada petición; un claim en el token quedaría viejo hasta que caduque.

## Alternatives

1. Custom claims con `firebase-admin` → requiere cuenta de servicio y deja permisos cacheados en el token. Rechazada por ahora; reevaluar si se añade Realtime con RLS por usuario.
2. Roles múltiples por usuario (`roles[]`) → el PRD describe roles jerárquicos (el publicador es un cliente elevado); no hace falta un arreglo. Se usa un rol + permisos.

## Consequences

- Pruebas de seguridad obligatorias (prompt §60) contra `exigir()`.
- Migración: `usuarios.rol` admite `super_admin`; los admins actuales se revisan (D-13).

## Enmienda — 19-sep-2026 (V-1.1.81): el rol vive SÓLO en la base

A pedido del usuario al cerrar la fase 2: ninguna lista del entorno decide permisos.

- `ADMIN_EMAILS`, `SUPER_ADMIN_EMAILS` y `NEXT_PUBLIC_ADMIN_EMAILS` ya no se leen en ningún sitio (una prueba lo vigila). El rol es `usuarios.rol`; si la fila no existe o la base no responde, la cuenta vale como cliente (se falla cerrado).
- `usuarios.rol` sólo lo escribe el servidor: RLS sin políticas y cero privilegios para `anon`/`authenticated` (verificado en producción). Cada cambio de rol queda en `audit_logs`; editar una variable de Vercel no dejaba huella.
- **Arranque de nuevos Super Admin:** por invitación (`invitaciones.rol = 'super_admin'`, migración 21), que sólo crea un Super Admin y que se aplica cuando la persona entra con ese correo **verificado**.
- **Recuperación:** el último Super Admin activo no se puede degradar, suspender ni borrar — regla en el servidor (`lib/acceso/roles.ts`) y trigger en la base (`usuarios_ultimo_super_admin`, con candado para cambios simultáneos). Si aun así se perdiera el acceso (p. ej. la cuenta de Google), se corrige la fila en Supabase a mano.
- Sustituye al candado anterior «no se toca a quien está en ADMIN_EMAILS».
