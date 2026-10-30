-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 51 — RLS de lectura pública: lo vendido y lo rentado ya no se lee (misma regla que la aplicación, D-59 enmendada)
-- Reversa: 51-rls-lectura-publica-cerradas.REVERTIR.sql
--
-- PREPARADA. Numeración provisional (adenda "por asignar"). Requiere la 34. Aplicar junto con el código que oculta lo rentado/vendido.
--
-- POR QUÉ: el 26-oct-2026 el dueño decidió que una propiedad rentada o vendida NO se muestra en el sitio web (vive en la pestaña
-- «Rentadas / Vendidas» del panel). La aplicación ya lo esconde (`esVisibleAlPublico`, lib/visibilidad-publica.ts); esta migración cierra la
-- segunda barrera: quien consulte PostgREST directo con la clave anónima tampoco debe leer esas filas.
--
-- QUÉ CAMBIA: SÓLO la expresión USING de `propiedades_lectura_publica` (ALTER POLICY: conserva nombre, comando, roles y tipo; sin hueco).
-- QUÉ NO CAMBIA: ninguna otra política, tabla, función ni dato. El panel, el publicador, el portal y las rutas internas leen con
-- `service_role`, que ignora RLS. EFECTO COLATERAL: `fotos_lectura_publica` también deja de servir las fotos de lo cerrado.
-- Si la política no existe, falla cerrado. Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter policy "propiedades_lectura_publica" on public.propiedades
  using (
    estado_pub = 'publicada'
    and coalesce(estatus, 'disponible') not in ('pausada', 'eliminada', 'vendida', 'rentada')
  );
