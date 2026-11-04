-- ═══════════════════════════════════════════════════════════
-- Vive Bien · 68 — Centro de Ayuda: medición del sitio y su elección, consulta vs anunciante, derechos ARCO (3-nov-2026)
-- Idempotente (se puede repetir sin duplicar). Reversa: 68-ayuda-privacidad-medicion-consultas-arco.REVERTIR.sql (quita solo estos tres artículos).
-- PREPARADA, NO APLICADA: va DESPUÉS del código que trae el aviso de analítica («Preferencias de analítica» en el pie) y del Aviso de Privacidad alineado.
-- NO está validada por asesoría legal (MKT-36): cada artículo debe coincidir con el Aviso publicado; si el abogado cambia el Aviso, se cambia aquí y se repite la migración.
-- Los artículos solo usan lo que el visor entiende: párrafos, **negritas** y enlaces.
-- ═══════════════════════════════════════════════════════════

begin;

insert into public.knowledge_categories (slug, nombre, descripcion, icono, ambito, orden) values
  ('privacidad-y-seguridad', 'Privacidad y seguridad', 'Aviso de privacidad, datos y seguridad.', 'lock', 'publica', 8)
on conflict (slug) do nothing;

insert into public.knowledge_articles
  (categoria_id, slug, titulo, resumen, cuerpo, ambito, estado, estado_producto, aviso, prioridad,
   publicado_por, publicado_en, revisado_en)
select c.id, v.slug, v.titulo, v.resumen, v.cuerpo, 'publica', 'PUBLICADO', 'disponible', null, v.prioridad,
       'contenido-privacidad-3-nov-2026', now(), current_date
  from public.knowledge_categories c
 cross join (values
  ('medicion-del-sitio-y-google-analytics',
   '¿Qué mide el sitio y cómo elijo?',
   'Google Analytics solo se activa si tú lo aceptas, y puedes cambiar tu elección cuando quieras.',
   $c$Con tu permiso, VIVE BIEN usa **Google Analytics** para saber qué páginas se visitan, qué se busca y cuántas veces se pulsa WhatsApp, teléfono o correo. Nunca le mandamos tu nombre, tu teléfono, tu correo ni lo que escribes en un mensaje.

**Tú eliges.** La primera vez que entras al sitio aparece un aviso con dos botones iguales: **«Aceptar»** y **«Rechazar»**. Si no eliges, o si rechazas, Google Analytics no se activa: ni se descarga ni deja cookies, y el sitio funciona igual.

**Cambiar tu elección.** En el pie de cualquier página pulsa **«Preferencias de analítica»** y vuelve a elegir. Si rechazas, borramos las cookies de Google Analytics que ya existieran en tu navegador.

**Dónde no medimos.** Tu cuenta, el portal y el panel de administración nunca se miden.

**Medición propia.** Aparte, el sitio guarda en su propia base cuántas veces se ve una propiedad, con un identificador aleatorio en tu navegador que no te identifica y sirve para no contar dos veces la misma visita. Puedes borrarlo desde la configuración de tu navegador.

Encuentras el detalle en el [Aviso de Privacidad](/privacidad).$c$,
   4),
  ('mi-consulta-y-el-anunciante',
   '¿Mi consulta llega al anunciante de la propiedad?',
   'No: la atiende VIVE BIEN. Si algún día cambia, te lo pediremos aparte.',
   $c$**No.** Cuando preguntas por una propiedad, tu solicitud es de **VIVE BIEN**: la recibe y la atiende nuestro equipo. Quien publica la propiedad no recibe tu nombre, tu teléfono, tu correo ni tu mensaje.

**Qué hacemos con ella.** El equipo te contesta y le da seguimiento, y avisa internamente que alguien preguntó (a VIVE BIEN, por correo y por WhatsApp). También guardamos de qué propiedad vino la consulta, para saber qué anuncios interesan.

**Si algún día cambia.** Si VIVE BIEN ofreciera pasar tu consulta al anunciante, te lo pediría antes y por separado, con una casilla que tú marcas y diciéndote quién recibiría tus datos. Sin esa autorización no se entregan.

El detalle está en el [Aviso de Privacidad](/privacidad).$c$,
   3),
  ('derechos-arco-como-ejercerlos',
   '¿Cómo pido ver, corregir o borrar mis datos?',
   'Tus derechos ARCO y cómo ejercerlos, con los plazos del Aviso de Privacidad.',
   $c$Tienes derecho a **acceder** a tus datos, **rectificarlos**, **cancelarlos** u **oponerte** a su uso (derechos ARCO), y a **retirar tu consentimiento**.

**Cómo.** Escribe a VIVE BIEN por el correo, el WhatsApp o el domicilio que aparecen en el [Aviso de Privacidad](/privacidad). Dinos tu nombre, cómo contestarte, qué derecho quieres ejercer y de qué datos se trata. Podemos pedirte algo que acredite tu identidad.

**Plazos.** Te respondemos en un máximo de **veinte días hábiles** y, si procede, lo hacemos efectivo en los **quince días hábiles** siguientes. Es gratuito.

**Para cerrar tu cuenta** no necesitas escribirnos: puedes hacerlo tú desde Configuración. Aquí está [cómo](/ayuda/privacidad-y-seguridad/como-eliminar-mi-cuenta).

Si no estás conforme con la respuesta, puedes acudir a la autoridad de protección de datos personales competente.$c$,
   5)
 ) as v(slug, titulo, resumen, cuerpo, prioridad)
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
  join (values
    ('medicion-del-sitio-y-google-analytics', 'component', 'AvisoAnalitica'),
    ('medicion-del-sitio-y-google-analytics', 'legal', 'privacidad'),
    ('mi-consulta-y-el-anunciante', 'documentation', 'ADR-0006'),
    ('mi-consulta-y-el-anunciante', 'api', '/api/contacto'),
    ('mi-consulta-y-el-anunciante', 'legal', 'privacidad'),
    ('derechos-arco-como-ejercerlos', 'legal', 'privacidad')
  ) as f(slug, tipo, clave) on f.slug = a.slug
on conflict (articulo_id, tipo, clave) do nothing;

commit;
