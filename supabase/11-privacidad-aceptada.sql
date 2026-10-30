-- ════════════════════════════════════════════════════════════════
-- 11 — Si la persona aceptó el aviso de privacidad, como columna propia
--
-- La prueba fuerte ya existía: `consentimiento_version` guarda QUÉ texto se
-- aceptó, y eso es lo que pide la LFPDPPP cuando los datos se comparten con un
-- anunciante. Esta columna no la sustituye: la complementa con un sí/no que se
-- puede filtrar de un vistazo en el panel y en SQL.
--
-- `default false` a propósito: las filas anteriores no tienen consentimiento
-- registrado, y marcarlas como aceptadas sería afirmar algo que no consta.
-- A partir de ahora la escribe el servidor, sólo cuando la casilla venía
-- marcada (`src/app/api/registro-lead/route.ts`).
-- ════════════════════════════════════════════════════════════════

alter table public.leads
  add column if not exists privacy_accepted boolean not null default false;

comment on column public.leads.privacy_accepted is
  'true si la persona marcó «Acepto el aviso de privacidad». El texto exacto aceptado se identifica con consentimiento_version.';

notify pgrst, 'reload schema';
