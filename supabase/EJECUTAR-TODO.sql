-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · TODO EL SQL PENDIENTE, EN ORDEN  ·  V-1.1.2
-- Pegar completo en: Supabase → SQL Editor → Run
-- Generado: 2026-09-09
--
-- Parte 1 cierra la fuga de datos (urgente).
-- Parte 2 habilita el rol de publicador.
-- Parte 3 habilita la publicacion moderada.
-- ═══════════════════════════════════════════════════════════════


-- ── PARTE 1 · CERRAR LA FUGA ──────────────────────────────────

--
-- COMPROBADO EL 2026-09-08 contra la base de producción, usando
-- únicamente la anon key que viaja en el bundle del navegador:
--
--   GET    /rest/v1/leads        → 200  devolvió nombre, teléfono y
--                                       correo de una persona real
--   GET    /rest/v1/contactos    → 200
--   GET    /rest/v1/envios       → 200
--   PATCH  /rest/v1/propiedades  → 204  aceptado
--   DELETE /rest/v1/propiedades  → 204  aceptado
--   DELETE /rest/v1/leads        → 204  aceptado
--   DELETE /rest/v1/contactos    → 204  aceptado
--   POST   /rest/v1/propiedades  → 400  pero por NOT NULL, no por permisos:
--                                       la escritura estaba autorizada
--
-- Las cuatro tablas están abiertas a lectura y escritura. Cualquiera que
-- abra el sitio, copie la clave del bundle y haga un curl puede leer los
-- datos de contacto de las personas y vaciar la base.
--
-- ANTES DE EJECUTAR: despliega el código que acompaña a este archivo.
-- El panel pasó a leer leads y contactos por /api/leads y
-- /api/admin/contactos (servidor, service role). Si cierras RLS con el
-- código viejo en producción, el dashboard se queda sin datos.



-- ── propiedades ────────────────────────────────────────────────
-- Lectura pública: la necesita el catálogo.
-- Escritura: nadie con la anon key. El panel escribe por API Route con
-- la service role, que ignora RLS y ya valida la sesión.

alter table public.propiedades enable row level security;

drop policy if exists "propiedades_lectura_publica" on public.propiedades;
create policy "propiedades_lectura_publica"
  on public.propiedades for select
  to anon, authenticated
  using (true);

-- Nota: se deja lectura total (`using (true)`) en vez de filtrar por
-- estatus porque hoy el filtrado de pausadas y archivadas lo hace el
-- frontend. Cambiarlo aquí ahora escondería propiedades sin previo
-- aviso. Pasa a `using (estatus = 'disponible')` en la Fase 2, junto
-- con la máquina de estados de publicación.


-- ── leads ──────────────────────────────────────────────────────
-- El formulario público inserta. Nadie lee con la anon key.

alter table public.leads enable row level security;

drop policy if exists "leads_insertar_publico" on public.leads;
create policy "leads_insertar_publico"
  on public.leads for insert
  to anon, authenticated
  with check (true);

-- Sin política de SELECT a propósito: la lectura queda cerrada.
-- El panel los lee por /api/leads con la service role.


-- ── contactos ──────────────────────────────────────────────────

alter table public.contactos enable row level security;

drop policy if exists "contactos_insertar_publico" on public.contactos;
create policy "contactos_insertar_publico"
  on public.contactos for insert
  to anon, authenticated
  with check (true);


-- ── envios ─────────────────────────────────────────────────────
-- La app no la toca (sólo el workflow de n8n, que va con service role).
-- Se cierra por completo al rol público: RLS activo y cero políticas.

alter table public.envios enable row level security;


-- ── Comprobación ───────────────────────────────────────────────
select
  c.relname as tabla,
  c.relrowsecurity as rls_activo,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;

-- Las tres deben salir con rls_activo = true.
-- Después, desde una terminal con la anon key:
--   curl "$URL/rest/v1/leads?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
-- Esperado: []  (antes devolvía los datos de la persona)


-- ── PARTE 2 · TABLA DE USUARIOS Y ROLES ───────────────────────


--
-- Hasta que esta tabla exista, el servidor cae a la lista ADMIN_EMAILS
-- y trata a todos los demás como clientes. El código funciona sin ella;
-- esta migración es lo que habilita el rol de publicador.


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


-- ── PARTE 3 · PUBLICACION MODERADA ────────────────────────────


--
-- Se añade `estado_pub` en vez de reutilizar `estatus`. Son dos cosas
-- distintas y mezclarlas obliga a tocar medio panel:
--
--   estatus     → estado comercial: disponible, pausada, vendida, eliminada
--   estado_pub  → estado de moderación: ¿está aprobada para mostrarse?
--
-- Una propiedad es pública cuando estado_pub = 'publicada'
-- Y ADEMÁS estatus = 'disponible'.



-- ── Estado de publicación ──────────────────────────────────────
-- Las filas que ya existen quedan en 'publicada': las creó la casa y
-- llevan tiempo visibles. Marcarlas como borrador las escondería.

alter table public.propiedades
  add column if not exists estado_pub text not null default 'publicada';

alter table public.propiedades
  drop constraint if exists propiedades_estado_pub_check;

alter table public.propiedades
  add constraint propiedades_estado_pub_check
  check (estado_pub in (
    'borrador',
    'en_revision',
    'cambios_solicitados',
    'rechazada',
    'publicada'
  ));

create index if not exists propiedades_estado_pub_idx
  on public.propiedades (estado_pub);

-- Campos de moderación y calidad del anuncio
alter table public.propiedades
  add column if not exists completitud     smallint not null default 0,
  add column if not exists revisado_por    text,
  add column if not exists revisado_en     timestamptz,
  add column if not exists nota_moderacion text,
  add column if not exists publicada_en    timestamptz,
  add column if not exists enviada_en      timestamptz;


-- ── Bitácora de auditoría ──────────────────────────────────────
-- Toda decisión administrativa sensible deja rastro.

create table if not exists public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_uid    text not null,
  actor_email  text,
  actor_rol    text,
  accion       text not null,
  entidad      text not null,
  entidad_id   text,
  antes        jsonb,
  despues      jsonb,
  creado_en    timestamptz not null default now()
);

create index if not exists audit_logs_entidad_idx
  on public.audit_logs (entidad, entidad_id, creado_en desc);

create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_uid, creado_en desc);

-- Cerrada al rol público: RLS activo y sin políticas.
alter table public.audit_logs enable row level security;


-- ── Catálogo público: sólo lo aprobado ─────────────────────────
-- Sustituye la política provisional de rls-fix.sql, que dejaba leer
-- todo mientras el filtrado lo hacía el frontend.

drop policy if exists "propiedades_lectura_publica" on public.propiedades;
create policy "propiedades_lectura_publica"
  on public.propiedades for select
  to anon, authenticated
  using (estado_pub = 'publicada');

-- El panel sigue viendo todo: lee con service role, que ignora RLS.


-- ── Comprobación ───────────────────────────────────────────────
select estado_pub, estatus, count(*)
from public.propiedades
group by estado_pub, estatus
order by estado_pub, estatus;

-- Las propiedades que ya existían deben salir como
-- estado_pub = 'publicada'. Si alguna sale en otro estado,
-- dejaría de verse en el sitio.
