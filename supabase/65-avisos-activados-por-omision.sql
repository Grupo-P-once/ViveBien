-- ═══════════════════════════════════════════════════════════
-- Vive Bien · 65 — Avisos por correo ACTIVADOS por omisión, SIN efecto retroactivo (decisión del dueño, 30-oct-2026)
-- Idempotente. Reversa: 65-avisos-activados-por-omision.REVERTIR.sql. Va DESPUÉS de la 58 y la 60 (columnas de preferencias).
--
-- Qué hace, en dos pasos:
--   1) Las cuentas que YA existen y no tienen fila de preferencias reciben una fila EXPLÍCITA con su estado actual (alertas y precio apagados, legal encendido, como se
--      comportaban hasta hoy): así el cambio de código «sin fila = activado» NO les manda ningún correo que no habían consentido (sin efecto retroactivo).
--   2) Las filas NUEVAS nacen con correo_alertas y correo_precio en TRUE (cuentas creadas a partir de ahora).
-- No toca filas existentes (quien ya eligió, o se dio de baja con el enlace de un clic, conserva su elección). Lo PROMOCIONAL no cambia: sigue apagado
-- (MARKETING_AUTORIZADO = false y consentimiento expreso y separado).
-- RIESGO LEGAL: tener estos avisos activados sin una acción de la persona (cuentas nuevas) es una decisión del dueño, sin validar por asesoría legal (MKT-36).
-- ═══════════════════════════════════════════════════════════
begin;

insert into public.preferencias_notificacion (uid, correo_alertas, correo_precio, correo_legal)
select u.uid, false, false, true
  from public.usuarios u
 where not exists (select 1 from public.preferencias_notificacion p where p.uid = u.uid)
on conflict (uid) do nothing;

alter table public.preferencias_notificacion alter column correo_alertas set default true;
alter table public.preferencias_notificacion alter column correo_precio set default true;

commit;
