-- ═══════════════════════════════════════════════════════════════
-- REVERTIR la migración 26 (V-1.1.87) — la función `baja_de_cuenta`.
--
-- La 26 es **puramente aditiva**: crea una función y no toca ninguna tabla,
-- columna ni dato. Revertirla es, por tanto, seguro en cualquier momento:
-- devuelve el esquema exactamente a como estaba tras la migración 25.
--
-- ─────────────────────────────────────────────────────────────
-- LO QUE ESTO **NO** DESHACE
--
-- Si la función ya se ejecutó sobre alguna cuenta, borrarla **no revierte esas
-- bajas**. Una baja es irreversible por diseño: la lápida sigue siendo lápida,
-- el correo sigue libre y las invitaciones siguen revocadas.
--
-- Borrar la función sólo impide hacer bajas NUEVAS. Es el freno de mano, no la
-- máquina del tiempo.
-- ─────────────────────────────────────────────────────────────
--
-- ANTES DE EJECUTARLO, mira qué hay:
--   select uid, estado, solicitada_en, bloqueada_en, completada_en, ultimo_error
--     from public.bajas_de_cuenta order by solicitada_en desc;
--
--   select count(*) from public.usuarios where estado = 'eliminada';
--
-- Si hay bajas a medio terminar (estado distinto de `completada`), PARA:
-- quitar la función deja ese proceso sin la pieza que lo empuja. Termínalas
-- primero, o asume que quedan pendientes y anótalo.
-- ═══════════════════════════════════════════════════════════════

begin;

drop function if exists public.baja_de_cuenta(text, text, timestamptz, text);

commit;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN DESPUÉS DE REVERTIR
--
--   select count(*) from pg_proc where proname = 'baja_de_cuenta';   -- 0
--
--   -- Y nada más cambió: la migración 25 sigue intacta.
--   select is_nullable from information_schema.columns
--    where table_name = 'usuarios' and column_name = 'email';        -- YES
--   select to_regclass('public.bajas_de_cuenta')::text;              -- bajas_de_cuenta
--   select to_regclass('public.citas_operativas')::text;             -- citas_operativas
-- ═══════════════════════════════════════════════════════════════
