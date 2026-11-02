# tests/performance — pruebas de carga, memoria, seguridad básica y navegador (D-62)

**Regla:** nada de esto se apunta a producción salvo el *smoke* de 5 usuarios (`01-smoke`) y los barridos de solo lectura. La carga, el caos y las sondas de escritura se hacen contra una **copia aislada** del código de producción y un **Supabase de réplica** (`mock-supabase.mjs`) que reenvía una sola vez cada lectura pública, sirve el resto desde memoria y **descarta toda escritura** (cuenta cuántas intentó).

## Requisitos
k6 (`winget install GrafanaLabs.k6`), Node 24, Python 3 y Chromium de Playwright (del staging).

## Montar el entorno aislado
1. Copiar el staging aprobado (`vivebien-deploy-stage-e33`) a una carpeta nueva **sin** `node_modules`, `.next`, `.vercel`, y `npm ci`.
2. Réplica: `REAL_SUPABASE_URL=… REAL_SUPABASE_ANON_KEY=… [MOCK_FLAGS_JSON='{"portalCliente":true,…}'] node tests/performance/mock-supabase.mjs` (puerto 54399; `/__control?modo=normal|lento&ms=N|error500|caido|colgado`, `/__stats`).
3. Compilar y servir con `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399`, la clave **anónima** real, `SUPABASE_SERVICE_ROLE_KEY=dummy-local-key` (la réplica solo le deja leer los flags): `npx next build && npx next start -p 3140`.

## Escenarios k6 (`k6/scenarios`)
`01-smoke` · `02-load` · `03-stress` · `04-spike` · `05-soak` · `06-breakpoint` · `07-recovery` (imprime la curva `SONDA|s|ms`) · `08-memoria` (tasa constante por grupo de endpoints). Se ejecutan en este orden; **las cotas `PARO_*` son de seguridad (abortan la prueba), no criterios de calidad**.
```
k6 run --summary-export=k6/reports/x.json -e BASE_URL=http://localhost:3140 k6/scenarios/02-load.js
python tests/performance/resumir.py k6/reports/x.json
bash tests/performance/escalones-tasa.sh etiqueta "25 50 100 200 300 450" 40s
bash tests/performance/atribuir-memoria.sh "catalogo ficha salud …" 200 60s
bash tests/performance/comparar-codigo-actual-vs-parche.sh <carpeta-de-logs>   # código actual vs createClient sin timers
```
## Diagnóstico de memoria
`node --require tests/performance/heap-probe.cjs node_modules/next/dist/bin/next start -p 3140` (**no** vía `NODE_OPTIONS`) y `curl localhost:9501/gc` (heap vivo tras GC forzado) o `/snap?f=ruta`; comparar snapshots con `node --max-old-space-size=8000 comparar-snapshots.cjs a b`. **Primero distinguir fuga de GC perezoso**: el RSS solo no prueba nada.

## Otras sondas
`sonda-seguridad.py` y `sonda-limites.py` (solo `localhost`, rehúsan otro host), `barrido-paginas.py` (3 GET por página), `navegador-web-vitals.mjs` y `lcp-causa.mjs` (Playwright, módulos ES; solo lectura), `muestrear-memoria.ps1`, `generar-matriz-qa.py` (regenera `docs/QA/MATRIZ_MAESTRA.*`). Informes y evidencia: `k6/reports/`.
