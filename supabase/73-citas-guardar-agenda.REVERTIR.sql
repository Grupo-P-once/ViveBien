-- Reversa de 73: quita la función. No toca las agendas ya guardadas ni las filas de auditoría.
drop function public.citas_guardar_agenda(text, text, text, text, jsonb, jsonb, jsonb);
