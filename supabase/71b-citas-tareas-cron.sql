-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 71b — Programación de la tarea de citas con pg_cron + pg_net (D-4, 5-nov-2026)
-- Reversa: 71b-citas-tareas-cron.REVERTIR.sql
--
-- Requiere 71-citas-tareas-token.sql. Se aplica SOLO en el entorno que corresponda (primero staging) y NO es una migración
-- de esquema: instala extensiones, crea el token y programa el trabajo.
--
-- QUÉ NO ESTÁ AQUÍ A PROPÓSITO:
--   · el token: se crea dentro de la base con `vault.create_secret(encode(gen_random_bytes(32), 'hex'), …)`; no aparece en este archivo,
--     en ningún registro ni en ninguna respuesta, y NADIE lo lee (ni la app ni la persona que aplica la migración);
--   · la URL de la app: es de cada entorno; se guarda aparte en Vault (`citas_tareas_url`, ver el paso 3 del README de la fase).
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 1 · El token (se crea una sola vez; si ya existe no se toca).
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'citas_tareas_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'citas_tareas_token',
      'Token de un solo propósito de la tarea de citas (D-4). No es la llave de servicio.');
  end if;
end $$;

-- 2 · La tarea: cada minuto. Un trabajo con ese nombre se reemplaza (programar dos veces no crea dos).
select cron.schedule('citas-tareas', '* * * * *', $job$select public.citas_tarea_invocar()$job$);

-- 3 · Limpieza diaria del historial del cron, solo de este trabajo, para que no crezca sin límite.
select cron.schedule(
  'citas-tareas-limpieza', '17 3 * * *',
  $job$delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname = 'citas-tareas') and end_time < now() - interval '7 days'$job$);
