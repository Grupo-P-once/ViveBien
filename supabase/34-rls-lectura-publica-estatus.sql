-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 34 — RLS de lectura pública de propiedades: misma regla que la aplicación (D-59)
--
-- POR QUÉ: la política `propiedades_lectura_publica` sólo miraba `estado_pub`, así que quien consultara PostgREST directo con la
-- clave anónima leía las filas `pausada` / `eliminada`, que la aplicación ya esconde (`esVisibleAlPublico`, lib/visibilidad-publica.ts).
--
-- QUÉ CAMBIA: SÓLO la expresión USING de esa política. `ALTER POLICY` conserva nombre, comando (SELECT), roles (anon, authenticated) y
-- tipo (PERMISIVA), y no deja un instante sin política (a diferencia de DROP + CREATE). `estatus` nulo sigue visible (coalesce).
-- QUÉ NO CAMBIA: ninguna otra política, tabla, función, rol ni dato. El panel, el publicador, el portal, las citas, las búsquedas y las
-- rutas internas leen con `service_role`, que ignora RLS: no se ven afectados.
-- EFECTO COLATERAL BUENO: `fotos_lectura_publica` consulta `propiedades` con los permisos de quien lee, así que las fotos de una
-- propiedad pausada también dejan de ser públicas.
--
-- SI LA POLÍTICA NO EXISTE, `ALTER POLICY` falla (falla cerrado; no se inventa una). Reversa: 34-rls-lectura-publica-estatus.REVERTIR.sql
-- Aplicar DESPUÉS de desplegar el código de D-59 (la caché del catálogo se vacía sola en ~5 min).
-- ═══════════════════════════════════════════════════════════════

alter policy "propiedades_lectura_publica" on public.propiedades
  using (
    estado_pub = 'publicada'
    and coalesce(estatus, 'disponible') not in ('pausada', 'eliminada')
  );
