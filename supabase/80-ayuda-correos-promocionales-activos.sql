-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 80 — Centro de Ayuda: el correo de recomendaciones YA se envía (10-nov-2026)
-- Idempotente. Reversa: 80-ayuda-correos-promocionales-activos.REVERTIR.sql
--
-- ESTADO: PREPARADA, NO APLICADA. Se aplica en el MISMO momento en que se activa el envío (CORREO_MARKETING=1) y se publica el Aviso con
-- la finalidad secundaria; aplicarla antes dejaría la ayuda diciendo algo que todavía no es cierto. El texto exacto debe coincidir con el
-- aprobado por el abogado (nota de Obsidian «Marketing a todas las cuentas y formularios»).
--
-- Qué hace: reemplaza «Hoy VIVE BIEN no envía correos promocionales.» y las frases que dependían de ello, y quita el aviso de «parcial».
-- Formato del visor: solo párrafos, **negritas** y enlaces.
-- ═══════════════════════════════════════════════════════════════

begin;

update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo,
         'Solo se mandarían con tu consentimiento expreso y separado, y cada uno trae un enlace para darte de baja con un clic. Hoy VIVE BIEN no envía correos promocionales.',
         'VIVE BIEN te envía, como máximo **una vez cada siete días**, propiedades nuevas que se ajusten a lo que elegiste o que se parezcan a la última que consultaste en el sitio. Si tienes cuenta o nos dejaste tu correo en un formulario, quedas suscrito a estos correos, **salvo que te opongas**: cada correo trae un enlace para darte de baja con un clic, y también puedes escribirnos desde la página de [Contacto](/contacto). Si lo prefieres, puedes elegir qué tipo de propiedades quieres recibir en [Recomendaciones](/recomendaciones).'),
       actualizado_en = now(), revisado_en = current_date
 where a.slug = 'correos-de-vive-bien-y-tus-preferencias'
   and a.cuerpo like '%Hoy VIVE BIEN no envía correos promocionales.%';

update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo,
         'Si más adelante quieres volver a recibirlos, tendrás que pedirlo y confirmarlo tú otra vez.',
         'Si más adelante quieres volver a recibirlos, tendrás que pedirlo y confirmarlo tú otra vez; no te volveremos a suscribir por nuestra cuenta.'),
       actualizado_en = now(), revisado_en = current_date
 where a.slug = 'correos-de-vive-bien-y-tus-preferencias'
   and a.cuerpo like '%tendrás que pedirlo y confirmarlo tú otra vez.%'
   and a.cuerpo not like '%no te volveremos a suscribir por nuestra cuenta%';

update public.knowledge_articles a
   set aviso = null, estado_producto = 'disponible', actualizado_en = now()
 where a.slug = 'correos-de-vive-bien-y-tus-preferencias'
   and a.aviso like '%correos promocionales todavía no se envían%';

commit;
