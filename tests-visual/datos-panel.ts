/**
 * Datos fijos del panel para las capturas.
 *
 * Son inventados a propósito, pero con la FORMA y el ORDEN DE MAGNITUD de los
 * reales (7 publicadas, pocas vistas, un puñado de leads): así la captura
 * enseña el panel como lo ve el administrador, y no cambia cada vez que llega
 * un lead de verdad.
 *
 * Nada de esto toca la base: las rutas se responden en el navegador.
 */

const DIA_MS = 86_400_000
/** Un instante fijo para que las fechas relativas («hace 2 h») no bailen. */
export const AHORA = new Date('2026-09-17T18:00:00.000Z')

const dia = (atras: number) => new Date(AHORA.getTime() - atras * DIA_MS).toISOString()

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** 30 días de vistas y leads con una forma creíble. */
const tendencia = Array.from({ length: 31 }, (_, i) => {
  const f = new Date(AHORA.getTime() - (30 - i) * DIA_MS)
  const clave = f.toISOString().slice(0, 10)
  const base = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 5, 2, 8, 6, 11, 7, 9, 14, 10, 12][i]
  const leads = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 2, 0, 1, 0, 1][i]
  return { clave, etiqueta: `${f.getUTCDate()} ${MESES[f.getUTCMonth()]}`, vistas: base, leads }
})

const linea = (valores: number[]) => valores

export const RESUMEN = {
  periodo: '30d',
  desde: dia(30),
  hasta: AHORA.toISOString(),
  anteriorDesde: dia(60),
  faltan: [],
  eventosRecortados: false,
  kpis: [
    {
      clave: 'publicadas', valor: 7, formato: 'entero', variacion: null, nota: '2 publicadas en el período',
      linea: { anterior: linea([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]), actual: linea([5, 5, 5, 6, 6, 6, 6, 6, 7, 7, 7, 7]) },
    },
    {
      clave: 'leads', valor: 7, formato: 'entero', variacion: { tipo: 'porcentaje', valor: 40 }, nota: 'vs. período anterior',
      linea: { anterior: linea([0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0]), actual: linea([0, 0, 1, 0, 1, 1, 0, 2, 0, 1, 0, 1]) },
    },
    {
      clave: 'conversion', valor: 5.8, formato: 'porcentaje', variacion: { tipo: 'sin-comparacion', motivo: 'sin-historial' }, nota: 'vs. período anterior',
      linea: { anterior: [null, null, null, null, null, null, null, null, null, null, null, null], actual: linea([0, 0, 4.2, 5, 6.3, 5.9, 5.4, 6.1, 5.7, 5.8, 5.8, 5.8]) },
    },
    { clave: 'mercado', valor: 88, formato: 'dias', variacion: null, nota: 'promedio de 7 publicadas', linea: null },
  ],
  interaccion: [
    { clave: 'vistas', etiqueta: 'Vistas de propiedades', n: 120, pct: 100 },
    { clave: 'favoritos', etiqueta: 'Guardados en favoritos', n: 18, pct: 15 },
    { clave: 'solicitudes', etiqueta: 'Solicitudes de contacto', n: 7, pct: 5.8 },
  ],
  tendencia,
  agrupacion: 'dia',
  inventario: {
    porciones: [
      { clave: 'nave', etiqueta: 'Naves industriales', n: 3 },
      { clave: 'casa', etiqueta: 'Casas', n: 2 },
      { clave: 'terreno', etiqueta: 'Terrenos', n: 2 },
    ],
    total: 7,
  },
  zonas: [
    { zona: 'León Centro', busquedas: 9, activas: 3 },
    { zona: 'San Juan Bosco', busquedas: 6, activas: 1 },
    { zona: 'Cañada del Refugio', busquedas: 4, activas: 1 },
    { zona: 'Silao', busquedas: 3, activas: 2 },
    { zona: 'Zona Industrial', busquedas: 2, activas: 2 },
  ],
  mapa: {
    puntos: [
      { id: 'p1', nombre: 'Nave industrial Mandujano', folio: 'VB-2026-00006', lat: 21.1401, lng: -101.6602, vistas: 42, solicitudes: 3 },
      { id: 'p2', nombre: 'Casa Cañada de Mariches', folio: 'VB-2026-00015', lat: 21.0834, lng: -101.6431, vistas: 31, solicitudes: 2 },
      { id: 'p3', nombre: 'Bodega en Renta Blvd. San Juan Bosco', folio: 'VB-2026-00001', lat: 21.1553, lng: -101.7042, vistas: 24, solicitudes: 1 },
      { id: 'p4', nombre: 'Terreno Lagos', folio: 'VB-2026-00011', lat: 21.1102, lng: -101.7185, vistas: 15, solicitudes: 1 },
      { id: 'p5', nombre: 'Terreno industrial Silao (A)', folio: 'VB-2026-00013', lat: 20.9442, lng: -101.4281, vistas: 8, solicitudes: 0 },
    ],
    sinCoordenadas: 2,
  },
  historial: { eventos: false, contactos: true },
}

