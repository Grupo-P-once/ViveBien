-- Reversa de 62-correo-suscripciones.sql
--
-- Borra SÓLO lo que esa migración creó (4 tablas nuevas y 9 funciones `correo_*`). No toca ninguna otra tabla.
-- ATENCIÓN: borra también el historial de consentimientos, bajas, supresiones y envíos de correo. Antes de
-- ejecutarla en producción, exportar `correo_suscriptores` y `correo_supresiones` (son la prueba de las bajas:
-- perderlas permitiría volver a escribirle a quien ya se dio de baja o rebotó).

begin;

drop function if exists public.correo_salud();
drop function if exists public.correo_vincular_cuenta(text, text);
drop function if exists public.correo_evento(text, text, text, text, boolean);
drop function if exists public.correo_marcar_envio(bigint, text, text, text);
drop function if exists public.correo_cupo_estado(text);
drop function if exists public.correo_reservar_envio(text, text, text, text, uuid, text[], text);
drop function if exists public.correo_cuenta_marketing(text, text, boolean, jsonb, text);
drop function if exists public.correo_baja(uuid, text);
drop function if exists public.correo_confirmar(uuid);
drop function if exists public.correo_suscribir(text, text, jsonb, text, text);

drop table if exists public.correo_webhook_vistos;
drop table if exists public.correo_envios;
drop table if exists public.correo_supresiones;
drop table if exists public.correo_suscriptores;

commit;
