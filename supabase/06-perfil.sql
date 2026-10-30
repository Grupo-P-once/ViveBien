-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · V-1.1.10 — perfil de usuario y onboarding
-- Ejecutar en: Supabase → SQL Editor → Run
-- Requisito previo: supabase/02-usuarios.sql
--
-- Por qué: hoy un publicador puede publicar sin haber dado teléfono ni
-- WhatsApp. La ficha sale al público y el interesado no tiene a quién
-- escribir. La propiedad está completa y el negocio no.
-- ═══════════════════════════════════════════════════════════════

-- ── Contacto y presentación del publicador ─────────────────────
alter table public.usuarios add column if not exists whatsapp      text;
alter table public.usuarios add column if not exists foto_url      text;
alter table public.usuarios add column if not exists inmobiliaria  text;
alter table public.usuarios add column if not exists zonas         text[];
alter table public.usuarios add column if not exists biografia     text;

-- ── Qué busca el cliente ───────────────────────────────────────
-- No es un formulario de marketing: es lo que permite avisarle cuando
-- entra algo que encaja, que es la razón por la que se registra.
alter table public.usuarios add column if not exists busca_operacion text
  check (busca_operacion is null or busca_operacion in ('venta', 'renta', 'ambas'));
alter table public.usuarios add column if not exists busca_zona      text;
alter table public.usuarios add column if not exists busca_tipo      text;
alter table public.usuarios add column if not exists presupuesto_max numeric;

-- ── Onboarding ─────────────────────────────────────────────────
-- Se guarda que YA LO VIO, no que lo completó: las tareas se tachan
-- solas mirando los datos reales. Un booleano de «completado» que se
-- escribe a mano miente en cuanto alguien borra su teléfono.
alter table public.usuarios add column if not exists bienvenida_vista boolean not null default false;

-- Completitud del perfil, calculada en servidor igual que la de las
-- propiedades. Si la mandara el navegador, cualquiera escribiría 100.
alter table public.usuarios add column if not exists completitud smallint not null default 0;

-- ── Comprobación ───────────────────────────────────────────────
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'usuarios'
order by ordinal_position;
