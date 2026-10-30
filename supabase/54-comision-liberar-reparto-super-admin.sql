-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 54 — Comisiones: el Super Admin libera la parte del colaborador SIN exigir acreditación verificada ni operación atribuible
-- Reversa: 54-comision-liberar-reparto-super-admin.REVERTIR.sql
--
-- PREPARADA. Numeración provisional (adenda "por asignar"). Requiere la 43. Aplicar junto con el código que manda `actor_rol = 'super_admin'` (ya lo hace desde la 52).
--
-- POR QUÉ: decisión del dueño (26-oct-2026): la acreditación del agente colaborador es OPCIONAL «sí o sí»: la mayoría de los agentes con quienes se colabora no están
-- acreditados y el negocio no puede detenerse a verificarlo. La condición de la migración 43 (acreditación verificada y vigente + operación atribuible) sigue siendo la
-- regla para cualquier otro rol; el Super Admin puede liberar sin ella y queda dicho en la bitácora (`liberada_sin_verificacion: true`).
--
-- QUÉ CAMBIA: SÓLO `comision_reparto_liberar`. «Liberable» no es «pagado»: este módulo no mueve dinero. QUÉ NO CAMBIA: el cálculo, el registro, la anulación ni ninguna tabla.
-- La pregunta legal de si puede pagarse una parte a quien no está acreditado sigue abierta para el abogado: aquí NO se resuelve, solo se deja de impedir el trabajo y se deja rastro.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.comision_reparto_liberar(p_id uuid, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  o public.comision_operaciones%rowtype;
  g public.propiedad_origen%rowtype;
  cumple boolean;
  sin_verificar boolean := false;
begin
  if not public.comision_auditoria_valida(p_audit) then raise exception 'auditoria_incompleta' using errcode = '22023'; end if;
  select * into o from public.comision_operaciones where id = p_id for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if o.estado = 'anulada' or o.reparto_estado <> 'retenido' then return jsonb_build_object('resultado', 'conflicto'); end if;
  select * into g from public.propiedad_origen where propiedad_id = o.propiedad_id;
  cumple := o.atribuible and found and g.acreditacion_resultado is not distinct from 'coincide' and g.acreditacion_verificado_por is not null
            and g.acreditacion_vigente_hasta is not null and g.acreditacion_vigente_hasta >= current_date;
  if not cumple then
    -- Solo el Super Admin puede liberar sin acreditación verificada / sin atribución; queda marcado.
    if coalesce(p_audit->>'actor_rol', '') <> 'super_admin' then return jsonb_build_object('resultado', 'no_elegible'); end if;
    sin_verificar := true;
  end if;
  perform set_config('vivebien.operacion', 'on', true);
  update public.comision_operaciones set colaborador_centavos = colaborador_retenido_centavos, colaborador_retenido_centavos = 0,
    reparto_estado = 'liberable', retencion = null where id = p_id;
  perform set_config('vivebien.operacion', 'off', true);
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion',
          'comision_operaciones', p_id::text, p_audit->'antes',
          case when sin_verificar then coalesce(p_audit->'despues', '{}'::jsonb) || jsonb_build_object('liberada_sin_verificacion', true) else p_audit->'despues' end);
  return jsonb_build_object('resultado', 'ok', 'sin_verificacion', sin_verificar);
end;
$fn$;

commit;
