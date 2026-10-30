// Configuración común. Ninguna cifra aquí es un criterio de calidad inventado: el baseline real sale de la primera corrida
// (reports/) y de ahí se proponen umbrales (docs/QA). Las cotas `PARO_*` son SOLO de seguridad (detener la prueba), no de calidad.
export const BASE = __ENV.BASE_URL || 'http://localhost:3140'
export const SLUG = __ENV.SLUG || 'casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl'
export const ID_VISIBLE = __ENV.ID_VISIBLE || 'tzula-castillos'
export const ID_OCULTA = __ENV.ID_OCULTA || 'sanjuan'
export const PARO_ERRORES = Number(__ENV.PARO_ERRORES || 0.05) // 5 % de peticiones fallidas
export const PARO_P95_MS = Number(__ENV.PARO_P95_MS || 5000) // p95 > 5 s sostenido
// Etiquetas de endpoint → permiten ver p50/p95/p99 por endpoint en el resumen.
export const ENDPOINTS = ['salud', 'catalogo', 'listado', 'ficha', 'ficha_id', 'ficha_oculta_404', 'sitemap', 'ayuda', 'ayuda_buscar', 'home', 'api_protegida_401', 'admin_shell', 'publicador_shell', 'recurso_404']
