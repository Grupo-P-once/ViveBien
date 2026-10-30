# Fase 3a · Portal de Cliente — PLAN (cimientos y bloqueantes)

- **Estado:** ✅ APROBADO (19-sep) e IMPLEMENTADO — V-1.1.82. Resultado al final.
- **Objetivo:** dejar resueltos los bloqueantes P3-01…P3-03 y P3-05…P3-07 y los cimientos de la apertura por etapas, **sin abrir el portal a nadie**. Las 9 páginas (P3-04) y la solicitud de eliminación son la fase 3b; redirecciones y apertura, la 3c.
- **Flags al terminar 3a:** `portalCliente = false`, `portalClienteInterno = false` (nuevo), `citasEnLinea = false` (nuevo). `/portal` sigue dando 404 a todos.
- **Versión:** un despliegue, V-1.1.82. Una migración (22), destructiva sólo de esquema, con el checklist completo.

## Micro-auditoría previa (19-sep)
- «Qué estoy buscando»: `busca_zona`/`busca_tipo` (una) se leen o escriben en 6 sitios (`usuarios/me`, `/mi-cuenta`, `MetricasCliente`, `lib/perfil`, `lib/portal/resumen`, `api/portal/resumen`). **Datos en producción: 0 filas con valor en las columnas viejas ni en las nuevas** → unificar no pierde nada.
- Enlaces de citas: clientes → `/portal/visitas` (no existe); equipo → `/admin/calendario` (**tampoco existe**). Ninguna pantalla crea citas hoy; la API `POST /api/citas` sí existe.

## 3a.1 · Apertura por etapas (decisión 5)
- Flag nuevo `portalClienteInterno`. Regla única, pura y probada: `portalAbiertoPara(flags, perfil)`:
  - `portalCliente` encendido → cualquier cuenta;
  - sólo `portalClienteInterno` → sólo quien tiene `panel.admin` (admin / super admin);
  - ninguno → nadie.
- **Servidor (lo que protege):** toda `/api/portal/*` pasa por `exigirPortal(req)` = `exigir('cuenta.propia')` + `portalAbiertoPara`; si no, **404** (no revela que existe).
- **Página:** el layout deja pasar si hay alguno de los dos flags; `PortalShell` muestra «no disponible» si la API responde 404 (cliente durante la etapa interna). La sesión de Firebase vive en el navegador, por eso el filtro por persona va en la API, no en el layout.
- En 3a **no se enciende nada**.

## 3a.2 · P3-01 · Ningún correo puede apuntar a una página que no existe
- Flag nuevo `citasEnLinea` (apagado): mientras esté apagado, `POST /api/citas` responde 409 → **no se puede crear ninguna cita, así que no sale ningún correo**. Hoy ninguna pantalla agenda: no se pierde nada.
- Un solo lugar decide los enlaces: `rutaDeVisitas(papel)` en `lib/citas/enlaces.ts`, usado por correos (`enviar.ts`), `verToken` (`servicio.ts`), `AccionCita` y el resumen: cliente → `/portal/visitas`; equipo → `/admin` (hasta que exista el calendario, fase 8).
- Prueba: toda ruta que produce `rutaDeVisitas` debe existir en `src/app` para poder encender `citasEnLinea`; y con el flag apagado, crear cita → 409.

## 3a.3 · P3-02 · DTO de cliente en `GET /api/contacto`
- `lib/contacto/dto.ts` → `aConsultaCliente(fila)`: `{ id, propiedadId, propiedadTitulo, tipo, visitaPreferida, mensaje, creadoEn, estado: 'enviada' }`. Nada más.
- La ruta pide **columnas explícitas** (fuera `select('*')`): cliente → las del DTO; equipo (`leads.ver_todos`) → lista explícita de administración.
- Pruebas: el DTO no contiene `owner_id` ni `whatsapp_*` ni `consentimiento_*` internos; ninguna consulta de la ruta usa `'*'`.

## 3a.4 · P3-03 · Suspendidos no escriben
- `/api/favoritos` y `/api/busquedas` (GET/POST/DELETE) pasan a `exigir(req, 'cuenta.propia')`: sesión + **estado activo** + permiso + bitácora de intentos. Se conserva el tope por origen (`frenar`).
- Pruebas: estructurales (todos los manejadores usan `exigir`) + la regla de suspensión de `autorizar` con un perfil suspendido.

