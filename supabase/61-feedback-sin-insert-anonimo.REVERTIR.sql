-- Reversa de la 61: devuelve el INSERT a anon y authenticated sobre `knowledge_feedback` (estado de la 42). Una transacción, sin pérdida de datos.
-- Si se revierte, también hay que volver a poner la ruta `/api/ayuda/feedback` con la clave anónima o dejará de afectar: con clave de servicio funciona igual.
begin;
grant insert on public.knowledge_feedback to anon, authenticated;
commit;
