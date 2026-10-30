-- Reversa de 54-comision-liberar-reparto-super-admin.sql: vuelve a la regla de la migración 43 (solo con acreditación verificada y vigente + operación atribuible, para todos los roles).
begin;

create or replace function public.comision_reparto_liberar(p_id uuid, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  o public.comision_operaciones%rowtype;
  g public.propiedad_origen%rowtype;
begin
  if not public.comision_auditoria_valida(p_audit) then raise exception 'auditoria_incompleta' using errcode = '22023'; end if;
  select * into o from public.comision_operaciones where id = p_id for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if o.estado = 'anulada' or o.reparto_estado <> 'retenido' then return jsonb_build_object('resultado', 'conflicto'); end if;
  select * into g from public.propiedad_origen where propiedad_id = o.propiedad_id;
  if not o.atribuible or not found or g.acreditacion_resultado is distinct from 'coincide' or g.acreditacion_verificado_por is null
     or g.acreditacion_vigente_hasta is null or g.acreditacion_vigente_hasta < current_date then
    return jsonb_build_object('resultado', 'no_elegible');
  end if;
  perform set_config('vivebien.operacion', 'on', true);
  update public.comision_operaciones set colaborador_centavos = colaborador_retenido_centavos, colaborador_retenido_centavos = 0,
    reparto_estado = 'liberable', retencion = null where id = p_id;
  perform set_config('vivebien.operacion', 'off', true);
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion',
          'comision_operaciones', p_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

commit;
