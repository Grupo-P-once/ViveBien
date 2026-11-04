-- ═══════════════════════════════════════════════════════════
-- Vive Bien · 69 — Marca de «correo verificado» en la cuenta (4-nov-2026)
-- Idempotente y ADITIVA: solo agrega una columna con valor por omisión. Reversa: 69-usuarios-correo-verificado.REVERTIR.sql.
--
-- PROBLEMA: los correos de eventos (propiedad aprobada o rechazada, nuevo interesado, invitación aceptada…) los dispara una persona distinta del
--   destinatario (un administrador, un visitante). La regla del sitio es mandar solo al correo VERIFICADO de la cuenta, pero el servidor únicamente sabe si el correo
--   está verificado del lado de quien hace la petición (token de Firebase), no del destinatario.
-- SOLUCIÓN: `/api/usuarios/me` anota `email_verificado = true` cuando la sesión trae el correo verificado. El destinatario nunca queda en `true` por una acción de otra persona.
--   Sin la columna (migración sin aplicar) o en `false`, el código NO manda nada (falla cerrado).
-- ═══════════════════════════════════════════════════════════

begin;

alter table public.usuarios add column if not exists email_verificado boolean not null default false;

commit;
