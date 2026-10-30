-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 27 — Centro de Ayuda (fase 3c-3)
-- V-1.1.94 · ENTERAMENTE ADITIVA: nueve tablas nuevas, ningún cambio en lo
-- que ya existe. Idempotente.
--
-- NO EJECUTAR todavía. Antes: respaldo · ensayo en PGlite · ensayo en
-- producción dentro de una transacción revertida · evidencia antes/después.
-- Revertir con `27-centro-de-ayuda.REVERTIR.sql`.
--
-- Plan: docs/fase-3/CENTRO_DE_AYUDA.md
--
-- ─────────────────────────────────────────────────────────────
-- DOS ESTADOS QUE NO SON LO MISMO, Y CONFUNDIRLOS SERÍA MENTIR
--
--   `estado`          dónde está el ARTÍCULO en el flujo editorial
--   `estado_producto` si la FUNCIÓN que describe existe hoy
--
-- Un artículo PUBLICADO puede describir algo `futuro` —el plan lo prevé y la
-- gente pregunta por ello— siempre que el texto lo diga. Lo que nunca puede
-- pasar es que una función que no existe parezca disponible.
--
-- LA IA NO PUBLICA
--
-- Puede redactar, resumir y proponer. La transición a PUBLICADO la autoriza
-- una persona con `ayuda.publicar`, y eso se aplica en el servidor, no aquí.
-- La base guarda quién y cuándo (`publicado_por`, `publicado_en`).
--
-- CUATRO ÁMBITOS QUE NUNCA SE MEZCLAN
--
-- `publica` · `publicador` · `administrativa` · `tecnica`. El RLS de abajo
-- sólo deja a `anon` leer `publica` + `PUBLICADO`. Un fallo aquí no es un
-- fallo de diseño: filtra procedimientos internos.
-- ─────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════

begin;

-- ── A · Categorías ──────────────────────────────────────────────────────

create table if not exists public.knowledge_categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  nombre       text not null,
  descripcion  text,
  icono        text,
  ambito       text not null default 'publica',
  orden        integer not null default 0,
  creada_en    timestamptz not null default now(),
  constraint knowledge_categories_ambito_check
    check (ambito in ('publica','publicador','administrativa','tecnica')),
  constraint knowledge_categories_slug_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.knowledge_categories is
  'Categorías del Centro de Ayuda. El `slug` es la URL: /ayuda/[categoria].';

-- ── B · Artículos ───────────────────────────────────────────────────────

create table if not exists public.knowledge_articles (
  id              uuid primary key default gen_random_uuid(),
  categoria_id    uuid not null references public.knowledge_categories(id) on delete restrict,
  slug            text not null,
  titulo          text not null,
  resumen         text,
  cuerpo          text,
  ambito          text not null default 'publica',
  estado          text not null default 'BORRADOR',
  estado_producto text not null default 'disponible',
  aviso           text,
  prioridad       integer not null default 3,
  vistas          integer not null default 0,
  revisado_en     date,
  publicado_por   text,
  publicado_en    timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  constraint knowledge_articles_slug_unico unique (categoria_id, slug),
  constraint knowledge_articles_slug_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint knowledge_articles_ambito_check
    check (ambito in ('publica','publicador','administrativa','tecnica')),
  constraint knowledge_articles_estado_check
    check (estado in ('BORRADOR','EN_REVISION','APROBADO','PUBLICADO','DESACTUALIZADO','ARCHIVADO')),
  constraint knowledge_articles_estado_producto_check
    check (estado_producto in ('disponible','parcial','futuro','no_disponible')),

  -- La guarda que impide prometer lo que no existe: si la función no está
  -- disponible del todo, el artículo tiene que decirlo con todas las letras.
  constraint knowledge_articles_futuro_avisa
    check (estado_producto = 'disponible' or (aviso is not null and length(btrim(aviso)) > 0)),

  -- Publicado sin constancia de quién lo aprobó sería justo lo que la regla
  -- fundamental prohíbe.
  constraint knowledge_articles_publicado_con_firma
    check (estado <> 'PUBLICADO' or (publicado_por is not null and publicado_en is not null))
);

