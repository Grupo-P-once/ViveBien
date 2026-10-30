-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 53 — Contabilidad: «aportación a una empresa del grupo» y «pago al colaborador» (salen dinero, pero NO son gasto)
-- Reversa: 53-contabilidad-aportaciones-al-grupo.REVERTIR.sql
--
-- PREPARADA. Numeración provisional (adenda "por asignar"). Requiere la 48 (y la 50 no es necesaria). Aplicar junto con el código.
--
-- POR QUÉ: el dueño entregó $40,000 a otra empresa (ANDAX) como aportación de capital. Eso resta efectivo a VIVE BIEN pero no es un gasto: no debe
-- bajar la utilidad. El libro solo conocía gasto / ingreso extra / devolución / anulación.
--
-- Y: la parte del colaborador de la renta se pagó EN EFECTIVO, pero el sistema solo conocía «liberar el reparto» (que exige acreditación verificada). Un pago es un
-- hecho que ocurrió: hay que poder registrarlo sin que eso verifique nada ni libere nada.
--
-- QUÉ CAMBIA: dos clases nuevas de movimiento. `aportacion_grupo` (sentido «sale», categoría fija, sin devolución; se corrige con anulación) y
-- `pago_colaborador` (sale; va LIGADO a una operación de comisión que no esté anulada; no puede exceder lo que falta pagarle de esa operación: su parte, retenida o no, menos
-- los pagos vigentes; hereda la propiedad de la operación; se corrige con anulación). Un pago NO libera el reparto ni verifica la acreditación: lo registra. Se amplían las tres restricciones de `contab_movimientos` y se reemplaza `contab_movimiento_registrar` para aceptarla. Un gasto
-- NO puede llevar la categoría `aportacion_grupo`. QUÉ NO CAMBIA: los movimientos existentes, los permisos ni ninguna otra tabla. Idempotente.
-- El tratamiento fiscal y contable (inversión en acciones, aportación para futuros aumentos de capital, etc.) lo confirma el contador.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.contab_movimientos drop constraint contab_movimientos_clase_check;
alter table public.contab_movimientos add constraint contab_movimientos_clase_check
  check (clase in ('gasto', 'ingreso_extra', 'devolucion', 'anulacion', 'aportacion_grupo', 'pago_colaborador'));

alter table public.contab_movimientos drop constraint contab_movimientos_categoria_check;
alter table public.contab_movimientos add constraint contab_movimientos_categoria_check
  check (categoria in ('publicidad_digital', 'publicidad_impresa', 'fotografia_video', 'gestoria_legal', 'software_suscripciones', 'transporte', 'oficina',
                       'honorarios_externos', 'comision_externa', 'impuestos_derechos', 'otro', 'ingreso_extra', 'aportacion_grupo', 'pago_colaborador'));

alter table public.contab_movimientos drop constraint contab_movimientos_clase_ck;
alter table public.contab_movimientos add constraint contab_movimientos_clase_ck check (
  (clase = 'gasto' and sentido = 'sale' and reverso_de is null and categoria not in ('ingreso_extra', 'aportacion_grupo', 'pago_colaborador'))
  or (clase = 'ingreso_extra' and sentido = 'entra' and reverso_de is null and categoria = 'ingreso_extra')
  or (clase = 'aportacion_grupo' and sentido = 'sale' and reverso_de is null and categoria = 'aportacion_grupo')
  or (clase = 'pago_colaborador' and sentido = 'sale' and reverso_de is null and categoria = 'pago_colaborador' and operacion_id is not null)
  or (clase in ('devolucion', 'anulacion') and reverso_de is not null and motivo is not null)
);