export const ACTIVIDAD = {
  faltan: [],
  items: [
    { id: 'a1', tipo: 'registro', titulo: 'Nuevo registro: María Fernanda Ruiz', detalle: 'Nave industrial en renta', fecha: new Date(AHORA.getTime() - 2 * 3600_000).toISOString(), enlace: '/admin/registros' },
    { id: 'a2', tipo: 'solicitud', titulo: 'Pidió una visita: Luis Ángel Torres', detalle: 'Casa Cañada de Mariches', fecha: new Date(AHORA.getTime() - 5 * 3600_000).toISOString(), enlace: '/admin/registros' },
    { id: 'a3', tipo: 'publicada', titulo: 'Publicada: Terreno industrial Silao (B)', detalle: 'VB-2026-00014', fecha: dia(1), enlace: '/admin/propiedades' },
    { id: 'a4', tipo: 'cuenta', titulo: 'Nueva cuenta: hector.mendez@gmail.com', detalle: null, fecha: dia(2), enlace: '/admin/usuarios' },
    { id: 'a5', tipo: 'usuario-cambio', titulo: 'Cambio de permisos: hector.mendez@gmail.com', detalle: 'rol: Cliente → Publicador', fecha: dia(2), enlace: '/admin/usuarios' },
    { id: 'a6', tipo: 'revision', titulo: 'Enviada a revisión: Local comercial Centro Max', detalle: 'VB-2026-00016', fecha: dia(3), enlace: '/admin/propiedades/pendientes' },
    { id: 'a7', tipo: 'invitacion', titulo: 'Invitación enviada: ventas@inmobiliariaslp.mx', detalle: 'Publicador', fecha: dia(4), enlace: '/admin/usuarios' },
    { id: 'a8', tipo: 'propiedad-creada', titulo: 'Propiedad creada: Bodega Blvd. Delta', detalle: null, fecha: dia(6), enlace: '/admin/propiedades' },
  ],
}

export const NOTIFICACIONES = {
  sinLeer: 3,
  items: [
    { id: 'revision:p9', tipo: 'revision', titulo: 'Por revisar: Local comercial Centro Max', detalle: null, fecha: dia(3), enlace: '/admin/propiedades/pendientes', nueva: true },
    { id: 'registro:l1', tipo: 'registro', titulo: 'Nuevo registro: María Fernanda Ruiz', detalle: 'Nave industrial en renta', fecha: new Date(AHORA.getTime() - 2 * 3600_000).toISOString(), enlace: '/admin/registros', nueva: true },
    { id: 'cuenta:u4', tipo: 'cuenta', titulo: 'Nueva cuenta: hector.mendez@gmail.com', detalle: null, fecha: dia(2), enlace: '/admin/usuarios', nueva: true },
    { id: 'invitacion:i2', tipo: 'invitacion', titulo: 'Aceptó la invitación: ventas@inmobiliariaslp.mx', detalle: null, fecha: dia(8), enlace: '/admin/usuarios', nueva: false },
  ],
}

export const PERFIL = {
  uid: 'panel-visual',
  email: 'jemilianoponceperez@gmail.com',
  nombre: 'Jose Emiliano Ponce',
  rol: 'admin',
  estado: 'activo',
  telefono: '4778108559',
  completitud: 100,
  faltantes: [],
}

