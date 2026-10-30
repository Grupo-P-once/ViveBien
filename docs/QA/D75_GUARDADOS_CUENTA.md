# D-75 · «Guardar» es de la cuenta (corrección LOCAL de D-74) — 8-oct-2026

**Estado: PREPARADO Y PROBADO EN LOCAL. NO desplegado, NO promovido, sin commit ni push.** Producción sigue en E-36→E-39 (`dpl_CfwgKgpGRRAniArNXymWBSEWSVXj`). Sin migraciones, sin cambios de datos, RLS ni variables.
Autorizado por el dueño: preparar y probar localmente la corrección de D-74 (incluidos los archivos de V-1.1.95 que D-74 señala).

## Causa corregida
El corazón del catálogo (`PropertyCard.tsx`) escribía sólo en `localStorage` (`vb_favorites`); «Mis guardadas» leía la tabla `favoritos` (0 filas). Dos verdades que nunca se encontraban (CR-1), un estado del navegador que no era de nadie (CR-2) y una API que alternaba en vez de fijar estado (ID-05).

## Arquitectura anterior → nueva
| | Antes | Ahora |
|---|---|---|
| Catálogo | corazón → `localStorage` | corazón → `useFavoritos()` → `POST /api/favoritos` → tabla `favoritos` (uid del token) |
| Sin sesión | guardaba «en el aire» | manda a `/entrar?siguiente=…` (igual que contactar) |
| Portal | hook propio (`cambios` locales + `pedir`) | **el mismo** `useFavoritos()` (un solo almacén por pestaña) |
| API | alternar según la base; `insert` (carrera → 500) | **estado deseado** `{propiedadId, guardado}`; `upsert` que ignora duplicados; valida id (`^[A-Za-z0-9_.-]{1,120}$`) y que la propiedad esté publicada (404 si no; quitar siempre permitido) |
| Doble clic / 2 pestañas | peticiones en desorden / falso 500 | una petición a la vez por propiedad; gana lo último que se quiso; servidor idempotente |
| Cambio de cuenta | `vb_favorites` compartido | el almacén se descarta entero al cambiar de uid; respuestas tardías de la cuenta anterior se ignoran; al salir se borran `vb_favorites` y `vb_historial` |
| Métrica «guardadas» | evento `property_favorite` (nunca emitido → 0) | total de la tabla `favoritos` (`/api/eventos` GET → `favoritos`) |

## Archivos
- **Nuevos:** `src/lib/favoritos/almacen.ts` (almacén puro), `src/hooks/use-favoritos.ts`, `tests/favoritos-guardados.test.ts` (23), `tests/favoritos-guardias.test.ts` (8), `tests-visual/guardados.e2e.ts` (4 × 4 anchos).
- **Modificados:** `src/app/api/favoritos/route.ts` (POST), `src/components/PropertyCard.tsx` (V-1.1.95: sólo el corazón; −`getFavs/setFavs`, +hook, `aria-pressed`), `src/components/portal/guardadas.ts` (delgado sobre el hook), `src/components/MisFavoritos.tsx` (`guardado:false`), `src/app/api/eventos/route.ts` (+`favoritos` total), `src/components/Metricas.tsx` (lee ese total).
- **No tocados:** `propiedades/page-client.tsx`, ficha `propiedades/[id]`, login, roles, RLS, migraciones.

## Decisiones
- **Métricas = opción B** (la tabla `favoritos` es la fuente; no se emite `property_favorite`). Motivo: `admin/analitica` y `admin/resumen` ya cuentan la tabla; emitir un evento sería una segunda fuente (CR-4) que además podría discrepar. Los nombres de evento siguen permitidos pero reservados (sin emisor). `propiedades.favoritos_n` es una columna muerta (nunca escrita): no se usa.
- **Semántica intacta (D-27.2):** guardar ≠ like ≠ interés ≠ consulta ≠ visita. «Me interesan» sigue siendo sólo contactos y citas; qué la alimenta: `solicitudes_contacto.cliente_uid` y `citas.cliente_uid` (ningún evento de navegación).
- **Sin migración de lo antiguo:** los `vb_favorites` locales NUNCA llegaron a la base, no se sabe de quién son y subirlos a la cuenta que entre después contaminaría. Se descartan (se borra la clave).
- **Guardar exige cuenta** (también en el Centro de Ayuda ya decía «hace falta sesión»: ahora el producto coincide con el artículo). **Pendiente de redacción:** el artículo «¿Cómo guardo una propiedad?» dice «en la ficha o en la tarjeta», pero la ficha no tiene corazón; corregirlo requiere una migración de ayuda (preparada, no aplicada) → no se hizo.
- Tras iniciar sesión se vuelve a la página de origen, pero **no se recuerda qué corazón se pulsó**: hay que pulsarlo otra vez (P3, documentado).

