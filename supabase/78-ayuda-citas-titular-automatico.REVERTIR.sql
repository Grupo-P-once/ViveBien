-- Reversa de 78: devuelve las dos frases a como las dejó la 74c. Idempotente.
begin;

update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo, 'y si el dueño es un **publicador**, las atiende **VIVE BIEN**: el responsable del equipo y, si no hay ninguno configurado, el **administrador activo más antiguo**.

Solo si no existe ningún administrador activo, **no se puede agendar en línea**: el sistema no se la asigna a otra persona al azar.',
                        'y si el dueño es un **publicador**, las atiende **VIVE BIEN**, a través del responsable del equipo.

Si nadie puede atender una propiedad, **no se puede agendar en línea**: el sistema no se la asigna a otra persona al azar.'),
       actualizado_en = now()
 where a.cuerpo like '%administrador activo más antiguo**.%Solo si no existe ningún administrador activo%';

update public.knowledge_articles a
   set cuerpo = replace(a.cuerpo, 'Las de un **publicador** las atiende VIVE BIEN (el responsable del equipo configurado y, si no hay, el administrador activo más antiguo); él las consulta sin acciones. Solo cambia si un administrador **asigna** la propiedad a otra persona que pueda atender citas. Solo si no existe ningún administrador activo, esas propiedades no se pueden agendar.',
                        'Las de un **publicador** las atiende VIVE BIEN (el responsable del equipo configurado); él las consulta sin acciones. Solo cambia si un administrador **asigna** la propiedad a otra persona que pueda atender citas. Si no hay responsable del equipo configurado, esas propiedades no se pueden agendar.'),
       actualizado_en = now()
 where a.cuerpo like '%Solo si no existe ningún administrador activo, esas propiedades no se pueden agendar.%';

commit;
