-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · CERRAR LA FUGA DE DATOS
-- Ejecutar en: Supabase → SQL Editor → Run
--
-- COMPROBADO EL 2026-09-08 contra la base de producción, usando
-- únicamente la anon key que viaja en el bundle del navegador:
--
--   GET    /rest/v1/leads        → 200  devolvió nombre, teléfono y
--                                       correo de una persona real
--   GET    /rest/v1/contactos    → 200
--   GET    /rest/v1/envios       → 200
--   PATCH  /rest/v1/propiedades  → 204  aceptado
--   DELETE /rest/v1/propiedades  → 204  aceptado
--   DELETE /rest/v1/leads        → 204  aceptado
--   DELETE /rest/v1/contactos    → 204  aceptado
--   POST   /rest/v1/propiedades  → 400  pero por NOT NULL, no por permisos:
--                                       la escritura estaba autorizada
--
-- Las cuatro tablas están abiertas a lectura y escritura. Cualquiera que
-- abra el sitio, copie la clave del bundle y haga un curl puede leer los
-- datos de contacto de las personas y vaciar la base.
--
-- ANTES DE EJECUTAR: despliega el código que acompaña a este archivo.
-- El panel pasó a leer leads y contactos por /api/leads y
-- /api/admin/contactos (servidor, service role). Si cierras RLS con el
-- código viejo en producción, el dashboard se queda sin datos.
-- ═══════════════════════════════════════════════════════════════


-- ── propiedades ────────────────────────────────────────────────
-- Lectura pública: la necesita el catálogo.
-- Escritura: nadie con la anon key. El panel escribe por API Route con
-- la service role, que ignora RLS y ya valida la sesión.

alter table public.propiedades enable row level security;

drop policy if exists "propiedades_lectura_publica" on public.propiedades;
create policy "propiedades_lectura_publica"
  on public.propiedades for select
  to anon, authenticated
  using (true);

-- Nota: se deja lectura total (`using (true)`) en vez de filtrar por
-- estatus porque hoy el filtrado de pausadas y archivadas lo hace el
-- frontend. Cambiarlo aquí ahora escondería propiedades sin previo
-- aviso. Pasa a `using (estatus = 'disponible')` en la Fase 2, junto
-- con la máquina de estados de publicación.


-- ── leads ──────────────────────────────────────────────────────
-- El formulario público inserta. Nadie lee con la anon key.

alter table public.leads enable row level security;

drop policy if exists "leads_insertar_publico" on public.leads;
create policy "leads_insertar_publico"
  on public.leads for insert
  to anon, authenticated
  with check (true);

-- Sin política de SELECT a propósito: la lectura queda cerrada.
-- El panel los lee por /api/leads con la service role.


-- ── contactos ──────────────────────────────────────────────────

alter table public.contactos enable row level security;

drop policy if exists "contactos_insertar_publico" on public.contactos;
create policy "contactos_insertar_publico"
  on public.contactos for insert
  to anon, authenticated
  with check (true);


-- ── envios ─────────────────────────────────────────────────────
-- La app no la toca (sólo el workflow de n8n, que va con service role).
-- Se cierra por completo al rol público: RLS activo y cero políticas.

alter table public.envios enable row level security;


-- ── Comprobación ───────────────────────────────────────────────
select
  c.relname as tabla,
  c.relrowsecurity as rls_activo,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;

-- Las tres deben salir con rls_activo = true.
-- Después, desde una terminal con la anon key:
--   curl "$URL/rest/v1/leads?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
-- Esperado: []  (antes devolvía los datos de la persona)
