# ADR-0008 · Fotos públicas en Cloudinary con subida firmada; documentos privados en Supabase Storage

- **Estado:** Aceptada (18-sep-2026)
- **Relacionado:** DECISIONS D-16 · AUDIT SEC-05 · PRD §24 · prompt §33, §44

## Context

Las fotos van a Cloudinary con un **preset sin firma expuesto en el navegador** (cualquiera puede subir) y hoy el preset ni existe (subidas rotas). No hay documentos privados. El PRD separa PUBLIC_MEDIA, MARKETING_ASSETS y PRIVATE_DOCUMENTS, con validación de tipo real y cuarentena.

## Decision

- **Fotos y assets públicos:** Cloudinary, con **subida firmada**: el servidor emite una firma de vida corta (`/api/medios/firma`) sólo a quien puede editar esa propiedad, con carpeta, formatos y tamaño máximo fijados en la firma. Tras subir, el servidor verifica tipo/tamaño/dimensiones con la API de Cloudinary y registra el medio (`fotos` ampliada: tipo, dimensiones, bytes, checksum, estado `QUARANTINE → AVAILABLE`). Se elimina el preset sin firma.
- **Documentos privados** (escrituras, identificaciones, predial): **Supabase Storage**, bucket **privado**, ruta `propiedades/<id>/<uuid>`; subida y descarga sólo con URL firmada de minutos emitida por el servidor tras comprobar permisos; validación de *magic bytes* en servidor; nunca URL pública.
- **Assets de marketing:** Cloudinary en carpeta `marketing/`, con versión y huella.
- La foto original de una propiedad es inmutable; marketing trabaja sobre derivados.

## Alternatives

1. Todo en Supabase Storage → perder la entrega optimizada de Cloudinary que el sitio ya usa. Rechazada.
2. Seguir con preset sin firma → exposición (SEC-05). Rechazada.

## Consequences

- Requiere la clave de API de Cloudinary sólo en servidor (rotarla antes: pendiente de seguridad).
- El bot de Telegram sube con la misma firma de servidor.
