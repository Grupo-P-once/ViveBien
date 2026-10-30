# D-80 · Sistema de correo con Resend: transaccional, recomendaciones y bajas (8-oct-2026)

**Estado: IMPLEMENTADO Y PROBADO EN LOCAL. NO desplegado, NO activado, sin commit ni push.** Producción sigue en `dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z` (D-75 + D-76). Todo lo nuevo sale **APAGADO**: desplegar este código no envía un solo correo nuevo ni abre una página nueva. Migraciones 36 y 37 **PREPARADAS, NO APLICADAS**. No se envió ningún correo real, no se tocó DNS, Resend ni Vercel.

## 1 · Investigación (consultada el 8-oct-2026)
### Hechos confirmados por fuentes oficiales
| Tema | Dato | Fuente |
|---|---|---|
| Plan Free | **3,000 correos/mes y 100/día**; 3 dominios; 1,000 contactos de marketing; 10,000 ejecuciones de automatización/mes; retención de 30 días; **1 endpoint de webhook**; sin pago por uso (el tope diario impone el límite) | https://resend.com/pricing |
| Planes de pago | Pro 50k–100k/mes, sin tope diario; con *pay-as-you-go* se sigue enviando por encima de la cuota y se cobra por cubos de 1,000 | https://resend.com/pricing |
| Límite de la API | **10 peticiones por segundo por equipo**; respuesta 429 y cabeceras `ratelimit-*` / `retry-after`; ampliable a petición | https://resend.com/docs/api-reference/rate-limit |
| Dominio | SPF, DKIM y DMARC; Resend **recomienda enviar desde un subdominio** para aislar la reputación (y activar o no el rastreo por dominio) | https://resend.com/docs/dashboard/domains/introduction |
| Idempotencia | Cabecera `Idempotency-Key` (hasta 256 caracteres, conservada **24 h**); misma clave con otro contenido → 409; también en `/emails/batch` | https://resend.com/docs/dashboard/emails/idempotency-keys |
| Webhooks | Cabeceras `svix-id`, `svix-timestamp`, `svix-signature`; se verifica con el **cuerpo crudo**; eventos `email.sent/delivered/bounced/complained/suppressed/failed/opened/clicked/delivery_delayed`; rebote con `data.bounce.type` (`Permanent`…) | https://resend.com/docs/webhooks/verify-webhooks-requests · /event-types · /emails/bounced |
| Bajas | Los contactos dados de baja no reciben *broadcasts* ni automatizaciones, **pero los correos transaccionales por API siguen saliendo** (salvo un `topic_id` rechazado); se pueden poner cabeceras `List-Unsubscribe` propias | https://resend.com/docs/dashboard/audiences/managing-unsubscribe-list · /dashboard/emails/custom-headers |
| Gmail/Yahoo (feb-2024) | «Remitente masivo» = 5,000/día; exigen SPF + DKIM + **DMARC**, baja con un clic (`List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, responder 200/202, procesar pronto), y **quejas < 0.3 %** | https://resend.com/blog/gmail-and-yahoo-bulk-sending-requirements-for-2024 |
| Correos de prueba | `delivered@`, `bounced@`, `complained@`, `suppressed@resend.dev`; **cuentan para la cuota** pero no dañan la reputación | https://resend.com/docs/dashboard/emails/send-test-emails |
| Vercel Cron | **Hobby: una ejecución al día como máximo, precisión de ±59 min**; 100 crons por proyecto; Pro: por minuto | https://vercel.com/docs/cron-jobs/usage-and-pricing |

### Estado REAL de la cuenta (lectura con las herramientas conectadas; sin cambiar nada)
- **Resend: plan Free** — hoy 0/100 diarios, 2/3,000 mensuales (ciclo reinicia el día 23), contactos 0/1,000, segmentos 1/3, dominios 1/3, límite 10 req/s. **Webhooks configurados: 0.** Dominio `vivebienn.com`: verificado, envío habilitado, recepción deshabilitada, rastreo de aperturas y clics **apagado**; registros DKIM y SPF (CNAME `send.` y `rsend.`) verificados.
- **Vercel: equipo en plan Hobby** → el cron es de **una vez al día**; por eso «cada tres días» se logra con una fecha por persona (`proximo_envio_en`), no con el reloj.
- **DNS (consulta pública):** MX de `vivebienn.com` = Google Workspace; SPF de la raíz = `include:_spf.google.com`; **NO existe registro DMARC** (`_dmarc.vivebienn.com`).
- **Supuestos que requieren validación en la cuenta:** que `informes@` pueda enviar (el dominio está verificado: sí) y que al activarse el webhook llegue con el formato documentado (se verificará con el primer evento de prueba).

### Competencia (patrones, sin copiar nada)
Fuentes consultadas: paperlesspipeline.com, moosend.com (plantillas inmobiliarias 2026), mailbakery.com, myrealpage.com, sender.net, luxurypresence.com, tremgroup.com, flippingbook.com, keyrealestateresources.com. Patrones: **una sola columna**, más de la mitad se abre en teléfono; **una selección corta** de propiedades con foto grande, datos clave y precio; **CTA repetido** («Ver propiedad»); como mucho una imagen hero y texto primero (los correos pesados caen en Promociones); asunto breve que dice el valor. Todo lo aplicado en las plantillas está hecho desde cero con la marca de VIVE BIEN.

## 2 · Arquitectura elegida
- **Datos propios en Supabase, envío por la API de Resend** (sin Contacts/Broadcasts/Automations de Resend). Razones (juicio de diseño, no un hecho del proveedor): el contenido es **distinto para cada persona** y depende del catálogo vigente; el estado de consentimiento y baja debe vivir junto a los datos del negocio y probarse con SQL; Free limita contactos (1,000) y a un solo webhook; y así la baja funciona aunque Resend cambie. **Se conserva compatibilidad con el proveedor:** las bajas se aplican localmente ANTES de cada envío y los webhooks de rebote/queja se sincronizan hacia la base.
- **Fuente de verdad:** cuenta/perfil → `usuarios`; propiedades → `propiedades` (sólo publicadas y disponibles); guardados → `favoritos` (sin cambios); leads → `leads` y `solicitudes_contacto` (sin cambios); consentimiento y bajas → `correo_suscriptores`; supresión → `correo_supresiones`; historial e idempotencia → `correo_envios` (clave única); eventos del proveedor → `correo_webhook_vistos`.
- **Lógica atómica en SQL** (9 funciones `correo_*`, sólo `service_role`, probadas en PGlite): suscribir, confirmar, baja, cuenta con sesión, reservar envío (idempotencia + supresión + presupuesto en una transacción con candado), marcar envío, aplicar evento, vincular cuenta y salud. El TypeScript valida entradas, firma enlaces y envía.
- **Sin dependencias nuevas:** plantillas como funciones TypeScript (HTML con tablas y estilos en línea + texto plano) en vez de React Email, porque el stack no lo tiene y añadirlo sumaba complejidad sin aportar a estos 5 correos; Resend por `fetch` como el resto del código.
- **Enlaces firmados sin guardar tokens:** `<id>.<expira>.<HMAC-SHA256>` con `CORREO_SECRETO`. El correo comercial lleva la baja de cada persona sin tabla de tokens; confirmar caduca a los 7 días; la baja no caduca. El token va en el fragmento `#` (no llega al servidor ni a registros) y la acción es un **POST con botón** (un escáner de correo que abre enlaces no confirma ni da de baja).
- **Alternativas descartadas:** Broadcasts/Topics de Resend (mismo contenido para todos); Automations (mismo problema + dependencia); cola externa (Upstash/QStash; coste y servicio nuevo sin necesidad con ≤ 25 envíos diarios); cron más frecuente (Hobby no lo permite); marketing en el dominio raíz (se prepara `RESEND_FROM_MARKETING` para usar un subdominio sin cambiar código).

## 3 · Flujos
| Flujo | Qué hace | Activación |
|---|---|---|
| **A · Solicitud de publicador** | `registro-lead` ya guardaba el lead y avisaba a `informes@` (sin cambios). Ahora, sólo si el interés es «Quiere publicar una propiedad» (constante compartida con el botón) y la sesión trae un **correo verificado**, se manda UNA confirmación («recibimos tu solicitud, **no está aprobada**», referencia `SOL-<id del lead>`, siguientes pasos reales). Clave `publicador/<id>`; después de responder; nunca tumba el lead. No cambia roles ni permisos. | `CORREO_TRANSACCIONAL=1` |
| **B · Visitante sin cuenta** | `/recomendaciones`: correo + preferencias + casilla **expresa y desmarcada** (el servidor exige `acepto === true`). Guarda `pendiente` con versión y fecha del consentimiento y manda un correo de confirmación; **nada comercial** hasta pulsar el enlace. Respuesta idéntica exista o no el correo (anti-enumeración). Una confirmación por persona y día. | `CORREO_MARKETING=1` + `CORREO_SECRETO` (la página es 404 mientras tanto) |
| **C · Cuenta nueva** | Al crear el usuario (`usuarios/me`, sólo si no existía) se envía la **bienvenida transaccional** (sin publicidad; clave `bienvenida/<uid>`), sólo al correo verificado, después de responder. Vincula la suscripción previa del mismo correo (misma persona, un registro) **sin cambiar su consentimiento**. El marketing es una decisión aparte: interruptor en *Configuración* del portal (`/api/correo/preferencias`, correo de la sesión, verificado). | `CORREO_TRANSACCIONAL=1` / `CORREO_MARKETING=1` |
| **D · Recomendaciones** | Tarea diaria `/api/correo/tarea` (cron de Vercel, `CRON_SECRET`): por cada persona activa con `proximo_envio_en` vencido, relee su estado, consulta el **catálogo vigente**, descarta las propiedades de sus últimos 3 envíos y manda, como mucho, 3 propiedades reales que coinciden (misma regla `coincide` que el catálogo). **Sin coincidencias no se manda nada** (la frecuencia es un máximo). Nunca un correo por visita. | `CORREO_MARKETING=1` |
**No implementado a propósito:** casilla de marketing *en el momento del registro con Google* (`/entrar` no tiene un formulario donde ponerla y tocarlo es una decisión de UX; la opción separada está en *Configuración* y se enlaza desde la bienvenida); correo de confirmación de cita y recuperación de cuenta (el flujo de citas está apagado por bandera y la recuperación la envía Firebase); envío de «baja confirmada» por correo (la confirma la página; la plantilla queda preparada).

## 4 · Consentimiento, bajas y supresión
- **Prueba del consentimiento:** versión del texto (`marketing-2026-10`), fecha, fuente, y fecha de confirmación; una suscripción **no puede estar «activa» sin ambas** (restricción en la base). El texto exacto vive en una sola constante que muestra el formulario.
- **Baja:** enlace visible en cada correo comercial + `List-Unsubscribe` y `List-Unsubscribe-Post` (un clic, RFC 8058); endpoint con token firmado, límite de peticiones, sin sesión; **funciona aunque el marketing esté apagado**; idempotente; conserva fecha y motivo.
- **No se reactiva por accidente:** volver a llenar el formulario deja la suscripción en «baja» hasta que la persona **confirme otra vez** desde el correo.
- **Supresión antes de CADA envío** (dentro de la reserva atómica): rebote permanente y queja bloquean marketing; el rebote permanente también bloquea lo transaccional; una queja no impide un aviso que la persona necesita.
- **Webhook:** firma Svix verificada en tiempo constante con el cuerpo crudo y tolerancia de 5 min; sin secreto → 503; idempotente por `svix-id`; rebote permanente/queja/suprimido → supresión + estado de la suscripción; `delivered` → estado del envío. **Free permite un solo endpoint**: este.
- **Crear una cuenta NO es aceptar marketing.** Los correos transaccionales no llevan baja de marketing ni publicidad.

## 5 · Costos y reputación
- **Topes internos:** 70/día (plan: 100), 2,000/mes en 30 días móviles (plan: 3,000), **20/día reservados a lo transaccional** (el marketing nunca los toca), un correo comercial por persona cada 3 días como máximo, lote de 25 personas por ejecución, 3 propiedades por correo. Reserva en una transacción con candado: **ni dos peticiones simultáneas rebasan el tope** (probado).
- **Pausa automática:** una queja en 7 días, o > 5 % de rebotes con al menos 20 envíos, pausa todo el marketing (la tarea devuelve «pausada»).
- **No hay reintentos en bucle:** un fallo queda en «error» y sólo se reintenta si la acción original se repite pasados 10 min; Resend deduplica 24 h con la misma clave.
- **No se garantiza que no haya cobros.** Free no tiene pago por uso (corta al llegar al tope), pero el estado de facturación debe comprobarse en el panel de Resend; el código no activa ningún plan de pago.
- **DMARC AUSENTE** (acción del propietario, ver §9): aunque estamos muy por debajo de los 5,000/día de «remitente masivo», conviene tenerlo antes de enviar marketing.

## 6 · Diseño de los correos
Una columna de 600 px, tablas y estilos en línea, rojo `#A30D12` / negro `#1A1A1A` / gris `#6B7280` / fondo `#F3F0EA`, Montserrat con Arial de respaldo, logotipo registrado sin modificar, botones con contraste (blanco sobre rojo ≈ 8:1), imágenes con `alt` y tamaño, legible sin imágenes, sin JavaScript, formularios ni contenido oculto, asuntos sin emojis ni signos de exclamación, versión de texto plano en todos. Se revisaron las capturas a 390 px, 800 px y con imágenes bloqueadas. **No probado en clientes reales** (Gmail, Outlook): sólo en Chromium; la prueba real con destinatarios internos queda para la activación.
Plantillas implementadas: solicitud de publicador, bienvenida, confirmación de suscripción, recomendaciones, baja confirmada. **No creadas** por no aportar hoy: aviso interno de lead/publicador (ya existe el actual a `informes@`), confirmación de cita (citas apagadas), recuperación de cuenta (la envía Firebase).

## 7 · Seguridad (revisada)
Clave de Resend y secreto de enlaces sólo en servidor (guardia estática; ninguna variable `NEXT_PUBLIC_` los lleva); ningún componente de cliente importa los módulos de servidor; el destinatario nunca lo elige el cliente (el único correo del formulario recibe sólo una confirmación; lo demás sale de la sesión verificada); límites de peticiones y de tamaño de cuerpo en toda escritura pública; HTML escapado y URLs `https` únicamente; los registros no llevan direcciones, cuerpos, claves ni tokens; los errores del proveedor no llegan al usuario; RLS activo sin políticas en las 4 tablas nuevas y funciones sólo para `service_role`; `/api/correo/*` con `Cache-Control: private, no-store`.

## 8 · Pruebas
Ver `docs/QA/D80_RESULTADOS.md` (resultados exactos). Cobertura: SQL (28 + 4), TypeScript con SQL real de punta a punta (14), seguridad (11), plantillas (16), envío (11), guardias estáticas (17) y páginas en navegador.

## 9 · Activación controlada (NADA de esto se ha hecho; requiere autorización específica)
1. **Aplicar la migración 36** en Supabase (reversa lista; exportar antes las tablas si se revierte).
2. **DNS (propietario):** añadir `_dmarc.vivebienn.com` TXT `v=DMARC1; p=none; rua=mailto:informes@vivebienn.com`; opcional pero recomendado: verificar un subdominio de marketing (p. ej. `correo.vivebienn.com`, 2 de 3 dominios del plan) y poner `RESEND_FROM_MARKETING`.
3. **Resend:** crear el webhook (único permitido en Free) → `https://vivebienn.com/api/correo/webhook` con `email.bounced`, `email.complained`, `email.suppressed`, `email.delivered`; guardar su secreto `whsec_…` como `RESEND_WEBHOOK_SECRET`.
4. **Vercel (Producción):** `CORREO_SECRETO` (32+ caracteres aleatorios), `RESEND_WEBHOOK_SECRET`, y por etapas `CORREO_TRANSACCIONAL=1`, luego `CORREO_MARKETING=1`; para el enlace del pie, `NEXT_PUBLIC_CORREO_RECOMENDACIONES=1` (se lee al compilar).
5. **Desplegar** el candidato (el código ya contiene todo; el cron diario `/api/correo/tarea` va en `vercel.json`).
6. **Probar sólo con destinatarios internos** y las direcciones de prueba de Resend: confirmación → baja → webhook de rebote simulado.
7. **Publicar los artículos de ayuda** de la migración 37 y actualizar «¿Cómo funcionan las alertas?».
8. **Primera semana:** observar rebotes, quejas, bajas y `GET /api/admin/salud`; la tarea se pausa sola ante señales de riesgo.
**Pausa inmediata:** `CORREO_MARKETING=0` (los envíos comerciales dejan de salir; las bajas siguen funcionando). **Rollback:** promover el deployment anterior y, sólo si hiciera falta, la reversa de las migraciones.

## 10 · Pendientes y riesgos
- Nada probado contra el Resend real (sin envíos de prueba autorizados); el formato exacto del webhook se confirmará con el primer evento.
- No se prueba en Gmail/Outlook reales.
- DMARC no existe; el webhook no existe en la cuenta.
- El texto legal (privacidad) aún no menciona el tratamiento de correo comercial: **requiere revisión humana/legal** antes de activar (no se inventaron datos legales).
- `NEXT_PUBLIC_ADMIN_EMAIL` sigue huérfana (limpieza aparte).
- Codex: **BLOCKED** (cuota hasta el 6-nov-2026); sin revisión independiente.

---

## Verificación pendiente del gate (8-oct-2026, 20:xx) — D-80 sigue PARCIAL

**Corrida oficial `npm run qa:gate` en `C:\Users\jemil\vivebien-deploy-stage-d75` (carpeta sin git):**

| Paso | Resultado |
|---|---|
| 1 typecheck | ✓ |
| 2 pruebas críticas | ✓ |
| 3 pruebas de seguridad (8 archivos, 107 pruebas) | ✓ |
| 4 escáner de secretos (690 archivos, 0 hallazgos) | ✓ |
| 5 lint (sin empeorar) | 1.ª corrida ✗ (`AccionConEnlace.tsx`: `<a>` interno; 6 avisos nuevos por imports sin uso). Corregido (usa `Link`; imports limpiados). 2.ª corrida ✓ |
| 6 build | ✓ (2.ª corrida: compilado y 55/55 páginas) |
| 7–10 navegador, axe, baselines visuales, smoke de API | **NO ejecutados**: la 2.ª corrida fue detenida por el sistema por falta de memoria al empezar el paso 7. |

Pruebas de correo fuera del gate (vitest, 10 archivos): **134 pasan, 0 fallan** (tras la corrección de lint).

**Hechos del gate comprobados al leer `scripts/qa/gate.cjs`:**
* `--desde=N` con N > 6 **se fuerza a 6** (el build se rehace siempre para no usar un `.next` viejo). Relanzar «desde 7» = pasos 6–10.
* El **E2E de correo** (`tests-visual/correo.e2e.ts`) forma parte del **paso 7** (`playwright.sesion.config.ts`, `testMatch: *.e2e.ts`). Usa **simulaciones** de la API (`page.route`), un secreto falso y **sin clave de Resend**: no puede enviar correo real. Un E2E que pase NO demuestra que el envío real funcione.
* El paso 7 corre en 4 anchos (390, 768, 1024, 1440) y el 9 usa `playwright.config.ts` (`*.visual.ts`).
* Memoria libre al comprobarlo: ≈1.7 GB de 16 GB (ChatGPT ≈1.4 GB, compresión de memoria ≈1.3 GB, Defender ≈0.4 GB). Insuficiente para build + servidor + Chromium con seguridad; **no se relanzó** y no se cerró ningún proceso.

**Pasos 1–6 y el código:** nada cambió en el código desde la 2.ª corrida de los pasos 1–6 (la última edición fue la corrección de lint, previa a esa corrida). Se repite el build igualmente al relanzar.

**Veredicto:** D-80 = **parcial** (pasos 7–10 y E2E de correo sin ejecutar). Para cerrarlo: relanzar `npm run qa:gate -- --desde=7` con memoria libre suficiente.

**2.ª comprobación de memoria (8-oct-2026):** ≈1.5 GB libres de 16 GB (ChatGPT ≈1.4 GB, compresión ≈1.2 GB, Defender ≈0.4 GB). Sin cambio respecto a la 1.ª. Se mantuvo el bloqueo: **no se ejecutó** `qa:gate -- --desde=7` ni se cerró ningún proceso. D-80 sigue PARCIAL.

**Dependencias reales de los pasos 6–10 (leídas de `scripts/qa/gate.cjs` y los `playwright*.config.ts`; sin editar nada):**
* Paso 6: `next build` con el entorno explícito (`entornoApp()`: variables públicas + las privadas VACÍAS + `SUPABASE_SERVICE_ROLE_KEY` falsa + `CORREO_MARKETING=1` + secreto falso), contra la réplica `mock-supabase` (:54399).
* Antes del 7 el gate arranca: la réplica con fixtura (`tests-visual/fixtura/publico.json`) y `next start -p 3130`, y calienta 8 rutas.
* 7 y 8 usan `playwright.sesion.config.ts` (`*.e2e.ts`, 4 anchos, 1 worker, servidor externo en :3130); 9 usa `playwright.config.ts` (`*.visual.ts`); 10 es `smoke-deployment.ts` contra :3130.
* El `.next` actual es **válido para reutilizar**: `BUILD_ID` de 19:56:57 y **ningún** archivo de `src`, `tests`, `tests-visual`, `scripts` ni de configuración es más nuevo.
* Los pasos 7–10 se pueden ejecutar por separado con los mismos comandos y el MISMO entorno explícito, pero eso sería una corrida **dirigida** (build reutilizado), no el gate oficial; el oficial rehace el build (pico de memoria más alto). Estimación de pico (NO medida): servidor + réplica + 1 Chromium ≈ 1.5–2 GB; build ≈ 2.5 GB o más.

---

## Gate oficial `npm run qa:gate -- --desde=7` (8-oct-2026, tarde) — RESULTADO: ✗ FALLÓ en el paso 7

Directorio: `C:\Users\jemil\vivebien-deploy-stage-d75` (sin git). Equipo conectado a la corriente, ≈5.2 GB libres. (Un intento previo salió con código 3 por estar en batería: no ejecutó nada.) Registro: `%TEMP%\gate_d80_oficial4.log`.

| Paso | Resultado |
|---|---|
| 6 build | ✓ (102 s, 55/55 páginas) |
| 7 navegador (Playwright, 4 anchos) | **✗** 147 pasan, **12 fallan** (30 min). Todas las fallas son de `tests-visual/correo.e2e.ts` |
| 8 axe, 9 baselines visuales, 10 smoke de API | **NO ejecutados** (el gate se detiene en el primer paso que falla) |

El resto del paso 7 pasó: publicador, revisión y cambio de cuenta (`publicador.e2e`, `revision.e2e`, `sesion.e2e`) y 9 de las 12 pruebas de correo por ancho. El E2E de correo usa **simulaciones** de la API (sin Resend real, sin clave): no prueba envío real.

### Las 12 fallas = 3 pruebas × 4 anchos (390, 768, 1024, 1440). Son NUEVAS (el E2E de correo nunca había corrido completo) y de código de D-80

**F1 y F2 · `/correo/confirmar` y `/correo/baja`: «enlace incompleto o rechazado se explica y no se pierde»** (8 fallas). Error: `locator.click: Test timeout of 60000ms exceeded … waiting for getByRole('button', { name: … })`.
* Causa PROBABLE (leído el código, no reproducida aparte): `AccionConEnlace` lee `window.location.hash` **una sola vez al montar**. La prueba abre la ruta sin `#`, y luego navega a `ruta#t=mal`: eso es un cambio de **sólo el fragmento** (misma página, sin recarga) y el componente sigue mostrando «El enlace está incompleto» y nunca pinta el botón.
* Alcance real: poco frecuente (alguien que pega el enlace del correo en una pestaña que ya tenía abierta esa misma página), pero es un defecto de comportamiento, no sólo de la prueba.
* Corrección propuesta (NO aplicada): escuchar `hashchange` en el componente (o recargar al cambiar el fragmento). La prueba no se toca.

**F3 · accesibilidad en `/recomendaciones`** (4 fallas). Axe: `link-in-text-block: 1` (impacto serio).
* Causa demostrada (regla axe + código `FormularioRecomendaciones.tsx:99`): el enlace «Aviso de privacidad» va dentro de un párrafo y se distingue del texto **sólo por el color** (`#A30D12` sobre texto gris `#6B7280`, sin subrayado). Lo introdujo el aviso de consentimiento junto al botón (v2).
* Corrección propuesta (NO aplicada): subrayar el enlace.

### Estado de D-80: **PARCIAL / BLOQUEADO POR FALLAS REALES**
Faltan: corregir F1–F3 (con aprobación), repetir el paso 7 y completar 8, 9 y 10. Sin commit, push, despliegue, migraciones ni cambios de producción.

---

## Correcciones F1–F3 y cierre del QA local (8-oct-2026, noche)

**Autorizadas por el propietario (sólo estas dos):** F1/F2 (fragmento `#`) y F3 (subrayado del aviso). Trabajo exclusivamente en `C:\Users\jemil\vivebien-deploy-stage-d75`.

**Cambios**
* `src/components/correo/AccionConEnlace.tsx`: lee el token también en `hashchange` (y lo limpia al desmontar); al cambiar el fragmento descarta el estado/mensaje del enlace anterior y **no ejecuta nada**: confirmar/dar de baja sigue exigiendo pulsar el botón. Validaciones, firmas, expiración y POST sin cambios.
* `src/components/correo/FormularioRecomendaciones.tsx`: el enlace «Aviso de privacidad» va subrayado (`textDecoration: underline`, mismo color de marca).
* `tests-visual/correo.e2e.ts`: +2 pruebas de `hashchange` (confirmar y baja: el botón aparece, **no hay POST** al cambiar el `#`, el POST sale sólo con el clic, y volver a `#` vacío regresa a «incompleto») y +1 del subrayado/foco con teclado del aviso. Las pruebas existentes no se tocaron.

**Reproducción ANTES (build sin corrección, corrida dirigida, 390 px, entorno idéntico al del gate; no es el gate oficial):** 6 fallas — 2× «enlace incompleto o rechazado», 2× `hashchange` (nuevas), subrayado (nueva) y axe `link-in-text-block`. **DESPUÉS** (build corregido, gate oficial): todas pasan en los 4 anchos.

**Gate oficial sobre el código final (dos invocaciones, mismo árbol, sin ediciones entre ellas):**

| Invocación | Pasos | Resultado |
|---|---|---|
| `npm run qa:gate -- --desde=7` | 6 build | ✓ (70 s) |
| | 7 navegador (4 anchos, incluye E2E de correo) | ✓ 171 pasan, 0 fallan, 9 omitidas |
| | 8 axe (sin empeorar) | ✓ 24 pasan |
| | 9 baselines visuales | ✓ 48 pasan |
| | 10 smoke de API | ✓ |
| `npm run qa:gate:rapido` | 1 typecheck | ✓ |
| | 2 pruebas críticas | ✓ 283 pasan |
| | 3 pruebas de seguridad | ✓ 107 pasan |
| | 4 escáner de secretos | ✓ 690 archivos, 0 hallazgos |
| | 5 lint | ✓ 63 errores (base 64), 40 avisos (base 40): sin empeorar |

* Las 9 omitidas del paso 7 son el CLS de `/entrar` en 3 de los 4 anchos (diseño de esa prueba, no es de correo). El E2E de correo: **52 pruebas ok** (13 por ancho × 4).
* **Todo el E2E de correo usa SIMULACIONES de la API** (`page.route`), un secreto falso y ninguna clave de Resend: no se envió ningún correo ni se llamó a Resend. **No hay verificación con el proveedor real.**
* Se hizo en dos invocaciones porque `--desde=7` fuerza el build y salta los pasos 1–5; el árbol era el mismo.

### Estado de D-80
* **QA local: COMPLETO** (gate oficial 1–10 en verde sobre el código final; E2E de correo en los 4 anchos en verde).
* **NO activado ni desplegado.** Sigue pendiente: revisión legal del consentimiento sin casilla, migraciones 36 y 37, variables de Vercel, webhook de Resend y su secreto, DMARC, publicar los 2 artículos de ayuda, verificación con el proveedor real en una activación controlada, y revisión independiente (Codex bloqueado hasta 2026-11-06). Sin commit, push, despliegue ni cambios de producción; D-81 sin tocar; nada integrado al repositorio principal.

---

## Paquete de activación preparado (9-oct-2026)
Ver `docs/QA/D80_PAQUETE_ACTIVACION.md` (integración con parches probados en seco, revisión de migraciones 36/37, variables, Resend/webhook/DMARC, plan de prueba controlada con reversión, ayuda, revisión legal y lista de 11 decisiones). **No se ejecutó nada.** Hallazgos nuevos: (1) `HEAD` del repo principal está por detrás de producción: el parche de D-80 aplica sobre el árbol de trabajo, no sobre `HEAD`; (2) el aviso de privacidad vigente no menciona el correo comercial; (3) DMARC no existe, el webhook de Resend no existe y la cuota del día ya tiene 8/100 usados; (4) el texto del artículo de baja no coincidía con el primer correo y se corrigió en `37-ayuda-correo.sql` (borrador, sin aplicar; `migracion-37` pasa 4/4).
