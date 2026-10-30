import type { Referencia } from './modelo'

/**
 * Referencias APA 7 reutilizables. SOLO fuentes que se verificaron el 22-oct-2026 (la página carga y es del organismo que dice ser).
 * Lo que se afirma en un artículo y proviene de una de ellas está en la nota «Investigación SEO y fuentes del blog» (Obsidian).
 * Regla: una referencia nueva se añade aquí SOLO después de abrir la página exacta; nunca de memoria.
 */
export const REF = {
  lfpc: {
    autor: 'Cámara de Diputados del H. Congreso de la Unión',
    fecha: '2025, 12 de diciembre',
    titulo: 'Ley Federal de Protección al Consumidor (texto vigente, última reforma DOF 12-12-2025)',
    url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf',
  },
  lgahotdu: {
    autor: 'Cámara de Diputados del H. Congreso de la Unión',
    fecha: '2024, 1 de abril',
    titulo: 'Ley General de Asentamientos Humanos, Ordenamiento Territorial y Desarrollo Urbano (texto vigente, última reforma DOF 01-04-2024)',
    url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LGAHOTDU.pdf',
  },
  agraria: {
    autor: 'Cámara de Diputados del H. Congreso de la Unión',
    fecha: '2025, 14 de noviembre',
    titulo: 'Ley Agraria (texto vigente, última reforma DOF 14-11-2025)',
    url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAgra.pdf',
  },
  profeco: { autor: 'Procuraduría Federal del Consumidor', fecha: 's. f.', titulo: 'Sitio de la Procuraduría Federal del Consumidor', url: 'https://www.gob.mx/profeco' },
  shf: { autor: 'Sociedad Hipotecaria Federal', fecha: 's. f.', titulo: 'Sitio de Sociedad Hipotecaria Federal', url: 'https://www.gob.mx/shf' },
  ran: { autor: 'Registro Agrario Nacional', fecha: 's. f.', titulo: 'Sitio de Registro Agrario Nacional', url: 'https://www.gob.mx/ran' },
  inegi: { autor: 'Instituto Nacional de Estadística y Geografía', fecha: 's. f.', titulo: 'Página principal', url: 'https://www.inegi.org.mx/' },
  banxico: { autor: 'Banco de México', fecha: 's. f.', titulo: 'Página principal', url: 'https://www.banxico.org.mx/' },
  sat: { autor: 'Servicio de Administración Tributaria', fecha: 's. f.', titulo: 'Página principal', url: 'https://www.sat.gob.mx/' },
  infonavit: { autor: 'Instituto del Fondo Nacional de la Vivienda para los Trabajadores', fecha: 's. f.', titulo: 'Portal Infonavit', url: 'https://portalmx.infonavit.org.mx/' },
  condusef: { autor: 'Comisión Nacional para la Protección y Defensa de los Usuarios de Servicios Financieros', fecha: 's. f.', titulo: 'Página principal', url: 'https://www.condusef.gob.mx/' },
  leon: { autor: 'Municipio de León, Guanajuato', fecha: 's. f.', titulo: 'Sitio oficial del Municipio de León', url: 'https://www.leon.gob.mx/' },
  guanajuato: { autor: 'Gobierno del Estado de Guanajuato', fecha: 's. f.', titulo: 'Sitio oficial del Gobierno del Estado de Guanajuato', url: 'https://www.guanajuato.gob.mx/' },
} as const satisfies Record<string, Referencia>
