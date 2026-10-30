-- ═══════════════════════════════════════════════════════════════
-- Datos COMPLETAMENTE INVENTADOS para las pruebas de la migración 26.
--
-- Ni un dato real: los correos usan el TLD reservado `.invalid` (RFC 2606),
-- los teléfonos son 477 000 00xx y los nombres son de ficción.
-- ═══════════════════════════════════════════════════════════════

insert into public.usuarios (uid, email, nombre, telefono, whatsapp, rol, estado,
  inmobiliaria, biografia, zonas, busca_operacion, busca_zonas, busca_tipos,
  presupuesto_max, completitud, bienvenida_vista, foto_url) values
 ('u-cliente',  'ana.ficticia@ejemplo.invalid',   'Ana Ficticia',   '4770000001','4770000001','cliente','activo',
   null,null,null,'ambas',array['Centro'],array['casa'],3000000,70,true,'https://ejemplo.invalid/foto.jpg'),
 ('u-cliente-2','bruno.ficticio@ejemplo.invalid', 'Bruno Ficticio', '4770000002',null,'cliente','activo',
   null,null,null,null,null,null,null,10,false,null),
 ('u-publicador','carla.ficticia@ejemplo.invalid','Carla Ficticia', '4770000003','4770000003','publicador','activo',
   'Inmobiliaria Inventada','Vendo casas de mentira',array['Centro','Norte'],null,null,null,null,80,true,null),
 ('u-admin',    'dario.ficticio@ejemplo.invalid', 'Darío Ficticio', '4770000004',null,'admin','activo',
   null,null,null,null,null,null,null,90,true,null),
 ('u-super-1',  'elsa.ficticia@ejemplo.invalid',  'Elsa Ficticia',  '4770000005',null,'super_admin','activo',
   null,null,null,null,null,null,null,100,true,null),
 ('u-super-2',  'fabio.ficticio@ejemplo.invalid', 'Fabio Ficticio', '4770000006',null,'super_admin','activo',
   null,null,null,null,null,null,null,100,true,null);

-- Propiedades del publicador: publicadas y revisadas por el admin (su CORREO).
insert into public.propiedades (id, titulo, estatus, estado_pub, owner_id, revisado_por, folio, slug, publicada_en) values
 ('p-1','Casa Inventada Uno','disponible','publicada','u-publicador','dario.ficticio@ejemplo.invalid','FOL-0001','casa-inventada-uno', now()),
 ('p-2','Casa Inventada Dos','disponible','publicada','u-publicador','dario.ficticio@ejemplo.invalid','FOL-0002','casa-inventada-dos', now()),
 ('p-3','Casa Sin Dueño',    'disponible','publicada', null,          null,                             'FOL-0003','casa-sin-dueno',     now());

-- Cita: la clienta con el publicador como asesor. Con texto libre dentro.
insert into public.citas (id, propiedad_id, cliente_uid, asesor_uid, inicio, fin, ocupa_desde, ocupa_hasta,
  estado, cliente_nombre, cliente_telefono, cliente_email, consentimiento_version, notas_cliente,
  propuesta_por, creada_por, clave_idempotencia) values
 ('11111111-1111-1111-1111-111111111111','p-1','u-cliente','u-publicador',
  now() + interval '3 days', now() + interval '3 days 1 hour',
  now() + interval '3 days' - interval '15 min', now() + interval '3 days 1 hour 15 min',
  'CONFIRMED','Ana Ficticia','4770000001','ana.ficticia@ejemplo.invalid','v1',
  'Llámenme al 477 000 0001, vivo en Calle Inventada 5','cliente','u-cliente','idem-0000001');

insert into public.citas_eventos (cita_id, tipo, actor_uid, actor_rol, via) values
 ('11111111-1111-1111-1111-111111111111','creada','u-cliente','cliente','panel');

-- Solicitudes de contacto: una de la clienta (se bloquea) y otra de alguien más.
insert into public.solicitudes_contacto (cliente_uid, propiedad_id, owner_id, nombre, telefono, email,
  mensaje, tipo, consentimiento_version, origen) values
 ('u-cliente',  'p-1','u-publicador','Ana Ficticia',  '4770000001','ana.ficticia@ejemplo.invalid',
  'Me interesa, escríbanme al 477 000 0001','informacion','v1','ficha'),
 ('u-cliente-2','p-2','u-publicador','Bruno Ficticio','4770000002','bruno.ficticio@ejemplo.invalid',
  'Quiero verla el sábado','visita','v1','ficha');

-- Preferencias y agenda.
insert into public.favoritos (uid, propiedad_id) values ('u-cliente','p-1'), ('u-cliente','p-2'), ('u-cliente-2','p-1');
insert into public.busquedas_guardadas (uid, nombre, filtros, alertas) values
 ('u-cliente','Casas en el Centro','{"op":"venta"}'::jsonb, true),
 ('u-cliente-2','Lo que sea','{"op":"renta"}'::jsonb, false);
insert into public.google_oauth_estados (hash, uid, verificador_cifrado, expira_en) values
 ('hash-inventado-1','u-publicador','cifrado-inventado', now() + interval '10 min');
insert into public.calendarios_google (asesor_uid, google_email, refresh_token_cifrado, alcances) values
 ('u-publicador','carla.ficticia@ejemplo.invalid','token-cifrado-inventado', array['calendar']);
insert into public.disponibilidad_asesores (asesor_uid, dia_semana, desde, hasta) values
 ('u-publicador', 1, '09:00', '18:00');
insert into public.bloqueos_asesores (asesor_uid, desde, hasta, motivo) values
 ('u-publicador', now() + interval '10 days', now() + interval '11 days', 'vacaciones inventadas');
insert into public.ajustes_citas (asesor_uid) values ('u-publicador');

-- Invitaciones: una pendiente para el correo de la clienta (¡la que elevaría
-- a una cuenta nueva!), una pendiente para otro, y una ya aceptada.
insert into public.invitaciones (email, rol, estado, invitado_por, aceptada_por) values
 ('ana.ficticia@ejemplo.invalid','admin','pendiente','u-super-1', null),
 ('zoe.ficticia@ejemplo.invalid','publicador','pendiente','u-super-1', null),
 ('dario.ficticio@ejemplo.invalid','admin','aceptada','u-super-1','u-admin');

-- Analítica y bitácoras.
insert into public.eventos (nombre, uid, sesion, propiedad_id) values
 ('property_view','u-cliente','ses-1','p-1'), ('property_view', null,'ses-2','p-2');
insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id) values
 ('u-cliente','ana.ficticia@ejemplo.invalid','cliente','propiedad.favorito','propiedad','p-1'),
 ('u-admin','dario.ficticio@ejemplo.invalid','admin','usuario.editar','usuario','u-cliente');
insert into public.configuracion (clave, valor, actualizado_por) values
 ('flags','{"portalCliente":false}'::jsonb,'u-super-1');
