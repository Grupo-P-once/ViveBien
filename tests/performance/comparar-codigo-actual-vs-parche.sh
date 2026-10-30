#!/usr/bin/env bash
# Mide los mismos escalones de tasa con (a) el código ACTUAL de producción (E-33) y (b) el mismo código con createClient sin timers (solo en la copia de pruebas).
# Requiere la réplica de Supabase en :54399 y la copia C:\Users\jemil\vivebien-perf. No toca el repo ni producción.
set -u
cd "$(dirname "$0")"
PERF=/c/Users/jemil/vivebien-perf
STAGE=/c/Users/jemil/vivebien-deploy-stage-e33
ENVF=/c/Users/jemil/vivebien-next/.env.local
SP="$1"
NIVELES="${2:-25 50 100 150 200 300 450 600}"
matar() { powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3140 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }" >/dev/null 2>&1; }
entorno() {
  set -a; eval "$(grep -E '^NEXT_PUBLIC_(FIREBASE)[A-Z_]*=' "$ENVF" | tr -d '\r')"; set +a
  eval "$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$ENVF" | tr -d '\r')"
  export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY=dummy-local-key
}
ronda() {
  et="$1"
  matar; sleep 1
  ( cd "$PERF"; entorno; npx next build > "$SP/build_$et.log" 2>&1; echo "build $et exit=$?"
    nohup npx next start -p 3140 > "$SP/start_$et.log" 2>&1 & )
  for i in $(seq 1 30); do c=$(curl -s -o /dev/null -w "%{http_code}" localhost:3140/api/salud); [ "$c" != "000" ] && break; sleep 2; done
  for r in / /propiedades /api/catalogo /ayuda /sitemap.xml /propiedades/tzula-castillos; do curl -s -o /dev/null "localhost:3140$r"; done
  bash escalones-tasa.sh "$et" "$NIVELES" 40s
  powershell -NoProfile -Command "\$p=(Get-NetTCPConnection -LocalPort 3140 -State Listen).OwningProcess; '{0:N0} MB privada al terminar $et' -f ((Get-Process -Id \$p).PrivateMemorySize64/1MB)"
  matar
}
# (a) código actual: restaurar src de producción (E-33) en la copia
rm -rf "$PERF/src" && cp -r "$STAGE/src" "$PERF/src"
ronda actual
# (b) con el parche de createClient
PYTHONUTF8=1 python "$SP/parche_perf.py"
ronda parche
echo "COMPARACIÓN TERMINADA"
