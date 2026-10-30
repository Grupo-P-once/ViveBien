/**
 * Características opcionales de una propiedad (oficinas y demás tipos), en UN solo sitio.
 *
 * ─────────────────────────────────────────────────────────────
 * DÓNDE VIVEN
 *
 * Las columnas que ya existen (`metros`, `recamaras`, `banos`, `altura_libre`, `andenes`, `mantenimiento`, `amenidades`) siguen
 * siendo columnas. Lo nuevo y variable va en `extras.caracteristicas` (jsonb que ya existía), versionado (`v: 1`) y con LISTA
 * BLANCA: cada clave dice a qué tipos de inmueble y a qué operaciones aplica, su tipo y su rango. El servidor (`sanearContenido`)
 * rechaza lo que no esté aquí, lo que no aplique al tipo/operación y lo que salga de rango.
 *
 * `extras` se lee en PÚBLICO (SELECT_PUBLICO): aquí sólo hay datos aptos para mostrarse. Nada de notas internas, contacto,
 * documentos de propiedad, requisitos de renta ni afirmaciones legales (uso de suelo, régimen de propiedad): quedan fuera a propósito.
 *
 * Baños: una sola representación, la columna `banos` (numérica; un medio baño suma 0.5). No hay `medio_bano` aparte.
 * Superficie: `metros` conserva su significado histórico (la superficie principal del anuncio); aquí sólo se añaden las que
 * faltaban (`m_terreno`, `m_utiles`) y la pantalla etiqueta `metros` según el tipo.
 * ─────────────────────────────────────────────────────────────
 */

import { SUBTIPOS, type Tipo } from './esquemas/propiedad'

export const VERSION_CARACTERISTICAS = 1
/** Clave dentro de `extras` donde vive todo lo de este módulo. */
export const CLAVE_EXTRAS = 'caracteristicas'

/** Cualquier vocabulario de tipo ('depto', 'comercial'…) → el del esquema. NO cambia lo guardado: sólo decide qué aplica. */
export function tipoBase(tipo: unknown): string {
  const t = typeof tipo === 'string' ? tipo.trim().toLowerCase() : ''
  if (t === 'depto') return 'departamento'
  if (t === 'comercial') return 'local'
  return t
}

const CONSTRUIDOS = ['casa', 'departamento', 'local', 'oficina', 'nave', 'bodega', 'edificio', 'rancho'] as const
const URBANOS = ['casa', 'departamento', 'local', 'oficina', 'nave', 'bodega', 'edificio'] as const
const TODOS = ['casa', 'departamento', 'terreno', 'nave', 'bodega', 'local', 'oficina', 'edificio', 'rancho'] as const

export type GrupoCaracteristica = 'espacios' | 'condiciones' | 'servicios' | 'seguridad' | 'accesibilidad' | 'renta'

export const GRUPOS_CARACTERISTICAS: { id: GrupoCaracteristica; titulo: string }[] = [
  { id: 'espacios', titulo: 'Espacios y distribución' },
  { id: 'condiciones', titulo: 'Condiciones del inmueble' },
  { id: 'servicios', titulo: 'Servicios' },
  { id: 'seguridad', titulo: 'Seguridad' },
  { id: 'accesibilidad', titulo: 'Accesibilidad' },
  { id: 'renta', titulo: 'Condiciones de renta' },
]

type Opcion = readonly [valor: string, etiqueta: string]

type Base = {
  clave: string
  etiqueta: string
  grupo: GrupoCaracteristica
  /** Tipos (del esquema) a los que aplica. */
  tipos: readonly string[]
  /** Operaciones a las que aplica; sin valor = todas. */
  operaciones?: readonly string[]
  ayuda?: string
  /**
   * AMENIDAD = instalación o servicio que ofrece el inmueble o el desarrollo (alberca, gimnasio, elevador, vigilancia, áreas comunes).
   * Sin esta marca la definición es una CARACTERÍSTICA: un atributo propio del inmueble y de su tipo (plantas, recámaras, superficies,
   * estado) o una condición (admite mascotas, depósito). Solo cambia DÓNDE se edita y se muestra; la clave guardada en
   * `extras.caracteristicas` no cambia, así que ninguna propiedad existente pierde ni cambia datos.
   */
  concepto?: 'amenidad'
  /** Cómo se llama en la lista de amenidades (por defecto, la etiqueta). */
  etiquetaAmenidad?: string
}
export type Def =
  | (Base & { forma: 'entero'; min: number; max: number; unidad?: string })
  | (Base & { forma: 'decimal'; min: number; max: number; unidad?: string })
  | (Base & { forma: 'enum'; opciones: readonly Opcion[] })
  | (Base & { forma: 'bool' })
  | (Base & { forma: 'lista'; opciones: readonly Opcion[]; /** Subconjunto por tipo (si no se da, todas). */ opcionesPorTipo?: Record<string, readonly string[]> })
  | (Base & { forma: 'texto'; max: number })
  | (Base & { forma: 'fecha' })

