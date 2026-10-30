-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 25 — Baja de cuenta (fase 3b-3, D-35)
-- V-1.1.87 · ADITIVA salvo dos CHECK que se AMPLÍAN y dos NOT NULL que se
-- SUELTAN. Ningún dato existente deja de ser válido. Idempotente.
--
-- NO EJECUTAR todavía. Antes: respaldo · ensayo en PGlite · ensayo en
-- producción dentro de una transacción revertida · evidencia antes/después.
-- Revertir con `25-baja-de-cuenta.REVERTIR.sql`.
--
-- Política (D-35): eliminar cuenta = cierre IRREVERSIBLE de esa cuenta +
-- poder volver a registrarse con el mismo correo, siempre como cuenta nueva
-- que no hereda nada. La identidad es el UID de Firebase; el correo es
-- credencial y contacto, nunca identidad histórica.
--
-- Diseño completo: docs/fase-3/DISENO_BAJA_DE_CUENTA.md
-- ═══════════════════════════════════════════════════════════════

begin;

-- ── A · El correo puede faltar, pero sólo en una cuenta cerrada ──────────
--
-- `usuarios_email_idx` es UNIQUE sobre lower(email) y NO se toca: está
-- comprobado que `indnullsnotdistinct = false` (NULLS DISTINCT), así que
-- admite tantas lápidas con email nulo como haga falta y sigue impidiendo
-- correos repetidos entre cuentas vivas.

alter table public.usuarios alter column email drop not null;

alter table public.usuarios drop constraint if exists usuarios_estado_check;
alter table public.usuarios add constraint usuarios_estado_check
  check (estado in ('activo','suspendido','pendiente','eliminada'));

alter table public.usuarios drop constraint if exists usuarios_email_solo_falta_si_eliminada;
alter table public.usuarios add constraint usuarios_email_solo_falta_si_eliminada
  check (email is not null or estado = 'eliminada');

comment on column public.usuarios.email is
  'Correo de la cuenta. NULO sólo en una cuenta eliminada (lápida): así el correo queda libre para un alta nueva.';


-- ── B · El procedimiento de baja ────────────────────────────────────────
--
-- La clave primaria es el uid: una cuenta tiene COMO MUCHO una baja, y una
-- segunda llamada retoma la que hay en vez de empezar otra. Ahí está la
-- idempotencia.

create table if not exists public.bajas_de_cuenta (
  uid                   text primary key references public.usuarios(uid),
  estado                text not null default 'solicitada'
                        check (estado in ('solicitada','bloqueada','firebase_eliminada',
                                          'datos_procesados','completada','error')),
  solicitada_por        text not null check (solicitada_por in ('titular','admin')),
  auth_time             timestamptz not null,
  motivo                text,

  solicitada_en         timestamptz not null default now(),
  bloqueada_en          timestamptz,
  firebase_eliminada_en timestamptz,
  procesada_en          timestamptz,
  completada_en         timestamptz,

  bloqueo_revisar_en    date,
  intentos              smallint not null default 0,
  ultimo_intento_en     timestamptz,
  ultimo_error          text
);

comment on table  public.bajas_de_cuenta is
  'Avance del procedimiento de baja. `usuarios.estado` dice si la cuenta entra; esta tabla, en qué paso va el proceso.';
comment on column public.bajas_de_cuenta.auth_time is
  'Momento de la reautenticación que autorizó la baja (claim auth_time del token). El servidor exige <= 5 min.';
comment on column public.bajas_de_cuenta.bloqueo_revisar_en is
  'Vía B: cuándo toca revisar la supresión de lo que quedó bloqueado. El plazo lo fija la política legal (P-4).';

alter table public.bajas_de_cuenta enable row level security;  -- sin políticas: deny-by-default
revoke all on public.bajas_de_cuenta from anon, authenticated;

create index if not exists bajas_de_cuenta_pendientes_idx
  on public.bajas_de_cuenta (estado) where estado <> 'completada';


-- ── C · Invitaciones: que una re-alta no herede rol ─────────────────────
--
-- Se aplican por CORREO (`aplicarInvitacion`), así que sin esto una cuenta
-- nueva con el mismo correo nacería con el rol invitado. Al dar de baja se
-- BLOQUEAN (no se borran: son historial de quién invitó a quién).

alter table public.invitaciones drop constraint if exists invitaciones_estado_check;
alter table public.invitaciones add constraint invitaciones_estado_check
  check (estado in ('pendiente','aceptada','cancelada','revocada_por_baja'));


-- ── D · P-1 = A · La propiedad requiere gestión, sin despublicarse ──────
--
-- Columna NUEVA a propósito, no un valor de `estatus`: el estatus comercial
-- es lo que ve el público y no debe cambiar porque su publicador se vaya.

alter table public.propiedades add column if not exists gestion text;
alter table public.propiedades drop constraint if exists propiedades_gestion_check;
alter table public.propiedades add constraint propiedades_gestion_check
  check (gestion is null or gestion in ('requiere_gestion'));

