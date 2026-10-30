# D-75.1 · Cierre controlado de D-75 y candidato local (8-oct-2026)

**Estado: LISTO PARA REVISIÓN (READY FOR REVIEW). Sin commit, push, deploy ni promote. Producción sigue en E-36→E-39.** No se subió nada a Vercel: el «candidato» es un árbol local limpio. Complementa `D75_GUARDADOS_CUENTA.md`.

## Inventario del árbol (solo lectura)
Repo: 135 modificados + 131 nuevos (sucio, sin commit). Comparado con el árbol que corre en producción (`vivebien-deploy-stage-e36-final`, ignorando fin de línea):
- **A · D-75** (6 modificados + 2 nuevos en `src`): `api/favoritos/route.ts`, `api/eventos/route.ts`, `components/Metricas.tsx`, `components/MisFavoritos.tsx`, `components/portal/guardadas.ts`, `components/PropertyCard.tsx` (sólo el corazón) + `src/lib/favoritos/almacen.ts`, `src/hooks/use-favoritos.ts`. Tests: `tests/favoritos-guardados.test.ts`, `tests/favoritos-guardias.test.ts`, `tests-visual/guardados.e2e.ts`, `tests/migracion-35-ayuda-guardados.test.ts`. Ayuda (preparada, NO aplicada): `supabase/35-ayuda-guardados.sql` + `.REVERTIR.sql`. Tooling: `scripts/qa/gate.cjs` (+2 archivos en las críticas).
- **B · residuo V-1.1.95** (no es de D-75; no se tocó): `src/app/globals.css`, `src/app/propiedades/page-client.tsx`, `src/app/propiedades/[id]/page-client.tsx`, `src/components/acceso/Entrar.tsx`, `src/components/portal/PortalShell.tsx` y la parte no-corazón de `PropertyCard.tsx` (`useMemo` de fotos, estado `usaElCarrusel`, precarga de la foto vecina con `fotoOptimizada`, `HUECO` movido dentro del componente, comentarios).
- **C/D/E/F** (todo lo demás del repo): documentación, tooling de QA y trabajo previo ya promovido; sin diferencias de `src` con producción fuera de A y B. `package.json`, `package-lock.json` y `next.config.ts` = producción. Nada «desconocido».

## Separación D-75 / V-1.1.95 — SÍ es limpia
En `PropertyCard.tsx` los hunks de D-75 (imports, borrado de `getFavs/setFavs`, estado `liked`, `alternarGuardada`, `onClick`/`aria-pressed`/`title` del botón) y los de V-1.1.95 **no se solapan**. Se construyó `C:\Users\jemil\vivebien-deploy-stage-d75` = árbol de producción (copia de trabajo E-36) + sólo los archivos A; su `PropertyCard.tsx` = el de producción + los hunks de D-75 (verificado con `diff`). El resto de `src` es idéntico a producción. SHA-256 (16 primeros): `almacen.ts c2236c4a…`, `use-favoritos.ts 1702070b…`, `favoritos/route.ts dd5cfa03…`, `eventos/route.ts e26c5619…`, `Metricas.tsx 89724187…`, `MisFavoritos.tsx a82e223c…`, `guardadas.ts 57f9bada…`, `PropertyCard.tsx f70be2cf…`. (Los tests/e2e finales de `favoritos-*` y `guardados` son idénticos en el repo y en ese árbol.)

## Revisión de las implementaciones antiguas (grep completo de `src`)
| Referencia | Dónde queda | Clasificación |
|---|---|---|
| `vb_favorites` | sólo en `almacen.ts` (`CLAVES_ANTIGUAS`, para BORRARLO) | D-75 |
| `getFavs/setFavs` | ninguna (el `setFavs` de `Bienvenida.tsx` es un `useState` ajeno) | no relacionado |
| `/api/favoritos` | `almacen.ts` (lee/escribe), `MisFavoritos` (lee/quita con `guardado:false`), `Bienvenida` y `MetricasCliente` (sólo lectura), comentarios | D-75 / legítimo |
| `property_favorite/unfavorite` | allowlist de `/api/eventos` y tipo en `lib/eventos.ts`; **sin emisor** | compatibilidad histórica / deuda |
| `favoritos_n` | `propiedad-publica.ts`, `publicacion.ts` (sólo campo reservado que se filtra); nadie lo escribe | columna muerta |
| `localStorage` restante | `vivebien:sesion` (id analítico), `vb_registered` y fichas vistas (momento de registro), comparador, `vb_historial` (lo escribe la ficha, nadie lo lee; se borra al salir), periodo del panel, «visto» de `MisBusquedas` | LEGÍTIMO (preferencias/analítica del navegador); `vb_historial` antiguo inofensivo; ninguno decide qué es «guardada» |
Una guardia (`favoritos-guardias`) impide reintroducir un segundo «guardar».