create or replace function public.contab_movimiento_registrar(p_datos jsonb, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  k text; v_clase text; v_sentido text; v_monto bigint; v_fecha date; v_categoria text; v_concepto text;
  v_cuenta uuid; v_propiedad text; v_operacion uuid; v_reverso uuid;
  orig public.contab_movimientos%rowtype; ya public.contab_movimientos%rowtype; cta public.contab_cuentas%rowtype;
  devuelto bigint; esperado bigint; nuevo_id uuid; op public.comision_operaciones%rowtype; pagado bigint;
begin
  if not public.comision_auditoria_valida(p_audit) or jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_datos) loop
    if k not in ('fecha', 'clase', 'monto_centavos', 'categoria', 'cuenta_id', 'propiedad_id', 'operacion_id', 'concepto', 'referencia',
                 'reverso_de', 'motivo', 'clave_idempotencia', 'creado_por') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;

  if jsonb_typeof(p_datos->'monto_centavos') is distinct from 'number' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  begin
    v_clase := p_datos->>'clase';
    v_monto := (p_datos->>'monto_centavos')::bigint;
    v_fecha := (p_datos->>'fecha')::date;
    v_cuenta := nullif(p_datos->>'cuenta_id', '')::uuid;
    v_operacion := nullif(p_datos->>'operacion_id', '')::uuid;
    v_reverso := nullif(p_datos->>'reverso_de', '')::uuid;
  exception when others then
    raise exception 'cambio_invalido' using errcode = '22023';
  end;
  v_propiedad := nullif(btrim(coalesce(p_datos->>'propiedad_id', '')), '');
  v_categoria := p_datos->>'categoria';
  v_concepto := btrim(coalesce(p_datos->>'concepto', ''));

  if v_clase is null or v_clase not in ('gasto', 'ingreso_extra', 'devolucion', 'anulacion', 'aportacion_grupo', 'pago_colaborador')
     or v_monto is null or v_monto < 1 or v_fecha is null or v_fecha < date '2000-01-01' or v_fecha > current_date + 1
     or char_length(v_concepto) not between 2 and 200 or v_concepto ~ '@|[0-9]{7,}'
     or coalesce(p_datos->>'referencia', '') ~ '@' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  if v_clase in ('gasto', 'ingreso_extra', 'aportacion_grupo', 'pago_colaborador') then
    if v_reverso is not null or nullif(btrim(coalesce(p_datos->>'motivo', '')), '') is not null then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
    v_sentido := case when v_clase = 'ingreso_extra' then 'entra' else 'sale' end;
    if v_clase = 'gasto' and (v_categoria is null or v_categoria in ('ingreso_extra', 'aportacion_grupo', 'pago_colaborador')) then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
    if v_clase = 'ingreso_extra' then v_categoria := 'ingreso_extra'; end if;
    if v_clase = 'aportacion_grupo' then v_categoria := 'aportacion_grupo'; end if;
    if v_clase = 'pago_colaborador' then
      v_categoria := 'pago_colaborador';
      if v_operacion is null then raise exception 'cambio_invalido' using errcode = '22023'; end if;
      -- Pagos de la misma operación se atienden uno tras otro.
      perform pg_advisory_xact_lock(hashtextextended('contab-pago:' || v_operacion::text, 0));
      select * into op from public.comision_operaciones where id = v_operacion;
      if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
      if op.estado = 'anulada' then return jsonb_build_object('resultado', 'no_aplica'); end if;
      select coalesce(sum(m.monto_centavos), 0) into pagado from public.contab_movimientos m
       where m.operacion_id = op.id and m.clase = 'pago_colaborador'
         and not exists (select 1 from public.contab_movimientos a where a.reverso_de = m.id and a.clase = 'anulacion');
      if v_monto > op.colaborador_centavos + op.colaborador_retenido_centavos - pagado then
        return jsonb_build_object('resultado', 'excede', 'disponible', op.colaborador_centavos + op.colaborador_retenido_centavos - pagado);
      end if;
      v_propiedad := op.propiedad_id;
    end if;
    if v_cuenta is not null then
      select * into cta from public.contab_cuentas where id = v_cuenta;
      if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
      if not cta.activa then return jsonb_build_object('resultado', 'cuenta_inactiva'); end if;
    end if;
  else
    if v_reverso is null or nullif(btrim(coalesce(p_datos->>'motivo', '')), '') is null then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('contab:' || v_reverso::text, 0));
    select * into orig from public.contab_movimientos where id = v_reverso;
    if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
    if v_fecha < orig.fecha then raise exception 'cambio_invalido' using errcode = '22023'; end if;
    if exists (select 1 from public.contab_movimientos a where a.reverso_de = orig.id and a.clase = 'anulacion') then
      return jsonb_build_object('resultado', 'ya_anulado');
    end if;
    select coalesce(sum(d.monto_centavos), 0) into devuelto from public.contab_movimientos d
     where d.reverso_de = orig.id and d.clase = 'devolucion'
       and not exists (select 1 from public.contab_movimientos a where a.reverso_de = d.id and a.clase = 'anulacion');
    if v_clase = 'devolucion' then
      if orig.clase not in ('gasto', 'ingreso_extra') then return jsonb_build_object('resultado', 'no_aplica'); end if;
      if v_monto > orig.monto_centavos - devuelto then
        return jsonb_build_object('resultado', 'excede', 'disponible', orig.monto_centavos - devuelto);
      end if;
    else
      if orig.clase = 'anulacion' then return jsonb_build_object('resultado', 'no_aplica'); end if;
      esperado := orig.monto_centavos - case when orig.clase in ('gasto', 'ingreso_extra') then devuelto else 0 end;
      if esperado <= 0 then return jsonb_build_object('resultado', 'sin_remanente'); end if;
      if v_monto <> esperado then return jsonb_build_object('resultado', 'monto_distinto', 'esperado', esperado); end if;
    end if;
    v_sentido := case when orig.sentido = 'sale' then 'entra' else 'sale' end;
    v_categoria := orig.categoria; v_cuenta := orig.cuenta_id; v_propiedad := orig.propiedad_id; v_operacion := orig.operacion_id;
  end if;

  begin
    insert into public.contab_movimientos (fecha, sentido, clase, monto_centavos, categoria, cuenta_id, propiedad_id, operacion_id, concepto, referencia,
                                           reverso_de, motivo, clave_idempotencia, creado_por)
    values (v_fecha, v_sentido, v_clase, v_monto, v_categoria, v_cuenta, v_propiedad, v_operacion, v_concepto, nullif(btrim(coalesce(p_datos->>'referencia', '')), ''),
            v_reverso, nullif(btrim(coalesce(p_datos->>'motivo', '')), ''), p_datos->>'clave_idempotencia', p_datos->>'creado_por')
    returning id into nuevo_id;
  exception
    when unique_violation then
      select * into ya from public.contab_movimientos where clave_idempotencia = p_datos->>'clave_idempotencia';
      if ya.clase = v_clase and ya.monto_centavos = v_monto and ya.fecha = v_fecha and ya.reverso_de is not distinct from v_reverso then
        return jsonb_build_object('resultado', 'repetida', 'id', ya.id);
      end if;
      return jsonb_build_object('resultado', 'clave_en_uso');
    when foreign_key_violation then
      return jsonb_build_object('resultado', 'no_existe');
    when check_violation or invalid_text_representation or numeric_value_out_of_range or not_null_violation then
      raise exception 'cambio_invalido' using errcode = '22023';
  end;

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'contab_movimientos', nuevo_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok', 'id', nuevo_id);
end;
$fn$;

commit;
