# ADR-0009 · Documentos jurídicos versionados y aceptación con evidencia

- **Estado:** Aceptada como diseño técnico (18-sep-2026); textos y suficiencia probatoria: **[LEGAL REVIEW REQUIRED]**
- **Relacionado:** DECISIONS D-03, D-19 · PRD Corrección 08 · prompt §21–22

## Context

Hoy la única «aceptación» es `consentimiento_version` + fecha en `solicitudes_contacto` y `citas`. El PRD exige documentos versionados (DRAFT → LEGAL_REVIEW → APPROVED → ACTIVE → ARCHIVED) y aceptaciones con evidencia, no `accepted = true`.

## Decision

- `documentos_legales` (familia: términos, privacidad, acuerdo de comercialización, propuesta de comisión, no elusión…) y `documento_versiones` (texto congelado, `sha256` del texto, estado, vigencia). Una versión `ACTIVE` es **inmutable** (trigger que rechaza `UPDATE` del texto); cambiar = versión nueva.
- `aceptaciones`: `usuario`, `version_id`, `sha256` aceptado, `aceptado_en` (reloj del servidor), método (`checkbox_explicito`, `reautenticacion`), IP y user-agent **sólo si el abogado lo indica** (datos personales), `request_id` único (idempotencia), y una huella de la evidencia (`sha256` de usuario + versión + fecha + método).
- Nunca casillas marcadas por defecto; aceptar exige acción explícita; para acuerdos de comercialización, reautenticación reciente (token de Firebase con `auth_time` reciente).
- Las aceptaciones no se borran al eliminar una cuenta (retención; se anonimiza lo demás).

## Alternatives

- Firma electrónica de terceros (NOM-151 con prestador certificado) → puede requerirse según el abogado; el diseño deja el campo `constancia_externa` para integrarla.

## Consequences

- Ninguna versión pasa a `ACTIVE` sin marca de revisión jurídica.
