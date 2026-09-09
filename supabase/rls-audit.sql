-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · Auditoría de Row Level Security
-- Ejecutar en: Supabase → SQL Editor
--
-- Contexto: NEXT_PUBLIC_SUPABASE_ANON_KEY viaja en el bundle del navegador.
-- Es pública por diseño. Lo único que impide que cualquiera lea o escriba
-- la base de datos con ella es RLS. Si RLS está apagado en una tabla, esa
-- clave equivale a acceso total a esa tabla.
--
-- `leads` y `contactos` guardan nombre, teléfono y correo de personas
-- reales. Si salen con rls_habilitado = false, es una fuga de datos
-- personales y hay que taparla el mismo día.
-- ═══════════════════════════════════════════════════════════════


-- ── PASO 1 · ¿Qué tablas tienen RLS activo? ────────────────────
select
  c.relname                        as tabla,
  c.relrowsecurity                 as rls_habilitado,
  c.relforcerowsecurity            as rls_forzado,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as num_politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;

-- Interpretación:
--   rls_habilitado = false            → tabla ABIERTA con la anon key.
--   rls_habilitado = true, políticas 0 → tabla cerrada a todo el mundo
--                                        salvo la service role key.


-- ── PASO 2 · ¿Qué permite cada política existente? ─────────────
select
  tablename  as tabla,
  policyname as politica,
  cmd        as operacion,
  roles,
  qual       as condicion_lectura,
  with_check as condicion_escritura
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

-- Señal de alarma: `qual` o `with_check` en `true` para el rol `anon`
-- en una operación de escritura.


-- ═══════════════════════════════════════════════════════════════
-- PASO 3 · Políticas propuestas
--
-- NO ejecutar en bloque. Revisar tabla por tabla contra el resultado
-- de los pasos 1 y 2: si ya existen políticas, estas pueden duplicar
-- o contradecir lo que hay.
--
-- Modelo de este momento del proyecto:
--   · propiedades → lectura pública, escritura sólo desde el servidor
--   · leads       → escritura pública (el formulario), lectura cerrada
--   · contactos   → igual que leads
--
-- Las rutas de administración usan SUPABASE_SERVICE_ROLE_KEY, que ignora
-- RLS, y ya validan la sesión con requireAdmin(). Por eso aquí no hace
-- falta ninguna política de escritura para el rol anon.
-- ═══════════════════════════════════════════════════════════════

-- ── propiedades ────────────────────────────────────────────────
-- alter table public.propiedades enable row level security;
--
-- drop policy if exists "propiedades_lectura_publica" on public.propiedades;
-- create policy "propiedades_lectura_publica"
--   on public.propiedades for select
--   to anon, authenticated
--   using (estatus = 'disponible');
--
-- Nota: filtrar por estatus evita publicar las pausadas y las archivadas.
-- El panel de administración las sigue viendo porque lee con service role.


-- ── leads ──────────────────────────────────────────────────────
-- alter table public.leads enable row level security;
--
-- El formulario público necesita insertar, pero nadie debe poder leer.
-- drop policy if exists "leads_insertar_publico" on public.leads;
-- create policy "leads_insertar_publico"
--   on public.leads for insert
--   to anon, authenticated
--   with check (true);
--
-- Sin política de SELECT: la lectura queda cerrada para anon.


-- ── contactos ──────────────────────────────────────────────────
-- alter table public.contactos enable row level security;
--
-- drop policy if exists "contactos_insertar_publico" on public.contactos;
-- create policy "contactos_insertar_publico"
--   on public.contactos for insert
--   to anon, authenticated
--   with check (true);


-- ── PASO 4 · Comprobar que quedó cerrado ───────────────────────
-- Desde una terminal, con la anon key (la del bundle, no la de servicio):
--
--   curl "$SUPABASE_URL/rest/v1/leads?select=*&limit=1" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--
-- Esperado: [] o un error de permisos.
-- Si devuelve filas con datos de personas, RLS sigue sin proteger la tabla.
