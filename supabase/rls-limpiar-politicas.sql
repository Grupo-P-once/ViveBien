-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · Eliminar políticas permisivas heredadas
-- Ejecutar en: Supabase → SQL Editor → Run
-- Va DESPUÉS de rls-fix.sql
--
-- Por qué existe este archivo:
--
-- Activar RLS no bastó. Las tablas ya tenían políticas creadas hace
-- tiempo que nunca habían hecho nada, porque sin RLS activo las
-- políticas se ignoran. Al activarlo, se despertaron — y varias
-- permitían todo:
--
--     contactos_read   SELECT  {public}  using (true)
--     envios_all       ALL     {public}  using (true) with check (true)
--
-- En Postgres las políticas son PERMISIVAS y se combinan con OR: basta
-- que UNA permita la operación. Así que las viejas anulaban a las nuevas
-- y `leads` seguía devolviendo nombre, teléfono y correo de personas
-- reales con la anon key del bundle.
--
-- Esto deja sólo la lista blanca.
-- ═══════════════════════════════════════════════════════════════

do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('propiedades', 'leads', 'contactos', 'envios')
      and policyname not in (
        'propiedades_lectura_publica',
        'leads_insertar_publico',
        'contactos_insertar_publico'
      )
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'eliminada: % en %', r.policyname, r.tablename;
  end loop;
end $$;


-- ── Comprobación ───────────────────────────────────────────────
select tablename as tabla, policyname as politica, cmd as operacion,
       roles::text as roles, coalesce(qual, '-') as usando,
       coalesce(with_check, '-') as con_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

-- Deben quedar exactamente 3:
--   contactos    contactos_insertar_publico    INSERT  {anon,authenticated}
--   leads        leads_insertar_publico        INSERT  {anon,authenticated}
--   propiedades  propiedades_lectura_publica   SELECT  {anon,authenticated}
--
-- Y desde una terminal, con la anon key:
--   curl "$URL/rest/v1/leads?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--   → []
