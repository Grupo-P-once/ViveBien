-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 31 — SUPER_ADMIN: cambios sensibles en UNA transacción (cambio + bitácora)
-- ADR-0013 / D-49 · Mismo patrón que `usuario_cambiar_permisos` (migración 28, E-27).
--
-- Dos funciones, para lo más sensible que hace un administrador:
--
--   1. `configuracion_cambiar_flag`   encender o apagar un módulo (p. ej. citasEnLinea).
--   2. `usuario_cambiar_rol_estado`   dar o quitar el rol de admin / super admin,
--                                     suspender o reactivar a alguien.
--
-- POR QUÉ: hasta ahora la ruta leía, escribía y después intentaba registrar en la
-- bitácora SIN garantía (`registrar()` nunca falla en voz alta). Con dos personas a
-- la vez (a) un flag cambiado por una se perdía porque la otra reescribía TODO el
-- JSON, y (b) un cambio de rol podía quedar sin huella. Aquí el cambio y su huella
-- son la misma transacción, con control de concurrencia (`p_antes_*` deben ser lo
-- guardado) y la huella debe estar completa.
--
-- ADITIVA: sólo crea dos funciones. No cambia datos ni esquema. Reversa:
-- 31-superadmin-mutaciones-atomicas.REVERTIR.sql
--
-- ORDEN: aplicarla ANTES de desplegar el código que las usa (el código viejo no las
-- necesita; el nuevo responde 503 si faltan, sin cambiar nada).
-- ═══════════════════════════════════════════════════════════════

-- ── 1 · Un flag ─────────────────────────────────────────────────────────
create or replace function public.configuracion_cambiar_flag(
  p_flag   text,
  p_antes  boolean,
  p_a      boolean,
  p_audit  jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v public.configuracion%rowtype;
begin
  -- Huella completa o no hay cambio: actor, acción, antes, después y motivo textual de ≥ 10.
  if jsonb_typeof(p_audit) is distinct from 'object'
     or length(regexp_replace(coalesce(p_audit->>'actor_uid', ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = 0
     or length(regexp_replace(coalesce(p_audit->>'accion', ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = 0
     or jsonb_typeof(p_audit->'antes') is distinct from 'object'
     or jsonb_typeof(p_audit->'despues') is distinct from 'object'
     or jsonb_typeof(p_audit->'despues'->'motivo') is distinct from 'string'
     or length(regexp_replace(p_audit->'despues'->>'motivo', '^[[:space:]]+|[[:space:]]+$', '', 'g')) < 10 then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  if p_antes is null or p_a is null or p_antes = p_a then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  select * into v from public.configuracion where clave = 'flags' for update;
  if not found then
    return jsonb_build_object('resultado', 'no_existe');
  end if;
  -- Sólo se cambian módulos que YA están en el JSON: no se inventan claves.
  if jsonb_typeof(v.valor) is distinct from 'object' or not (v.valor ? p_flag) then
    return jsonb_build_object('resultado', 'flag_desconocido');
  end if;
  -- Control de concurrencia: lo que la pantalla leyó tiene que ser lo que hay.
  if jsonb_typeof(v.valor->p_flag) is distinct from 'boolean' or (v.valor->>p_flag)::boolean is distinct from p_antes then
    return jsonb_build_object('resultado', 'conflicto');
  end if;

  update public.configuracion
     set valor = jsonb_set(v.valor, array[p_flag], to_jsonb(p_a)),   -- sólo ESTA clave: no reescribe las demás
         version = coalesce(version, 0) + 1,
         actualizado_por = coalesce(nullif(p_audit->>'actor_email', ''), p_audit->>'actor_uid'),
         actualizado_en = now()
   where clave = 'flags';

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (
    p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol',
    p_audit->>'accion', 'configuracion', p_flag, p_audit->'antes', p_audit->'despues'
  );

  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

comment on function public.configuracion_cambiar_flag(text, boolean, boolean, jsonb) is
  'Enciende o apaga UN módulo en configuracion.flags y escribe la bitácora en la MISMA transacción, con control de concurrencia (p_antes debe ser lo guardado) y huella completa. Devuelve jsonb con `resultado`: ok | no_existe | flag_desconocido | conflicto. D-49.';

-- ── 2 · Rol y/o estado de una cuenta ────────────────────────────────────
-- `p_rol` / `p_estado` en NULL = no cambia. Dar o quitar el nivel de admin exige motivo ≥ 10.
create or replace function public.usuario_cambiar_rol_estado(
  p_uid           text,
  p_antes_rol     text,
  p_antes_estado  text,
  p_rol           text,
  p_estado        text,
  p_audit         jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v public.usuarios%rowtype;
  v_nivel_admin boolean;
begin
  if jsonb_typeof(p_audit) is distinct from 'object'
     or length(regexp_replace(coalesce(p_audit->>'actor_uid', ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = 0
     or length(regexp_replace(coalesce(p_audit->>'accion', ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) = 0
     or jsonb_typeof(p_audit->'antes') is distinct from 'object'
     or jsonb_typeof(p_audit->'despues') is distinct from 'object' then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  if p_rol is null and p_estado is null then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  select * into v from public.usuarios where uid = p_uid for update;
  if not found then
    return jsonb_build_object('resultado', 'no_existe');
  end if;
  if v.rol is distinct from p_antes_rol or v.estado is distinct from p_antes_estado then
    return jsonb_build_object('resultado', 'conflicto');
  end if;

  -- Dar o quitar el nivel de administrador (de o hacia admin / super_admin) exige motivo textual.
  v_nivel_admin := p_rol is not null and p_rol is distinct from v.rol
                   and (v.rol in ('admin', 'super_admin') or p_rol in ('admin', 'super_admin'));
  if v_nivel_admin and (
       jsonb_typeof(p_audit->'despues'->'motivo') is distinct from 'string'
       or length(regexp_replace(p_audit->'despues'->>'motivo', '^[[:space:]]+|[[:space:]]+$', '', 'g')) < 10) then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;

  -- El candado del último super admin (trigger de la migración 21) sigue funcionando: su excepción aborta TODO.
  update public.usuarios
     set rol = coalesce(p_rol, rol),
         estado = coalesce(p_estado, estado)
   where uid = p_uid;

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (
    p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol',
    p_audit->>'accion', 'usuarios', p_uid, p_audit->'antes', p_audit->'despues'
  );

  return jsonb_build_object('resultado', 'ok');
end;
$fn$;

comment on function public.usuario_cambiar_rol_estado(text, text, text, text, text, jsonb) is
  'Cambia el rol y/o el estado de una cuenta y escribe la bitácora en la MISMA transacción, con control de concurrencia (p_antes_* deben ser lo guardado). Dar o quitar el nivel de admin exige motivo textual de ≥ 10 caracteres. Devuelve jsonb con `resultado`: ok | no_existe | conflicto. D-49.';

-- Sólo el servidor, como las demás funciones de escritura sensibles.
revoke all on function public.configuracion_cambiar_flag(text, boolean, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.configuracion_cambiar_flag(text, boolean, boolean, jsonb) to service_role;
revoke all on function public.usuario_cambiar_rol_estado(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.usuario_cambiar_rol_estado(text, text, text, text, text, jsonb) to service_role;