## 3a.5 · P3-05 · Pruebas del Inicio y estados vacíos
- `construirResumenPortal`: contadores; «Para ti» por preferencias vs. recientes; `nuevasCoincidencias` sólo publicadas **después** de guardar la búsqueda y disponibles; consultas; avisos de citas; búsquedas con totales.
- `aTarjeta`: sólo columnas públicas (sin `owner_id`, `whatsapp`, `telefono`).
- Cuenta sin nada (el caso real de hoy): todos los contadores en 0 y las listas vacías, sin inventar.

## 3a.6 · P3-06 · `robots.txt`
- `disallow` suma `/portal` y `/citas` (se conservan los `noindex`). Prueba: ninguna ruta pública (`/`, `/propiedades`, fichas, `/valuador`, `/contacto`, `/nosotros`, `/terminos`, `/privacidad`) queda bloqueada.

## 3a.7 · P3-07 · Un solo modelo de «Qué estoy buscando»
- Modelo único en `lib/cliente/busqueda.ts`: `{ operacion: 'venta'|'renta'|'ambas'|null, zonas: string[], tipos: string[], presupuestoMax: number|null }` sobre `busca_operacion`, `busca_zonas`, `busca_tipos`, `presupuesto_max`; normalización (máx. 8, sin repetidos) y validación en un solo sitio.
- Fuera `busca_zona` y `busca_tipo` de los 6 lugares: API de perfil, `/mi-cuenta` (pasa a elegir **varias** zonas y tipos — único cambio visible, en un área privada), `MetricasCliente`, completitud del perfil, resumen del portal y su API.
- **Migración 22** (después de desplegar el código que ya no las usa): respaldo (hoy 0 valores, medido) → ensayo PGlite y transacción revertida en producción → verificar que ninguna vista/función las use → `drop column busca_zona, busca_tipo` → verificar. Reversión: volver a crear las columnas (nulas).

## 3a.8 · Vista previa local con datos controlados (decisión 5)
- Las pantallas del portal se separan en **componentes de presentación** (reciben datos por props) y contenedores (piden a la API).
- Ruta sólo de desarrollo `/vista-previa/portal/[pantalla]?caso=lleno|vacio|suspendido` que pinta esos componentes con **datos de prueba** (`tests/fixtures/portal.ts`): sin Firebase, sin base, sin flags. En producción responde 404 (y queda en `robots.txt`).
- `scripts/capturas-portal.mjs` (Playwright): capturas a 1440×900 (escritorio), 834×1112 (tableta) y 390×844 (móvil) en `docs/fase-3/capturas/`.
- En 3a: el arnés + el Inicio (ya existe). Las demás pantallas se suman en 3b.

## Fuera de 3a (para no mezclar)
- 3b: las 9 rutas (Guardadas, Me interesan, Mis búsquedas, Alertas, Mis consultas, Mis visitas, Valuador, Mi perfil, Configuración) + solicitud de eliminación (con su migración y textos en DRAFT) + «Mi propiedad» = sólo la solicitud existente (`QuieroPublicar`), sin permisos ni publicación.
- 3c: redirecciones (`/dashboard` sólo la casa con sesión; `/mi-cuenta` conservando `?motivo=publicar`), capturas finales, `portalClienteInterno` encendido para tu revisión, correcciones, y después `portalCliente`.
- «Por revisar» / «Recientemente vistos»: **pendiente**, decisión aparte con privacidad y retención.

## Orden de trabajo, pruebas y verificación
1. 3a.6 → 3a.5 → 3a.3 → 3a.4 → 3a.2 → 3a.1 → 3a.7 (código) → 3a.8. Un commit por punto; CI en cada uno.
2. Suite completa + `tsc` + `next build` + capturas del arnés.
3. Despliegue V-1.1.82 con los tres flags apagados.
4. Verificación en producción: `/portal` y `/api/portal/resumen` → 404; `/api/favoritos`, `/api/busquedas`, `/api/contacto` → 401 sin sesión; `robots.txt` con `/portal` y `/citas`; páginas públicas 200; `/mi-cuenta` 200; asesor de seguridad sin avisos.
5. Migración 22 con checklist; verificación.
6. Documentar: plan, auditoría (P3-01…07 cerrados salvo P3-04), Obsidian (Versiones, Pendientes, PRD).

