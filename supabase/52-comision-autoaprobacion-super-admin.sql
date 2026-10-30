-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 52 — Comisiones: el Super Admin puede confirmar el cobro de una operación que él mismo registró (con motivo, marcada «autoaprobada»)
-- Reversa: 52-comision-autoaprobacion-super-admin.REVERTIR.sql
--
-- PREPARADA. Numeración provisional (adenda "por asignar"). Requiere la 43. Aplicar junto con el código que manda `actor_rol = 'super_admin'`.
--
-- POR QUÉ: la regla de la migración 43 («quien registró no confirma») es un doble control. Con una sola persona en el equipo (Super Admin) bloquea
-- el trabajo. Decisión del dueño (26-oct-2026): el Super Admin puede confirmar la suya, con motivo, y queda marcada.
--
-- QUÉ CAMBIA: SÓLO `comision_operacion_cambiar_estado`. Si quien confirma es el mismo que registró:
--   · y su rol de bitácora es `super_admin` → se permite (el motivo de 10 a 500 caracteres ya era obligatorio) y la bitácora lleva `autoaprobada: true`;
--   · cualquier otro rol → sigue respondiendo `autoaprobacion` (no se confirma).
-- La función solo la llama el servidor (`service_role`) tras validar la sesión; el rol de la bitácora lo decide el servidor, no el navegador.
-- QUÉ NO CAMBIA: anular, liberar el reparto, el resto de las reglas de transición ni ninguna tabla. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.comision_operacion_cambiar_estado(p_id uuid, p_antes text, p_nuevo text, p_motivo text, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  o public.comision_operaciones%rowtype;
  autoaprobada boolean := false;
begin
  if not public.comision_auditoria_valida(p_audit) or char_length(btrim(coalesce(p_motivo, ''))) < 10 or char_length(p_motivo) > 500 then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  if p_nuevo not in ('confirmada', 'anulada') then raise exception 'cambio_invalido' using errcode = '22023'; end if;
  select * into o from public.comision_operaciones where id = p_id for update;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if o.estado is distinct from p_antes then return jsonb_build_object('resultado', 'conflicto'); end if;
  if not ((o.estado, p_nuevo) in (('registrada', 'confirmada'), ('registrada', 'anulada'), ('confirmada', 'anulada'))) then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  if p_nuevo = 'confirmada'
     and (lower(o.creado_por) = lower(coalesce(p_audit->>'actor_email', '')) or o.creado_por = p_audit->>'actor_uid') then
    -- Doble control: solo el Super Admin puede confirmar la que él mismo registró, y queda marcada.
    if coalesce(p_audit->>'actor_rol', '') <> 'super_admin' then
      return jsonb_build_object('resultado', 'autoaprobacion');
    end if;
    autoaprobada := true;
  end if;
  perform set_config('vivebien.operacion', 'on', true);
  update public.comision_operaciones set estado = p_nuevo, estado_por = coalesce(nullif(p_audit->>'actor_email', ''), p_audit->>'actor_uid'),
    estado_en = now(), estado_motivo = btrim(p_motivo) where id = p_id;
  perform set_config('vivebien.operacion', 'off', true);
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion',
          'comision_operaciones', p_id::text, p_audit->'antes',
          case when autoaprobada then p_audit->'despues' || jsonb_build_object('autoaprobada', true) else p_audit->'despues' end);
  return jsonb_build_object('resultado', 'ok', 'autoaprobada', autoaprobada);
end;
$fn$;

commit;
