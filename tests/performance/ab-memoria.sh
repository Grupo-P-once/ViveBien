#!/usr/bin/env bash
# A/B de memoria y capacidad entre dos árboles de código (D-62 → R-01). Mismo procedimiento para ANTES y DESPUÉS:
#  1) copia de pruebas (sin node_modules/.next) + overlay del código a medir, build contra la réplica de Supabase;
#  2) servidor con sonda de heap (node --require heap-probe.cjs): heap VIVO tras GC forzado tras N peticiones por grupo;
#  3) escalones de tasa constante y soak. NO toca producción ni el repo.
# Uso: bash ab-memoria.sh <etiqueta> <carpeta-src-a-medir> <carpeta-salida-logs> [peticiones_por_grupo=1500] [niveles="200 300 450"] [soak_s=360]
set -u
. "$(dirname "$0")/verificar-energia.sh" || exit 3
cd "$(dirname "$0")"
ET="$1"; SRC_MEDIR="$2"; SP="$3"; N="${4:-1500}"; NIVELES="${5:-200 300 450}"; SOAK="${6:-360}"
PERF=/c/Users/jemil/vivebien-perf
ENVF=/c/Users/jemil/vivebien-next/.env.local
K6="/c/Program Files/k6/k6.exe"
SAL=k6/reports/ab-$ET.txt
: > "$SAL"
log() { echo "$*" | tee -a "$SAL"; }
matar() { powershell -NoProfile -Command "foreach (\$p in 3140,9501) { Get-NetTCPConnection -LocalPort \$p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force } }" >/dev/null 2>&1; }
entorno() {
  set -a; eval "$(grep -E '^NEXT_PUBLIC_(FIREBASE)[A-Z_]*=' "$ENVF" | tr -d '\r')"; set +a
  eval "$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$ENVF" | tr -d '\r')"
  export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY=dummy-local-key
}
heap() { curl -s localhost:9501/gc; echo; }
matar; sleep 1
rm -rf "$PERF/src"; cp -r "$SRC_MEDIR" "$PERF/src"
( cd "$PERF"; entorno; npx next build > "$SP/build_ab_$ET.log" 2>&1; echo "build $ET exit=$?" )
( cd "$PERF"; entorno; nohup node --max-old-space-size=3072 --require C:/Users/jemil/vivebien-next/tests/performance/heap-probe.cjs node_modules/next/dist/bin/next start -p 3140 > "$SP/start_ab_$ET.log" 2>&1 & )
for i in $(seq 1 30); do c=$(curl -s -o /dev/null -w "%{http_code}" localhost:3140/api/salud); [ "$c" != "000" ] && break; sleep 2; done
for r in / /propiedades /api/catalogo /ayuda /sitemap.xml /propiedades/tzula-castillos "/api/ayuda/buscar?q=cita"; do curl -s -o /dev/null "localhost:3140$r"; done
sleep 2
log "== [$ET] heap vivo tras GC forzado (MB)"; log "A (calentado): $(heap)"
rm -f "$SP/_cur.json"
for g in ficha ayuda_buscar salud; do
  "$K6" run --quiet -e BASE_URL=http://localhost:3140 -e GRUPO=$g -e TASA=100 -e DURACION=$((N / 100))s k6/scenarios/08-memoria.js > /dev/null 2>&1
  log "tras ~$N peticiones a $g: $(heap)"
done
for n in $NIVELES; do
  "$K6" run --quiet --summary-trend-stats="avg,min,med,p(90),p(95),p(99),max" --summary-export="k6/reports/ab-$ET-esc-$n.json" -e BASE_URL=http://localhost:3140 -e GRUPO=CLIENTE -e TASA=$n -e DURACION=40s k6/scenarios/08-memoria.js > /dev/null 2>&1
  python - "$ET" "$n" <<'PY' | tee -a "$SAL"
import json, sys
et, n = sys.argv[1], sys.argv[2]
m = json.load(open('k6/reports/ab-%s-esc-%s.json' % (et, n)))['metrics']
d = m['http_req_duration']; f = m['http_req_failed']
print('escalón %s req/s → logrado %.0f · p50 %d · p95 %d · p99 %d ms · errores %.1f %% · descartadas %d' % (n, m['http_reqs']['rate'], d['med'], d['p(95)'], d['p(99)'], 100 * f.get('value', f.get('rate', 0)), m.get('dropped_iterations', {}).get('count', 0)))
PY
  sleep 5
done
log "tras escalones: $(heap)"
"$K6" run --quiet --summary-trend-stats="avg,min,med,p(90),p(95),p(99),max" --summary-export="k6/reports/ab-$ET-soak.json" -e BASE_URL=http://localhost:3140 -e VUS=40 -e DURACION=${SOAK}s -e MIX=CLIENTE:100 k6/scenarios/05-soak.js > /dev/null 2>&1
python - "$ET" <<'PY' | tee -a "$SAL"
import json, sys
m = json.load(open('k6/reports/ab-%s-soak.json' % sys.argv[1]))['metrics']
d = m['http_req_duration']; f = m['http_req_failed']
print('soak: %d peticiones · %.1f req/s · p50 %d · p95 %d · p99 %d ms · errores %.2f %%' % (m['http_reqs']['count'], m['http_reqs']['rate'], d['med'], d['p(95)'], d['p(99)'], 100 * f.get('value', f.get('rate', 0))))
PY
log "tras soak: $(heap)"
log "RSS final: $(powershell -NoProfile -Command "\$p=(Get-NetTCPConnection -LocalPort 3140 -State Listen).OwningProcess; '{0:N0} MB privada' -f ((Get-Process -Id \$p).PrivateMemorySize64/1MB)")"
matar
log "AB $ET TERMINADO"
