# ADR-0014 · CITAS v2 — modelo, roles, recordatorios y correos sin botones

- **Estado:** Aceptada (5/6-nov-2026) — decisiones D-1…D-12 del dueño; **implementada en la rama `citas/v2-staging` y probada en staging; NO desplegada ni aplicada en Producción** (migraciones 70–73 solo en `vivebien-staging`; `citasEnLinea` apagado en todas partes).
- **Relacionado:** ADR-0013 (publicador/asociado y permisos), ADR-0006 (publicador sin PII), DECISIONS D-08 (enmendada), D-80/D-82/D-83 (correo). Detalle y evidencia: nota de Obsidian «Citas — bitácora de implementación en staging (5-nov-2026)».

## Contexto

El sistema de citas anterior pedía confirmar con botones dentro del correo, apartaba el horario con solo pedir la cita, no tenía recordatorios ni calendario, y suponía que el responsable era siempre el dueño de la propiedad. Las decisiones del dueño cambiaron esas reglas.

## Decisión

1. **Estados** (vocabulario único en API, interfaz, correos, ayuda y pruebas): Pendiente (`REQUESTED`; `PENDING_CONFIRMATION` cuando la registra el equipo y espera a la persona), Confirmada, Rechazada, Cancelada, Reprogramación solicitada, Realizada, No asistió, Expirada.
2. **Solo la cita confirmada aparta horario** (D-2). Las solicitudes pendientes conviven; la primera confirmación válida gana. La garantía vive en la base: restricción de exclusión (`citas_asesor_sin_empalme`, GiST) sobre las citas firmes del responsable y exclusión por cliente. La perdedora recibe `horario_ocupado` (409) y, por correo, alternativas. `PENDING_CONFIRMATION` también aparta (la acordó el equipo con el responsable).
3. **Responsable de una propiedad (D-1):** el asignado por un admin → el dueño si atiende citas (equipo, o publicador/asociado con `recibir_citas`) → el responsable del equipo configurado; si ninguno, **falla cerrado** (409). El **propietario** que no atiende (un publicador: la coordina VIVE BIEN) solo lee, sin acciones y sin PII salvo `ver_datos_interesado`; el historial se recorta para él igual que para el cliente. **Datos por rol (tabla del dueño, 6-nov-2026):** el cliente ve los suyos; el publicador, ninguno de las visitas a sus propiedades; el **asociado que atiende ve nombre, teléfono y las notas de la visita** (necesarios para coordinar; lo que la persona aceptó compartir con la casilla) y **nunca el correo** (salvo `ver_datos_interesado`), ni notas internas ni Google; Admin y Super Admin, según su nivel. Admin y Super Admin **sí tienen citas personales** (pueden agendar) y las ven junto a las del equipo en `/admin/citas` (filtro «Mis visitas»).
4. **D-8:** si el responsable se agenda a sí mismo en un horario disponible, la cita nace **Confirmada**; en cualquier otro caso, Pendiente (`estadoInicialDeCita`, función pura probada).
5. **Cancelación del cliente** hasta 2 h antes de una cita firme (`HORAS_MINIMAS_CLIENTE`, SQL y TS con paridad probada en 1 342 combinaciones); después, contactar a VIVE BIEN. Retirar una solicitud sin confirmar no tiene límite (no libera ningún horario). **Reprogramar** = pedir otro horario; la cita vigente se conserva hasta que se confirme la nueva.
6. **Correos (D-3):** 17 tipos, **sin botones de acción**: el enlace lleva al panel con sesión. Cada acción produce su evento y cada evento su correo (prueba de cobertura). Pasan por la compuerta común `CORREO_ENVIO` y `CORREO_TRANSACCIONAL`; con `citasEnLinea` apagado no se crea ninguna cita. El código de acción por token (`/citas/accion`, `/api/citas/accion`) es heredado e inalcanzable (nada genera ya esos tokens); se conserva hasta que el dueño autorice retirarlo.
7. **Recordatorios (D-4):** 24 h y 1 h antes de una cita confirmada. Cola idempotente `citas_recordatorios` (clave única por cita/tipo/versión/destinatario, `for update skip locked`, hasta 5 intentos, fallos visibles). La dispara `pg_cron` cada minuto vía `pg_net` → `POST /api/citas/tareas`.
8. **Autenticación de la tarea:** no viaja ningún secreto reutilizable. El cron manda `x-citas-tiempo` y `x-citas-firma` = HMAC-SHA256(secreto del Vault, tiempo); la base valida (`citas_tarea_firma_valida`: firma, ventana de 120 s y un solo uso). Motivo: `pg_net` deja los encabezados legibles en `net.http_request_queue` para los roles de la app y Supabase no permite revocarlo desde SQL (la migración 71c lo intentó y no sirvió). La ruta tiene además un tope por origen (en memoria, por instancia).
9. **Calendario:** `.ics` descargable y enlace «Añadir al calendario»; **sin OAuth** de Google/Outlook hasta una decisión nueva. Solo citas firmes y no pendientes.
10. **Disponibilidad real** por responsable (horario semanal, duración, traslado, anticipación, ventana, confirmación manual/automática y bloqueos) guardada en una función atómica con bitácora (`citas_guardar_agenda`).
11. **Pantallas:** un panel único por rol (calendario mes/semana/día/agenda, historial, filtros, detalle con acciones que SOLO ofrece lo que el servidor manda en `cita.acciones`); tarjeta «Agenda una cita» en la ficha, encima de la campana, solo con cuenta y solo con `citasEnLinea` encendido. Actualización por consulta cada 45 s y al volver a la pestaña (tiempo real por Broadcast, para después).
12. **Texto legal y ayuda:** Aviso de Privacidad y Términos con citas son un **borrador 2026-11-06 sujeto a aprobación del abogado** (no se publica sin ella; al subir la versión se pide re-aceptar a publicadores y asociados). El Centro de Ayuda se actualiza con la migración 74 (aplicada en staging; en Producción, después del código) y la 74b al encender el flag.

