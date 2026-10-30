-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 32 — INVITACIONES: aplicar el rol y aceptar la invitación en UNA transacción
-- E-30 · mismo patrón que `usuario_cambiar_permisos` (28) y las funciones de la 31 (E-27).
--
-- QUÉ ARREGLA (E-30):
--   1. P1  La invitación se marcaba «aceptada» ANTES de escribir el rol y sin mirar si la escritura salió bien:
--          si el alta o el ascenso fallaba, la invitación quedaba consumida y el rol perdido.
--   2. P2  La invitación se buscaba con `.ilike('email', correoDeLaSesion)`: el correo de la sesión se usaba como
--          PATRÓN (`_` y `%` son comodines), así que `jose_oncep@x.com` consumía la de `joseponcep@x.com`.
--   3.     Una cuenta que ya existía y NO era `cliente` nunca recibía una invitación de rango superior.
--
-- QUÉ HACE `invitacion_aplicar(p_uid, p_email, p_email_verificado)`:
--   · normaliza el correo (trim + minúsculas) y busca la invitación PENDIENTE por IGUALDAD, nunca por patrón;
--   · exige correo VERIFICADO; la identidad es el correo de la sesión, jamás un UID ni una sesión previa;
--   · si la cuenta existe: asciende SOLO si el rango invitado es MAYOR (cliente < publicador < admin < super_admin);
--     una invitación nunca baja ni iguala el rol, y no toca cuentas suspendidas / eliminadas;
--   · si la cuenta no existe: la crea ya con el rol invitado;
--   · y SOLO entonces marca la invitación «aceptada» y escribe la bitácora, TODO en la misma transacción:
--     si cualquier paso falla no queda nada (ni rol, ni «aceptada», ni huella).
--   · devuelve jsonb: { resultado: 'aplicada', rol, antes }  |  { resultado: 'omitida', motivo }.
--     Motivos: sin_correo · invitacion_no_encontrada · email_no_verificado · rol_ya_suficiente · cuenta_no_activa.
--   · `invitacion.omitida` se audita SOLO cuando hay una invitación pendiente para ese correo y no se aplicó
--     (email_no_verificado / rol_ya_suficiente / cuenta_no_activa), como máximo una vez por hora por motivo:
--     la ruta se llama en cada pantalla y no debe llenar la bitácora.
--
-- ADITIVA: solo crea una función. No cambia datos ni esquema. Reversa: 32-invitacion-aplicar-atomica.REVERTIR.sql
-- ORDEN: aplicarla ANTES de desplegar el código que la usa (sin ella el código no aplica invitaciones, pero nadie
--        deja de entrar: la ruta falla cerrado).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.invitacion_aplicar(
  p_uid               text,
  p_email             text,
  p_email_verificado  boolean
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  inv       public.invitaciones%rowtype;
  usr       public.usuarios%rowtype;
  v_existe  boolean;
  v_antes   text;
  v_rango_i int;
  v_rango_a int;
begin
  if btrim(coalesce(p_uid, '')) = '' or v_email = '' then
    return jsonb_build_object('resultado', 'omitida', 'motivo', 'sin_correo');
  end if;

  -- Una persona a la vez por uid: dos pantallas abiertas en el primer acceso no compiten por el alta.
  perform pg_advisory_xact_lock(hashtextextended(p_uid, 0));

  -- Igualdad exacta entre correos NORMALIZADOS (trim + minúsculas en los dos lados: una fila antigua con espacios o
  -- mayúsculas también se encuentra, y nada se parece «un poco»). La tabla es pequeña: no hace falta el índice.
  select * into inv
    from public.invitaciones
   where estado = 'pendiente' and lower(btrim(email)) = v_email
   order by id
   limit 1
   for update;
  if not found then
    return jsonb_build_object('resultado', 'omitida', 'motivo', 'invitacion_no_encontrada');
  end if;

  if p_email_verificado is distinct from true then
    if not exists (select 1 from public.audit_logs
                    where accion = 'invitacion.omitida' and entidad = 'invitaciones' and entidad_id = inv.id::text
                      and despues->>'motivo' = 'email_no_verificado' and creado_en > now() - interval '1 hour') then
      insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
      values (p_uid, v_email, null, 'invitacion.omitida', 'invitaciones', inv.id::text, null,
              jsonb_build_object('motivo', 'email_no_verificado', 'rol_invitado', inv.rol));
    end if;
    return jsonb_build_object('resultado', 'omitida', 'motivo', 'email_no_verificado');
  end if;

  v_rango_i := case inv.rol when 'cliente' then 1 when 'publicador' then 2 when 'admin' then 3 when 'super_admin' then 4 else 0 end;
  if v_rango_i = 0 then
    return jsonb_build_object('resultado', 'omitida', 'motivo', 'rol_ya_suficiente');   -- rol desconocido: nunca se aplica
  end if;

  select * into usr from public.usuarios where uid = p_uid for update;
  v_existe := found;

  if v_existe then
    v_antes := usr.rol;
    if usr.estado in ('suspendido', 'eliminada') then
      if not exists (select 1 from public.audit_logs
                      where accion = 'invitacion.omitida' and entidad = 'invitaciones' and entidad_id = inv.id::text
                        and despues->>'motivo' = 'cuenta_no_activa' and creado_en > now() - interval '1 hour') then
        insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
        values (p_uid, v_email, usr.rol, 'invitacion.omitida', 'invitaciones', inv.id::text, null,
                jsonb_build_object('motivo', 'cuenta_no_activa', 'rol_invitado', inv.rol));
      end if;
      return jsonb_build_object('resultado', 'omitida', 'motivo', 'cuenta_no_activa');
    end if;

    v_rango_a := case usr.rol when 'cliente' then 1 when 'publicador' then 2 when 'admin' then 3 when 'super_admin' then 4 else 5 end;
    if v_rango_i <= v_rango_a then
      -- Nunca se baja ni se iguala. La invitación queda pendiente (no se «acepta» sin haber aplicado nada).
      if not exists (select 1 from public.audit_logs
                      where accion = 'invitacion.omitida' and entidad = 'invitaciones' and entidad_id = inv.id::text
                        and despues->>'motivo' = 'rol_ya_suficiente' and creado_en > now() - interval '1 hour') then
        insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
        values (p_uid, v_email, usr.rol, 'invitacion.omitida', 'invitaciones', inv.id::text, null,
                jsonb_build_object('motivo', 'rol_ya_suficiente', 'rol_actual', usr.rol, 'rol_invitado', inv.rol));
      end if;
      return jsonb_build_object('resultado', 'omitida', 'motivo', 'rol_ya_suficiente');
    end if;

    update public.usuarios set rol = inv.rol where uid = p_uid;
  else
    v_antes := null;
    insert into public.usuarios (uid, email, rol, estado) values (p_uid, v_email, inv.rol, 'activo');
  end if;

  -- SOLO ahora, con el rol ya escrito, se acepta la invitación.
  update public.invitaciones
     set estado = 'aceptada', aceptada_en = now(), aceptada_por = p_uid
   where id = inv.id and estado = 'pendiente';

  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_uid, v_email, inv.rol, 'invitacion.aplicada', 'usuarios', p_uid,
          jsonb_build_object('rol', v_antes),
          jsonb_build_object('rol', inv.rol, 'invitacion', inv.id));

  return jsonb_build_object('resultado', 'aplicada', 'rol', inv.rol, 'antes', v_antes);
end;
$fn$;

comment on function public.invitacion_aplicar(text, text, boolean) is
  'Aplica la invitación PENDIENTE de un correo verificado (igualdad exacta, nunca patrón): sube el rol solo si el invitado es de rango MAYOR, crea la cuenta si no existe, acepta la invitación y escribe la bitácora en la MISMA transacción. Devuelve jsonb: resultado aplicada | omitida (+ motivo). E-30.';

revoke all on function public.invitacion_aplicar(text, text, boolean) from public, anon, authenticated;
grant execute on function public.invitacion_aplicar(text, text, boolean) to service_role;