const SERVICIOS: readonly Opcion[] = [
  ['agua', 'Agua'], ['luz', 'Luz'], ['drenaje', 'Drenaje'], ['gas_natural', 'Gas natural'], ['internet', 'Internet'],
  ['fibra_optica', 'Fibra óptica'], ['telefono', 'Línea telefónica'], ['alumbrado_publico', 'Alumbrado público'], ['calle_pavimentada', 'Calle pavimentada'],
  ['pozo', 'Pozo de agua'], ['fosa_septica', 'Fosa séptica'],
]
const SEGURIDAD: readonly Opcion[] = [
  ['vigilancia_24h', 'Vigilancia 24 horas'], ['caseta', 'Caseta de acceso'], ['acceso_controlado', 'Acceso controlado'],
  ['camaras', 'Cámaras de seguridad'], ['alarma', 'Alarma'], ['barda_perimetral', 'Barda perimetral'],
]
const ACCESIBILIDAD: readonly Opcion[] = [
  ['planta_baja', 'Todo en planta baja'], ['rampa', 'Rampa de acceso'], ['elevador_accesible', 'Elevador accesible'],
  ['puertas_amplias', 'Puertas amplias'], ['bano_adaptado', 'Baño adaptado'], ['estacionamiento_accesible', 'Cajón de estacionamiento accesible'],
]
const EXTERIORES: readonly Opcion[] = [
  ['jardin', 'Jardín'], ['patio', 'Patio'], ['terraza', 'Terraza'], ['balcon', 'Balcón'], ['roof_garden', 'Roof garden'], ['alberca', 'Alberca'],
  ['asador', 'Asador o área de BBQ'],
]
const INTERIORES: readonly Opcion[] = [
  ['cocina_integral', 'Cocina integral'], ['cocina_equipada', 'Cocina equipada'], ['lavanderia', 'Cuarto o área de lavandería'], ['closets', 'Clósets'],
  ['cuarto_servicio', 'Cuarto de servicio'], ['estudio', 'Estudio'], ['bodega_interna', 'Bodega interna'], ['cisterna', 'Cisterna'],
  ['tinaco', 'Tinaco'], ['calentador_solar', 'Calentador solar'], ['aire_acondicionado', 'Aire acondicionado'], ['sala_tv', 'Sala de TV'], ['vestidor', 'Vestidor'],
  ['cuarto_servicio_bano', 'Cuarto de servicio con baño'],
]
const INCLUIDOS: readonly Opcion[] = [
  ['agua', 'Agua'], ['luz', 'Luz'], ['gas', 'Gas'], ['internet', 'Internet'], ['mantenimiento', 'Mantenimiento'], ['limpieza', 'Limpieza'], ['vigilancia', 'Vigilancia'],
]

