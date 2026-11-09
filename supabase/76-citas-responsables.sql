-- ═══════════════════════════════════════════════════════════════════════════
-- Vive Bien · 76 — Asignar al responsable de citas (decisión del dueño, 9-nov-2026)
--
-- Hasta hoy `propiedades.responsable_citas_uid` y `configuracion.citas.responsable_equipo_uid` solo se podían escribir con SQL a mano. Esta migración añade las dos
-- funciones ATÓMICAS que usa la pantalla `/admin/citas/responsables` (ADR-0014 §3):
--
--   · citas_asignar_responsable_propiedad(propiedad, antes, a, auditoría)  → responsable de UNA propiedad (null = sin asignar)
--   · citas_asignar_responsable_equipo(antes, a, auditoría)                → responsable del EQUIPO para las propiedades cuyo dueño no atiende citas
--
-- Mismo patrón que `configuracion_cambiar_flag` / `usuario_cambiar_permisos`: bloquea la fila, compara el «antes» que leyó la pantalla (`conflicto` → 409), cambia y
-- escribe `audit_logs` EN LA MISMA transacción, exige la huella completa (actor, acción, antes, después y un motivo de al menos 10 caracteres) y solo la ejecuta `service_role`.
-- Resultados: ok · conflicto · no_existe · responsable_invalido (la cuenta no existe o no está activa). Quién PUEDE ser responsable (que atienda citas) lo decide el servidor
-- antes de llamar: depende de capacidades que viven en TypeScript.
--
-- ADITIVA: solo crea funciones. No toca datos. Reversa: 76-citas-responsables.REVERTIR.sql. STAGING primero; Producción solo con autorización.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.citas_asignar_responsable_propiedad(p_propiedad text, p_antes text, p_a text, p_audit jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v public.propiedades%rowtype;
  u public.usuarios%rowtype;
begin
  if jsonb_typeof(p_audit) is distinct from 'object'
     or length(btrim(coalesce(p_audit->>'actor_uid', ''))) = 0
     or length(btrim(coalesce(p_audit->>'accion', ''))) = 0
     or jsonb_typeof(p_audit->'antes') is distinct from 'object'
     or jsonb_typeof(p_audit->'despues') is distinct from 'object'
     or jsonb_typeof(p_audit->'despues'->'motivo') is distinct from 'string'
     or length(btrim(p_audit->'despues'->>'motivo')) < 10 then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  if p_propiedad is null or length(btrim(p_propiedad)) = 0 or p_antes is not distinct from p_a then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  select * into v from public.propiedades where id = p_propiedad for update;
  if not found then
    return jsonb_build_object('resultado', 'no_existe');
  end if;
  if v.responsable_citas_uid is distinct from p_antes then
    return jsonb_build_object('resultado', 'conflicto');
  end if;
  if p_a is not null then
    select * into u from public.usuarios where uid = p_a;
    if not found or u.estado is distinct from 'activo' then
      return jsonb_build_object('resultado', 'responsable_invalido');
    end if;
  end if;

  update public.propiedades set responsable_citas_uid = p_a where id = p_propiedad;

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (
    p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol',
    p_audit->>'accion', 'propiedad', p_propiedad, p_audit->'antes', p_audit->'despues'
  );

  return jsonb_build_object('resultado', 'ok');
end;
$$;

create or replace function public.citas_asignar_responsable_equipo(p_antes text, p_a text, p_audit jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v public.configuracion%rowtype;
  u public.usuarios%rowtype;
begin
  if jsonb_typeof(p_audit) is distinct from 'object'
     or length(btrim(coalesce(p_audit->>'actor_uid', ''))) = 0
     or length(btrim(coalesce(p_audit->>'accion', ''))) = 0
     or jsonb_typeof(p_audit->'antes') is distinct from 'object'
     or jsonb_typeof(p_audit->'despues') is distinct from 'object'
     or jsonb_typeof(p_audit->'despues'->'motivo') is distinct from 'string'
     or length(btrim(p_audit->'despues'->>'motivo')) < 10 then
    raise exception 'auditoria_incompleta' using errcode = '22023';
  end if;
  if p_antes is not distinct from p_a then
    raise exception 'cambio_invalido' using errcode = '22023';
  end if;

  -- La fila `citas` de la configuración no existe hasta que alguien asigna al responsable del equipo por primera vez.
  insert into public.configuracion (clave, valor, actualizado_por)
  values ('citas', '{}'::jsonb, 'migracion-76')
  on conflict (clave) do nothing;

  select * into v from public.configuracion where clave = 'citas' for update;
  if (v.valor->>'responsable_equipo_uid') is distinct from p_antes then
    return jsonb_build_object('resultado', 'conflicto');
  end if;
  if p_a is not null then
    select * into u from public.usuarios where uid = p_a;
    if not found or u.estado is distinct from 'activo' then
      return jsonb_build_object('resultado', 'responsable_invalido');
    end if;
  end if;

  update public.configuracion
     set valor = case
           when p_a is null then v.valor - 'responsable_equipo_uid'
           else jsonb_set(v.valor, '{responsable_equipo_uid}', to_jsonb(p_a))
         end,
         version = coalesce(version, 0) + 1,
         actualizado_por = coalesce(nullif(p_audit->>'actor_email', ''), p_audit->>'actor_uid'),
         actualizado_en = now()
   where clave = 'citas';

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (
    p_audit->>'actor_uid', p_audit->>'actor_email', p_audit->>'actor_rol',
    p_audit->>'accion', 'configuracion', 'citas', p_audit->'antes', p_audit->'despues'
  );

  return jsonb_build_object('resultado', 'ok');
end;
$$;

revoke all on function public.citas_asignar_responsable_propiedad(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.citas_asignar_responsable_equipo(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.citas_asignar_responsable_propiedad(text, text, text, jsonb) to service_role;
grant execute on function public.citas_asignar_responsable_equipo(text, text, jsonb) to service_role;
