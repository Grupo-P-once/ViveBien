-- Reversa de la migración 69: quita la marca de correo verificado. Después de esto los correos de eventos dirigidos a otra persona dejan de salir (falla cerrado).
begin;
alter table public.usuarios drop column if exists email_verificado_para;
alter table public.usuarios drop column if exists email_verificado;
commit;
