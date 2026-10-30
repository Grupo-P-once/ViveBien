# ADR-0005 · Revisiones de propiedad: la ficha pública lee la revisión publicada

- **Estado:** Aceptada (18-sep-2026)
- **Relacionado:** DECISIONS D-10, D-12 · PRD §6, prompt §10–12, §79–80 · ADR-001 del PRD

## Context

Hoy `propiedades` es a la vez identidad, datos comerciales y estado; editar una publicada cambia la ficha al instante. El PRD exige `property` + `propertyRevision`: la revisión publicada sigue visible mientras otra se revisa, y marketing referencia `propertyRevisionId` + `sourceFingerprint`.

## Decision

- `propiedades` conserva **identidad y ciclo de vida**: `id`, `slug`, `folio`, `owner_id`, `publisher_id` (nuevo; al migrar = `owner_id`), `lifecycle` (DRAFT…RENTED), `revision_publicada_id`, contadores, fechas.
- `propiedad_revisiones`: número de revisión, estado (`DRAFT`, `IN_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `PUBLISHED`, `SUPERSEDED`), **todos los datos públicos y comerciales** (título, precio, superficie, ubicación, características, amenidades, orden de fotos, descripción), `huella` (SHA-256 de los campos críticos: precio, superficie, ubicación, disponibilidad, fotos principales), autor, revisor, fechas.
- Restricción: **una sola revisión PUBLISHED por propiedad** (índice único parcial). Publicar una nueva marca la anterior como SUPERSEDED en la misma transacción (función `propiedad_publicar_revision`).
- Lectura pública por la vista **`propiedades_publicas`** (sólo columnas públicas de la revisión publicada). La tabla deja de ser legible por `anon` (cierra SEC-02).
- El asistente sigue editando todo (V-1.1.74), pero sobre una revisión DRAFT.

## Alternatives

1. Tabla de historial (auditoría) sin separar lo vigente → no resuelve «la publicada sigue visible mientras se revisa la nueva».
2. Columnas `*_pendiente` en la misma fila → no escala a revisiones múltiples ni a huellas.

## Consequences

- **Migración sin pérdida:** cada propiedad actual genera su revisión 1 copiando la fila (publicada si hoy lo está); las columnas viejas se conservan hasta retirar todo lector (lista de lectores en el plan).
- Web, SEO, sitemap, catálogo, portal, admin y bot de Telegram pasan a un **servicio de propiedades** único.
- Dry run completo en PGlite con una copia del esquema y de los datos (sin PII) antes de producción.
