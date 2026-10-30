-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 16 — «Tu búsqueda» con varias zonas y varios tipos
-- Aplicada con MCP (apply_migration '16_portal_busqueda').
--
-- El mockup del portal («Tu búsqueda») enseña varias zonas (León, Silao,
-- Lagos) y varios tipos (Nave industrial, Terreno). `usuarios` sólo tenía
-- un texto de cada uno. Se agregan listas; las columnas viejas se conservan
-- y la API las mantiene iguales al primer elemento, porque el cálculo de
-- completitud del perfil y el panel anterior todavía las leen.
--
-- Sólo agrega columnas y copia lo que ya había. No borra nada.
-- ═══════════════════════════════════════════════════════════════

alter table public.usuarios add column if not exists busca_zonas text[];
alter table public.usuarios add column if not exists busca_tipos text[];

update public.usuarios set busca_zonas = array[busca_zona]
  where busca_zona is not null and btrim(busca_zona) <> '' and busca_zonas is null;
update public.usuarios set busca_tipos = array[busca_tipo]
  where busca_tipo is not null and btrim(busca_tipo) <> '' and busca_tipos is null;
