-- Reversa de 80: restituye la frase anterior (los correos promocionales «no se envían»). Aplicar solo si se apaga el envío.
begin;
update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo, 'no te volveremos a suscribir por nuestra cuenta', ''), actualizado_en = now()
 where a.slug = 'correos-de-vive-bien-y-tus-preferencias';
-- El texto largo agregado por 80 se retira restaurando la frase original de la migración 64.
update public.knowledge_articles a
   set cuerpo = regexp_replace(a.cuerpo, 'VIVE BIEN te envía, como máximo \*\*una vez cada siete días\*\*.*?\[Recomendaciones\]\(/recomendaciones\)\.', 'Solo se mandarían con tu consentimiento expreso y separado, y cada uno trae un enlace para darte de baja con un clic. Hoy VIVE BIEN no envía correos promocionales.', 's'),
       aviso = 'Los correos promocionales todavía no se envían.', estado_producto = 'parcial', actualizado_en = now()
 where a.slug = 'correos-de-vive-bien-y-tus-preferencias';
commit;
