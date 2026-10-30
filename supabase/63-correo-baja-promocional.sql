-- 63 · Baja promocional con supresión durable + eventos 'email.failed' (30-oct-2026)
-- ESTADO: aplicada SOLO en STAGING (vivebien-staging) para el Preview; NO en producción. Va DESPUÉS de la 62.
-- Qué cambia (todo dentro de las tablas y funciones de la 62; no crea tablas):
--   · correo_supresiones.motivo admite 'baja_promocional'. Bloquea SÓLO el marketing: correo_reservar_envio ya bloquea el marketing ante cualquier
--     supresión y el servicio sólo ante rebote, queja o manual, así que un correo de servicio o transaccional NO se detiene por una baja promocional.
--   · correo_baja y correo_cuenta_marketing(aceptar = false) escriben esa supresión (sólo la huella): sobrevive a la purga de 2 años de la
--     suscripción y al borrado de la cuenta. Una supresión más fuerte (rebote, queja) no se rebaja.
--   · Confirmar una suscripción nueva (correo_confirmar) o aceptar el marketing en la cuenta la levanta: es un consentimiento nuevo y expreso.
--     correo_suscribir ya no la trata como bloqueo definitivo (la persona puede volver a pedir su suscripción; sigue sin activarse hasta confirmar).
--   · correo_evento: un rebote o una supresión del proveedor reemplazan una baja promocional; 'email.failed' marca el envío como error y
--     'email.suppressed' lo marca como suprimido (sólo si seguía pendiente o enviado).
-- Reversa: 63-correo-baja-promocional.REVERTIR.sql (restaura las 5 funciones de la 62 y el CHECK original).

begin;

alter table public.correo_supresiones drop constraint if exists correo_supresiones_motivo_check;
alter table public.correo_supresiones add constraint correo_supresiones_motivo_check check (motivo in ('rebote', 'queja', 'manual', 'baja_promocional'));

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
  if exists (select 1 from public.correo_supresiones where email_hash = public.correo_huella(v_norm) and motivo <> 'baja_promocional') then
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

create or replace function public.correo_confirmar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fila public.correo_suscriptores%rowtype;
begin
  select * into v_fila from public.correo_suscriptores where id = p_id for update;
  if not found then return jsonb_build_object('estado', 'desconocida'); end if;
  if exists (select 1 from public.correo_supresiones where email_hash = public.correo_huella(v_fila.email_norm) and motivo <> 'baja_promocional') or v_fila.estado in ('rebotada', 'queja') then
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
  -- Confirmar la nueva suscripción es un consentimiento nuevo y expreso de la propia persona: levanta la supresión de la baja anterior.
  delete from public.correo_supresiones where email_hash = public.correo_huella(v_fila.email_norm) and motivo = 'baja_promocional';
  return jsonb_build_object('estado', 'activa', 'cambio', true);
end $$;

create or replace function public.correo_baja(p_id uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n int; v_fila record;
begin
  select email_norm, estado into v_fila from public.correo_suscriptores where id = p_id for update;
  if not found then return jsonb_build_object('ok', true, 'cambio', false); end if;
  update public.correo_suscriptores
     set estado = case when estado in ('rebotada', 'queja') then estado else 'baja' end,
         baja_en = coalesce(baja_en, now()), baja_motivo = coalesce(baja_motivo, left(p_motivo, 60)),
         proximo_envio_en = null, actualizado_en = now()
   where id = p_id and estado <> 'baja';
  get diagnostics v_n = row_count;
  -- La baja promocional deja una SUPRESIÓN (sólo la huella): aunque la suscripción se purgue o la cuenta se borre, no se le vuelve a escribir
  -- propaganda hasta que la propia persona confirme una suscripción nueva. Una supresión más fuerte (rebote, queja) no se rebaja.
  if v_fila.estado not in ('rebotada', 'queja') then
    insert into public.correo_supresiones (email_hash, motivo) values (public.correo_huella(v_fila.email_norm), 'baja_promocional') on conflict (email_hash) do nothing;
  end if;
  return jsonb_build_object('ok', true, 'cambio', v_n > 0);
end $$;

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
      if v_fila.estado not in ('rebotada', 'queja') then
        insert into public.correo_supresiones (email_hash, motivo) values (public.correo_huella(v_norm), 'baja_promocional') on conflict (email_hash) do nothing;
      end if;
    end if;
    return jsonb_build_object('estado', 'baja');
  end if;

  if p_version is null or length(btrim(p_version)) = 0 then return jsonb_build_object('estado', 'sin_consentimiento'); end if;
  if exists (select 1 from public.correo_supresiones where email_hash = public.correo_huella(v_norm) and motivo <> 'baja_promocional') then return jsonb_build_object('estado', 'bloqueada'); end if;
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
  -- Aceptar el marketing desde la cuenta es un consentimiento nuevo y expreso: levanta la supresión de la baja anterior.
  delete from public.correo_supresiones where email_hash = public.correo_huella(v_norm) and motivo = 'baja_promocional';
  return jsonb_build_object('estado', 'activa', 'id', v_fila.id);
end $$;

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
      insert into public.correo_supresiones (email_hash, motivo) values (public.correo_huella(v_norm), 'rebote') on conflict (email_hash) do update set motivo = case when public.correo_supresiones.motivo = 'baja_promocional' then 'rebote' else public.correo_supresiones.motivo end;
      update public.correo_suscriptores set estado = 'rebotada', proximo_envio_en = null, actualizado_en = now() where email_norm = v_norm and estado <> 'baja';
    end if;
    update public.correo_envios set estado = 'rebotado' where resend_id = p_resend_id and p_resend_id is not null;
  elsif p_tipo = 'email.bounced' then
    update public.correo_envios set error = 'rebote temporal' where resend_id = p_resend_id and p_resend_id is not null;
  elsif p_tipo = 'email.complained' then
    if v_norm <> '' then
      insert into public.correo_supresiones (email_hash, motivo) values (public.correo_huella(v_norm), 'queja') on conflict (email_hash) do update set motivo = 'queja';
      update public.correo_suscriptores set estado = 'queja', proximo_envio_en = null, baja_en = coalesce(baja_en, now()), actualizado_en = now() where email_norm = v_norm;
    end if;
    update public.correo_envios set estado = 'queja' where resend_id = p_resend_id and p_resend_id is not null;
  elsif p_tipo = 'email.suppressed' then
    if v_norm <> '' then
      insert into public.correo_supresiones (email_hash, motivo) values (public.correo_huella(v_norm), 'rebote') on conflict (email_hash) do update set motivo = case when public.correo_supresiones.motivo = 'baja_promocional' then 'rebote' else public.correo_supresiones.motivo end;
      update public.correo_suscriptores set estado = 'rebotada', proximo_envio_en = null, actualizado_en = now() where email_norm = v_norm and estado <> 'baja';
    end if;
    update public.correo_envios set estado = 'suprimido', error = 'suprimido por el proveedor' where resend_id = p_resend_id and p_resend_id is not null and estado in ('pendiente', 'enviado');
  elsif p_tipo = 'email.failed' then
    update public.correo_envios set estado = 'error', error = 'fallo del proveedor' where resend_id = p_resend_id and p_resend_id is not null and estado in ('pendiente', 'enviado');
  elsif p_tipo = 'email.delivered' then
    update public.correo_envios set estado = 'entregado' where resend_id = p_resend_id and p_resend_id is not null and estado = 'enviado';
  end if;
  return jsonb_build_object('resultado', 'aplicado');
end $$;

commit;
