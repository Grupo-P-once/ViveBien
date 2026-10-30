# Fase 3b · Portal de Cliente — AUDIT

- **Fecha:** 22-sep-2026 · **Producción:** V-1.1.84 · **Flags:** `portalCliente`, `portalClienteInterno`, `citasEnLinea` = **OFF**.
- **Alcance:** sólo lectura (código, base de producción, endpoints, capturas de 3a). **No se cambió nada.**
- **Reglas fijas (D-27):** «Me interesan» = interacción comercial real (nunca vistas de página) · alertas sólo dentro del portal · eliminación = solicitud, textos DRAFT · sin CRM · sin funciones de publicador · sin agenda/calendario · sin correos de alertas · Firestore NO · Supabase/Postgres fuente de verdad.
- Sustituye al AUDIT del 19-sep: mismo portal, pero con el sistema ya en V-1.1.84 y con la comprobación de regresiones.

## 0 · Estado comprobado hoy

**Producción (sin sesión):** `/portal`, `/portal/*` y `/api/portal/*` → **404** (flag apagado) · `/api/favoritos`, `/api/busquedas`, `/api/contacto`, `/api/citas` → **401** · `robots.txt` cubre `/portal`, `/citas`, `/vista-previa`, `/dashboard`, `/admin`, `/publicador`, `/mi-cuenta`, `/api` · sitemap con las 7 fichas, todas con nombre público correcto (V-1.1.84).

**Datos (base de producción):**
| Tabla | Filas | Nota |
|---|---|---|
| `usuarios` | 3 | el modelo único «qué busco» ya está (`busca_operacion/zonas/tipos`, `presupuesto_max`) |
| `favoritos` | 0 | |
| `busquedas_guardadas` | 1 | columna `alertas` **sin uso**; no hay marca de «ya las vi» |
| `solicitudes_contacto` | 0 | tiene `cliente_uid` ✔ |
| `citas` | 0 | |
| `leads` | 1 | columnas: `nombre, telefono, email, mensaje, interes, origen…` — **ni `uid` ni `cliente_uid`** |
| `eventos` | 75 | **0 con `uid`** |
| `propiedades` publicadas | 7 | |

→ El portal abrirá casi vacío: cada pantalla necesita su estado vacío honesto.

**Lo que ya está bien y no hay que rehacer:** autorización en servidor (`exigirPortal` en `/api/portal/*`; `exigir('cuenta.propia')` en favoritos y búsquedas), aislamiento por `uid`/`cliente_uid` en **todas** las consultas del resumen, DTOs de propiedad y consulta, `noindex` + robots, y el acceso con Google compartido (V-1.1.83) que ya usa la carcasa del portal.

## 1 · Hallazgos

### H-01 · Nueve de los diez destinos del menú no existen · **P0**
- **Evidencia:** `src/components/portal/BarraLateralPortal.tsx:37-61` lista Inicio, Guardadas, Me interesan, Por revisar, Mis búsquedas, Mis alertas, Mis visitas, Mis consultas, Mi búsqueda, Mi propiedad, Mi perfil. En el repo sólo existen `src/app/portal/page.tsx`, `src/app/api/portal/resumen/route.ts` y `.../acceso/route.ts`.
- **Hoy:** con el flag encendido, nueve enlaces del menú darían 404.
- **Esperado:** cada entrada del menú lleva a una pantalla real (o no está).
- **Dependencia:** es el contenido de 3b-1/2/3.
- **Solución:** construirlas en el orden del plan; ninguna entrada se enseña antes de existir.

### H-02 · No hay forma de encender los flags desde la aplicación · **P0**
- **Evidencia:** `configuracion` sólo se **lee** (`src/lib/config/flags.ts:62`); no hay ruta ni pantalla (`grep` sin resultados en `src/app/api` y `src/app/admin`). El permiso `configuracion.flags` existe pero no lo usa nadie (`src/lib/acceso/permisos.ts:43`). Además la fila de producción **no tiene** las claves `portalClienteInterno` ni `citasEnLinea`: hoy son `{aiContent, superAdmin, marketingHub, portalCliente, metaPublishing, legalAcceptance, publisherPortal, commissionEngine}`.
- **Hoy:** abrir el portal (aunque sea sólo para admins) exige editar la fila a mano en Supabase. Las dos claves que faltan se leen como apagadas (`normalizarFlags` es fail-closed), así que no hay riesgo, pero tampoco se pueden encender desde ningún sitio.
- **Esperado:** el Super Admin enciende y apaga el portal desde el panel, con registro en la bitácora.
- **Dependencia:** bloquea la apertura por etapas (D-27.5), que es el último paso de 3b/3c.
- **Solución:** pantalla mínima de flags para Super Admin (lista, interruptor, `exigir('configuracion.flags')`, auditoría) en 3b-1. Alternativa barata si se prefiere: dejarlo manual y documentar el SQL exacto — pero entonces el encendido no queda auditado.

