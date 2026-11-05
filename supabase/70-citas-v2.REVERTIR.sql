-- ═══════════════════════════════════════════════════════════════
-- Reversa de 70-citas-v2.sql — devuelve el modelo de la migración 15.
--
-- ⚠️ Pierde datos que la 15 no sabe guardar:
--   · las citas REJECTED y EXPIRED pasan a CANCELLED (el motivo se conserva);
--   · se borran `citas.tipo`, `citas.propietario_uid`, `propiedades.responsable_citas_uid`;
--   · se borra la cola `citas_recordatorios` y los avisos de tipo `cita`.
-- Sin eliminaciones condicionales. Las funciones originales de la 15 van al final.
-- ═══════════════════════════════════════════════════════════════

update public.citas set estado = 'CANCELLED' where estado in ('REJECTED', 'EXPIRED');

drop function public.cita_programar_recordatorios(public.citas);
drop function public.citas_recordatorios_reclamar(integer);
drop function public.citas_recordatorio_marcar(bigint, boolean, text);
drop table public.citas_recordatorios;

alter table public.citas drop constraint citas_asesor_sin_empalme;
alter table public.citas add constraint citas_asesor_sin_empalme exclude using gist (
  asesor_uid with =,
  tstzrange(ocupa_desde, ocupa_hasta, '[)') with &&
) where (estado in ('REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED'));

alter table public.citas drop constraint citas_estado_check;
alter table public.citas drop constraint citas_estado_previo_check;
alter table public.citas add constraint citas_estado_check check (estado in (
  'REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'));
alter table public.citas add constraint citas_estado_previo_check check (estado_previo in (
  'REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULED'));

drop index public.citas_propietario_inicio;
alter table public.citas drop constraint citas_tipo_check;
alter table public.citas drop column tipo;
alter table public.citas drop column propietario_uid;
alter table public.propiedades drop column responsable_citas_uid;

do $$
declare r record;
begin
  if to_regclass('public.notificaciones') is null then return; end if;
  delete from public.notificaciones where tipo = 'cita';
  for r in
    select conname from pg_constraint
    where conrelid = 'public.notificaciones'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%busqueda_nueva%'
  loop
    execute format('alter table public.notificaciones drop constraint %I', r.conname);
  end loop;
  alter table public.notificaciones add constraint notificaciones_tipo_check
    check (tipo in ('busqueda_nueva', 'baja_de_precio', 'legal', 'sistema'));
end $$;

-- ── Funciones originales de la migración 15 (copiadas tal cual) ──────────────
-- ── Crear una cita ──────────────────────────────────────────────
-- Inserta la cita y su evento CREATED juntos. La restricción de exclusión
-- decide si el horario cabe (error 23P01 si no). Con la misma clave de
-- idempotencia devuelve la cita que ya existe en vez de crear otra.

create or replace function public.cita_crear(p jsonb)
returns public.citas
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.citas;
  v_margen smallint := coalesce((p->>'margen_min')::smallint, 15);
  v_inicio timestamptz := (p->>'inicio')::timestamptz;
  v_fin timestamptz := (p->>'fin')::timestamptz;
begin
  if p->>'clave_idempotencia' is not null then
    select * into v from public.citas
      where creada_por = p->>'creada_por' and clave_idempotencia = p->>'clave_idempotencia';
    if found then return v; end if;
  end if;

  if v_inicio <= now() then
    raise exception 'fuera_de_tiempo' using errcode = 'P0001';
  end if;

  insert into public.citas (
    propiedad_id, cliente_uid, asesor_uid, inicio, fin, margen_min, ocupa_desde, ocupa_hasta,
    estado, cliente_nombre, cliente_telefono, cliente_email, consentimiento_version,
    propiedad_titulo, lugar, notas_cliente, notas_internas, google_sync,
    clave_idempotencia, creada_por
  ) values (
    p->>'propiedad_id', p->>'cliente_uid', p->>'asesor_uid', v_inicio, v_fin, v_margen,
    v_inicio, v_fin + make_interval(mins => v_margen),
    p->>'estado', p->>'cliente_nombre', p->>'cliente_telefono', p->>'cliente_email',
    p->>'consentimiento_version', p->>'propiedad_titulo', p->>'lugar',
    p->>'notas_cliente', p->>'notas_internas', coalesce(p->>'google_sync', 'no_aplica'),
    p->>'clave_idempotencia', p->>'creada_por'
  ) returning * into v;

  insert into public.citas_eventos (cita_id, tipo, estado_antes, estado_despues, actor_uid, actor_rol, via, datos)
  values (v.id, 'CREATED', null, v.estado, p->>'creada_por', p->>'actor_rol', coalesce(p->>'via', 'panel'),
          jsonb_build_object('inicio', v.inicio, 'fin', v.fin));

  return v;
end;
$$;

-- ── Cambiar de estado ───────────────────────────────────────────
-- Espejo de src/lib/citas/estados.ts (una prueba compara las dos tablas).
--
-- Errores (mensaje de la excepción; la API los traduce):
--   no_encontrada · version · transicion_invalida · no_permitido ·
--   fuera_de_tiempo · motivo_requerido · horario_ocupado
-- Y 23P01 si el horario nuevo choca con otra cita.

