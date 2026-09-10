-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · V-1.1.14 — dirección desglosada, coordenadas y fotos
-- Ejecutar en: Supabase → SQL Editor → Run
-- Requisito previo: supabase/06-perfil.sql
--
-- Por qué:
--   1. `ubicacion` es texto libre. Un texto libre no se puede poner en un
--      mapa nunca, y la búsqueda por mapa es lo que más se espera de un
--      portal inmobiliario.
--   2. Las fotos son un array de URLs. No hay dónde poner el pie de foto
--      ni el orden, que es lo que permite arrastrar y soltar.
-- ═══════════════════════════════════════════════════════════════

-- ── Dirección desglosada ───────────────────────────────────────
alter table public.propiedades add column if not exists calle    text;
alter table public.propiedades add column if not exists colonia  text;
alter table public.propiedades add column if not exists ciudad   text default 'León';
alter table public.propiedades add column if not exists estado_dir text default 'Guanajuato';
alter table public.propiedades add column if not exists cp       text;

-- ── Coordenadas ────────────────────────────────────────────────
-- numeric(10,7): siete decimales son ~1 cm. De sobra, y exacto —
-- double precision arrastra error de redondeo al comparar.
alter table public.propiedades add column if not exists lat numeric(10,7);
alter table public.propiedades add column if not exists lng numeric(10,7);

-- Si el dueño elige 'aproximada', la propiedad NO sale en el mapa de
-- búsqueda. No es un capricho: publicar la dirección exacta de una casa
-- habitada tiene consecuencias, y quien vende debe poder decidirlo.
alter table public.propiedades add column if not exists precision_ubicacion text
  not null default 'exacta'
  check (precision_ubicacion in ('exacta', 'aproximada'));

-- Índice para la búsqueda por área visible del mapa.
create index if not exists propiedades_coords_idx
  on public.propiedades (lat, lng)
  where lat is not null and lng is not null;

create index if not exists propiedades_zona_idx
  on public.propiedades (ciudad, colonia);

-- ── Migrar lo que ya hay ───────────────────────────────────────
-- `ubicacion` se conserva: es lo que se enseña hoy en la ficha y en las
-- tarjetas. Se copia a `colonia` como punto de partida para que nadie
-- tenga que reescribirlo, y se corrige desde el asistente.
update public.propiedades
   set colonia = ubicacion
 where colonia is null
   and ubicacion is not null
   and ubicacion <> '';

-- ── Subtipo y multimedia ───────────────────────────────────────
alter table public.propiedades add column if not exists subtipo text;
alter table public.propiedades add column if not exists videos  text[] default '{}';
alter table public.propiedades add column if not exists planos  text[] default '{}';
alter table public.propiedades add column if not exists amenidades text[] default '{}';

-- Lo que sólo aplica a un tipo: «tipo de riego» en terrenos, «altura
-- libre» en naves. Una columna por cada uno dejaría una tabla con
-- cincuenta columnas nulas. Lo que se filtra va en columnas; lo que
-- sólo se muestra, aquí.
alter table public.propiedades add column if not exists extras jsonb default '{}'::jsonb;

-- ── Fotos como tabla ───────────────────────────────────────────
-- El pie de foto y el orden necesitan fila propia. `propiedades.fotos`
-- se conserva de momento: hay código leyéndolo, y una migración que
-- rompe la ficha pública no es una mejora.
create table if not exists public.fotos (
  id           uuid primary key default gen_random_uuid(),
  propiedad_id text not null references public.propiedades(id) on delete cascade,
  url          text not null,
  pie          text,
  orden        smallint not null default 0,
  es_principal boolean not null default false,
  creado_en    timestamptz not null default now()
);

create index if not exists fotos_propiedad_idx
  on public.fotos (propiedad_id, orden);

-- Una sola foto principal por propiedad. Que lo garantice la base y no
-- el código: el código tiene tres caminos para escribir aquí.
create unique index if not exists fotos_una_principal_idx
  on public.fotos (propiedad_id)
  where es_principal;

-- ── Seguridad ──────────────────────────────────────────────────
-- Las fotos de una propiedad publicada son públicas: es el catálogo.
-- Escribir, sólo por API con service role, que ya valida la sesión.
alter table public.fotos enable row level security;

drop policy if exists fotos_lectura_publica on public.fotos;
create policy fotos_lectura_publica
  on public.fotos for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.propiedades p
       where p.id = fotos.propiedad_id
         and coalesce(p.estado_pub, 'publicada') = 'publicada'
    )
  );

-- Sin políticas de insert/update/delete a propósito: con RLS activo y
-- ninguna política que lo permita, anon no puede escribir nada.

-- ── Pasar las fotos que ya existen ─────────────────────────────
insert into public.fotos (propiedad_id, url, orden, es_principal)
select p.id, f.url, (f.i - 1)::smallint, (f.i = 1)
  from public.propiedades p
  cross join lateral unnest(p.fotos) with ordinality as f(url, i)
 where p.fotos is not null
   and array_length(p.fotos, 1) > 0
   and not exists (select 1 from public.fotos x where x.propiedad_id = p.id);

-- ── Comprobación ───────────────────────────────────────────────
select
  (select count(*) from public.propiedades)                        as propiedades,
  (select count(*) from public.fotos)                              as fotos_migradas,
  (select count(*) from public.propiedades where lat is not null)  as con_coordenadas,
  (select count(*) from public.fotos where es_principal)           as principales;
