-- ═══════════════════════════════════════════════════════════
-- Vive Bien · 64 — Centro de Ayuda: «¿Qué correos me manda VIVE BIEN y cómo los controlo?» (30-oct-2026)
-- ESTADO: registrada en STAGING (vivebien-staging) pero SIN EFECTO: el Centro de Ayuda de staging está vacío (0 categorías), así que no insertó nada. NO está en producción.
-- Va DESPUÉS del contenido de la 27 y del código; hay que VOLVER A EJECUTARLA cuando exista la categoría «privacidad-y-seguridad» (es idempotente).
-- Un artículo nuevo en «Privacidad y seguridad». Idempotente. Reversa: 64-ayuda-correos-y-preferencias.REVERTIR.sql
--
-- Describe lo que el código YA hace (rama f0-correo-d80): correos de servicio vs. promocionales, baja con supresión, registro de envíos y plazos.
-- NO está validado por asesoría legal: debe coincidir con el Aviso de Privacidad cuando éste se publique (ver MKT-34).
-- FORMATO: sólo párrafos, **negritas** y enlaces (es lo único que entiende el visor). `estado_producto = 'parcial'` con su aviso, que es lo que el CHECK exige.
-- ═══════════════════════════════════════════════════════════

begin;

insert into public.knowledge_articles
  (categoria_id, slug, titulo, resumen, cuerpo, ambito, estado, estado_producto, aviso, prioridad,
   publicado_por, publicado_en, revisado_en)
select c.id,
       'correos-de-vive-bien-y-tus-preferencias',
       '¿Qué correos me manda VIVE BIEN y cómo los controlo?',
       'Qué correos existen, cuáles son necesarios, cómo darte de baja de los promocionales y qué guardamos de cada envío.',
       $c$VIVE BIEN te escribe por correo por dos razones distintas, y las tratamos por separado.

**Correos de servicio.** Son los que necesitas para usar tu cuenta o que tú pediste: la bienvenida, la confirmación de una solicitud, los avisos de tus visitas, las alertas de tus búsquedas guardadas, los avisos de baja de precio y los avisos de cambios a los Términos o al Aviso de Privacidad. No son publicidad. Las alertas de búsquedas y los avisos de baja de precio por correo vienen activados; puedes apagarlos en cualquier momento desde el pequeño engranaje de ajustes de tu portal, y cada correo trae un enlace para dejar de recibirlos con un clic.

**Correos promocionales.** Son ofertas, recomendaciones o novedades. Solo se mandarían con tu consentimiento expreso y separado, y cada uno trae un enlace para darte de baja con un clic. Hoy VIVE BIEN no envía correos promocionales.

**Si te das de baja de los promocionales,** dejamos una marca (una huella derivada de tu correo, no el correo mismo) que impide volver a mandarte propaganda. La baja no afecta a los correos de servicio necesarios. Si más adelante quieres volver a recibirlos, tendrás que pedirlo y confirmarlo tú otra vez.

**Qué guardamos de cada correo.** La fecha, el tipo y el resultado (enviado, entregado, rebotado, omitido o fallido), ligados a esa huella y no a tu dirección, hasta por dos años desde el envío. Si eliminas tu cuenta, borramos tus suscripciones y esos registros; solo se conserva la marca de baja para no volver a escribirte. No registramos si abres un correo ni si das clic en sus enlaces.

**Quién los envía.** Los correos salen mediante Resend, un proveedor de envío. Puedes leer más en el [Aviso de Privacidad](/privacidad).$c$,
       'publica', 'PUBLICADO', 'parcial',
       'Los correos promocionales todavía no se envían, y los avisos de visitas dependen de que las citas en línea estén activas.',
       3,
       'contenido-correos-30-oct-2026', now(), current_date
  from public.knowledge_categories c
 where c.slug = 'privacidad-y-seguridad'
on conflict (categoria_id, slug) do update set
  titulo = excluded.titulo, resumen = excluded.resumen, cuerpo = excluded.cuerpo,
  estado = excluded.estado, estado_producto = excluded.estado_producto, aviso = excluded.aviso,
  prioridad = excluded.prioridad, ambito = excluded.ambito,
  revisado_en = excluded.revisado_en, actualizado_en = now();

insert into public.knowledge_article_sources (articulo_id, tipo, clave, version_fuente)
select a.id, f.tipo, f.clave, null
  from public.knowledge_articles a
  join public.knowledge_categories c on c.id = a.categoria_id and c.slug = 'privacidad-y-seguridad'
 cross join (values ('product', 'correo.biblioteca'), ('api', '/api/correo/baja'), ('legal', 'privacidad')) as f(tipo, clave)
 where a.slug = 'correos-de-vive-bien-y-tus-preferencias'
on conflict (articulo_id, tipo, clave) do nothing;

commit;
