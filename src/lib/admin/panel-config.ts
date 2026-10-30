/**
 * Lo que el panel nombra y colorea, en un solo sitio.
 *
 * Antes estaba repartido por cada pantalla (orígenes de lead en el panel,
 * colores de serie en las gráficas, etiquetas de rol en la API de usuarios), y
 * cada pantalla nueva los habría vuelto a copiar. Aquí se cambian una vez.
 *
 * Los colores son variables de `globals.css` (bloque `.panel-vb`), no hex: así
 * la paleta validada vive en un solo lugar.
 */

export const FRASES_MARCA = {
  espacios: 'Espacios que construyen tu futuro',
  historias: 'Más que inmuebles, mejores historias',
  valores: 'Confianza · Cercanía · Resultados',
} as const

/**
 * Color por TIPO de propiedad, no por tamaño: «Naves» tiene el mismo color
 * aunque un mes sea la porción mayor y otro la menor. Paleta validada
 * (daltonismo y contraste) en el orden de las variables `--serie-N`.
 */
export const COLOR_TIPO: Record<string, string> = {
  nave: 'var(--serie-1)',
  casa: 'var(--serie-2)',
  terreno: 'var(--serie-3)',
  bodega: 'var(--serie-4)',
  local: 'var(--serie-5)',
  departamento: 'var(--serie-6)',
  oficina: 'var(--serie-otros)',
  otros: 'var(--serie-otros)',
  'sin-tipo': 'var(--serie-otros)',
}

export function colorTipo(clave: string): string {
  return COLOR_TIPO[clave] ?? 'var(--serie-otros)'
}

export const ROLES = {
  admin: 'Administrador',
  publicador: 'Publicador',
  cliente: 'Cliente',
} as const

export type RolPanel = keyof typeof ROLES

/** Para mostrar y filtrar (V-1.1.79). `ROLES` sigue siendo lo que se puede invitar. */
export const ETIQUETA_ROL: Record<string, string> = { super_admin: 'Super admin', ...ROLES }

/**
 * Cómo llegó cada persona, con el orden en que se atiende (no el alfabético).
 *
 * Los textos y las explicaciones vienen de la tabla anterior: la etiqueta que
 * hay que adivinar no informa, así que cada tipo dice qué significa. Los
 * colores son de insignia (fondo suave + texto oscuro), no de serie de gráfica.
 */
export const TIPOS_REGISTRO: Record<string, { texto: string; fondo: string; texto_color: string; explica: string }> = {
  visita: { texto: 'Quiere visitar', fondo: '#FEF2F2', texto_color: '#B91C1C', explica: 'Pidió ver una propiedad en persona. Lo más caliente que produce el sitio.' },
  propiedad: { texto: 'Pidió informes', fondo: '#E8F5EE', texto_color: '#15803D', explica: 'Pidió información de una propiedad concreta desde su ficha.' },
  valuacion: { texto: 'Valuador', fondo: '#FEF9C3', texto_color: '#92400E', explica: 'Usó el valuador: casi siempre alguien que piensa vender.' },
  popup: { texto: 'Ventana', fondo: '#F0F9FF', texto_color: '#0369A1', explica: 'Dejó sus datos en la ventana emergente o en el buscador de la portada.' },
  contacto: { texto: 'Contacto', fondo: '#FFF7ED', texto_color: '#9A3412', explica: 'Escribió por el formulario general de contacto.' },
  cuenta: { texto: 'Creó cuenta', fondo: '#EFF6FF', texto_color: '#1D4ED8', explica: 'Se registró en el sitio. Puede volver, guardar favoritos y búsquedas.' },
  publicador: { texto: 'Publicador', fondo: '#F5F3FF', texto_color: '#6D28D9', explica: 'Cuenta con permiso para publicar propiedades.' },
  manual: { texto: 'Agregado a mano', fondo: '#F7EAEA', texto_color: '#7D0D0D', explica: 'Lo dio de alta un administrador desde el panel (una llamada, una visita a la oficina).' },
  interesado: { texto: 'Sin origen', fondo: '#F3F4F6', texto_color: '#4B5563', explica: 'Dejó sus datos, pero no quedó registrado por dónde entró.' },
}

export const ORDEN_TIPOS_REGISTRO = ['visita', 'propiedad', 'valuacion', 'popup', 'contacto', 'manual', 'cuenta', 'publicador', 'interesado']

export function etiquetaTipoRegistro(tipo: string): string {
  return TIPOS_REGISTRO[tipo]?.texto ?? tipo
}

export const ORIGENES_LEAD: Record<string, string> = {
  ficha: 'Ficha de propiedad',
  contacto: 'Formulario de contacto',
  portada: 'Portada',
  valuador: 'Valuador',
  registro: 'Ventana de registro',
  manual: 'Agregado a mano',
}

/** Páginas del panel que encuentra la búsqueda global. */
export const PAGINAS_PANEL: { titulo: string; enlace: string; palabras: string }[] = [
  { titulo: 'Dashboard', enlace: '/admin', palabras: 'inicio resumen tablero metricas' },
  { titulo: 'Mis propiedades', enlace: '/admin/propiedades', palabras: 'inmuebles casas naves terrenos inventario' },
  { titulo: 'Revisar', enlace: '/admin/propiedades/pendientes', palabras: 'propiedades por revisar moderacion revision pendientes aprobar' },
  { titulo: 'Registros y solicitudes', enlace: '/admin/registros', palabras: 'leads contactos formularios prospectos' },
  { titulo: 'Usuarios', enlace: '/admin/usuarios', palabras: 'cuentas roles permisos invitar' },
  { titulo: 'Métricas', enlace: '/admin/metricas', palabras: 'analitica graficas estadisticas' },
  { titulo: 'Actividad', enlace: '/admin/actividad', palabras: 'historial bitacora movimientos' },
  { titulo: 'Ver sitio web', enlace: '/', palabras: 'portada publico inicio sitio' },
]
