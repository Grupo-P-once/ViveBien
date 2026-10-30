-- ═══════════════════════════════════════════════════════════════
-- Pruebas A–O de la migración 26 (`baja_de_cuenta`), contra PostgreSQL 17.6.
--
-- Cada prueba imprime una línea `OK`/`FALLA`. Al final, el recuento.
-- Nada de esto toca producción.
-- ═══════════════════════════════════════════════════════════════

\set ON_ERROR_STOP off
\pset pager off

create table if not exists resultados (n serial, prueba text, ok boolean, detalle text);

create or replace function comprobar(p_prueba text, p_ok boolean, p_detalle text default '') returns void
language plpgsql as $$
begin
  insert into resultados (prueba, ok, detalle) values (p_prueba, p_ok, p_detalle);
  raise notice '%  %  %', case when p_ok then 'OK   ' else 'FALLA' end, rpad(p_prueba, 52), p_detalle;
end $$;

-- ── ESTADO ANTES ─────────────────────────────────────────────────────────
\echo ''
\echo '════ ESTADO ANTES ════'
select rol, estado, count(*) from usuarios group by 1,2 order by 1,2;
select 'propiedades con dueño' k, count(*) v from propiedades where owner_id is not null
union all select 'con gestión', count(*) from propiedades where gestion is not null
union all select 'invitaciones pendientes', count(*) from invitaciones where estado='pendiente'
union all select 'citas bloqueadas', count(*) from citas where bloqueado_en is not null
union all select 'solicitudes bloqueadas', count(*) from solicitudes_contacto where bloqueado_en is not null
union all select 'favoritos', count(*) from favoritos
union all select 'busquedas', count(*) from busquedas_guardadas
union all select 'bajas', count(*) from bajas_de_cuenta;

-- ═══ N · PERMISOS ════════════════════════════════════════════════════════
\echo ''
\echo '════ PRUEBAS ════'
-- El DUEÑO (postgres) conserva siempre sus privilegios y no se le pueden
-- quitar: es inherente a PostgreSQL. Lo que importa es que NADIE más pueda.
select comprobar('N · service_role SÍ puede ejecutarla',
  has_function_privilege('service_role','public.baja_de_cuenta(text,text,timestamptz,text)','execute'));

select comprobar('O · anon, authenticated y public NO pueden ejecutarla',
  not has_function_privilege('anon','public.baja_de_cuenta(text,text,timestamptz,text)','execute')
  and not has_function_privilege('authenticated','public.baja_de_cuenta(text,text,timestamptz,text)','execute')
  and not has_function_privilege('public','public.baja_de_cuenta(text,text,timestamptz,text)','execute'),
  (select coalesce(string_agg(grantee, ','), '(nadie)') from information_schema.role_routine_grants
    where routine_name = 'baja_de_cuenta'));

select comprobar('N · la función es SECURITY INVOKER',
  (select not prosecdef from pg_proc where proname = 'baja_de_cuenta'));

select comprobar('N · search_path fijado a vacío',
  (select proconfig @> array['search_path=""'] from pg_proc where proname = 'baja_de_cuenta'),
  (select array_to_string(proconfig,'|') from pg_proc where proname = 'baja_de_cuenta'));

-- ═══ D · USUARIO INEXISTENTE ═════════════════════════════════════════════
select comprobar('D · uid inexistente → no_existe, sin tocar nada',
  (select public.baja_de_cuenta('uid-que-no-existe')->>'resultado') = 'no_existe'
  and (select count(*) from usuarios where estado = 'eliminada') = 0
  and (select count(*) from bajas_de_cuenta) = 0);

-- ═══ C · ÚLTIMO SUPER ADMIN ══════════════════════════════════════════════
-- Con dos super admins vivos, el primero SÍ puede.
select comprobar('C1 · super admin con otro activo → sí puede',
  (select public.baja_de_cuenta('u-super-1')->>'resultado') = 'bloqueada');

-- Ahora u-super-2 es el último: debe rechazarse SIN cambiar nada.
select comprobar('C2 · ÚLTIMO super admin → rechazado',
  (select public.baja_de_cuenta('u-super-2')->>'resultado') = 'ultimo_super_admin'
  and (select estado from usuarios where uid = 'u-super-2') = 'activo'
  and (select email from usuarios where uid = 'u-super-2') is not null
  and (select count(*) from bajas_de_cuenta where uid = 'u-super-2') = 0,
  'la cuenta sigue activa y con correo');