### H-03 · «Solicitar visita» aparece con `citasEnLinea` apagado y lleva a una pantalla inexistente · **P0**
- **Evidencia:** `src/components/portal/InicioPortal.tsx:248` (`<Link href={rutaDeVisitas('cliente')}?agendar=1>`), sin ninguna comprobación del flag; no hay ningún `citasEnLinea` en los componentes del portal.
- **Hoy:** el Inicio ofrece agendar aunque el sistema de citas esté apagado, y el enlace apunta a `/portal/visitas`, que no existe.
- **Esperado:** el botón sólo existe si `citasEnLinea` está encendido **y** la pantalla existe.
- **Dependencia:** el resumen ya sabe leer flags; sólo hay que pasarlo a la vista.
- **Solución:** 3b-1 — el resumen expone `citasEnLinea` y el Inicio esconde el botón; 3b-2 añade «Mis visitas» en lista.

### H-04 · «Por revisar» sigue en el menú aunque se decidió ocultarlo, y no hay dato para llenarlo · **P0**
- **Evidencia:** `BarraLateralPortal.tsx:45`; D-27.1 («ocultar por ahora»); `eventos`: 75 filas, **0 con `uid`**.
- **Hoy:** una entrada de menú que, de existir, mostraría una lista vacía para siempre.
- **Esperado:** no aparece hasta que exista el dato (registrar qué fichas ve cada cliente con sesión es una decisión aparte, con aviso de privacidad).
- **Dependencia:** D-27.1 ya decidida.
- **Solución:** quitar la entrada en 3b-1 y dejarla anotada como pendiente 25 (Obsidian).

### H-05 · «Me interesan» no tiene modelo: los leads no se pueden atribuir · **P1**
- **Evidencia:** `leads` = `id, propiedad_id, nombre, telefono, email, mensaje, created_at, interes, origen, consentimiento_version, privacy_accepted` — sin `uid`. Lo que sí liga con la cuenta: `solicitudes_contacto.cliente_uid` y `citas.cliente_uid`.
- **Hoy:** no existe la pantalla ni el dato.
- **Esperado:** «Me interesan» = propiedades sobre las que la persona **pidió informes o visita** con su cuenta (D-27.2). Nada de vistas de página, nada de adivinar por correo.
- **Dependencia:** **D-28.1** (¿se cuentan también los leads anónimos que coinciden por correo? recomendado: no).
- **Solución:** 3b-2 — unir `solicitudes_contacto` + `citas` por `propiedad_id` del cliente; sin tabla nueva.

### H-06 · Alertas sin noción de «ya las vi» · **P1**
- **Evidencia:** `busquedas_guardadas` = `id, uid, nombre, filtros, alertas, creado_en`; la columna `alertas` no la lee ni la escribe nadie; el Inicio calcula «nuevas» como «publicadas después de guardar la búsqueda».
- **Hoy:** el contador nunca baja: lo que fue nuevo lo será siempre.
- **Esperado:** al abrir Alertas, lo visto deja de contar; el modelo queda listo para el correo futuro (consentimiento, preferencia, baja) **sin enviar nada** (D-27.3).
- **Dependencia:** **migración 24** (marca de revisión) + **D-28.2** (por búsqueda o global; recomendado: por búsqueda).
- **Solución:** 3b-1 — migración aditiva `revisadas_en` y contador contra esa fecha.

