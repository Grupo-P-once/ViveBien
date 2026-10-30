# ADR-0011 · Integración con Meta en una capa de servidor, detrás de feature flag

- **Estado:** Aceptada como diseño (18-sep-2026); implementación en fase 17, sujeta a D-25
- **Relacionado:** PRD §19 · prompt §29–31, §62

## Context

El PRD pide publicar en Instagram/Facebook, leer métricas y (después) anuncios, sin acoplar la app a Graph API y sin tokens en el navegador. Los permisos y versiones de Graph API deben verificarse contra la documentación vigente de Meta (el PRD no pudo hacerlo).

## Decision

- Módulo `src/integrations/meta/` (`auth`, `graph`, `instagram`, `facebook`, `ads`, `insights`, `webhooks`, `errors`, `types`, `client`) importable **sólo desde servidor** (`import 'server-only'`).
- Tokens cifrados en base (AES-256-GCM, llave en variable de entorno de Vercel, como Google Calendar), nunca al navegador; estados de conexión `NOT_CONNECTED`, `CONNECTED`, `EXPIRED`, `REAUTH_REQUIRED`, `ERROR`, `DISCONNECTED`.
- Publicación sólo por trabajo (ADR-0003) con `clave_idempotencia = contentVersion + plataforma + publicación`; se guardan `external_container_id` / `external_post_id`.
- Versión de Graph API configurable (no fija en código).
- Feature flag `metaPublishing` apagado hasta tener Business Manager, activos y permisos aprobados; mientras tanto la interfaz dice `NOT_CONNECTED` (nada de «Publicado» falso).
- Se evalúa `facebook-nodejs-business-sdk` (licencia, mantenimiento, peso) contra `fetch` tipado antes de adoptarlo.

## Consequences

- Nada se publica en Meta desde pruebas: sólo staging con cuenta de prueba.
