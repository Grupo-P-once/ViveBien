-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 71 — Token de la tarea de citas, validado por la base (D-4, 5-nov-2026)
-- Reversa: 71-citas-tareas-token.REVERTIR.sql
--
-- El cron (`pg_cron` + `pg_net`) llama cada minuto a POST /api/citas/tareas con un TOKEN de un solo propósito.
-- Ese token vive SOLO en Supabase Vault (secreto `citas_tareas_token`). La app no lo guarda en ninguna variable de entorno:
-- cuando le llega una petición, le pregunta a la base si el token es válido (`citas_tarea_token_valido`). Así:
--   · el secreto nunca sale de Supabase (no está en Vercel, en el repositorio, en los registros ni en la interfaz);
--   · no hay dos copias que sincronizar ni rotar a la vez;
--   · NO es la llave de servicio: solo sirve para ejecutar esta tarea, que es idempotente.
-- Advertencia de la documentación de Supabase: `pg_net` deja el encabezado con el token descifrado en `net.http_request_queue`
-- mientras la petición está pendiente.
--
-- ⚠️ ESTA MIGRACIÓN FUE SUPERADA POR LA 72. Este texto afirmaba que ningún rol de la aplicación podía leer `net`: se comprobó en
-- staging que SÍ pueden (los privilegios los concedió `supabase_admin` a `PUBLIC` y `postgres` no puede revocarlos), así que un
-- token reutilizable no debe viajar en ese encabezado. La 72 lo reemplaza por una firma HMAC de un solo uso que caduca en 2 minutos.
-- Se conserva solo porque ya está registrada en el historial de staging; NO debe aplicarse sola en otro entorno.
-- ═══════════════════════════════════════════════════════════════

-- ¿Es éste el token de la tarea? Compara los hashes SHA-256 (no el texto) y devuelve solo sí/no.
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

-- Lo que ejecuta el cron cada minuto: llama a la app con el token. Sin URL o sin token configurados, no hace nada.
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

revoke all on function public.citas_tarea_token_valido(text) from public, anon, authenticated;
revoke all on function public.citas_tarea_invocar() from public, anon, authenticated, service_role;
-- La app (clave de servicio) solo puede PREGUNTAR si un token es válido; invocar la tarea es del cron (postgres).
grant execute on function public.citas_tarea_token_valido(text) to service_role;
