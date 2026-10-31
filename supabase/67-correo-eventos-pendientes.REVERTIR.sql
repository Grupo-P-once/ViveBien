-- Reversa de la 67: vuelve a las funciones de la 62/63 (texto original) y quita la cuarentena de eventos y la función interna.
-- OJO: los eventos que estén en cuarentena en ese momento (sin envío asociado todavía) se pierden; son eventos sin efecto aplicado. Las filas de correo_envios, supresiones y suscriptores NO se tocan.
begin;

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


create or replace function public.correo_marcar_envio(p_id bigint, p_estado text, p_resend_id text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_estado not in ('enviado', 'error', 'omitido') then raise exception 'estado invalido'; end if;
  update public.correo_envios
     set estado = p_estado, resend_id = coalesce(p_resend_id, resend_id), error = left(p_error, 200),
         enviado_en = case when p_estado = 'enviado' then now() else enviado_en end
   where id = p_id and estado in ('pendiente', 'error');
end $$;


create or replace function public.correo_olvidar_cuenta(p_uid text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_envios int := 0; v_susc int := 0; v_h text := public.correo_huella(p_email);
begin
  delete from public.correo_envios where email_hash = v_h;
  get diagnostics v_envios = row_count;
  delete from public.correo_suscriptores
   where (p_uid is not null and uid = p_uid) or (p_email is not null and email_norm = lower(btrim(p_email)));
  get diagnostics v_susc = row_count;
  return jsonb_build_object('envios_borrados', v_envios, 'suscripciones_borradas', v_susc);
end $$;


create or replace function public.correo_purgar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_envios int; v_vistos int; v_susc int; v_pend int; v_conc int;
begin
  delete from public.correo_envios where creado_en < now() - interval '730 days';
  get diagnostics v_envios = row_count;
  delete from public.correo_webhook_vistos where creado_en < now() - interval '90 days';
  get diagnostics v_vistos = row_count;
  -- Suscripciones terminadas hace más de 2 años (baja, rebote, queja): se borran con su correo; la supresión (huella) queda.
  delete from public.correo_suscriptores
   where estado in ('baja', 'rebotada', 'queja') and coalesce(baja_en, actualizado_en) < now() - interval '730 days';
  get diagnostics v_susc = row_count;
  -- Solicitudes nunca confirmadas: el enlace vence a los 7 días; a los 30 ya no hacen falta.
  delete from public.correo_suscriptores where estado = 'pendiente' and creado_en < now() - interval '30 days';
  get diagnostics v_pend = row_count;
  delete from public.correo_conciliacion where leido_en < now() - interval '730 days';
  get diagnostics v_conc = row_count;
  return jsonb_build_object('envios', v_envios, 'webhook_vistos', v_vistos, 'suscripciones', v_susc, 'pendientes', v_pend, 'conciliaciones', v_conc);
end $$;


drop function if exists public.correo_aplicar_evento(text, text, text, boolean);
drop table if exists public.correo_eventos_pendientes;

commit;
