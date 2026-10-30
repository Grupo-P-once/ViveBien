/** El texto que identifica una solicitud de publicador. Lo comparten el botón «Quiero publicar» y la ruta que recibe el lead. */
export const INTERES_PUBLICAR = 'Quiere publicar una propiedad'

/** Los tipos de propiedad que ofrece el formulario de recomendaciones. Un valor de la URL que no esté aquí no se precarga. */
export const TIPOS_RECOMENDACION: ReadonlyArray<readonly [string, string]> = [
  ['casa', 'Casas'], ['departamento', 'Departamentos'], ['terreno', 'Terrenos'], ['nave', 'Naves industriales'],
  ['bodega', 'Bodegas'], ['local', 'Locales'], ['oficina', 'Oficinas'],
]