export const DEFINICIONES: readonly Def[] = [
  // — espacios —
  { clave: 'm_terreno', etiqueta: 'Terreno (m²)', grupo: 'espacios', forma: 'decimal', min: 1, max: 100_000_000, unidad: 'm²', tipos: ['casa', 'local', 'nave', 'bodega', 'edificio', 'rancho'], ayuda: 'Sólo si es distinto de la superficie principal.' },
  { clave: 'm_utiles', etiqueta: 'Área útil (m²)', grupo: 'espacios', forma: 'decimal', min: 1, max: 100_000_000, unidad: 'm²', tipos: ['oficina', 'local'], ayuda: 'Sólo si es distinta de la superficie construida.' },
  { clave: 'niveles', etiqueta: 'Niveles o plantas', grupo: 'espacios', forma: 'entero', min: 1, max: 50, tipos: ['casa', 'edificio'] },
  { clave: 'piso', etiqueta: 'Piso en que se ubica', grupo: 'espacios', forma: 'entero', min: 0, max: 200, tipos: ['departamento', 'oficina'], ayuda: '0 = planta baja.' },
  { clave: 'elevador', etiqueta: 'Hay elevador', concepto: 'amenidad', etiquetaAmenidad: 'Elevador', grupo: 'espacios', forma: 'bool', tipos: ['departamento', 'oficina', 'edificio'] },
  { clave: 'estacionamientos', etiqueta: 'Estacionamientos', grupo: 'espacios', forma: 'entero', min: 0, max: 999, tipos: URBANOS },
  { clave: 'privados', etiqueta: 'Privados u oficinas cerradas', grupo: 'espacios', forma: 'entero', min: 0, max: 500, tipos: ['oficina'] },
  { clave: 'salas_juntas', etiqueta: 'Salas de juntas', grupo: 'espacios', forma: 'entero', min: 0, max: 100, tipos: ['oficina'] },
  { clave: 'recepcion', etiqueta: 'Tiene recepción', grupo: 'espacios', forma: 'bool', tipos: ['oficina'] },
  { clave: 'frente', etiqueta: 'Frente (m)', grupo: 'espacios', forma: 'decimal', min: 0.1, max: 10_000, unidad: 'm', tipos: ['terreno', 'local', 'nave', 'bodega', 'rancho'] },
  { clave: 'fondo', etiqueta: 'Fondo (m)', grupo: 'espacios', forma: 'decimal', min: 0.1, max: 10_000, unidad: 'm', tipos: ['terreno'] },
  { clave: 'forma', etiqueta: 'Forma del terreno', grupo: 'espacios', forma: 'enum', opciones: [['regular', 'Regular'], ['irregular', 'Irregular']], tipos: ['terreno', 'rancho'] },
  { clave: 'topografia', etiqueta: 'Topografía', grupo: 'espacios', forma: 'enum', opciones: [['plano', 'Plano'], ['pendiente_suave', 'Pendiente suave'], ['pendiente_pronunciada', 'Pendiente pronunciada']], tipos: ['terreno', 'rancho'] },
  { clave: 'acceso', etiqueta: 'Acceso', grupo: 'espacios', forma: 'enum', opciones: [['calle_pavimentada', 'Calle pavimentada'], ['terraceria', 'Terracería'], ['carretera', 'Carretera'], ['privado', 'Acceso privado']], tipos: ['terreno', 'rancho'] },
  {
    clave: 'exteriores', etiqueta: 'Exteriores', grupo: 'espacios', forma: 'lista', opciones: EXTERIORES, tipos: ['casa', 'departamento'],
    opcionesPorTipo: { casa: ['jardin', 'patio', 'terraza', 'roof_garden', 'alberca', 'asador'], departamento: ['balcon', 'terraza', 'roof_garden'] },
  },
  { clave: 'interiores', etiqueta: 'Interiores', grupo: 'espacios', forma: 'lista', opciones: INTERIORES, tipos: ['casa', 'departamento'] },
  { clave: 'giro', etiqueta: 'Giro del local', grupo: 'espacios', forma: 'texto', max: 80, tipos: ['local'], ayuda: 'El negocio que hay o que se sugiere (informativo; no es una autorización de uso de suelo).' },
  { clave: 'esquina', etiqueta: 'Está en esquina', grupo: 'espacios', forma: 'bool', tipos: ['terreno', 'local', 'nave', 'bodega', 'edificio', 'rancho'] },
  { clave: 'estacionamientos_cubiertos', etiqueta: 'Estacionamientos techados', grupo: 'espacios', forma: 'entero', min: 0, max: 999, tipos: ['casa', 'departamento', 'local', 'oficina', 'edificio'], ayuda: 'Cuántos de los estacionamientos tienen techo; no puede ser más que el total.' },
  { clave: 'puestos', etiqueta: 'Puestos de trabajo', grupo: 'espacios', forma: 'entero', min: 0, max: 1000, tipos: ['oficina'], ayuda: 'Escritorios o lugares disponibles (útil en oficinas compartidas).' },
  { clave: 'sala_espera', etiqueta: 'Tiene sala de espera', grupo: 'espacios', forma: 'bool', tipos: ['oficina'] },
  { clave: 'vitrina', etiqueta: 'Tiene aparador o vitrina al frente', grupo: 'espacios', forma: 'bool', tipos: ['local'] },
  { clave: 'mezanine', etiqueta: 'Tiene mezanine o planta alta', grupo: 'espacios', forma: 'bool', tipos: ['local'] },
  { clave: 'unidades', etiqueta: 'Unidades (departamentos, locales u oficinas)', grupo: 'espacios', forma: 'entero', min: 1, max: 5000, tipos: ['edificio'] },
  { clave: 'm_oficinas', etiqueta: 'Oficinas administrativas (m²)', grupo: 'espacios', forma: 'decimal', min: 1, max: 100_000_000, unidad: 'm²', tipos: ['nave', 'bodega'] },
  { clave: 'patio_maniobras_m2', etiqueta: 'Patio de maniobras (m²)', grupo: 'espacios', forma: 'decimal', min: 1, max: 100_000_000, unidad: 'm²', tipos: ['nave', 'bodega'] },
  { clave: 'rampas', etiqueta: 'Rampas de acceso', grupo: 'espacios', forma: 'entero', min: 0, max: 50, tipos: ['nave', 'bodega'] },
  { clave: 'resistencia_piso', etiqueta: 'Resistencia del piso (ton/m²)', grupo: 'condiciones', forma: 'decimal', min: 0.1, max: 100, unidad: 't/m²', tipos: ['nave', 'bodega'], ayuda: 'Dato declarado; pide la ficha técnica antes de operar maquinaria pesada.' },
  { clave: 'bardeado', etiqueta: 'Está bardeado o cercado', grupo: 'condiciones', forma: 'bool', tipos: ['terreno', 'rancho'] },
  { clave: 'parque_industrial', etiqueta: 'Está dentro de un parque industrial', grupo: 'condiciones', forma: 'bool', tipos: ['terreno', 'nave', 'bodega'] },
  {
    clave: 'desarrollo', etiqueta: 'Tipo de desarrollo', grupo: 'condiciones', forma: 'enum', tipos: ['casa', 'departamento', 'terreno'],
    opciones: [['privada', 'En privada o fraccionamiento cerrado'], ['condominio', 'En condominio'], ['calle_abierta', 'En calle abierta']],
  },
  {
    clave: 'amenidades_comunes', etiqueta: 'Amenidades comunes del conjunto o edificio', concepto: 'amenidad', grupo: 'espacios', forma: 'lista', tipos: ['casa', 'departamento', 'edificio'],
    opciones: [['alberca_comun', 'Alberca'], ['gimnasio', 'Gimnasio'], ['salon_usos_multiples', 'Salón de usos múltiples'], ['areas_verdes', 'Áreas verdes'],
      ['juegos_infantiles', 'Juegos infantiles'], ['asadores_comunes', 'Asadores'], ['cancha', 'Cancha deportiva'], ['trabajo_compartido', 'Sala de trabajo compartido'], ['bodegas_residentes', 'Bodegas para residentes']],
  },
  {
    clave: 'equipamiento', etiqueta: 'Equipamiento e instalaciones', grupo: 'espacios', forma: 'lista', tipos: ['oficina', 'local', 'edificio', 'nave', 'bodega'],
    opciones: [['aire_acondicionado', 'Aire acondicionado'], ['planta_emergencia', 'Planta de emergencia'], ['cocineta', 'Cocineta'], ['comedor', 'Área de comedor'],
      ['cableado_estructurado', 'Cableado estructurado'], ['contra_incendio', 'Sistema contra incendio'], ['bodega_interna', 'Bodega interna']],
  },
  { clave: 'kva', etiqueta: 'Capacidad eléctrica disponible (kVA)', grupo: 'servicios', forma: 'entero', min: 1, max: 100_000, unidad: 'kVA', tipos: ['nave', 'bodega', 'local', 'oficina', 'edificio', 'terreno'], ayuda: 'Dato declarado; confirma la factibilidad con CFE.' },
  // — condiciones —
  { clave: 'antiguedad_anos', etiqueta: 'Antigüedad (años)', grupo: 'condiciones', forma: 'entero', min: 0, max: 200, unidad: 'años', tipos: CONSTRUIDOS, ayuda: '0 = a estrenar.' },
  { clave: 'estado_general', etiqueta: 'Estado general', grupo: 'condiciones', forma: 'enum', opciones: [['nuevo', 'Nuevo'], ['excelente', 'Excelente'], ['bueno', 'Bueno'], ['regular', 'Regular'], ['para_remodelar', 'Para remodelar']], tipos: CONSTRUIDOS },
  // — listas comunes —
  { clave: 'servicios', etiqueta: 'Servicios disponibles', grupo: 'servicios', forma: 'lista', opciones: SERVICIOS, tipos: TODOS },
  { clave: 'seguridad', etiqueta: 'Seguridad y vigilancia', concepto: 'amenidad', grupo: 'seguridad', forma: 'lista', opciones: SEGURIDAD, tipos: TODOS },
  { clave: 'accesibilidad', etiqueta: 'Accesibilidad', grupo: 'accesibilidad', forma: 'lista', opciones: ACCESIBILIDAD, tipos: URBANOS },
  // — sólo renta —
  { clave: 'mascotas', etiqueta: 'Admite mascotas', grupo: 'renta', forma: 'enum', opciones: [['permitidas', 'Sí, se permiten'], ['con_restricciones', 'Con restricciones'], ['no_permitidas', 'No se permiten'], ['consultar', 'A consultar']], tipos: ['casa', 'departamento'], operaciones: ['renta'] },
  { clave: 'amueblado', etiqueta: 'Amueblado', grupo: 'renta', forma: 'enum', opciones: [['no', 'Sin muebles'], ['semi', 'Semiamueblado'], ['si', 'Amueblado']], tipos: ['casa', 'departamento', 'oficina', 'local'], operaciones: ['renta'] },
  { clave: 'deposito_meses', etiqueta: 'Depósito (meses de renta)', grupo: 'renta', forma: 'decimal', min: 0, max: 12, tipos: TODOS, operaciones: ['renta'], ayuda: 'Por ejemplo 1 o 2. Déjalo vacío si lo platican.' },
  { clave: 'plazo_minimo_meses', etiqueta: 'Plazo mínimo (meses)', grupo: 'renta', forma: 'entero', min: 1, max: 120, tipos: TODOS, operaciones: ['renta'] },
  { clave: 'disponible_desde', etiqueta: 'Disponible desde', grupo: 'renta', forma: 'fecha', tipos: TODOS, operaciones: ['renta'] },
  { clave: 'servicios_incluidos', etiqueta: 'Servicios incluidos en la renta', grupo: 'renta', forma: 'lista', opciones: INCLUIDOS, tipos: CONSTRUIDOS, operaciones: ['renta'] },
]

