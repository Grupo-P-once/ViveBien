-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 78 — Ayuda pública de citas: el titular automático del equipo (decisión del dueño, 10-nov-2026; ADR-0014 decisión 7)
-- Va DESPUÉS de 74, 74c, 74b y 77 (orden aplicado en staging). Idempotente. Reversa: 78-ayuda-citas-titular-automatico.REVERTIR.sql
--
-- ESTADO: aplicada en STAGING el 10-nov-2026. En PRODUCCIÓN: NO aplicada; va junto con el código de la decisión 7.
--
-- QUÉ HACE: antes, sin «responsable del equipo» configurado, las propiedades de un publicador salían «sin asesor». Ahora atiende el administrador activo más antiguo (el Super Admin solo si no hay
-- ningún administrador activo). Dos UPDATE con la frase exacta (repetirlos no cambia nada). Formato del visor: solo párrafos, **negritas** y enlaces.
-- ═══════════════════════════════════════════════════════════════

begin;

update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo, 'y si el dueño es un **publicador**, las atiende **VIVE BIEN**, a través del responsable del equipo.

Si nadie puede atender una propiedad, **no se puede agendar en línea**: el sistema no se la asigna a otra persona al azar.',
                        'y si el dueño es un **publicador**, las atiende **VIVE BIEN**: el responsable del equipo y, si no hay ninguno configurado, el **administrador activo más antiguo**.

Solo si no existe ningún administrador activo, **no se puede agendar en línea**: el sistema no se la asigna a otra persona al azar.'),
       actualizado_en = now(), revisado_en = current_date
 where a.cuerpo like '%Si nadie puede atender una propiedad, **no se puede agendar en línea**: el sistema no se la asigna a otra persona al azar.%';

update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo, 'Las de un **publicador** las atiende VIVE BIEN (el responsable del equipo configurado); él las consulta sin acciones. Solo cambia si un administrador **asigna** la propiedad a otra persona que pueda atender citas. Si no hay responsable del equipo configurado, esas propiedades no se pueden agendar.',
                        'Las de un **publicador** las atiende VIVE BIEN (el responsable del equipo configurado y, si no hay, el administrador activo más antiguo); él las consulta sin acciones. Solo cambia si un administrador **asigna** la propiedad a otra persona que pueda atender citas. Solo si no existe ningún administrador activo, esas propiedades no se pueden agendar.'),
       actualizado_en = now(), revisado_en = current_date
 where a.cuerpo like '%Si no hay responsable del equipo configurado, esas propiedades no se pueden agendar.%';

commit;
