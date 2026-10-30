-- Reversa de 28-publicador-modalidad.sql
--
-- OJO: borra la modalidad y los overrides de TODOS los usuarios. Si ya hay
-- asociados o permisos individuales, respáldalos antes:
--
--   select uid, email, tipo_publicador, permisos_override
--     from public.usuarios
--    where tipo_publicador <> 'publicador' or permisos_override <> '{}'::jsonb;
--
-- El código tolera que las columnas no existan: vuelve a tratar a todos los
-- publicadores como modalidad normal sin overrides (lo más restrictivo).

drop function if exists public.usuario_cambiar_permisos(text, text, jsonb, text, jsonb, jsonb);

alter table public.usuarios drop constraint if exists usuarios_permisos_override_objeto;
alter table public.usuarios drop constraint if exists usuarios_tipo_publicador_check;
alter table public.usuarios drop column if exists permisos_override;
alter table public.usuarios drop column if exists tipo_publicador;
