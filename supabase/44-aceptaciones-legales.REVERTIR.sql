-- Reversa de 44-aceptaciones-legales.sql. OJO: borra el registro de quién aceptó los Términos y el Aviso de Privacidad.
-- Si ya hay aceptaciones reales, respáldalas antes: son la evidencia de lo que cada persona aceptó.

begin;

drop trigger if exists legal_aceptaciones_guardia on public.legal_aceptaciones;
drop table if exists public.legal_aceptaciones;
drop function if exists public.legal_aceptaciones_guardia();

commit;
