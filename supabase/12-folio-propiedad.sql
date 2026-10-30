-- ════════════════════════════════════════════════════════════════
-- 12 — Folio único y permanente de cada propiedad: VB-2026-00125
--
-- POR QUÉ HACE FALTA, HABIENDO `id` Y `slug`
--
--   · `id` es una clave interna: no se enseña a nadie (V-1.1.64).
--   · `slug` es la dirección pública: puede no existir todavía (borradores) y
--     se construye con el título, así que no sirve para dictarlo por teléfono.
--   · El folio es lo que se dice en voz alta: «me interesa la VB-2026-00012».
--     Corto, legible y **no cambia nunca**, pase lo que pase con el título o la
--     dirección.
--
-- DECISIONES
--
--   · Contador global que NO se reinicia cada año. El año es el de alta, pero el
--     número sigue: así es imposible que dos propiedades compartan folio.
--   · Lo asigna la base al insertar (trigger + secuencia). Ninguna vía de alta
--     —web, panel, bot de Telegram— puede olvidarlo, y dos altas simultáneas no
--     pueden recibir el mismo número.
--   · Inmutable: un UPDATE que intente cambiarlo conserva el original en vez de
--     fallar, porque el panel manda la fila entera al guardar.
--   · Las existentes se numeran por fecha de alta. Si luego se borran filas
--     quedan huecos, como en cualquier folio: no se reutilizan números.
-- ════════════════════════════════════════════════════════════════

create sequence if not exists public.propiedades_folio_seq;

alter table public.propiedades
  add column if not exists folio text;

-- Las que ya existen, en orden de alta.
with ordenadas as (
  select id,
         extract(year from coalesce(created_at, now()))::int as anio,
         row_number() over (order by created_at nulls last, id) as n
  from public.propiedades
  where folio is null
)
update public.propiedades p
set folio = 'VB-' || o.anio || '-' || lpad(o.n::text, 5, '0')
from ordenadas o
where p.id = o.id;

-- La secuencia continúa después del último número usado.
select setval(
  'public.propiedades_folio_seq',
  greatest(coalesce((select max(substring(folio from '(\d+)$')::int) from public.propiedades), 0), 1),
  (select count(*) > 0 from public.propiedades)
);

alter table public.propiedades alter column folio set not null;

create unique index if not exists propiedades_folio_unico
  on public.propiedades (folio);

-- Asignar al insertar. Siempre: si el cuerpo trae un folio, se ignora.
-- SECURITY INVOKER (lo normal): las altas llegan por el servidor con
-- service_role, que ya puede usar la secuencia. Se probó primero con SECURITY
-- DEFINER y el revisor de Supabase avisó —con razón— de que eso la dejaba
-- invocable por /rest/v1/rpc sin necesidad.
create or replace function public.asignar_folio_propiedad()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.folio := 'VB-' || extract(year from coalesce(new.created_at, now()))::int
               || '-' || lpad(nextval('public.propiedades_folio_seq')::text, 5, '0');
  return new;
end;
$$;

drop trigger if exists propiedades_asignar_folio on public.propiedades;
create trigger propiedades_asignar_folio
  before insert on public.propiedades
  for each row execute function public.asignar_folio_propiedad();

-- No cambia nunca.
create or replace function public.conservar_folio_propiedad()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.folio is not null and new.folio is distinct from old.folio then
    new.folio := old.folio;
  end if;
  return new;
end;
$$;

drop trigger if exists propiedades_conservar_folio on public.propiedades;
create trigger propiedades_conservar_folio
  before update on public.propiedades
  for each row execute function public.conservar_folio_propiedad();

-- Nadie invoca estas funciones por la API: sólo se disparan como triggers.
revoke execute on function public.asignar_folio_propiedad() from public, anon, authenticated;
revoke execute on function public.conservar_folio_propiedad() from public, anon, authenticated;

comment on column public.propiedades.folio is
  'Folio público y permanente (VB-AAAA-NNNNN). Lo asigna la base al insertar y no cambia nunca.';

notify pgrst, 'reload schema';
