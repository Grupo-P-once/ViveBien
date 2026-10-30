-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 17 — Seguridad de la base sin efecto visible (fase 1 del PRD v2.0)
-- Aplicada con MCP (apply_migration '17_seguridad_base'). Incluye la «migración 13»
-- que estaba propuesta y sin aplicar.
--
-- Nada de esto cambia lo que ve el público: el servidor usa la clave de
-- servicio (no le afectan RLS ni privilegios) y el navegador sólo lee
-- `propiedades` y `fotos` publicadas.
--
--  1. Avisos del asesor de Supabase (antes «migración 13»):
--     - `rls_auto_enable()` (SECURITY DEFINER) se podía invocar como anon.
--       Es la función de un event trigger: quitarle EXECUTE a los roles no
--       impide que el trigger la dispare.
--     - `tocar_actualizado_en()` sin search_path fijo. Sólo llama a now().
--  2. `leads` y `contactos` aceptaban INSERT directo del navegador, saltándose
--     validación, límite de peticiones y registro del consentimiento. Ningún
--     código lo usa desde V-1.1.x (todo entra por /api/registro-lead).
--  3. Privilegios sobrantes: las tablas «sólo servidor» tenían RLS sin
--     políticas (bien) pero conservaban SELECT/INSERT a nivel de tabla para
--     anon/authenticated. Se quitan: dos candados en vez de uno.
-- ═══════════════════════════════════════════════════════════════

-- 1 · Avisos del asesor
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
alter function public.tocar_actualizado_en() set search_path = '';

-- 2 · INSERT público
drop policy if exists leads_insertar_publico on public.leads;
drop policy if exists contactos_insertar_publico on public.contactos;

-- 3 · Tablas sólo-servidor: sin privilegios para los roles del navegador
revoke all on table
  public.audit_logs, public.busquedas_guardadas, public.contactos, public.envios,
  public.eventos, public.favoritos, public.invitaciones, public.leads,
  public.solicitudes_contacto, public.usuarios
  from anon, authenticated;

-- Lo público se queda sólo con lectura (sin INSERT/UPDATE/DELETE a nivel de tabla).
revoke insert, update, delete, truncate, references, trigger on table public.propiedades, public.fotos from anon, authenticated;
