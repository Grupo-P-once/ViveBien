-- ═══════════════════════════════════════════════════════════
-- Vive Bien · 62 — Correo: suscripciones, envíos, supresión y CUPO DURO (D-80 reconciliada, F0)
-- Idempotente. Reversa: 62-correo-suscripciones.REVERTIR.sql
-- (era la «36» de D-80; renumerada a 62 porque producción ya aplicó hasta la 61 y la 36/37 de D-80 chocaban con otras.)
--
-- ───────────────────────────────────────────────────────────
-- ESTADO: PREPARADA, NO APLICADA (sólo probada en PGlite). ORDEN OBLIGATORIO: esta migración va ANTES del código que la usa.
-- Con el código de F0, todo correo (citas, invitaciones, avisos de leads y avisos a clientes) reserva cupo aquí antes de salir y NO sale
-- si no puede confirmarlo; sin esta migración aplicada, esos correos se detendrían.
--
-- Qué crea (todo NUEVO; no toca ninguna tabla existente):
--   · correo_suscriptores   quién aceptó recibir recomendaciones comerciales, con prueba del consentimiento
--   · correo_envios         cada correo, con clave de idempotencia ÚNICA (evita duplicados) y su estado
--   · correo_supresiones    direcciones que NUNCA deben recibir correo (rebote permanente, queja)
--   · correo_webhook_vistos eventos del proveedor ya procesados (idempotencia de webhooks)
--   · 9 funciones atómicas `correo_*` (sólo service_role)
--
-- Seguridad: RLS activado SIN políticas (nadie con la clave pública lee ni escribe); sólo la ruta del servidor,
-- con service_role, después de validar. El enlace de baja NO se guarda: es un HMAC firmado con CORREO_SECRETO.
--
-- Cupo (Resend Free: 100/día, 3000/mes; aquí 90/día y 2,700/mes, FIJOS dentro de la función, ver el punto 5): el día es el día UTC
-- y el mes el ciclo de facturación (desde el día 23). Lo opcional deja siempre una reserva para lo transaccional.
-- ═══════════════════════════════════════════════════════════

begin;

create table if not exists public.correo_suscriptores (
  id                     uuid primary key default gen_random_uuid(),
  email                  text not null,
  email_norm             text not null,
  nombre                 text,
  uid                    text,
  estado                 text not null default 'pendiente'
                         check (estado in ('pendiente', 'activa', 'baja', 'rebotada', 'queja')),
  preferencias           jsonb not null default '{}'::jsonb,
  fuente                 text not null default 'web',
  consentimiento_version text,
  consentimiento_en      timestamptz,
  confirmado_en          timestamptz,
  baja_en                timestamptz,
  baja_motivo            text,
  proximo_envio_en       timestamptz,
  ultimo_envio_en        timestamptz,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  constraint correo_suscriptores_email_norm_unico unique (email_norm),
  constraint correo_suscriptores_email_norm_forma check (email_norm = lower(btrim(email_norm)) and length(email_norm) between 5 and 254),
  constraint correo_suscriptores_activa_con_prueba check (estado <> 'activa' or (consentimiento_en is not null and confirmado_en is not null))
);
create index if not exists correo_suscriptores_proximo_idx on public.correo_suscriptores (proximo_envio_en) where estado = 'activa';
create index if not exists correo_suscriptores_uid_idx on public.correo_suscriptores (uid) where uid is not null;

create table if not exists public.correo_envios (
  id               bigint generated always as identity primary key,
  clave            text not null,
  categoria        text not null check (categoria in ('transaccional', 'servicio', 'marketing')),
  tipo             text not null,
  email_norm       text not null,
  suscriptor_id    uuid references public.correo_suscriptores (id) on delete set null,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente', 'enviado', 'error', 'suprimido', 'omitido', 'entregado', 'rebotado', 'queja')),
  resend_id        text,
  error            text,
  propiedades      text[],
  -- Rebanada del cupo a la que cuenta este envío (ver correo_reservar_envio). Las pruebas, Preview y staging cuentan en 'pruebas'.
  entorno          text not null default 'pruebas' check (entorno in ('produccion', 'pruebas')),
  creado_en        timestamptz not null default now(),
  enviado_en       timestamptz,
  constraint correo_envios_clave_unica unique (clave),
  constraint correo_envios_clave_forma check (length(clave) between 3 and 200)
);
create index if not exists correo_envios_dia_idx on public.correo_envios (creado_en desc);
create index if not exists correo_envios_entorno_idx on public.correo_envios (entorno, creado_en desc);
create index if not exists correo_envios_resend_idx on public.correo_envios (resend_id) where resend_id is not null;
create index if not exists correo_envios_suscriptor_idx on public.correo_envios (suscriptor_id, creado_en desc);

