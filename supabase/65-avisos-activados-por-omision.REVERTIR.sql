-- Reversa de la 65: las filas nuevas vuelven a nacer apagadas. Las filas explícitas que escribió el paso 1 se QUEDAN (equivalen al comportamiento anterior: sin elección = apagado) y no se
-- pueden distinguir de una baja hecha por la persona, así que no se borran.
begin;
alter table public.preferencias_notificacion alter column correo_alertas set default false;
alter table public.preferencias_notificacion alter column correo_precio set default false;
commit;
