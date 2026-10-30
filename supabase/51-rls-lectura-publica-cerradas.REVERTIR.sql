-- Reversa de 51-rls-lectura-publica-cerradas.sql: vuelve a la política de la migración 34 (solo pausada y eliminada se esconden).
alter policy "propiedades_lectura_publica" on public.propiedades
  using (
    estado_pub = 'publicada'
    and coalesce(estatus, 'disponible') not in ('pausada', 'eliminada')
  );