const POR_CLAVE: ReadonlyMap<string, Def> = new Map(DEFINICIONES.map((d) => [d.clave, d]))

/** ¿Esta característica aplica a ese tipo y operación? */
export function aplica(def: Def, tipo: unknown, operacion: unknown): boolean {
  if (!def.tipos.includes(tipoBase(tipo))) return false
  if (def.operaciones && !def.operaciones.includes(String(operacion ?? ''))) return false
  return true
}

/** Las definiciones que aplican a ese tipo/operación, en orden. */
export function definicionesPara(tipo: unknown, operacion: unknown): Def[] {
  return DEFINICIONES.filter((d) => aplica(d, tipo, operacion))
}

/** Opciones válidas de una lista para un tipo concreto. */
export function opcionesDe(def: Def, tipo: unknown): readonly Opcion[] {
  if (def.forma !== 'lista' && def.forma !== 'enum') return []
  if (def.forma === 'lista' && def.opcionesPorTipo) {
    const permitidas = def.opcionesPorTipo[tipoBase(tipo)]
    if (permitidas) return def.opciones.filter(([v]) => permitidas.includes(v))
  }
  return def.opciones
}

export type Caracteristicas = Partial<Record<string, string | number | boolean | string[]>>

const ES_OBJETO = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Lee `extras.caracteristicas` de lo que venga de la base (tolera basura: lo desconocido se ignora, nunca revienta). */
export function leerCaracteristicas(extras: unknown): Caracteristicas {
  if (!ES_OBJETO(extras)) return {}
  const c = extras[CLAVE_EXTRAS]
  if (!ES_OBJETO(c)) return {}
  const salida: Caracteristicas = {}
  for (const [k, v] of Object.entries(c)) {
    if (k === 'v' || !POR_CLAVE.has(k)) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || (Array.isArray(v) && v.every((x) => typeof x === 'string'))) salida[k] = v
  }
  return salida
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
function fechaValida(s: string): boolean {
  if (!FECHA.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Valida UN valor contra su definición. Devuelve el valor normalizado o un mensaje de error. */
export function validarValor(def: Def, v: unknown, tipo: unknown): { ok: true; valor: string | number | boolean | string[] } | { ok: false; error: string } {
  const mal = (msg: string) => ({ ok: false as const, error: `${def.etiqueta}: ${msg}` })
  switch (def.forma) {
    case 'entero':
    case 'decimal': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN
      if (!Number.isFinite(n) || n < def.min || n > def.max) return mal(`número fuera de rango (${def.min}–${def.max})`)
      if (def.forma === 'entero' && !Number.isInteger(n)) return mal('debe ser un número entero')
      return { ok: true, valor: n }
    }
    case 'bool':
      return typeof v === 'boolean' ? { ok: true, valor: v } : mal('debe ser verdadero o falso')
    case 'enum':
      return typeof v === 'string' && def.opciones.some(([o]) => o === v) ? { ok: true, valor: v } : mal('valor no permitido')
    case 'texto': {
      if (typeof v !== 'string') return mal('texto no válido')
      const t = v.trim()
      if (t.length === 0 || t.length > def.max) return mal(`texto no válido (máximo ${def.max} caracteres)`)
      return { ok: true, valor: t }
    }
    case 'fecha':
      return typeof v === 'string' && fechaValida(v) ? { ok: true, valor: v } : mal('fecha no válida (AAAA-MM-DD)')
    case 'lista': {
      if (!Array.isArray(v) || v.length > def.opciones.length) return mal('lista no válida')
      const validas = opcionesDe(def, tipo).map(([o]) => o)
      if (v.some((x) => typeof x !== 'string' || !validas.includes(x))) return mal('contiene opciones que no aplican a este inmueble')
      return { ok: true, valor: Array.from(new Set(v as string[])) }
    }
  }
}

/** Una característica «vacía» se omite al guardar (no se guarda `null`, `''` ni `[]`). */
const vacia = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

export type ResultadoCaracteristicas = { valor: Record<string, unknown> | null; errores: string[] }

/**
 * Valida el objeto `caracteristicas` que manda el cliente contra el tipo/operación EFECTIVOS del anuncio.
 *  · clave desconocida → error (no se aceptan claves nuevas desde el cliente);
 *  · clave que no aplica al tipo/operación → error;
 *  · valor fuera de rango / de tipo → error.
 * `valor` es `null` si no queda nada (se quita el espacio de nombres).
 */
export function validarCaracteristicas(entrada: unknown, tipo: unknown, operacion: unknown): ResultadoCaracteristicas {
  if (entrada === null || entrada === undefined) return { valor: null, errores: [] }
  if (!ES_OBJETO(entrada)) return { valor: null, errores: ['características: objeto no válido'] }
  const errores: string[] = []
  const salida: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(entrada)) {
    if (k === 'v') {
      if (v !== VERSION_CARACTERISTICAS) errores.push('características: versión no soportada')
      continue
    }
    const def = POR_CLAVE.get(k)
    if (!def) { errores.push(`${k}: característica no permitida`); continue }
    if (vacia(v)) continue
    if (!aplica(def, tipo, operacion)) { errores.push(`${def.etiqueta}: no aplica a ${tipoBase(tipo) || 'este tipo'}${def.operaciones && !def.operaciones.includes(String(operacion ?? '')) ? ' en esta operación' : ''}`); continue }
    const r = validarValor(def, v, tipo)
    if (!r.ok) { errores.push(r.error); continue }
    salida[k] = r.valor
  }
  // reglas entre campos: los techados no pueden ser más que el total
  if (typeof salida.estacionamientos_cubiertos === 'number') {
    const total = typeof salida.estacionamientos === 'number' ? salida.estacionamientos : null
    if (total === null) errores.push('Estacionamientos techados: indica también el total de estacionamientos')
    else if (salida.estacionamientos_cubiertos > total) errores.push('Estacionamientos techados: no pueden ser más que el total de estacionamientos')
  }
  if (errores.length) return { valor: null, errores }
  if (Object.keys(salida).length === 0) return { valor: null, errores: [] }
  return { valor: { v: VERSION_CARACTERISTICAS, ...salida }, errores: [] }
}

