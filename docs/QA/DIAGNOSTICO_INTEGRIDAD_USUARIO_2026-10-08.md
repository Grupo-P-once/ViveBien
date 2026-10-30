# Diagnóstico de integridad del dominio del usuario (8-oct-2026)

**Alcance:** Like/Guardados/Interés, búsquedas, alertas, consultas, visitas, citas, notificaciones, perfil y cambio de sesión. **Solo diagnóstico**: sin cambios de código, datos, RLS ni producción (GET y SELECT únicamente). Producción = E-36→E-39 (`dpl_CfwgKgpGRRAniArNXymWBSEWSVXj`). Repo local = ese estado + el residuo de V-1.1.95 (`PropertyCard.tsx`, `propiedades/page-client.tsx`), que no se tocó. Codex: no disponible (cuota hasta 2026-11-06), sin PASS inventado.
Trabajo previo referenciado y NO repetido: D-27.2 (qué es «Me interesan»), D-28.1, `tests/portal-aislamiento.test.ts`, E-35 (fronteras), E-39 (`no-store`), QA-021 / E-35.2 (`property_view`).

## Respuesta corta al problema original
**Like → Guardados → Interés no son una cadena: son tres cosas distintas y el corazón del catálogo no escribe en ninguna de las que el portal lee.**
1. **El corazón del catálogo público (`PropertyCard.tsx`) escribe SOLO en `localStorage` (`vb_favorites`)** desde abril de 2026 (commit `3682f89`). **CONFIRMADO también en el bundle de producción** (el chunk contiene `localStorage.setItem("vb_favorites"…)` y 0 referencias a `/api/favoritos`).
2. **«Mis guardadas» del portal (`/api/portal/guardadas`, `/api/favoritos`) lee la tabla `favoritos`** (clave `uid`+`propiedad_id`). Esa tabla **tiene 0 filas en producción** y hay 0 eventos `property_favorite`. Solo el corazón de las tarjetas DENTRO del portal (`TarjetaPropiedad` + `useGuardadas`) escribe ahí.
3. **«Me interesan» no es un like**: por decisión D-27.2 solo cuenta interacciones comerciales (`solicitudes_contacto` y `citas` de esa cuenta). Dar like no puede aparecer ahí por diseño.
Escritura y lectura usan **tablas distintas** (localStorage vs `favoritos`); la identidad no es el problema (ver «Identidades»).

## Causas raíz (agrupadas)
- **CR-1 · Persistencia por superficie** (ID-01, 04): el mismo concepto «guardar» tiene dos implementaciones (localStorage anónimo en el catálogo; base de datos por `uid` en el portal) sin nada que las una. Corrección única: un solo hook/servicio de favoritos (el de `useGuardadas`) para toda tarjeta, con fallback anónimo explícito y migración de `vb_favorites` al iniciar sesión.
- **CR-2 · Estado del navegador no ligado al usuario** (ID-02, 09): `vb_favorites`, `vb_historial`, `vivebien:sesion`, `vb_registered` y el comparador viven en localStorage sin `uid` y no se limpian al cerrar sesión.
- **CR-3 · Escrituras «consultar y luego insertar» sin restricción de base** (ID-05, 07, 08): toggle, búsquedas y solicitudes dependen de comprobar antes en la aplicación; no hay `unique`/upsert/función atómica (en citas sí: exclusiones y clave de idempotencia).
- **CR-4 · Contador derivado en dos pasos no atómicos** (ID-09): evento + RPC `sumar_vista`, con el error ignorado.