## Consecuencias

- Producción no cambia hasta que el dueño autorice, en este orden: aprobación legal → desplegar el código → migraciones 70–73 en Producción (instalar `pg_cron`/`pg_net`, crear el secreto de la tarea y `citas_tareas_url`) → migración 74 → encender `citasEnLinea` → migración 74b.
- **Pendiente de decisión del dueño:** cómo llama el cron a un entorno protegido por la Protección de Despliegue (cabecera de bypass de automatización o dominio propio): ambas cambian ajustes de seguridad/DNS del proyecto compartido con Producción y no se hicieron.
- La 71c existe solo en staging y no debe aplicarse en Producción (registro en `supabase/71c-…APLICADA-SOLO-EN-STAGING.sql`).

## Pruebas que la sostienen

`citas`, `citas-db` (PGlite, 15+70+72+73), `citas-v2`, `citas-estado-inicial`, `citas-tareas`, `citas-agenda`, `citas-correos`, `citas-correos-cobertura`, `citas-correo-abandonado`, `citas-historial-propietario`, `publicador-citas`, `citas-enlaces`, `citas-legal`, `migracion-74-ayuda-citas`, y en navegador `citas-pantallas` (4 anchos, axe, teclado), `analitica-aviso`.

## Revisión de cierre (8-nov-2026)

Revisión de solo lectura del código, las pruebas y la documentación contra las reglas vigentes del propietario, más la verificación de permisos en la base de **staging** (solo consultas de catálogo). Producción no se consultó.

**Verificado**
- Autorización en el servidor en todas las rutas de citas (`exigir` + `papelEn`); `p_actor_rol`, `asesor_uid`, `propietario_uid` y el estado inicial salen del servidor, nunca del cuerpo. Un id ajeno da el mismo 404 que uno inexistente.
- Concurrencia e idempotencia garantizadas en la base: `unique (creada_por, clave_idempotencia)`, restricciones GiST `citas_asesor_sin_empalme` y `citas_cliente_sin_empalme` (con `check (fin > inicio)` para que un rango vacío no se cuele), `cita_transicionar` con `for update` y comparación de versión.
- Permisos reales en staging: las 8 funciones de citas y `configuracion_cambiar_flag` solo las ejecuta `service_role` (`citas_tarea_invocar` ni siquiera él); las 11 tablas de citas tienen RLS activo, **0 políticas** y ningún privilegio para `anon`/`authenticated`. Lo mismo se prueba en `tests/citas-permisos-sql.test.ts` (PGlite con los permisos por omisión de Supabase; 33 pruebas, comprobadas por mutación).
- Sin correo ni Telegram reales en el Preview: sus variables de entorno no existen allí y el código falla cerrado sin ellas.

**Corregido**
- `GET /api/citas?limite=-5` (o `2.5`) llegaba a `.limit()` y devolvía 500; ahora solo un entero positivo acota la lista. Prueba de regresión en `tests/citas-ruta-lista-y-agendar.test.ts`.
- `docs/permissions.md`: la fila del asesor decía «se copia de `owner_id`»; hoy lo decide `responsableDeCitas`.
- Pruebas nuevas: contrato HTTP de `POST/GET /api/citas` y de `/transicion`, IDOR de cliente contra cliente con el servicio real, y permisos SQL.

