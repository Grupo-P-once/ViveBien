-- Reversa de 57-propiedad-origen-colaborador.sql. Pierde solo el vínculo propiedad → colaborador (los colaboradores y las propiedades no se tocan).
begin;
drop index if exists public.propiedad_origen_colaborador;
alter table public.propiedad_origen drop column if exists colaborador_id;
commit;