export const BUSQUEDA = {
  q: 'nave',
  propiedades: [
    { id: 'p1', titulo: 'Nave industrial Mandujano', detalle: 'VB-2026-00006 · León de los Aldama, Gto.', enlace: '/admin/propiedades?q=VB-2026-00006' },
    { id: 'p3', titulo: 'Bodega en Renta Blvd. San Juan Bosco', detalle: 'VB-2026-00001 · León, Gto.', enlace: '/admin/propiedades?q=VB-2026-00001' },
  ],
  registros: [
    { id: 'lead:12', titulo: 'María Fernanda Ruiz', detalle: 'Nave industrial en renta', enlace: '/admin/registros?q=nave' },
  ],
  usuarios: [],
}

/* ── Registros y propiedades (pantalla de registros) ───────── */

const FOTO = '/3vive_bien_fotos/fotos index/472480945_122177589788123049_8197745573349032121_n.jpg'

export const PROPIEDADES = [
  { id: 'nave-mandujano', titulo: 'Nave industrial Mandujano', tipo: 'nave', operacion: 'venta', precio: 7900000, metros: 616, estatus: 'disponible', estado_pub: 'publicada', folio: 'VB-2026-00006', slug: 'nave-industrial-en-venta-mandujano-leon-jdoo', ubicacion: 'León de los Aldama, Gto.', fotos: [FOTO], publicada_en: dia(12), created_at: dia(20) },
  { id: 'casa-mariches', titulo: 'CASA CAÑADA DE MARICHES', tipo: 'casa', operacion: 'venta', precio: 14900000, metros: 738.6, estatus: 'disponible', estado_pub: 'publicada', folio: 'VB-2026-00015', slug: 'casa-en-venta-canada-de-mariches-leon-fe8t', ubicacion: 'Cañada del Refugio Sur, León, Gto.', fotos: [FOTO], publicada_en: dia(5), created_at: dia(6) },
  { id: 'bodega-san-juan', titulo: 'Bodega en Renta - Blvd. San Juan Bosco', tipo: 'nave', operacion: 'renta', precio: 89000, metros: 1244, estatus: 'pausada', estado_pub: 'publicada', folio: 'VB-2026-00001', slug: 'sanjuan', ubicacion: 'León, Gto.', fotos: [], publicada_en: '2026-04-01T15:00:00.000Z', created_at: '2026-04-01T15:00:00.000Z' },
  { id: 'terreno-silao-a', titulo: 'TERRENO INDUSTRIAL (A) PANAM II SILAO', tipo: 'terreno', operacion: 'venta', precio: 2280000, metros: 600, estatus: 'disponible', estado_pub: 'publicada', folio: 'VB-2026-00013', slug: 'terreno-industrial-a-panam', ubicacion: 'Silao de la Victoria, Gto.', fotos: [FOTO], publicada_en: dia(8), created_at: dia(9) },
  { id: 'local-centro-max', titulo: 'Local comercial Centro Max', tipo: 'local', operacion: 'renta', precio: 32000, metros: 85, estatus: 'disponible', estado_pub: 'en_revision', folio: 'VB-2026-00016', slug: null, ubicacion: 'León, Gto.', fotos: [], publicada_en: null, created_at: dia(3) },
  { id: 'borrador-x1', titulo: null, tipo: 'bodega', operacion: 'renta', precio: null, metros: null, estatus: 'disponible', estado_pub: 'borrador', folio: 'VB-2026-00017', slug: null, ubicacion: null, fotos: [], publicada_en: null, created_at: dia(1) },
  { id: 'casa-vieja', titulo: 'Casa Jardines del Moral', tipo: 'casa', operacion: 'venta', precio: 3450000, metros: 160, estatus: 'eliminada', estado_pub: 'borrador', folio: 'VB-2026-00004', slug: null, ubicacion: 'León, Gto.', fotos: [], publicada_en: null, created_at: '2026-04-03T15:00:00.000Z' },
]

