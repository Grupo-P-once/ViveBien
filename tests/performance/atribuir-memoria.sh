#!/usr/bin/env bash
# Atribuye el crecimiento de memoria del servidor Next a un grupo de endpoints (D-62). Para cada grupo: servidor NUEVO con heap de 256 MB,
# N peticiones a ese grupo, y se registra: ¿sobrevive?, memoria privada antes/después, errores. Requiere la réplica de Supabase en :54399.
# Uso: bash atribuir-memoria.sh "catalogo listado ficha ..." [TASA] [DURACION]
set -u
. "$(dirname "$0")/verificar-energia.sh" || exit 3
cd "$(dirname "$0")"
PERF=/c/Users/jemil/vivebien-perf
ENVF=/c/Users/jemil/vivebien-next/.env.local
K6="/c/Program Files/k6/k6.exe"
GRUPOS="${1:-catalogo listado home ficha ficha_id ficha_oculta_404 ayuda ayuda_buscar sitemap salud}"
TASA="${2:-200}"
DUR="${3:-40s}"
SALIDA=k6/reports/atribucion-memoria.tsv
printf 'grupo\tpeticiones\tsobrevive\tprivada_antes_mb\tprivada_despues_mb\tcrece_mb\tbytes_por_peticion\terror_http_pct\n' > "$SALIDA"
mem() { powershell -NoProfile -Command "\$p=(Get-NetTCPConnection -LocalPort 3140 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess; if(\$p){[int]((Get-Process -Id \$p).PrivateMemorySize64/1MB)}else{-1}"; }
matar() { powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3140 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }" >/dev/null 2>&1; }
for g in $GRUPOS; do
  matar; sleep 1
  ( cd "$PERF"
    set -a; eval "$(grep -E '^NEXT_PUBLIC_(FIREBASE)[A-Z_]*=' "$ENVF" | tr -d '\r')"; set +a
    eval "$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$ENVF" | tr -d '\r')"
    export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY=dummy-local-key NODE_OPTIONS=--max-old-space-size=256
    nohup npx next start -p 3140 > /dev/null 2>&1 & )
  for i in $(seq 1 20); do c=$(curl -s -o /dev/null -w "%{http_code}" localhost:3140/api/salud); [ "$c" != "000" ] && break; sleep 2; done
  # calentamiento (una vez cada ruta) para no medir el arranque
  for r in / /propiedades /api/catalogo /ayuda /sitemap.xml; do curl -s -o /dev/null "localhost:3140$r"; done
  sleep 3; A=$(mem)
  "$K6" run --quiet --summary-export="k6/reports/mem-$g.json" -e BASE_URL=http://localhost:3140 -e GRUPO="$g" -e TASA="$TASA" -e DURACION="$DUR" k6/scenarios/08-memoria.js > "k6/reports/mem-$g.log" 2>&1
  sleep 2; B=$(mem)
  N=$(python -c "import json;print(json.load(open('k6/reports/mem-$g.json'))['metrics']['http_reqs']['count'])" 2>/dev/null || echo 0)
  ERR=$(python -c "import json;m=json.load(open('k6/reports/mem-$g.json'))['metrics']['http_req_failed'];print(round(100*m.get('value',m.get('rate',0)),1))" 2>/dev/null || echo "?")
  if [ "$B" = "-1" ]; then VIVO=NO; CREC="(murió)"; BPP="-"; else VIVO=si; CREC=$((B - A)); BPP=$(python -c "print(round(($B-$A)*1048576/max($N,1)))" 2>/dev/null || echo "-"); fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$g" "$N" "$VIVO" "$A" "$B" "$CREC" "$BPP" "$ERR" | tee -a "$SALIDA"
done
matar
echo "ATRIBUCIÓN TERMINADA"
