-- Reversa de 55-colaboradores-externas-y-constancias.sql.
-- OJO: BORRA el directorio de colaboradores, las comisiones externas y las constancias (con sus folios). Respáldalos antes. La bitácora (`audit_logs`) se conserva.
-- Los archivos del bucket `contabilidad-adjuntos` NO se tocan (si ya hay comprobantes, bórralos desde el panel de Storage solo si estás seguro).
begin;

drop function if exists public.contab_constancia_adjuntar(uuid, text, jsonb);
drop function if exists public.contab_constancia_crear(jsonb, jsonb);
drop table if exists public.contab_constancias;
drop function if exists public.contab_constancias_guardia();
drop sequence if exists public.contab_constancia_seq;

drop function if exists public.comision_externa_cambiar_estado(uuid, text, text, jsonb, jsonb);
drop function if exists public.comision_externa_registrar(jsonb, jsonb);
drop table if exists public.comision_externas;
drop function if exists public.comision_externas_guardia();

drop function if exists public.contab_colaborador_cambiar(uuid, jsonb, jsonb);
drop function if exists public.contab_colaborador_registrar(jsonb, jsonb);
drop table if exists public.colaboradores;
drop function if exists public.colaboradores_guardia();

commit;
