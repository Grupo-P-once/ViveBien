-- ═══════════════════════════════════════════════════════════
-- Vive Bien · 67 — Eventos del proveedor que llegan ANTES de que el envío tenga su resend_id, y eventos de OTRA aplicación (31-oct-2026)
-- Idempotente. Reversa: 67-correo-eventos-pendientes.REVERTIR.sql. Va DESPUÉS de la 62 y la 63. NO reescribe ninguna migración aplicada: reemplaza funciones (create or replace).
--
-- PROBLEMA (MKT-49): `correo_evento` marcaba el svix-id como visto y luego actualizaba por resend_id. El emisor anota el resend_id DESPUÉS de que Resend responde (correo_marcar_envio);
--   si el evento llegaba antes, no encontraba fila, quedaba «visto» y un replay del proveedor ya no lo aplicaba: la entrega/rebote se perdía. Además, un rebote o una queja suprimía
--   a la dirección por huella aunque el evento fuera de otra aplicación que comparte la cuenta de Resend.
-- SOLUCIÓN:
--   1) Un evento solo TIENE EFECTOS si su resend_id pertenece a un envío de ESTE libro (esa es la identidad de envío: otra aplicación no puede producir un resend_id nuestro).
--   2) Si todavía no existe ese envío, el evento se guarda en `correo_eventos_pendientes` (solo el tipo, el resend_id y la HUELLA del destinatario; nunca el correo) y NO produce
--      ningún efecto (ni estado, ni supresión, ni suscripción). Es durable y transaccional.
--   3) `correo_marcar_envio` (que anota el resend_id) reconcilia dentro de la MISMA transacción los pendientes de ese ID, en orden de llegada. Un candado por resend_id serializa
--      «evento» y «anotar el ID», así que no hay una ventana en la que el evento se pierda, sea cual sea el orden.
--   4) Sin resend_id el evento no se puede atribuir a nadie: no se marca visto ni se aplica. Los pendientes que no se reconcilian (de otra aplicación, o de un envío que nunca se anotó)
--      se purgan a los 7 días y hay un tope de 5 000 (nunca crece sin límite).
--   5) Todo es una transacción: si algo falla, también se deshace el «visto» y Resend reintenta.
-- ═══════════════════════════════════════════════════════════

begin;

create table if not exists public.correo_eventos_pendientes (
  svix_id           text primary key,
  tipo              text not null check (tipo in ('email.delivered', 'email.bounced', 'email.complained', 'email.suppressed', 'email.failed')),
  resend_id         text not null check (length(resend_id) between 1 and 200),
  email_hash        text,
  rebote_permanente boolean not null default false,
  recibido_en       timestamptz not null default now()
);
create index if not exists correo_eventos_pendientes_resend_idx on public.correo_eventos_pendientes (resend_id, recibido_en);
alter table public.correo_eventos_pendientes enable row level security;
revoke all on public.correo_eventos_pendientes from public, anon, authenticated;

