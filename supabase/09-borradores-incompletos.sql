-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · V-1.1.53 — un borrador puede estar incompleto
-- Ejecutar en: Supabase → SQL Editor → Run
--
-- El fallo:
--   `titulo`, `tipo`, `operacion` y `precio` eran NOT NULL. La tabla se
--   diseñó pensando en propiedades terminadas, y después se añadió el flujo
--   de borradores: el asistente y el bot crean la fila primero y la van
--   llenando pregunta a pregunta.
--
--   Resultado: **crear un borrador era imposible**. Postgres devolvía
--   23502 («null value in column "tipo"»), el panel decía «No se pudo crear
--   el borrador» y el bot de Telegram contestaba las preguntas sin haber
--   guardado nada — por eso volvía al saludo una y otra vez: no encontraba
--   la conversación en curso porque no existía.
--
-- Por qué es seguro:
--   Lo que protege el catálogo no es esta restricción, sino la máquina de
--   estados: para publicar se exige título, precio, ubicación, tipo,
--   operación y fotos (`listaParaRevision` y `faltaParaPublicar`). Un
--   borrador a medias nunca sale al público.
--
--   Dicho de otra forma: la regla estaba en el sitio equivocado. Impedía
--   empezar en vez de impedir publicar.
-- ═══════════════════════════════════════════════════════════════

begin;

alter table public.propiedades alter column titulo    drop not null;
alter table public.propiedades alter column tipo      drop not null;
alter table public.propiedades alter column operacion drop not null;
alter table public.propiedades alter column precio    drop not null;

commit;

-- ── Comprobación ───────────────────────────────────────────────
-- Las cuatro deben decir YES. Y ninguna propiedad publicada debe tener
-- huecos: si alguna sale aquí, es anterior a esto y hay que revisarla.
select column_name, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'propiedades'
   and column_name in ('titulo', 'tipo', 'operacion', 'precio')
 order by column_name;

select count(*) as publicadas_incompletas
  from public.propiedades
 where coalesce(estado_pub, 'publicada') = 'publicada'
   and (titulo is null or tipo is null or operacion is null or precio is null);
