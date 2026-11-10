-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 77 — Ayuda pública de citas: qué ve el asociado dueño (10-nov-2026)
-- Va DESPUÉS de 74 y del código de la decisión 1 del dueño (9-nov-2026). Idempotente. Reversa: 77-ayuda-citas-asociado-dueno.REVERTIR.sql
--
-- ESTADO: PREPARADA. NO aplicada en ningún entorno. Va junto con la versión 2026-11-10 del Aviso de Privacidad, que es un BORRADOR sujeto a aprobación del abogado:
-- NO aplicar antes de esa aprobación ni antes de publicar el código.
--
-- QUÉ HACE: una sola frase del artículo público de «datos compartidos» (74) decía que el publicador dueño, cuando la visita la coordina VIVE BIEN, no ve nombre,
-- teléfono, correo ni notas. Desde la decisión 1 eso solo vale para el publicador SIN el permiso de recibir citas; el asociado dueño sí ve nombre, teléfono y notas
-- (solo lectura). Un UPDATE con la frase exacta: repetirlo no cambia nada (ya no la encuentra). Formato del visor: solo párrafos, **negritas** y enlaces.
-- ═══════════════════════════════════════════════════════════════

begin;

update public.knowledge_articles a
   set cuerpo = replace(
         a.cuerpo,
         '**Un publicador dueño de la propiedad** (cuando la visita la coordina VIVE BIEN) solo ve que hay una cita y su estado, **sin tu nombre, teléfono, correo ni notas**.',
         '**Un asociado dueño de la propiedad** (con el permiso de recibir citas), cuando la visita la coordina otra persona, ve **tu nombre, tu teléfono y las notas que escribiste para la visita**, solo para consultarlas; **no ve tu correo**, salvo el permiso aparte, ni las notas internas del equipo. **Un publicador dueño de la propiedad sin ese permiso** solo ve que hay una cita y su estado, **sin tu nombre, teléfono, correo ni notas**.'),
       actualizado_en = now(),
       revisado_en = current_date
  from public.knowledge_categories c
 where c.id = a.categoria_id
   and a.cuerpo like '%**Un publicador dueño de la propiedad** (cuando la visita la coordina VIVE BIEN) solo ve que hay una cita y su estado%';

update public.knowledge_articles a
   set cuerpo = replace(
         a.cuerpo,
         'Si eres **publicador** y la visita la coordina VIVE BIEN, no ves ningún dato del cliente.',
         'Si eres **asociado** (con el permiso de recibir citas) y la visita de tu propiedad la coordina otra persona, ves igualmente **nombre, teléfono y notas**, solo para consultarlas. Si eres **publicador** sin ese permiso y la visita la coordina VIVE BIEN, no ves ningún dato del cliente.'),
       actualizado_en = now(),
       revisado_en = current_date
 where a.cuerpo like '%Si eres **publicador** y la visita la coordina VIVE BIEN, no ves ningún dato del cliente.%';

commit;
