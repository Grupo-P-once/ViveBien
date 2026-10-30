# Carga en STAGING — escenarios PREPARADOS (no ejecutados)

> **No correr sin la autorización específica del dueño** para esta prueba, este host y esta fecha.

| | A · 100 visitas por hora | B · 100 usuarios concurrentes |
|---|---|---|
| Archivo | `A-100-visitas-por-hora.js` | `B-100-usuarios-concurrentes.js` |
| Modelo | llegadas a ritmo fijo (1 visita cada 36 s), pausas de lectura 5–60 s | hasta 100 usuarios activos a la vez, pausas de 1–3 s |
| Duración | 60 min (ensayo: `-e DURACION=10m`) | ~21 min (subida por escalones 5→10→25→50→75→100, meseta y bajada) |
| Qué responde | ¿aguanta el tráfico real esperado sin degradarse? | ¿dónde empieza a degradarse y se recupera? |
| Equivalencia | **NO** equivale a 100 solicitudes/h: se mide `solicitudes_por_visita` | **NO** equivale al A: la presión por segundo es muy superior |

## Antes de correr (todas, o no se corre)
1. **Autorización específica** del dueño por escrito para el host de staging.
2. **Identidad del destino comprobada**: deployment, proyecto y base de staging (ver nota de Obsidian «RONDA 5»). El guion **rechaza** `vivebienn.com` y cualquier host que no sea `localhost` o `vive-bien-staging…vercel.app`.
3. **Cuotas y planes de los proveedores**: Vercel (concurrencia de funciones, ancho de banda, límite de Preview), Supabase staging (conexiones, plan), Cloudinary si carga imágenes. Anotar los límites ANTES; el escenario B no debe acercarse a ellos.
4. **Acceso protegido (SSO de Vercel)**: el dueño define `VERCEL_BYPASS` en su propia terminal (`export VERCEL_BYPASS=…`, sin escribirlo en notas, chats ni registros). El guion solo lo envía como cabecera y no lo imprime.
5. **Datos**: solo lecturas. Sin escrituras, sin `/api/valuador`, `/api/eventos`, `/api/favoritos`, `/api/contacto`… (límites por IP: una sola fuente los dispararía y ensuciaría la medición).
6. Ensayo corto primero: `-e DURACION=5m` (A) o `-e VUS_MAX=10` (B).

## Límites de parada (la prueba se aborta sola)
`http_req_failed > 5 %` · `p(95) > 5 s` (tras 1 min de gracia) · más de 20 respuestas `429`. Ajustables con `PARO_ERRORES`, `PARO_P95_MS`, `PARO_429`; **el tope de 100 VUs del escenario B no es configurable al alza.**

## Qué reportar (siempre con su alcance)
p50/p95/p99 y máximo **por endpoint** (etiquetas `home`, `listado`, `catalogo`, `ficha`…), tasa de error, `solicitudes_por_visita`, solicitudes/s, escalón donde se cruzó cada umbral y comportamiento en la bajada. Si hay 429, dónde nacen (app o proveedor).

## Qué NO demuestra
- **No es capacidad de producción** ni de Vercel/Supabase/Firebase/Cloudinary: mide UN preview, UNA fuente de red, solo lecturas, con la caché y el plan de ese momento.
- **Localhost no sirve** para capacidad de proveedores (mide un solo proceso en esta máquina).
- No cubre escrituras (contacto, guardar, alertas), autenticación ni el cron de avisos.