create or replace function public.cita_transicionar(
  p_id        uuid,
  p_version   integer,
  p_accion    text,
  p_actor_uid text,
  p_actor_rol text,
  p_via       text,
  p_datos     jsonb default '{}'::jsonb
)
returns public.citas
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.citas;
  v_destino text;
  v_tipo text;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_motivo text := nullif(trim(coalesce(p_datos->>'motivo', '')), '');
  v_ahora timestamptz := now();
  v_datos jsonb := '{}'::jsonb;
  v_antes text;
begin
  select * into c from public.citas where id = p_id for update;
  if not found then raise exception 'no_encontrada' using errcode = 'P0001'; end if;
  v_antes := c.estado;

  if c.version <> p_version then raise exception 'version' using errcode = 'P0001'; end if;

  -- El papel tiene que corresponder a la cita (el admin lo comprueba el servidor).
  if (p_actor_rol = 'cliente' and p_actor_uid is distinct from c.cliente_uid)
     or (p_actor_rol = 'asesor' and p_actor_uid is distinct from c.asesor_uid) then
    raise exception 'no_permitido' using errcode = 'P0001';
  end if;

  case p_accion

  when 'confirmar' then
    if c.estado = 'REQUESTED' and p_actor_rol in ('asesor', 'admin') then null;
    elsif c.estado = 'PENDING_CONFIRMATION' and p_actor_rol in ('cliente', 'admin') then null;
    elsif c.estado in ('REQUESTED', 'PENDING_CONFIRMATION') then raise exception 'no_permitido' using errcode = 'P0001';
    else raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;
    if c.inicio <= v_ahora then raise exception 'fuera_de_tiempo' using errcode = 'P0001'; end if;
    v_destino := 'CONFIRMED'; v_tipo := 'CONFIRMED';

  when 'proponer' then
    if c.estado not in ('REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULED') then
      raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;
    if p_actor_rol not in ('cliente', 'asesor', 'admin') then raise exception 'no_permitido' using errcode = 'P0001'; end if;
    v_inicio := (p_datos->>'inicio')::timestamptz;
    v_fin := (p_datos->>'fin')::timestamptz;
    if v_inicio is null or v_fin is null or v_fin <= v_inicio then
      raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;
    if c.inicio <= v_ahora or v_inicio <= v_ahora then raise exception 'fuera_de_tiempo' using errcode = 'P0001'; end if;
    -- El horario propuesto no se aparta todavía, pero tiene que estar libre al proponerlo.
    if exists (
      select 1 from public.citas o
      where o.id <> c.id
        and o.estado in ('REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED')
        and (
          (o.asesor_uid = c.asesor_uid
            and tstzrange(o.ocupa_desde, o.ocupa_hasta, '[)') && tstzrange(v_inicio, v_fin + make_interval(mins => c.margen_min), '[)'))
          or (o.cliente_uid = c.cliente_uid
            and tstzrange(o.inicio, o.fin, '[)') && tstzrange(v_inicio, v_fin, '[)'))
        )
    ) then
      raise exception 'horario_ocupado' using errcode = 'P0001';
    end if;
    update public.citas set
      estado_previo = c.estado, propuesta_inicio = v_inicio, propuesta_fin = v_fin, propuesta_por = p_actor_rol
      where id = c.id;
    v_destino := 'RESCHEDULE_REQUESTED'; v_tipo := 'RESCHEDULE_PROPOSED';
    v_datos := jsonb_build_object('de_inicio', c.inicio, 'de_fin', c.fin, 'a_inicio', v_inicio, 'a_fin', v_fin);

  when 'aceptar_cambio' then
    if c.estado <> 'RESCHEDULE_REQUESTED' then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
    -- Acepta la otra parte; el admin puede siempre.
    if not (p_actor_rol = 'admin'
            or (c.propuesta_por = 'cliente' and p_actor_rol = 'asesor')
            or (c.propuesta_por in ('asesor', 'admin') and p_actor_rol = 'cliente')) then
      raise exception 'no_permitido' using errcode = 'P0001';
    end if;
    if c.propuesta_inicio <= v_ahora then raise exception 'fuera_de_tiempo' using errcode = 'P0001'; end if;
    v_datos := jsonb_build_object('de_inicio', c.inicio, 'de_fin', c.fin, 'a_inicio', c.propuesta_inicio, 'a_fin', c.propuesta_fin);
    -- Aquí sí se aparta: si otra cita ocupó ese horario, la exclusión lo impide (23P01).
    update public.citas set
      inicio = c.propuesta_inicio, fin = c.propuesta_fin,
      ocupa_desde = c.propuesta_inicio, ocupa_hasta = c.propuesta_fin + make_interval(mins => c.margen_min),
      propuesta_inicio = null, propuesta_fin = null, propuesta_por = null, estado_previo = null
      where id = c.id;
    v_destino := 'RESCHEDULED'; v_tipo := 'RESCHEDULE_ACCEPTED';

  when 'rechazar_cambio', 'retirar_cambio' then
    if c.estado <> 'RESCHEDULE_REQUESTED' then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
    if p_accion = 'rechazar_cambio' and not (p_actor_rol = 'admin'
            or (c.propuesta_por = 'cliente' and p_actor_rol = 'asesor')
            or (c.propuesta_por in ('asesor', 'admin') and p_actor_rol = 'cliente')) then
      raise exception 'no_permitido' using errcode = 'P0001';
    end if;
    if p_accion = 'retirar_cambio' and not (p_actor_rol = 'admin' or c.propuesta_por = p_actor_rol) then
      raise exception 'no_permitido' using errcode = 'P0001';
    end if;
    v_datos := jsonb_build_object('propuesta_inicio', c.propuesta_inicio, 'propuesta_fin', c.propuesta_fin);
    v_destino := c.estado_previo;
    update public.citas set propuesta_inicio = null, propuesta_fin = null, propuesta_por = null, estado_previo = null
      where id = c.id;
    v_tipo := case p_accion when 'rechazar_cambio' then 'RESCHEDULE_REJECTED' else 'RESCHEDULE_WITHDRAWN' end;

  when 'cancelar' then
    if c.estado not in ('REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED') then
      raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;
    if p_actor_rol not in ('cliente', 'asesor', 'admin') then raise exception 'no_permitido' using errcode = 'P0001'; end if;
    if p_actor_rol in ('asesor', 'admin') and v_motivo is null then
      raise exception 'motivo_requerido' using errcode = 'P0001';
    end if;
    update public.citas set motivo_cancelacion = left(v_motivo, 500),
      propuesta_inicio = null, propuesta_fin = null, propuesta_por = null, estado_previo = null
      where id = c.id;
    v_destino := 'CANCELLED'; v_tipo := 'CANCELLED';
    v_datos := jsonb_build_object('motivo', v_motivo);

  when 'vencer' then
    if p_actor_rol <> 'sistema' then raise exception 'no_permitido' using errcode = 'P0001'; end if;
    if c.estado in ('REQUESTED', 'PENDING_CONFIRMATION') and c.inicio <= v_ahora then
      update public.citas set motivo_cancelacion = 'Vencida: nadie la confirmó antes de la hora.' where id = c.id;
      v_destino := 'CANCELLED'; v_tipo := 'EXPIRED';
    elsif c.estado = 'RESCHEDULE_REQUESTED' and (c.propuesta_inicio <= v_ahora or c.inicio <= v_ahora) then
      v_datos := jsonb_build_object('propuesta_inicio', c.propuesta_inicio, 'propuesta_fin', c.propuesta_fin);
      if c.estado_previo in ('REQUESTED', 'PENDING_CONFIRMATION') and c.inicio <= v_ahora then
        update public.citas set motivo_cancelacion = 'Vencida: nadie la confirmó antes de la hora.',
          propuesta_inicio = null, propuesta_fin = null, propuesta_por = null, estado_previo = null
          where id = c.id;
        v_destino := 'CANCELLED';
      else
        -- La propuesta caducó; la cita sigue en el horario que ya tenía.
        v_destino := c.estado_previo;
        update public.citas set propuesta_inicio = null, propuesta_fin = null, propuesta_por = null, estado_previo = null
          where id = c.id;
      end if;
      v_tipo := 'EXPIRED';
    else
      raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;

  when 'completar', 'no_asistio' then
    if c.estado not in ('CONFIRMED', 'RESCHEDULED') then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
    if p_actor_rol not in ('asesor', 'admin') then raise exception 'no_permitido' using errcode = 'P0001'; end if;
    if c.inicio > v_ahora then raise exception 'fuera_de_tiempo' using errcode = 'P0001'; end if;
    v_destino := case p_accion when 'completar' then 'COMPLETED' else 'NO_SHOW' end;
    v_tipo := v_destino;

  when 'corregir' then
    if c.estado not in ('COMPLETED', 'NO_SHOW') then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
    if p_actor_rol <> 'admin' then raise exception 'no_permitido' using errcode = 'P0001'; end if;
    v_destino := case c.estado when 'COMPLETED' then 'NO_SHOW' else 'COMPLETED' end;
    v_tipo := 'CORRECTED';

  else
    raise exception 'transicion_invalida' using errcode = 'P0001';
  end case;

  update public.citas set estado = v_destino, version = c.version + 1, actualizada_en = v_ahora
    where id = c.id
    returning * into c;

  insert into public.citas_eventos (cita_id, tipo, estado_antes, estado_despues, actor_uid, actor_rol, via, datos)
  values (c.id, v_tipo, v_antes, c.estado,
          p_actor_uid, p_actor_rol, p_via, v_datos);

  -- Los enlaces de correo de la versión anterior dejan de valer.
  update public.citas_tokens set revocado_en = v_ahora
    where cita_id = c.id and usado_en is null and revocado_en is null;

  return c;
end;
$$;

revoke all on function public.cita_crear(jsonb) from public, anon, authenticated;
revoke all on function public.cita_transicionar(uuid, integer, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.cita_crear(jsonb) to service_role;
grant execute on function public.cita_transicionar(uuid, integer, text, text, text, text, jsonb) to service_role;
