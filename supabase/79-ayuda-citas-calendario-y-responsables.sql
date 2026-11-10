-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 79 — Ayuda pública de citas: calendario completo, correo de cancelación con .ics, pantalla de responsables e historial con nombre (10-nov-2026)
-- Va DESPUÉS de 74, 74c, 74b, 77 y 78. Idempotente. Reversa: 79-ayuda-citas-calendario-y-responsables.REVERTIR.sql
--
-- ESTADO: aplicada en STAGING el 10-nov-2026. En PRODUCCIÓN: NO aplicada; va junto con el código.
--
-- QUÉ HACE (revisión del Centro de Ayuda, 10-nov-2026: faltaban cuatro cosas que ya existen en el producto):
--   · «Cómo solicitar una visita»: los días se ven por SEMANA y «Ver calendario completo» abre un mes (hasta 3 meses).
--   · «Correos de tus citas»: si cancelas tú, te llega el correo de cancelación con archivo de calendario (.ics).
--   · «Gestionar las citas desde el panel»: la pantalla «Responsables de citas» y que el historial dice QUIÉN hizo cada cambio.
-- Tres UPDATE con la frase exacta (repetirlos no cambia nada). Formato del visor: solo párrafos, **negritas** y enlaces.
-- ═══════════════════════════════════════════════════════════════

begin;

update public.knowledge_articles a
   set cuerpo = replace(replace(a.cuerpo,
         'tócala y se despliegan los días y las horas disponibles. Elige una, marca la casilla',
         'tócala y se despliegan los días con horarios de **esta semana** y sus horas. Elige una, marca la casilla'),
         '**Solo se ofrecen horarios reales.** Los días y las horas salen de la agenda de quien atiende la propiedad y ya descuentan las citas confirmadas y los bloqueos.',
         '**Solo se ofrecen horarios reales.** Los días y las horas salen de la agenda de quien atiende la propiedad y ya descuentan las citas confirmadas y los bloqueos.

**¿Prefieres otra fecha?** Debajo de los días de esta semana toca **Ver calendario completo**: se abre un mes con un **punto** en los días que tienen horarios libres, y puedes avanzar hasta tres meses. Elige un día y verás sus horas; para volver a los días de esta semana toca **Volver a esta semana**. Qué tan lejos se puede pedir depende de la agenda de quien atiende la propiedad.'),
       actualizado_en = now(), revisado_en = current_date
 where a.slug = 'como-solicitar-una-visita'
   and a.cuerpo like '%**Solo se ofrecen horarios reales.** Los días y las horas salen de la agenda de quien atiende la propiedad y ya descuentan las citas confirmadas y los bloqueos.%'
   and a.cuerpo not like '%Ver calendario completo%';

update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo,
         '**Ningún correo trae botones para confirmar, aceptar o cancelar.**',
         '**Si cancelas tú una cita,** también te llega el correo de cancelación, con un archivo de calendario (.ics) que puede retirarla de tu agenda. Algunos calendarios no aplican las cancelaciones por sí solos: revisa que la cita haya desaparecido.

**Ningún correo trae botones para confirmar, aceptar o cancelar.**'),
       actualizado_en = now(), revisado_en = current_date
 where a.slug = 'correos-de-tus-citas'
   and a.cuerpo like '%**Ningún correo trae botones para confirmar, aceptar o cancelar.**%'
   and a.cuerpo not like '%Si cancelas tú una cita%';

update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo,
         'lo que se registra para un cliente espera su confirmación.',
         'lo que se registra para un cliente espera su confirmación.

**Quién atiende cada propiedad.** En **Responsables de citas** (el botón de arriba, junto al calendario) ves quién atiende cada propiedad y de dónde viene: responsable asignado, el dueño, responsable del equipo o titular automático. Puedes asignar la propiedad a otra persona que atienda citas o elegir al responsable del equipo; cada cambio pide un **motivo** y queda en la bitácora. Si no hay responsable del equipo, atiende el administrador activo más antiguo; el Super Admin solo si no hay ningún administrador activo.

**Quién hizo cada cambio.** En el detalle de una cita, el historial dice **quién** hizo cada cambio (su nombre, no su identificador).'),
       actualizado_en = now(), revisado_en = current_date
 where a.slug = 'gestionar-las-citas-del-equipo'
   and a.cuerpo like '%lo que se registra para un cliente espera su confirmación.%'
   and a.cuerpo not like '%Responsables de citas%';

commit;
