# ADR-0001 · Postgres (Supabase) es la base de datos del sistema, no Firestore

- **Estado:** Aceptada (18-sep-2026)
- **Relacionado:** DECISIONS D-01 · PRD §10, §11, §28 y Corrección 06

## Context

El Master PRD v2.0 describe un modelo en Firestore (`users`, `properties`, `propertyRevisions`, `leads`…). El sistema real guarda todo en **Supabase Postgres** desde abril de 2026 (migración documentada en Obsidian, `03 - DECISIONES/Decision - VIVEBIEN - Migracion-Supabase`). Hay 21 tablas, RLS, funciones transaccionales (citas) y 443 pruebas que dependen de ese modelo. El propio PRD pide no reconstruir y extender la arquitectura existente.

## Decision

Postgres (Supabase, proyecto `uztssyrheqdhtoheecgf`) sigue siendo la **única fuente de verdad**. Cada «colección» del PRD se implementa como **tabla** (o vista) con el mismo propósito y visibilidad:

| Colección del PRD | Postgres |
|---|---|
| `users` | `usuarios` (+ `roles`/permisos, ADR-0004) |
| `properties` / `propertyRevisions` | `propiedades` / `propiedad_revisiones` (ADR-0005) |
| `propertyMedia` / `propertyDocuments` | `fotos` (ampliada) / `propiedad_documentos` (ADR-0008) |
| `leads` / `leadEvents` / `leadAttributions` | `leads_v2` (nombre final en fase 7) / `lead_eventos` / columnas de atribución |
| `visitRequests` | `citas` (ya existe, V-1.1.75) |
| `offers`, `operations`, `operationParticipants`, `collaborations` | `ofertas`, `operaciones`, `operacion_participantes` |
| `commissionProposals`, `commissionLedger`, `commissionPayments` | `comision_propuestas`, `comision_movimientos`, `comision_pagos` |
| `legalDocuments`, `legalDocumentVersions`, `agreements`, `agreementAcceptances`, `consents`, `legalCases` | `documentos_legales`, `documento_versiones`, `acuerdos`, `aceptaciones`, `consentimientos`, `casos` |
| `marketing*` | `mkt_*` (fase 16) |
| `auditLogs` | `audit_logs` (ya existe) |
| `businessConfig`, `systemConfigs` | `configuracion` (ADR-0012) |

Las Security Rules se sustituyen por **RLS «deny by default»** (tablas sin políticas, sólo servidor) + validación en el servidor. Firebase se queda **sólo para Auth**.

## Alternatives

1. Migrar a Firestore como dice el PRD → reescribir datos, API, seguridad y pruebas; perder transacciones SQL y restricciones (p. ej. la exclusión que impide citas empalmadas). Rechazada.
2. Modelo mixto Firestore + Postgres → dos fuentes de verdad. Rechazada.

## Consequences

- Invariantes críticos (una sola revisión publicada, splits que suman 100 %, aceptaciones inmutables) se garantizan con **restricciones y funciones SQL**, más fuertes que reglas de Firestore.
- Las pruebas de base usan PGlite (Postgres real en memoria), en lugar del Emulator de Firebase.
- Los nombres de tablas siguen la convención del repositorio (español); los estados del PRD se conservan en inglés cuando el PRD los nombra, para poder cotejar.