## Hallazgos
| ID | Sev. | Estado | Módulo | Resumen / evidencia |
|---|---|---|---|---|
| ID-01 | **P1** | CONFIRMADO | Like/Guardados | Corazón del catálogo = localStorage; portal lee BD. `favoritos` = 0 filas, `property_favorite` = 0 eventos. Bundle de producción verificado. Archivos: `src/components/PropertyCard.tsx:12-17,414-433`, `src/components/portal/guardadas.ts`, `src/app/api/favoritos/route.ts`, `src/app/api/portal/guardadas/route.ts`. **Protegido V-1.1.95: no se corrige aquí.** |
| ID-02 | P2 | CONFIRMADO (código) / NO VERIFICADO en navegador | Sesiones | `vb_favorites` no es por usuario ni se limpia en `signOut` (`Header.tsx:52`, `dashboard/page.tsx`, `BarraSuperior.tsx`): en un mismo navegador el usuario B vería los corazones de A en el catálogo. Los datos de servidor sí están aislados. |
| ID-03 | P2 | CONFIRMADO | Interés | «Me interesan» excluye likes y visitas a ficha por diseño (D-27.2); la persona espera lo contrario. Brecha de lenguaje/UX y de Centro de Ayuda, no de datos. |
| ID-04 | P2 | CONFIRMADO | Analítica | `admin/resumen` y `admin/analitica` cuentan `favoritos` (BD): los likes del catálogo nunca llegan. `Metricas.tsx:157` lee `property_favorite`, evento permitido por `/api/eventos` pero **sin ningún emisor** → siempre 0. El «interés» por propiedad se subestima. |
| ID-05 | P2 | CONFIRMADO (código) | Favoritos API | POST es un *toggle* (no idempotente): doble clic o dos pestañas → ambas insertan → la segunda recibe `23505` → 500 «No pudimos guardarla» (falso error; la UI revierte). Sin FK: `propiedad_id text` acepta cualquier cadena (sin límite de longitud, existencia ni estado publicada); tope solo por origen (120/10 min). |
| ID-06 | P3 | CONFIRMADO (código) | Portal | `guardadas`, `alertas`, `me-interesan` y `resumen` traen **todas las publicadas con `limit(1000)`** y cruzan en memoria; pasado el millar, guardadas/intereses desaparecen en silencio. Los favoritos de propiedades no publicadas se omiten (`guardadasVista`). |
| ID-07 | P3 | CONFIRMADO (código) | Búsquedas | `POST /api/busquedas`: leer-comparar-insertar sin único; dos pestañas pueden duplicar o pasar de 10. `DELETE` responde `ok` aunque borre 0 filas (patrón E-11). Guardado = recuperado: los 5 filtros (`op,tipo,zona,pmin,pmax`) coinciden en catálogo, API y `aHref`; la regla `coincide` es compartida (PASS). |
| ID-08 | P3 | CONFIRMADO (código) | Consultas | `contacto`: anti-abuso y deduplicación ignoran errores de lectura (`catch` vacío) → fallan abiertos; dedupe sin restricción única → doble envío concurrente crea dos solicitudes. Aislamiento A/B correcto (`cliente_uid` del token). |
| ID-09 | P3 | CONFIRMADO (código/índice) + HIPÓTESIS (causa del desfase) | Visitas | `eventos` + RPC `sumar_vista` en dos pasos, error del RPC ignorado. Vista única = `(sesion, propiedad)` con `sesion` en localStorage que **nunca caduca** y la **elige el cliente**: «vistas» = navegadores únicos de por vida, inflable cambiando la sesión (acotado por el limitador de origen). `registrarEvento` nunca manda token → 0 eventos con `uid`; no existe «historial de fichas vistas» por usuario (`vb_historial` se escribe y **nunca se lee**). Datos hoy: total `vistas` = 50 vs 49 eventos; **VB-2026-00002: 5 vs 4** (HIPÓTESIS: vista anterior a la tabla de eventos). No se tocó nada. |
| ID-10 | P3 | CONFIRMADO | Errores | `/api/eventos` devuelve `error.message` crudo en 500; el RPC de vistas traga el error. Sin cambio de logging (E-38 ya cubre el resto). |
| ID-11 | P3 | CONFIRMADO | Alertas | Alerta = **vista** de `busquedas_guardadas` (misma entidad; «nuevas» = publicadas desde `revisadas_en`). **No existe envío saliente** (nada escribe ni manda alertas; la pantalla lo dice: «No se manda ningún correo»). Sin alertas duplicadas posibles por diseño salvo ID-07. Colisión de nombre: `/api/alertas/resumen` es el cron del parte diario al equipo, no las alertas del cliente. |
| ID-12 | P3 | CONFIRMADO | Notificaciones | No hay tabla de notificaciones del cliente: los avisos de la campana se **derivan** del estado (citas) al leer: una sola fuente de verdad, sin «leídas» persistidas. El panel admin sí guarda `notificaciones_vistas_en`. |
| ID-13 | — | CONFIRMADO | Citas | Bien: exclusión por asesor y cliente en la base, clave de idempotencia única, zona `America/Mexico_City` centralizada, FKs. Apagado por flag (`citasEnLinea=false`, 0 filas): **NO VERIFICADO en ejecución real**. |
| ID-14 | — | CONFIRMADO | Sesión | `PortalShell`: todo cambio de cuenta pasa por `cargando`, desmonta `ProveedorSesion/ProveedorResumen` (sin fugas A→B en React) y usa `vigente()`; `ProveedorResumen` descarta respuestas fuera de orden (`turno`). PASS. |
| ID-15 | — | CONFIRMADO | PUBLICADOR vs CLIENTE | Mismo código: `cuenta.propia` incluye `publicador`; `exigirPortal` solo cambia por flags de apertura. Sin divergencia accidental; `tipo_publicador` no interviene en este dominio. |
| ID-16 | — | CONFIRMADO | RLS | Tablas del dominio con RLS **ON y 0 políticas**: nada se lee/escribe con anon/authenticated; todo pasa por `service_role` tras `exigir()`. «Insertar y no poder leer» no puede ocurrir por RLS; la frontera es la ruta (probada por `portal-aislamiento`). |
| ID-17 | — | CONFIRMADO | Caché | 18 carpetas `private, no-store` + `Vary` (E-39, verificado en producción); portal `force-dynamic`. Lo erróneo de ID-01 no es caché: es el origen de datos. |

