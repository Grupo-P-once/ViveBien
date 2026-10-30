-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 50 — Cuentas de gasto editables + registro de reportes quincenales enviados
-- Reversa: 50-contabilidad-cuentas-editables-y-reportes.REVERTIR.sql
--
-- PREPARADA. Numeración provisional (adenda "por asignar"). Requiere la 48 (`contab_cuentas`, `contab_cuenta_cambiar`) y la 43 (`comision_auditoria_valida`).
-- Aplicar solo con autorización del propietario.
--
-- 1 · De una cuenta de gasto ahora también cambian el NOMBRE, el TIPO de gasto y el IDENTIFICADOR (antes solo `activa` y `notas`). Seguirá sin borrarse. Cambiar la cuenta NO toca
--     los movimientos ya registrados: cada uno conserva su propia categoría; solo cambia cómo se llama la cuenta al leerlos. El cambio se escribe en `audit_logs` (antes y después)
--     en la misma transacción. Un nombre+identificador que ya usa otra cuenta responde `ya_existe` (no se duplica).
-- 2 · `contab_reportes_enviados`: por cada quincena se reserva y se marca como enviado el reporte de Telegram, para que el cron (que corre varios días por si falló) no mande dos veces.
--     Solo se agrega; solo `service_role`. No guarda el contenido del reporte (sin cifras ni datos personales): solo qué quincena se envió y cuándo.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Cuentas editables ───────────────────────────────────────────────────────────────

create or replace function public.contab_cuentas_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una cuenta de gasto no se borra: se desactiva.' using errcode = '23514';
  end if;
  if (new.id, new.creado_por, new.creado_en) is distinct from (old.id, old.creado_por, old.creado_en) then
    raise exception 'De una cuenta de gasto no cambian su identidad, quién la creó ni cuándo.' using errcode = '23514';
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
    if k not in ('activa', 'notas', 'nombre', 'categoria', 'identificador') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;
  if p_cambios ? 'activa' and jsonb_typeof(p_cambios->'activa') is distinct from 'boolean' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  if p_cambios ? 'notas' and jsonb_typeof(p_cambios->'notas') not in ('string', 'null') then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  if p_cambios ? 'nombre' and jsonb_typeof(p_cambios->'nombre') is distinct from 'string' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  if p_cambios ? 'categoria' and jsonb_typeof(p_cambios->'categoria') is distinct from 'string' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  if p_cambios ? 'identificador' and jsonb_typeof(p_cambios->'identificador') not in ('string', 'null') then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  -- Mismo cuidado que al crear: ni correos ni números largos (datos personales) en el nombre o el identificador.
  if coalesce(p_cambios->>'nombre', '') ~ '@|[0-9]{12,}' or coalesce(p_cambios->>'identificador', '') ~ '@' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  begin
    update public.contab_cuentas
       set activa = case when p_cambios ? 'activa' then (p_cambios->>'activa')::boolean else activa end,
           notas = case when p_cambios ? 'notas' then nullif(btrim(coalesce(p_cambios->>'notas', '')), '') else notas end,
           nombre = case when p_cambios ? 'nombre' then btrim(p_cambios->>'nombre') else nombre end,
           categoria = case when p_cambios ? 'categoria' then p_cambios->>'categoria' else categoria end,
           identificador = case when p_cambios ? 'identificador' then nullif(btrim(coalesce(p_cambios->>'identificador', '')), '') else identificador end
     where id = p_id;
    get diagnostics filas = row_count;
  exception
    when unique_violation then
      return jsonb_build_object('resultado', 'ya_existe');
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

-- ── 2 · Reportes quincenales enviados ───────────────────────────────────────────────────

create table if not exists public.contab_reportes_enviados (
  tipo          text not null check (tipo in ('quincenal')),
  desde         date not null,
  hasta         date not null check (hasta >= desde),
  estado        text not null default 'reservado' check (estado in ('reservado', 'enviado')),
  origen        text not null check (origen in ('cron', 'manual')),
  reservado_en  timestamptz not null default now(),
  enviado_en    timestamptz,
  primary key (tipo, desde, hasta),
  constraint contab_reportes_envio_ck check ((estado = 'enviado') = (enviado_en is not null))
);

create or replace function public.contab_reportes_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'El registro de reportes enviados no se borra.' using errcode = '23514';
  end if;
  if (new.tipo, new.desde, new.hasta) is distinct from (old.tipo, old.desde, old.hasta) or (old.estado = 'enviado' and new.estado is distinct from 'enviado') then
    raise exception 'Un reporte enviado no se modifica.' using errcode = '23514';
  end if;
  return new;
end $f$;

create or replace trigger contab_reportes_sin_cambios_de_fondo before update or delete on public.contab_reportes_enviados
  for each row execute function public.contab_reportes_guardia();

create or replace function public.contab_reportes_sin_vaciar() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  raise exception 'El registro de reportes enviados no se vacía.' using errcode = '23514';
end $f$;

create or replace trigger contab_reportes_sin_vaciar before truncate on public.contab_reportes_enviados
  for each statement execute function public.contab_reportes_sin_vaciar();

-- Reserva una quincena para enviarla. `ok` = adelante; `ya_enviado` = ya salió; `en_curso` = otra corrida la reservó hace menos de 10 minutos.
create or replace function public.contab_reporte_reservar(p_tipo text, p_desde date, p_hasta date, p_origen text) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  actual text;
begin
  begin
    insert into public.contab_reportes_enviados (tipo, desde, hasta, origen) values (p_tipo, p_desde, p_hasta, p_origen);
    return jsonb_build_object('resultado', 'ok');
  exception
    when unique_violation then null;
    when check_violation then raise exception 'cambio_invalido' using errcode = '22023';
  end;
  update public.contab_reportes_enviados
     set reservado_en = now(), origen = p_origen
   where tipo = p_tipo and desde = p_desde and hasta = p_hasta and estado = 'reservado' and reservado_en < now() - interval '10 minutes';
  if found then
    return jsonb_build_object('resultado', 'ok');
  end if;
  select estado into actual from public.contab_reportes_enviados where tipo = p_tipo and desde = p_desde and hasta = p_hasta;
  return jsonb_build_object('resultado', case when actual = 'enviado' then 'ya_enviado' else 'en_curso' end);
end;
$fn$;

create or replace function public.contab_reporte_marcar_enviado(p_tipo text, p_desde date, p_hasta date) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  update public.contab_reportes_enviados set estado = 'enviado', enviado_en = now()
   where tipo = p_tipo and desde = p_desde and hasta = p_hasta and estado = 'reservado';
  return jsonb_build_object('resultado', case when found then 'ok' else 'no_reservado' end);
end;
$fn$;

alter table public.contab_reportes_enviados enable row level security;
revoke all on public.contab_reportes_enviados from public, anon, authenticated;
revoke all on public.contab_reportes_enviados from service_role;
grant select, insert, update on public.contab_reportes_enviados to service_role;

revoke execute on function public.contab_reporte_reservar(text, date, date, text) from public, anon, authenticated;
revoke execute on function public.contab_reporte_marcar_enviado(text, date, date) from public, anon, authenticated;
grant execute on function public.contab_reporte_reservar(text, date, date, text) to service_role;
grant execute on function public.contab_reporte_marcar_enviado(text, date, date) to service_role;

commit;
