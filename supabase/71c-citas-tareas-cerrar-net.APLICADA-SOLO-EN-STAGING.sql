-- REGISTRO, NO MIGRACIÓN PARA APLICAR EN OTRO LADO.
--
-- Esta es la migración `20261105215843 citas_tareas_cerrar_net_71c`, aplicada UNA vez en STAGING (vivebien-staging,
-- ref obzxnxfrqpmxocgkhxro) el 5-nov-2026 y conservada aquí solo para que el repo y el historial de staging cuenten lo mismo.
--
-- Resultado comprobado: el comando terminó "success" pero NO cerró el acceso: la cola `net.http_request_queue` siguió legible por
-- anon/authenticated/service_role (los privilegios venían de `supabase_admin` y de PUBLIC, que esta migración no alcanza).
-- Por eso el diseño final NO depende de ella: la tarea de citas usa una firma HMAC de un solo uso (migración 72), no un token reutilizable.
--
-- NO aplicar en Producción: no aporta protección y revoca USAGE sobre el esquema `net` a `service_role`, que otras piezas podrían usar.
-- Contenido exacto aplicado (sin comentarios):

revoke all on all tables in schema net from anon, authenticated, service_role;
revoke all on all sequences in schema net from anon, authenticated, service_role;
revoke execute on all functions in schema net from public, anon, authenticated, service_role;
revoke usage on schema net from anon, authenticated, service_role;
