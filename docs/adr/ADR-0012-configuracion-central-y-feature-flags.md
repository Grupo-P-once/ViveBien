# ADR-0012 · Configuración central (negocio y sistema) y feature flags en la base

- **Estado:** Aceptada (18-sep-2026)
- **Relacionado:** DECISIONS D-17 · AUDIT DAT-03 · PRD Corrección 07 · prompt §41, §68

## Context

Teléfono, correo, dirección y redes aparecen 32 veces en 19 archivos; GA4 está escrito en el layout; el WhatsApp de respaldo se repite en componentes. El PRD pide `businessConfig` único y `systemConfigs` para reglas.

## Decision

- Tabla `configuracion` (clave, valor JSON validado con Zod, versión, actualizado_por, fecha), con historial en `audit_logs`.
  - `negocio`: nombre legal y comercial, teléfono, WhatsApp, correo, dirección, horario, redes, sitio, zona atendida.
  - `analitica`: id de GA4.
  - `flags`: `portalCliente`, `publisherPortal`, `commissionEngine`, `legalAcceptance`, `superAdmin`, `marketingHub`, `metaPublishing`, `aiContent`.
- Lectura en servidor con caché corta (revalidación) y **valores por defecto en código** (`src/lib/config/negocio.ts`) para que el sitio no dependa de que la base responda (patrón ya usado por `/api/catalogo`).
- Footer, contacto, JSON-LD, metadata, correos, WhatsApp flotante y plantillas de marketing leen de ahí.
- Sólo Super Admin cambia `flags`; admin puede editar `negocio` (auditado).

## Consequences

- Una sola fuente para NAP (bueno para SEO local).
- Los feature flags se usan sólo para módulos grandes (no para cada botón).
