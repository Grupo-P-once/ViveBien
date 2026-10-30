-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 24 — Alertas revisadas y flags explícitos (fase 3b-1)
-- V-1.1.85 · ADITIVA. Se puede aplicar ANTES de desplegar el código.
--
-- Dos cosas, las dos aditivas y las dos idempotentes:
--
-- 1) `busquedas_guardadas.revisadas_en` (D-28.2 · «ya las vi» POR BÚSQUEDA).
--    Hoy «nuevas coincidencias» se cuenta desde que se guardó la búsqueda, así
--    que NUNCA baja: lo que fue nuevo lo es para siempre. Con esta marca, al
--    abrir Alertas lo visto deja de contar, y cada búsqueda lleva su cuenta
--    (abrir una no apaga las demás). Nula = nunca revisada, que es justo el
--    comportamiento de hoy: se cuenta desde `creado_en`.
--
-- 2) Las claves de flags existen EXPLÍCITAMENTE (D-31). `portalClienteInterno`
--    y `citasEnLinea` no estaban en la fila: se leían como apagadas porque
--    `normalizarFlags` es fail-closed. Eso sigue siendo la red de seguridad,
--    pero el estado no debe depender de una ausencia: la pantalla de flags
--    necesita poder mostrarlas y encenderlas. Los valores que YA existen no se
--    tocan (`defectos || valor`: manda lo guardado).
--
-- Checklist (reglas del usuario): respaldo y evidencia antes/después, ensayo en
-- PGlite (`tests/portal-3b1.test.ts`), ensayo en producción dentro de una
-- transacción revertida, y `24-alertas-y-flags.REVERTIR.sql`.
-- ═══════════════════════════════════════════════════════════════

alter table public.busquedas_guardadas
  add column if not exists revisadas_en timestamptz;

comment on column public.busquedas_guardadas.revisadas_en is
  'Última vez que la persona miró las alertas de ESTA búsqueda. Nula = nunca (se cuenta desde creado_en).';

-- La fila la creó la migración 19; si no estuviera, se crea apagada.
insert into public.configuracion (clave, valor, actualizado_por)
values ('flags', '{}'::jsonb, 'migracion-24')
on conflict (clave) do nothing;

update public.configuracion
   set valor = jsonb_build_object(
         'portalCliente', false,
         'portalClienteInterno', false,
         'citasEnLinea', false,
         'publisherPortal', false,
         'commissionEngine', false,
         'legalAcceptance', false,
         'superAdmin', false,
         'marketingHub', false,
         'metaPublishing', false,
         'aiContent', false
       ) || valor,
       actualizado_por = coalesce(actualizado_por, 'migracion-24')
 where clave = 'flags';
