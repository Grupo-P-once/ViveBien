-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 28 — Modalidad de publicador y permisos por usuario (ADR-0013)
--
-- El ROL de seguridad sigue siendo uno solo (`usuarios.rol = 'publicador'`).
-- Dentro de él hay una MODALIDAD comercial:
--
--   tipo_publicador = 'publicador'  modalidad normal, CON comisión
--   tipo_publicador = 'asociado'    modalidad premium, SIN comisión
--
-- Los permisos efectivos son: defaults de la modalidad (en código,
-- `src/lib/acceso/capacidades.ts`) + overrides individuales, que viven en
-- `permisos_override`: {"aceptar_citas": true, "mostrar_telefono": false, …}.
-- Un permiso ausente del JSON = «lo que diga la modalidad».
--
-- Es ADITIVA y no destructiva: dos columnas con valor por defecto y una función. Nadie cambia
-- de modalidad ni de permisos al aplicarla: todos los publicadores existentes
-- quedan en 'publicador' sin overrides, que es lo más restrictivo.
--
-- ORDEN: el código nuevo ya funciona SIN esta migración (lee las columnas
-- aparte y, si faltan, vale 'publicador' sin overrides). Puede aplicarse antes
-- o después del despliegue; hasta aplicarla, la API de administración que
-- cambia la modalidad responde 503 en vez de fingir.
--
-- La tabla `usuarios` ya está cerrada al navegador (RLS sin políticas, cero
-- privilegios para anon/authenticated; migración 21): estas columnas sólo las
-- escribe el servidor, y cada cambio queda en `audit_logs`.
--
-- Reversa: 28-publicador-modalidad.REVERTIR.sql
-- ═══════════════════════════════════════════════════════════════

alter table public.usuarios
  add column if not exists tipo_publicador text not null default 'publicador';

alter table public.usuarios
  drop constraint if exists usuarios_tipo_publicador_check;
alter table public.usuarios
  add constraint usuarios_tipo_publicador_check
  check (tipo_publicador in ('publicador', 'asociado'));

alter table public.usuarios
  add column if not exists permisos_override jsonb not null default '{}'::jsonb;

alter table public.usuarios
  drop constraint if exists usuarios_permisos_override_objeto;
alter table public.usuarios
  add constraint usuarios_permisos_override_objeto
  check (jsonb_typeof(permisos_override) = 'object');

comment on column public.usuarios.tipo_publicador is
  'Modalidad comercial dentro del rol publicador: publicador (con comisión) | asociado (sin comisión). Sólo tiene efecto si rol = publicador. ADR-0013.';
comment on column public.usuarios.permisos_override is
  'Overrides individuales de permisos sobre los defaults de la modalidad. Sólo claves conocidas con valor booleano; las valida el servidor. ADR-0013.';

-- ── Cambiar modalidad y permisos: UNA transacción (cambio + bitácora) ─────
--
-- Hallazgo L2 de la fase ADMIN: actualizar la cuenta y escribir la bitácora en
-- dos llamadas separadas permitía (a) dos cambios simultáneos pisándose y (b)
-- un cambio sin huella si el «deshacer» fallaba. Esta función hace todo junto:
--
--   1. bloquea la fila (`for update`);
--   2. comprueba que sigue siendo publicador y que NADIE la cambió desde que la
--      pantalla la leyó (`p_antes_*` deben ser exactamente lo guardado);
--   3. actualiza modalidad y overrides;
--   4. escribe la fila de `audit_logs`.
--
-- Si cualquier paso falla —incluida una bitácora incompleta— no queda nada: es la misma
-- transacción. Devuelve jsonb con `resultado`: ok | no_existe | no_publicador |
-- conflicto. La validación de QUIÉN puede, A QUIÉN y con qué motivo la hace el
-- servidor ANTES de llamarla; esta función es la que garantiza que el cambio y
-- su huella existan juntos o no existan.
create or replace function public.usuario_cambiar_permisos(
  p_uid             text,
  p_antes_tipo      text,
  p_antes_overrides jsonb,
  p_tipo            text,
  p_overrides       jsonb,
  p_audit           jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v public.usuarios%rowtype;
begin
  -- La huella tiene que estar COMPLETA o no hay cambio: quién, qué acción, antes,
  -- después y un motivo de al menos 10 caracteres (la regla de la API, también
  -- exigida aquí: la base no confía en quien la llame).
  -- Los textos se recortan con `[[:space:]]` (espacios, tabuladores, saltos de
  -- línea…), y el motivo tiene que ser una CADENA JSON (no un objeto o un
  -- arreglo que, convertido a texto, parezca largo).
  if jsonb_typeof(p_audit) is distinct from 'object'
     or length(regexp_replace(coalesce(p_audit->>'actor_uid', ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = 0
     or length(regexp_replace(coalesce(p_audit->>'accion', ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = 0
     or jsonb_typeof(p_audit->'antes') is distinct from 'object'
     or jsonb_typeof(p_audit->'despues') is distinct from 'object'
     or jsonb_typeof(p_audit->'despues'->'motivo') is distinct from 'string'
     or length(regexp_replace(p_audit->'despues'->>'motivo', '^[[:space:]]+|[[:space:]]+$', '', 'g')) < 10 then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;

  select * into v from public.usuarios where uid = p_uid for update;
  if not found then
    return jsonb_build_object('resultado', 'no_existe');
  end if;
  if v.rol is distinct from 'publicador' then
    return jsonb_build_object('resultado', 'no_publicador');
  end if;
  if v.tipo_publicador is distinct from p_antes_tipo
     or v.permisos_override is distinct from p_antes_overrides then
    return jsonb_build_object('resultado', 'conflicto');
  end if;

  update public.usuarios
     set tipo_publicador = p_tipo, permisos_override = p_overrides
   where uid = p_uid;

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (
    p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol',
    p_audit->>'accion', 'usuarios', p_uid, p_audit->'antes', p_audit->'despues'
  );

  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

comment on function public.usuario_cambiar_permisos(text, text, jsonb, text, jsonb, jsonb) is
  'Cambia modalidad y overrides de un publicador y escribe la bitácora en la MISMA transacción, con control de concurrencia (p_antes_* deben coincidir con lo guardado). Devuelve jsonb con `resultado`: ok | no_existe | no_publicador | conflicto. ADR-0013.';

-- Sólo el servidor, como `cita_crear` y `baja_de_cuenta`: ningún camino público.
revoke all on function public.usuario_cambiar_permisos(text, text, jsonb, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.usuario_cambiar_permisos(text, text, jsonb, text, jsonb, jsonb)
  to service_role;