/** Quita lo que ya no aplica (cambió el tipo u operación). Lo demás se conserva intacto. */
export function podarCaracteristicas(c: Caracteristicas | Record<string, unknown>, tipo: unknown, operacion: unknown): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(c)) {
    if (k === 'v') continue
    const def = POR_CLAVE.get(k)
    if (!def || !aplica(def, tipo, operacion)) continue
    if (def.forma === 'lista') {
      const validas = opcionesDe(def, tipo).map(([o]) => o)
      const filtrada = (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && validas.includes(x))
      if (filtrada.length) salida[k] = filtrada
      continue
    }
    salida[k] = v
  }
  return Object.keys(salida).length ? { v: VERSION_CARACTERISTICAS, ...salida } : {}
}

/** `extras` completo con `caracteristicas` reemplazado (o quitado si queda vacío); el resto de claves se conserva. */
export function conCaracteristicas(extras: unknown, caracteristicas: Record<string, unknown> | null): Record<string, unknown> {
  const base: Record<string, unknown> = ES_OBJETO(extras) ? { ...extras } : {}
  delete base[CLAVE_EXTRAS]
  if (caracteristicas && Object.keys(caracteristicas).filter((k) => k !== 'v').length) base[CLAVE_EXTRAS] = caracteristicas
  return base
}

