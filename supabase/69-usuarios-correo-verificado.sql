-- ═══════════════════════════════════════════════════════════
-- Vive Bien · 69 — Marca de «correo verificado» en la cuenta (4-nov-2026)
-- Idempotente y ADITIVA: solo agrega columnas con valor por omisión. Reversa: 69-usuarios-correo-verificado.REVERTIR.sql.
--
-- PROBLEMA: los correos de eventos (propiedad aprobada o rechazada, nuevo interesado, invitación aceptada…) los dispara una persona distinta del
--   destinatario (un administrador, un visitante). La regla del sitio es mandar solo al correo VERIFICADO de la cuenta, pero el servidor únicamente sabe si el correo
--   está verificado del lado de quien hace la petición (token de Firebase), no del destinatario.
-- SOLUCIÓN: `/api/usuarios/me` anota `email_verificado = true` y QUÉ dirección quedó verificada (`email_verificado_para`, en minúsculas) cuando la sesión trae el correo verificado.
--   El código solo escribe al correo de la cuenta si coincide con esa dirección: si el correo cambia después, la marca vieja ya no sirve (no queda «verificado» por arrastre).
--   Sin las columnas (migración sin aplicar), en `false` o con otra dirección, el código NO manda nada (falla cerrado). Ninguna acción de otra persona la pone en `true`.
-- ═══════════════════════════════════════════════════════════

begin;

alter table public.usuarios add column if not exists email_verificado boolean not null default false;
alter table public.usuarios add column if not exists email_verificado_para text;

commit;
