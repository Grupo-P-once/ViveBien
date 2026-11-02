// Sonda de heap para diagnosticar fugas (D-62). Se precarga con NODE_OPTIONS=--require ... en el servidor de PRUEBA (nunca en producción).
//  GET :9501/gc            → fuerza GC y devuelve heapUsed
//  GET :9501/snap?f=ruta   → escribe un heap snapshot
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS (.cjs): `require` es su única sintaxis de importación; solo este bloque, el resto de reglas sigue activo */
const http = require('http')
const v8 = require('v8')
const vm = require('vm')
/* eslint-enable @typescript-eslint/no-require-imports */
v8.setFlagsFromString('--expose-gc')
const gc = vm.runInNewContext('gc')
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/gc') { gc(); gc(); const m = process.memoryUsage(); res.end(JSON.stringify({ heapUsedMB: +(m.heapUsed / 1048576).toFixed(1), rssMB: +(m.rss / 1048576).toFixed(0), externalMB: +(m.external / 1048576).toFixed(1) })); return }
  if (u.pathname === '/snap') { gc(); const f = v8.writeHeapSnapshot(u.searchParams.get('f')); res.end(f); return }
  res.statusCode = 404; res.end()
})
// `next start` lanza el servidor en un proceso HIJO que hereda NODE_OPTIONS: el primero en llegar toma 9501, el siguiente 9502, etc.
;(function escuchar(puerto) {
  srv.once('error', (e) => { if (e.code === 'EADDRINUSE' && puerto < 9510) escuchar(puerto + 1) })
  srv.listen(puerto, '127.0.0.1')
})(9501)
