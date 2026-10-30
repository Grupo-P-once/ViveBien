-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · V-1.1.40 — las tres columnas que le faltaban a `leads`
-- Ejecutar en: Supabase → SQL Editor → Run
-- Se puede correr más de una vez: todo es `if not exists` o idempotente.
--
-- Por qué:
--   `/api/registro-lead` escribe `interes`, `origen` y
--   `consentimiento_version`, y la tabla no tenía ninguna de las tres.
--   Comprobado el 2026-09-11 con una consulta vacía por columna: 400 en las
--   tres. Con el reintento de antes —que quitaba UNA columna— no entraba
--   ningún lead de ningún formulario.
--
--   Desde V-1.1.40 el código ya no pierde el lead: lo que no tiene columna
--   lo guarda plegado al final de `mensaje`, una línea por campo:
--
--       Me interesa la casa de Tzula
--       [interes] Casa en venta
--       [origen] ficha
--       [consentimiento_version] 2026-09
--
--   Esta migración crea las columnas y devuelve cada línea a la suya.
-- ═══════════════════════════════════════════════════════════════

begin;

alter table public.leads add column if not exists interes text;
alter table public.leads add column if not exists origen text;

-- Qué texto de consentimiento aceptó. Sin esto no se puede demostrar que el
-- lead autorizó el tratamiento de sus datos: es lo que lo hace utilizable.
alter table public.leads add column if not exists consentimiento_version text;

create index if not exists leads_origen_idx on public.leads (origen);

-- ── Desplegar lo que se guardó plegado ─────────────────────────
-- `(?n)` hace que `^` y `$` casen por línea. Se toma la ÚLTIMA aparición
-- de cada campo: la añade el servidor al final, así que una línea que el
-- visitante haya escrito imitando el formato nunca gana.
update public.leads l
   set interes = coalesce(l.interes, (
         select t.m[1]
           from regexp_matches(l.mensaje, '(?n)^\[interes\] (.*)$', 'g') with ordinality as t(m, n)
          order by t.n desc limit 1)),
       origen = coalesce(l.origen, (
         select t.m[1]
           from regexp_matches(l.mensaje, '(?n)^\[origen\] (.*)$', 'g') with ordinality as t(m, n)
          order by t.n desc limit 1)),
       consentimiento_version = coalesce(l.consentimiento_version, (
         select t.m[1]
           from regexp_matches(l.mensaje, '(?n)^\[consentimiento_version\] (.*)$', 'g') with ordinality as t(m, n)
          order by t.n desc limit 1))
 where l.mensaje ~ '(?n)^\[(interes|origen|consentimiento_version)\] ';

-- Y quitar esas líneas del mensaje, ya que tienen columna. Si el mensaje
-- queda vacío, a null.
update public.leads
   set mensaje = nullif(btrim(regexp_replace(
         mensaje, '(?n)^\[(interes|origen|consentimiento_version)\] .*$\n?', '', 'g'
       ), E' \n'), '')
 where mensaje ~ '(?n)^\[(interes|origen|consentimiento_version)\] ';

commit;

-- ── Comprobación ───────────────────────────────────────────────
select
  count(*)                                         as leads,
  count(*) filter (where consentimiento_version is not null) as con_consentimiento,
  count(*) filter (where origen is not null)       as con_origen,
  count(*) filter (where mensaje ~ '(?n)^\[(interes|origen|consentimiento_version)\] ') as aun_plegados
from public.leads;
