-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 70 — Citas v2 (decisiones D-1…D-12 del dueño, 5-nov-2026)
-- Reversa: 70-citas-v2.REVERTIR.sql
--
-- Qué cambia respecto de la 15:
--  1. Estados nuevos: REJECTED («Rechazada») y EXPIRED («Expirada»).
--  2. SOLO una cita confirmada ocupa horario (D-2): una solicitud pendiente NO lo aparta. Si dos
--     solicitudes piden lo mismo, gana la primera que el responsable confirme; la restricción de
--     exclusión de la base decide de forma atómica (23P01 → «horario_ocupado»).
--  3. El cliente cancela o pide otro horario hasta 2 horas antes (D-5) y la base lo hace cumplir.
--  4. Tipo de cita (solicitada por un cliente / visita propia) y propietario de la propiedad:
--     el propietario VE las citas de sus propiedades pero nunca las gestiona (D-1).
--  5. Responsable de citas por propiedad (`propiedades.responsable_citas_uid`).
--  6. Quien actúa «como admin» tiene que SER admin en `usuarios` (antes lo garantizaba solo el servidor).
--  7. Recordatorios 24 h y 1 h antes (D-4): cola idempotente `citas_recordatorios` con clave única,
--     que se reprograma sola en la misma transacción que cambia la cita.
--  8. La bandeja `notificaciones` admite avisos de citas.
--
-- Se aplica PRIMERO en staging. Producción solo con orden explícita del dueño.
-- Sin eliminaciones condicionales (la herramienta de migraciones las trata como destructivas):
-- las restricciones de nombre desconocido se buscan en el catálogo.
-- ═══════════════════════════════════════════════════════════════

-- ── 1 · Estados nuevos ─────────────────────────────────────────

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.citas'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%''REQUESTED''%'
  loop
    execute format('alter table public.citas drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.citas add constraint citas_estado_check check (estado in (
  'REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED',
  'CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED', 'NO_SHOW'));
alter table public.citas add constraint citas_estado_previo_check check (estado_previo in (
  'REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULED'));

-- ── 2 · Tipo, propietario y responsable ────────────────────────

alter table public.citas add column if not exists tipo text not null default 'solicitada';
alter table public.citas add constraint citas_tipo_check check (tipo in ('solicitada', 'propia'));
-- Dueño de la propiedad al crear la cita: puede VER la cita (sin acciones). Se copia, igual que el
-- nombre y el teléfono, para que un cambio de dueño posterior no reescriba la historia.
alter table public.citas add column if not exists propietario_uid text references public.usuarios(uid);
create index if not exists citas_propietario_inicio on public.citas (propietario_uid, inicio) where propietario_uid is not null;

-- Responsable de atender las citas de una propiedad. Nulo = lo decide el servicio (dueño que atiende
-- citas, o el responsable del equipo configurado en `configuracion`).
alter table public.propiedades add column if not exists responsable_citas_uid text references public.usuarios(uid);

-- ── 3 · Solo la cita confirmada ocupa horario ──────────────────

alter table public.citas drop constraint citas_asesor_sin_empalme;
alter table public.citas add constraint citas_asesor_sin_empalme exclude using gist (
  asesor_uid with =,
  tstzrange(ocupa_desde, ocupa_hasta, '[)') with &&
) where (
  estado in ('CONFIRMED', 'RESCHEDULED', 'PENDING_CONFIRMATION')
  or (estado = 'RESCHEDULE_REQUESTED' and estado_previo in ('CONFIRMED', 'RESCHEDULED', 'PENDING_CONFIRMATION'))
);
-- (la restricción por cliente de la 15 se queda: una persona no puede tener dos visitas activas a la vez)

-- ── 4 · Avisos de citas en la bandeja ──────────────────────────

do $$
declare r record;
begin
  if to_regclass('public.notificaciones') is null then return; end if;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.notificaciones'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%busqueda_nueva%'
  loop
    execute format('alter table public.notificaciones drop constraint %I', r.conname);
  end loop;
  alter table public.notificaciones add constraint notificaciones_tipo_check
    check (tipo in ('busqueda_nueva', 'baja_de_precio', 'legal', 'sistema', 'cita'));
end $$;

