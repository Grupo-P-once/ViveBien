import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { BASE, SLUG, ID_VISIBLE, ID_OCULTA, ENDPOINTS, PARO_ERRORES, PARO_P95_MS } from '../config/entorno.js'

const U = (name, ruta, esperado = [200]) => ({ name, ruta, esperado })

// «Roles» = superficies alcanzables SIN sesión (no hay credenciales de prueba: ver docs/QA). CLIENTE navega lo público;
// PUBLICADOR/ADMIN solo golpean su cascarón de página y sus APIs protegidas (deben responder 401, nunca datos).
export const SUPERFICIES = {
  CLIENTE: [
    U('home', '/'), U('listado', '/propiedades'), U('catalogo', '/api/catalogo'), U('ficha', '/propiedades/' + SLUG), U('ficha_id', '/propiedades/' + ID_VISIBLE),
    U('ficha_oculta_404', '/propiedades/' + ID_OCULTA, [404]), U('ayuda', '/ayuda'), U('ayuda_buscar', '/api/ayuda/buscar?q=cita'), U('sitemap', '/sitemap.xml'), U('salud', '/api/salud'),
  ],
  PUBLICADOR: [U('publicador_shell', '/publicador'), U('api_protegida_401', '/api/publicador/propiedades', [401]), U('catalogo', '/api/catalogo')],
  ADMIN: [U('admin_shell', '/admin/propiedades/pendientes'), U('api_protegida_401', '/api/admin/usuarios', [401]), U('api_protegida_401', '/api/admin/flags', [401])],
}

export function pedir(u) {
  const r = http.get(BASE + u.ruta, { tags: { name: u.name }, redirects: 0, timeout: '30s', responseCallback: http.expectedStatuses.apply(null, u.esperado) })
  check(r, { [u.name + ' ' + u.esperado.join('/')]: (x) => u.esperado.includes(x.status) }, { name: u.name })
  return r
}

export function sleepJ(s) { sleep(s * (0.5 + Math.random())) }

/** Una sesión de usuario: recorre su superficie con pausas de lectura (think time). */
export function sesion(rol, pausa = 1) {
  group(rol, () => { for (const u of SUPERFICIES[rol]) { pedir(u); if (pausa) sleepJ(pausa) } })
}

/** Mezcla configurable: MIX="CLIENTE:80,PUBLICADOR:10,ADMIN:10". */
export function elegirRol() {
  const mix = (__ENV.MIX || 'CLIENTE:80,PUBLICADOR:10,ADMIN:10').split(',').map((p) => p.split(':'))
  const total = mix.reduce((a, p) => a + Number(p[1]), 0)
  let x = Math.random() * total
  for (const p of mix) { x -= Number(p[1]); if (x <= 0) return p[0] }
  return 'CLIENTE'
}

/** Registra submétricas por endpoint (sin umbral real) y las cotas de PARO de seguridad. */
export function umbrales(conParo) {
  const t = {}
  for (const e of ENDPOINTS) t['http_req_duration{name:' + e + '}'] = ['max>=0'] // solo hace visibles p50/p95/p99 por endpoint
  if (conParo) {
    t.http_req_failed = [{ threshold: 'rate<' + PARO_ERRORES, abortOnFail: true, delayAbortEval: '15s' }]
    t.http_req_duration = [{ threshold: 'p(95)<' + PARO_P95_MS, abortOnFail: true, delayAbortEval: '20s' }]
  }
  return t
}
