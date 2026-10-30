-- Reversa de 50-contabilidad-cuentas-editables-y-reportes.sql: quita el registro de reportes y devuelve a las cuentas su regla anterior (solo `activa` y `notas` cambian).
-- OJO: se PIERDE el registro de qué quincenas se enviaron (el cron podría volver a mandar la última). La bitácora (`audit_logs`) se conserva.
-- Si alguna cuenta ya fue renombrada, la regla anterior no la deshace: queda con el nombre nuevo.

begin;

drop function if exists public.contab_reporte_marcar_enviado(text, date, date);
drop function if exists public.contab_reporte_reservar(text, date, date, text);
drop table if exists public.contab_reportes_enviados;
drop function if exists public.contab_reportes_guardia();
drop function if exists public.contab_reportes_sin_vaciar();

create or replace function public.contab_cuentas_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una cuenta de gasto no se borra: se desactiva.' using errcode = '23514';
  end if;
  if (new.id, new.nombre, new.categoria, new.identificador, new.creado_por, new.creado_en)
     is distinct from (old.id, old.nombre, old.categoria, old.identificador, old.creado_por, old.creado_en) then
    raise exception 'De una cuenta de gasto solo cambian las notas y si está activa.' using errcode = '23514';
  end if;
  return new;
end $f$;

create or replace function public.contab_cuenta_cambiar(p_id uuid, p_cambios jsonb, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  k text; filas integer;
begin
  if not public.comision_auditoria_valida(p_audit) or jsonb_typeof(p_cambios) is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_cambios) loop
    if k not in ('activa', 'notas') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;
  if p_cambios ? 'activa' and jsonb_typeof(p_cambios->'activa') is distinct from 'boolean' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  if p_cambios ? 'notas' and jsonb_typeof(p_cambios->'notas') not in ('string', 'null') then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  begin
    update public.contab_cuentas
       set activa = case when p_cambios ? 'activa' then (p_cambios->>'activa')::boolean else activa end,
           notas = case when p_cambios ? 'notas' then nullif(btrim(coalesce(p_cambios->>'notas', '')), '') else notas end
     where id = p_id;
    get diagnostics filas = row_count;
  exception
    when check_violation then
      raise exception 'cambio_invalido' using errcode = '22023';
  end;
  if filas = 0 then
    return jsonb_build_object('resultado', 'no_existe');
  end if;
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'contab_cuentas', p_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

commit;