comment on column public.knowledge_articles.estado is
  'Flujo editorial. La transición a PUBLICADO la autoriza una persona (ayuda.publicar).';
comment on column public.knowledge_articles.estado_producto is
  'Si la FUNCIÓN existe hoy. Distinto de `estado`: un artículo publicado puede describir algo futuro, si lo avisa.';
comment on column public.knowledge_articles.aviso is
  'Obligatorio cuando la función no está disponible del todo. Es lo que impide prometer lo que no existe.';

create index if not exists knowledge_articles_publicos_idx
  on public.knowledge_articles (categoria_id, prioridad)
  where ambito = 'publica' and estado = 'PUBLICADO';

-- ── C · Versiones ───────────────────────────────────────────────────────

create table if not exists public.knowledge_article_versions (
  id          uuid primary key default gen_random_uuid(),
  articulo_id uuid not null references public.knowledge_articles(id) on delete cascade,
  version     integer not null,
  titulo      text not null,
  cuerpo      text,
  autor       text,
  origen      text not null default 'humano',
  nota        text,
  creada_en   timestamptz not null default now(),
  constraint knowledge_article_versions_unica unique (articulo_id, version),
  constraint knowledge_article_versions_origen_check
    check (origen in ('humano','ia','importado'))
);

comment on column public.knowledge_article_versions.origen is
  'Quién escribió esta versión. `ia` se guarda como PROPUESTA: publicar sigue siendo de una persona.';

-- ── D · Fuentes · la pieza clave ────────────────────────────────────────
--
-- De dónde salió cada artículo y contra qué se verifica. Sin esto no hay
-- Knowledge Engine después: no habría forma de saber qué artículos toca
-- revisar cuando cambie una funcionalidad.

create table if not exists public.knowledge_article_sources (
  id             uuid primary key default gen_random_uuid(),
  articulo_id    uuid not null references public.knowledge_articles(id) on delete cascade,
  tipo           text not null,
  clave          text not null,
  version_fuente text,
  detalle        text,
  creada_en      timestamptz not null default now(),
  constraint knowledge_article_sources_unica unique (articulo_id, tipo, clave),
  constraint knowledge_article_sources_tipo_check
    check (tipo in ('product','route','component','api','permission','documentation','legal','test','migration'))
);

comment on table public.knowledge_article_sources is
  'Trazabilidad artículo → fuente de verdad. Ej: product/portal.guardadas, route//portal/propiedades, permission/cuenta.propia.';

create index if not exists knowledge_article_sources_clave_idx
  on public.knowledge_article_sources (tipo, clave);

-- ── E · Relaciones, etiquetas ───────────────────────────────────────────

create table if not exists public.knowledge_article_relations (
  articulo_id    uuid not null references public.knowledge_articles(id) on delete cascade,
  relacionado_id uuid not null references public.knowledge_articles(id) on delete cascade,
  tipo           text not null default 'relacionado',
  primary key (articulo_id, relacionado_id),
  constraint knowledge_article_relations_no_consigo check (articulo_id <> relacionado_id),
  constraint knowledge_article_relations_tipo_check
    check (tipo in ('relacionado','siguiente','requiere'))
);

create table if not exists public.knowledge_article_tags (
  articulo_id uuid not null references public.knowledge_articles(id) on delete cascade,
  etiqueta    text not null,
  primary key (articulo_id, etiqueta)
);

-- ── F · Lo que dice la gente ────────────────────────────────────────────
--
-- Sin PII. `knowledge_feedback` no lleva uid ni correo a propósito: saber si
-- un artículo sirve no requiere saber quién lo leyó.

create table if not exists public.knowledge_feedback (
  id          uuid primary key default gen_random_uuid(),
  articulo_id uuid not null references public.knowledge_articles(id) on delete cascade,
  util        boolean not null,
  comentario  text,
  creado_en   timestamptz not null default now(),
  constraint knowledge_feedback_comentario_corto check (comentario is null or length(comentario) <= 500)
);

comment on table public.knowledge_feedback is
  'Sin uid, sin correo, sin IP. Anónimo a propósito.';