-- ═══ A · BAJA NORMAL (cliente) ═══════════════════════════════════════════
select comprobar('A · baja de cliente → bloqueada',
  (select public.baja_de_cuenta('u-cliente','titular',now(),'ya no lo necesito')->>'resultado') = 'bloqueada');

select comprobar('A · lápida: estado, rol y PII',
  (select estado = 'eliminada' and rol = 'cliente' and email is null and nombre is null
      and telefono is null and whatsapp is null and foto_url is null and zonas is null
      and busca_operacion is null and busca_zonas is null and busca_tipos is null
      and presupuesto_max is null and completitud = 0 and bienvenida_vista = false
      and ultimo_acceso is null
     from usuarios where uid = 'u-cliente'));

select comprobar('I · el correo queda LIBRE para una cuenta nueva',
  (select count(*) from usuarios where lower(email) = 'ana.ficticia@ejemplo.invalid') = 0);

-- Y de verdad se puede volver a registrar con ese correo.
insert into usuarios (uid, email, rol) values ('u-cliente-nuevo','ana.ficticia@ejemplo.invalid','cliente');
select comprobar('I · alta nueva con el mismo correo funciona',
  (select rol from usuarios where uid = 'u-cliente-nuevo') = 'cliente'
  and (select estado from usuarios where uid = 'u-cliente') = 'eliminada',
  'U1 ≠ U2, U1 sigue eliminada');

select comprobar('J · invitación pendiente de ese correo → revocada',
  (select estado from invitaciones where lower(email) = 'ana.ficticia@ejemplo.invalid') = 'revocada_por_baja'
  and (select estado from invitaciones where lower(email) = 'zoe.ficticia@ejemplo.invalid') = 'pendiente',
  'la de otra persona sigue pendiente');

select comprobar('K · preferencias suprimidas',
  (select count(*) from favoritos where uid = 'u-cliente') = 0
  and (select count(*) from busquedas_guardadas where uid = 'u-cliente') = 0
  and (select count(*) from favoritos where uid = 'u-cliente-2') = 1,
  'las de otra persona intactas');

select comprobar('K · citas y solicitudes de la persona, bloqueadas',
  (select bloqueado_en is not null from citas where cliente_uid = 'u-cliente')
  and (select bloqueado_en is not null from solicitudes_contacto where cliente_uid = 'u-cliente')
  and (select bloqueado_en is null from solicitudes_contacto where cliente_uid = 'u-cliente-2'));

select comprobar('K · la vista enmascara la PII bloqueada (texto libre incluido)',
  (select nombre is null and telefono is null and email is null and mensaje is null
     from solicitudes_contacto_operativas where cliente_uid = 'u-cliente')
  and (select cliente_nombre is null and cliente_telefono is null and notas_cliente is null
     from citas_operativas where cliente_uid = 'u-cliente'));

select comprobar('L · hechos y consentimientos preservados',
  (select count(*) from citas where cliente_uid = 'u-cliente') = 1
  and (select consentimiento_version is not null and consentimiento_en is not null
         from citas where cliente_uid = 'u-cliente')
  and (select count(*) from solicitudes_contacto where cliente_uid = 'u-cliente') = 1
  and (select tipo from solicitudes_contacto where cliente_uid = 'u-cliente') = 'informacion');

select comprobar('M · referencias: creada_por y eventos.uid desasociados',
  (select creada_por is null from citas where cliente_uid = 'u-cliente')
  and (select count(*) from eventos where uid = 'u-cliente') = 0);

select comprobar('M · bitácora CONSERVADA, sólo se va el correo',
  (select count(*) from audit_logs where actor_uid = 'u-cliente') = 1
  and (select actor_email is null from audit_logs where actor_uid = 'u-cliente')
  and (select count(*) from citas_eventos where actor_uid = 'u-cliente') = 1,
  'actor_uid intacto');

-- ═══ E · IDEMPOTENCIA ════════════════════════════════════════════════════
select comprobar('E · repetir la baja → ya_eliminada, sin repetir nada',
  (select public.baja_de_cuenta('u-cliente')->>'resultado') = 'ya_eliminada'
  and (select public.baja_de_cuenta('u-cliente')->>'estado_proceso') = 'bloqueada'
  and (select count(*) from bajas_de_cuenta where uid = 'u-cliente') = 1);

-- ═══ B · BAJA DE PUBLICADOR ══════════════════════════════════════════════
select comprobar('B · baja de publicador → bloqueada',
  (select public.baja_de_cuenta('u-publicador')->>'resultado') = 'bloqueada');

