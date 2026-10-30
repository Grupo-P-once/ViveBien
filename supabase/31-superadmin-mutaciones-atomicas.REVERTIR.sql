-- Reversa de 31-superadmin-mutaciones-atomicas.sql
--
-- Sólo quita las dos funciones: no toca datos. El código nuevo que las usa
-- responderá 503 al cambiar un flag o un rol hasta que se vuelva a aplicar la 31
-- (o se despliegue el código anterior).

drop function if exists public.configuracion_cambiar_flag(text, boolean, boolean, jsonb);
drop function if exists public.usuario_cambiar_rol_estado(text, text, text, text, text, jsonb);