-- ── 5 · Recordatorios ──────────────────────────────────────────

create table if not exists public.citas_recordatorios (
  id             bigint generated always as identity primary key,
  cita_id        uuid not null references public.citas(id),
  tipo           text not null check (tipo in ('24h', '1h')),
  para_rol       text not null check (para_rol in ('cliente', 'asesor')),
  version_cita   integer not null,
  inicio_cita    timestamptz not null,
  enviar_en      timestamptz not null,
  -- 'omitido': la cita cambió o ya empezó; nunca se manda. 'enviando': reclamado por el procesador.
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'enviado', 'error', 'omitido')),
  intentos       smallint not null default 0,
  ultimo_error   text check (ultimo_error is null or char_length(ultimo_error) <= 300),
  reclamado_en   timestamptz,
  enviado_en     timestamptz,
  creado_en      timestamptz not null default now(),
  -- Idempotencia: UN solo recordatorio lógico por cita, versión, tipo y destinatario.
  clave          text not null unique check (char_length(clave) <= 200)
);
create index if not exists citas_recordatorios_cola on public.citas_recordatorios (enviar_en) where estado in ('pendiente', 'error', 'enviando');
create index if not exists citas_recordatorios_cita on public.citas_recordatorios (cita_id);

alter table public.citas_recordatorios enable row level security;
revoke all on table public.citas_recordatorios from anon, authenticated;

-- Reprograma los recordatorios de una cita DENTRO de la misma transacción que la cambia: lo pendiente de
-- versiones anteriores se omite y, si la cita sigue firme, se crean los nuevos (24 h y 1 h antes, a cada parte).
create or replace function public.cita_programar_recordatorios(c public.citas)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_firme boolean := c.estado in ('CONFIRMED', 'RESCHEDULED')
    or (c.estado = 'RESCHEDULE_REQUESTED' and c.estado_previo in ('CONFIRMED', 'RESCHEDULED'));
begin
  update public.citas_recordatorios
    set estado = 'omitido'
    where cita_id = c.id and estado in ('pendiente', 'error') and (version_cita <> c.version or not v_firme);
  if not v_firme then return; end if;
  insert into public.citas_recordatorios (cita_id, tipo, para_rol, version_cita, inicio_cita, enviar_en, clave)
  select c.id, t.tipo, p.rol, c.version, c.inicio, c.inicio - t.antes,
         format('cita/%s/recordatorio_%s/v%s/%s', c.id, t.tipo, c.version, p.rol)
  from (values ('24h', interval '24 hours'), ('1h', interval '1 hour')) as t(tipo, antes)
  cross join (values ('cliente'), ('asesor')) as p(rol)
  where c.inicio - t.antes > now()
  on conflict (clave) do nothing;
end;
$$;

-- El procesador reclama lo que toca enviar. `for update skip locked` evita que dos ejecuciones simultáneas
-- (el cron cada minuto + un reintento manual) tomen el mismo recordatorio. Lo que ya empezó se omite.
create or replace function public.citas_recordatorios_reclamar(p_limite integer default 25)
returns setof public.citas_recordatorios
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.citas_recordatorios
    set estado = 'omitido'
    where estado in ('pendiente', 'error', 'enviando') and inicio_cita <= now();
  return query
  update public.citas_recordatorios r
    set estado = 'enviando', intentos = r.intentos + 1, reclamado_en = now()
    where r.id in (
      select q.id from public.citas_recordatorios q
      where q.enviar_en <= now() and q.intentos < 5
        and (q.estado in ('pendiente', 'error') or (q.estado = 'enviando' and q.reclamado_en < now() - interval '5 minutes'))
      order by q.enviar_en
      limit greatest(1, least(coalesce(p_limite, 25), 100))
      for update skip locked
    )
    returning r.*;
end;
$$;

