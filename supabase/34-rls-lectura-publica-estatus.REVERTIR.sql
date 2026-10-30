-- Reversa de 34-rls-lectura-publica-estatus.sql
--
-- Devuelve la política a su definición anterior (sólo `estado_pub`). No toca datos ni otras políticas. Efecto: una propiedad
-- publicada y pausada vuelve a ser legible con la clave anónima (la aplicación sigue escondiéndola por su cuenta).

alter policy "propiedades_lectura_publica" on public.propiedades
  using (estado_pub = 'publicada');