## Revisión de código
- **`PropertyCard`**: sin `localStorage`; usa `useFavoritos`; id = `p.id` (10/10 ids reales de producción cumplen `^[A-Za-z0-9_.-]{1,120}$`); sin sesión → `/entrar?siguiente=…`; `aria-pressed`; el resto de la tarjeta intacto. Por diseño ignora el clic mientras Firebase decide la sesión (~100 ms).
- **API**: uid del token (`exigir('cuenta.propia')`), id validado, propiedad publicada para guardar, `guardado` booleano, upsert idempotente: `true`×2 = `true`, `false`×2 = `false`, sin falsos 500 (probado, incluidas peticiones simultáneas). Quitar siempre permitido.
- **Almacén/hook**: una petición a la vez por propiedad, descarte por época al cambiar de cuenta, rollback con mensaje; el servidor manda y el almacén es una representación temporal.
- **`MisFavoritos`**: `guardado:false` explícito; si falla, restaura.
- **Métricas**: total desde `favoritos`; no se emite ningún evento.
- **D-27.2 intacto**: «Me interesan» = `solicitudes_contacto` + `citas`.
- **Publicador vs cliente**: mismo hook, ruta y tabla (`cuenta.propia` incluye `publicador`; probado con rol publicador). Sin lógica paralela; ASOCIADO no interviene (no hay capacidad en este dominio).

## Resultados (candidato limpio `vivebien-deploy-stage-d75`)
- **`npm run qa:gate`: `TODO OK`** (enchufado). tsc ✓ · críticas ✓ (15 archivos, 156 pruebas) · seguridad ✓ (8 archivos, 107) · secretos ✓ · lint ✓ sin empeorar · build ✓ · navegador ✓ **111/111, sin fallos ni reintentos** (95 + 16 de `guardados.e2e`) · axe ✓ 24/24 sin empeorar · **visuales ✓ 46 OK + 2 flaky (portada 1440 y ficha-pausada 390; pasan al reintentar; la misma flakiness de fuentes/terceros de D-72, NO resuelta) y 0 fallos** · API ✓.
- Historial honesto: el gate falló tres veces ANTES del `TODO OK`, por causas no del producto: (1) `node_modules` como *junction* rompe Turbopack (infraestructura) → copia real; (2) y (3) defectos de mi `guardados.e2e.ts`: esperaba `load` con latencia de terceros; hacía clic antes de hidratar y antes de que Firebase respondiera; y sembraba `vb_favorites` con `addInitScript`, que lo reescribía en cada navegación (la comprobación de limpieza pasaba por suerte de tiempos en los anchos grandes). Corregidos en el test; el producto no cambió. Con `waitUntil: 'load'` los fallos de `page.goto` eran 60 s agotados por recursos de terceros.
- Repo (con residuo V-1.1.95): `tsc` limpio; lint 63 (base 64); Vitest de favoritos, ayuda 35, portal, analítica y seguridad pasan. El `qa:gate` NO se corrió sobre el repo sucio porque las líneas base visuales (producción) no representan el residuo V-1.1.95.
- **Seguridad:** A no puede leer ni tocar lo de B (uid del token; cuerpo con `uid` ajeno ignorado; `favoritos-guardados` + `e35-fronteras` + `e39-guardias`, incluidas las 18 carpetas privadas `no-store`). Sin cambios de RLS (ON, 0 políticas; sólo `service_role` tras `exigir`).
- **Accesibilidad:** axe sin empeorar. `aria-pressed` presente; el nombre accesible sale de `title` y cambia (`Guardar` / `Quitar de guardadas`): con `aria-pressed` un lector dirá «Quitar de guardadas, pulsado» (redundante). **P3**: dejar el nombre fijo y que sólo cambie el estado.
- **Visual:** misma UI (mismo icono y tamaño; sólo cambian `title`/`aria-pressed`); las 48 capturas pasan. «Mis guardadas» del portal no tiene línea base visual: **NO VERIFICADO**.
- **Cambio de cuenta / refresh / navegación:** A→B→A y respuesta tardía (Vitest); en navegador: guardar→recargar→sigue guardada, quitar→recargar→sigue quitada, A/B/A con cierre de sesión por la barra (4 anchos). «Ir a la ficha y volver» y «guardar en catálogo → aparece en Mis guardadas → quitar allí → desaparece en el catálogo» están **cubiertos por construcción** (mismo almacén y misma tabla; el resumen y `guardadasVista` leen las mismas filas) pero **no hay prueba de navegador** que recorra portal↔catálogo: **es el hueco más relevante**.

## Centro de Ayuda
El artículo «¿Cómo guardo una propiedad?» (producción hoy: «en la ficha o en la tarjeta») es **inexacto**: la ficha no tiene corazón. Se preparó `supabase/35-ayuda-guardados.sql` (+ `.REVERTIR`): cambia SÓLO ese cuerpo (tarjeta del catálogo, sesión, «Mis guardadas», guardadas de la cuenta). Probado en PGlite (aplica, se reaplica, sólo cambia ese artículo, la reversa devuelve el texto exacto de producción). **NO aplicada**; va después del despliegue de D-75. «¿Qué significa “me interesan”?» ya coincide con D-27.2.

## Deuda y riesgos
- `propiedades.favoritos_n`: columna muerta; no se elimina. `property_favorite/unfavorite`: permitidos sin emisor; no se eliminan.
- El residuo V-1.1.95 sigue sin desplegar en el repo; el candidato limpio no lo incluye. Un commit del repo tal cual arrastraría V-1.1.95 en la próxima promoción hecha desde él.
- Flakiness visual de fuentes/terceros: sigue (2 flaky).
- P3 de D-74 (ID-06…ID-10) y nombre accesible del botón.
- **Codex: BLOQUEADO por cuota (reintentado hoy: «try again at Nov 6th, 2026»). No se inventa PASS.**