-- Las preguntas reales señalan los huecos de contenido. También anónimas.
create table if not exists public.knowledge_searches (
  id            uuid primary key default gen_random_uuid(),
  consulta      text not null,
  resultados    integer not null default 0,
  creada_en     timestamptz not null default now(),
  constraint knowledge_searches_consulta_corta check (length(consulta) <= 200)
);

-- ── G · Cambios detectados · SE PREPARA, NO SE USA TODAVÍA ──────────────
--
-- El motor automático es de una fase posterior. La tabla se crea ahora para
-- que el modelo no tenga que cambiar entonces.

create table if not exists public.knowledge_change_events (
  id            uuid primary key default gen_random_uuid(),
  tipo_fuente   text not null,
  clave_fuente  text not null,
  version_antes text,
  version_ahora text,
  detectado_en  timestamptz not null default now(),
  procesado_en  timestamptz,
  nota          text
);

comment on table public.knowledge_change_events is
  'Preparada para el Knowledge Engine (fase posterior). Un cambio NUNCA publica: mueve el artículo a revisión.';

-- ── H · RLS · lo público es sólo lo público ─────────────────────────────

alter table public.knowledge_categories       enable row level security;
alter table public.knowledge_articles         enable row level security;
alter table public.knowledge_article_versions enable row level security;
alter table public.knowledge_article_sources  enable row level security;
alter table public.knowledge_article_relations enable row level security;
alter table public.knowledge_article_tags     enable row level security;
alter table public.knowledge_feedback         enable row level security;
alter table public.knowledge_searches         enable row level security;
alter table public.knowledge_change_events    enable row level security;

-- `anon` lee DOS cosas y nada más: categorías públicas y artículos públicos
-- ya publicados. Los borradores, los archivados y los tres ámbitos internos
-- —publicador, administrativa, técnica— no salen de aquí.

drop policy if exists knowledge_categories_publicas on public.knowledge_categories;
create policy knowledge_categories_publicas on public.knowledge_categories
  for select to anon, authenticated
  using (ambito = 'publica');

drop policy if exists knowledge_articles_publicos on public.knowledge_articles;
create policy knowledge_articles_publicos on public.knowledge_articles
  for select to anon, authenticated
  using (ambito = 'publica' and estado = 'PUBLICADO');

-- Las etiquetas y relaciones sólo se ven si su artículo se ve.
drop policy if exists knowledge_tags_de_publicos on public.knowledge_article_tags;
create policy knowledge_tags_de_publicos on public.knowledge_article_tags
  for select to anon, authenticated
  using (exists (
    select 1 from public.knowledge_articles a
    where a.id = articulo_id and a.ambito = 'publica' and a.estado = 'PUBLICADO'
  ));

drop policy if exists knowledge_relations_de_publicos on public.knowledge_article_relations;
create policy knowledge_relations_de_publicos on public.knowledge_article_relations
  for select to anon, authenticated
  using (exists (
    select 1 from public.knowledge_articles a
    where a.id = articulo_id and a.ambito = 'publica' and a.estado = 'PUBLICADO'
  ));

-- Cualquiera puede decir si un artículo le sirvió, pero nadie puede leer las
-- respuestas de los demás desde el navegador.
drop policy if exists knowledge_feedback_escribir on public.knowledge_feedback;
create policy knowledge_feedback_escribir on public.knowledge_feedback
  for insert to anon, authenticated
  with check (exists (
    select 1 from public.knowledge_articles a
    where a.id = articulo_id and a.ambito = 'publica' and a.estado = 'PUBLICADO'
  ));

-- Versiones, fuentes, búsquedas y cambios: nada para `anon`. Sin política de
-- SELECT, con RLS activo, no se lee. El servidor entra con la clave de
-- servicio, que salta el RLS.

commit;

-- ── Comprobación posterior ──────────────────────────────────────────────
--   select tablename, rowsecurity from pg_tables
--     where schemaname='public' and tablename like 'knowledge_%';
--   -- las nueve con rowsecurity = true
--
--   select tablename, policyname, roles from pg_policies
--     where schemaname='public' and tablename like 'knowledge_%' order by 1,2;
--   -- cinco políticas, ninguna sobre versions/sources/searches/change_events
