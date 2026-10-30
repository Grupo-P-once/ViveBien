-- Reversa de 33-propiedad-cambiar-estado.sql
--
-- Sólo quita la función: no toca datos. El código nuevo que la usa (`/estado`, alta heredada del panel, Telegram) responderá 503 al
-- cambiar el estado de una propiedad hasta que se vuelva a aplicar la 33 (o se despliegue el código anterior).

drop function if exists public.propiedad_cambiar_estado(text, text, text, jsonb, jsonb);
