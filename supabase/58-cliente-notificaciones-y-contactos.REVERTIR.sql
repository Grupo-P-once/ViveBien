-- Reversa de 58-cliente-notificaciones-y-contactos.sql — SEGURA POR CONSTRUCCIÓN (28-oct-2026): una sola transacción que
--   (1) RESTAURA `baja_de_cuenta` a la definición de la migración 26 y (2) borra lo nuevo.
-- Por qué en ese orden y juntas: la función de la 58 borra de tablas que esta reversa elimina; si solo se borraran las tablas, la baja de cuenta fallaría
-- para TODOS (lo demuestra tests/migracion-58-reversa-funcion.test.ts, caso «NEGATIVA»).
-- ⚠ EN UN ENTORNO REAL: antes de aplicar la 58, guardar la definición VIVA (`select pg_get_functiondef('public.baja_de_cuenta(text,text,timestamptz,text)'::regprocedure)`).
--   Si difiere del bloque de abajo (que es el de la 26), sustituir el bloque por la guardada: la vigente manda, no el archivo.
-- Pierde el historial de contactos, la bandeja de notificaciones y las preferencias de aviso de todos los clientes (los datos de las otras tablas no se tocan).
begin;

-- ── 1 · Función: la definición anterior a la 58 (bloque literal de la 26) ───────────────────────────────────────────────
create or replace function public.baja_de_cuenta(
  p_uid            text,
  p_solicitada_por text        default 'titular',
  p_auth_time      timestamptz default now(),
  p_motivo         text        default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_email        text;
  v_rol          text;
  v_estado       text;
  v_proceso      text;
  v_super_vivos  integer;
  n_propiedades  integer := 0;
  n_invitaciones integer := 0;
  n_citas        integer := 0;
  n_solicitudes  integer := 0;
  n_preferencias integer := 0;
  n_referencias  integer := 0;
begin
  -- ── 0 · CAPTURAR ANTES DE TOCAR NADA ─────────────────────────────────
  --
  -- `for update` bloquea la fila: dos peticiones simultáneas se ponen en cola
  -- en vez de pisarse. La segunda encontrará `estado = 'eliminada'` y saldrá
  -- por el camino idempotente.
  --
  -- El correo se guarda AQUÍ porque después vale null, y hace falta para las
  -- invitaciones (que se buscan por correo) y para `propiedades.revisado_por`
  -- (que guarda un correo, no un uid).
  select u.email, u.rol, u.estado
    into v_email, v_rol, v_estado
    from public.usuarios u
   where u.uid = p_uid
     for update;

  -- ── 1 · CUENTA INEXISTENTE ───────────────────────────────────────────
  if not found then
    return jsonb_build_object('resultado', 'no_existe', 'uid', p_uid);
  end if;

  -- ── 2 · CUENTA YA ELIMINADA: idempotente, sin repetir nada ───────────
  if v_estado = 'eliminada' then
    select b.estado into v_proceso from public.bajas_de_cuenta b where b.uid = p_uid;
    return jsonb_build_object(
      'resultado',      'ya_eliminada',
      'uid',            p_uid,
      'estado_cuenta',  v_estado,
      'estado_proceso', coalesce(v_proceso, 'sin_registro')
    );
  end if;

  -- ── 3 · ÚLTIMO SUPER ADMIN ACTIVO: se rechaza sin tocar nada ─────────
  if v_rol = 'super_admin' then
    select count(*) into v_super_vivos
      from public.usuarios u
     where u.rol = 'super_admin' and u.estado = 'activo';
    if v_super_vivos <= 1 then
      return jsonb_build_object(
        'resultado',     'ultimo_super_admin',
        'uid',           p_uid,
        'estado_cuenta', v_estado
      );
    end if;
  end if;

  -- ═══ A PARTIR DE AQUÍ SE ESCRIBE. Si algo falla, plpgsql aborta y ═══
  -- ═══ PostgreSQL revierte TODO lo de esta función.                 ═══

  -- ── 4 · LA LÁPIDA ────────────────────────────────────────────────────
  -- El correo a null (deja el correo libre para un alta nueva), el rol a
  -- cliente (una lápida no conserva poderes), la PII del perfil disociada y
  -- las preferencias suprimidas. `uid` y `creado_en` NO se tocan: sostienen
  -- las siete claves foráneas.
  update public.usuarios set
    estado                   = 'eliminada',
    email                    = null,
    rol                      = 'cliente',
    nombre                   = null,
    telefono                 = null,
    whatsapp                 = null,
    foto_url                 = null,
    inmobiliaria             = null,
    biografia                = null,
    zonas                    = null,
    busca_operacion          = null,
    busca_zonas              = null,
    busca_tipos              = null,
    presupuesto_max          = null,
    completitud              = 0,
    bienvenida_vista         = false,
    ultimo_acceso            = null,
    notificaciones_vistas_en = null,
    actualizado_en           = now()
  where uid = p_uid;

  -- ── 5 · EL REGISTRO DEL PROCESO ──────────────────────────────────────
  -- Una fila por cuenta (la clave primaria es el uid). Si ya existía de un
  -- intento anterior, se actualiza en vez de duplicar.
  insert into public.bajas_de_cuenta (uid, estado, solicitada_por, auth_time, motivo, bloqueada_en)
  values (p_uid, 'bloqueada', p_solicitada_por, p_auth_time, p_motivo, now())
  on conflict (uid) do update set
    estado       = 'bloqueada',
    bloqueada_en = coalesce(public.bajas_de_cuenta.bloqueada_en, now()),
    auth_time    = excluded.auth_time,
    motivo       = coalesce(excluded.motivo, public.bajas_de_cuenta.motivo),
    ultimo_error = null;

  -- ── 6 · INVITACIONES PENDIENTES DE ESE CORREO ────────────────────────
  -- Se aplican POR CORREO, así que sin esto una cuenta nueva con el mismo
  -- correo nacería con el rol invitado. Se BLOQUEAN, no se borran: son
  -- historial de quién invitó a quién.
  if v_email is not null then
    update public.invitaciones
       set estado = 'revocada_por_baja'
     where estado = 'pendiente'
       and lower(email) = lower(v_email);
    get diagnostics n_invitaciones = row_count;
  end if;

  -- ── 7 · PROPIEDADES DEL PUBLICADOR (P-1 = A) ─────────────────────────
  -- NO se despublican, NO se borran y NO se reasignan. `estatus` y `owner_id`
  -- quedan intactos; sólo se marcan para que VIVE BIEN decida después.
  update public.propiedades
     set gestion = 'requiere_gestion'
   where owner_id = p_uid
     and gestion is distinct from 'requiere_gestion';
  get diagnostics n_propiedades = row_count;

  -- ── 8 · CITAS: se bloquea la PII, la cita se conserva (P-2) ──────────
  -- Sólo las citas donde esta persona era el CLIENTE. Las que atendía como
  -- asesor son P-3, decisión de negocio abierta: no se tocan.
  update public.citas
     set bloqueado_en = now()
   where cliente_uid = p_uid
     and bloqueado_en is null;
  get diagnostics n_citas = row_count;

  -- ── 9 · SOLICITUDES DE CONTACTO: igual ───────────────────────────────
  -- Sólo como cliente. `owner_id = p_uid` es la referencia al publicador que
  -- debía atenderla, no PII de esta persona: se conserva.
  update public.solicitudes_contacto
     set bloqueado_en = now()
   where cliente_uid = p_uid
     and bloqueado_en is null;
  get diagnostics n_solicitudes = row_count;

  -- El texto libre (`citas.notas_cliente`, `solicitudes_contacto.mensaje`)
  -- queda bloqueado con lo anterior: las vistas `*_operativas` lo devuelven
  -- nulo mientras `bloqueado_en` no sea nulo. No se borra aquí, porque P-2
  -- decidió bloqueo inmediato y supresión posterior según la política legal.

  -- ── 10 · SUPRESIONES: preferencias, agenda y credenciales ────────────
  -- Desaparecen. No son historial: son ajustes de una cuenta que ya no existe.
  -- `calendarios_google` guarda credenciales de OAuth: su supresión no es
  -- opcional.
  delete from public.favoritos             where uid = p_uid;
  get diagnostics n_preferencias = row_count;
  delete from public.busquedas_guardadas   where uid = p_uid;
  delete from public.google_oauth_estados  where uid = p_uid;
  delete from public.calendarios_google    where asesor_uid = p_uid;
  delete from public.disponibilidad_asesores where asesor_uid = p_uid;
  delete from public.bloqueos_asesores     where asesor_uid = p_uid;
  delete from public.ajustes_citas         where asesor_uid = p_uid;

  -- ── 11 · DESASOCIACIONES ─────────────────────────────────────────────
  -- La fila se queda; deja de llevar a la persona.

  -- `revisado_por` guarda un CORREO, no un uid (hallazgo K-28). Se limpia
  -- sólo donde es el de esta persona.
  if v_email is not null then
    update public.propiedades set revisado_por = null where revisado_por = v_email;
    get diagnostics n_referencias = row_count;
    -- La bitácora se CONSERVA íntegra (es el registro de quién hizo qué,
    -- incluida esta baja). Lo que se va es el correo, que sí es PII directa.
    update public.audit_logs set actor_email = null where actor_email = v_email;
  end if;

  update public.citas   set creada_por = null where creada_por = p_uid;
  update public.eventos set uid        = null where uid = p_uid;

  -- `citas.propuesta_por` NO se toca: comprobado contra el catálogo real, su
  -- CHECK es `in ('cliente','asesor','admin')`. Guarda un ROL, no un uid, así
  -- que nunca apunta a nadie. Mi matriz lo tenía mal clasificado; lo cazó el
  -- esquema fiel del contenedor de pruebas.

  -- Se CONSERVAN a propósito, por obligación probatoria o de trazabilidad:
  --   · audit_logs.actor_uid        (NOT NULL; la bitácora no se toca)
  --   · citas_eventos.actor_uid     (bitácora de citas)
  --   · configuracion.actualizado_por (quién cambió un flag)
  --   · invitaciones.aceptada_por / invitado_por (historial de invitaciones)
  --   · consentimiento_en / consentimiento_version en citas y solicitudes
  --   · propiedades, citas y solicitudes como filas

  -- ── 12 · RESULTADO, SIN PII ──────────────────────────────────────────
  return jsonb_build_object(
    'resultado',      'bloqueada',
    'uid',            p_uid,
    'estado_cuenta',  'eliminada',
    'estado_proceso', 'bloqueada',
    'era_rol',        v_rol,
    'afectadas',      jsonb_build_object(
      'propiedades',  n_propiedades,
      'invitaciones', n_invitaciones,
      'citas',        n_citas,
      'solicitudes',  n_solicitudes,
      'favoritos',    n_preferencias,
      'revisiones',   n_referencias
    )
  );
end;
$$;

-- ── 2 · Lo nuevo ────────────────────────────────────────────────────────────────────────────────────────────────────────
drop table if exists public.cliente_contactos;
drop table if exists public.notificaciones;
drop table if exists public.preferencias_notificacion;
alter table public.busquedas_guardadas drop constraint if exists busquedas_guardadas_frecuencia_ck;
alter table public.busquedas_guardadas drop column if exists avisada_en;
alter table public.busquedas_guardadas drop column if exists frecuencia;

commit;