## Identidades
Firebase `uid` (text) es la clave en `favoritos.uid`, `busquedas_guardadas.uid`, `solicitudes_contacto.cliente_uid`, `citas.cliente_uid/asesor_uid` (FK a `usuarios.uid`) y `eventos.uid` (siempre null hoy). `propiedad_id` = `propiedades.id` (text; FK solo en `citas`). **Quien crea y quien lee usan el mismo identificador** en favoritos, búsquedas, consultas y citas (PASS); la única ruptura es de **tabla**, no de identidad (ID-01).

## Mapa de fuentes de verdad
| Concepto | Fuente hoy | Fuente correcta |
|---|---|---|
| Guardado/like | localStorage (catálogo) **y** `favoritos` (portal) | `favoritos` (por `uid`) |
| Interés | `solicitudes_contacto` + `citas` | igual (explicar en UI) |
| Búsqueda / alerta | `busquedas_guardadas` | igual |
| Consulta | `solicitudes_contacto` (`leads` = anónimas) | igual |
| Visitas a ficha | `eventos` (anónimo) + contador `propiedades.vistas` | `eventos` (contador derivado) |
| «Mis visitas» (portal) | `citas` | igual |
| Notificación | derivada de `citas` | igual |

## Matriz de pruebas (PASS / FAIL / NV / N/A)
| Módulo | Crear | Leer | Actualizar | Eliminar | Refresh | Logout/Login | Usuario A/B | RLS | Caché |
|---|---|---|---|---|---|---|---|---|---|
| Like (catálogo) | PASS (local) | **FAIL** (no llega a BD) | PASS | PASS | PASS | **FAIL** | **FAIL** | N/A | N/A |
| Guardados (portal) | PASS | PASS | N/A | PASS | NV | PASS | PASS | PASS | PASS |
| Interés | N/A (derivado) | PASS | N/A | N/A | NV | PASS | PASS | PASS | PASS |
| Búsquedas | PASS | PASS | PASS | PASS (ID-07) | NV | PASS | PASS | PASS | PASS |
| Alertas | N/A | PASS | PASS | N/A | NV | PASS | PASS | PASS | PASS |
| Consultas | PASS | PASS | N/A | N/A | NV | PASS | PASS | PASS | PASS |
| Visitas (citas) | NV (flag apagado) | NV | NV | NV | NV | PASS | PASS | PASS | PASS |
| Citas | NV | NV | NV | NV | NV | PASS | PASS | PASS | PASS |
| Notificaciones | N/A | PASS | N/A | N/A | NV | PASS | PASS | PASS | PASS |