create or replace function public.citas_recordatorio_marcar(p_id bigint, p_ok boolean, p_error text default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.citas_recordatorios
    set estado = case when p_ok then 'enviado' else 'error' end,
        enviado_en = case when p_ok then now() else enviado_en end,
        ultimo_error = case when p_ok then null else left(coalesce(p_error, 'error'), 300) end
    where id = p_id and estado = 'enviando';
$$;

-- ── 6 · Crear una cita ─────────────────────────────────────────

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
    clave_idempotencia, creada_por, tipo, propietario_uid
  ) values (
    p->>'propiedad_id', p->>'cliente_uid', p->>'asesor_uid', v_inicio, v_fin, v_margen,
    v_inicio, v_fin + make_interval(mins => v_margen),
    p->>'estado', p->>'cliente_nombre', p->>'cliente_telefono', p->>'cliente_email',
    p->>'consentimiento_version', p->>'propiedad_titulo', p->>'lugar',
    p->>'notas_cliente', p->>'notas_internas', coalesce(p->>'google_sync', 'no_aplica'),
    p->>'clave_idempotencia', p->>'creada_por', coalesce(p->>'tipo', 'solicitada'), p->>'propietario_uid'
  ) returning * into v;

  insert into public.citas_eventos (cita_id, tipo, estado_antes, estado_despues, actor_uid, actor_rol, via, datos)
  values (v.id, 'CREATED', null, v.estado, p->>'creada_por', p->>'actor_rol', coalesce(p->>'via', 'panel'),
          jsonb_build_object('inicio', v.inicio, 'fin', v.fin, 'tipo', v.tipo));

  perform public.cita_programar_recordatorios(v);
  return v;
end;
$$;

-- ── 7 · Cambiar de estado ──────────────────────────────────────
-- Espejo de src/lib/citas/estados.ts (una prueba compara las dos tablas).
-- Errores: no_encontrada · version · transicion_invalida · no_permitido · fuera_de_tiempo ·
--          motivo_requerido · horario_ocupado · menos_de_2_horas. Y 23P01 si el horario choca.

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
  v_firme boolean;
