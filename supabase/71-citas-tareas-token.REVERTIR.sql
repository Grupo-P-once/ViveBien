-- Reversa de 71-citas-tareas-token.sql (aplicar DESPUÉS de 71b-citas-tareas-cron.REVERTIR.sql).
drop function public.citas_tarea_invocar();
drop function public.citas_tarea_token_valido(text);
