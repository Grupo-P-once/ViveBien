#!/usr/bin/env bash
# `npm run qa:performance` — regresión de rendimiento (k6) del árbol ACTUAL contra la línea base de E-34 (E-39).
# Separado de `qa:gate` a propósito: tarda ~8 min, exige el equipo ENCHUFADO y CPU libre, y mide con una réplica local (nunca producción).
#   escalones 100 / 200 / 300 / 450 req/s · 40 s cada uno · un servidor `next start` nuevo y SOLO UNA corrida a la vez.
# Guarda el informe en docs/QA/performance/ y sale con código ≠ 0 si hay regresión. NO declara 450 req/s como capacidad garantizada.
set -u
cd "$(dirname "$0")"
. ./verificar-energia.sh || exit 3           # se niega a medir en batería (una corrida así no es comparable)
RAIZ="$(cd ../.. && pwd)"
ETIQUETA="${1:-actual}"
SP="$(mktemp -d)"
echo "qa:performance · etiqueta=$ETIQUETA · árbol=$RAIZ/src · $(date -Iseconds)"
bash ab-capacidad.sh "$ETIQUETA" "$RAIZ/src" "$SP" "100 200 300 450" 40s 2>&1 | tee "$SP/cap.out"
[ "${PIPESTATUS[0]}" = "0" ] || { echo "la corrida de k6 falló o se abortó"; exit 4; }
TSV="k6/reports/escalones-cap-$ETIQUETA.tsv"
RSS="$(grep -ohE '[0-9][0-9,]* MB privada' "$SP/cap.out" | head -1 | tr -dc '0-9')"
node ../../scripts/qa/comparar-rendimiento.cjs "$TSV" ${RSS:+--rss=$RSS} --etiqueta="$ETIQUETA"