## Pruebas (todas locales, sin datos reales)
| Requisito | Dónde |
|---|---|
| guardar / quitar / repetir (idempotencia) | `favoritos-guardados` (ruta real + base falsa) |
| refresh (almacén nuevo, misma cuenta) | `favoritos-guardados` + e2e |
| usuario A/B, logout/login, respuesta tardía de A | `favoritos-guardados` + e2e |
| CLIENTE y PUBLICADOR (y ADMIN) misma tabla | `favoritos-guardados` |
| doble clic, 3 clics, dos peticiones simultáneas, dos pestañas | `favoritos-guardados` (máx. 1 petición en vuelo por propiedad) + e2e dblclick |
| propiedad inexistente / no publicada / id inválido | `favoritos-guardados` |
| error de la API / de la base (RLS o caída) | `favoritos-guardados` (500, rollback del corazón, sin estado a medias) |
| RLS | tablas con RLS ON y 0 políticas (D-74 ID-16): sólo `service_role` tras `exigir`; la ruta es la frontera. La prueba comprueba que el uid sale del token (B no puede tocar lo de A mandando `uid`) |
| «Mis guardadas» y contador | `construirResumenPortal` / `guardadasVista` con las filas escritas |
| estado inicial / tras guardar / tras quitar del botón | almacén (`instantanea`) + e2e (corazones llenos 0 → 1 → 0, `aria-pressed`) |
| nada en `localStorage` | e2e + guardia estática |
| no reintroducir un segundo «guardar» | `favoritos-guardias` |
Se verificó con mutaciones: con la ruta antigua fallan 17 de 23; sin la serialización por propiedad falla el test de doble clic.

## Resultados
- `tsc` limpio · `lint-comparar`: **63 errores (base 64), sin empeorar**.
- Vitest relevantes (favoritos ×2, vista-previa, portal-aislamiento/3b1/resumen, analítica, admin-panel, e35, e37, e38, e39-guardias, límites): **13 archivos, 224 pruebas pasan**.
- Build de la rama (réplica) ✓. e2e Playwright en 390/768/1024/1440: **`sesion.e2e` (cambio de cuenta CLIENTE↔ADMIN) pasa**; `guardados.e2e` 16/16 (3 con reintento: `page.goto('/propiedades')` agotó 60 s esperando `load` por recursos de terceros — la flakiness ya documentada en D-72, no una aserción fallida).
- No ejecutado: el `qa:gate` completo (visuales/axe) — la línea base visual de `PropertyCard` está confundida por el residuo V-1.1.95 que ya difería de producción; antes/después del corazón: mismo icono y tamaño, sólo cambia `title`/`aria-pressed`.

## Riesgos
- Quien tenía corazones «locales» los pierde (nunca estuvieron en ningún sitio útil).
- Primer clic sin sesión redirige a `/entrar` (cambio visible de comportamiento: avisar en la nota de versión).
- `PropertyCard.tsx` y `propiedades/page-client.tsx` siguen con el residuo V-1.1.95 no desplegado: promover esta corrección **desplegaría también ese residuo** salvo que se separe el corazón (pedirá decisión).
- Un clic en el corazón mientras Firebase aún decide la sesión se ignora (evita falsos «ve a entrar»).

## Otros usos de `localStorage` (inventario, sin cambios)
`vivebien:sesion` (id de sesión de analítica; no caduca; D-74 ID-09), `vb_registered`/fichas vistas (momento de registro; por navegador), comparador (`lib/comparador.ts`, ids de propiedades), `vb_historial` (se escribe en la ficha y **nunca se lee**; ahora se borra al cerrar sesión), periodo del panel admin, «vista» de `MisBusquedas` (por búsqueda, por navegador), borrador del wizard (descartado a propósito). Ninguno guarda datos que deban ser de la cuenta salvo `MisBusquedas` (marca de «visto», P3) y `vb_registered`.
