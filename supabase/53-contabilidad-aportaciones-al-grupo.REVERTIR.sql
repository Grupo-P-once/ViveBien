-- Reversa de 53-contabilidad-aportaciones-al-grupo.sql.
-- OJO: falla si ya existen movimientos de clase `aportacion_grupo` o `pago_colaborador` (las restricciones viejas no los admiten). Antes habría que anularlos y decidir con el contador
-- dónde quedan; el libro no se borra. La función vuelve a la de la migración 48.
begin;

alter table public.contab_movimientos drop constraint contab_movimientos_clase_ck;
alter table public.contab_movimientos drop constraint contab_movimientos_categoria_check;
alter table public.contab_movimientos drop constraint contab_movimientos_clase_check;

alter table public.contab_movimientos add constraint contab_movimientos_clase_check check (clase in ('gasto', 'ingreso_extra', 'devolucion', 'anulacion'));
alter table public.contab_movimientos add constraint contab_movimientos_categoria_check
  check (categoria in ('publicidad_digital', 'publicidad_impresa', 'fotografia_video', 'gestoria_legal', 'software_suscripciones', 'transporte', 'oficina',
                       'honorarios_externos', 'comision_externa', 'impuestos_derechos', 'otro', 'ingreso_extra'));
alter table public.contab_movimientos add constraint contab_movimientos_clase_ck check (
  (clase = 'gasto' and sentido = 'sale' and reverso_de is null and categoria <> 'ingreso_extra')
  or (clase = 'ingreso_extra' and sentido = 'entra' and reverso_de is null and categoria = 'ingreso_extra')
  or (clase in ('devolucion', 'anulacion') and reverso_de is not null and motivo is not null)
);

-- La función de la 48 se restaura volviendo a aplicar `48-contabilidad-comisiones.sql` (es idempotente y la define de nuevo).
commit;
