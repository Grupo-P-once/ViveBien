-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 49 — Notas del contador: lo que se le agrega al asesor de contabilidad sin desplegar código
-- Reversa: 49-contabilidad-notas-del-contador.REVERTIR.sql
--
-- PREPARADA. Numeración provisional (adenda "por asignar"). Requiere la 43 (`comision_auditoria_valida`). Aplicar solo con autorización del propietario.
--
-- La base de conocimiento del asesor de IA vive en el código y tiene fecha de corte. La ley y los criterios del SAT cambian por fuera: aquí el Super Admin (con su contador)
-- registra NOTAS (un criterio nuevo, un plazo que cambió, una cifra actualizada). El asesor las lee en cada consulta; si contradicen la base, prevalecen.
--  · Solo se agrega: una nota no se edita ni se borra. Para corregirla se RETIRA (con motivo) y se registra otra: queda el historial de qué se le dijo al asesor y cuándo.
--  · Máximo 30 notas vigentes (el asesor lee todas en cada consulta). La nota no admite correos ni números de 10 o más dígitos (datos personales).
--  · Registrar y retirar escriben `audit_logs` en la misma transacción. Solo `service_role` (el servidor, tras validar que es Super Admin) puede leer y escribir.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.contab_conocimiento (
  id                  uuid primary key default gen_random_uuid(),
  titulo              text not null check (char_length(btrim(titulo)) between 3 and 120),
  tema                text not null check (tema in ('fiscal', 'contable', 'pld', 'inmobiliario', 'vivebien', 'otro')),
  texto               text not null check (char_length(btrim(texto)) between 10 and 1200),
  vigente_desde       date not null default current_date check (vigente_desde >= date '2000-01-01'),
  retirada            boolean not null default false,
  retirada_por        text,
  retirada_en         timestamptz,
  retirada_motivo     text check (retirada_motivo is null or char_length(btrim(retirada_motivo)) between 10 and 300),
  clave_idempotencia  text not null unique check (char_length(clave_idempotencia) between 8 and 100),
  creado_por          text not null check (char_length(creado_por) between 3 and 200),
  creado_en           timestamptz not null default now(),
  constraint contab_conocimiento_retiro_ck check (
    (not retirada and retirada_por is null and retirada_en is null and retirada_motivo is null)
    or (retirada and retirada_por is not null and retirada_en is not null and retirada_motivo is not null)
  )
);

create index if not exists contab_conocimiento_vigentes on public.contab_conocimiento (vigente_desde desc) where not retirada;

-- Guardias: solo cambia el retiro, y solo de «vigente» a «retirada»; nunca se borra ni se vacía.
create or replace function public.contab_conocimiento_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una nota del contador no se borra: se retira.' using errcode = '23514';
  end if;
  if (new.id, new.titulo, new.tema, new.texto, new.vigente_desde, new.clave_idempotencia, new.creado_por, new.creado_en)
     is distinct from (old.id, old.titulo, old.tema, old.texto, old.vigente_desde, old.clave_idempotencia, old.creado_por, old.creado_en) then
    raise exception 'Una nota del contador no se edita: se retira y se registra otra.' using errcode = '23514';
  end if;
  if old.retirada and not new.retirada then
    raise exception 'Una nota retirada no vuelve.' using errcode = '23514';
  end if;
  return new;
end $f$;

create or replace trigger contab_conocimiento_sin_ediciones before update or delete on public.contab_conocimiento
  for each row execute function public.contab_conocimiento_guardia();

create or replace function public.contab_conocimiento_sin_vaciar() returns trigger
language plpgsql set search_path = public, pg_temp as $f$
begin
  raise exception 'Este registro solo se agrega: no se vacía.' using errcode = '23514';
end $f$;

create or replace trigger contab_conocimiento_sin_vaciar before truncate on public.contab_conocimiento
  for each statement execute function public.contab_conocimiento_sin_vaciar();

create or replace function public.contab_nota_registrar(p_datos jsonb, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  k text; nuevo_id uuid; v_desde date; ya public.contab_conocimiento%rowtype; v_texto text; v_titulo text;
begin
  if not public.comision_auditoria_valida(p_audit) or jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_datos) loop
    if k not in ('titulo', 'tema', 'texto', 'vigente_desde', 'clave_idempotencia', 'creado_por') then
      raise exception 'cambio_invalido' using errcode = '22023';
    end if;
  end loop;
  v_texto := btrim(coalesce(p_datos->>'texto', ''));
  v_titulo := btrim(coalesce(p_datos->>'titulo', ''));
  if v_texto ~ '@|[0-9]{10,}' or v_titulo ~ '@|[0-9]{10,}' then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  begin
    v_desde := coalesce(nullif(p_datos->>'vigente_desde', '')::date, current_date);
  exception when others then
    raise exception 'cambio_invalido' using errcode = '22023';
  end;
  if v_desde < date '2000-01-01' or v_desde > current_date + 1 then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  if (select count(*) from public.contab_conocimiento where not retirada) >= 30
     and not exists (select 1 from public.contab_conocimiento where clave_idempotencia = p_datos->>'clave_idempotencia') then
    return jsonb_build_object('resultado', 'tope', 'maximo', 30);
  end if;

  begin
    insert into public.contab_conocimiento (titulo, tema, texto, vigente_desde, clave_idempotencia, creado_por)
    values (v_titulo, p_datos->>'tema', v_texto, v_desde, p_datos->>'clave_idempotencia', p_datos->>'creado_por')
    returning id into nuevo_id;
  exception
    when unique_violation then
      select * into ya from public.contab_conocimiento where clave_idempotencia = p_datos->>'clave_idempotencia';
      if ya.titulo = v_titulo and ya.texto = v_texto and ya.tema = p_datos->>'tema' then
        return jsonb_build_object('resultado', 'repetida', 'id', ya.id);
      end if;
      return jsonb_build_object('resultado', 'clave_en_uso');
    when check_violation or invalid_text_representation or not_null_violation then
      raise exception 'cambio_invalido' using errcode = '22023';
  end;

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'contab_conocimiento', nuevo_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok', 'id', nuevo_id);
end;
$fn$;

create or replace function public.contab_nota_retirar(p_id uuid, p_motivo text, p_por text, p_audit jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  nota public.contab_conocimiento%rowtype;
begin
  if not public.comision_auditoria_valida(p_audit) then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 10 and 300 or char_length(btrim(coalesce(p_por, ''))) < 3 then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;
  select * into nota from public.contab_conocimiento where id = p_id;
  if not found then return jsonb_build_object('resultado', 'no_existe'); end if;
  if nota.retirada then return jsonb_build_object('resultado', 'ya_retirada'); end if;

  update public.contab_conocimiento set retirada = true, retirada_por = btrim(p_por), retirada_en = now(), retirada_motivo = btrim(p_motivo)
   where id = p_id and not retirada;

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol', p_audit->>'accion', 'contab_conocimiento', p_id::text, p_audit->'antes', p_audit->'despues');
  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

alter table public.contab_conocimiento enable row level security;
revoke all on public.contab_conocimiento from public, anon, authenticated;
revoke all on public.contab_conocimiento from service_role;
grant select, insert, update on public.contab_conocimiento to service_role;

revoke execute on function public.contab_nota_registrar(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.contab_nota_retirar(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.contab_nota_registrar(jsonb, jsonb) to service_role;
grant execute on function public.contab_nota_retirar(uuid, text, text, jsonb) to service_role;

commit;