### H-07 · «Guardadas»: la API sólo devuelve identificadores · **P1**
- **Evidencia:** `src/app/api/favoritos/route.ts` (GET devuelve ids; POST alterna) — ya con `exigir('cuenta.propia')` desde 3a.
- **Hoy:** para pintar tarjetas habría que pedir cada propiedad desde el navegador.
- **Esperado:** una API del portal que devuelva **tarjetas** (columnas públicas) y diga qué hacer con las que se pausaron o se vendieron.
- **Dependencia:** DTO de tarjeta ya existe (`lib/portal/tarjeta.ts`).
- **Solución:** 3b-1 — `GET /api/portal/guardadas` con el DTO, y estado «ya no disponible» en la tarjeta.

### H-08 · El Valuador no está en el menú aunque D-06 lo incluye · **P1**
- **Evidencia:** `BarraLateralPortal.tsx:37-61` no lo menciona; `/valuador` existe y es pública.
- **Hoy:** desde el portal no se llega al valuador.
- **Esperado:** una entrada que lleve a `/valuador` (no se toca el cálculo; sus precios por m² siguen en código, pendiente 19).
- **Dependencia:** ninguna.
- **Solución:** 3b-2 — añadir el enlace.

### H-09 · «Para ti» se rompe en tableta (834 px) · **P1**
- **Evidencia:** `InicioPortal.tsx:144` usa `sm:grid-cols-2 lg:grid-cols-3`; la barra lateral se pliega por debajo de **1024 px** (`src/hooks/use-mobile.ts:11`). Capturas de 3a en `docs/fase-3/capturas/`.
- **Hoy:** a 834 px el contenido ocupa todo el ancho pero la rejilla sigue en 2 columnas: la tercera tarjeta queda sola.
- **Esperado:** 3 columnas desde 768 px (D-28.10).
- **Dependencia:** ninguna.
- **Solución:** 3b-1 — `md:grid-cols-3` y capturas nuevas a 834.

### H-10 · Regresión de V-1.1.84: el portal no lee `precio_incluye_iva` · **P1**
- **Evidencia:** `src/lib/portal/tarjeta.ts:35` (lista de columnas sin la nueva) frente a `src/components/PropertyCard.tsx:257-259`, que pinta el distintivo de IVA en el sitio público.
- **Hoy:** el mismo anuncio se vería distinto dentro y fuera del portal.
- **Esperado:** la tarjeta del portal dice lo mismo que la pública.
- **Dependencia:** la columna ya existe y es pública (migración 23).
- **Solución:** 3b-1 — añadirla a `COLUMNAS_PROPIEDAD_PORTAL` y al tipo de la tarjeta (una línea y su prueba).

### H-11 · Solicitud de eliminación de cuenta: no existe nada · **P1**
- **Evidencia:** sin tabla, sin API, sin cola en el admin; sólo el canal ARCO del aviso de privacidad.
- **Hoy:** el cliente no puede pedir que se borre su cuenta desde el portal.
- **Esperado:** **solicitud** (no borrado), acuse en pantalla, cola de revisión en el admin con estados y bitácora, y procedimiento de baja (conservar lo obligatorio, anonimizar el resto). Textos **DRAFT** hasta el abogado (D-19).
- **Dependencia:** **migración 25** + **D-28.5** (aviso al equipo, cancelación por el cliente, borrado en Firebase Auth —que hoy no es posible: se validan tokens con claves públicas, no hay cuenta de servicio—, plazos).
- **Solución:** 3b-3.

### H-12 · «Mi propiedad» manda un lead anónimo sin ligarlo a la cuenta · **P1**
- **Evidencia:** `QuieroPublicar` → `/api/registro-lead` (origen `registro`, interés «Quiere publicar una propiedad»); el lead no guarda `uid`.
- **Hoy:** no da el rol ni publica (correcto), pero no queda ligado a quien lo pidió ni se evitan duplicados.
- **Esperado:** desde el portal, la solicitud va **con la cuenta**, no repite si ya hay una en curso, y sigue sin otorgar permisos.
- **Dependencia:** **D-28.6** (reutilizar el lead hasta la fase 4; recomendado).
- **Solución:** 3b-3.

### H-13 · El resumen lee hasta 1000 propiedades en cada carga · **P2**
- **Evidencia:** `src/app/api/portal/resumen/route.ts:32` (`.eq('estado_pub','publicada').limit(1000)`).
- **Hoy:** con 7 publicadas es irrelevante.
- **Esperado:** filtrar y paginar en la base cuando el catálogo crezca.
- **Dependencia:** ninguna (nota para la fase 5).
- **Solución:** dejar anotado; no se toca en 3b.

