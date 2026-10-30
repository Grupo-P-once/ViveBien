# ADR-0006 · El contacto es de VIVE BIEN: el publicador no recibe datos de interesados

- **Estado:** Aceptada (18-sep-2026) — el número público y quién atiende quedan en DECISIONS D-02 / D-08
- **Relacionado:** PRD Corrección 01, §7 · ADR-002 del PRD · AUDIT SEC-01, CIT-01

## Context

El asistente permite al publicador poner el WhatsApp del anuncio; la ficha y las tarjetas lo usan; `/api/contacto` le manda al dueño nombre, WhatsApp y correo del interesado; el consentimiento vigente lo anuncia. Las citas de V-1.1.75 toman al dueño como asesor y le enseñan los datos del cliente. El PRD prohíbe todo eso.

## Decision

1. **CTAs públicos** (ficha, tarjetas, botón flotante, correos) sólo con datos de `configuracion` (ADR-0012). `propiedades.whatsapp` / `telefono` dejan de publicarse (se conservan como dato interno; no se borran) y salen del asistente del publicador.
2. **Leads** entran a VIVE BIEN: el aviso inmediato va a atención de VIVE BIEN; el publicador recibe, a lo sumo, un aviso **sin datos personales** («Hay un nuevo interesado en tu propiedad X»).
3. **Visitas:** ~~el asesor de una cita es personal de VIVE BIEN (asignado; por defecto el admin)~~ → **enmendado el 2-oct-2026 por ADR-0013, ver abajo**. Lo que se mantiene: el publicador ve sus visitas con fecha, hora, estado y propiedad, **sin nombre, teléfono ni correo** del interesado salvo el permiso `ver_datos_interesado`.
4. **Rendimiento del publicador:** sólo agregados (vistas, guardados, contactos, visitas por semana).
5. Todo intento de leer PII desde una cuenta de publicador se rechaza en servidor y se audita.

## Alternatives

- Mostrar PII al publicador con consentimiento explícito → contradice el PRD («no entregar el PII del lead al Publicador en la V1»). Rechazada para V1.

## Consequences

- Cambian: ficha, `PropertyCard`, `WAFloat`, asistente, `lib/whatsapp.ts`, `/api/contacto`, servicio de citas (`papelEn`, `recortar`, correos) y `docs/permissions.md`.
- Hace falta un **nuevo texto de consentimiento** y de aviso de privacidad (D-03). Mientras el abogado no lo apruebe, el vigente sigue mencionando al anunciante; qué hacer en ese intervalo lo decide el abogado, no el código.

## Enmienda — 2-oct-2026 (ADR-0013)

El punto 3 ya **no** dice que el asesor sea siempre personal de VIVE BIEN. Desde el 2-oct-2026 (ADR-0013, implementado en código): **un publicador con el permiso `recibir_citas` puede ser el asesor de las citas de SUS propias propiedades** (el asesor sigue siendo el dueño de la propiedad, `owner_id`; no hay una asignación distinta, que es la tarea 08.01 pendiente). Sin `recibir_citas`, la visita a esa propiedad no se agenda y no se reasigna al equipo. El equipo de VIVE BIEN sigue siendo asesor de las propiedades que son suyas.

Atender una cita y ver los datos de quien la pidió son **permisos separados**: `ver_datos_interesado` está apagado por defecto en AMBAS modalidades (publicador y asociado). Los puntos 1, 2, 4 y 5 no cambian.

**Disponibilidad real:** esto es capacidad implementada (backend listo). Mientras el flag `citasEnLinea` esté apagado —lo está en producción, verificado en la tabla `configuracion` el 2-oct-2026— no se crea ninguna cita, para nadie.
