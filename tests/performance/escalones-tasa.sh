#!/usr/bin/env bash
# Escalones de tasa de llegada constante contra la app aislada (D-62): para cada nivel registra RPS logrado, p50/p95/p99, errores y
# iteraciones descartadas (señal de saturación). Uso: bash escalones-tasa.sh <etiqueta> "50 100 200 ..." [DURACION]
set -u
. "$(dirname "$0")/verificar-energia.sh" || exit 3
cd "$(dirname "$0")"
ET="$1"; NIVELES="$2"; DUR="${3:-40s}"
K6="/c/Program Files/k6/k6.exe"
OUT=k6/reports/escalones-$ET.tsv
printf 'tasa_objetivo\trps_logrado\tp50_ms\tp95_ms\tp99_ms\terror_pct\tdescartadas\tvus_max\n' > "$OUT"
for r in $NIVELES; do
  "$K6" run --quiet --summary-trend-stats="avg,min,med,p(90),p(95),p(99),max" --summary-export="k6/reports/esc-$ET-$r.json" -e BASE_URL=http://localhost:3140 -e GRUPO=CLIENTE -e TASA=$r -e DURACION=$DUR k6/scenarios/08-memoria.js > /dev/null 2>&1
  python - "$ET" "$r" >> "$OUT" <<'PY'
import json, sys
et, r = sys.argv[1], sys.argv[2]
m = json.load(open('k6/reports/esc-%s-%s.json' % (et, r)))['metrics']
d = m['http_req_duration']; q = m['http_reqs']
f = m['http_req_failed']; dd = m.get('dropped_iterations', {}).get('count', 0)
print('\t'.join(str(x) for x in [r, round(q['rate'], 1), round(d['med']), round(d['p(95)']), round(d['p(99)']), round(100 * f.get('value', f.get('rate', 0)), 1), dd, m['vus_max']['value']]))
PY
  tail -1 "$OUT"
  sleep 5
done
echo "ESCALONES TERMINADOS"
