-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 38 — Datos internos de una propiedad: origen y comisión pactada, y notas internas
-- Reversa: 38-propiedad-interno.REVERTIR.sql
--
-- PREPARADA, NO APLICADA. Aplicar solo con autorización del propietario y DESPUÉS de desplegar el código (el código tolera que
-- estas tablas no existan: responde 503 «no disponible» y no muestra nada; falla cerrado).
--
-- Dos tablas NUEVAS, sin tocar ninguna existente. Van APARTE de `propiedades` a propósito: `propiedades` tiene lectura pública
-- (columnas concedidas a anon, migración 18) y cualquier columna nueva ahí sería pública. Estas tablas solo las usa el servidor
-- (service_role) detrás de la autorización por rol: RLS activada, SIN políticas, sin permisos para anon ni authenticated.
--
--  · propiedad_origen — UNA fila por propiedad: de quién es (trato directo / inmobiliaria / broker), datos de contacto de esa
--                       persona o empresa, y la comisión pactada. NO hay valor por defecto de comisión: se captura o queda vacía.
--  · propiedad_notas  — notas internas con historial: solo se AGREGAN (no hay edición ni borrado desde la app). Cada nota guarda
--                       quién la escribió y con qué rol. Quién la ve lo decide el servidor (autor, o el equipo: admin/super admin).
-- Idempotente (create … if not exists).
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.propiedad_origen (
  propiedad_id     text primary key references public.propiedades(id) on delete cascade,
  origen_tipo      text not null check (origen_tipo in ('trato_directo', 'inmobiliaria', 'broker')),
  titular_nombre   text check (titular_nombre is null or char_length(titular_nombre) <= 200),
  titular_empresa  text check (titular_empresa is null or char_length(titular_empresa) <= 200),
  titular_telefono text check (titular_telefono is null or char_length(titular_telefono) <= 40),
  titular_correo   text check (titular_correo is null or char_length(titular_correo) <= 200),
  comision_tipo    text check (comision_tipo is null or comision_tipo in ('porcentaje', 'meses_renta', 'monto_fijo', 'compartida')),
  comision_valor   numeric(14,2) check (comision_valor is null or comision_valor >= 0),
  comision_detalle text check (comision_detalle is null or char_length(comision_detalle) <= 1000),
  creado_por       text not null check (char_length(creado_por) between 3 and 200),
  creado_en        timestamptz not null default now(),
  actualizado_por  text not null check (char_length(actualizado_por) between 3 and 200),
  actualizado_en   timestamptz not null default now()
);

create table if not exists public.propiedad_notas (
  id           uuid primary key default gen_random_uuid(),
  propiedad_id text not null references public.propiedades(id) on delete cascade,
  autor_uid    text not null check (char_length(autor_uid) between 3 and 200),
  autor_rol    text not null check (autor_rol in ('publicador', 'admin', 'super_admin')),
  texto        text not null check (char_length(texto) between 1 and 2000),
  creado_en    timestamptz not null default now()
);

create index if not exists propiedad_notas_propiedad_idx on public.propiedad_notas (propiedad_id, creado_en desc);

alter table public.propiedad_origen enable row level security;
alter table public.propiedad_notas  enable row level security;

revoke all on public.propiedad_origen, public.propiedad_notas from anon, authenticated;
grant select, insert, update, delete on public.propiedad_origen, public.propiedad_notas to service_role;

commit;
