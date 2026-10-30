#!/usr/bin/env bash
# Capacidad (escalones de tasa constante) de un árbol de código, SIN sonda de heap (la sonda altera la medición). Servidor nuevo por ronda.
# Uso: bash ab-capacidad.sh <etiqueta> <carpeta-src> <carpeta-logs> ["100 200 300 450 600"] [duracion=40s]
set -u
. "$(dirname "$0")/verificar-energia.sh" || exit 3
cd "$(dirname "$0")"
ET="$1"; SRC_MEDIR="$2"; SP="$3"; NIVELES="${4:-100 200 300 450 600}"; DUR="${5:-40s}"
PERF=/c/Users/jemil/vivebien-perf
ENVF=/c/Users/jemil/vivebien-next/.env.local
matar() { powershell -NoProfile -Command "foreach (\$p in 3140,9501) { Get-NetTCPConnection -LocalPort \$p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force } }" >/dev/null 2>&1; }
entorno() {
  set -a; eval "$(grep -E '^NEXT_PUBLIC_(FIREBASE)[A-Z_]*=' "$ENVF" | tr -d '\r')"; set +a
  eval "$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$ENVF" | tr -d '\r')"
  export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY=dummy-local-key
}
matar; sleep 1
rm -rf "$PERF/src"; cp -r "$SRC_MEDIR" "$PERF/src"
( cd "$PERF"; entorno; npx next build > "$SP/build_cap_$ET.log" 2>&1; echo "build $ET exit=$?"
  nohup npx next start -p 3140 > "$SP/start_cap_$ET.log" 2>&1 & )
for i in $(seq 1 30); do c=$(curl -s -o /dev/null -w "%{http_code}" localhost:3140/api/salud); [ "$c" != "000" ] && break; sleep 2; done
for r in / /propiedades /api/catalogo /ayuda /sitemap.xml /propiedades/tzula-castillos "/api/ayuda/buscar?q=cita"; do curl -s -o /dev/null "localhost:3140$r"; done
sleep 3
bash escalones-tasa.sh "cap-$ET" "$NIVELES" "$DUR"
powershell -NoProfile -Command "\$p=(Get-NetTCPConnection -LocalPort 3140 -State Listen).OwningProcess; '{0:N0} MB privada al terminar $ET' -f ((Get-Process -Id \$p).PrivateMemorySize64/1MB)"
matar
echo "CAP $ET TERMINADO"
