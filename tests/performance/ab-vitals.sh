#!/usr/bin/env bash
# Web Vitals de un árbol de código en el entorno aislado (build contra la réplica de Supabase; la telemetría del sitio se aborta). R-07/R-08.
# Uso: bash ab-vitals.sh <etiqueta> <carpeta-src> <carpeta-logs> ["/,/propiedades,/propiedades/<slug>"] [repeticiones=3]
set -u
. "$(dirname "$0")/verificar-energia.sh" || exit 3
cd "$(dirname "$0")"
ET="$1"; SRC_MEDIR="$2"; SP="$3"; PAGS="${4:-/,/propiedades,/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl}"; REP="${5:-3}"
PERF=/c/Users/jemil/vivebien-perf; ENVF=/c/Users/jemil/vivebien-next/.env.local
matar() { powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3140 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }" >/dev/null 2>&1; }
entorno() {
  set -a; eval "$(grep -E '^NEXT_PUBLIC_(FIREBASE)[A-Z_]*=' "$ENVF" | tr -d '\r')"; set +a
  eval "$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$ENVF" | tr -d '\r')"
  export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY=dummy-local-key
}
matar; sleep 1
rm -rf "$PERF/src"; cp -r "$SRC_MEDIR" "$PERF/src"
[ -n "${CONFIG_EXTRA:-}" ] && cp "$CONFIG_EXTRA" "$PERF/next.config.ts"
( cd "$PERF"; entorno; npx next build > "$SP/build_vit_$ET.log" 2>&1; echo "build $ET exit=$?"; nohup npx next start -p 3140 > "$SP/start_vit_$ET.log" 2>&1 & )
for i in $(seq 1 30); do c=$(curl -s -o /dev/null -w "%{http_code}" localhost:3140/api/salud); [ "$c" != "000" ] && break; sleep 2; done
for r in / /propiedades /propiedades/tzula-castillos; do curl -s -o /dev/null "localhost:3140$r"; done
THROTTLE="${THROTTLE:-}" PAGINAS="$PAGS" MSYS_NO_PATHCONV=1 node navegador-web-vitals.mjs http://localhost:3140 "k6/reports/vitals-$ET.json" "$REP" | tee "k6/reports/vitals-$ET.txt"
matar
echo "VITALS $ET TERMINADO"
