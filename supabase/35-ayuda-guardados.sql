-- ═══════════════════════════════════════════════════════════
-- Vive Bien · 35 — Centro de Ayuda: «¿Cómo guardo una propiedad?» (D-75)
-- Va DESPUÉS del despliegue de D-75. Idempotente. Reversa: 35-ayuda-guardados.REVERTIR.sql
--
-- ESTADO: PREPARADA, NO APLICADA.
--
-- Corrige UN artículo. El texto actual manda a pulsar el corazón «en la ficha o
-- en la tarjeta», pero la ficha (`/propiedades/[id]`) no tiene corazón: sólo
-- las tarjetas. Además deja claro lo que D-75 hace verdad: guardar es de la
-- CUENTA (no del navegador) y sin sesión el corazón lleva a entrar.
--
-- No toca categorías, fuentes ni ningún otro artículo. FORMATO: sólo párrafos,
-- **negritas** y enlaces (es lo único que entiende el visor).
-- ═══════════════════════════════════════════════════════════

begin;

update public.knowledge_articles a
   set cuerpo = $c$Pulsa el **corazón** de la tarjeta de una propiedad en el catálogo. La propiedad se añade a tus guardadas y la encuentras en tu portal, en **Mis guardadas**.

Hace falta tener sesión iniciada. Si no la tienes, el corazón te lleva a entrar y, al volver, tendrás que pulsarlo otra vez.

Tus guardadas son de tu cuenta, no del navegador: las ves igual desde otro dispositivo y nadie más las ve, aunque entre desde este mismo equipo.$c$,
       actualizado_en = now()
  from public.knowledge_categories c
 where c.id = a.categoria_id
   and c.slug = 'propiedades-guardadas'
   and a.slug = 'como-guardar-una-propiedad';

commit;
