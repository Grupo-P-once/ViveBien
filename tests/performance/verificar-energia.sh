#!/usr/bin/env bash
# Barrera de QA (D-62 / R-00): una prueba de capacidad hecha con el portátil en BATERÍA no es comparable con otra hecha enchufado
# (se midió el mismo código a ~100 req/s con p95 de 17 ms enchufado y de 279 ms en batería). Los scripts de carga lo `source`an.
# Para aceptar el riesgo a propósito: PERF_ACEPTAR_BATERIA=1 (el resultado debe etiquetarse «en batería»).
estado="$(powershell -NoProfile -Command "(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1).BatteryStatus" 2>/dev/null | tr -d '\r\n ')"
if [ "$estado" = "1" ] && [ -z "${PERF_ACEPTAR_BATERIA:-}" ]; then
  echo "ABORTA: el equipo está en BATERÍA; los números de capacidad no serían comparables. Enchúfalo (o exporta PERF_ACEPTAR_BATERIA=1 y etiqueta el resultado)." >&2
  exit 3
fi
