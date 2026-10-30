-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 47 — Operaciones de comisión: porcentaje pactado, reparto, gastos y motivo del ajuste
-- Reversa: 47-comision-ajustes-y-gastos.REVERTIR.sql
--
-- PREPARADA. Numeración provisional (adenda "por asignar"). Requiere la 46. Aplicar solo con autorización del propietario.
--
-- La regla (3.5 % de venta, un mes de renta, 50/50 con el colaborador) es el punto de partida; el trato real se negocia. Cada operación guarda lo que
-- SE APLICÓ, para que el historial no dependa de qué decía la regla ese día:
--   comision_bp        venta: puntos base sobre el precio (350 = 3.50 %). null en rentas y en operaciones anteriores (valían la regla).
--   renta_meses_cent   renta: centésimas de mes (100 = un mes, 150 = mes y medio). null en ventas y en operaciones anteriores.
--   colaborador_bp     parte del colaborador en puntos base (5000 = 50 %). null si no hubo colaborador.
--   ajuste_motivo      por qué se separó de la regla (obligatorio si algún valor difiere; lo exige el servidor).
--   gastos             arreglo de {concepto, monto_centavos}: lo que costó la operación (fotografía, publicidad, gestoría…). Salen de la parte de
--                      VIVE BIEN, nunca de la del colaborador. Máximo 10, cada uno con concepto de hasta 80 caracteres.
--
--  · Todo esto forma parte de lo que NO se edita de una operación (se anula y se registra otra): el disparador lo incluye.
--  · `comision_operacion_registrar` acepta y valida los campos nuevos (rangos, forma del arreglo, que los gastos no excedan la parte de VIVE BIEN).
--  · No cambia permisos: la tabla sigue siendo solo del servidor. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.comision_operaciones
  add column if not exists comision_bp integer check (comision_bp is null or comision_bp between 50 and 1500),
  add column if not exists renta_meses_cent integer check (renta_meses_cent is null or renta_meses_cent between 25 and 300),
  add column if not exists colaborador_bp integer check (colaborador_bp is null or colaborador_bp between 0 and 10000),
  add column if not exists ajuste_motivo text check (ajuste_motivo is null or char_length(ajuste_motivo) between 10 and 300),
  add column if not exists gastos jsonb not null default '[]'::jsonb check (jsonb_typeof(gastos) = 'array' and jsonb_array_length(gastos) <= 10);

