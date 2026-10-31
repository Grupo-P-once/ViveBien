-- ═══════════════════════════════════════════════════════════
-- Vive Bien · 66 — Centro de Ayuda: asegurar categorías y (re)insertar los dos artículos de correos (30-oct-2026)
-- MIGRACIÓN HACIA ADELANTE que corrige el estado de la 64: en STAGING la 64 quedó registrada SIN insertar nada (0 categorías, E-59).
-- No se toca el historial de migraciones: la 66 hace el trabajo que la 64 no hizo. Idempotente (se puede repetir sin duplicar).
-- 1) Asegura las dos categorías que necesitan los artículos (mismos valores que la 27; en producción ya existen: `on conflict do nothing` = sin efecto).
-- 2) Inserta/actualiza los dos artículos y sus fuentes (mismo contenido que la 64).
-- Reversa: 66-ayuda-correos-asegurar-categorias.REVERTIR.sql (quita solo los dos artículos; NO borra categorías, que pueden tener otros artículos).
-- ═══════════════════════════════════════════════════════════

begin;

insert into public.knowledge_categories (slug, nombre, descripcion, icono, ambito, orden) values
  ('busquedas-y-alertas',    'Búsquedas y alertas',    'Guardar una búsqueda y enterarte de lo nuevo.', 'bell', 'publica', 4),
  ('privacidad-y-seguridad', 'Privacidad y seguridad', 'Aviso de privacidad, datos y seguridad.',      'lock', 'publica', 8)
on conflict (slug) do nothing;

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

-- ── Segundo artículo: cómo activar y desactivar los avisos por correo (engranaje del portal) ─────────────────────────────────────────────
insert into public.knowledge_articles
  (categoria_id, slug, titulo, resumen, cuerpo, ambito, estado, estado_producto, aviso, prioridad,
   publicado_por, publicado_en, revisado_en)
select c.id,
       'activar-o-desactivar-avisos-por-correo',
       '¿Cómo activo o desactivo los avisos por correo?',
       'Dónde está el engranaje de ajustes, qué avisos puedes controlar y cómo dejar de recibirlos desde el propio correo.',
       $c$Los avisos por correo de VIVE BIEN vienen **activados** cuando creas tu cuenta, y tú decides cuáles quieres. Los cambios se guardan al momento y puedes hacerlos cuando quieras. Si tu cuenta ya existía antes de este cambio, conserva lo que tenías elegido.

**Cómo activarlos o desactivarlos.** Entra a tu portal y pulsa el **engranaje pequeño** que está en la esquina superior derecha de la pantalla. Se abre «Cómo quiero que me avisen». Marca la casilla para activar un aviso y desmárcala para desactivarlo. Para cerrar el panel, pulsa Escape o haz clic fuera de él.

**Qué puedes controlar.** **Propiedades nuevas de mis búsquedas:** un resumen por correo cuando haya algo nuevo en las búsquedas donde pulsaste «Avisarme». **Baja de precio:** un correo cuando baje de precio una propiedad en la que pulsaste la campana. **Cambios de Términos o Aviso de Privacidad:** solo cuando cambien las condiciones de tu cuenta.

**Desde el propio correo.** Cada aviso trae un enlace para dejar de recibirlo con un solo clic, sin entrar a tu cuenta.

**Siempre en tu portal.** Aunque desactives el correo, tus avisos siguen apareciendo en **Mis alertas**, dentro del portal.

**Promociones.** Son aparte y no vienen activadas: solo se enviarían si tú das un consentimiento expreso y separado. Puedes leer más en el [Aviso de Privacidad](/privacidad).$c$,
       'publica', 'PUBLICADO', 'disponible', null, 2,
       'contenido-correos-30-oct-2026', now(), current_date
  from public.knowledge_categories c
 where c.slug = 'busquedas-y-alertas'
on conflict (categoria_id, slug) do update set
  titulo = excluded.titulo, resumen = excluded.resumen, cuerpo = excluded.cuerpo,
  estado = excluded.estado, estado_producto = excluded.estado_producto, aviso = excluded.aviso,
  prioridad = excluded.prioridad, ambito = excluded.ambito,
  revisado_en = excluded.revisado_en, actualizado_en = now();

insert into public.knowledge_article_sources (articulo_id, tipo, clave, version_fuente)
select a.id, f.tipo, f.clave, null
  from public.knowledge_articles a
  join public.knowledge_categories c on c.id = a.categoria_id and c.slug = 'busquedas-y-alertas'
 cross join (values ('component', 'portal/AjustesDeAvisos'), ('route', '/api/portal/preferencias'), ('api', '/api/avisos/baja')) as f(tipo, clave)
 where a.slug = 'activar-o-desactivar-avisos-por-correo'
on conflict (articulo_id, tipo, clave) do nothing;

commit;
