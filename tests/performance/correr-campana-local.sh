#!/usr/bin/env bash
# Campaña de carga LOCAL (app aislada + Supabase de réplica; no toca producción). Orden: load → stress → spike → recovery → breakpoint → soak.
# Uso: bash tests/performance/correr-campana-local.sh   (requiere mock en :54399 y la app en :3140, ver docs/QA)
set -u
cd "$(dirname "$0")"
K6="/c/Program Files/k6/k6.exe"
R=k6/reports
mkdir -p "$R"
run() {
  n=$1; shift
  echo "[$(date +%H:%M:%S)] >>> $n"
  "$K6" run --quiet --summary-trend-stats="avg,min,med,p(90),p(95),p(99),max" --summary-export="$R/$n.json" -e BASE_URL=http://localhost:3140 "$@" > "$R/$n.log" 2>&1
  echo "[$n] exit=$? (99 = umbral de paro cruzado)"
  PYTHONUTF8=1 python resumir.py "$R/$n.json" "$R/$n.md" | head -2
  curl -s localhost:54399/__stats; echo
}
run local-02-load -e VUS=20 -e DURACION=90s k6/scenarios/02-load.js
run local-03-stress -e STAGES=10,25,50,100,200,400,800 -e PASO=40s k6/scenarios/03-stress.js
run local-04-spike -e BAJA=5 -e PICO=300 k6/scenarios/04-spike.js
run local-07-recovery -e PICO=300 k6/scenarios/07-recovery.js
run local-06-breakpoint -e RATE_MAX=1500 -e DURACION=4m -e MAX_VUS=2000 k6/scenarios/06-breakpoint.js
run local-05-soak -e VUS=20 -e DURACION=8m k6/scenarios/05-soak.js
echo "[$(date +%H:%M:%S)] CAMPAÑA TERMINADA"
