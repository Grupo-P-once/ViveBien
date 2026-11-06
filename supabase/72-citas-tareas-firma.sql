-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 72 — La tarea de citas se autentica con una FIRMA de un solo uso, no con un token reutilizable (D-4, 5-nov-2026)
-- Reversa: 72-citas-tareas-firma.REVERTIR.sql   ·   Reemplaza a 71 (que queda superada): en un entorno NUEVO se aplica 72 SIN la 71. Es independiente.
--
-- POR QUÉ CAMBIA (hallazgo en staging, 5-nov-2026): `pg_net` deja los encabezados de cada petición, DESCIFRADOS, en
-- `net.http_request_queue` mientras está pendiente (lo advierte la documentación de Supabase), y esa tabla —igual que
-- `net._http_response`— no tiene RLS y la pueden leer `anon`, `authenticated` y `service_role` (los privilegios los concedió
-- `supabase_admin`, dueño del esquema, y también a `PUBLIC`; `postgres` NO puede revocarlos: se intentó con la 71c y no tuvo efecto).
-- No es alcanzable desde la API pública (el esquema `net` no se expone), pero un secreto reutilizable no debe pasar por ahí.
--
-- LA SOLUCIÓN: el secreto (`citas_tareas_token`, en Vault) NUNCA viaja. El cron manda solo
--     X-Citas-Tiempo: <segundos desde 1970>     X-Citas-Firma: HMAC-SHA256(secreto, tiempo) en hexadecimal
-- y la base, al validar, comprueba: (1) que el tiempo esté a ≤ 120 s de ahora, (2) que la firma sea la esperada y (3) que ese
-- instante no se haya usado antes (tabla `citas_tarea_firmas`). Quien leyera la cola vería una firma que ya no sirve: caduca en
-- dos minutos y es de UN solo uso. La app no guarda ningún secreto: le pregunta a la base.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.citas_tarea_firmas (
  tiempo       bigint primary key,
  recibida_en  timestamptz not null default now()
);
alter table public.citas_tarea_firmas enable row level security;
revoke all on table public.citas_tarea_firmas from anon, authenticated;

-- ¿Es válida esta firma? Solo una vez por instante y solo dentro de la ventana.
create or replace function public.citas_tarea_firma_valida(p_tiempo bigint, p_firma text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secreto text;
  v_esperada text;
  v_ahora bigint := floor(extract(epoch from now()))::bigint;
begin
  if p_tiempo is null or p_firma is null or p_firma !~ '^[0-9a-f]{64}$' then return false; end if;
  if abs(v_ahora - p_tiempo) > 120 then return false; end if;
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'citas_tareas_token' limit 1;
  if v_secreto is null or length(v_secreto) < 32 then return false; end if;
  v_esperada := encode(extensions.hmac(convert_to(p_tiempo::text, 'UTF8'), convert_to(v_secreto, 'UTF8'), 'sha256'), 'hex');
  if sha256(convert_to(p_firma, 'UTF8')) <> sha256(convert_to(v_esperada, 'UTF8')) then return false; end if;
  -- Una sola vez: si ese instante ya se aceptó, es una repetición.
  insert into public.citas_tarea_firmas (tiempo) values (p_tiempo) on conflict do nothing;
  if not found then return false; end if;
  delete from public.citas_tarea_firmas where tiempo < v_ahora - 86400;
  return true;
end;
$$;

-- Lo que ejecuta el cron cada minuto: llama a la app con tiempo y firma. Sin URL o sin secreto configurados, no hace nada.
create or replace function public.citas_tarea_invocar()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secreto text;
  v_tiempo bigint := floor(extract(epoch from now()))::bigint;
  v_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'citas_tareas_url' limit 1;
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'citas_tareas_token' limit 1;
  if v_url is null or v_secreto is null or length(v_secreto) < 32 or v_url !~ '^https://' then return null; end if;
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Citas-Tiempo', v_tiempo::text,
      'X-Citas-Firma', encode(extensions.hmac(convert_to(v_tiempo::text, 'UTF8'), convert_to(v_secreto, 'UTF8'), 'sha256'), 'hex')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) into v_id;
  return v_id;
end;
$$;


revoke all on function public.citas_tarea_firma_valida(bigint, text) from public, anon, authenticated;
revoke all on function public.citas_tarea_invocar() from public, anon, authenticated, service_role;
-- La app (clave de servicio) solo puede PREGUNTAR si una firma es válida; invocar la tarea es del cron (postgres).
grant execute on function public.citas_tarea_firma_valida(bigint, text) to service_role;
grant select, insert, delete on public.citas_tarea_firmas to service_role;