create table if not exists public.correo_supresiones (
  email_norm text primary key,
  motivo     text not null check (motivo in ('rebote', 'queja', 'manual')),
  creado_en  timestamptz not null default now()
);

create table if not exists public.correo_webhook_vistos (
  svix_id   text primary key,
  creado_en timestamptz not null default now()
);

alter table public.correo_suscriptores   enable row level security;
alter table public.correo_envios         enable row level security;
alter table public.correo_supresiones    enable row level security;
alter table public.correo_webhook_vistos enable row level security;

-- ── 1 · Suscribir a un visitante (siempre «pendiente» hasta que confirme por correo) ─────────────
-- Nunca devuelve si el correo ya existía a quien llama la ruta pública (anti-enumeración): la ruta responde igual.
create or replace function public.correo_suscribir(
  p_email text, p_nombre text, p_prefs jsonb, p_fuente text, p_version text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_norm text := lower(btrim(p_email));
  v_fila public.correo_suscriptores%rowtype;
begin
  if v_norm is null or length(v_norm) < 5 or length(v_norm) > 254 or v_norm !~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[^[:space:]@,;]{2,}$' then
    return jsonb_build_object('accion', 'invalida');
  end if;
  if p_version is null or length(btrim(p_version)) = 0 then
    return jsonb_build_object('accion', 'sin_consentimiento');
  end if;
  if exists (select 1 from public.correo_supresiones where email_norm = v_norm) then
    return jsonb_build_object('accion', 'bloqueada');
  end if;

  select * into v_fila from public.correo_suscriptores where email_norm = v_norm for update;
  if not found then
    insert into public.correo_suscriptores (email, email_norm, nombre, estado, preferencias, fuente, consentimiento_version, consentimiento_en)
    values (btrim(p_email), v_norm, nullif(left(btrim(coalesce(p_nombre, '')), 120), ''), 'pendiente', coalesce(p_prefs, '{}'::jsonb), left(coalesce(p_fuente, 'web'), 60), left(p_version, 60), now())
    returning * into v_fila;
    return jsonb_build_object('accion', 'confirmar', 'id', v_fila.id);
  end if;

  if v_fila.estado = 'activa' then
    -- Ya confirmó antes: no se cambian sus preferencias desde un formulario anónimo.
    return jsonb_build_object('accion', 'ya_activa', 'id', v_fila.id);
  end if;
  if v_fila.estado in ('rebotada', 'queja') then
    return jsonb_build_object('accion', 'bloqueada');
  end if;

  -- «pendiente» o «baja»: una acción expresa nueva (el formulario con la casilla) abre otra solicitud, pero NO activa nada
  -- hasta que se confirme por correo. La baja anterior se conserva como historia y sigue bloqueando el marketing hasta entonces.
  update public.correo_suscriptores
     set preferencias = coalesce(p_prefs, preferencias), fuente = left(coalesce(p_fuente, fuente), 60),
         consentimiento_version = left(p_version, 60), consentimiento_en = now(),
         estado = case when estado = 'baja' then 'baja' else 'pendiente' end,
         actualizado_en = now()
   where id = v_fila.id;
  return jsonb_build_object('accion', 'confirmar', 'id', v_fila.id);
end $$;

-- ── 2 · Confirmar (después de validar el enlace firmado en el servidor) ──────────────────────────
create or replace function public.correo_confirmar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fila public.correo_suscriptores%rowtype;
begin
  select * into v_fila from public.correo_suscriptores where id = p_id for update;
  if not found then return jsonb_build_object('estado', 'desconocida'); end if;
  if exists (select 1 from public.correo_supresiones where email_norm = v_fila.email_norm) or v_fila.estado in ('rebotada', 'queja') then
    return jsonb_build_object('estado', 'bloqueada');
  end if;
  if v_fila.estado = 'activa' then return jsonb_build_object('estado', 'activa', 'cambio', false); end if;
  if v_fila.consentimiento_en is null then return jsonb_build_object('estado', 'sin_consentimiento'); end if;
  -- El primer lote ya se mandó al pedirlo (correo de «tus primeras propiedades»): lo siguiente toca hasta 3 días después de él,
  -- no «ya mismo». Si todavía no se mandó nada, el primer envío sale en la siguiente ejecución.
  update public.correo_suscriptores
     set estado = 'activa', confirmado_en = now(), baja_en = null, baja_motivo = null,
         proximo_envio_en = greatest(now(), coalesce((select max(e.creado_en) + interval '3 days' from public.correo_envios e
                                                        where e.suscriptor_id = p_id and e.estado in ('enviado', 'entregado')), now())),
         actualizado_en = now()
   where id = p_id;
  return jsonb_build_object('estado', 'activa', 'cambio', true);
end $$;

-- ── 3 · Baja (idempotente; no revela si el id existía más de lo necesario) ───────────────────────
create or replace function public.correo_baja(p_id uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.correo_suscriptores
     set estado = case when estado in ('rebotada', 'queja') then estado else 'baja' end,
         baja_en = coalesce(baja_en, now()), baja_motivo = coalesce(baja_motivo, left(p_motivo, 60)),
         proximo_envio_en = null, actualizado_en = now()
   where id = p_id and estado <> 'baja';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'cambio', v_n > 0);
end $$;

-- ── 4 · Cuenta con sesión (correo VERIFICADO por el proveedor de identidad): acepta o retira el marketing ──
create or replace function public.correo_cuenta_marketing(
  p_uid text, p_email text, p_aceptar boolean, p_prefs jsonb, p_version text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_norm text := lower(btrim(p_email));
  v_fila public.correo_suscriptores%rowtype;
begin
  if v_norm is null or length(v_norm) < 5 then return jsonb_build_object('estado', 'invalida'); end if;
  select * into v_fila from public.correo_suscriptores where email_norm = v_norm for update;

  if not p_aceptar then
    if found then
      update public.correo_suscriptores
         set uid = coalesce(uid, p_uid), estado = case when estado in ('rebotada', 'queja') then estado else 'baja' end,
             baja_en = coalesce(baja_en, now()), baja_motivo = coalesce(baja_motivo, 'cuenta'), proximo_envio_en = null, actualizado_en = now()
       where id = v_fila.id;
    end if;
    return jsonb_build_object('estado', 'baja');
  end if;

  if p_version is null or length(btrim(p_version)) = 0 then return jsonb_build_object('estado', 'sin_consentimiento'); end if;
  if exists (select 1 from public.correo_supresiones where email_norm = v_norm) then return jsonb_build_object('estado', 'bloqueada'); end if;
  if found and v_fila.estado in ('rebotada', 'queja') then return jsonb_build_object('estado', 'bloqueada'); end if;

  if not found then
    insert into public.correo_suscriptores (email, email_norm, uid, estado, preferencias, fuente, consentimiento_version, consentimiento_en, confirmado_en, proximo_envio_en)
    values (btrim(p_email), v_norm, p_uid, 'activa', coalesce(p_prefs, '{}'::jsonb), 'cuenta', left(p_version, 60), now(), now(), now())
    returning * into v_fila;
  else
    update public.correo_suscriptores
       set uid = coalesce(uid, p_uid), estado = 'activa', preferencias = coalesce(p_prefs, preferencias), fuente = 'cuenta',
           consentimiento_version = left(p_version, 60), consentimiento_en = now(), confirmado_en = now(),
           baja_en = null, baja_motivo = null, proximo_envio_en = coalesce(proximo_envio_en, now()), actualizado_en = now()
     where id = v_fila.id
    returning * into v_fila;
  end if;
  return jsonb_build_object('estado', 'activa', 'id', v_fila.id);
end $$;

-- ── 5 · Reservar un envío: idempotencia + supresión + CUPO DURO, TODO en una transacción ─────────
-- Devuelve: enviar | duplicado | suprimido | sin_presupuesto. Quien llama sólo manda el correo si la acción es «enviar».
--
-- CUPO DURO (plan gratuito de Resend: 100/día y 3,000/mes; aquí 90 y 2,700). Las cifras están FIJAS en esta función: no hay
-- parámetro que las cambie, así un error de código o de configuración no puede abrir el grifo. Se reparten en dos rebanadas
-- (una sola cuenta de Resend sirve a producción y a todo lo demás, pero cada base ve sólo lo suyo):
--     produccion  80/día  2,400/mes   (reserva transaccional dentro de la rebanada: 30/día, 300/mes)
--     pruebas     10/día    300/mes   (Preview, staging y local)            →  80 + 10 = 90   y   2,400 + 300 = 2,700
-- Lo opcional (categoria 'servicio' o 'marketing') nunca toca la reserva; lo transaccional puede usar todo el tope.
-- El día es el día UTC (Resend reinicia a las 23:59:59 UTC); el mes es el ciclo de facturación, que empieza el día 23 (UTC).
-- Cuentan TODAS las filas salvo las que nunca llegaron a intentarse (suprimido, omitido): un error ambiguo de red cuenta, porque
-- el proveedor pudo haber enviado el correo; rebotados y quejas también cuentan (se enviaron). Las pruebas cuentan igual.
create or replace function public.correo_reservar_envio(
  p_clave text, p_categoria text, p_tipo text, p_email text, p_suscriptor uuid, p_props text[], p_entorno text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_norm text := lower(btrim(p_email));
  v_previo public.correo_envios%rowtype;
  v_hoy int; v_mes int; v_tope_dia int; v_tope_mes int; v_reserva_dia int; v_reserva_mes int;
  v_id bigint;
  v_ahora_utc timestamp := now() at time zone 'utc';
  v_inicio_dia timestamptz := (date_trunc('day', now() at time zone 'utc')) at time zone 'utc';
  v_inicio_ciclo timestamptz;
begin
  if p_entorno is null or p_entorno not in ('produccion', 'pruebas') then raise exception 'entorno invalido'; end if;
  if p_categoria is null or p_categoria not in ('transaccional', 'servicio', 'marketing') then raise exception 'categoria invalida'; end if;

  -- Una sola reserva a la vez en toda la cuenta: el conteo y el insert no se pueden cruzar.
  perform pg_advisory_xact_lock(hashtext('correo_presupuesto'));

  select * into v_previo from public.correo_envios where clave = p_clave;
  if found then
    -- Un fallo de red o del proveedor se puede reintentar (con la MISMA clave en el proveedor, que el proveedor repite sin duplicar).
    -- El reintento reutiliza la misma fila (no es una fila nueva), pero se fecha de nuevo: cuenta en el día en que de verdad se envía.
    if v_previo.estado in ('error', 'pendiente') and v_previo.creado_en < now() - interval '10 minutes' then
      update public.correo_envios set estado = 'pendiente', error = null, creado_en = now() where id = v_previo.id; -- el reintento cuenta HOY y reinicia la espera de 10 min (no se puede reenviar dos veces seguidas)
      return jsonb_build_object('accion', 'enviar', 'id', v_previo.id, 'reintento', true);
    end if;
    return jsonb_build_object('accion', 'duplicado', 'estado', v_previo.estado, 'id', v_previo.id);
  end if;

  if exists (
    select 1 from public.correo_supresiones s
     where s.email_norm = v_norm and (s.motivo = 'rebote' or (p_categoria in ('marketing', 'servicio') and s.motivo in ('queja', 'manual')))
  ) or (p_categoria = 'marketing' and exists (select 1 from public.correo_supresiones s where s.email_norm = v_norm)) then
    insert into public.correo_envios (clave, categoria, tipo, email_norm, suscriptor_id, estado, error, propiedades, entorno)
    values (p_clave, p_categoria, p_tipo, v_norm, p_suscriptor, 'suprimido', 'direccion suprimida', p_props, p_entorno) returning id into v_id;
    return jsonb_build_object('accion', 'suprimido', 'id', v_id);
  end if;

  if p_categoria = 'marketing' then
    if not exists (select 1 from public.correo_suscriptores where id = p_suscriptor and estado = 'activa') then
      insert into public.correo_envios (clave, categoria, tipo, email_norm, suscriptor_id, estado, error, propiedades, entorno)
      values (p_clave, p_categoria, p_tipo, v_norm, p_suscriptor, 'suprimido', 'sin suscripcion activa', p_props, p_entorno) returning id into v_id;
      return jsonb_build_object('accion', 'suprimido', 'id', v_id);
    end if;
  end if;

  -- Cifras FIJAS (ver el encabezado de esta función). No se leen de ninguna tabla ni parámetro.
  if p_entorno = 'produccion' then
    v_tope_dia := 80; v_tope_mes := 2400; v_reserva_dia := 30; v_reserva_mes := 300;
  else
    v_tope_dia := 10; v_tope_mes := 300; v_reserva_dia := 0; v_reserva_mes := 0;
  end if;
  if p_categoria <> 'transaccional' then
    v_tope_dia := greatest(v_tope_dia - v_reserva_dia, 0);
    v_tope_mes := greatest(v_tope_mes - v_reserva_mes, 0);
  end if;

  -- Inicio del ciclo mensual: el día 23 (UTC) más reciente a las 00:00.
  v_inicio_ciclo := (case
      when extract(day from v_ahora_utc) >= 23 then date_trunc('month', v_ahora_utc) + interval '22 days'
      else date_trunc('month', v_ahora_utc) - interval '1 month' + interval '22 days'
    end) at time zone 'utc';

  select count(*) into v_hoy from public.correo_envios
   where entorno = p_entorno and estado not in ('suprimido', 'omitido') and creado_en >= v_inicio_dia;
  select count(*) into v_mes from public.correo_envios
   where entorno = p_entorno and estado not in ('suprimido', 'omitido') and creado_en >= v_inicio_ciclo;
  if v_hoy >= v_tope_dia or v_mes >= v_tope_mes then
    return jsonb_build_object('accion', 'sin_presupuesto', 'hoy', v_hoy, 'mes', v_mes);
  end if;

  insert into public.correo_envios (clave, categoria, tipo, email_norm, suscriptor_id, estado, propiedades, entorno)
  values (p_clave, p_categoria, p_tipo, v_norm, p_suscriptor, 'pendiente', p_props, p_entorno) returning id into v_id;
  return jsonb_build_object('accion', 'enviar', 'id', v_id, 'hoy', v_hoy + 1, 'mes', v_mes + 1);
end $$;

-- ── 5b · Cuánto cupo queda (sólo lectura; para el panel y para las pruebas) ──────────────────────
create or replace function public.correo_cupo_estado(p_entorno text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ahora_utc timestamp := now() at time zone 'utc';
  v_inicio_dia timestamptz := (date_trunc('day', now() at time zone 'utc')) at time zone 'utc';
  v_inicio_ciclo timestamptz;
  v_hoy int; v_mes int; v_dia int; v_mesmax int;
begin
  if p_entorno is null or p_entorno not in ('produccion', 'pruebas') then raise exception 'entorno invalido'; end if;
  v_inicio_ciclo := (case
      when extract(day from v_ahora_utc) >= 23 then date_trunc('month', v_ahora_utc) + interval '22 days'
      else date_trunc('month', v_ahora_utc) - interval '1 month' + interval '22 days'
    end) at time zone 'utc';
  v_dia := case when p_entorno = 'produccion' then 80 else 10 end;
  v_mesmax := case when p_entorno = 'produccion' then 2400 else 300 end;
  select count(*) into v_hoy from public.correo_envios where entorno = p_entorno and estado not in ('suprimido', 'omitido') and creado_en >= v_inicio_dia;
  select count(*) into v_mes from public.correo_envios where entorno = p_entorno and estado not in ('suprimido', 'omitido') and creado_en >= v_inicio_ciclo;
  return jsonb_build_object('entorno', p_entorno, 'hoy', v_hoy, 'tope_dia', v_dia, 'mes', v_mes, 'tope_mes', v_mesmax, 'inicio_ciclo', v_inicio_ciclo);
end $$;

-- ── 6 · Resultado de un envío ───────────────────────────────────────────────────────────────────
create or replace function public.correo_marcar_envio(p_id bigint, p_estado text, p_resend_id text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_estado not in ('enviado', 'error', 'omitido') then raise exception 'estado invalido'; end if;
  update public.correo_envios
     set estado = p_estado, resend_id = coalesce(p_resend_id, resend_id), error = left(p_error, 200),
         enviado_en = case when p_estado = 'enviado' then now() else enviado_en end
   where id = p_id and estado in ('pendiente', 'error');
end $$;

-- ── 7 · Evento del proveedor (ya verificado su firma en el servidor); idempotente por svix-id ─────
create or replace function public.correo_evento(
  p_svix_id text, p_tipo text, p_email text, p_resend_id text, p_rebote_permanente boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_norm text := lower(btrim(coalesce(p_email, '')));
  v_nuevo int;
begin
  if p_svix_id is null or length(p_svix_id) < 3 then return jsonb_build_object('resultado', 'invalido'); end if;
  insert into public.correo_webhook_vistos (svix_id) values (p_svix_id) on conflict do nothing;
  get diagnostics v_nuevo = row_count;
  if v_nuevo = 0 then return jsonb_build_object('resultado', 'duplicado'); end if;

  if p_tipo = 'email.bounced' and p_rebote_permanente then
    if v_norm <> '' then
      insert into public.correo_supresiones (email_norm, motivo) values (v_norm, 'rebote') on conflict (email_norm) do nothing;
      update public.correo_suscriptores set estado = 'rebotada', proximo_envio_en = null, actualizado_en = now() where email_norm = v_norm and estado <> 'baja';
    end if;
    update public.correo_envios set estado = 'rebotado' where resend_id = p_resend_id and p_resend_id is not null;
  elsif p_tipo = 'email.bounced' then
    update public.correo_envios set error = 'rebote temporal' where resend_id = p_resend_id and p_resend_id is not null;
  elsif p_tipo = 'email.complained' then
    if v_norm <> '' then
      insert into public.correo_supresiones (email_norm, motivo) values (v_norm, 'queja') on conflict (email_norm) do update set motivo = 'queja';
      update public.correo_suscriptores set estado = 'queja', proximo_envio_en = null, baja_en = coalesce(baja_en, now()), actualizado_en = now() where email_norm = v_norm;
    end if;
    update public.correo_envios set estado = 'queja' where resend_id = p_resend_id and p_resend_id is not null;
  elsif p_tipo = 'email.suppressed' then
    if v_norm <> '' then
      insert into public.correo_supresiones (email_norm, motivo) values (v_norm, 'rebote') on conflict (email_norm) do nothing;
      update public.correo_suscriptores set estado = 'rebotada', proximo_envio_en = null, actualizado_en = now() where email_norm = v_norm and estado <> 'baja';
    end if;
  elsif p_tipo = 'email.delivered' then
    update public.correo_envios set estado = 'entregado' where resend_id = p_resend_id and p_resend_id is not null and estado = 'enviado';
  end if;
  return jsonb_build_object('resultado', 'aplicado');
end $$;

-- ── 7b · Vincular una suscripción de visitante con la cuenta del MISMO correo (una persona, un registro) ──
-- Sólo pone el `uid` donde faltaba: no cambia el estado ni el consentimiento (crear una cuenta NO es aceptar marketing).
create or replace function public.correo_vincular_cuenta(p_uid text, p_email text) returns void
language sql security definer set search_path = public as $$
  update public.correo_suscriptores set uid = p_uid, actualizado_en = now()
   where email_norm = lower(btrim(p_email)) and uid is null
$$;

-- ── 8 · Salud del marketing (últimos 7 días): la tarea diaria se pausa sola si algo anda mal ─────
create or replace function public.correo_salud() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'enviados7', count(*) filter (where estado in ('enviado', 'entregado', 'rebotado', 'queja')),
    'rebotados7', count(*) filter (where estado = 'rebotado'),
    'quejas7', count(*) filter (where estado = 'queja')
  ) from public.correo_envios where categoria = 'marketing' and creado_en > now() - interval '7 days'
$$;

-- Sólo el servidor (service_role) puede llamarlas. La clave pública y los usuarios con sesión, no.
revoke all on function public.correo_suscribir(text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.correo_confirmar(uuid) from public, anon, authenticated;
revoke all on function public.correo_baja(uuid, text) from public, anon, authenticated;
revoke all on function public.correo_cuenta_marketing(text, text, boolean, jsonb, text) from public, anon, authenticated;
revoke all on function public.correo_reservar_envio(text, text, text, text, uuid, text[], text) from public, anon, authenticated;
revoke all on function public.correo_cupo_estado(text) from public, anon, authenticated;
revoke all on function public.correo_marcar_envio(bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.correo_evento(text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.correo_suscribir(text, text, jsonb, text, text) to service_role;
grant execute on function public.correo_confirmar(uuid) to service_role;
grant execute on function public.correo_baja(uuid, text) to service_role;
grant execute on function public.correo_cuenta_marketing(text, text, boolean, jsonb, text) to service_role;
grant execute on function public.correo_reservar_envio(text, text, text, text, uuid, text[], text) to service_role;
grant execute on function public.correo_cupo_estado(text) to service_role;
grant execute on function public.correo_marcar_envio(bigint, text, text, text) to service_role;
grant execute on function public.correo_evento(text, text, text, text, boolean) to service_role;
revoke all on function public.correo_vincular_cuenta(text, text) from public, anon, authenticated;
grant execute on function public.correo_vincular_cuenta(text, text) to service_role;
revoke all on function public.correo_salud() from public, anon, authenticated;
grant execute on function public.correo_salud() to service_role;

commit;