-- Aplica UN evento ya atribuido a un envío propio. Interna: la llaman correo_evento y correo_marcar_envio.
create or replace function public.correo_aplicar_evento(p_tipo text, p_email_hash text, p_resend_id text, p_rebote_permanente boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_tipo = 'email.bounced' and p_rebote_permanente then
    if p_email_hash is not null then
      insert into public.correo_supresiones (email_hash, motivo) values (p_email_hash, 'rebote') on conflict (email_hash) do update set motivo = case when public.correo_supresiones.motivo = 'baja_promocional' then 'rebote' else public.correo_supresiones.motivo end;
      update public.correo_suscriptores set estado = 'rebotada', proximo_envio_en = null, actualizado_en = now() where public.correo_huella(email_norm) = p_email_hash and estado <> 'baja';
    end if;
    update public.correo_envios set estado = 'rebotado' where resend_id = p_resend_id;
  elsif p_tipo = 'email.bounced' then
    update public.correo_envios set error = 'rebote temporal' where resend_id = p_resend_id;
  elsif p_tipo = 'email.complained' then
    if p_email_hash is not null then
      insert into public.correo_supresiones (email_hash, motivo) values (p_email_hash, 'queja') on conflict (email_hash) do update set motivo = 'queja';
      update public.correo_suscriptores set estado = 'queja', proximo_envio_en = null, baja_en = coalesce(baja_en, now()), actualizado_en = now() where public.correo_huella(email_norm) = p_email_hash;
    end if;
    update public.correo_envios set estado = 'queja' where resend_id = p_resend_id;
  elsif p_tipo = 'email.suppressed' then
    if p_email_hash is not null then
      insert into public.correo_supresiones (email_hash, motivo) values (p_email_hash, 'rebote') on conflict (email_hash) do update set motivo = case when public.correo_supresiones.motivo = 'baja_promocional' then 'rebote' else public.correo_supresiones.motivo end;
      update public.correo_suscriptores set estado = 'rebotada', proximo_envio_en = null, actualizado_en = now() where public.correo_huella(email_norm) = p_email_hash and estado <> 'baja';
    end if;
    update public.correo_envios set estado = 'suprimido', error = 'suprimido por el proveedor' where resend_id = p_resend_id and estado in ('pendiente', 'enviado');
  elsif p_tipo = 'email.failed' then
    update public.correo_envios set estado = 'error', error = 'fallo del proveedor' where resend_id = p_resend_id and estado in ('pendiente', 'enviado');
  elsif p_tipo = 'email.delivered' then
    update public.correo_envios set estado = 'entregado' where resend_id = p_resend_id and estado = 'enviado';
  end if;
end $$;
revoke all on function public.correo_aplicar_evento(text, text, text, boolean) from public, anon, authenticated;

create or replace function public.correo_evento(
  p_svix_id text, p_tipo text, p_email text, p_resend_id text, p_rebote_permanente boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_norm text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
  v_nuevo int;
  v_pend int;
begin
  if p_svix_id is null or length(p_svix_id) < 3 then return jsonb_build_object('resultado', 'invalido'); end if;
  if p_tipo is null or p_tipo not in ('email.delivered', 'email.bounced', 'email.complained', 'email.suppressed', 'email.failed') then return jsonb_build_object('resultado', 'ignorado'); end if;
  -- Sin resend_id no hay identidad de envío: no se puede atribuir a este sistema, así que no se aplica ni se marca visto.
  if p_resend_id is null or length(btrim(p_resend_id)) = 0 or length(p_resend_id) > 200 then return jsonb_build_object('resultado', 'sin_identidad'); end if;

  -- Un candado por resend_id: «llega el evento» y «el emisor anota el resend_id» no pueden cruzarse sin que uno vea al otro.
  perform pg_advisory_xact_lock(hashtext('correo_evento:' || p_resend_id));

  insert into public.correo_webhook_vistos (svix_id) values (p_svix_id) on conflict do nothing;
  get diagnostics v_nuevo = row_count;
  if v_nuevo = 0 then return jsonb_build_object('resultado', 'duplicado'); end if;

  if v_norm <> '' then v_hash := public.correo_huella(v_norm); end if;

  if exists (select 1 from public.correo_envios where resend_id = p_resend_id) then
    perform public.correo_aplicar_evento(p_tipo, v_hash, p_resend_id, coalesce(p_rebote_permanente, false));
    return jsonb_build_object('resultado', 'aplicado');
  end if;

  -- Todavía no hay un envío con ese ID: o llegó antes de que se anotara, o es de otra aplicación. Cuarentena SIN efectos.
  select count(*) into v_pend from public.correo_eventos_pendientes;
  if v_pend >= 5000 then
    delete from public.correo_webhook_vistos where svix_id = p_svix_id; -- no se da por procesado: un replay posterior sí puede aplicarse
    return jsonb_build_object('resultado', 'descartado');
  end if;
  insert into public.correo_eventos_pendientes (svix_id, tipo, resend_id, email_hash, rebote_permanente)
  values (p_svix_id, p_tipo, p_resend_id, v_hash, coalesce(p_rebote_permanente, false)) on conflict (svix_id) do nothing;
  return jsonb_build_object('resultado', 'pendiente');
end $$;

create or replace function public.correo_marcar_envio(p_id bigint, p_estado text, p_resend_id text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare v_ev record;
begin
  if p_estado not in ('enviado', 'error', 'omitido') then raise exception 'estado invalido'; end if;
  if p_resend_id is not null then perform pg_advisory_xact_lock(hashtext('correo_evento:' || p_resend_id)); end if;
  update public.correo_envios
     set estado = p_estado, resend_id = coalesce(p_resend_id, resend_id), error = left(p_error, 200),
         enviado_en = case when p_estado = 'enviado' then now() else enviado_en end
   where id = p_id and estado in ('pendiente', 'error');
  -- Reconciliación: los eventos que llegaron antes que este resend_id se aplican ahora, en orden de llegada, y salen de la cuarentena (misma transacción).
  if p_resend_id is not null and exists (select 1 from public.correo_envios where resend_id = p_resend_id) then
    for v_ev in select svix_id, tipo, email_hash, rebote_permanente from public.correo_eventos_pendientes where resend_id = p_resend_id order by recibido_en, svix_id loop
      perform public.correo_aplicar_evento(v_ev.tipo, v_ev.email_hash, p_resend_id, v_ev.rebote_permanente);
      delete from public.correo_eventos_pendientes where svix_id = v_ev.svix_id;
    end loop;
  end if;
end $$;

create or replace function public.correo_olvidar_cuenta(p_uid text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_envios int := 0; v_susc int := 0; v_h text := public.correo_huella(p_email);
begin
  delete from public.correo_envios where email_hash = v_h;
  get diagnostics v_envios = row_count;
  delete from public.correo_eventos_pendientes where email_hash = v_h;
  delete from public.correo_suscriptores
   where (p_uid is not null and uid = p_uid) or (p_email is not null and email_norm = lower(btrim(p_email)));
  get diagnostics v_susc = row_count;
  return jsonb_build_object('envios_borrados', v_envios, 'suscripciones_borradas', v_susc);
end $$;

create or replace function public.correo_purgar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_envios int; v_vistos int; v_susc int; v_pend int; v_conc int; v_ev int;
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
  -- Eventos en cuarentena que nunca se reconciliaron (de otra aplicación, o de un envío que no llegó a anotarse): a los 7 días ya no hacen falta.
  delete from public.correo_eventos_pendientes where recibido_en < now() - interval '7 days';
  get diagnostics v_ev = row_count;
  return jsonb_build_object('envios', v_envios, 'webhook_vistos', v_vistos, 'suscripciones', v_susc, 'pendientes', v_pend, 'conciliaciones', v_conc, 'eventos_sin_envio', v_ev);
end $$;

commit;
