-- Reversa de 56-contabilidad-aportacion-recibida-del-grupo.sql.
-- OJO: falla si ya existen movimientos de clase `aportacion_recibida_grupo` (las restricciones de la 53 no los admiten). Antes habría que anularlos y decidir con el contador
-- dónde quedan; el libro no se borra. La función vuelve a la de la 53 volviendo a aplicar `53-contabilidad-aportaciones-al-grupo.sql` (idempotente).
begin;

alter table public.contab_movimientos drop constraint contab_movimientos_clase_ck;
alter table public.contab_movimientos drop constraint contab_movimientos_categoria_check;
alter table public.contab_movimientos drop constraint contab_movimientos_clase_check;

alter table public.contab_movimientos add constraint contab_movimientos_clase_check check (clase in ('gasto', 'ingreso_extra', 'devolucion', 'anulacion', 'aportacion_grupo', 'pago_colaborador'));
alter table public.contab_movimientos add constraint contab_movimientos_categoria_check
  check (categoria in ('publicidad_digital', 'publicidad_impresa', 'fotografia_video', 'gestoria_legal', 'software_suscripciones', 'transporte', 'oficina',
                       'honorarios_externos', 'comision_externa', 'impuestos_derechos', 'otro', 'ingreso_extra', 'aportacion_grupo', 'pago_colaborador'));
alter table public.contab_movimientos add constraint contab_movimientos_clase_ck check (
  (clase = 'gasto' and sentido = 'sale' and reverso_de is null and categoria not in ('ingreso_extra', 'aportacion_grupo', 'pago_colaborador'))
  or (clase = 'ingreso_extra' and sentido = 'entra' and reverso_de is null and categoria = 'ingreso_extra')
  or (clase = 'aportacion_grupo' and sentido = 'sale' and reverso_de is null and categoria = 'aportacion_grupo')
  or (clase = 'pago_colaborador' and sentido = 'sale' and reverso_de is null and categoria = 'pago_colaborador' and operacion_id is not null)
  or (clase in ('devolucion', 'anulacion') and reverso_de is not null and motivo is not null)
);
commit;
