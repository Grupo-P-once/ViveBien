# Matriz maestra (resumen legible)

> **ESTADO FINAL DE QA-021 (supera cualquier «pendiente» de este documento):** **CLEANED**. Las 25 filas `property_view` (ids 188–212) se eliminaron el 8-oct-2026 con autorización explícita (D-66) y el contador `propiedades.vistas` se corrigió 27 → 2 (E-35.2, D-67). Eventos legítimos restantes: 179 y 180. Las menciones de «pendiente de autorización», «listo para corrección» o «no ejecutado» son el estado histórico al momento de escribirlas. Detalle: `docs/QA/E35_SEGURIDAD_Y_FRONTERAS.md`.

Fuente completa (22 columnas): `MATRIZ_MAESTRA.csv`. Generada por `tests/performance/generar-matriz-qa.py` desde el inventario real del código y la evidencia en `tests/performance/k6/reports/`.

Totales: 137 funciones/filas · BLOCKED 25 · NOT APPLICABLE 3 · PASS 31 · PASS CON OBSERVACIÓN 78

| ID | Función | Módulo | Rol | Ruta / API | Estado | p50 ms | p95 ms | Hallazgos | Límite / nota |
|---|---|---|---|---|---|---|---|---|---|
| F-001 | Registrar un intento/éxito de acceso (auditoría de login) | AUTH | ANÓNIMO | POST /api/acceso/registro | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 204 |
| F-002 | Feed de actividad reciente del panel | ADMINISTRACIÓN | ADMIN | GET /api/admin/actividad | BLOCKED |  |  |  | sin sesión responde 401 correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa) |
| F-003 | Analítica del panel (eventos, favoritos, leads) | ADMINISTRACIÓN | ADMIN | GET /api/admin/analitica | BLOCKED |  |  |  | sin sesión responde 401 correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa) |
| F-004 | Listar bajas de cuenta | CUENTAS | ADMIN (capacidad) | GET /api/admin/bajas | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-005 | Reintentar una baja de cuenta fallida | CUENTAS | ADMIN (capacidad) | POST /api/admin/bajas/[uid]/reintentar | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-006 | Búsqueda global del panel | ADMINISTRACIÓN | ADMIN | GET /api/admin/buscar | BLOCKED |  |  |  | sin sesión responde 401 correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa) |
| F-007 | Bandeja de contactos | LEADS | ADMIN | GET /api/admin/contactos | BLOCKED |  |  |  | sin sesión responde 401 correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa) |
| F-008 | Leer/cambiar flags de funcionalidades (atómico + auditado) | FLAGS | SUPER_ADMIN (capacidad) | GET /api/admin/flags | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-009 | Leer/cambiar flags de funcionalidades (atómico + auditado) | FLAGS | SUPER_ADMIN (capacidad) | POST /api/admin/flags | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-010 | Invitaciones: listar, crear, reenviar, cancelar | INVITACIONES | ADMIN | GET /api/admin/invitaciones | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-011 | Invitaciones: listar, crear, reenviar, cancelar | INVITACIONES | ADMIN | PATCH /api/admin/invitaciones | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-012 | Invitaciones: listar, crear, reenviar, cancelar | INVITACIONES | ADMIN | POST /api/admin/invitaciones | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-013 | Notificaciones del panel | NOTIFICACIONES | ADMIN | GET /api/admin/notificaciones | BLOCKED |  |  |  | sin sesión responde 401 correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa) |
| F-014 | Notificaciones del panel | NOTIFICACIONES | ADMIN | POST /api/admin/notificaciones | BLOCKED |  |  |  | sin sesión responde 401 correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa) |
| F-015 | Propiedades: lectura (pública sin sesión / completa con admin) y alta heredada | PROPIEDADES | ANÓNIMO (lectura) / ADMIN | GET /api/admin/propiedades | PASS CON OBSERVACIÓN |  |  | QA-011 | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 200 |
| F-016 | Propiedades: lectura (pública sin sesión / completa con admin) y alta heredada | PROPIEDADES | ANÓNIMO (lectura) / ADMIN | POST /api/admin/propiedades | PASS CON OBSERVACIÓN |  |  | QA-011 | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-017 | Propiedad: leer, editar, borrar (moderación) | PROPIEDADES | ADMIN / ASOCIADO (editar_publicadas) | DELETE /api/admin/propiedades/[id] | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-018 | Propiedad: leer, editar, borrar (moderación) | PROPIEDADES | ADMIN / ASOCIADO (editar_publicadas) | GET /api/admin/propiedades/[id] | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-019 | Propiedad: leer, editar, borrar (moderación) | PROPIEDADES | ADMIN / ASOCIADO (editar_publicadas) | PATCH /api/admin/propiedades/[id] | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-020 | Registro manual de leads/propiedades por el equipo | LEADS | ADMIN | GET /api/admin/registros | BLOCKED |  |  |  | sin sesión responde 401 correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa) |
| F-021 | Registro manual de leads/propiedades por el equipo | LEADS | ADMIN | POST /api/admin/registros | BLOCKED |  |  |  | sin sesión responde 401 correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa) |
| F-022 | Resumen del panel (contadores) | ADMINISTRACIÓN | ADMIN | GET /api/admin/resumen | BLOCKED |  |  |  | sin sesión responde 401 correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa) |
| F-023 | Usuarios: listar y cambiar rol/estado/modalidad (RPC atómica) | ROLES | ADMIN / SUPER_ADMIN | GET /api/admin/usuarios | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-024 | Usuarios: listar y cambiar rol/estado/modalidad (RPC atómica) | ROLES | ADMIN / SUPER_ADMIN | PATCH /api/admin/usuarios | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-025 | Ficha de un usuario (permisos efectivos) | PERMISOS | ADMIN | GET /api/admin/usuarios/[uid] | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-026 | Resumen programado a Telegram (cron diario) | ALERTAS | CRON (secreto) | GET /api/alertas/resumen | BLOCKED |  |  |  | sin sesión responde 401 correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa) |
| F-027 | Búsqueda en el Centro de Ayuda | AYUDA | ANÓNIMO | GET /api/ayuda/buscar | PASS CON OBSERVACIÓN | 216 | 268 | QA-001 |  |
| F-028 | Categorías del Centro de Ayuda | AYUDA | ANÓNIMO | GET /api/ayuda/categorias | PASS CON OBSERVACIÓN |  |  |  | ruta pública: respondió 200 en la sonda aislada (y/o ráfagas válidas), pero NO tiene prueba automática directa (QA-014) |
| F-029 | «¿Te sirvió?» anónimo sobre un artículo | AYUDA | ANÓNIMO | POST /api/ayuda/feedback | PASS CON OBSERVACIÓN |  |  | QA-003 | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 400 |
| F-030 | Búsquedas guardadas: listar/crear/borrar | BÚSQUEDAS GUARDADAS | CLIENTE | DELETE /api/busquedas | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-031 | Búsquedas guardadas: listar/crear/borrar | BÚSQUEDAS GUARDADAS | CLIENTE | GET /api/busquedas | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-032 | Búsquedas guardadas: listar/crear/borrar | BÚSQUEDAS GUARDADAS | CLIENTE | POST /api/busquedas | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-033 | Catálogo público (caché 5 min + última copia buena) | PROPIEDADES / BÚSQUEDA | ANÓNIMO | GET /api/catalogo | PASS CON OBSERVACIÓN | 97 | 185 | QA-010; QA-011 |  |
| F-034 | Citas: listar y crear (flag citasEnLinea OFF) | CITAS | CLIENTE / PUBLICADOR (capacidad) | GET /api/citas | PASS CON OBSERVACIÓN |  |  |  | flag citasEnLinea OFF: sin prueba en vivo; solo pruebas automáticas con dobles/PGlite |
| F-035 | Citas: listar y crear (flag citasEnLinea OFF) | CITAS | CLIENTE / PUBLICADOR (capacidad) | POST /api/citas | PASS CON OBSERVACIÓN |  |  |  | flag citasEnLinea OFF: sin prueba en vivo; solo pruebas automáticas con dobles/PGlite |
| F-036 | Detalle y bitácora de una cita | CITAS | PARTICIPANTES | GET /api/citas/[id] | PASS CON OBSERVACIÓN |  |  |  | flag citasEnLinea OFF: sin prueba en vivo; solo pruebas automáticas con dobles/PGlite |
| F-037 | Aceptar/rechazar/reprogramar/cancelar una cita | CITAS | PARTICIPANTES (capacidad) | POST /api/citas/[id]/transicion | PASS CON OBSERVACIÓN |  |  |  | flag citasEnLinea OFF: sin prueba en vivo; solo pruebas automáticas con dobles/PGlite |
| F-038 | Acción de cita desde enlace de correo (token) | CITAS | ENLACE | POST /api/citas/accion | BLOCKED |  |  |  | flag OFF y sin prueba automática directa |
| F-039 | Validar un enlace de cita | CITAS | ENLACE | POST /api/citas/accion/ver | BLOCKED |  |  |  | flag OFF y sin prueba automática directa |
| F-040 | Horarios disponibles de un asesor | CITAS | CLIENTE | GET /api/citas/disponibilidad | BLOCKED |  |  |  | flag OFF y sin prueba automática directa |
| F-041 | Solicitud de contacto sobre una propiedad (con consentimiento) | SOLICITUDES | CLIENTE | GET /api/contacto | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-042 | Solicitud de contacto sobre una propiedad (con consentimiento) | SOLICITUDES | CLIENTE | POST /api/contacto | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-043 | Eliminar mi cuenta (baja) | CUENTAS | CLIENTE | POST /api/cuenta/eliminar | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-044 | Estado de mi baja de cuenta | CUENTAS | CLIENTE | GET /api/cuenta/eliminar/estado | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-045 | Sonda de diagnóstico de Firebase | AUTH | ADMIN (capacidad) | GET /api/diagnostico/firebase | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-046 | Telemetría de eventos (vistas, favoritos…) | ANALÍTICA | ANÓNIMO / ADMIN (leer) | GET /api/eventos | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-047 | Telemetría de eventos (vistas, favoritos…) | ANALÍTICA | ANÓNIMO / ADMIN (leer) | POST /api/eventos | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 400 |
| F-048 | Favoritos: listar y alternar | FAVORITOS | CLIENTE | GET /api/favoritos | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-049 | Favoritos: listar y alternar | FAVORITOS | CLIENTE | POST /api/favoritos | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-050 | Leads para el equipo/publicador (DTO sin PII ajena) | LEADS | EQUIPO / PUBLICADOR (capacidad) | GET /api/leads | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-051 | Firma de subida a Cloudinary | IMÁGENES | PUBLICADOR (capacidad) | POST /api/medios/firma | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-052 | ¿Puede este usuario entrar al portal? (flags) | CLIENTE | CLIENTE | GET /api/portal/acceso | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 404 |
| F-053 | Alertas del portal: leer/crear | ALERTAS | CLIENTE | GET /api/portal/alertas | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 404 |
| F-054 | Alertas del portal: leer/crear | ALERTAS | CLIENTE | POST /api/portal/alertas | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 404 |
| F-055 | Búsquedas guardadas del portal | BÚSQUEDAS GUARDADAS | CLIENTE | GET /api/portal/busquedas | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 404 |
| F-056 | Búsquedas guardadas del portal | BÚSQUEDAS GUARDADAS | CLIENTE | PATCH /api/portal/busquedas | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 404 |
| F-057 | Mis consultas/solicitudes | SOLICITUDES | CLIENTE | GET /api/portal/consultas | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 404 |
| F-058 | Mis propiedades guardadas | FAVORITOS | CLIENTE | GET /api/portal/guardadas | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 404 |
| F-059 | «Me interesan» | FAVORITOS | CLIENTE | GET /api/portal/me-interesan | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 404 |
| F-060 | Resumen del portal del cliente | CLIENTE | CLIENTE | GET /api/portal/resumen | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 404 |
| F-061 | Mis visitas (citas) — flag citasEnLinea | CITAS | CLIENTE | GET /api/portal/visitas | PASS CON OBSERVACIÓN |  |  |  | flag citasEnLinea OFF: sin prueba en vivo; solo pruebas automáticas con dobles/PGlite |
| F-062 | Cambiar el estado de una propiedad (máquina de estados atómica) | PROPIEDADES | PUBLICADOR / ASOCIADO / ADMIN | POST /api/propiedades/[id]/estado | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-063 | Publicador: listar mis propiedades y crear borrador | PUBLICADOR | PUBLICADOR / ASOCIADO | GET /api/publicador/propiedades | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-064 | Publicador: listar mis propiedades y crear borrador | PUBLICADOR | PUBLICADOR / ASOCIADO | POST /api/publicador/propiedades | PASS CON OBSERVACIÓN |  |  |  | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-065 | Alta de lead anónimo con consentimiento versionado | LEADS | ANÓNIMO | GET /api/registro-lead | PASS CON OBSERVACIÓN |  |  |  | ruta pública: respondió 200 en la sonda aislada (y/o ráfagas válidas), pero NO tiene prueba automática directa (QA-014) |
| F-066 | Alta de lead anónimo con consentimiento versionado | LEADS | ANÓNIMO | POST /api/registro-lead | PASS CON OBSERVACIÓN |  |  |  | ruta pública: respondió 400 en la sonda aislada (y/o ráfagas válidas), pero NO tiene prueba automática directa (QA-014) |
| F-067 | Salud/diagnóstico de configuración | INFRAESTRUCTURA | ANÓNIMO | GET /api/salud | PASS CON OBSERVACIÓN | 300 | 482 | QA-002; QA-001 |  |
| F-068 | Webhook del asistente de Telegram (publicar por chat) | INTEGRACIONES | TELEGRAM (secreto) | GET /api/telegram/webhook | PASS CON OBSERVACIÓN |  |  | QA-012 | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 200 |
| F-069 | Webhook del asistente de Telegram (publicar por chat) | INTEGRACIONES | TELEGRAM (secreto) | POST /api/telegram/webhook | PASS CON OBSERVACIÓN |  |  | QA-012 | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 503 |
| F-070 | Mi perfil, rol y capacidades efectivas | PERFILES | CUALQUIER SESIÓN | GET /api/usuarios/me | PASS CON OBSERVACIÓN |  |  | QA-013 | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-071 | Mi perfil, rol y capacidades efectivas | PERFILES | CUALQUIER SESIÓN | PATCH /api/usuarios/me | PASS CON OBSERVACIÓN |  |  | QA-013 | autenticado: solo pruebas automáticas (no hay credenciales de QA vigentes); sin sesión: 401 |
| F-072 | Webhook de WhatsApp (verificación y mensajes) | INTEGRACIONES | META (firma) | GET /api/whatsapp/webhook | BLOCKED |  |  |  | sin sesión responde 403 correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa) |
| F-073 | Webhook de WhatsApp (verificación y mensajes) | INTEGRACIONES | META (firma) | POST /api/whatsapp/webhook | BLOCKED |  |  |  | sin sesión responde 403 correctamente, pero NO hay prueba funcional (requiere sesión y no existe prueba automática directa) |
| F-074 | Portada | SITIO PÚBLICO | ANÓNIMO | / | PASS CON OBSERVACIÓN | 123 | 159 | QA-007 |  |
| F-075 | Panel de administración · inicio | ADMINISTRACIÓN | ADMIN | /admin | PASS | 313 |  |  | carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado |
| F-076 | Panel · actividad | AUDITORÍA | ADMIN | /admin/actividad | PASS | 340 |  |  | carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado |
| F-077 | Panel · configuración y flags | FLAGS | SUPER_ADMIN | /admin/configuracion | PASS | 407 |  |  | carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado |
| F-078 | Panel · mi cuenta | PERFILES | ADMIN | /admin/cuenta | PASS | 345 |  |  | carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado |
| F-079 | Panel · métricas | ANALÍTICA | ADMIN | /admin/metricas | BLOCKED | 347 |  |  | HTML 200 (cascarón) pero sin prueba funcional ni e2e directa: contenido tras sesión |
| F-080 | Panel · propiedades | PROPIEDADES | ADMIN | /admin/propiedades | PASS | 373 |  |  | carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado |
| F-081 | Panel · cola de revisión | PROPIEDADES | ADMIN | /admin/propiedades/pendientes | PASS | 0 | 0 |  |  |
| F-082 | Panel · registros manuales | LEADS | ADMIN | /admin/registros | PASS | 328 |  |  | carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado |
| F-083 | Panel · carga inicial (herramienta) | ADMINISTRACIÓN | ADMIN | /admin/seed | BLOCKED | 319 |  |  | HTML 200 (cascarón) pero sin prueba funcional ni e2e directa: contenido tras sesión |
| F-084 | Panel · usuarios y permisos | ROLES | ADMIN / SUPER_ADMIN | /admin/usuarios | PASS | 351 |  |  | carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado |
| F-085 | Panel · ficha de usuario | PERMISOS | ADMIN | /admin/usuarios/[uid] | BLOCKED | 434 |  |  | HTML 200 (cascarón) pero sin prueba funcional ni e2e directa: contenido tras sesión |
| F-086 | Centro de Ayuda · inicio | AYUDA | ANÓNIMO | /ayuda | PASS | 111 | 154 |  |  |
| F-087 | Centro de Ayuda · categoría | AYUDA | ANÓNIMO | /ayuda/[categoria] | PASS CON OBSERVACIÓN | 1152 |  | QA-009 |  |
| F-088 | Centro de Ayuda · artículo | AYUDA | ANÓNIMO | /ayuda/[categoria]/[articulo] | PASS CON OBSERVACIÓN | 1221 |  | QA-009 |  |
| F-089 | Centro de Ayuda · resultados | AYUDA | ANÓNIMO | /ayuda/buscar | PASS CON OBSERVACIÓN | 1042 |  | QA-009 |  |
| F-090 | Página de acción de cita (enlace de correo) | CITAS | ENLACE | /citas/accion | PASS CON OBSERVACIÓN | 344 |  |  | flag citasEnLinea OFF: sin prueba en vivo; solo pruebas automáticas con dobles/PGlite |
| F-091 | Comparador de propiedades | BÚSQUEDA | ANÓNIMO | /comparar | PASS | 374 |  |  |  |
| F-092 | Formulario de contacto general | CONTACTO | ANÓNIMO | /contacto | PASS | 514 |  |  |  |
| F-093 | Reparto por rol tras iniciar sesión | AUTH | CUALQUIER SESIÓN | /dashboard | PASS | 497 |  |  |  |
| F-094 | Entrar / crear cuenta (email, Google) | AUTH | ANÓNIMO | /entrar | PASS CON OBSERVACIÓN | 488 |  | QA-008 |  |
| F-095 | Mi cuenta | PERFILES | CLIENTE | /mi-cuenta | PASS | 359 |  |  |  |
| F-096 | Nosotros | SITIO PÚBLICO | ANÓNIMO | /nosotros | PASS | 511 |  |  |  |
| F-097 | Portal del cliente · inicio | CLIENTE | CLIENTE | /portal | PASS | 479 |  |  | carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado |
| F-098 | Portal · alertas | ALERTAS | CLIENTE | /portal/alertas | BLOCKED | 460 |  |  | HTML 200 (cascarón) pero sin prueba funcional ni e2e directa: contenido tras sesión |
| F-099 | Portal · búsquedas guardadas | BÚSQUEDAS GUARDADAS | CLIENTE | /portal/busquedas | BLOCKED | 481 |  |  | HTML 200 (cascarón) pero sin prueba funcional ni e2e directa: contenido tras sesión |
| F-100 | Portal · configuración / baja de cuenta | CUENTAS | CLIENTE | /portal/configuracion | PASS | 548 |  |  | carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado |
| F-101 | Portal · consultas | SOLICITUDES | CLIENTE | /portal/consultas | BLOCKED | 502 |  |  | HTML 200 (cascarón) pero sin prueba funcional ni e2e directa: contenido tras sesión |
| F-102 | Portal · «Lo que busco» | BÚSQUEDAS GUARDADAS | CLIENTE | /portal/mi-busqueda | PASS | 513 |  |  | carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado |
| F-103 | Portal · perfil | PERFILES | CLIENTE | /portal/perfil | BLOCKED | 477 |  |  | HTML 200 (cascarón) pero sin prueba funcional ni e2e directa: contenido tras sesión |
| F-104 | Portal · propiedades guardadas | FAVORITOS | CLIENTE | /portal/propiedades | PASS | 480 |  |  | carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado |
| F-105 | Portal · mis visitas | CITAS | CLIENTE | /portal/visitas | PASS CON OBSERVACIÓN | 539 |  |  | flag citasEnLinea OFF: sin prueba en vivo; solo pruebas automáticas con dobles/PGlite |
| F-106 | Aviso de privacidad | LEGAL | ANÓNIMO | /privacidad | PASS | 593 |  |  |  |
| F-107 | Listado/catálogo con filtros | PROPIEDADES / BÚSQUEDA | ANÓNIMO | /propiedades | PASS CON OBSERVACIÓN | 100 | 126 | QA-007; QA-010 |  |
| F-108 | Ficha pública (slug / folio / id; 404 si pausada o no publicada) | PROPIEDADES | ANÓNIMO | /propiedades/[id] | PASS CON OBSERVACIÓN | 213 | 763 | QA-001; QA-006; QA-007; QA-009 |  |
| F-109 | Panel del publicador | PUBLICADOR | PUBLICADOR / ASOCIADO | /publicador | PASS | 0 | 0 |  |  |
| F-110 | Publicador · citas recibidas | CITAS | PUBLICADOR (capacidad) | /publicador/citas | PASS CON OBSERVACIÓN | 526 |  |  | flag citasEnLinea OFF: sin prueba en vivo; solo pruebas automáticas con dobles/PGlite |
| F-111 | Publicador · editor de propiedad | PUBLICADOR | PUBLICADOR / ASOCIADO | /publicador/propiedades/[id]/editar | PASS | 922 |  |  | carga HTML 200 en producción; el contenido autenticado solo por Playwright simulado |
| F-112 | Términos y condiciones | LEGAL | ANÓNIMO | /terminos | PASS | 824 |  |  |  |
| F-113 | Valuador | SITIO PÚBLICO | ANÓNIMO | /valuador | PASS | 664 |  |  |  |
| F-114 | Vista previa de desarrollo (no se despliega) | DESARROLLO | DEV | /vista-previa/admin/usuarios | NOT APPLICABLE | 507 |  | en producción responde 404 (correcto) | no se despliega |
| F-115 | Vista previa de desarrollo (no se despliega) | DESARROLLO | DEV | /vista-previa/admin/usuarios/[uid] | NOT APPLICABLE | 484 |  | en producción responde 404 (correcto) | no se despliega |
| F-116 | Vista previa de desarrollo (no se despliega) | DESARROLLO | DEV | /vista-previa/portal | NOT APPLICABLE | 462 |  | en producción responde 404 (correcto) | no se despliega |
| F-117 | Mapa del sitio (sitemap.xml) | SEO | ANÓNIMO | /sitemap.xml | PASS | 81 | 101 |  |  |
| F-118 | robots.txt | SEO | ANÓNIMO | /robots.txt | PASS |  |  |  |  |
| F-119 | manifest | SEO | ANÓNIMO | /manifest.webmanifest | PASS |  |  |  |  |
| F-120 | 404 real | SITIO PÚBLICO | ANÓNIMO | /<inexistente> | PASS |  |  |  |  |
| F-121 | Login email/contraseña y Google | AUTH | TODOS |  | PASS CON OBSERVACIÓN |  |  |  | sin cuentas de QA vigentes ni login real repetible: Google en localhost da unauthorized-domain |
| F-122 | Cambio de cuenta A→B (sin estado residual) | AUTH | TODOS |  | PASS CON OBSERVACIÓN |  |  |  | APIs y Google simulados (E-31) |
| F-123 | Sesión expirada / inválida / suspendida / eliminada | AUTH | TODOS |  | PASS CON OBSERVACIÓN |  |  |  | sin prueba viva autenticada |
| F-124 | Invitaciones: crear, aceptar, correo distinto, mayúsculas/espacios | INVITACIONES | ADMIN / INVITADO |  | PASS CON OBSERVACIÓN |  |  |  | atomicidad probada en serie (PGlite); carrera real BLOCKED |
| F-125 | Roles y modalidad por RPC atómica + auditoría (mig. 28/31) | ROLES | ADMIN / SUPER_ADMIN |  | PASS CON OBSERVACIÓN |  |  |  | concurrencia real de dos admins BLOCKED (sin BD de pruebas) |
| F-126 | Último SUPER_ADMIN no se puede dejar en 0 | SUPER_ADMIN | SUPER_ADMIN |  | PASS CON OBSERVACIÓN |  |  |  | probado en SQL local; no en producción por seguridad |
| F-127 | Capacidades efectivas (defecto por modalidad + overrides) | PERMISOS | PUBLICADOR / ASOCIADO |  | PASS |  |  |  | matriz en docs/permissions.md; ninguna autorización usa tipo_publicador |
| F-128 | Máquina de estados de propiedad (borrador→…→publicada, pausada, etc.) | PROPIEDADES | PUBLICADOR / ADMIN |  | PASS CON OBSERVACIÓN |  |  |  | ciclo completo en vivo no ejecutado (sin cuentas ni BD de pruebas) |
| F-129 | Visibilidad pública D-59 (código + RLS 34) | PROPIEDADES | ANÓNIMO |  | PASS |  |  |  | vendida/rentada/revisión/rechazada solo por pruebas automáticas (no hay datos así) |
| F-130 | Subida de imágenes (firma Cloudinary, validación de medios) | IMÁGENES | PUBLICADOR |  | BLOCKED |  |  |  | sin claves de Cloudinary en local (sensibles) y sin sesión: la subida real no se ejercitó (D-58) |
| F-131 | Rate limit por origen (contacto, eventos, registro-lead, favoritos…) | SEGURIDAD | ANÓNIMO |  | PASS CON OBSERVACIÓN |  |  |  | en memoria por instancia (QA-004); feedback sin tope (QA-003) |
| F-132 | Aviso de privacidad / consentimiento versionado | LEGAL | ANÓNIMO |  | PASS CON OBSERVACIÓN |  |  |  | sin PII real |
| F-133 | WhatsApp flotante / contacto | WHATSAPP | ANÓNIMO |  | PASS CON OBSERVACIÓN |  |  |  | envío real no probado |
| F-134 | Notificaciones Telegram / correo (leads, alertas) | NOTIFICACIONES | SISTEMA |  | BLOCKED |  |  |  | no se enviaron avisos reales a propósito (sin TELEGRAM_* / RESEND en el entorno aislado) |
| F-135 | Degradación del catálogo (BD lenta/500/caída) | RESILIENCIA | SISTEMA |  | PASS |  |  |  | agregado en esta campaña (QA-015) |
| F-136 | Barrera de QA de despliegues (smoke-deployment.ts) | INFRAESTRUCTURA | EQUIPO |  | PASS |  |  |  |  |
| F-137 | Cron diario /api/alertas/resumen | ALERTAS | CRON |  | BLOCKED |  |  |  | ejecución con secreto no probada (no se usan secretos) |


## Actualización post-reparación (D-63, 7-oct-2026)
Conteos D-62 conciliados: **FAIL = 0**, **P4 = 2** (QA-016, QA-021). Tras la campaña: `/api/salud` pública ya no filtra configuración (detalle en `/api/admin/salud`); el feedback de ayuda tiene tope; 18 rutas con límite por interfaz; ficha cacheada con etiqueta; `/entrar` con CLS < 0,1; baselines visuales 45/45 vigentes con manifiesto; suite de sesión 95/95 sobre el candidato. Las funciones **BLOCKED** (login real, cola de revisión con datos, citas con flag apagado) siguen BLOCKED hasta que exista staging (`STAGING.md`); no se reclasifica ninguna sin evidencia autenticada.
