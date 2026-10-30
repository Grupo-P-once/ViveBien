-- Reversa de la 60: quita las dos columnas del consentimiento del correo de baja de precio. Una transacción. Pierde los consentimientos registrados (por eso el código deja de mandar correos de precio al aplicarla).
begin;
alter table public.preferencias_notificacion drop column if exists consentimiento_precio_en;
alter table public.preferencias_notificacion drop column if exists correo_precio;
commit;
