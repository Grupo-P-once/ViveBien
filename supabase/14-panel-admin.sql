-- ═══════════════════════════════════════════════════════════════════════
-- 14 · Panel de administración nuevo (V-1.1.71)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Lo que el panel nuevo necesita guardar y hoy no existe:
--
--  1. usuarios.ultimo_acceso — cuándo entró alguien por última vez. Se
--     actualiza en GET /api/usuarios/me, como mucho una vez cada 10 minutos.
--
--  2. usuarios.notificaciones_vistas_en — hasta dónde leyó cada administrador
--     sus notificaciones. Por persona y en la base, no en el navegador: si no,
--     lo leído en el teléfono seguiría saliendo como nuevo en la computadora.
--
--  3. invitaciones — alta de usuarios por invitación. El sitio no tiene
--     firebase-admin (valida tokens con las claves públicas de Google), así que
--     no puede crear cuentas: la invitación reserva el rol para un correo, y se
--     aplica la primera vez que esa persona entra con ESE correo verificado.
--
-- Todo es ADITIVO: columnas que aceptan nulo y una tabla nueva. Nada de lo que
-- existe cambia, así que el sitio sigue igual aunque esto se aplique antes del
-- despliegue.
--
-- La 13 queda reservada para el arreglo de los avisos de seguridad de Supabase
-- (propuesto el 16-sep, pendiente de OK).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.usuarios add column if not exists ultimo_acceso timestamptz;
alter table public.usuarios add column if not exists notificaciones_vistas_en timestamptz;

create table if not exists public.invitaciones (
  id           bigint generated always as identity primary key,
  email        text not null,
  nombre       text,
  rol          text not null check (rol in ('cliente', 'publicador', 'admin')),
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'aceptada', 'cancelada')),
  invitado_por text not null,
  creado_en    timestamptz not null default now(),
  enviado_en   timestamptz,
  aceptada_en  timestamptz,
  aceptada_por text
);

-- Una sola invitación pendiente por correo, sin distinguir mayúsculas.
create unique index if not exists invitaciones_email_pendiente
  on public.invitaciones (lower(email))
  where estado = 'pendiente';

-- Sólo la toca el servidor, con la clave de servicio: RLS activado, sin
-- políticas y nada concedido a anon ni a authenticated.
alter table public.invitaciones enable row level security;
revoke all on table public.invitaciones from anon, authenticated;

notify pgrst, 'reload schema';
