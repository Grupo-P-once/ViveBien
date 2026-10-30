-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 40 — Ayuda administrativa: el permiso «Sin comisión»
-- Reversa: 40-ayuda-sin-comision.REVERTIR.sql
--
-- PREPARADA, NO APLICADA. Va DESPUÉS de desplegar el código que agrega la capacidad `sin_comision` (la pantalla de permisos ya la muestra).
-- Un solo UPDATE sobre UNA fila de `knowledge_articles` (cuerpo y actualizado_en): el artículo «Qué controla cada permiso» nombra todos los
-- permisos del catálogo y una prueba obliga a que la ayuda y la pantalla digan lo mismo. No toca estado, firma de publicación ni otros artículos.
-- Idempotente: si el artículo ya menciona «Sin comisión», no cambia nada.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

update public.knowledge_articles
   set cuerpo = replace(
         cuerpo,
         'Son dos permisos separados, y lo que está en revisión nunca se edita.',
         'Son dos permisos separados, y lo que está en revisión nunca se edita. Sin comisión: la cuenta no tiene que aceptar la propuesta de comisión para enviar o publicar sus propiedades; la modalidad asociado la trae encendida. Hoy no tiene efecto: solo actúa cuando el módulo «Motor de comisiones» esté encendido.'
       ),
       actualizado_en = now()
 where slug = 'que-controla-cada-permiso'
   and cuerpo not like '%Sin comisión%'
   and cuerpo like '%Son dos permisos separados, y lo que está en revisión nunca se edita.%';

commit;
