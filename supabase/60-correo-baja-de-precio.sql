-- ═══════════════════════════════════════════════════════
-- Vive Bien · 60 — Consentimiento para el CORREO de «baja de precio» (borrador para revisión del dueño)
-- Reversa: 60-correo-baja-de-precio.REVERTIR.sql
--
-- PREPARADA, NO APLICADA. Requiere la 58 (`preferencias_notificacion`) y, para que haya algo que avisar, la 59.
--
-- POR QUÉ: el interruptor existente (`correo_alertas`) está redactado como «recibir por correo las propiedades nuevas de mis búsquedas». NO cubre un correo de baja de precio:
-- reutilizarlo sería inventar un consentimiento. Esta migración agrega un consentimiento PROPIO, apagado por defecto (opt-in), con su fecha.
-- QUÉ AGREGA: dos columnas en `preferencias_notificacion` (`correo_precio`, `consentimiento_precio_en`). No toca filas ni permisos; `baja_de_cuenta` ya borra la fila completa.
-- Idempotente. El código falla CERRADO si la columna no existe (no manda correos de precio) y sigue mandando lo demás.
-- ══════════════════════════════════════════════════════

begin;

alter table public.preferencias_notificacion add column if not exists correo_precio boolean not null default false;
alter table public.preferencias_notificacion add column if not exists consentimiento_precio_en timestamptz;

commit;
