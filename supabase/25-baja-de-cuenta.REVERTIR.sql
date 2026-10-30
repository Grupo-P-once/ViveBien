-- ═══════════════════════════════════════════════════════════════
-- REVERTIR la migración 25 (V-1.1.87) — baja de cuenta.
--
-- Deshace el esquema. Sólo tiene sentido si NINGUNA cuenta se ha dado de baja
-- todavía: una lápida tiene `estado='eliminada'` y `email is null`, y las dos
-- cosas dejan de ser válidas al revertir.
--
-- ANTES DE EJECUTARLO, comprueba que no hay bajas y guarda lo que haya:
--   select uid, estado, email is null as sin_correo from public.usuarios
--     where estado = 'eliminada';                       -- debe salir vacío
--   select * from public.bajas_de_cuenta;               -- debe salir vacío
--   select id, gestion from public.propiedades where gestion is not null;
--   select id, bloqueado_en from public.citas                where bloqueado_en is not null;
--   select id, bloqueado_en from public.solicitudes_contacto where bloqueado_en is not null;
--   select id, email, estado from public.invitaciones where estado = 'revocada_por_baja';
--
-- Si alguna de esas consultas devuelve filas, PARA: revertir perdería el
-- registro de esas bajas y devolvería a la vida cuentas cerradas. En ese caso
-- hay que decidir caso por caso, no revertir en bloque.
-- ═══════════════════════════════════════════════════════════════

begin;

-- ── E · Bloqueo operativo de la PII ─────────────────────────────────────
drop view if exists public.solicitudes_contacto_operativas;
drop view if exists public.citas_operativas;

alter table public.solicitudes_contacto drop column if exists bloqueado_en;
alter table public.citas                drop column if exists bloqueado_en;

-- `creada_por` vuelve a ser obligatoria. Falla si alguna fila la tiene nula
-- (sería una cita ya disociada): eso confirma que hubo una baja y que NO se
-- debe revertir.
alter table public.citas alter column creada_por set not null;

-- ── D · P-1 · La marca de gestión ───────────────────────────────────────
alter table public.propiedades drop constraint if exists propiedades_gestion_check;
drop index if exists public.propiedades_gestion_idx;
alter table public.propiedades drop column if exists gestion;

-- ── C · Invitaciones ────────────────────────────────────────────────────
-- Si quedara alguna revocada por baja, primero decide qué hacer con ella:
--   update public.invitaciones set estado = 'cancelada' where estado = 'revocada_por_baja';
alter table public.invitaciones drop constraint if exists invitaciones_estado_check;
alter table public.invitaciones add constraint invitaciones_estado_check
  check (estado in ('pendiente','aceptada','cancelada'));

-- ── B · El procedimiento ────────────────────────────────────────────────
drop index if exists public.bajas_de_cuenta_pendientes_idx;
drop table if exists public.bajas_de_cuenta;

-- ── A · El correo ───────────────────────────────────────────────────────
-- El orden importa: primero se quita el CHECK del correo, luego se estrecha
-- el de estado, y `set not null` al final. Si hay lápidas, este último paso
-- falla — y debe fallar.
alter table public.usuarios drop constraint if exists usuarios_email_solo_falta_si_eliminada;

alter table public.usuarios drop constraint if exists usuarios_estado_check;
alter table public.usuarios add constraint usuarios_estado_check
  check (estado in ('activo','suspendido','pendiente'));

alter table public.usuarios alter column email set not null;

comment on column public.usuarios.email is null;

commit;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN DESPUÉS DE REVERTIR
--   select is_nullable from information_schema.columns
--     where table_name='usuarios' and column_name='email';              -- NO
--   select to_regclass('public.bajas_de_cuenta');                        -- null
--   select to_regclass('public.citas_operativas');                       -- null
--   select count(*) from information_schema.columns
--     where table_name='propiedades' and column_name='gestion';          -- 0
-- ═══════════════════════════════════════════════════════════════
