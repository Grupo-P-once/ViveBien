-- ════════════════════════════════════════════════════════════════
-- 10 — El nombre público de una propiedad, separado de su clave
--
-- EL PROBLEMA
--
-- El `id` de la tabla es también el slug de la URL. Y se genera al crear la
-- fila, a partir del título — pero el panel crea el borrador con un título de
-- relleno:
--
--     body: JSON.stringify({ titulo: 'Propiedad sin título' })
--
-- Así que la URL queda sellada antes de que nadie haya escrito nada. Cinco
-- propiedades publicadas, reales, viven hoy en direcciones como
-- `/propiedades/propiedad-sin-titulo-d52n`, que es una nave industrial.
--
-- POR QUÉ NO SE RENOMBRA EL `id`
--
-- Porque `fotos.propiedad_id` lo referencia con una clave foránea declarada en
-- la migración 07, y **sin `on update cascade`**:
--
--     propiedad_id text not null references public.propiedades(id) on delete cascade
--
-- Un `update propiedades set id = …` fallaría contra esa restricción, y
-- forzarlo dejaría 73 fotos colgando de un id que ya no existe. Además
-- `eventos`, `favoritos` y `solicitudes_contacto` guardan el id como texto: se
-- quedarían apuntando al vacío en silencio, que es peor que fallar.
--
-- LA DECISIÓN
--
-- El `id` se queda como clave interna, estable, y **nunca se vuelve a tocar**.
-- El nombre público pasa a una columna aparte. Las fotos, los eventos y los
-- enlaces ya compartidos siguen funcionando exactamente igual.
--
-- Es reversible: si se borra esta columna, todo vuelve a resolverse por id.
-- ════════════════════════════════════════════════════════════════

begin;

alter table public.propiedades
  add column if not exists slug text;

-- Único, pero sólo entre los que lo tienen: un borrador todavía no tiene
-- nombre público, y varios borradores a la vez no pueden chocar entre sí por
-- compartir el valor nulo.
create unique index if not exists propiedades_slug_unico
  on public.propiedades (slug)
  where slug is not null;

comment on column public.propiedades.slug is
  'Nombre público en la URL. El id es la clave interna y no cambia nunca; '
  'este campo sí puede recalcularse. Cuando está vacío, la ficha se sirve por id.';

commit;

-- ────────────────────────────────────────────────────────────────
-- Comprobación
--
--   select id, slug, estado_pub from public.propiedades order by created_at;
--
-- Los slugs los rellena la aplicación (`npm run slugs`), no este archivo: se
-- construyen con la misma función que usa el sitio, así que no pueden
-- divergir de ella.
-- ────────────────────────────────────────────────────────────────
