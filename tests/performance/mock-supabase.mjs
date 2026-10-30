// Supabase de réplica para pruebas de carga/caos del APP (D-62). NUNCA muta ni carga producción:
//  · GET /rest/v1/*  con la clave ANÓNIMA → se reenvía UNA vez a Supabase real (lectura pública) y se guarda en memoria; el resto sale de memoria.
//  · GET con cualquier otra clave (p. ej. la de servicio ficticia del servidor local) → 401 como haría PostgREST.
//  · POST/PATCH/PUT/DELETE → se CUENTAN y se responde 201 [] sin reenviar nada (cero mutaciones en producción).
//  · Modos de caos por /__control?modo=normal|lento|error500|caido|colgado&ms=N  y  /__stats
import http from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const REAL = process.env.REAL_SUPABASE_URL
const ANON = process.env.REAL_SUPABASE_ANON_KEY
const PUERTO = Number(process.env.MOCK_PORT ?? 54399)
if (!REAL || !ANON) { console.error('Faltan REAL_SUPABASE_URL / REAL_SUPABASE_ANON_KEY'); process.exit(1) }

const cache = new Map()
// FIXTURA (R-16): respuestas públicas CONGELADAS en un archivo para que las pruebas visuales no dependan de los datos vivos de producción.
//  · MOCK_FIXTURA=ruta.json  → al arrancar se cargan; sin MOCK_GRABAR=1 el servidor SOLO sirve lo que haya ahí (lo demás: 404, nunca reenvía).
//  · MOCK_GRABAR=1           → lo que se reenvíe a Supabase real (solo lecturas anónimas) se guarda además en el archivo.
const FIXTURA = process.env.MOCK_FIXTURA
const GRABAR = process.env.MOCK_GRABAR === '1'
if (FIXTURA && existsSync(FIXTURA)) {
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(FIXTURA, 'utf8')))) cache.set(k, { status: v.status, tipo: v.tipo, cuerpo: Buffer.from(v.cuerpo, 'base64'), rango: v.rango })
}
function guardarFixtura() {
  if (!FIXTURA || !GRABAR) return
  writeFileSync(FIXTURA, JSON.stringify(Object.fromEntries([...cache].sort().map(([k, v]) => [k, { status: v.status, tipo: v.tipo, rango: v.rango, cuerpo: v.cuerpo.toString('base64') }])), null, 1))
}
const st = { modo: 'normal', ms: 0, reenviadas: 0, desdeMemoria: 0, bloqueadasEscritura: 0, rechazadas401: 0, total: 0 }

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  // CORS: el navegador de las pruebas habla con la réplica directamente (el cliente de Supabase del navegador).
  res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', '*'); res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS'); res.setHeader('access-control-expose-headers', 'content-range')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (url.pathname === '/__control') { st.modo = url.searchParams.get('modo') ?? 'normal'; st.ms = Number(url.searchParams.get('ms') ?? 0); res.end(JSON.stringify(st)); return }
  if (url.pathname === '/__stats') { res.end(JSON.stringify({ ...st, cacheEntradas: cache.size })); return }
  st.total++
  if (st.modo === 'caido') { req.socket.destroy(); return }
  if (st.modo === 'colgado') return // nunca responde
  if (st.modo === 'lento') await new Promise((r) => setTimeout(r, st.ms))
  if (st.modo === 'error500') { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'mock 500' })); return }
  if (req.method !== 'GET' && req.method !== 'HEAD') { st.bloqueadasEscritura++; res.writeHead(201, { 'content-type': 'application/json' }); res.end('[]'); return }
  const clave = (req.headers.apikey ?? '').toString()
  // La clave de servicio FICTICIA del entorno aislado solo puede leer los flags (los de producción, copiados a MOCK_FLAGS_JSON): sin esto el portal queda «cerrado» (404) por diseño.
  if (clave === 'dummy-local-key' && process.env.MOCK_FLAGS_JSON && req.url.startsWith('/rest/v1/configuracion')) {
    const fila = { valor: JSON.parse(process.env.MOCK_FLAGS_JSON) }
    const cuerpo = (req.headers.accept ?? '').includes('pgrst.object') ? fila : [fila]
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(cuerpo)); return
  }
  if (clave !== ANON) { st.rechazadas401++; res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'Invalid API key' })); return }
  // Solo se reenvía lectura REST (`/rest/v1/…`): cualquier otra ruta (auth, storage, functions…) se rechaza sin tocar producción.
  if (!req.url.startsWith('/rest/v1/')) { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'solo /rest/v1 en el entorno aislado' })); return }
  const k = req.url + '|' + (req.headers.accept ?? '')
  let hit = cache.get(k)
  if (hit) st.desdeMemoria++
  else {
    if (FIXTURA && !GRABAR) { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'fuera de la fixtura congelada' })); return }
    st.reenviadas++
    const r = await fetch(REAL + req.url, { headers: { apikey: ANON, authorization: 'Bearer ' + ANON, accept: (req.headers.accept ?? '*/*').toString() } })
    hit = { status: r.status, tipo: r.headers.get('content-type') ?? 'application/json', cuerpo: Buffer.from(await r.arrayBuffer()), rango: r.headers.get('content-range') }
    if (r.status < 500) { cache.set(k, hit); guardarFixtura() }
  }
  const h = { 'content-type': hit.tipo }; if (hit.rango) h['content-range'] = hit.rango
  res.writeHead(hit.status, h); res.end(hit.cuerpo)
}).listen(PUERTO, () => console.log('mock-supabase en', PUERTO))