create or replace function public.comision_operaciones_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
declare
  via_funcion boolean := coalesce(current_setting('vivebien.operacion', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    raise exception 'Una operación de comisión no se borra: se anula.' using errcode = '23514';
  end if;
  if (new.id, new.propiedad_id, new.tipo, new.base_centavos, new.regla_version, new.total_centavos, new.atribuible, new.atribucion_ref,
      new.clave_idempotencia, new.creado_por, new.creado_en, new.fecha_cierre, new.propiedad_folio, new.propiedad_titulo, new.precio_lista_centavos,
      new.comision_bp, new.renta_meses_cent, new.colaborador_bp, new.ajuste_motivo, new.gastos)
     is distinct from
     (old.id, old.propiedad_id, old.tipo, old.base_centavos, old.regla_version, old.total_centavos, old.atribuible, old.atribucion_ref,
      old.clave_idempotencia, old.creado_por, old.creado_en, old.fecha_cierre, old.propiedad_folio, old.propiedad_titulo, old.precio_lista_centavos,
      old.comision_bp, old.renta_meses_cent, old.colaborador_bp, old.ajuste_motivo, old.gastos) then
    raise exception 'Una operación de comisión no se edita: se anula y se registra otra.' using errcode = '23514';
  end if;
  if not via_funcion and (new.estado, new.vivebien_centavos, new.colaborador_centavos, new.colaborador_retenido_centavos, new.retencion,
                          new.reparto_estado, new.estado_por, new.estado_en, new.estado_motivo)
     is distinct from
     (old.estado, old.vivebien_centavos, old.colaborador_centavos, old.colaborador_retenido_centavos, old.retencion,
      old.reparto_estado, old.estado_por, old.estado_en, old.estado_motivo) then
    raise exception 'El estado y el reparto solo cambian por las funciones de comisión.' using errcode = '23514';
  end if;
  if old.estado = 'anulada' and new.estado <> 'anulada' then
    raise exception 'Una operación anulada no vuelve.' using errcode = '23514';
  end if;
  return new;
end $f$;

create or replace function public.comision_operacion_registrar(p_datos jsonb, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  k text; r public.comision_operaciones%rowtype; nuevo_id uuid; cierre date; g jsonb; suma_gastos bigint := 0; lista_gastos jsonb;
begin
  if not public.comision_auditoria_valida(p_audit) or jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_datos) loop
    if k not in ('propiedad_id', 'tipo', 'base_centavos', 'regla_version', 'total_centavos', 'vivebien_centavos', 'colaborador_centavos',
                 'colaborador_retenido_centavos', 'retencion', 'reparto_estado', 'atribuible', 'atribucion_ref', 'clave_idempotencia', 'creado_por',
                 'fecha_cierre', 'propiedad_folio', 'propiedad_titulo', 'precio_lista_centavos',
                 'comision_bp', 'renta_meses_cent', 'colaborador_bp', 'ajuste_motivo', 'gastos') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;

  begin
    cierre := nullif(p_datos->>'fecha_cierre', '')::date;
  exception when others then
    raise exception 'cambio_invalido' using errcode = '22023';
  end;
  if cierre is not null and (cierre > current_date + 1 or cierre < date '2000-01-01') then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  -- Gastos: arreglo de objetos {concepto, monto_centavos}; la suma no puede exceder la parte de VIVE BIEN.
  lista_gastos := coalesce(p_datos->'gastos', '[]'::jsonb);
  if jsonb_typeof(lista_gastos) is distinct from 'array' or jsonb_array_length(lista_gastos) > 10 then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  for g in select * from jsonb_array_elements(lista_gastos) loop
    if jsonb_typeof(g) is distinct from 'object'
       or jsonb_typeof(g->'concepto') is distinct from 'string' or char_length(btrim(g->>'concepto')) not between 1 and 80
       or jsonb_typeof(g->'monto_centavos') is distinct from 'number' or (g->>'monto_centavos') !~ '^[0-9]{1,15}$' or (g->>'monto_centavos')::bigint < 1
       or (select count(*) from jsonb_object_keys(g)) <> 2 then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
    suma_gastos := suma_gastos + (g->>'monto_centavos')::bigint;
  end loop;
  if suma_gastos > coalesce((p_datos->>'vivebien_centavos')::bigint, 0) then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  begin
    insert into public.comision_operaciones (propiedad_id, tipo, base_centavos, regla_version, total_centavos, vivebien_centavos,
      colaborador_centavos, colaborador_retenido_centavos, retencion, reparto_estado, atribuible, atribucion_ref, clave_idempotencia, creado_por, fecha_cierre,
      propiedad_folio, propiedad_titulo, precio_lista_centavos, comision_bp, renta_meses_cent, colaborador_bp, ajuste_motivo, gastos)
    values (p_datos->>'propiedad_id', p_datos->>'tipo', (p_datos->>'base_centavos')::bigint, p_datos->>'regla_version',
      (p_datos->>'total_centavos')::bigint, (p_datos->>'vivebien_centavos')::bigint, (p_datos->>'colaborador_centavos')::bigint,
      (p_datos->>'colaborador_retenido_centavos')::bigint, nullif(p_datos->>'retencion', ''), p_datos->>'reparto_estado',
      (p_datos->>'atribuible')::boolean, nullif(p_datos->>'atribucion_ref', ''), p_datos->>'clave_idempotencia', p_datos->>'creado_por', cierre,
      nullif(p_datos->>'propiedad_folio', ''), nullif(p_datos->>'propiedad_titulo', ''), (nullif(p_datos->>'precio_lista_centavos', ''))::bigint,
      (nullif(p_datos->>'comision_bp', ''))::integer, (nullif(p_datos->>'renta_meses_cent', ''))::integer, (nullif(p_datos->>'colaborador_bp', ''))::integer,
      nullif(btrim(coalesce(p_datos->>'ajuste_motivo', '')), ''), lista_gastos)
    returning id into nuevo_id;
  exception
    when unique_violation then
      select * into r from public.comision_operaciones where clave_idempotencia = p_datos->>'clave_idempotencia';
      if r.propiedad_id = p_datos->>'propiedad_id' and r.tipo = p_datos->>'tipo' and r.base_centavos = (p_datos->>'base_centavos')::bigint
         and r.regla_version = p_datos->>'regla_version' then
        return jsonb_build_object('resultado', 'repetida', 'id', r.id);
      end if;
      return jsonb_build_object('resultado', 'clave_en_uso');
    when foreign_key_violation then
      return jsonb_build_object('resultado', 'no_existe');
    when check_violation or invalid_text_representation or numeric_value_out_of_range or not_null_violation then
      raise exception 'cambio_invalido' using errcode = '22023';
  end;

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion',
          'comision_operaciones', nuevo_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok', 'id', nuevo_id);
end;
$fn$;

commit;
