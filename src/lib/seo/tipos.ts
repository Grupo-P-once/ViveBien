import type { Hallazgo } from './auditoria'
import type { Comprobacion } from './negocio'
import type { GrupoRobots } from './robots'

/** Lo que devuelven las rutas `/api/admin/seo/*` (el navegador solo lee). */
export type ResumenAuditoria = { paginas: number; porGravedad: { critica: number; alta: number; media: number; baja: number }; indice: number; msMedio: number | null; con200: number }
export type SitemapLeido = { url: string; estado: number | null; tipo: 'urlset' | 'index' | 'desconocido'; urls: number; conLastmod: number }

export type RespuestaAuditoria = {
  origen: string; cual: 'propio' | 'produccion'; alcance: 'rapida' | 'completa'; generado: string; duracionMs: number
  resumen: ResumenAuditoria
  hallazgos: Hallazgo[]
  paginas: Array<{ ruta: string; estado: number | null; redireccion: string | null; ms: number; enSitemap: boolean; titulo: string | null; noindex: boolean; jsonld: string[] }>
  omitidas: string[]
  sitemaps: SitemapLeido[]
}

export type RespuestaRobots = {
  origen: string; cual: 'propio' | 'produccion'; generado: string
  robots: { grupos: GrupoRobots[]; sitemaps: string[] } | null
  rastreadores: Array<{ agente: string; tipo: string; estado: 'permitido' | 'parcial' | 'bloqueado' }>
  sitemaps: SitemapLeido[]
}

export type RespuestaNegocio = {
  origen: string; cual: 'propio' | 'produccion'; generado: string
  negocio: { nombre: string; telefono: string; direccion: string; horario: string; coordenadas: { lat: number; lng: number } }
  comprobaciones: Comprobacion[]
  observadoGoogleMaps: { fecha: string; nombre: string; categoria: string; direccion: string; telefono: string; sitio: string; horario: string; codigoPlus: string; coordenadas: { lat: number; lng: number } }
  avisoDireccion: string
}
