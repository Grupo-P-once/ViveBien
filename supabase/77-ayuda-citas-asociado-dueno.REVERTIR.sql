-- Reversa de 77: devuelve las dos frases a como las dejó la migración 74. Idempotente.
begin;

update public.knowledge_articles a
   set cuerpo = replace(
         a.cuerpo,
         '**Un asociado dueño de la propiedad** (con el permiso de recibir citas), cuando la visita la coordina otra persona, ve **tu nombre, tu teléfono y las notas que escribiste para la visita**, solo para consultarlas; **no ve tu correo**, salvo el permiso aparte, ni las notas internas del equipo. **Un publicador dueño de la propiedad sin ese permiso** solo ve que hay una cita y su estado, **sin tu nombre, teléfono, correo ni notas**.',
         '**Un publicador dueño de la propiedad** (cuando la visita la coordina VIVE BIEN) solo ve que hay una cita y su estado, **sin tu nombre, teléfono, correo ni notas**.'),
       actualizado_en = now()
 where a.cuerpo like '%**Un asociado dueño de la propiedad** (con el permiso de recibir citas), cuando la visita la coordina otra persona%';

update public.knowledge_articles a
   set cuerpo = replace(
         a.cuerpo,
         'Si eres **asociado** (con el permiso de recibir citas) y la visita de tu propiedad la coordina otra persona, ves igualmente **nombre, teléfono y notas**, solo para consultarlas. Si eres **publicador** sin ese permiso y la visita la coordina VIVE BIEN, no ves ningún dato del cliente.',
         'Si eres **publicador** y la visita la coordina VIVE BIEN, no ves ningún dato del cliente.'),
       actualizado_en = now()
 where a.cuerpo like '%Si eres **asociado** (con el permiso de recibir citas) y la visita de tu propiedad la coordina otra persona%';

commit;