/* ── Lectura pública ─────────────────────────────────────────── */

/** Lo único que este módulo lee de una propiedad (acepta filas de la base, de la API o del editor: por eso `unknown`). */
export type PropiedadConCaracteristicas = {
  tipo?: unknown
  subtipo?: unknown
  operacion?: unknown
  extras?: unknown
}

/** Etiqueta del subtipo («Consultorio», «Terreno industrial»…) o `null` si no hay o no corresponde al tipo (dato antiguo). */
export function etiquetaSubtipo(tipo: unknown, subtipo: unknown): string | null {
  if (typeof subtipo !== 'string' || !subtipo) return null
  return SUBTIPOS[tipoBase(tipo) as Tipo]?.find((s) => s.valor === subtipo)?.etiqueta ?? null
}

/** 2.5 → «2 baños y medio»; 1 → «1 baño»; 0.5 → «Medio baño». */
export function textoBanos(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null
  const enteros = Math.floor(n)
  const medio = n - enteros >= 0.5
  if (enteros === 0) return 'Medio baño'
  return `${enteros} ${enteros === 1 ? 'baño' : 'baños'}${medio ? ' y medio' : ''}`
}

/**
 * Las dos superficies de una propiedad (decisión del dueño, 27-oct-2026): el TERRENO TOTAL es el metro cuadrado más importante y va primero; la construcción va al lado.
 *  · `metros` conserva su significado histórico (la superficie principal del anuncio: construida en casas, locales, departamentos y naves; del terreno en un terreno).
 *  · `m_terreno` (en `extras`) es el terreno de casas, locales, naves, bodegas, edificios y ranchos.
 * Un terreno solo tiene terreno; un departamento u oficina solo construcción. Si una casa no capturó su terreno, solo se enseña la construcción (como siempre).
 */
