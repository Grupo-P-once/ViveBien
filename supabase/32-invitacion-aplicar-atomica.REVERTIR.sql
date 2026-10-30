-- Reversa de 32-invitacion-aplicar-atomica.sql
--
-- Solo quita la función: no toca datos. El código nuevo que la usa dejará de aplicar invitaciones (falla cerrado: nadie
-- pierde acceso) hasta que se vuelva a aplicar la 32 o se despliegue el código anterior.

drop function if exists public.invitacion_aplicar(text, text, boolean);
