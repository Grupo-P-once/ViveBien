-- Reversa de 43-origen-acreditacion-y-operaciones.sql. OJO: borra las operaciones de comisión y las verificaciones de acreditación.
-- Si ya hay operaciones reales, respáldalas antes (la tabla es el registro de lo que se debe y se reparte).

begin;

drop function if exists public.comision_reparto_liberar(uuid, jsonb);
drop function if exists public.comision_operacion_cambiar_estado(uuid, text, text, text, jsonb);
drop function if exists public.comision_operacion_registrar(jsonb, jsonb);
drop function if exists public.comision_auditoria_valida(jsonb);
drop function if exists public.origen_verificar_acreditacion(text, text, text, date, jsonb);

drop trigger if exists comision_operaciones_guardia on public.comision_operaciones;
drop table if exists public.comision_operaciones;
drop function if exists public.comision_operaciones_guardia();

drop trigger if exists propiedad_origen_acreditacion_guardia on public.propiedad_origen;
drop function if exists public.propiedad_origen_acreditacion_guardia();
alter table public.propiedad_origen drop constraint if exists propiedad_origen_acreditacion_ck;
alter table public.propiedad_origen
  drop column if exists declara_autorizacion,
  drop column if exists acreditacion_folio,
  drop column if exists acreditacion_municipio,
  drop column if exists acreditacion_aporto_por,
  drop column if exists acreditacion_resultado,
  drop column if exists acreditacion_vigente_hasta,
  drop column if exists acreditacion_verificado_por,
  drop column if exists acreditacion_verificado_en,
  drop column if exists acreditacion_motivo;

commit;
