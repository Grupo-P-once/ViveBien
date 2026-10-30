# ADR-0010 · Marketing Hub dentro del admin, alimentado por la revisión publicada (con huella)

- **Estado:** Aceptada como diseño (18-sep-2026); implementación en fases 16–18
- **Relacionado:** PRD §14–18, ADR-001/006/008/009/010 del PRD · prompt §23–36, §80

## Context

El PRD integra un Social & Marketing Hub (contenido, plantillas, calendario editorial, biblioteca, campañas, UTM, analítica, Meta, IA) al admin, sin segunda base de propiedades y sin CRM.

## Decision

- Rutas en `/admin/marketing/*`; mismos permisos y carcasa que el admin.
- Todo contenido de propiedad guarda `propiedad_id`, `revision_id` y **`huella_fuente`** (la `huella` de la revisión usada). Un trigger/trabajo marca `STALE_REVIEW_REQUIRED` cuando la revisión publicada cambia de huella; un contenido con huella vieja **no se puede programar ni publicar** (validación en servidor y de nuevo en el trabajo de publicación).
- Datos duros (precio, superficie, ubicación, disponibilidad, amenidades) se **leen** de la revisión; la interfaz los muestra bloqueados con su origen.
- Plantillas versionadas (`mkt_plantillas` + `mkt_plantilla_versiones`) con esquema de variables; editor controlado por esquema, **no** editor libre tipo Canva.
- Calendario con FullCalendar (ya instalado para citas) + arrastrar para reprogramar, respetando validaciones.
- IA sólo propone; salida JSON validada con Zod + validadores contra la revisión; aprobación humana siempre.

## Alternatives

- App de marketing separada → duplicaría permisos, datos y diseño. Rechazada (PRD ADR-008).

## Consequences

- Depende de ADR-0005 (revisiones) y ADR-0003 (trabajos). No empieza antes de que existan.