### H-14 · No hay patrón de carga y error por pantalla · **P2**
- **Evidencia:** el Inicio usa esqueletos y la carcasa distingue sin sesión / suspendida / no disponible / error; las pantallas nuevas no tienen nada definido.
- **Esperado:** esqueleto → datos | vacío | error con «Reintentar», igual en las nueve.
- **Solución:** 3b-1 define el patrón y las demás lo reutilizan.

### H-15 · Accesibilidad sin comprobación automática · **P2**
- **Evidencia:** no hay `axe` instalado; revisión manual pendiente.
- **Esperado:** un `h1` por pantalla, regiones, etiquetas, foco visible, pastillas con `aria-pressed`, avisos con `aria-live`, contraste.
- **Dependencia:** **D-28.7** (`@axe-core/playwright` como dependencia de desarrollo; recomendado sí).
- **Solución:** 3b-1 si se aprueba; si no, revisión manual documentada.

### H-16 · `/mi-cuenta` duplicará el perfil del cliente — **deuda futura, no se toca en 3b** · **P2**
- **Evidencia:** `src/app/mi-cuenta/page.tsx` (466 líneas) distingue sólo `rol === 'publicador'`: admin y super admin ven el asistente del cliente.
- **Hoy:** es la única pantalla de perfil para los tres papeles.
- **Esperado:** una pantalla por rol en su sitio (tarea **03.08**, V-1.1.89) y `/mi-cuenta` redirigiendo.
- **Dependencia:** **D-30**; va **después** de 3b para no duplicar trabajo.
- **Solución en 3b:** 3b-2 construye `/portal/perfil` y `/portal/mi-busqueda` **sin heredar el asistente por pasos**, reutilizando sólo las reglas (`CAMPOS_EDITABLES`, completitud, foto firmada). Nada de campos de publicador en el portal de cliente.

## 2 · Regresiones de V-1.1.84 — comprobadas
| Cambio | ¿Afecta al portal? |
|---|---|
| Migración 23 (`precio_incluye_iva`) | **Sí**, por omisión → **H-10** |
| Nombre público al publicar por cualquier camino | No: el portal usa `rutaDe()`, que ya prefiere el slug |
| Filtro del sitemap | No (el portal es `noindex` y no entra en el sitemap) |
| Redirecciones de fichas retiradas (`next.config.ts`) | No |
| Alta tolerante + aviso de lo omitido | No (rutas de admin) |
| `destinoDePublicacion()` | No (asistente del publicador) |
| Limpieza de 13 borradores | No (eran borradores dados de baja) |

## 3 · Deuda que debe resolverse **antes** de abrir el portal
1. **H-02** — poder encender el flag de forma auditada (o procedimiento manual documentado y aprobado).
2. **H-01/H-03/H-04** — ningún enlace del menú puede llevar a 404 ni prometer lo que no existe.
3. **H-11** — si el portal ofrece «eliminar mi cuenta», la cola de revisión tiene que existir el mismo día.
4. Verificación visual real con tu sesión en la etapa interna (D-27.5) antes de abrir a clientes.
5. Decisiones abiertas: **D-28.1…D-28.8** y **D-28.10** (D-28.9 ya resuelta en V-1.1.83).

### Estado de los hallazgos tras 3b-1 (V-1.1.85, 22-sep)
✅ **Resueltos:** H-02 (pantalla de flags para Super Admin + claves explícitas), H-03 (ningún llamado a visita con
`citasEnLinea` apagado), H-04 («Por revisar» fuera), H-06 (alertas con `revisadas_en`), H-07 (Guardadas con
tarjetas), H-09 (tableta a 3 columnas), H-10 (IVA en el portal), H-14 (patrón de carga y error), H-15 (axe en la
vista previa; encontró y se arregló un fallo real de las dos barras laterales).
⏳ **Pendientes por entrega:** H-01 parcial (5 de 10 pantallas; el menú ya sólo enseña lo que existe), H-05, H-08
(3b-2), H-11, H-12 (3b-3), H-13 y H-16 (fuera de 3b).
✅ **D-28.8 cerrado:** Firestore no viaja al navegador (0 chunks con `firestore.googleapis.com`; Auth sí, 112 KB).