export type Superficies = { terreno: number | null; construccion: number | null; etiquetaConstruccion: string }
const positivo = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}
export function superficiesDe(p: { tipo?: unknown; metros?: unknown; m2?: unknown; extras?: unknown }): Superficies {
  const base = tipoBase(p.tipo)
  const metros = positivo(p.metros) ?? positivo(p.m2)
  if (base === 'terreno') return { terreno: metros ?? positivo(leerCaracteristicas(p.extras).m_terreno), construccion: null, etiquetaConstruccion: 'Construcción' }
  const admiteTerreno = base === 'casa' || base === 'local' || base === 'nave' || base === 'bodega' || base === 'edificio' || base === 'rancho'
  const terreno = admiteTerreno ? positivo(leerCaracteristicas(p.extras).m_terreno) : null
  return { terreno, construccion: metros, etiquetaConstruccion: base === 'nave' || base === 'bodega' ? 'Nave' : 'Construcción' }
}

/** Cómo se llama `metros` según el tipo (el dato histórico no cambia; la etiqueta dice qué suele ser). */
export function etiquetaSuperficie(tipo: unknown): string {
  switch (tipoBase(tipo)) {
    case 'terreno': return 'Superficie del terreno'
    case 'casa': case 'departamento': case 'oficina': case 'local': case 'edificio': return 'Superficie construida'
    case 'nave': case 'bodega': return 'Superficie de la nave'
    default: return 'Superficie'
  }
}

export type ItemCaracteristica = { clave: string; etiqueta: string; valor: string }
export type GrupoVisible = { id: GrupoCaracteristica; titulo: string; items: ItemCaracteristica[]; listas: { clave: string; etiqueta: string; valores: string[] }[] }