## Riesgos
- 3a.7 cambia `/mi-cuenta`, que ya usan clientes y publicadores: es un área privada, sin datos que migrar hoy; se prueba el guardado en el arnés y con pruebas de la API.
- La migración 22 borra columnas: hoy vacías (medido); se repite la medición justo antes de aplicarla.
- `citasEnLinea` apagado cierra la API de crear citas: hoy nadie la usa; se enciende en la fase de Visitas (8) cuando existan la pantalla de agendar y `/portal/visitas` abierto a clientes.

## Resultado — IMPLEMENTADO Y DESPLEGADO (V-1.1.82, 19-sep-2026)

Despliegue `vive-bien-oeo2kc057` con **los tres flags apagados** (`portalCliente`, `portalClienteInterno`, `citasEnLinea`). Commits (repo privado `Grupo-P-once/vivebien-next`, CI verde): `44d2c46` 3a.6 · `fcb0545` 3a.5 · `91545ad` 3a.3 · `7a0c319` 3a.4 · `cac0601` 3a.2 · `ccc8527` 3a.1 · `47cef17` 3a.7 · `c65d8ab` 3a.8.

| P3 | Resultado |
|---|---|
| P3-01 | ✅ Rutas de visitas en un solo lugar (`lib/citas/enlaces.ts`); fuera `/admin/calendario`; `citasEnLinea` apagado → `POST /api/citas` 409 antes de leer la sesión. Producción: 0 citas, 0 correos, 0 enlaces. |
| P3-02 | ✅ DTO explícito de consultas (`lib/consultas.ts`); cero `select('*')` en `/api/contacto`. |
| P3-03 | ✅ Favoritos y búsquedas por `exigir()`: suspendida → 403 en todo y el intento de escribir queda en la bitácora; núcleo de autorización inyectable y probado de verdad. |
| P3-04 | ⏳ Fase 3b (las 9 rutas). |
| P3-05 | ✅ 20 pruebas del Inicio (cuenta llena, vacía, sin publicadas). |
| P3-06 | ✅ `robots.txt` + `/portal`, `/citas`, `/vista-previa`; ninguna pública bloqueada. |
| P3-07 | ✅ Modelo único (`lib/cliente/busqueda.ts`); `/mi-cuenta` elige varias zonas y tipos por clave. **Migración 22 aplicada** (checklist completo) — ver abajo. |

**Migración 22** (`22_que_busco_un_modelo`), tras desplegar: respaldo (3 filas, 0 valores en las columnas viejas y en las nuevas) → referencias en base = 0 (vistas, funciones, índices, restricciones, políticas, dependencias, permisos) y en código = 0 (prueba en CI) → ensayo en PGlite y en producción con transacción revertida → aplicada → integridad (3 filas, roles intactos, 21 columnas, 2 triggers, 1 super admin activo) → 0 errores de columna en los logs de Postgres → 620 pruebas. Reversión: `22-que-busco-un-modelo.REVERTIR.sql`.

**Vista previa** (`/vista-previa/portal`, sólo `next dev`): 3 casos × 1440/834/390 → 0 intentos de datos reales, 0 errores de JS, 0 desborde horizontal; capturas en `docs/fase-3/capturas/`. En producción: 404 (comprobado en `next start` y en vivebienn.com).

**Calidad:** 620 pruebas (45 archivos, +76 en 3a); `tsc` limpio; lint idéntico a la línea base (65 errores previos en 24 archivos, 0 nuevos); `next build` limpio; CI verde.

**Pendiente visto al revisar las capturas (para 3b):** el botón «Solicitar visita» del Inicio aparece aunque `citasEnLinea` esté apagado → en 3b se cambia por contacto de VIVE BIEN mientras no se puedan agendar visitas; en tableta, la tercera tarjeta de «Para ti» queda sola en su fila (detalle de diseño para tu revisión).
