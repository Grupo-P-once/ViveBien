-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 22 — «Qué estoy buscando»: un solo modelo (P3-07, fase 3a)
-- V-1.1.82 · SE APLICA DESPUÉS de desplegar el código que ya no las usa.
--
-- Borra `usuarios.busca_zona` y `usuarios.busca_tipo` (una zona, un tipo).
-- El modelo único es `busca_operacion`, `busca_zonas`, `busca_tipos`,
-- `presupuesto_max` (lib/cliente/busqueda.ts).
--
-- Antes de aplicarla (checklist del usuario, 19-sep):
--   · respaldo: el contenido de las dos columnas (medido: 0 filas con valor);
--   · ninguna referencia en código, pruebas, SQL vivo, vistas, funciones,
--     índices, restricciones ni políticas (verificado; una prueba lo vigila);
--   · ensayo en PGlite y en producción dentro de una transacción revertida.
--
-- Por seguridad, si alguna fila tuviera todavía un valor en la columna vieja
-- y la lista nueva vacía, se copia antes de borrar. Idempotente: se puede
-- aplicar dos veces.
-- ═══════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'usuarios' and column_name = 'busca_zona') then
    update public.usuarios
       set busca_zonas = array[btrim(busca_zona)]
     where busca_zona is not null and btrim(busca_zona) <> ''
       and coalesce(cardinality(busca_zonas), 0) = 0;
    alter table public.usuarios drop column busca_zona;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'usuarios' and column_name = 'busca_tipo') then
    update public.usuarios
       set busca_tipos = array[lower(btrim(busca_tipo))]
     where busca_tipo is not null and btrim(busca_tipo) <> ''
       and coalesce(cardinality(busca_tipos), 0) = 0;
    alter table public.usuarios drop column busca_tipo;
  end if;
end
$$;
