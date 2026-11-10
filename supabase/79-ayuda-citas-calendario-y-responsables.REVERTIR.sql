-- Reversa de 79: quita los párrafos y deja las tres frases como las dejó la 74/74c. Idempotente.
begin;

update public.knowledge_articles a
   set cuerpo = replace(replace(a.cuerpo,
         '

**¿Prefieres otra fecha?** Debajo de los días de esta semana toca **Ver calendario completo**: se abre un mes con un **punto** en los días que tienen horarios libres, y puedes avanzar hasta tres meses. Elige un día y verás sus horas; para volver a los días de esta semana toca **Volver a esta semana**. Qué tan lejos se puede pedir depende de la agenda de quien atiende la propiedad.',
         ''),
         'tócala y se despliegan los días con horarios de **esta semana** y sus horas. Elige una, marca la casilla',
         'tócala y se despliegan los días y las horas disponibles. Elige una, marca la casilla'),
       actualizado_en = now()
 where a.slug = 'como-solicitar-una-visita' and a.cuerpo like '%Ver calendario completo%';

update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo,
         '**Si cancelas tú una cita,** también te llega el correo de cancelación, con un archivo de calendario (.ics) que puede retirarla de tu agenda. Algunos calendarios no aplican las cancelaciones por sí solos: revisa que la cita haya desaparecido.

',
         ''),
       actualizado_en = now()
 where a.slug = 'correos-de-tus-citas' and a.cuerpo like '%Si cancelas tú una cita%';

update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo,
         '

**Quién atiende cada propiedad.** En **Responsables de citas** (el botón de arriba, junto al calendario) ves quién atiende cada propiedad y de dónde viene: responsable asignado, el dueño, responsable del equipo o titular automático. Puedes asignar la propiedad a otra persona que atienda citas o elegir al responsable del equipo; cada cambio pide un **motivo** y queda en la bitácora. Si no hay responsable del equipo, atiende el administrador activo más antiguo; el Super Admin solo si no hay ningún administrador activo.

**Quién hizo cada cambio.** En el detalle de una cita, el historial dice **quién** hizo cada cambio (su nombre, no su identificador).',
         ''),
       actualizado_en = now()
 where a.slug = 'gestionar-las-citas-del-equipo' and a.cuerpo like '%Responsables de citas%';

commit;
