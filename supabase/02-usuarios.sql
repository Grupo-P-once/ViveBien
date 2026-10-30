-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · Fase 1 — tabla de usuarios y roles
-- Ejecutar en: Supabase → SQL Editor → Run
-- Requisito previo: supabase/rls-fix.sql
--
-- Hasta que esta tabla exista, el servidor cae a la lista ADMIN_EMAILS
-- y trata a todos los demás como clientes. El código funciona sin ella;
-- esta migración es lo que habilita el rol de publicador.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.usuarios (
  uid            text primary key,          -- uid de Firebase Authentication
  email          text not null,
  nombre         text,
  telefono       text,
  rol            text not null default 'cliente'
                 check (rol in ('cliente', 'publicador', 'admin')),
  estado         text not null default 'activo'
                 check (estado in ('activo', 'suspendido', 'pendiente')),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index if not exists usuarios_email_idx
  on public.usuarios (lower(email));

create index if not exists usuarios_rol_idx on public.usuarios (rol);

-- ── Seguridad ──────────────────────────────────────────────────
-- Cerrada por completo al rol público: nadie lee ni escribe esta tabla
-- con la anon key. Todo pasa por API Routes con la service role, que
-- ignora RLS y ya valida la sesión.
--
-- Sin políticas a propósito. Con RLS activo y cero políticas, el rol
-- anon no puede hacer nada.

alter table public.usuarios enable row level security;

-- ── Actualizar la marca de tiempo ──────────────────────────────
create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists usuarios_tocar_actualizado on public.usuarios;
create trigger usuarios_tocar_actualizado
  before update on public.usuarios
  for each row execute function public.tocar_actualizado_en();


-- ── Propiedades: dueño ─────────────────────────────────────────
-- Necesario para que un publicador sólo pueda tocar lo suyo.
-- Las propiedades que ya existen se quedan sin dueño (null), que es
-- correcto: las creó la casa, no un publicador externo.

alter table public.propiedades
  add column if not exists owner_id text references public.usuarios(uid);

create index if not exists propiedades_owner_idx
  on public.propiedades (owner_id);


-- ── Comprobación ───────────────────────────────────────────────
select
  c.relname as tabla,
  c.relrowsecurity as rls_activo,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- usuarios debe salir con rls_activo = true y 0 políticas.