export const REGISTROS = {
  total: 7,
  sinConsentimiento: 2,
  registros: [
    { id: 'solicitud:31', tipo: 'visita', nombre: 'Luis Ángel Torres', email: 'luis.torres@correo.com', telefono: '4771234567', mensaje: 'Quiere verla el sábado por la mañana.', propiedad: 'casa-mariches', fuente: 'solicitudes_contacto', origen: 'ficha', consentimiento: '2026-09-16', creado: new Date(AHORA.getTime() - 5 * 3600_000).toISOString() },
    { id: 'lead:44', tipo: 'propiedad', nombre: 'María Fernanda Ruiz', email: 'mafer.ruiz@correo.com', telefono: '4778108559', mensaje: 'Nave industrial en renta, zona norte', propiedad: 'nave-mandujano', fuente: 'leads', origen: 'ficha', consentimiento: '2026-09-16', creado: new Date(AHORA.getTime() - 2 * 3600_000).toISOString() },
    { id: 'lead:43', tipo: 'manual', nombre: 'Héctor Méndez', email: null, telefono: '4779876543', mensaje: 'Llamó preguntando por bodegas sobre el bulevar.', propiedad: 'bodega-san-juan', fuente: 'leads', origen: 'manual', consentimiento: '2026-09-16', creado: dia(1) },
    { id: 'lead:41', tipo: 'valuacion', nombre: 'Rosa Elena Aguilar', email: 'rosa.aguilar@correo.com', telefono: '4775558899', mensaje: 'avaluo - casa en Jardines del Moral', propiedad: null, fuente: 'leads', origen: 'valuador', consentimiento: null, creado: dia(2) },
    { id: 'usuario:u1', tipo: 'cuenta', nombre: 'JOSE EMILIANO PONCE', email: 'jemilianoponceperez@gmail.com', telefono: '4778108559', mensaje: null, propiedad: null, fuente: 'usuarios', origen: 'cuenta', consentimiento: null, creado: dia(5) },
    { id: 'usuario:u2', tipo: 'publicador', nombre: 'Jose Emiliano Ponce Perez', email: 'joseemilianoponceperez@gmail.com', telefono: '5247781165', mensaje: null, propiedad: null, fuente: 'usuarios', origen: 'cuenta', consentimiento: null, creado: dia(8) },
    { id: 'lead:12', tipo: 'interesado', nombre: 'Emiliano ponce prueba', email: 'grupo.p.11.ee@gmail.com', telefono: '4778108599', mensaje: 'Interés en: Nave Industrial San Juan Bosco', propiedad: null, fuente: 'leads', origen: null, consentimiento: null, creado: '2026-04-07T15:00:00.000Z' },
  ],
}

/* ── Usuarios e invitaciones ────────────────────────────────── */

export const USUARIOS = {
  usuarios: [
    { uid: 'u1', email: 'jemilianoponceperez@gmail.com', nombre: 'JOSE EMILIANO PONCE', telefono: '4778108559', rol: 'admin', estado: 'activo', completitud: 100, creado_en: dia(5), ultimo_acceso: new Date(AHORA.getTime() - 3 * 3600_000).toISOString(), esYo: true, protegido: true },
    { uid: 'u2', email: 'joseemilianoponceperez@gmail.com', nombre: 'Jose Emiliano Ponce Perez', telefono: '5247781165', rol: 'publicador', estado: 'activo', completitud: 65, creado_en: dia(8), ultimo_acceso: dia(1), esYo: false, protegido: false },
    { uid: 'u3', email: 'hector.mendez@gmail.com', nombre: 'Héctor Méndez', telefono: '4779876543', rol: 'cliente', estado: 'activo', completitud: 85, creado_en: dia(2), ultimo_acceso: null, esYo: false, protegido: false },
    { uid: 'u4', email: 'rosa.aguilar@correo.com', nombre: 'Rosa Elena Aguilar', telefono: null, rol: 'cliente', estado: 'suspendido', completitud: 40, creado_en: dia(40), ultimo_acceso: dia(20), esYo: false, protegido: false },
  ],
}

export const INVITACIONES = {
  invitaciones: [
    { id: 2, email: 'ventas@inmobiliariaslp.mx', nombre: 'Laura Ventas', rol: 'publicador', estado: 'pendiente', creado_en: dia(4), enviado_en: dia(4), aceptada_en: null },
    { id: 1, email: 'contacto@corredoresbajio.com', nombre: null, rol: 'publicador', estado: 'aceptada', creado_en: dia(12), enviado_en: dia(12), aceptada_en: dia(8) },
  ],
}
