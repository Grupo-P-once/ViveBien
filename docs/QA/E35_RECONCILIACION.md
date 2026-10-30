# E-35 — Reconciliación del repo con producción (sin commit, sin push)

> **ESTADO FINAL DE QA-021 (supera cualquier «pendiente» de este documento):** **CLEANED**. Las 25 filas `property_view` (ids 188–212) se eliminaron el 8-oct-2026 con autorización explícita (D-66) y el contador `propiedades.vistas` se corrigió 27 → 2 (E-35.2, D-67). Eventos legítimos restantes: 179 y 180. Las menciones de «pendiente de autorización», «listo para corrección» o «no ejecutado» son el estado histórico al momento de escribirlas. Detalle: `docs/QA/E35_SEGURIDAD_Y_FRONTERAS.md`.

**Hallazgo clave:** para los 17 archivos que toca E-35, el árbol de trabajo del repo era **idéntico a producción (E-34)** (comparación con saltos de línea normalizados). Las diferencias que `git diff` mostraba contra `HEAD f4834e5` son **código ya desplegado** (E-33 Property Core + E-34) que nunca se confirmó en git, **no** V-1.1.95. Por eso el hunk E-35 era la única diferencia posible en esos archivos y se pudo aplicar sin riesgo de mezclar nada ajeno.
**Método (solo lectura primero):** `reconciliar_analisis.py` comparó, por archivo, producción (staging E-34 == payload real) · repo (árbol de trabajo) · `HEAD` · staging E-35. `reconciliar_aplicar.py` escribió la versión E-35 **solo** si el repo era igual a producción en ese archivo; si no, lo habría omitido (ninguno se omitió).

| archivo | producción vs repo | HEAD | staging E-35 | origen | acción |
|---|---|---|---|---|---|
| `docs/QA/QA-021-correccion.sql` | no existe | no existe en HEAD | E-35 (Δ 0 líneas vs producción) | E-35 (solo pruebas/QA, no se despliega) | ya igual; sin cambio |
| `docs/QA/QA-021-filas.csv` | no existe | no existe en HEAD | E-35 (Δ 0 líneas vs producción) | E-35 (solo pruebas/QA, no se despliega) | ya igual; sin cambio |
| `docs/QA/QA-021-rollback.sql` | no existe | no existe en HEAD | E-35 (Δ 0 líneas vs producción) | E-35 (solo pruebas/QA, no se despliega) | ya igual; sin cambio |
| `next.config.ts` | igual al repo | DETRÁS de producción (HEAD ≠ producción) | E-35 (Δ 20 líneas vs producción) | E-35 | hunk E-35 aplicado, saltos de línea conservados |
| `src/app/api/admin/propiedades/route.ts` | igual al repo | DETRÁS de producción (HEAD ≠ producción) | E-35 (Δ 44 líneas vs producción) | E-35 | hunk E-35 aplicado, saltos de línea conservados |
| `src/app/api/admin/telegram/diagnostico/route.ts` | no existe | no existe en HEAD | E-35 (Δ 0 líneas vs producción) | E-35 | ya igual; sin cambio |
| `src/app/api/ayuda/feedback/route.ts` | igual al repo | DETRÁS de producción (HEAD ≠ producción) | E-35 (Δ 67 líneas vs producción) | E-35 | hunk E-35 aplicado, saltos de línea conservados |
| `src/app/api/telegram/webhook/route.ts` | igual al repo | DETRÁS de producción (HEAD ≠ producción) | E-35 (Δ 13 líneas vs producción) | E-35 | hunk E-35 aplicado, saltos de línea conservados |
| `src/app/dashboard/page.tsx` | igual al repo | DETRÁS de producción (HEAD ≠ producción) | E-35 (Δ 3 líneas vs producción) | E-35 | hunk E-35 aplicado, saltos de línea conservados |
| `src/components/MetricasCliente.tsx` | igual al repo | = producción | E-35 (Δ 5 líneas vs producción) | E-35 | hunk E-35 aplicado, saltos de línea conservados |
| `src/components/MisFavoritos.tsx` | igual al repo | = producción | E-35 (Δ 5 líneas vs producción) | E-35 | hunk E-35 aplicado, saltos de línea conservados |
| `src/lib/limites.ts` | igual al repo | DETRÁS de producción (HEAD ≠ producción) | E-35 (Δ 2 líneas vs producción) | E-35 | hunk E-35 aplicado, saltos de línea conservados |
| `tests/e35-fronteras.test.ts` | no existe | no existe en HEAD | E-35 (Δ 0 líneas vs producción) | E-35 (solo pruebas/QA, no se despliega) | hunk E-35 aplicado, saltos de línea conservados |
| `tests/limites.test.ts` | igual al repo | no existe en HEAD | E-35 (Δ 7 líneas vs producción) | E-35 (solo pruebas/QA, no se despliega) | hunk E-35 aplicado, saltos de línea conservados |
| `tests/qa021-sql.test.ts` | no existe | no existe en HEAD | E-35 (Δ 0 líneas vs producción) | E-35 (solo pruebas/QA, no se despliega) | ya igual; sin cambio |
| `tests/supabase-timeouts.test.ts` | igual al repo | no existe en HEAD | E-35 (Δ 3 líneas vs producción) | E-35 (solo pruebas/QA, no se despliega) | hunk E-35 aplicado, saltos de línea conservados |
| `tests/visibilidad-publica.test.ts` | igual al repo | no existe en HEAD | E-35 (Δ 8 líneas vs producción) | E-35 (solo pruebas/QA, no se despliega) | hunk E-35 aplicado, saltos de línea conservados |

## Qué NO se tocó (V-1.1.95 y resto)
Comparación final `src/` del repo vs producción E-34: distintos 13 · solo en repo 1 · solo en producción 0.
- **E-35 (esperado, aún no desplegado):** 8 archivos modificados + `app/api/admin/telegram/diagnostico/route.ts`.
- **Residuo V-1.1.95, intacto (6 archivos):** `app/globals.css`, `components/portal/PortalShell.tsx`, y las versiones completas de los 4 componentes que producción tiene «saneados»: `components/PropertyCard.tsx`, `app/propiedades/page-client.tsx`, `app/propiedades/[id]/page-client.tsx`, `components/acceso/Entrar.tsx`.
- Archivos del repo modificados durante esta reconciliación (verificado por fecha): exactamente los 12 que el script aplicó; ningún otro.
- Las docenas de archivos restantes que difieren de `HEAD` y **no** de producción son código desplegado sin confirmar en git (E-33/E-34): siguen sin commit.

## Estado de validación del repo reconciliado
`tsc --noEmit` limpio · Vitest completo **2117 pasan, 0 fallan**, 6 omitidas (opt-in) · 7 suites afectadas (84 pruebas) verdes.

## Pendiente de tu decisión (no se hizo)
1. **Commit.** `HEAD` está detrás de producción por varias fases (E-33, E-34, E-35). Se propone confirmar el árbol actual en commits separados: (a) línea base E-33/E-34/E-35 = exactamente los archivos que coinciden con producción + E-35, (b) V-1.1.95 aparte. No se ha hecho ningún commit ni push.
2. Los 6 archivos de residuo V-1.1.95 deben quedar fuera del commit (a).
3. No se despliega desde el repo hasta que esto se resuelva; el despliegue sigue saliendo de los staging verificados por manifiesto.