select comprobar('H · propiedades SIGUEN publicadas + requiere_gestion',
  (select count(*) from propiedades
    where owner_id = 'u-publicador' and estatus = 'disponible'
      and estado_pub = 'publicada' and gestion = 'requiere_gestion') = 2
  and (select gestion from propiedades where id = 'p-3') is null,
  'la que no era suya, sin marcar');

select comprobar('H · agenda y credenciales del publicador suprimidas',
  (select count(*) from calendarios_google where asesor_uid = 'u-publicador') = 0
  and (select count(*) from disponibilidad_asesores where asesor_uid = 'u-publicador') = 0
  and (select count(*) from bloqueos_asesores where asesor_uid = 'u-publicador') = 0
  and (select count(*) from ajustes_citas where asesor_uid = 'u-publicador') = 0
  and (select count(*) from google_oauth_estados where uid = 'u-publicador') = 0);

select comprobar('M · revisado_por (que guarda un CORREO) desasociado',
  (select count(*) from propiedades where revisado_por = 'carla.ficticia@ejemplo.invalid') = 0);

select comprobar('P-3 · la cita que atendía como ASESOR no se toca',
  (select count(*) from citas where asesor_uid = 'u-publicador') = 1,
  'decisión de negocio abierta');

-- ═══ F · ROLLBACK POR ERROR A MITAD ══════════════════════════════════════
-- Un disparador que revienta al marcar propiedades: la función ya escribió la
-- lápida antes de llegar ahí, así que si el rollback NO fuera total, la cuenta
-- quedaría eliminada con las propiedades sin marcar.
create or replace function reventar() returns trigger language plpgsql as $$
begin raise exception 'fallo_intencional_de_prueba'; end $$;
create trigger t_reventar before update on public.propiedades
  for each row execute function reventar();

do $$
declare v_res text;
begin
  begin
    perform public.baja_de_cuenta('u-admin');
    v_res := 'no_lanzo';
  exception when others then
    v_res := 'lanzo';
  end;
  perform comprobar('F · error a mitad → la función aborta', v_res = 'lanzo');
end $$;

select comprobar('F · ROLLBACK TOTAL: nada quedó a medias',
  (select estado from usuarios where uid = 'u-admin') = 'activo'
  and (select email from usuarios where uid = 'u-admin') is not null
  and (select nombre from usuarios where uid = 'u-admin') is not null
  and (select count(*) from bajas_de_cuenta where uid = 'u-admin') = 0
  and (select estado from invitaciones where lower(email) = 'dario.ficticio@ejemplo.invalid') = 'aceptada',
  'cuenta activa, con correo, con nombre y sin baja');

drop trigger t_reventar on public.propiedades;

-- ═══ G · DOBLE BAJA ══════════════════════════════════════════════════════
-- OJO: las dos llamadas van en sentencias SEPARADAS a propósito. Dentro de una
-- misma sentencia, todas las subconsultas ven la MISMA instantánea, así que la
-- segunda llamada no vería la baja de la primera y devolvería `bloqueada` otra
-- vez. Eso es cómo funciona PostgreSQL, no un fallo de la función — pero si se
-- escribe la prueba en una sola sentencia, parece que lo es.
select comprobar('G1 · primera llamada → bloqueada',
  (select public.baja_de_cuenta('u-admin')->>'resultado') = 'bloqueada');
select comprobar('G2 · segunda llamada → ya_eliminada, sin duplicar',
  (select public.baja_de_cuenta('u-admin')->>'resultado') = 'ya_eliminada'
  and (select count(*) from bajas_de_cuenta where uid = 'u-admin') = 1);
select comprobar('G3 · tercera llamada → sigue siendo idempotente',
  (select public.baja_de_cuenta('u-admin')->>'resultado') = 'ya_eliminada'
  and (select count(*) from bajas_de_cuenta where uid = 'u-admin') = 1);

-- ── ESTADO DESPUÉS ───────────────────────────────────────────────────────
\echo ''
\echo '════ ESTADO DESPUÉS ════'
select uid, rol, estado, (email is null) as sin_correo, (nombre is null) as sin_nombre
  from usuarios order by uid;
select uid, estado, (bloqueada_en is not null) as bloqueada from bajas_de_cuenta order by uid;
select id, estatus, estado_pub, owner_id, gestion from propiedades order by id;

\echo ''
\echo '════ RESUMEN ════'
select count(*) filter (where ok) as pasaron, count(*) filter (where not ok) as fallaron, count(*) as total
  from resultados;
select prueba, detalle from resultados where not ok;