begin
  select * into c from public.citas where id = p_id for update;
  if not found then raise exception 'no_encontrada' using errcode = 'P0001'; end if;
  v_antes := c.estado;

  if c.version <> p_version then raise exception 'version' using errcode = 'P0001'; end if;

  -- Quien actúa tiene que SER quien dice ser (antes el rol «admin» lo garantizaba solo el servidor).
  if (p_actor_rol = 'cliente' and p_actor_uid is distinct from c.cliente_uid)
     or (p_actor_rol = 'asesor' and p_actor_uid is distinct from c.asesor_uid) then
    raise exception 'no_permitido' using errcode = 'P0001';
  end if;
  if p_actor_rol = 'admin' and not exists (
       select 1 from public.usuarios u where u.uid = p_actor_uid and u.rol in ('admin', 'super_admin')) then
    raise exception 'no_permitido' using errcode = 'P0001';
  end if;

  -- «Firme»: la cita está acordada (confirmada, o a la espera de que el cliente confirme lo que registró el equipo).
  v_firme := c.estado in ('CONFIRMED', 'RESCHEDULED', 'PENDING_CONFIRMATION')
    or (c.estado = 'RESCHEDULE_REQUESTED' and c.estado_previo in ('CONFIRMED', 'RESCHEDULED', 'PENDING_CONFIRMATION'));

  -- D-5: el cliente cancela o pide otro horario hasta 2 horas antes de una cita firme.
  if p_actor_rol = 'cliente' and p_accion in ('cancelar', 'proponer') and v_firme
     and c.inicio < v_ahora + interval '2 hours' then
    raise exception 'menos_de_2_horas' using errcode = 'P0001';
  end if;

  case p_accion

  when 'confirmar' then
    if c.estado = 'REQUESTED' and p_actor_rol in ('asesor', 'admin') then null;
    elsif c.estado = 'PENDING_CONFIRMATION' and p_actor_rol in ('cliente', 'admin') then null;
    elsif c.estado in ('REQUESTED', 'PENDING_CONFIRMATION') then raise exception 'no_permitido' using errcode = 'P0001';
    else raise exception 'transicion_invalida' using errcode = 'P0001';
    end if;
    if c.inicio <= v_ahora then raise exception 'fuera_de_tiempo' using errcode = 'P0001'; end if;
    -- Al pasar a CONFIRMED la restricción de exclusión decide, de forma atómica, si el horario sigue libre (23P01).
    v_destino := 'CONFIRMED'; v_tipo := 'CONFIRMED';

  when 'rechazar' then
    if c.estado <> 'REQUESTED' then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
    if p_actor_rol not in ('asesor', 'admin') then raise exception 'no_permitido' using errcode = 'P0001'; end if;
    if v_motivo is null then raise exception 'motivo_requerido' using errcode = 'P0001'; end if;
    update public.citas set motivo_cancelacion = left(v_motivo, 500) where id = c.id;
    v_destino := 'REJECTED'; v_tipo := 'REJECTED';
    v_datos := jsonb_build_object('motivo', v_motivo);

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
    -- El horario propuesto no se aparta todavía, pero no puede chocar con una cita CONFIRMADA del asesor ni con otra visita del cliente.
    if exists (
      select 1 from public.citas o
      where o.id <> c.id
        and (
          (o.asesor_uid = c.asesor_uid
            and (o.estado in ('CONFIRMED', 'RESCHEDULED', 'PENDING_CONFIRMATION')
                 or (o.estado = 'RESCHEDULE_REQUESTED' and o.estado_previo in ('CONFIRMED', 'RESCHEDULED', 'PENDING_CONFIRMATION')))
            and tstzrange(o.ocupa_desde, o.ocupa_hasta, '[)') && tstzrange(v_inicio, v_fin + make_interval(mins => c.margen_min), '[)'))
          or (o.cliente_uid = c.cliente_uid
            and o.estado in ('REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED')
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
    if not (p_actor_rol = 'admin'
            or (c.propuesta_por = 'cliente' and p_actor_rol = 'asesor')
            or (c.propuesta_por in ('asesor', 'admin') and p_actor_rol = 'cliente')) then
      raise exception 'no_permitido' using errcode = 'P0001';
    end if;
    if c.propuesta_inicio <= v_ahora then raise exception 'fuera_de_tiempo' using errcode = 'P0001'; end if;
    v_datos := jsonb_build_object('de_inicio', c.inicio, 'de_fin', c.fin, 'a_inicio', c.propuesta_inicio, 'a_fin', c.propuesta_fin);
    -- Aquí sí se aparta: la cita original se conserva hasta este momento; si otra ocupó el horario nuevo, la exclusión lo impide (23P01).
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
      update public.citas set motivo_cancelacion = 'Expirada: nadie la confirmó antes de la hora.' where id = c.id;
      v_destino := 'EXPIRED'; v_tipo := 'EXPIRED';
    elsif c.estado = 'RESCHEDULE_REQUESTED' and (c.propuesta_inicio <= v_ahora or c.inicio <= v_ahora) then
      v_datos := jsonb_build_object('propuesta_inicio', c.propuesta_inicio, 'propuesta_fin', c.propuesta_fin);
      if c.estado_previo in ('REQUESTED', 'PENDING_CONFIRMATION') and c.inicio <= v_ahora then
        update public.citas set motivo_cancelacion = 'Expirada: nadie la confirmó antes de la hora.',
          propuesta_inicio = null, propuesta_fin = null, propuesta_por = null, estado_previo = null
          where id = c.id;
        v_destino := 'EXPIRED';
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

  -- Los recordatorios siguen a la cita en la misma transacción: si cambió o dejó de estar firme, se omiten y se rehacen.
  perform public.cita_programar_recordatorios(c);

  return c;
end;
$$;

-- ── 8 · Quién ejecuta qué ──────────────────────────────────────

revoke all on function public.cita_crear(jsonb) from public, anon, authenticated;
revoke all on function public.cita_transicionar(uuid, integer, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.cita_programar_recordatorios(public.citas) from public, anon, authenticated;
revoke all on function public.citas_recordatorios_reclamar(integer) from public, anon, authenticated;
revoke all on function public.citas_recordatorio_marcar(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.cita_crear(jsonb) to service_role;
grant execute on function public.cita_transicionar(uuid, integer, text, text, text, text, jsonb) to service_role;
grant execute on function public.cita_programar_recordatorios(public.citas) to service_role;
grant execute on function public.citas_recordatorios_reclamar(integer) to service_role;
grant execute on function public.citas_recordatorio_marcar(bigint, boolean, text) to service_role;
grant select, insert, update on public.citas_recordatorios to service_role;
