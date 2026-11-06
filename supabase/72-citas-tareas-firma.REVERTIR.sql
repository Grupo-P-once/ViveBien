-- Reversa de 72: vuelve al token reutilizable de la 71 (que viaja en la cola de pg_net; ver el hallazgo en 72-citas-tareas-firma.sql).
create or replace function public.citas_tarea_token_valido(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secreto text;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 200 then return false; end if;
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'citas_tareas_token' limit 1;
  if v_secreto is null or length(v_secreto) < 32 then return false; end if;
  return sha256(convert_to(p_token, 'UTF8')) = sha256(convert_to(v_secreto, 'UTF8'));
end;
$$;

create or replace function public.citas_tarea_invocar()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
  v_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'citas_tareas_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'citas_tareas_token' limit 1;
  if v_url is null or v_token is null or v_url !~ '^https://' then return null; end if;
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_token, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) into v_id;
  return v_id;
end;
$$;

drop function public.citas_tarea_firma_valida(bigint, text);
drop table public.citas_tarea_firmas;

revoke all on function public.citas_tarea_token_valido(text) from public, anon, authenticated;
revoke all on function public.citas_tarea_invocar() from public, anon, authenticated, service_role;
grant execute on function public.citas_tarea_token_valido(text) to service_role;
