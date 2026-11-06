-- Reversa de 71b-citas-tareas-cron.sql: detiene la tarea y borra sus secretos. Las extensiones se dejan instaladas
-- (otras tareas podrían usarlas); si ninguna otra las necesita, se quitan a mano con `drop extension pg_cron; drop extension pg_net;`.
select cron.unschedule('citas-tareas');
select cron.unschedule('citas-tareas-limpieza');
delete from vault.secrets where name in ('citas_tareas_token', 'citas_tareas_url');