comment on column public.propiedades.gestion is
  'Marca interna. `requiere_gestion` = su publicador se dio de baja y VIVE BIEN debe decidir: pausar, continuar o reasignar. NO cambia `estatus`.';

create index if not exists propiedades_gestion_idx
  on public.propiedades (gestion) where gestion is not null;


-- ── E · P-2 · Bloqueo operativo de la PII de contacto ───────────────────
--
-- Bloqueo inmediato y supresión posterior: al cerrar la cuenta, los datos de
-- contacto quedan FUERA DE TODO USO OPERATIVO. Siguen guardados sólo mientras
-- sea necesario conservarlos; la supresión definitiva llega con la política
-- legal aprobada (P-4).
--
-- `citas.creada_por` pasa a nullable para poder disociarla (matriz, fila 6).

alter table public.citas                add column if not exists bloqueado_en timestamptz;
alter table public.solicitudes_contacto add column if not exists bloqueado_en timestamptz;
alter table public.citas alter column creada_por drop not null;

comment on column public.citas.bloqueado_en is
  'Cuándo quedó bloqueada la PII de contacto de esta cita (baja de la cuenta). Leer siempre por `citas_operativas`.';
comment on column public.solicitudes_contacto.bloqueado_en is
  'Cuándo quedó bloqueada la PII de contacto de esta solicitud. Leer siempre por `solicitudes_contacto_operativas`.';

-- Las vistas son el punto único donde el bloqueo se hace efectivo: la
-- aplicación lee ESTO, nunca las columnas de contacto de la tabla. Una prueba
-- de guarda falla si algún archivo del servidor se salta la vista.

create or replace view public.citas_operativas
with (security_invoker = true) as
select
  c.id, c.propiedad_id, c.cliente_uid, c.asesor_uid,
  c.inicio, c.fin, c.margen_min, c.ocupa_desde, c.ocupa_hasta, c.zona_horaria,
  c.estado, c.estado_previo, c.version,
  c.propuesta_inicio, c.propuesta_fin, c.propuesta_por,
  case when c.bloqueado_en is null then c.cliente_nombre   end as cliente_nombre,
  case when c.bloqueado_en is null then c.cliente_telefono end as cliente_telefono,
  case when c.bloqueado_en is null then c.cliente_email    end as cliente_email,
  case when c.bloqueado_en is null then c.notas_cliente    end as notas_cliente,
  c.consentimiento_version, c.consentimiento_en,
  c.propiedad_titulo, c.lugar, c.notas_internas, c.motivo_cancelacion,
  c.google_event_id, c.google_sync, c.google_error, c.google_intentos,
  c.clave_idempotencia, c.creada_por, c.creada_en, c.actualizada_en,
  c.bloqueado_en
from public.citas c;

create or replace view public.solicitudes_contacto_operativas
with (security_invoker = true) as
select
  s.id, s.cliente_uid, s.propiedad_id, s.owner_id,
  case when s.bloqueado_en is null then s.nombre   end as nombre,
  case when s.bloqueado_en is null then s.telefono end as telefono,
  case when s.bloqueado_en is null then s.email    end as email,
  case when s.bloqueado_en is null then s.mensaje  end as mensaje,
  s.propiedad_titulo, s.tipo, s.visita_preferida,
  s.consentimiento_en, s.consentimiento_version,
  s.whatsapp_estado, s.whatsapp_id, s.whatsapp_error,
  s.origen, s.creado_en, s.bloqueado_en
from public.solicitudes_contacto s;

revoke all on public.citas_operativas                from anon, authenticated;
revoke all on public.solicitudes_contacto_operativas from anon, authenticated;

comment on view public.citas_operativas is
  'Citas con la PII de contacto enmascarada cuando `bloqueado_en` no es nulo. La aplicación lee esta vista, no la tabla.';
comment on view public.solicitudes_contacto_operativas is
  'Solicitudes con la PII de contacto enmascarada cuando `bloqueado_en` no es nulo. La aplicación lee esta vista, no la tabla.';

commit;

-- ═══════════════════════════════════════════════════════════════
-- DECISIÓN QUE HAY QUE CONFIRMAR ANTES DE APLICAR
--
-- Las vistas enmascaran también `citas.notas_cliente` y
-- `solicitudes_contacto.mensaje`: son texto libre que escribe la persona y
-- suelen llevar su nombre, su teléfono o dónde vive. No estaba en lo aprobado
-- literalmente (que hablaba de nombre, teléfono y correo), así que lo dejo
-- marcado: si se prefiere conservarlos visibles, se quitan esas dos líneas.
--
-- VERIFICACIÓN DESPUÉS DE APLICAR
--   select count(*) from public.bajas_de_cuenta;                        -- 0
--   select is_nullable from information_schema.columns
--     where table_name='usuarios' and column_name='email';              -- YES
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conname='usuarios_email_solo_falta_si_eliminada';
--   select indnullsnotdistinct from pg_index
--     where indexrelid='usuarios_email_idx'::regclass;                   -- false
--   select count(*) from public.propiedades where gestion is not null;   -- 0
--   select count(*) from public.citas_operativas;                        -- 0
-- ═══════════════════════════════════════════════════════════════
