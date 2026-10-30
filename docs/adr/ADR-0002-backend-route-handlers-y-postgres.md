# ADR-0002 · Backend en Route Handlers de Next.js + funciones de Postgres

- **Estado:** Aceptada (18-sep-2026)
- **Relacionado:** DECISIONS D-01 · PRD §10, §12

## Context

El PRD pide Cloud Functions 2nd gen para transiciones de estado, comisiones, aceptación de acuerdos y publicación. El backend real son los **Route Handlers** de Next.js desplegados en Vercel (33 rutas), que verifican la sesión de Firebase con `jose` y escriben con la clave de servicio de Supabase.

## Decision

- Toda operación crítica se expone como **Route Handler** que: verifica sesión (`verifyIdToken`), resuelve rol y permisos (ADR-0004), valida la entrada con Zod, comprueba propiedad/estado, y delega en un **servicio** de `src/lib/<dominio>/servicio.ts`.
- Las transiciones que tocan varias filas o necesitan atomicidad se implementan como **funciones plpgsql** (`security invoker`, `search_path` vacío, `EXECUTE` sólo para `service_role`), como ya se hizo con `cita_crear` / `cita_transicionar`. Cada una escribe su propio historial/auditoría en la misma transacción.
- Idempotencia con `request_id` / `Idempotency-Key` y restricciones `unique`.
- Cada función SQL tiene su **espejo en TypeScript** para la interfaz y una prueba de paridad en PGlite (patrón probado en citas: 800 combinaciones).

## Alternatives

1. Cloud Functions 2nd gen en un proyecto de Google Cloud → segundo runtime, segunda configuración de secretos, latencia entre nubes. Rechazada por ahora.
2. Supabase Edge Functions (Deno) → otro runtime y otro despliegue sin ganancia. Rechazada.

## Consequences

- Un solo despliegue (Vercel) y un solo lenguaje.
- Límite de duración de funciones de Vercel: los trabajos largos van a la cola (ADR-0003).
- Los límites de peticiones en memoria (`limites.ts`) no bastan entre instancias: se pasan a Postgres en la fase 19.