function textoValor(def: Def, v: unknown): string | null {
  if (vacia(v)) return null
  switch (def.forma) {
    case 'entero': case 'decimal':
      if (typeof v !== 'number') return null
      if (def.clave === 'antiguedad_anos') return v === 0 ? 'A estrenar' : `${v} ${v === 1 ? 'año' : 'años'}`
      if (def.clave === 'piso') return v === 0 ? 'Planta baja' : String(v)
      if (def.clave === 'deposito_meses') return `${v} ${v === 1 ? 'mes' : 'meses'}`
      if (def.clave === 'plazo_minimo_meses') return `${v} ${v === 1 ? 'mes' : 'meses'}`
      return def.unidad ? `${v.toLocaleString('es-MX')} ${def.unidad}` : v.toLocaleString('es-MX')
    case 'bool': return v === true ? 'Sí' : null
    case 'enum': return def.opciones.find(([o]) => o === v)?.[1] ?? null
    case 'texto': return typeof v === 'string' ? v : null
    case 'fecha': {
      if (typeof v !== 'string' || !fechaValida(v)) return null
      const hoy = new Date().toISOString().slice(0, 10)
      if (v <= hoy) return 'Inmediata'
      return new Date(`${v}T00:00:00Z`).toLocaleDateString('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
    }
    default: return null
  }
}

/**
 * Lo que se MUESTRA en la ficha pública: grupos con sus datos, sin campos vacíos, ni los que no aplican al tipo/operación actuales
 * (un anuncio que pasó de renta a venta no enseña «mascotas»). Lee sólo `extras.caracteristicas`; las columnas de siempre las pinta la ficha.
 */
export function gruposVisibles(p: PropiedadConCaracteristicas): GrupoVisible[] {
  const c = leerCaracteristicas(p.extras)
  const grupos: GrupoVisible[] = []
  for (const g of GRUPOS_CARACTERISTICAS) {
    const items: ItemCaracteristica[] = []
    const listas: GrupoVisible['listas'] = []
    for (const def of DEFINICIONES) {
      if (def.grupo !== g.id || def.concepto === 'amenidad' || !aplica(def, p.tipo, p.operacion)) continue
      const v = c[def.clave]
      if (def.forma === 'lista') {
        const validas = opcionesDe(def, p.tipo)
        const etiquetas = (Array.isArray(v) ? v : []).map((x) => validas.find(([o]) => o === x)?.[1]).filter((x): x is string => !!x)
        if (etiquetas.length) listas.push({ clave: def.clave, etiqueta: def.etiqueta, valores: etiquetas })
        continue
      }
      const t = textoValor(def, v)
      if (t) items.push({ clave: def.clave, etiqueta: def.etiqueta, valor: t })
    }
    if (g.id === 'espacios') {
      const sub = etiquetaSubtipo(p.tipo, p.subtipo)
      if (sub) items.unshift({ clave: 'subtipo', etiqueta: 'Tipo específico', valor: sub })
    }
    if (items.length || listas.length) grupos.push({ id: g.id, titulo: g.titulo, items, listas })
  }
  return grupos
}

/** Las definiciones de amenidad que aplican a ese tipo/operación (para editarlas bajo «Amenidades»). */
export function definicionesDeAmenidad(tipo: unknown, operacion: unknown): Def[] {
  return DEFINICIONES.filter((d) => d.concepto === 'amenidad' && aplica(d, tipo, operacion))
}

const normaliza = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Las amenidades declaradas con las opciones estructuradas (elevador, seguridad, áreas comunes), ya en texto legible. */
export function amenidadesEstructuradas(p: PropiedadConCaracteristicas): string[] {
  const c = leerCaracteristicas(p.extras)
  const salida: string[] = []
  for (const def of definicionesDeAmenidad(p.tipo, p.operacion)) {
    const v = c[def.clave]
    if (def.forma === 'bool') { if (v === true) salida.push(def.etiquetaAmenidad ?? def.etiqueta) }
    else if (def.forma === 'lista' && Array.isArray(v)) {
      const validas = opcionesDe(def, p.tipo)
      for (const x of v) { const e = validas.find(([o]) => o === x)?.[1]; if (e) salida.push(e) }
    }
  }
  return salida
}

/**
 * Lo que la ficha pública enseña bajo «Amenidades»: las etiquetas libres de la columna `amenidades` y las amenidades estructuradas,
 * sin repetir (mismo nombre sin importar mayúsculas ni acentos). Son DOS datos distintos que se leen por separado; aquí solo se juntan para mostrar.
 */
export function amenidadesParaFicha(p: PropiedadConCaracteristicas, etiquetas: readonly string[] | null | undefined): string[] {
  const vistos = new Set<string>()
  const salida: string[] = []
  for (const a of [...(etiquetas ?? []), ...amenidadesEstructuradas(p)]) {
    const k = normaliza(a)
    if (!k || vistos.has(k)) continue
    vistos.add(k)
    salida.push(a)
  }
  return salida
}

/** Valor numérico de una característica (para comparar y filtrar), o `null`. */
export function numeroDe(p: PropiedadConCaracteristicas, clave: string): number | null {
  const def = POR_CLAVE.get(clave)
  if (!def || !aplica(def, p.tipo, p.operacion)) return null
  const v = leerCaracteristicas(p.extras)[clave]
  return typeof v === 'number' ? v : null
}

/** Valor de texto (enum) de una característica, o `null`. */
export function enumDe(p: PropiedadConCaracteristicas, clave: string): string | null {
  const def = POR_CLAVE.get(clave)
  if (!def || !aplica(def, p.tipo, p.operacion)) return null
  const v = leerCaracteristicas(p.extras)[clave]
  return typeof v === 'string' ? v : null
}

/** Valores de una característica de LISTA (p. ej. `interiores`), o `[]` si no aplica al tipo/operación o no hay. Para filtrar (mismo criterio que `numeroDe`/`enumDe`). */
export function listaDe(p: PropiedadConCaracteristicas, clave: string): string[] {
  const def = POR_CLAVE.get(clave)
  if (!def || def.forma !== 'lista' || !aplica(def, p.tipo, p.operacion)) return []
  const v = leerCaracteristicas(p.extras)[clave]
  return Array.isArray(v) ? v : []
}

/** Valor booleano de una característica (p. ej. `elevador`), o `null` si no aplica o no hay. */
export function boolDe(p: PropiedadConCaracteristicas, clave: string): boolean | null {
  const def = POR_CLAVE.get(clave)
  if (!def || def.forma !== 'bool' || !aplica(def, p.tipo, p.operacion)) return null
  const v = leerCaracteristicas(p.extras)[clave]
  return typeof v === 'boolean' ? v : null
}

/** Etiquetas cortas para la tarjeta del catálogo (máximo `max`, sin saturar). */
export function etiquetasTarjeta(p: PropiedadConCaracteristicas, max = 3): string[] {
  const salida: string[] = []
  const sub = etiquetaSubtipo(p.tipo, p.subtipo)
  if (sub) salida.push(sub)
  const est = numeroDe(p, 'estacionamientos')
  if (est) salida.push(`${est} ${est === 1 ? 'estacionamiento' : 'estacionamientos'}`)
  if (p.operacion === 'renta') {
    const am = enumDe(p, 'amueblado')
    if (am === 'si') salida.push('Amueblado')
    else if (am === 'semi') salida.push('Semiamueblado')
    const ma = enumDe(p, 'mascotas')
    if (ma === 'permitidas') salida.push('Admite mascotas')
  }
  const ant = numeroDe(p, 'antiguedad_anos')
  if (ant === 0) salida.push('A estrenar')
  return salida.slice(0, max)
}
