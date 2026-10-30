-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 39 — Propuesta de comisión: textos versionados y aceptaciones (Etapa B del motor de comisiones)
-- Reversa: 39-comision-textos-y-aceptaciones.REVERTIR.sql
--
-- PREPARADA, NO APLICADA. Aplicar solo con autorización del propietario. No hace nada visible por sí sola: el código solo
-- pide aceptar una propuesta cuando el flag `commissionEngine` está encendido Y existe un texto en estado «vigente».
-- NO incluye ningún texto: el contenido jurídico lo redacta y revisa un abogado (D-19) y se inserta aparte.
--
-- Dos tablas NUEVAS, solo del servidor (RLS activada, SIN políticas, sin permisos para anon ni authenticated):
--  · comision_textos       — versiones de la propuesta. Un texto nace en «borrador», NO puede pasar a «vigente» sin
--                            `revisado_por_abogado = true`, y una vez vigente no se edita (solo se retira). Solo hay UN vigente a la vez.
--                            El hash SHA-256 del cuerpo lo calcula la BASE (no el navegador ni la app).
--  · comision_aceptaciones — quién aceptó qué versión y cuándo (con el hash que vio). Solo se AGREGA: no se edita ni se borra.
--                            Una persona acepta una versión una sola vez. La base comprueba que el texto sea el vigente.
-- Idempotente (create … if not exists / create or replace).
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.comision_textos (
  id                    uuid primary key default gen_random_uuid(),
  version               text not null unique check (char_length(version) between 1 and 40),
  titulo                text not null check (char_length(titulo) between 3 and 200),
  cuerpo                text not null check (char_length(cuerpo) between 50 and 20000),
  hash                  text not null default '',
  estado                text not null default 'borrador' check (estado in ('borrador', 'vigente', 'retirado')),
  revisado_por_abogado  boolean not null default false,
  creado_por            text not null check (char_length(creado_por) between 3 and 200),
  creado_en             timestamptz not null default now(),
  vigente_desde         timestamptz
);

-- Un solo texto vigente a la vez.
create unique index if not exists comision_textos_un_vigente on public.comision_textos ((true)) where estado = 'vigente';

create or replace function public.comision_textos_guardia() returns trigger language plpgsql as $f$
begin
  if tg_op = 'INSERT' then
    new.hash := encode(sha256(convert_to(new.cuerpo, 'UTF8')), 'hex');
    if new.estado <> 'borrador' then
      raise exception 'Un texto de comisión nace en borrador.' using errcode = '23514';
    end if;
    return new;
  end if;
  -- UPDATE: lo escrito no cambia nunca después de salir de borrador.
  if old.estado <> 'borrador' and (new.version, new.titulo, new.cuerpo, new.hash, new.creado_por, new.creado_en, new.id)
       is distinct from (old.version, old.titulo, old.cuerpo, old.hash, old.creado_por, old.creado_en, old.id) then
    raise exception 'Un texto de comisión que ya fue vigente no se edita: crea una versión nueva.' using errcode = '23514';
  end if;
  if old.estado = 'borrador' then
    new.hash := encode(sha256(convert_to(new.cuerpo, 'UTF8')), 'hex');
  end if;
  if new.estado = 'vigente' and old.estado <> 'vigente' then
    if old.estado <> 'borrador' then
      raise exception 'Solo un borrador puede pasar a vigente.' using errcode = '23514';
    end if;
    if not new.revisado_por_abogado then
      raise exception 'Ningún texto de comisión pasa a vigente sin revisión jurídica (D-19).' using errcode = '23514';
    end if;
    new.vigente_desde := now();
  end if;
  if old.estado = 'retirado' and new.estado <> 'retirado' then
    raise exception 'Un texto retirado no vuelve.' using errcode = '23514';
  end if;
  if old.estado = 'vigente' and new.estado = 'borrador' then
    raise exception 'Un texto vigente no vuelve a borrador.' using errcode = '23514';
  end if;
  return new;
end $f$;

drop trigger if exists comision_textos_guardia on public.comision_textos;
create trigger comision_textos_guardia before insert or update on public.comision_textos
  for each row execute function public.comision_textos_guardia();

create or replace function public.comision_textos_sin_borrar() returns trigger language plpgsql as $f$
begin
  if old.estado <> 'borrador' then
    raise exception 'Un texto de comisión que ya fue vigente no se borra: se retira.' using errcode = '23514';
  end if;
  return old;
end $f$;

drop trigger if exists comision_textos_sin_borrar on public.comision_textos;
create trigger comision_textos_sin_borrar before delete on public.comision_textos
  for each row execute function public.comision_textos_sin_borrar();

create table if not exists public.comision_aceptaciones (
  id           uuid primary key default gen_random_uuid(),
  uid          text not null check (char_length(uid) between 3 and 200),
  texto_id     uuid not null references public.comision_textos(id),
  version      text not null,
  hash         text not null check (hash ~ '^[0-9a-f]{64}$'),
  aceptado_en  timestamptz not null default now(),
  agente       text check (agente is null or char_length(agente) <= 300),
  unique (uid, texto_id)
);

create or replace function public.comision_aceptaciones_guardia() returns trigger language plpgsql as $f$
declare t record;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Una aceptación de comisión no se edita ni se borra.' using errcode = '23514';
  end if;
  select estado, hash, version into t from public.comision_textos where id = new.texto_id;
  if not found or t.estado <> 'vigente' then
    raise exception 'Solo se puede aceptar el texto vigente.' using errcode = '23514';
  end if;
  if new.hash <> t.hash or new.version <> t.version then
    raise exception 'La persona vio otra versión del texto.' using errcode = '23514';
  end if;
  return new;
end $f$;

drop trigger if exists comision_aceptaciones_guardia on public.comision_aceptaciones;
create trigger comision_aceptaciones_guardia before insert or update or delete on public.comision_aceptaciones
  for each row execute function public.comision_aceptaciones_guardia();

create index if not exists comision_aceptaciones_uid_idx on public.comision_aceptaciones (uid);

alter table public.comision_textos      enable row level security;
alter table public.comision_aceptaciones enable row level security;

revoke all on public.comision_textos, public.comision_aceptaciones from anon, authenticated;
grant select, insert, update, delete on public.comision_textos, public.comision_aceptaciones to service_role;

commit;