«PASS» = por código y pruebas existentes (`portal-aislamiento`, `portal-3b1`, `portal-resumen`, `e35-fronteras`, `sesion.e2e`); **NV** = no ejecutado contra datos reales (no se hizo POST/PUT/DELETE en producción). **No existe ninguna prueba** de que el corazón del catálogo persista, ni e2e A→B de favoritos.

## Matriz maestra de integridad
| Módulo | UI | API | Auth | user | property | BD | RLS | Caché | Persist. | Lectura | Refresh | Logout/Login | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Like catálogo | corazón local | ninguna | ninguna | — | `p.id` | no | N/A | N/A | solo navegador | solo navegador | sí | no aísla | **ROTO (CR-1/2)** |
| Guardados portal | `useGuardadas` | `/api/favoritos` | `exigir` | uid token | `propiedadId` sin validar | `favoritos` | cerrado | no-store | sí | sí | NV | sí | OK (ID-05/06) |
| Interés | tarjetas | `/api/portal/me-interesan` | `exigirPortal` | uid | derivado | solicitudes + citas | cerrado | no-store | derivado | sí | NV | sí | OK (ID-03) |
| Búsquedas | catálogo | `/api/busquedas` | `exigir` | uid | N/A | `busquedas_guardadas` | cerrado | no-store | sí | sí | NV | sí | OK (ID-07) |
| Alertas | portal | `/api/portal/alertas` | `exigirPortal` | uid | derivado | misma tabla | cerrado | no-store | sí | sí | NV | sí | OK (ID-11) |
| Consultas | ficha/contacto | `/api/contacto` | token | uid | `id` validado | `solicitudes_contacto` | cerrado | no-store | sí | sí | NV | sí | OK (ID-08) |
| Visitas ficha | automático | `/api/eventos` | opcional (no se envía) | null | `id` | `eventos` + contador | cerrado | no-store | anónimo | solo admin | NV | N/A | P3 (ID-09) |
| Citas | portal | `/api/citas*` | token | uid | FK | `citas` | cerrado | no-store | sí (apagado) | sí | NV | sí | OK / NV |
| Notificaciones | campana | derivado | `exigirPortal` | uid | citas | derivada | — | no-store | derivada | sí | NV | sí | OK |

## Corrección recomendada (orden; NADA ejecutado)
1. **Decidir producto**: ¿los likes del catálogo son anónimos (localStorage) o de la cuenta? Recomendado: **de la cuenta**, con fallback local si no hay sesión y migración a `favoritos` al iniciar sesión.
2. **Unificar** `PropertyCard` con `useGuardadas` / `/api/favoritos` (requiere tocar **V-1.1.95 → autorización**). Emitir `property_favorite/unfavorite` solo si se quiere esa métrica; si no, retirar el evento y `Metricas.tsx:157`.
3. **Limpiar al cerrar sesión** `vb_favorites`, `vb_historial` y el comparador (CR-2), con su prueba.
4. **Favoritos idempotente**: `PUT/DELETE` con estado deseado + `upsert`, validar existencia, estado publicada y longitud (FK opcional: migración = autorización).
5. Pruebas: componente del corazón (persistencia + A/B), e2e A→B→A de favoritos y búsquedas, concurrencia de `busquedas` y `contacto`, guardia estática «ningún localStorage de datos de usuario sin limpieza».
6. P3: consultas por ids en lugar de `limit(1000)`, `DELETE` con 404 si 0 filas, renombrar `/api/alertas/resumen`, contador de vistas atómico (una RPC) y Centro de Ayuda («Me interesan» ≠ guardados).

## Autorizaciones necesarias (solo las estrictas)
- Tocar `PropertyCard.tsx` / `propiedades/page-client.tsx` (V-1.1.95): corrección de ID-01.
- Migración (FK/único) solo si se decide el paso 4 a nivel de base.
- Un nuevo despliegue para cualquier corrección.

## Riesgos / límites
No se ejecutaron escrituras reales (NV = no verificado en ejecución viva). **Dato nuevo tras la promoción:** `audit_logs` +1 `propiedad.crear` a las 16:33 UTC y `propiedades` 9→10: actividad normal de un usuario autenticado; ni la promoción ni este diagnóstico la causaron (su única interacción con producción fue GET y SELECT, más dos POST sin credenciales a los webhooks, rechazados 401/403 antes de cualquier efecto).