**Decisiones del propietario (RESUELTAS el 9-nov-2026; implementadas en el código, verificadas en staging, sin Producción)**
1. *Asociado dueño de una propiedad que atiende otra persona.* **Sí:** ve nombre, teléfono y notas en solo lectura (`contactoBasico` en `recortar`, solo para `papel === 'propietario'` y `tipoPublicador === 'asociado'`); el correo solo con `ver_datos_interesado`. El publicador no asociado sigue sin datos personales. **Efecto colateral:** el artículo público de ayuda de la migración 74 («solo ve que hay una cita… sin tu nombre, teléfono, correo ni notas») deja de ser cierto para el asociado → hace falta una migración de ayuda nueva y revisión legal del Aviso de Privacidad (pendiente, NO hecho).
2. *Admin que es el cliente de una cita.* **Actúa como cliente en esa cita** (`papelEn` devuelve `cliente` si `perfil.uid === cita.cliente_uid` y no es su propio asesor): no se confirma sola y no salta la regla de 2 h (D-8 intacto). Sobre las demás citas conserva el alcance global.
3. *Quién asigna al responsable.* **Pantalla `/admin/citas/responsables`** (enlazada desde el calendario del equipo) + `GET/PUT /api/admin/citas/responsables` + migración 76 (`citas_asignar_responsable_propiedad` / `_equipo`: atómicas, auditadas, comparan el «antes», solo `service_role`). Solo puede ser responsable quien atiende citas (lo decide el servidor). Aplicada a **staging** el 9-nov-2026; Producción pendiente de autorización.
4. *Cancelación hecha por el cliente.* **El cliente recibe el correo de cancelación con `.ics` (`STATUS:CANCELLED`):** `cancelada` entra en `SIEMPRE` de `planDeCorreos`. Sigue siendo `METHOD:PUBLISH` (algunos calendarios la ignoran; no verificado cuáles).
5. *Endpoints heredados de token.* **Retirados** (decisión delegada al agente por el dueño): borrados `/api/citas/accion`, `/api/citas/accion/ver` y la página `/citas/accion`. **No se tocaron** las tablas/funciones SQL de tokens ni `verToken/usarToken/VistaToken` del servicio: quedan como código muerto documentado (retirarlos exigiría una migración destructiva, fuera del alcance). El Disallow de robots se conserva.
6. *Auditoría legible.* **Sí:** `GET /api/citas/[id]` añade `actor` (nombre) al historial solo si el que mira tiene `citas.ver_todas`; nunca el uid; si falla la lectura de nombres, no se muestra ninguno (falla cerrado).

7. *Titular automático del equipo (10-nov-2026, decisión del dueño: «los admins ven lo mismo; solo el Super Admin es independiente»).* **Implementado:** si ni el responsable asignado, ni el dueño, ni el responsable del equipo configurado atienden una propiedad, la atiende el **admin activo más antiguo** (empate por uid; uno suspendido no cuenta); el **Super Admin solo si no hay ningún admin activo**; si no existe ninguno, falla cerrado («sin asesor»). Así las propiedades de publicadores y de admins nunca quedan «sin asesor» por falta de configuración. Código: `titularAutomaticoDelEquipo` (`src/lib/citas/asesores.ts`) y `responsableDeCitas`; pantalla: origen «titular automático del equipo». Ayuda pública: migración 78. **Límite aceptado:** una sola visita a la vez por horario del equipo. **Mejora posterior (no ahora):** disponibilidad por admin, asignación al libre y mover una cita entre asesores (el plan está en la nota del CRM de Obsidian, pospuesto).

**Aclaraciones de documentación**
- El `.ics` va en UTC (`...Z`), válido e inequívoco; no lleva `TZID`/`VTIMEZONE` (la zona America/Mexico_City solo aparece en el enlace «Añadir a Google»). Las cancelaciones usan `METHOD:PUBLISH` con `STATUS:CANCELLED`; algunos clientes de calendario ignoran cancelaciones por PUBLISH (cuáles: no verificado).
- Una cita `PENDING_CONFIRMATION` aparta horario pero no programa recordatorios: los recordatorios son de la cita **confirmada** (§7).
- El aviso de Telegram incluye el nombre del responsable («Atiende: …») y nada del cliente.
- Tope de ritmo: `frenarAsync` es compartido entre instancias solo si hay Upstash configurado; si no, es por instancia. `GET /api/citas`, `/disponibilidad` y `ajustes` GET no tienen tope propio.
