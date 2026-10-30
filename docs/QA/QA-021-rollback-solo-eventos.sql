-- QA-021 · ROLLBACK del BORRADO EJECUTADO (solo `eventos`). Reinserta las 25 filas con sus ids, sesiones y fechas originales.
-- ESTADO: PREPARADO, **NO EJECUTADO**. Aplica al borrado de QA-021-borrado-ejecutado.sql, que NO tocó `propiedades.vistas` (sigue en 27).
-- (QA-021-rollback.sql, el original, asume que la corrección también bajó `vistas` a 2 y por eso aborta si vale 27.)
-- Generado por scripts/qa/generar-qa021-rollback.py desde docs/QA/QA-021-filas.csv. Huella de los ids: 754d2d75ec7437ee.

begin;

do $$
declare n int;
begin
  select count(*) into n from public.eventos where id between 188 and 212;
  if n <> 0 then raise exception 'QA-021 rollback: ya hay % filas con ids 188-212 — se aborta sin cambios', n; end if;
end $$;

insert into public.eventos (id, nombre, uid, sesion, propiedad_id, datos, creado_en) overriding system value values
  (188, 'property_view', null, 's-muxmpcra-4z26wfgz', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 04:49:58.875103+00'),
  (189, 'property_view', null, 's-muxmpkn7-nxx1mqu4', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 04:50:09.081043+00'),
  (190, 'property_view', null, 's-muxmpspv-20ng1nq9', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 04:50:19.58422+00'),
  (191, 'property_view', null, 's-muxmq14w-qd9z4lik', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 04:50:30.511142+00'),
  (192, 'property_view', null, 's-muxmqhpn-8d543924', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 04:50:51.866483+00'),
  (193, 'property_view', null, 's-muxmqpd1-33qdlrj6', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 04:51:01.764089+00'),
  (194, 'property_view', null, 's-muxmqx2w-uc5esp3o', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 04:51:11.777558+00'),
  (195, 'property_view', null, 's-muxmr528-d7cd70o4', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 04:51:22.162835+00'),
  (196, 'property_view', null, 's-muxo4h3s-786x2k27', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 05:29:43.960717+00'),
  (197, 'property_view', null, 's-muxo4qyy-z39zp4c3', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 05:29:56.633604+00'),
  (198, 'property_view', null, 's-muxo50nc-jh873vpm', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 05:30:09.182414+00'),
  (199, 'property_view', null, 's-muxo5bn6-kq3szbii', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 05:30:23.544172+00'),
  (200, 'property_view', null, 's-muxrjlo2-ugitzjh9', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:05:29.452597+00'),
  (201, 'property_view', null, 's-muxrk5m6-mxha32op', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:05:55.058088+00'),
  (202, 'property_view', null, 's-muxrksis-ezsae9ad', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:06:24.170672+00'),
  (203, 'property_view', null, 's-muxrt9bv-81wx2a45', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:12:59.358077+00'),
  (204, 'property_view', null, 's-muxrtm6u-lrn78or0', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:13:16.005894+00'),
  (205, 'property_view', null, 's-muxrtwgh-u6xfktqp', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:13:29.06726+00'),
  (206, 'property_view', null, 's-muxrzwoj-dtrl54r8', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:18:09.710181+00'),
  (207, 'property_view', null, 's-muxs0e33-04eyt05d', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:18:32.509651+00'),
  (208, 'property_view', null, 's-muxs0qoq-nt5szais', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:18:48.198425+00'),
  (209, 'property_view', null, 's-muxs7p3b-jxa4sbhq', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:24:13.240743+00'),
  (210, 'property_view', null, 's-muxs82p1-zcjy7l7g', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:24:30.65974+00'),
  (211, 'property_view', null, 's-muxs8fr5-vrbcmgwh', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:24:47.325419+00'),
  (212, 'property_view', null, 's-muxsczw2-n69zncdd', '5243dab0-e301-4ce1-a5de-f5f57037e613', null, '2026-10-07 07:28:20.05478+00');

do $$
declare n int; huella text;
begin
  select count(*), md5(string_agg(id::text || '|' || sesion || '|' || creado_en::text, ',' order by id)) into n, huella
  from public.eventos where id between 188 and 212;
  if n <> 25 or huella <> 'c598d968665adfa4450770a43a300682' then raise exception 'QA-021 rollback: la reinserción no reproduce las filas originales (n=%, huella=%)', n, huella; end if;
end $$;

commit;
