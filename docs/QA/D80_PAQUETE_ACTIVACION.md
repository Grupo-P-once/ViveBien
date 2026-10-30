# D-80 · Paquete para evaluar una activación controlada (9-oct-2026)

> **Es un PLAN. No se ejecutó nada de lo que aquí se propone:** sin commit, push, despliegue, migraciones, cambios de Vercel/DNS/Resend/webhook ni envíos.
> Las consultas externas que se hicieron fueron de **solo lectura** (Supabase, Resend, DNS público) y están marcadas «comprobado».
> **Producción NO está lista para el correo nuevo.** Faltan las verificaciones externas de la §10. Sin declaración de conformidad legal (§8).
> Código de D-80: `C:\Users\jemil\vivebien-deploy-stage-d75` (carpeta **sin git**). D-81 no se tocó.

## 1 · Estado verificado hoy

| Qué | Hecho comprobado |
|---|---|
| Copia D-80 | `vivebien-deploy-stage-d75`: sin `.git`; gate oficial 1–10 y E2E de correo en verde sobre el código final (ver `D80_CORREO_RESEND.md`). |
| Repo principal | `vivebien-next`, rama `nextjs-migration`, HEAD `f4834e5`, **274** archivos modificados/no versionados (E-35→D-76 y residuo de V-1.1.95 **sin commit**). **El código de D-80 NO está integrado ahí** (40 archivos nuevos no existen en `main`). |
| Consecuencia de integración | `HEAD` está **por detrás de producción**: `tests/e39-guardias.test.ts` ni existe en HEAD y `next.config.ts` de HEAD no contiene lo que el parche espera. **Un parche de D-80 no aplica sobre `HEAD`; aplica sobre el árbol de trabajo actual** (que contiene E-35→D-76). Antes de cualquier rama limpia habría que commitear ese trabajo previo (decisión suya). |
| Base de datos de producción (lectura) | **0** tablas y **0** funciones `correo_*`; **0** de los 2 artículos de correo; «¿Cómo funcionan las alertas?» existe y está PUBLICADO. Migraciones 36 y 37: **sin aplicar**. |
| Resend (lectura) | Dominio `vivebienn.com`: **verificado**, envío habilitado, región us-east-1, seguimiento de aperturas/clics **apagado**. **0 webhooks.** Uso: 8/100 hoy, 10/3000 en el mes (incluye mis pruebas al propietario). Contactos 0/1000. Límite de API 10 req/s. |
| DNS (lectura) | **DMARC: no existe** (`_dmarc.vivebienn.com`). SPF raíz: `include:_spf.google.com` (sólo Google). DKIM de Resend presente (`resend._domainkey`). `send.vivebienn.com`: SPF + MX de Resend presentes. |
| Vercel | Plan Hobby (un cron/día, tolerancia ±59 min; logs de ejecución 1 h). El cron nuevo sería el 2.º del proyecto: **verificar al desplegar** que el plan lo admite. |

## 2 · Propuesta de integración (sin commit)

**Archivos NUEVOS (40 en `main`):** `src/lib/correo/*` (13), `src/app/api/correo/*` (6 rutas: suscribir, confirmar, baja, webhook, tarea, preferencias), `src/app/correo/*` (confirmar, baja), `src/app/recomendaciones/page.tsx`, `src/components/correo/*` (3), `supabase/36-*.sql` + `.REVERTIR`, `supabase/37-*.sql` + `.REVERTIR`, 8 archivos `tests/correo-*.test.ts` + `tests/migracion-36/37-*.test.ts` + `tests/dobles/correo-pglite.ts`, `tests-visual/correo.e2e.ts`.

**Archivos EXISTENTES que D-80 edita (9 + gate):** `next.config.ts` (+1 línea: `/api/correo/:path*` sin caché), `vercel.json` (+cron `/api/correo/tarea`, `0 16 * * *`), `src/app/api/registro-lead/route.ts` (confirmación al publicador), `src/app/api/usuarios/me/route.ts` (bienvenida), `src/lib/limites.ts` (topes de las rutas de correo), `src/components/Footer.tsx` (enlace «Propiedades por correo», sólo si `NEXT_PUBLIC_CORREO_RECOMENDACIONES=1`), `src/components/QuieroPublicar.tsx`, `src/components/portal/ConfiguracionPortal.tsx` (preferencia de correo), `tests/e39-guardias.test.ts`, y `scripts/qa/gate.cjs` (lista de pruebas y entorno del gate).

**Ya idénticos a D-75 en `main` (no hay nada que hacer):** `docs/email-flow.md`, `playwright.sesion.config.ts`, `scripts/qa/{axe-comparar,comparar-rendimiento,escanear-secretos,guardia-produccion,lint-comparar}.cjs`, `scripts/qa/specs/gate-api.json`, `tests-visual/{axe-cierre.e2e,ayudas-panel,datos-panel,panel.visual,guardados.e2e}.ts`, `tests-visual/fixtura/publico.json`, `tests/correo-institucional.test.ts`.

**Parches preparados y PROBADOS EN SECO** (`patch --dry-run` sobre el árbol de trabajo de `main`: **todos aplican**, nada se modificó):
* `docs/QA/D80_integracion/d80_cambios_en_archivos_existentes.patch` (53 líneas cambiadas, 9 archivos).
* `docs/QA/D80_integracion/d80_gate_cjs_sobre_main.patch` (3 trozos; `gate.cjs` es un archivo no versionado en `main`).

**Procedimiento propuesto (NO ejecutado), en una rama/worktree aparte y sin tocar el árbol sucio:**
1. Decidir la base (ver §1): o bien (a) commitear primero E-35→D-76 que hoy está sin commit, o bien (b) trabajar sobre una copia del árbol de trabajo.
2. Copiar los 40 archivos nuevos (`cp -r` de las carpetas listadas; sin sobrescribir nada porque no existen).
3. `patch -p1 < docs/QA/D80_integracion/d80_cambios_en_archivos_existentes.patch` y el de `gate.cjs`.
4. Correr en esa copia: `npm run qa:gate:rapido` y, con memoria libre >4 GB y corriente, `npm run qa:gate -- --desde=7`.
5. Recién entonces, y con su autorización, commit.

## 3 · Migraciones 36 y 37 (revisadas, NO ejecutadas)

| | 36 · `correo-suscripciones` | 37 · `ayuda-correo` |
|---|---|---|
| Qué hace | Crea 4 tablas (`correo_suscriptores`, `correo_envios`, `correo_supresiones`, `correo_webhook_vistos`) y 9 funciones `correo_*` | Inserta 2 artículos de ayuda en **BORRADOR** (nadie los ve) |
| Dependencias | Ninguna tabla existente (no hay claves foráneas a tablas previas; `gen_random_uuid()` es nativo en PG 17) | Requiere las tablas de ayuda (migración 27/29) y la categoría `busquedas-y-alertas` |
| Idempotencia | `create … if not exists` / `create or replace`; en una transacción | `insert … where not exists`; reaplicable (probado dos veces en PGlite) |
| Permisos | RLS activo en las 4 tablas **sin políticas**; funciones `revoke … from public, anon, authenticated` y `grant … to service_role` | El visor sólo sirve `PUBLICADO` (probado: un anónimo no ve el borrador) |
| Impacto en datos | Cero: sólo objetos nuevos | Cero sobre artículos existentes (probado que el resto queda byte a byte igual) |
| Reversa | `36-…REVERTIR.sql` (borra 4 tablas y 9 funciones). **Antes exportar `correo_suscriptores` y `correo_supresiones`:** son la prueba de bajas y rebotes; perderlas permitiría escribir otra vez a quien ya se dio de baja | `37-…REVERTIR.sql` (borra sólo esos 2 artículos) |
| Pruebas | `migracion-36-correo.test.ts` (29) en PGlite | `migracion-37-ayuda-correo.test.ts` (4) |
| Orden | 1.º: antes de activar nada; es **compatible con el código viejo** (nadie la usa) | Después de 36; **publicar** sólo al activar |

Comprobación posterior propuesta (lectura): `select count(*) from information_schema.tables where table_name like 'correo\_%'` → 4; `select count(*) from pg_proc where proname like 'correo\_%'` → 9; `select relrowsecurity from pg_class where relname like 'correo\_%'` → todas `true`; `select count(*) from pg_policies where tablename like 'correo\_%'` → 0; prueba de que `anon` **no** puede ejecutar `correo_suscribir` (esperado: permiso denegado).

## 4 · Variables de entorno (sin valores)

| Variable | Dónde | Estado | Notas |
|---|---|---|---|
| `RESEND_API_KEY` | **Sólo servidor** | Existe (la usan los correos actuales de citas); **verificar** que esté en producción | Nunca `NEXT_PUBLIC_*` |
| `RESEND_FROM` | Sólo servidor | Opcional/existente | Remitente transaccional (`informes@vivebienn.com` por defecto) |
| `RESEND_FROM_MARKETING` | Sólo servidor | **Nueva, opcional** | Remitente sólo para lo comercial (idealmente de un subdominio dedicado, ver §5) |
| `RESEND_WEBHOOK_SECRET` | **Sólo servidor** | **Nueva** | Secreto de firma que entrega Resend al crear el webhook |
| `CORREO_SECRETO` | **Sólo servidor** | **Nueva** | HMAC de los enlaces; **≥ 32 caracteres**; si se rota, los enlaces ya enviados dejan de valer |
| `CORREO_TRANSACCIONAL` | Sólo servidor | **Nueva**, `1` = activa | Bienvenida y confirmación de publicador |
| `CORREO_MARKETING` | Sólo servidor | **Nueva**, `1` = activa | Abre `/recomendaciones`, la API de suscripción y la tarea diaria |
| `CRON_SECRET` | Sólo servidor | Existe (lo usa el cron de alertas); **verificar** | La tarea diaria responde 401 sin él |
| `NEXT_PUBLIC_CORREO_RECOMENDACIONES` | **Pública** (se incrusta al compilar) | **Nueva** | Sólo muestra el enlace del pie. **Cambiarla exige un nuevo despliegue.** |
| `SUPABASE_SERVICE_ROLE_KEY` | Sólo servidor | Existe | Ya es el único camino a las tablas nuevas |

Valores por defecto de seguridad: **todo apagado**; con las banderas ausentes el código no envía nada (probado).

## 5 · Resend, webhook, firma, DNS y DMARC (pendiente; ningún cambio hecho)

* **Webhook:** crear **un** endpoint (el plan Free admite 1; hoy hay 0): `https://vivebienn.com/api/correo/webhook`, eventos `email.bounced`, `email.complained`, `email.suppressed`, `email.delivered`. Guardar el secreto de firma sólo como `RESEND_WEBHOOK_SECRET`. El código verifica la firma (Svix) y la idempotencia por evento (`correo_webhook_vistos`).
* **DMARC (hoy inexistente):** registro TXT en Cloudflare, nombre `_dmarc`, valor propuesto `v=DMARC1; p=none; rua=mailto:informes@vivebienn.com` (sólo monitoreo). El SPF de la raíz sólo incluye a Google; Resend firma con DKIM del dominio (presente) y usa `send.` para el retorno, por lo que la alineación DMARC se apoya en DKIM. Subir a `quarantine`/`reject` sólo tras semanas de reportes limpios.
* **Subdominio de marketing (opcional, recomendado para aislar reputación):** verificar un segundo dominio en Resend (p. ej. `correo.vivebienn.com`; el plan admite 3, hay 1) y fijar `RESEND_FROM_MARKETING`. Requiere sus propios registros DNS.
* **Seguimiento de aperturas/clics:** hoy apagado; se recomienda dejarlo así (más privacidad y menos señal de spam).
* **Límites reales:** 100/día y 3 000/mes; el código se detiene en 70/día y 2 000/mes, con 20 reservados a transaccionales.

## 6 · Plan de PRUEBA CONTROLADA (no ejecutar sin autorización)

**Destinatario interno único propuesto:** `jemilianoponceperez@gmail.com` (ya autorizado para pruebas de diseño; **confirmar que vale también para la activación**). Ningún cliente real, ninguna lista.

**Fase 0 · Pre-vuelo (sin cambios):** tener autorizados los puntos 1–8 de la §9; comprobar `get-usage` (cuota del día) y que el equipo de desarrollo tenga el rollback a la mano.

**Fase 1 · Migración 36** → verificaciones de la §3. *Criterio:* 4 tablas, 9 funciones, RLS en todas, 0 políticas, `anon` sin permiso.

**Fase 2 · Desplegar el código con TODO apagado.** *Criterio:* sitio igual que antes; `/recomendaciones` → 404; `POST /api/correo/suscribir` → 404; `GET /api/correo/tarea` → 401; smoke de producción en verde; ninguna fila nueva en `correo_*`.

**Fase 3 · Transaccional (una persona):** fijar `CORREO_SECRETO` y `CORREO_TRANSACCIONAL=1`; crear **una cuenta de prueba propia** (correo verificado). *Criterio de éxito:* llega 1 bienvenida (con SPF/DKIM/DMARC visibles como «pass» en «Mostrar original» de Gmail); 1 fila `correo_envios` `enviado`; reintentar el registro **no** manda otro. *Atención:* con la bandera encendida, **cualquier persona real** que cree una cuenta durante esa ventana recibe la bienvenida (es el comportamiento previsto de un correo transaccional); si no se desea, hacer la prueba y volver a apagar.

**Fase 4 · Webhook y DMARC** (decisiones 4 y 5): crear el webhook y el registro; comprobar con el evento de prueba que el endpoint responde 200 y 401 con firma inválida.

**Fase 5 · Comercial (el mismo destinatario):** `CORREO_MARKETING=1` (+ `CRON_SECRET` verificado). Dejar `NEXT_PUBLIC_CORREO_RECOMENDACIONES` **sin** activar (el enlace del pie sigue oculto). Pedir propiedades desde `/recomendaciones` con el correo interno. *Criterios:* llega 1 correo con propiedades **reales** y vigentes; el botón «Sí, quiero seguir recibiéndolas» activa (fila `activa`, `proximo_envio_en` = +3 días); la baja con un clic funciona **también desde el cabecero** «Cancelar suscripción» de Gmail; tras la baja no sale nada más; los registros no contienen el correo ni tokens. *Exposición honesta:* con `CORREO_MARKETING=1` la ruta pública existe para **cualquiera** que conozca la URL (no hay lista blanca de destinatarios en el código); el freno son los topes (70/día, 1 por persona cada 3 días) y el límite por IP de las rutas. Si se quiere un piloto estrictamente cerrado, hay que construir una lista blanca (cambio de código + QA; ver decisión 9).

**Fase 6 · Cron:** disparar la tarea una vez (con `CRON_SECRET`) y comprobar contadores `{procesadas, enviadas, sinNovedades}`; esperar a la primera ejecución programada (16:00 UTC ±59 min).

**Límites de la prueba:** ≤ 5 correos en total; abortar ante cualquier rebote, queja o desbordo del tope.

**Reversión (de más rápida a más profunda):**
1. `CORREO_MARKETING` y `CORREO_TRANSACCIONAL` ausentes (cambio de variable + redeploy): el correo nuevo deja de salir y la ruta pública da 404. La baja funciona aunque ambas banderas estén apagadas, **mientras `CORREO_SECRETO` siga fijado** (sin él no se puede validar el enlace: por eso no se debe quitar al revertir).
2. Quitar `NEXT_PUBLIC_CORREO_RECOMENDACIONES` (redeploy) para ocultar el enlace.
3. `vercel promote` del deployment anterior (`dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z`) o rollback a `dpl_CfwgKgpGRRAniArNXymWBSEWSVXj`.
4. Borrar el webhook en Resend; quitar el registro `_dmarc` (Cloudflare).
5. Despublicar los 2 artículos (`estado = 'BORRADOR'`) o ejecutar `37-…REVERTIR.sql`.
6. `36-…REVERTIR.sql` **sólo después de exportar** `correo_suscriptores` y `correo_supresiones`.

## 7 · Centro de Ayuda: qué publicar y si coincide con el comportamiento

| Artículo | Coincide con el código | Observación |
|---|---|---|
| `como-recibir-recomendaciones-por-correo` | Sí: enlace «Propiedades por correo» (pie, sólo con la variable pública), botón **Enviarme propiedades**, primer correo con propiedades, botón **Sí, quiero seguir recibiéndolas**, máximo 1 cada 3 días, sin cuenta, activar/quitar en Configuración | El enlace del pie **no existe** hasta fijar `NEXT_PUBLIC_CORREO_RECOMENDACIONES=1`: publicar el artículo **después** de eso |
| `como-darme-de-baja-de-los-correos` | Sí, tras corregir hoy el texto: el primer correo dice «No quiero recibir correos de VIVE BIEN» y los demás «Darme de baja»; el artículo ahora nombra ambos. El botón de la página es «Darme de baja» | Corregido en `37-ayuda-correo.sql` (borrador, sin aplicar); `migracion-37` pasa |
| `como-funcionan-las-alertas` (ya PUBLICADO) | Hoy sólo habla de «Mis alertas» en el portal. **No es falso, pero puede confundirse** con las recomendaciones por correo | Texto propuesto a añadir (no aplicado): «Las alertas de una búsqueda guardada se ven en Mis alertas. Aparte, puedes pedir propiedades por correo desde «Propiedades por correo»: son dos cosas distintas.» |

Orden: 36 → desplegar → activar variables → comprobar → publicar los 2 artículos y actualizar el de alertas (autorización expresa).

## 8 · Revisión legal PENDIENTE (no se declara conformidad)

* El **consentimiento comercial sin casilla** (acto afirmativo = botón + aviso visible + «sí, seguir» explícito antes de toda campaña + baja en un clic + registro de fecha, origen y versión) es una decisión de diseño que **debe revisar un abogado** (LFPDPPP y su aviso de privacidad). Esta documentación no afirma que cumpla la ley.
* **El aviso de privacidad vigente (`/privacidad`) no menciona el correo comercial de recomendaciones:** sólo habla de avisos a su equipo («Resend: envío de los avisos por correo a nuestro equipo»), de «finalidades secundarias» y de derechos ARCO. Antes de activar hay que revisar si debe mencionar la finalidad, el proveedor, el plazo de conservación del historial de consentimientos y la forma de oponerse.
* No se guarda el texto íntegro aceptado sino su **versión** (`marketing-2026-10-v2`, definida en código); si el texto cambia, hay que subir la versión (hay prueba que lo vigila). No se guarda la IP.
* Cualquier cambio del texto de consentimiento exige nueva revisión.

## 9 · Decisiones que requieren su autorización (en orden)

1. **Base de integración:** ¿commitear antes E-35→D-76 (hoy sin commit) o integrar D-80 en una copia del árbol de trabajo? (§2). Y después: autorización de commit/push de D-80 a una rama privada.
2. **Revisión legal** del consentimiento y del aviso de privacidad: ¿quién la hace y cuándo? Sin ella, no activar el correo comercial (§8).
3. **Aplicar la migración 36** (y exportación previa en la reversa) y, después, la 37.
4. **Webhook de Resend** (endpoint y secreto) y **DMARC `p=none`** en Cloudflare.
5. **Variables de Vercel:** `CORREO_SECRETO` (≥ 32 caracteres, la genera usted), `CORREO_TRANSACCIONAL`, `CORREO_MARKETING`, y si aplica `NEXT_PUBLIC_CORREO_RECOMENDACIONES`, `RESEND_FROM_MARKETING`, `RESEND_WEBHOOK_SECRET`; confirmar que `RESEND_API_KEY` y `CRON_SECRET` existen.
6. **Subdominio de marketing** (sí/no) para aislar la reputación de la dirección institucional.
7. **Despliegue** del candidato con todo apagado (Fase 2) y, por separado, **cuándo encender** cada bandera (Fases 3 y 5).
8. **Destinatario interno** de la prueba (¿sólo `jemilianoponceperez@gmail.com`?) y el límite de ≤ 5 correos.
9. **Piloto cerrado:** ¿se construye una lista blanca de destinatarios (más código y QA) o se acepta que la ruta quede pública tras `CORREO_MARKETING=1` con topes?
10. **Publicar los artículos de ayuda** y actualizar el de alertas, una vez activo (§7).
11. **Revisión independiente:** Codex sigue bloqueado hasta 2026-11-06; ¿esperar a la cuota o aceptar la activación sin esa revisión, dejándolo registrado?

## 10 · Lo que sigue sin verificar (bloqueos)

* Revisión legal (§8) · migraciones 36/37 sin aplicar · webhook y DMARC sin crear · variables sin fijar · el cron nuevo sin probar en el plan Hobby · **ninguna prueba con Resend real del flujo de suscripción** (el E2E usa simulaciones; sólo se enviaron correos de diseño al propietario) · entregabilidad real (SPF/DKIM/DMARC en Gmail) sin medir · Codex bloqueado.

---

# ANEXO · Base segura de integración (diagnóstico del 9-oct-2026, SOLO LECTURA)

> No se modificó ningún archivo de aplicación, no se aplicó ningún parche, no hubo commit, push, despliegue, migración ni cambio externo. Sólo se leyó: git local, el árbol de archivos real de Vercel (`vercel api …/files`, un GET) y Supabase (SELECT).
> Reproducible: `docs/QA/D80_integracion/compara_base.cjs` y `residuo_head.cjs` (sólo GET) y la salida `comparacion_base_2026-10-09.json`.

## A · Qué es producción (demostrado por contenido, no por suposición)
Los alias `vivebienn.com` y `www.vivebienn.com` apuntan hoy a `dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z` (D-78). Se comparó el sha1 de **cada uno de los 382 archivos fuente** de ese deployment contra cuatro árboles (tal cual, LF y CRLF):

| Árbol | Iguales a producción | Distintos | Faltan | Qué significa |
|---|---|---|---|---|
| **`vivebien-deploy-stage-d75-final`** | **382 / 382** | 0 | 0 | **Es exactamente la fuente de producción** (+353 archivos no desplegados: pruebas, docs, SQL) |
| `vivebien-deploy-stage-d75` (con D-80) | 374 / 382 | 8 | 0 | Producción + exactamente los 8 archivos que D-80 edita (`next.config.ts`, `vercel.json`, `registro-lead`, `usuarios/me`, `limites`, `Footer`, `QuieroPublicar`, `ConfiguracionPortal`) |
| Árbol de trabajo de `vivebien-next` | 375 / 382 | 7 | 0 | Producción **+ el residuo de V-1.1.95** (7 archivos: `globals.css`, `propiedades/page-client.tsx`, `propiedades/[id]/page-client.tsx`, `PropertyCard.tsx`, `acceso/Entrar.tsx`, `portal/PortalShell.tsx`, `lib/asignar-slug.ts`) |
| **`HEAD` (`f4834e5`)** | **262 / 382** | **94** | **26** | **Sin E-35→D-76** (y sin esos archivos nuevos): ≈120 archivos de producción no están en el commit |

Conclusiones comprobadas:
1. **El árbol de trabajo NO equivale a producción:** difiere en 7 archivos, todos del residuo de V-1.1.95, que producción no contiene (para esas 7 rutas ni `HEAD` ni el árbol de trabajo coinciden con producción: la versión de producción sólo existe en `-final`).
2. **Lo que falta en `HEAD` y sí está en producción** (≈120 archivos: 94 modificados + ≈26 nuevos) **está en el árbol de trabajo sin commit**: E-35→E-39, D-75 (guardados), D-76 (correo institucional) y la fase 3 (`/entrar`, ayuda), tal como se promovió en D-78.
3. **«Documentado pero no integrado en git»:** esas mismas ≈120 piezas, la migración 35 (`supabase/35-*.sql`, **ya aplicada en producción**, D-79) y su prueba, `docs/QA/*`, `scripts/qa/*` (gate y utilidades), `tests-visual/guardados.e2e.ts` y `docs/DECISIONS.md` con D-75→D-81.
4. **Diferencias de contenido entre `-final` y el árbol de trabajo** (ignorando CRLF/LF): los 7 del residuo, `docs/DECISIONS.md`, `docs/email-flow.md`, `playwright*.config.ts`, `scripts/qa/baselines.cjs`, `tests/qa021-sql.test.ts`, `tests-visual/{axe-cierre.e2e.ts,sitio-publico.visual.ts,fixtura/publico.json}` y las capturas de referencia: infraestructura de QA y documentación, no código desplegado.
5. **Historia:** rama `nextjs-migration`, `HEAD` = `privado/nextjs-migration` (0/0 contra la referencia local; **no se hizo `git fetch`**, así que el estado remoto real no se comprobó). `origin` (`ViveBien`) está 138 commits por detrás (remoto antiguo). Los tres `deploy/*` y `hotfix/v1.1.76` son líneas viejas (4–101 commits aparte), sin E-35+. El árbol de trabajo tiene 138 archivos modificados y ≈418 sin versionar.

## B · Base recomendada
**La fuente de producción es `vivebien-deploy-stage-d75-final`**: es la única que coincide al 100 % (382/382) y por hash con `dpl_99T2…`. No es el árbol de trabajo ni `HEAD`.

## C · Alternativas
| | Qué es | Ventajas | Riesgos |
|---|---|---|---|
| **1 · Rama de integración desde producción** (recomendada para el repo) | Worktree nuevo desde `HEAD`; commit A = la fuente de producción (`-final`), verificado 382/382; commits siguientes = D-80 | El repo vuelve a decir la verdad; reproducible y verificable (mismo script de hashes); no toca el árbol sucio ni el residuo | Commit A grande (~120 archivos + normalización CRLF/LF); requiere autorización de commit; hay que decidir qué no desplegado (tests/docs) se incluye |
| **2 · Commitear el árbol de trabajo en `nextjs-migration`** | Selección de archivos entre 274 sucios | Conserva la historia donde ya está | **Mezcla el residuo de V-1.1.95** con lo promovido; fácil olvidar o incluir algo; modifica el índice del árbol sucio; `HEAD` quedaría ≠ producción |
| **3 · Parchar D-80 sobre el árbol de trabajo y desplegar desde ahí** | Lo más directo | Rápido | **Rechazada:** desplegar subiría las 7 piezas de V-1.1.95 (lección E-29); no reproducible |
| **4 · Candidato de despliegue = `-final` + D-80 con el armador fail-closed** | El proceso ya usado en D-75/D-77 (staging verificado contra el payload esperado) | Probado en producción; garantiza «producción + exactamente D-80»; no depende del estado del repo | No arregla la deuda del repo; hay que escribir un `armar_stage_d80` nuevo |

**Orden recomendado:** (i) **Alternativa 4** para el despliegue (es lo que protege a producción); (ii) **Alternativa 1** para reconciliar el repo, antes o en paralelo, de modo que D-80 quede como commits sobre una base idéntica a producción; (iii) el residuo de V-1.1.95 se queda donde está (árbol de trabajo) hasta decidir su destino, sin tocarlo.

## D · Los parches de D-80 sobre la base correcta
Sobre **`-final`** (base recomendada): `patch --dry-run` de `d80_cambios_en_archivos_existentes.patch` → **9 archivos, todos «checking file», sin rechazos (rc 0)**; las carpetas nuevas (`src/lib/correo`, `src/app/api/correo`, `src/app/correo`, `src/app/recomendaciones`, `src/components/correo`) **no existen** en `-final` (no hay choques). `scripts/qa/gate.cjs` no existe en `-final`: viene del árbol de trabajo (su parche aplica sobre ese).
Sobre **`HEAD`**: **falla 1 hunk en `next.config.ts` y `tests/e39-guardias.test.ts` ni existe**; otros aplican con desplazamientos o fuzz: **por eso no sirve como base**. En el árbol de trabajo todos aplican, pero arrastraría el residuo.

## E · Secuencia propuesta (todo requiere su autorización; nada hecho)
1. Decidir Alternativas 4 + 1 (o sólo 4).
2. Crear el worktree/rama y el commit A; **verificar con `compara_base.cjs` que coincide 382/382**.
3. Aplicar los 40 archivos nuevos + el parche + `gate.cjs`; commit(s) de D-80.
4. En ese árbol: `npm run qa:gate:rapido` y `npm run qa:gate -- --desde=7` (corriente, >4 GB libres).
5. Armar el candidato (Alternativa 4) y verificarlo contra el payload esperado; **no promover**.
6. Sólo con autorización: migración 36, variables, webhook/DMARC y la Fase 2 del plan de prueba.

## F · Confirmaciones (lectura, 9-oct-2026)
* Migraciones 36 y 37 **sin aplicar**: 0 tablas `correo_*`, 0 funciones `correo_*`, 0 artículos de correo en producción.
* Datos sin cambios respecto a la promoción: usuarios 11, propiedades 10, fotos 119. Producción sigue en `dpl_99T2…` en ambos dominios.
* **No se modificó nada** (archivos de aplicación, git, Vercel, Supabase, Resend, DNS). Los únicos archivos escritos son esta documentación y las copias de las herramientas de lectura en `docs/QA/D80_integracion/`.
* **Información que falta:** el estado real de `privado/nextjs-migration` (no se hizo fetch) y qué piezas no desplegadas (tests/docs) conviene incluir en el commit A.

---

# ANEXO 2 · Preparación aislada autorizada (9-oct-2026) — SIN commits, push, migraciones ni despliegues

> Autorizado: `git fetch` de solo lectura del remoto `privado` y preparar worktrees/copias aisladas. **No** autorizado y **no hecho**: commits, push, merge, rebase, migraciones, cambios externos, despliegues, activación del correo, credenciales reales de Resend.
> El árbol principal `C:\Users\jemil\vivebien-next` **no se tocó**: sigue en `nextjs-migration`, `HEAD f4834e5…`, con los mismos **274** cambios (antes y después).

## Fase 1 · Remoto (resultado)
| | SHA |
|---|---|
| `HEAD` local (`nextjs-migration`) | `f4834e5d49f90dd3cc5e5634723c80487cefcfb6` |
| `privado/nextjs-migration` (referencia local, antes del fetch) | `f4834e5` |
| `privado/nextjs-migration` **en el remoto** (`git ls-remote`, después del fetch) | `f4834e5d49f90dd3cc5e5634723c80487cefcfb6` |
| `privado/deploy/centro-ayuda` · `deploy/google-fix` · `hotfix/v1.1.76` | `3e2d820eae60…` · `72c4c90c9468…` · `c4a32be8d09e…` (sin cambios frente a las referencias locales) |

`git rev-list --left-right --count privado/nextjs-migration...HEAD` → **0 0**. **El remoto no contiene cambios inesperados:** ningún commit nuevo, ninguna rama nueva. El fetch (`--no-tags`, `gc.auto=0`) sólo pudo actualizar referencias `refs/remotes/privado/*`, que no cambiaron; no tocó el árbol de trabajo, la rama ni el índice. **Consecuencia:** el remoto no tiene E-35→D-78; el trabajo previo vive **sólo** en el árbol local sin commit (un solo punto de fallo hasta que se commitee).

## Fase 2 · Worktree de reconciliación (`C:\Users\jemil\vivebien-integracion-d78`)
* Creado con `git worktree add --detach … HEAD` (sin rama nueva, sin commit). `HEAD` del worktree = `f4834e5`.
* Se superpuso la fuente de producción `vivebien-deploy-stage-d75-final` con `robocopy /E` **sin purga** (excluye `.armar_stage_marca`, `node_modules`, `.next`, `.vercel`, pruebas).
* **Verificación 382/382 repetida en esta sesión:** `verificar_arbol.cjs` (GET de `vercel api …/files` de `dpl_99T2…`, alias `vivebienn.com` y `www` → `dpl_99T2…`): **`-final`: 382/382; worktree tras la superposición: 382/382** (0 distintos, 0 faltantes).
* Además se añadió lo necesario para una historia reproducible de E-35→D-79 (copiado de d75, que **no** contiene el residuo, o del repo principal en sólo lectura): `scripts/qa/*` (con el `gate.cjs` **previo a D-80**), `tests-visual/*` (infraestructura, `guardados.e2e.ts`, fixtura, capturas de referencia), `playwright.config.ts`, `playwright.sesion.config.ts`, la **migración 35** (+ reversa + prueba, ya aplicada en producción por D-79) y `docs/QA/*` previa a D-80 (sin `D80_*` ni `D81_*`).
* **Residuo de V-1.1.95:** las 7 rutas (`globals.css`, 2 × `page-client.tsx` de propiedades, `PropertyCard`, `acceso/Entrar`, `portal/PortalShell`, `lib/asignar-slug`) **valen exactamente lo que producción** en el worktree. No se tocaron en el árbol principal.
* Estado del worktree frente a `HEAD`: 135 modificados + 111 sin versionar (= E-35→D-79 pendiente de commit). Re-verificado **382/382** tras añadir la infraestructura.
* Archivos de `HEAD` que **no** están en la fuente desplegada y se conservan como están: `.claude`, `.env.example`, `.github`, `.gitignore`, `.mcp.json`, `AGENTS.md`, `CLAUDE.md`, `PRODUCCION.md`, `README.md`, `docs/design`, `docs/fase-3/capturas`, `seed-sanjuan.*`, 2 `scripts/respaldo-*.json`.
* **Fuera a propósito** (a decidir): `docs/DECISIONS.md` (la versión del árbol principal ya trae las entradas D-80 y D-81), `docs/QA/D80_*`, `docs/QA/D81_*`, `skills-lock.json`, `.claude/skills/*` nuevas.

## Fase 3 · Candidato D-80 (`C:\Users\jemil\vivebien-candidato-d80`, copia simple, sin git)
Construido **desde el worktree verificado** + únicamente D-80:
* **40 archivos nuevos** (23 rutas): `src/lib/correo`, `src/app/api/correo`, `src/app/correo`, `src/app/recomendaciones`, `src/components/correo`, `supabase/36-*` y `37-*` (+ reversas), 8 `tests/correo-*.test.ts`, `tests/dobles/correo-pglite.ts`, `tests/migracion-36/37-*.test.ts`, `tests-visual/correo.e2e.ts`, y la documentación `docs/QA/D80_*`.
* **11 archivos existentes modificados** con los parches ya probados: `next.config.ts`, `vercel.json`, `registro-lead/route.ts`, `usuarios/me/route.ts`, `limites.ts`, `Footer.tsx`, `QuieroPublicar.tsx`, `ConfiguracionPortal.tsx`, `tests/e39-guardias.test.ts`, `scripts/qa/gate.cjs` y `docs/email-flow.md`. `patch` los aplicó **sin rechazos ni archivos `.orig`/`.rej`**.
* **Verificaciones del candidato:**
  * Contra producción: **374/382 iguales; los 8 distintos son exactamente** `next.config.ts`, `registro-lead`, `usuarios/me`, `Footer`, `QuieroPublicar`, `ConfiguracionPortal`, `limites` y `vercel.json` — **ninguna de las 7 rutas del residuo**. Es decir, **producción + D-80, sin V-1.1.95**.
  * Contra la copia D-80 (`vivebien-deploy-stage-d75`): **todos los archivos de D-80 son idénticos** (ignorando CRLF/LF); sólo difieren archivos que no son de D-80 (documentación, `.claude`, migración 35, capturas, etc.).
  * Se le copiaron `node_modules` y `.env.local` de la copia D-80 (sólo local; el gate vacía toda variable no pública).
* **No se usó ninguna credencial de Resend ni se activó el correo.**

## Pruebas: PENDIENTES (no se ejecutaron `qa:gate:rapido` ni `qa:gate -- --desde=7` sobre el candidato)
Bloqueo comprobado al terminar la preparación: **equipo en batería** (`PowerLineStatus: Offline`; el gate se niega a correr los pasos de navegador) y **≈0.8 GB de RAM libre** (la corrida anterior fue detenida por el sistema con ~1.5 GB). No se forzó nada ni se cerró ningún proceso.
Para continuar: conectar el cargador, liberar memoria (>4 GB libres) y ejecutar en `C:\Users\jemil\vivebien-candidato-d80`: `npm run qa:gate:rapido` y después `npm run qa:gate -- --desde=7` (que rehace el build).

## Riesgos restantes
1. **Todo E-35→D-79 sigue sin commit** y el remoto no lo tiene: un solo punto de fallo hasta que se commitee (decisión suya).
2. El candidato es una copia sin git: la verificación de «producción + D-80» descansa en los hashes (382/374), no en un commit. Antes de desplegar hay que volver a verificarlo con el armador fail-closed.
3. Gate sin ejecutar sobre el candidato: hasta entonces no hay evidencia de que el ensamblado (base verificada + parches) pase igual que la copia D-80.
4. El árbol principal conserva el residuo de V-1.1.95 y `DECISIONS.md` con entradas D-80/D-81 que no están en el candidato.

## Siguiente decisión necesaria
1. Conectar el equipo y liberar memoria para ejecutar el gate sobre el candidato (se ejecuta con su aviso).
2. Después, su decisión sobre: commit del worktree de reconciliación (commit A = producción) y de D-80 por separado; qué documentación no desplegada incluir; y si se arma el candidato de despliegue con el armador fail-closed (sin promover).

---

## Resultado del QA del candidato D-80 (`C:\Users\jemil\vivebien-candidato-d80`, 9-oct-2026)

Equipo conectado a la corriente, 3.5–4.3 GB de RAM libre. Sin commits, push, migraciones, despliegues, activación del correo ni credenciales de Resend. Árbol principal intacto (274 cambios).

### `npm run qa:gate:rapido` (pasos 1–5)
| Corrida | Resultado |
|---|---|
| 1.ª | ✗ paso 3 (89 pruebas): `tests/guardia-produccion.test.ts` → `ENOENT … tests\performance\k6\helpers`. **Causa demostrada:** al ensamblar la base omití `tests/performance/k6` y `qa-performance.sh` (infraestructura de QA que existe en la copia D-80 y en el árbol principal, no en `-final`). Pasos 1 y 2 sí habían pasado. |
| Corrección | Se añadieron esos archivos (copia de `vivebien-deploy-stage-d75`) al candidato **y** al worktree de reconciliación. Es un hueco del ensamblado, no un cambio de código de aplicación. |
| 2.ª | ✓ **TODO OK**: tsc ✓ · 283 pruebas críticas ✓ · 107 de seguridad ✓ · escáner de secretos 732 archivos, 0 hallazgos ✓ · lint 63 errores (base 64), 40 avisos (base 40): sin empeorar ✓ |

### `npm run qa:gate -- --desde=7` (pasos 6–10; el script rehace el build)
| Corrida | Resultado |
|---|---|
| 1.ª | **Sin veredicto.** Build ✓ (75 s). El paso 7 se cortó al llegar a la prueba 143 de 180 **sin imprimir resumen ni «FALLÓ»**; no quedó ningún proceso. Antes se vio una espera agotada de 60 s en `guardados.e2e.ts` (390 px) al abrir `/entrar` (`page.goto … waitUntil: load`), con un archivo **idéntico** al de la copia D-80 donde pasó. **Causa no demostrada** (hipótesis: latencia de recursos de terceros, ya descrita en el comentario de `playwright.sesion.config.ts`; y el proceso fue terminado desde fuera, posiblemente por presión de memoria; no hay evidencia directa). No se cuenta como aprobada ni como fallida. |
| 2.ª | ✓ **`qa:gate: TODO OK`** (fin 10:47:00) |

Detalle de la 2.ª corrida:
* **6 build** ✓ (27 s).
* **7 navegador** ✓ — **169 pasan, 9 omitidas, 2 «flaky»** (fallan una vez por espera de 60 s y pasan al reintentar; `QA_REINTENTOS=2` del gate): `guardados.e2e` («guardar en el catálogo → Mis guardadas…») y `publicador.e2e` («publicador normal: /admin/usuarios…»), ambas en 390 px. **El E2E de correo (13 pruebas × 4 anchos) pasó sin reintentos.** Las 9 omitidas son el CLS de `/entrar` por diseño.
* **8 axe (sin empeorar)** ✓ — 1 flaky (`axe · ficha-pausada`, 1440 px, pasó al reintentar).
* **9 baselines visuales** ✓ — **46 pasan, 2 flaky** (`panel · notificaciones abiertas`, 390 px, y otra, pasaron al reintentar).
* **10 smoke de API** ✓ — 14 comprobaciones PASS (salud, rutas protegidas 401/405/404, catálogo, ficha pausada 404, sitemap).
* **Todo con simulaciones** (API de correo y Google simuladas, secreto falso, sin clave de Resend): ningún correo salió y no se llamó a Resend.

### Estado del candidato
* **Contenido (hashes):** contra producción `dpl_99T2…`: **374/382 iguales, los 8 distintos son los de D-80**, ninguno del residuo de V-1.1.95; el worktree de reconciliación sigue en **382/382**.
* **QA local del candidato: COMPLETO** (rápido + oficial 6–10 en verde, con 5 pruebas «flaky» que pasaron al reintentar, ninguna de correo).
* **Sigue sin hacerse:** commits (reconciliación y D-80), armado del candidato de despliegue con el armador fail-closed, migraciones 36/37, variables, webhook/DMARC, revisión legal, verificación con Resend real, revisión independiente (Codex bloqueado). **NO es una autorización de despliegue.**

### Riesgos restantes de esta fase
1. La 1.ª corrida del paso 7 se interrumpió sin explicación comprobada; la 2.ª pasó. Hay latencia de terceros que genera «flaky» (5 en total): hay que seguir contando con los reintentos.
2. El candidato es una copia sin git: su garantía son los hashes; antes de desplegar hay que volver a armarlo y verificarlo con el armador fail-closed contra el payload aprobado.
3. Todo E-35→D-79 sigue sin commit y fuera del remoto.

---

# ANEXO 3 · Plan de commits y del armador fail-closed (9-oct-2026) — NADA EJECUTADO

> **Sin commits, push, merge, rebase, migraciones, despliegues ni cambios externos.** El árbol principal `vivebien-next` no se tocó (274 cambios, igual que antes). En las copias aisladas sólo se ajustó `docs/DECISIONS.md` (ver §3).
> Manifiestos completos (rutas exactas) en `docs/QA/D80_integracion/`: `commitA_archivos.txt` (324 rutas) y `commitB_archivos.txt` (60 rutas).

## 1 · Estado de las dos copias aisladas
| Copia | Qué es | Verificado (hoy, contra `dpl_99T2…`) |
|---|---|---|
| `C:\Users\jemil\vivebien-integracion-d78` | Worktree git **detached en `f4834e5`** (= `privado/nextjs-migration` en el remoto), con la fuente de producción + infraestructura de QA + migración 35 superpuestas | **382/382** |
| `C:\Users\jemil\vivebien-candidato-d80` | Copia simple (sin git) = lo anterior + D-80 | **374/382**; los 8 distintos son los 8 archivos que D-80 edita; **ninguno** del residuo de V-1.1.95 |

## 2 · Plan de commits (a ejecutar SÓLO con aprobación expresa; en el worktree, no en el árbol principal)

### Commit A — «base de producción verificada + reconciliación E-35→D-79» (324 rutas: 135 modificadas, 189 nuevas)
Contenido (en `commitA_archivos.txt`):
* **Código de producción** (la fuente de `dpl_99T2…`, 382 archivos): `src/*` (≈120 piezas que `HEAD` no tiene: E-35→E-39, D-75, D-76, fase 3), `next.config.ts`, `package.json`, `package-lock.json`, `.vercelignore` (el de inclusión usado al armar stages; **decisión**).
* **Las 7 rutas del residuo, en su versión DE PRODUCCIÓN** (no la de V-1.1.95): `globals.css`, `propiedades/page-client.tsx`, `propiedades/[id]/page-client.tsx`, `PropertyCard.tsx`, `acceso/Entrar.tsx`, `portal/PortalShell.tsx`, `lib/asignar-slug.ts`.
* **Pruebas** (60): `tests/*` de E-35→D-79 (incluye `favoritos-*`, `correo-institucional`, `e39-*`, `qa021-sql`, `migracion-35-*`), `tests/performance/*` (32: scripts de k6 y utilidades que `guardia-produccion.test.ts` revisa).
* **Migraciones:** `supabase/34-*` ya estaba; se añaden **`35-ayuda-guardados.sql` y su `.REVERTIR.sql`** (la 35 está **aplicada** en producción desde D-79) y el resto de lo que la fuente de producción trae (16 en `supabase/`).
* **QA reproducible:** `scripts/qa/*` (13, con el `gate.cjs` **previo a D-80**), `tests-visual/*` (infraestructura, `guardados.e2e.ts`, fixtura, 23 capturas de referencia), `playwright.config.ts`, `playwright.sesion.config.ts`.
* **Documentación:** `docs/QA/*` (35 archivos previos a D-80: cierres, candidatos, promoción, migración 35 aplicada, diagnósticos), `docs/adr/*`, y **`docs/DECISIONS.md` truncada en D-79** (ver §3).

### Commit B — «D-80: correo con Resend (apagado por defecto)» sobre A (60 rutas: 48 nuevas, 12 modificadas)
* **Nuevas (48):** `src/lib/correo/*` (13), `src/app/api/correo/*` (6 rutas), `src/app/correo/*` (2), `src/app/recomendaciones/page.tsx`, `src/components/correo/*` (3), `supabase/36-*` y `37-*` con sus reversas (4), 7 × `tests/correo-*.test.ts`, `tests/dobles/correo-pglite.ts`, `tests/migracion-36-correo.test.ts`, `tests/migracion-37-ayuda-correo.test.ts`, `tests-visual/correo.e2e.ts`, y `docs/QA/D80_*` + herramientas/parches de `docs/QA/D80_integracion/` (8).
* **Modificadas (12):** `next.config.ts` (+1), `vercel.json` (+cron), `registro-lead/route.ts`, `usuarios/me/route.ts`, `limites.ts`, `Footer.tsx`, `QuieroPublicar.tsx`, `ConfiguracionPortal.tsx`, `tests/e39-guardias.test.ts`, `scripts/qa/gate.cjs`, `docs/email-flow.md`, **`docs/DECISIONS.md` (+ la entrada D-80, sin D-81)**.

### Excluidos de A y B (y por qué)
| Elemento | Tratamiento propuesto |
|---|---|
| **Residuo de V-1.1.95** en el árbol principal (7 rutas con su versión nueva) | **Excluido.** Se queda sin commit donde está. A usa la versión de producción. |
| **D-81** (`docs/QA/D81_*`, entrada D-81 de `DECISIONS.md`, cambios en `vivebien-deploy-stage-d81`) | **Excluido** (no autorizado integrarlo). |
| `docs/DECISIONS.md` | A = hasta D-79 (778 líneas; **`HEAD` termina en D-46: A añade las entradas D-47→D-79, hoy sin commit**); B añade sólo D-80. D-81 queda fuera. |
| `docs/QA/D80_*` y `D80_integracion/` | Sólo en B. **Decisión:** estos documentos nombran a D-81 y a la dirección personal de pruebas del propietario; antes de commitear conviene sanearlos. |
| `.claude/skills/*` (nuevas y modificadas), `.agents/`, `.mcp.json`, `AGENTS.md`/`CLAUDE.md`/`README.md` con cambios locales, `skills-lock.json` | **Excluidos de A y B**: son herramientas del asistente y notas; las skills activas no se modifican sin su aprobación. Hay que decidirlos aparte. |
| `.env.local`, `node_modules`, `.next`, `test-results`, `next-env.d.ts`, `tsconfig.tsbuildinfo` | **Nunca** se versionan (sólo existen en el candidato para correr el gate). |
| `docs/fase-3/*` (≈140) y `tests/performance` extra del árbol principal | Fuera salvo lo que ya trae la fuente de producción. |

### Comprobaciones hechas sobre el plan
* **Migración 35 y QA necesarios para reproducir la historia:** incluidos en A (35 + reversa + prueba, `scripts/qa/*`, `tests-visual/*`, `playwright*.config.ts`, `tests/performance/*`). El hueco que se detectó (faltaba `tests/performance/k6`) ya quedó corregido en ambas copias y A lo lista.
* **Sin residuo ni D-81 en A:** `grep` de `D-81`, `VB-2026-00027` y `D81_` en el worktree → **0 coincidencias**; las 7 rutas del residuo valen producción.
* **Direcciones personales:** las que aparecen en `docs/` de A (`joseponcer@…`) son **históricas** (documentan el cambio al correo institucional en D-76). En B aparecen `jemilianoponceperez@…` en los documentos D-80 (destinatario de pruebas): **decisión** de sanear.

## 3 · Ajuste hecho en las copias aisladas (no en el árbol principal)
`docs/DECISIONS.md` del worktree = la del árbol principal **truncada antes de «D-80»** (75 entradas `## D-…`); la del candidato = esa + sólo la entrada D-80 (76). Verificado: D-81 no aparece en ninguna de las dos. Copia previa del worktree: `%TEMP%\DECISIONS_R_antes.md`.

## 4 · El armador fail-closed: procedimiento real (leído de `armar_stage_d75.py` y `armar_stage.py`; **no ejecutado**)
**No exige una fuente Git comprometida.** Trabaja con tres carpetas y comprobaciones por hash, y falla cerrado:
1. **Base** = el stage anterior verificado: `vivebien-deploy-stage-d75-final`, cuyo manifiesto (`stage_manifest_d75.json`, sha256 **`0282b61a…`**) y payload (`payload_esperado_d75.json`, sha256 **`fc8156d9…`**) coinciden con los aprobados en D-77/D-78 (recalculados hoy: coinciden) y con el **árbol real de producción** (`dpl_99T2…`, vía `vercel api …/files`).
2. **Trabajo** = el candidato (`vivebien-candidato-d80`). Sólo se admite un diff contra la base dentro de una **lista cerrada** de carpetas (`src/`, `next.config.ts`, `package*.json`, `tests/*.ts`) y se **exige** que sea exactamente el esperado (si sobra o falta algo, aborta antes de escribir).
3. **Destino** = una carpeta nueva (`…-d80-final`) con marca; nunca el repo ni las copias de trabajo; sin enlaces simbólicos; escaneo de secretos (aborta si hay).
4. Comprueba que `vivebienn.com` y `www` siguen en `dpl_99T2…` y que está `PROMOTED`.
5. Después de `vercel deploy --prod --skip-domain` (acción **no autorizada aún**), un verificador compara el árbol real del deployment contra el payload aprobado y exige `STAGED` y sin dominios propios.

**Lo que hay que hacer para D-80 (preparación, sin ejecutar):** clonar `armar_stage_d75.py` → `armar_stage_d80.py` y `verificar_deployment_d80.py` con: `BASE = …\vivebien-deploy-stage-d75-final`, `TRABAJO = …\vivebien-candidato-d80`, `STAGE = …\vivebien-deploy-stage-d80-final`, `ACTUAL = dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z`, `MANIFIESTO_BASE = 0282b61a…`, `PAYLOAD_BASE = fc8156d9…`, **y ampliar `candidato()` para admitir `vercel.json`** (hoy no entra en la lista cerrada y es el cron). Diff esperado (cerrado): **9 modificados** (`next.config.ts`, `vercel.json`, `registro-lead`, `usuarios/me`, `Footer`, `QuieroPublicar`, `ConfiguracionPortal`, `limites`, `tests/e39-guardias.test.ts`) y **34 nuevos** (25 en `src/` + 9 `tests/*.ts`). `supabase/*`, `tests/dobles`, `tests-visual` y la documentación no viajan en el payload (la inclusión de `.vercelignore` sólo despliega `src`, `public`, `package*.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs` y `vercel.json`).
**Bloqueo:** ninguno técnico. Hace falta su autorización expresa para (a) ejecutar el armador, (b) cualquier `vercel deploy`, aunque sea `--skip-domain`.

## 5 · Verificaciones obligatorias (estado)
| Verificación | Resultado |
|---|---|
| Hashes de los 382 archivos de producción | `-final` **382/382**; worktree **382/382**; candidato **374/382** (8 esperados) |
| D-80 aporta sólo lo aprobado | Sí: diff candidato↔worktree = 48 nuevos + 12 modificados (lista exacta en `commitB_archivos.txt`); `patch` sin rechazos |
| Sin residuo de V-1.1.95 | Sí: ninguna de las 7 rutas difiere de producción en el candidato |
| Sin D-81 | Sí: 0 coincidencias en código y `DECISIONS.md`; **los documentos `D80_*` sí lo nombran** (referencia, no código; ver decisión de sanear) |
| `CORREO_MARKETING` y `CORREO_TRANSACCIONAL` desactivados | Sí: el candidato **no** trae esas variables (`.env.local` sin `CORREO_*`/`RESEND_*`/`CRON_SECRET`); el código las lee apagadas por defecto (prueba `correo-enviar`: «por defecto todo está apagado», 2/2 y las guardias); el `1` sólo existe en el entorno del servidor de pruebas del gate, con un secreto falso, y no viaja en el payload |
| Gate sobre el candidato | `qa:gate:rapido` ✓ · `qa:gate -- --desde=7` ✓ (2.ª corrida; 5 «flaky» que pasaron al reintentar) |
| Resend real / correos | **Ninguno**: no se usaron credenciales ni se envió nada |

**El candidato NO está listo para producción:** sólo tiene pruebas locales y hashes correctos; falta el armado fail-closed, la verificación del deployment real, las migraciones, las variables, el webhook/DMARC, la revisión legal y la prueba con Resend real.

## 6 · Errores registrados (ERROR / CONTEXTO / CAUSA / SOLUCIÓN / PREVENCIÓN)
**E-42 · El candidato ensamblado falló el paso 3 del gate**
* ERROR: `qa:gate:rapido` → `tests/guardia-produccion.test.ts`: `ENOENT … tests\performance\k6\helpers`.
* CONTEXTO: se armó el candidato como `-final` + infraestructura de QA + D-80, a mano.
* CAUSA (demostrada): al elegir la infraestructura omití `tests/performance/k6` y `qa-performance.sh`, que existen en la copia D-80 pero no en `-final`.
* SOLUCIÓN: copiados a candidato y worktree; el gate rápido pasó.
* PREVENCIÓN: el manifiesto de A (`commitA_archivos.txt`) ya los lista; y, al ensamblar una base, comparar **todo** el árbol contra la copia que ya pasó el gate (`diff -rq`), no sólo las carpetas que se creen necesarias.

**E-43 · Corrida del paso 7 interrumpida sin resumen**
* ERROR: la 1.ª corrida de `qa:gate -- --desde=7` sobre el candidato terminó (código 1) en la prueba 143/180, sin «FALLÓ» ni resumen.
* CONTEXTO: antes hubo una espera agotada de 60 s en `guardados.e2e` (390 px) al abrir `/entrar`.
* CAUSA: **no demostrada**. Hipótesis: latencia de recursos de terceros (ya documentada en la config) y terminación externa del proceso (posible presión de memoria). Sin evidencia directa.
* SOLUCIÓN: repetir; la 2.ª corrida pasó con 5 pruebas «flaky» que pasaron al reintentar.
* PREVENCIÓN: no contar una corrida sin resumen como resultado; registrar hora de inicio/fin y memoria libre; mantener los reintentos del gate.

## 7 · Riesgos
1. **Todo E-35→D-79 sigue sin commit y fuera del remoto** (un solo disco). Mientras no exista el Commit A, cualquier fallo del equipo lo pierde (existen además el `-final` y la copia D-80).
2. El Commit A es grande (324 rutas, ≈120 de código): se verifica con `verificar_arbol.cjs` (382/382) antes y después de commitear.
3. Los documentos `D80_*` y `D81_*` mencionan datos que quizá no deban versionarse (dirección personal de pruebas, D-81).
4. `armar_stage_d80` aún no existe: hay que escribirlo y revisarlo antes de usarlo.
5. Flakiness del navegador (latencia de terceros).

## 8 · Decisiones que requieren su autorización (en orden)
1. **Aprobar el Commit A** (¿en una rama nueva `integracion/d78`?) con el manifiesto de `commitA_archivos.txt`; y si se incluye `.vercelignore`.
2. **Aprobar el Commit B** con `commitB_archivos.txt`, y **cómo sanear** los documentos `D80_*` (quitar la dirección personal y las menciones a D-81).
3. Destino de `.claude/skills/*`, `skills-lock.json`, `AGENTS.md`/`CLAUDE.md`/`README.md` locales (excluidos por ahora).
4. **Autorizar escribir y ejecutar `armar_stage_d80`** (sin deploy) y verificar el stage.
5. **Autorizar `vercel deploy --prod --skip-domain`** del stage (sigue sin promover) — decisión aparte.
6. Mantener o no `push` a `privado` (el remoto aún no tiene E-35→D-79).
7. Las decisiones de activación de D-80 (migraciones, variables, webhook/DMARC, revisión legal) siguen como en el anexo 1.

---

# ANEXO 4 · Commits A y B y armador D-80: ejecución autorizada (9-oct-2026) — SIN push ni despliegue

> Autorizado y hecho: commits A y B en el worktree aislado `C:\Users\jemil\vivebien-integracion-d78` (ramas nuevas), escribir y probar `armar_stage_d80`, armar el stage en carpeta nueva.
> **No hecho (no autorizado):** `git push`, `vercel deploy`, promoción, migraciones 36/37, activación de Resend, cambios de DNS/webhooks/variables. El árbol principal `vivebien-next` sigue en `nextjs-migration` = `f4834e5` con **274** cambios (sin tocar). Las ramas existentes (`nextjs-migration`, `deploy/*`, `hotfix/*`, `master`) no se modificaron.

## 1 · Commits (registro de SHA)
| | Rama | SHA | Padre | Archivos |
|---|---|---|---|---|
| **A** · base de producción verificada + reconciliación E-35→D-79 | `integracion/d78-base` | `2af9dc1d5d5209df1e6ab54d1a3b66cdd1708b26` | `f4834e5` (= `privado/nextjs-migration`) | 321 (132 modificados, 189 nuevos) |
| **B** · D-80 (correo apagado por defecto) | `integracion/d80-correo` | `1af90017e9d2fbdc8f82da52b6ca7ad8ccc25fbd` | A | 60 (48 nuevos, 12 modificados) |

Manifiestos: `docs/QA/D80_integracion/commitA_archivos.txt` (324 rutas) y `commitB_archivos.txt` (60). **Tres rutas del manifiesto A no generaron cambio**: `tests-visual/ayudas-panel.ts`, `datos-panel.ts` y `panel.visual.ts` son idénticas a `HEAD` salvo fines de línea (git las normaliza), por eso A tiene 321 y no 324.

### Verificaciones previas al commit (ruta por ruta)
* **A:** las 324 rutas existen y el manifiesto coincide con `git status`; ninguna ruta prohibida (`.env*`, `node_modules`, `.next`, skills, D80/D81); escáner de secretos **686 archivos, 0 hallazgos**.
* **`.vercelignore`:** incluido tras comprobar que es **idéntico byte a byte** al de los stages aprobados E-34, E-35, E-36 y D-75 (lo genera `armar_stage.py`): lista de inclusión de `src`, `public`, `package*.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs` y `vercel.json`. Con él en la raíz, un `vercel deploy` desde este repo sólo subiría eso.
* **Información personal en A:** sin direcciones nuevas de correo personal. Las que aparecen son **históricas** (`joseponcer@vivebienn.com`, `joseponcep@gp-once.com`, documentan el cambio de D-76) o ya estaban en `HEAD` (`jemilianoponceperez@gmail.com` en las decisiones D-13). Se dejaron como evidencia. La identidad de autor del commit es la de la configuración de git existente (`Grupo P11`).
* **B:** las 60 rutas existen y el stage coincide con el manifiesto; se **saneó** la documentación (ver abajo); `grep` de `D-81`, `D81`, `VB-2026-00027` y de la dirección personal de pruebas en las 60 rutas → **0 coincidencias**; sin skills, `skills-lock.json`, `.agents`, `AGENTS.md`/`CLAUDE.md`/`README.md`; escáner **732 archivos, 0 hallazgos**.
* **Saneado de `D80_*`** (`sanear_d80.cjs`; cada regla debía aplicarse una vez o abortaba; 18 reglas aplicadas): quitada la dirección personal de pruebas (sustituida por «destinatario interno autorizado») y las menciones a D-81, **sin tocar** resultados, hashes, pruebas ni comandos. La entrada D-80 de `DECISIONS.md` ya no cita el documento de D-81.
* **Banderas de correo:** el commit B **no** trae `CORREO_*`, `RESEND_*` ni `CRON_SECRET` en ningún archivo de entorno; el código las lee apagadas por defecto (prueba `correo-enviar`: «por defecto todo está apagado»); el `1` de `CORREO_MARKETING` sólo existe en `gate.cjs` como entorno del servidor de pruebas, con un secreto falso, y no viaja en el payload. **Migraciones 36/37 sin aplicar** (siguen sólo como archivos SQL).

### Verificación de los commits (contra producción `dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z`; `verificar_commit.cjs`, sólo GET)
| | Iguales | Distintos |
|---|---|---|
| `HEAD` anterior `f4834e5` (control) | 262/382 (94 distintos, 26 faltan) | — |
| **A** | **381/382** | `src/lib/asignar-slug.ts` |
| **B** | **373/382** | los 8 de D-80 (`next.config.ts`, `registro-lead`, `usuarios/me`, `Footer`, `QuieroPublicar`, `ConfiguracionPortal`, `limites`, `vercel.json`) + `asignar-slug.ts` |

**La única diferencia de A frente a producción es de fines de línea:** producción tiene `asignar-slug.ts` con finales **mixtos** (97 de 123 líneas con CRLF) y git (autocrlf) lo guardó todo en LF. Demostrado: sha1 del archivo de producción sin CR = `e20ccf7b…` = sha1 del blob de A. **Las 7 rutas del residuo de V-1.1.95 valen producción** (sólo ésta difiere en bytes por esa razón).

## 2 · QA de los commits (sobre `git archive` de cada rama, carpetas `vivebien-verif-A/B`, con `node_modules` enlazado y `.env.local` local sin versionar)
| | `qa:gate:rapido` (pasos 1–5) |
|---|---|
| **A** | ✓ tsc · críticas ✓ · seguridad ✓ · secretos 686/0 · lint 63 errores (base 64), 40 avisos (base 40): sin empeorar |
| **B** | ✓ en el 2.º intento: tsc ✓ (7 s) · críticas ✓ · **107 de seguridad** ✓ · secretos 732/0 · lint sin empeorar. El **1.º intento se cortó** sin mensaje en el paso 1 (el gate terminó con código 1 sin «FALLÓ»; `tsc` directo en el mismo árbol pasó, 42 s); **causa no demostrada** (hipótesis: poca memoria, ~1.7 GB libres) |

**No ejecutado:** `qa:gate -- --desde=7` (pasos 6–10: build, navegador, axe, baselines, smoke) sobre los árboles exportados, porque el equipo estaba **en batería** (el gate se niega) y con poca memoria, y un `node_modules` enlazado no sirve para el build. **No se declara PASS** del gate completo para los commits A y B. El gate completo sí pasó sobre el **candidato** (misma base + D-80 sin documentación saneada): ver anexo anterior.

## 3 · Armador `armar_stage_d80` (aislado en el scratchpad; copia en `docs/QA/D80_integracion/armador/`)
* **Diseño:** base `…-d75-final` (manifiesto sha256 `0282b61a…`, payload `fc8156d9…`, verificado contra el **árbol real** de producción: 382/382); trabajo = candidato (sólo lectura); lista **cerrada** de diff = **9 modificados + 34 nuevos**; destino = carpeta **nueva** con marca; huella (ruta, tamaño, mtime) de base y trabajo antes y después; copia verificada del manifiesto/payload base en `respaldo_base_d75\` (no se sobrescribe si difiere); escáner de secretos; el payload no puede quitar ni cambiar nada fuera de la lista.
* **`vercel.json`:** se amplió **sólo** con `validar_vercel_json`: mismas claves y mismos crons que la base y, como única novedad, el cron `/api/correo/tarea` `0 16 * * *` al final. 10 pruebas negativas (sin el cron, otro horario, cron extra, cron existente quitado o cambiado, clave nueva, `redirects`/`rewrites`/`functions`, JSON inválido, `crons` que no es lista).
* **Pruebas:** **50 pruebas unitarias OK** (sin red, carpetas temporales), de las cuales rechazan (`Rechazo`): archivo nuevo inesperado en `src/` o `tests/`, modificación de un archivo ajeno a la lista, archivo esperado faltante, cambios en `package.json`/`tsconfig.json`/`postcss.config.mjs`/`public/`, rutas no permitidas (`.env.local`, `supabase/`, `docs/`, `tests-visual/`, `tests/dobles`, `..`, absolutas, con `\`), base alterada o faltante, hash de manifiesto/payload distinto, producción distinta, destino igual a base/trabajo/dentro o con contenido sin marca, payload que quita o cambia fuera de la lista, secretos y excepciones del escáner de clave exacta. **Prueba de mutación:** al desactivar cada una de las 6 guardias principales (`validar_vercel_json`, `exigir_diff_esperado`, `exigir_sin_cambios_ajenos`, `verificar_base`, `exigir_destino`, `exigir_payload_dentro_de_cambios`) fallan 10, 6, 3, 5, 2 y 4 pruebas respectivamente.
* **Hallazgo durante la ejecución (fail-closed funcionó):** el escáner rechazó el stage por `tests/correo-seguridad.test.ts` línea 7 (`const SECRETO = 'un-secreto-largo-de-prueba-0123456789'`, un fixture). Se añadió una **excepción de clave exacta** (archivo, tipo, línea y sha256 de la línea; 7 pruebas: sin ella es hallazgo, con ella no, y deja de valer si el valor o la posición cambian o en otro archivo). No se modificó el escáner compartido.
* **Resultado (validación en seco y `--ejecutar`, sólo GET a Vercel):** producción `dpl_99T2…` PROMOTED en ambos dominios; base 382/382; diff validado 9 + 34 = 43; **escaneo de secretos LIMPIO**; staging vs base: modificados 9 / nuevos 34 / quitados 0; payload vs producción: **modificados 8 / nuevos 25 / quitados 0**, total 407.
* **Hashes del stage D-80** (`C:\Users\jemil\vivebien-deploy-stage-d80-final`, NO desplegado): **manifiesto sha256 `4140b01a66c47e8c83e4b6b5de60a64ba6a905586d04c215edc7a858a80d14eb`** (769 archivos), **payload sha256 `6e64feeca5edcc9b2919a1c3708cfbfcf063e11db9b179399f19211ad5eb56da`** (407 archivos). Verificación independiente: el stage coincide con su manifiesto **769/769**; contra producción **374/382 con exactamente los 8 de D-80** y ninguna ruta del residuo; la base `-final` sigue **382/382** y no cambió (huella antes/después).
* **Recuperación y rollback:** `RECUPERACION_D80.md` (copia en `armador/`): el armador sólo escribe en la carpeta nueva y se puede repetir; ante cualquier duda se borra y se re-arma; rollback de producción (si algún día se promoviera) `vercel promote dpl_99T2…` o `dpl_CfwgKgpGRRAniArNXymWBSEWSVXj`.

## 4 · Errores (ERROR / CONTEXTO / CAUSA / SOLUCIÓN / PREVENCIÓN)
**E-44 · La primera ejecución del armador rechazó el stage por el escáner de secretos**
* ERROR: `RECHAZADO: Hay posibles secretos en el staging` (`tests/correo-seguridad.test.ts`, `asignacion`).
* CONTEXTO: primer `--ejecutar` de `armar_stage_d80`.
* CAUSA (demostrada): falso positivo; la línea 7 es una constante de prueba evidente (`un-secreto-largo-de-prueba-…`), no una credencial.
* SOLUCIÓN: excepción de clave exacta (línea y sha256) y pruebas de que no cubre otros casos; el stage parcial anterior (con marca) se rehízo.
* PREVENCIÓN: las excepciones del escáner van siempre con clave exacta y prueba negativa; nunca se desactiva el escáner.

**E-45 · Gate rápido sobre el commit B terminó sin mensaje**
* ERROR: 1.er intento: el gate salió con código 1 en el paso 1 sin «FALLÓ» ni resumen.
* CONTEXTO: árbol exportado con `node_modules` enlazado, ~1.7 GB de RAM libre, equipo en batería.
* CAUSA: **no demostrada** (el mismo patrón que E-43; `tsc` directo pasó).
* SOLUCIÓN: repetir; el 2.º intento pasó los 5 pasos.
* PREVENCIÓN: no contar una corrida sin resumen; medir memoria antes; el gate completo exige corriente y >4 GB.

**E-46 · Un script con barras invertidas dentro de una plantilla de JavaScript pasada por la terminal perdió los escapes (4.ª vez, ver 0020)**
* ERROR: un parche de pruebas Python generado desde Node quedó con saltos de línea reales dentro de cadenas.
* CAUSA: la capa de la terminal/herramienta altera `\n` en comandos largos.
* SOLUCIÓN: el parche se reescribió con la herramienta de escritura de archivos (script Python con cadenas crudas).
* PREVENCIÓN: ya propuesta en 0020: para código con barras, siempre escribir el archivo con la herramienta de escritura, nunca por terminal.

## 5 · Riesgos pendientes
1. **No hay `git push`:** E-35→D-80 existe sólo en este disco (ramas `integracion/*` y las carpetas de respaldo). Mientras no se haga push, un fallo del equipo lo pierde.
2. El **gate completo** (6–10) no se ejecutó sobre los commits exportados (sí sobre el candidato equivalente); falta la corrida con corriente y memoria sobre el stage o los commits.
3. El stage D-80 **no se ha desplegado ni verificado contra un deployment real**; falta el verificador `verificar_deployment_d80` (clonar el de D-75) y el `vercel deploy --prod --skip-domain` (no autorizado).
4. `.vercelignore` en la raíz del repo cambia lo que subiría un `vercel deploy` desde el repo (queda la lista de inclusión aprobada).
5. Las migraciones 36/37, variables, webhook/DMARC, revisión legal y prueba con Resend real siguen pendientes (anexos anteriores).
6. Los commits llevan la identidad de autor ya configurada en git (`Grupo P11`, correo personal del propietario).

## 6 · Siguiente decisión (requiere su autorización expresa)
1. `git push` de las ramas `integracion/d78-base` e `integracion/d80-correo` a `privado` (o dónde guardarlas): hoy el trabajo E-35→D-80 no está en ningún remoto. Ojo: el repositorio podría ser público; los commits ya están saneados.
2. `vercel deploy --prod --skip-domain` del stage D-80 (sin promover), y que escriba el verificador de deployment.
3. Correr el gate completo sobre el stage/commits cuando haya corriente y >4 GB libres.

---

# ANEXO 5 · Verificación del stage final D-80 (9-oct-2026) — modo verificación, SIN publicar

> Sólo lecturas y cálculos. **No se modificó código, no hubo commits, push, deploy, promoción, migraciones ni activación de Resend**, y no se hicieron envíos. Herramienta: `docs/QA/D80_integracion/armador/verificar_stage_d80.cjs` (sólo GET a Vercel; salida en `%TEMP%\verificacion_stage_d80.json`).

## 1 · Hashes recalculados y comprobaciones (18)
| # | Comprobación | Resultado |
|---|---|---|
| 1 | sha256 del manifiesto D-80 recalculado = documentado (`4140b01a66c47e8c83e4b6b5de60a64ba6a905586d04c215edc7a858a80d14eb`) | ✓ |
| 2 | sha256 del payload D-80 recalculado = documentado (`6e64feeca5edcc9b2919a1c3708cfbfcf063e11db9b179399f19211ad5eb56da`) | ✓ |
| 3–4 | sha256 del manifiesto y payload de la **base** = aprobados en D-77/D-78 (`0282b61a…`, `fc8156d9…`) | ✓ ✓ |
| 5 | El stage `C:\Users\jemil\vivebien-deploy-stage-d80-final` coincide con su manifiesto (sha1 de cada archivo recalculado): **769 archivos, 0 sobrantes, 0 faltantes, 0 distintos** | ✓ |
| 6 | El payload recalculado desde el stage (regla de `.vercelignore`) = `payload_esperado_d80`: **407 archivos, 0 diferencias** | ✓ |
| 7–8 | `vivebienn.com` y `www.vivebienn.com` siguen en `dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z` | ✓ ✓ |
| 9 | El árbol real de producción tiene 382 archivos fuente | ✓ |
| 10 | **La base `vivebien-deploy-stage-d75-final` sigue = producción (382/382)**: no cambió | ✓ |
| 11 | Stage vs producción: **374/382 iguales, 0 faltantes, 8 distintos** | ✓ |
| 12 | Los 8 distintos son **exactamente** `next.config.ts`, `vercel.json`, `registro-lead/route.ts`, `usuarios/me/route.ts`, `Footer.tsx`, `QuieroPublicar.tsx`, `ConfiguracionPortal.tsx`, `limites.ts` | ✓ |
| 13 | **Ninguna de las 7 rutas del residuo de V-1.1.95** difiere de producción en el stage | ✓ |
| 14 | Stage vs base: **43 cambios (9 modificados + 34 nuevos), 0 quitados** | ✓ |
| 15 | Los 43 cambios son **idénticos** (salvo fines de línea) a los del commit B `1af90017…` | ✓ |
| 16 | Ningún cambio del stage es ajeno a D-80 | ✓ |
| 17 | El stage no contiene archivos `.env*` | ✓ |
| 18 | «Ningún archivo de aplicación asigna un valor a `CORREO_*`/`RESEND_API_KEY`» (**heurística**) | **✗ falso positivo, explicado** |

**Sobre la comprobación 18:** marcó `src/lib/correo/config.ts` por la línea 6, un **comentario** de documentación (`CORREO_TRANSACCIONAL=1` …). El código real (líneas 65–71) sólo **lee** el entorno: `transaccional: env.CORREO_TRANSACCIONAL === '1'`, `marketing: env.CORREO_MARKETING === '1'`, sin valor por defecto encendido. Se deja constancia de la «falla» de la heurística (no se ajustó para forzar un verde); la verificación real de las banderas es la prueba de abajo (§5). **Resultado del script: 17/18; la 18.ª se resuelve por revisión del código y por pruebas, no por el patrón.**

**Evidencia adicional:** los **407 archivos del payload del stage son idénticos byte a byte** a los del candidato `vivebien-candidato-d80` sobre el que pasó el gate completo (0 distintos, 0 faltantes).

## 2 · Gate completo sobre el stage: **NO ejecutado (bloqueado; no se improvisó otro gate)**
| Requisito | Estado comprobado |
|---|---|
| Alimentación eléctrica | **En batería** (`PowerLineStatus: Offline`): el gate se niega a correr los pasos de navegador |
| Memoria | **≈1.8–1.9 GB libres** (se necesita >4 GB; la corrida anterior fue cortada con ~1.5 GB) |
| El propio stage | **No contiene** `scripts/qa/gate.cjs`, `lint-comparar.cjs`, `axe-comparar.cjs`, `escanear-secretos.cjs`, `node_modules` ni `.env.local`: `npm run qa:gate` apunta a un archivo que **no existe** en el stage (`package.json` lo declara, el stage es payload + base, igual que D-75). El gate se ha corrido siempre sobre la **copia de trabajo/candidato**, no sobre el stage |
**Pasos 6, 7, 8, 9 y 10 sobre el stage: no ejecutados → no cuentan como PASS.** Lo que sí hay es el gate completo del **candidato** (6–10 en verde, 2.ª corrida; 1.ª interrumpida) y `qa:gate:rapido` sobre los commits A y B; el payload del stage es byte a byte el del candidato (arriba).

## 3 · Pruebas ejecutadas hoy (resultado real)
* `vitest` de `correo-enviar` + `correo-guardias` sobre el árbol exportado del commit B: **27/27 pasan** (incluye «por defecto todo está apagado»: `entornoCorreo({})` = todo `false`/vacío; sólo el valor `'1'` activa).
* Nada más se ejecutó (sin gate, sin build, sin navegador).

## 4 · Verificador de deployment
**No existe uno para D-80.** Hay `verificar_deployment.py`, `_e34`, `_e35`, `_e36` y `_d75` (el de D-75 está atado a `ACTUAL = dpl_Cfwg…`, a `stage_manifest_d75.json`/`payload_esperado_d75.json` y a sus hashes). Para D-80 **falta** un `verificar_deployment_d80.py` que:
1. use `ACTUAL = dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z`, `stage_manifest_d80.json` y `payload_esperado_d80.json` con los hashes `4140b01a…` y `6e64feee…`;
2. compruebe que el deployment nuevo es del proyecto/equipo esperado, `target: production`, `readySubstate: STAGED`, **sin dominios propios**, `READY`, posterior al manifiesto;
3. compare el árbol real del deployment (`/v6/deployments/<id>/files`) contra el payload (0 sobrantes/faltantes/distintos, tolerando `.vercelignore`);
4. se niegue a ejecutarse si el deployment a verificar es el de producción actual.
No se creó (instrucción: «no lo crees todavía»). Sin él, un `vercel deploy --skip-domain` no se podría verificar con el mismo rigor que D-75.

## 5 · Migraciones, Resend y banderas (sólo lectura)
* **Migraciones 36/37 sin aplicar:** producción tiene **0** tablas `correo_*`, **0** funciones `correo_*` y **0** artículos de correo; datos sin cambios (usuarios 11, propiedades 10, fotos 119).
* **Resend:** uso **8/100 hoy y 10/3000 en el mes** (sin variación respecto a la lectura anterior: **no hubo envíos** durante esta verificación); **0 webhooks**; dominio verificado. No se usó ninguna credencial.
* **Variables de Vercel (producción, sólo nombres):** existen `RESEND_API_KEY` y `CRON_SECRET` (cifradas; las de los flujos actuales). **No existen** `CORREO_TRANSACCIONAL`, `CORREO_MARKETING`, `CORREO_SECRETO`, `RESEND_WEBHOOK_SECRET` ni `NEXT_PUBLIC_CORREO_RECOMENDACIONES` → **el correo nuevo de D-80 está APAGADO en producción**, y seguiría apagado al desplegar este código (la ruta pública daría 404). Nota: Resend sigue activo para los correos que ya existían (citas), con la clave actual.

## 6 · Decisión técnica
**El stage es coherente y está listo para pasar a una revisión de publicación (documental y de contenido), pero NO está listo para publicarse.**
* **A favor (demostrado):** manifiesto y payload recalculados = documentados; el stage = base aprobada + exactamente los 43 cambios de D-80 (idénticos al commit B); sólo 8 archivos distintos de producción, todos de D-80; sin residuo de V-1.1.95; base y producción sin cambios; payload byte a byte igual al candidato que pasó el gate; correo nuevo apagado; migraciones sin aplicar; sin envíos.
* **Falta antes de publicar:** (1) el **gate completo con corriente y >4 GB** sobre una copia ejecutable (el stage no es ejecutable por sí solo: habría que dotarlo de la infraestructura de QA, decisión suya); (2) escribir y probar `verificar_deployment_d80`; (3) los puntos de activación (migraciones, variables, webhook/DMARC, **revisión legal**); (4) `git push` de las ramas `integracion/*`.

## 7 · Autorización que se necesita
1. Cuándo correr el gate completo (cargador conectado, >4 GB libres) y **sobre qué carpeta** (candidato, o stage + infraestructura de QA copiada).
2. Autorizar la creación y prueba de `verificar_deployment_d80`.
3. Sólo después: `git push` y/o `vercel deploy --prod --skip-domain` (decisiones aparte, no autorizadas).

---

# ANEXO 6 · Gate completo oficial sobre el candidato D-80 (9-oct-2026, 16:04:36–16:18:58) — TODO OK, SIN reintentos

> Candidato `C:\Users\jemil\vivebien-candidato-d80`. Comando: `npm run qa:gate` (los 10 pasos, una sola ejecución continua, sin `--desde`, sin `--rapido`). Registro: `%TEMP%\gate_completo_d80.log`. Condiciones comprobadas antes de iniciar: **corriente conectada, 5.8 GB de RAM libre** (> 4 GB), sin procesos ni puertos (3130/54399) ocupados. Sin commits, push, deploy, promoción, migraciones ni activación de Resend; E2E con simulaciones, **ningún correo real**.

## Estado del candidato antes y después (la fuente no cambió)
| | Antes | Después |
|---|---|---|
| Archivos fuente (excluye `node_modules`, `.next`, `test-results`, `.env.local`, generados) | 1121 | 1121 |
| Huella de la fuente (sha256 de ruta+sha1 de cada archivo) | `8adc71f73463405b085ec3ef4528f1df751ab3d4453b307ae8d95e69e40aa836` | **idéntica** |
| Archivos fuente cambiados por el gate | — | **0** |
| Payload recalculado vs `payload_esperado_d80.json` (sha256 `6e64feeca5edcc9b2919a1c3708cfbfcf063e11db9b179399f19211ad5eb56da`) | 407 archivos, 0 diferencias | 407 archivos, **0 diferencias** |
El stage `…-d80-final` no se tocó (sus 407 archivos de payload son idénticos al candidato, verificado en el anexo 5). Herramienta: `docs/QA/D80_integracion/armador/huella_candidato.cjs`.

## Los 10 pasos (resultados reales)
| # | Paso | Comando | Resultado | Duración |
|---|---|---|---|---|
| 1 | typecheck | `npx tsc --noEmit` | ✓ sin errores | 52 s |
| 2 | pruebas críticas | `npx vitest run` (lista del gate) | ✓ **283 pasan** | 26 s |
| 3 | pruebas de seguridad | `npx vitest run` (lista del gate) | ✓ **107 pasan** | 8 s |
| 4 | escáner de secretos | `node scripts/qa/escanear-secretos.cjs` | ✓ 734 archivos, **0 hallazgos** | 0 s |
| 5 | lint (sin empeorar) | `node scripts/qa/lint-comparar.cjs` | ✓ 63 errores (base 64), 40 avisos (base 40) | 137 s |
| 6 | build | `npx next build` (entorno explícito, réplica local) | ✓ compilado y páginas estáticas | 57 s |
| 7 | navegador (4 anchos, incluye E2E de correo) | `npx playwright test -c playwright.sesion.config.ts --grep-invert "axe ·"` | ✓ **171 pasan, 9 omitidas, 0 fallas, 0 inestables** (E2E de correo: 52 pruebas ok) | 319 s |
| 8 | axe (sin empeorar) | `npx playwright test -c playwright.sesion.config.ts axe-cierre` + `axe-comparar.cjs` | ✓ **24 pasan** | 98 s |
| 9 | baselines visuales | `npx playwright test` | ✓ **48 pasan** | 149 s |
| 10 | smoke de API | `node scripts/qa/smoke-deployment.ts staging --base http://localhost:3130 --spec scripts/qa/specs/gate-api.json` | ✓ **14 comprobaciones PASS** | 0 s |
**Total ≈ 14 min 22 s. `qa:gate: TODO OK`, código de salida 0.**

* **Reintentos:** el gate reintenta hasta 2 veces (`QA_REINTENTOS=2`); en esta corrida **no hubo ninguno**: no aparece ninguna prueba fallida, «flaky» ni línea `retry`. Ningún fallo inicial quedó oculto.
* **Omitidas (9) del paso 7:** el CLS de `/entrar` en 3 de los 4 anchos (por diseño de esa prueba; no es de correo).
* **Todo simulado:** la API de correo y Google se simulan en el navegador, el servidor de pruebas corre con un secreto falso y sin clave de Resend; no hubo llamadas a Resend ni envíos.
* **Comparación con las corridas anteriores:** la 2.ª corrida de 6–10 tuvo 5 pruebas inestables que pasaron al reintentar (latencia de terceros); ésta no tuvo ninguna. La corrida con la fuente actual coincide en conteos (171 + 9 omitidas, 24, 48, 14).

## Lo que esto demuestra y lo que no
* **Demuestra:** el candidato (cuya fuente no cambió durante la corrida) pasa los 10 pasos del gate oficial, y su payload es byte a byte el del stage `…-d80-final` (sha256 `6e64feee…`).
* **No demuestra:** el comportamiento con Resend real, la entregabilidad, el correo en un deployment real, ni la revisión legal. El stage mismo no se ejecutó (no es ejecutable por sí solo), y **sigue sin existir `verificar_deployment_d80`**.

## Pendiente (sin cambios)
`git push` de `integracion/*` (no autorizado), `vercel deploy --skip-domain` (no autorizado) y su verificador, migraciones 36/37, variables, webhook/DMARC, revisión legal, prueba con Resend real y revisión independiente (Codex, bloqueado hasta 2026-11-06).

---

# ANEXO 7 · Destino seguro para guardar las ramas de integración (9-oct-2026) — verificación previa, SIN push

> Sólo lecturas (`git`, `gh api` de lectura, `curl` sin credenciales). **No se hizo `git push`**, ni deploy, ni commits nuevos, ni cambios de código/ramas/árboles; sin migraciones, variables, webhooks, DNS, Resend ni envíos. Las credenciales no se muestran.

## 1 · Remoto `privado`
| | Evidencia |
|---|---|
| URL (fetch y push) | `https://github.com/Grupo-P-once/vivebien-next.git` (proveedor: GitHub; propietario `Grupo-P-once`, cuenta de tipo **User**) |
| **Privacidad: VERIFICADA como PRIVADO** | (a) API autenticada de sólo lectura: `private: true`, `visibility: "private"`, `archived: false`, `fork: false`, rama por defecto `nextjs-migration`; (b) **sin credenciales**: `GET api.github.com/repos/Grupo-P-once/vivebien-next` → **HTTP 404** y la página `github.com/Grupo-P-once/vivebien-next` → **HTTP 404** (un repositorio público respondería 200); (c) la API de rulesets contesta «Upgrade to GitHub Pro or make this repository public», que sólo ocurre en un repo privado de plan gratuito. No se dedujo del nombre `privado`. |
| Autenticación | `gh auth status`: sesión activa como `Grupo-P-once` (protocolo https; scopes `gist`, `read:org`, `repo`, `workflow`). `git` usa el **Git Credential Manager** (`credential.helper = manager`, configuración global) y ya leyó el remoto (`ls-remote`, `fetch`) sin problemas |
| Permiso de escritura | **Confirmado por la API para la cuenta**: `permissions: {admin: true, maintain: true, push: true, pull: true}`. **NO VERIFICADO** que el `git push` mismo autentique con el Credential Manager (sólo se probó lectura; un push real no se ejecutó). Hay un antecedente (E-12) de que en esta máquina el push ha necesitado un apaño de credenciales |
| Protecciones | Sin protección de ramas (`protected: false` en las 4 ramas existentes); los rulesets no están disponibles en este plan. Las ramas nuevas `integracion/*` no chocan con ninguna regla |
| **Ojo: `origin` es otro repositorio y es PÚBLICO** | `https://github.com/Grupo-P-once/ViveBien.git` → `private: false`. **Jamás debe recibir estas ramas.** El push propuesto nombra `privado` explícitamente |

Seguridad ante un `git push` accidental sin argumentos: `push.default`, `remote.pushDefault` y el upstream de ambas ramas **no están definidos**, no hay `mirror` ni `followTags`; un `git push` suelto falla en vez de publicar.

## 2 · Ramas (SHA completos y relación)
| Rama local | SHA | Relación |
|---|---|---|
| `integracion/d78-base` (A) | `2af9dc1d5d5209df1e6ab54d1a3b66cdd1708b26` | padre = `f4834e5d49f90dd3cc5e5634723c80487cefcfb6` (= `nextjs-migration` local = `privado/nextjs-migration` **en el remoto**, `ls-remote` de hoy) |
| `integracion/d80-correo` (B) | `1af90017e9d2fbdc8f82da52b6ca7ad8ccc25fbd` | padre directo = A (`merge-base --is-ancestor` → **SÍ**) |
* **Worktree** `C:\Users\jemil\vivebien-integracion-d78`: rama activa `integracion/d80-correo`, **0 cambios pendientes** (limpio).
* **Ramas locales vs remotas:** las remotas existentes son `privado/nextjs-migration` (f4834e5), `privado/deploy/centro-ayuda` (3e2d820), `privado/deploy/google-fix` (72c4c90) y `privado/hotfix/v1.1.76` (c4a32be); **no existe ninguna `integracion/*` en el remoto** (0 coincidencias en `ls-remote`), así que no hay colisión de nombres. Las locales `deploy/*`, `hotfix/*`, `master` y `nextjs-migration` no se tocaron.
* **Repositorio principal** `C:\Users\jemil\vivebien-next`: rama `nextjs-migration`, `HEAD f4834e5…`, **274 cambios pendientes** (idéntico al inicio); `git fsck` sin errores.
* Aviso benigno de `git count-objects` (un directorio `refs` vacío dentro de `.git/worktrees/vivebien-integracion-d78`): no es corrupción (`fsck` limpio).

## 3 · Qué se enviaría (si se autorizara)
`git push privado integracion/d78-base integracion/d80-correo` (refspecs explícitos, **sin `--force`**, sin tags).
* **2 commits nuevos** sobre la base remota: `2af9dc1` (A) y `1af9001` (B); **2 ramas nuevas**, ninguna rama existente se modifica.
* **373 archivos distintos respecto al remoto** (237 nuevos, 136 modificados), **+29 699 / −1 049 líneas**, 530 objetos, ≈10 MB sin comprimir. Un solo archivo > 1 MB: `tests-visual/capturas/escritorio-1440/portada.png` (1.03 MB, captura de referencia).
* **Revisión del contenido (sobre las líneas añadidas respecto al remoto):**
  * Rutas prohibidas (`.env*`, `node_modules`, `.next`, `test-results`, `.claude/`, `skills-lock`, `.agents`, claves/credenciales, carpetas de stages, `.vercel/`): **ninguna**.
  * Secretos: el escáner del repo dio **0 hallazgos** en A (686 archivos) y B (732); además un barrido independiente de patrones (Resend `re_`, Google `AIza`, claves privadas, `sk_live/sk_test`, Slack, GitHub, `whsec_`, JWT, AWS) sobre las 29 401 líneas añadidas encontró **sólo 2 coincidencias, ambas fixtures de prueba evidentes** (`123456789:AAAA…`, token de bot de ejemplo en pruebas).
  * Información personal: **ningún correo @gmail/@live/@hotmail/@outlook/@yahoo/@icloud** en líneas añadidas. Aparecen direcciones corporativas del negocio (`informes@vivebienn.com`, y las antiguas `joseponcer@vivebienn.com`, `joseponcep@gp-once.com`, `jose_oncep@gp-once.com` como evidencia/fixtures de D-76, algunas ya presentes en el remoto) y direcciones de prueba `*.test`/`ejemplo`.
  * **Autor de los commits:** `Grupo P11 <joseemilianoponceperez@gmail.com>`; **los 30 commits anteriores del remoto ya usan ese mismo correo**, por lo que el push no expone nada nuevo en metadatos.
  * Trabajo ajeno: **0** coincidencias de `D-81`, `D81`, `VB-2026-00027` o de las carpetas de D-81 en las líneas añadidas; ni el residuo de V-1.1.95 (las 7 rutas valen producción). Manifiestos A/B vigentes: `commitA_archivos.txt`, `commitB_archivos.txt` (ver anexo 4).

## 4 · Riesgos y verificaciones que faltan
1. **Escritura de git no probada** (sólo la API la confirma). Si el Credential Manager no autentica el push, fallará sin efecto; el apaño conocido (E-12) es `git -c credential.helper= -c credential.helper=wincred push …` (**no se ejecutó**).
2. **Una vez publicado, lo enviado queda en el historial del remoto** aunque se borre la rama (puede quedar en cachés/clones). El repo es privado, pero tiene un colaborador/acceso por la cuenta `Grupo-P-once`; no se consultaron colaboradores.
3. **Plan gratuito:** sin protección de ramas ni rulesets; cualquiera con escritura puede forzar/borrar ramas.
4. El remoto **no tendría** aún la verificación del stage ni el verificador (viven en el scratchpad y en `docs/QA/D80_integracion/armador/` dentro de B sólo como copia de documentación, no los scripts originales).
5. Las ramas contienen **documentación saneada**, pero el árbol principal y las carpetas locales conservan versiones sin sanear (no se envían).
6. **Vercel y Git (comprobado hoy, lectura de `/v9/projects`):** el proyecto `vive-bien` está **enlazado a GitHub `Grupo-P-once/ViveBien`, es decir, al repositorio `origin` (PÚBLICO), con `productionBranch = nextjs-migration`**, `autoAssignCustomDomains: true` y sin comando para ignorar compilaciones. Consecuencias: (a) **un push a `privado` NO dispara ningún despliegue** (ese repositorio no está enlazado); (b) en cambio **un push a `origin`, y más aún a `origin/nextjs-migration`, podría publicar código en el repositorio público y/o disparar un despliegue de producción** (no se verificó si los despliegues por push están activos; los últimos se hicieron con la CLI). Por eso `origin` queda **expresamente excluido** de cualquier push de D-80.

## 5 · Recomendación
**SEGURO PARA SOLICITAR AUTORIZACIÓN DE PUSH**, con estas condiciones: (a) un único comando explícito `git push privado integracion/d78-base integracion/d80-correo` (nunca `origin`, nunca `--force`, sin tags); (b) comprobado: `privado` no está enlazado a Vercel (el proyecto está enlazado a `origin`/ViveBien), así que ese push no despliega; (c) si la autenticación falla, usar el apaño documentado, no cambiar ningún remoto. **NO está bloqueado**; lo que no se pudo verificar sin ejecutar el push es la autenticación de escritura de `git`.

*Nota:* esto **no** autoriza ni prepara ningún despliegue: `vercel deploy`, promoción, migraciones 36/37, variables, webhook/DMARC y la revisión legal siguen siendo decisiones separadas.

---

# ANEXO 8 · `git push` de las ramas de integración a `privado` — EJECUTADO y verificado (10-oct-2026)

> Autorizado por el propietario **exclusivamente** el comando `git push privado integracion/d78-base integracion/d80-correo`. Nada más: **sin** `--force`, sin tags, sin otras ramas, **sin `origin`**, sin cambios de remotos/upstreams/configuración, sin deploy de Vercel, sin promoción, sin migraciones 36/37, sin variables/webhooks/DMARC, sin activar Resend ni enviar correos.

## Comprobaciones previas (antes de ejecutar)
* `privado` → `https://github.com/Grupo-P-once/vivebien-next.git` (fetch y push): **URL exacta ✓**.
* Privacidad re-comprobada: API autenticada `private: true / visibility: private`; sin credenciales, API y web **HTTP 404** ✓.
* SHA locales = autorizados: `integracion/d78-base` = `2af9dc1d5d5209df1e6ab54d1a3b66cdd1708b26` ✓; `integracion/d80-correo` = `1af90017e9d2fbdc8f82da52b6ca7ad8ccc25fbd` ✓.
* Worktree sin cambios pendientes; remoto sin ramas `integracion/*`.

## Resultado del push (exacto)
```
To https://github.com/Grupo-P-once/vivebien-next.git
 * [new branch]      integracion/d78-base -> integracion/d78-base
 * [new branch]      integracion/d80-correo -> integracion/d80-correo
```
Código de salida **0**. **Autenticó con la configuración normal** (Git Credential Manager): no hizo falta el método alternativo (`wincred`), que **no se usó**. Quedó resuelto el punto «escritura de git no verificada» del anexo 7.

## Verificación posterior (sólo lectura: `git ls-remote`, `gh api`)
| Comprobación | Resultado |
|---|---|
| `privado/integracion/d78-base` en el remoto | `2af9dc1d5d5209df1e6ab54d1a3b66cdd1708b26` = autorizado ✓ |
| `privado/integracion/d80-correo` en el remoto | `1af90017e9d2fbdc8f82da52b6ca7ad8ccc25fbd` = autorizado ✓ |
| Ramas existentes del remoto | **sin cambios**: `nextjs-migration` `f4834e5d49f90dd3cc5e5634723c80487cefcfb6`, `deploy/centro-ayuda` `3e2d820e…`, `deploy/google-fix` `72c4c90c…`, `hotfix/v1.1.76` `c4a32be8…` |
| Tags | no se enviaron; el remoto conserva sus 3 tags `baseline-*` (ya existían y coinciden con los locales) |
| `origin` (repositorio público ViveBien) | **no se tocó**: 0 ramas `integracion/*` |
| Repositorio `privado` | sigue **privado** |
| Configuración de git | remotos sin cambios; las dos ramas **siguen sin upstream** (no se usó `-u`) |
| Worktree de integración | 0 cambios pendientes, en `integracion/d80-correo` |
| Repositorio principal `C:\Users\jemil\vivebien-next` | `nextjs-migration`, `HEAD f4834e5d49f90dd3cc5e5634723c80487cefcfb6`, **274 cambios** (idéntico) |

## Qué cambia y qué no
* **Cambió:** el remoto privado ahora **guarda** E-35→D-79 (A) y D-80 (B). Antes ese trabajo sólo existía en este disco.
* **No cambió:** `nextjs-migration` (ni local ni remota), producción (`dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z`), el stage, las migraciones (36/37 sin aplicar), las variables de Vercel, Resend (sin envíos) ni los dominios. **No hubo despliegue:** el proyecto de Vercel está enlazado al repositorio `origin`, no a `privado`.
* Lo publicado quedó revisado antes (anexo 7: sin secretos, sin rutas prohibidas, sin correos personales nuevos, sin D-81).

## Pendiente (sin cambios, todo requiere autorización aparte)
`vercel deploy --prod --skip-domain` del stage D-80 + `verificar_deployment_d80` (primera ejecución real), migraciones 36/37, variables de Vercel, webhook/DMARC, revisión legal del consentimiento, prueba con Resend real, revisión independiente (Codex, bloqueado hasta 2026-11-06) y decisión sobre integrar las ramas a `nextjs-migration`.

---

# ANEXO 9 · Deployment de prueba de D-80 (`--prod --skip-domain`, SIN promover) — 10-oct-2026

> Autorizado: crear el deployment desde `C:\Users\jemil\vivebien-deploy-stage-d80-final` con el procedimiento ya documentado en D-77. **No se promovió, no se asignó ningún dominio propio**, y no se ejecutó nada más: sin migraciones 36/37, sin cambios en variables de producción, webhooks, DNS ni DMARC, sin activar Resend, sin envíos, sin tocar el repositorio principal, las ramas ni la configuración de git.

## Comprobaciones previas
* Cuenta `grupo-p-once`; `.vercel/project.json` del stage = proyecto `vive-bien` (`prj_9yq2WyOEWNbfXMuRl4oQbWCDI9xd`) y equipo `team_WqoyIiavBLrfbGlwD2UqGZPW`, iguales a los esperados; la API confirma el proyecto y que su producción es `dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z` `PROMOTED`.
* Stage y payload recalculados: manifiesto `4140b01a…14eb` y payload `6e64feee…56da` = documentados; stage 769/769, payload 407/407; 374/382 contra producción con exactamente los 8 de D-80; producción (`vivebienn.com`, `www`) en `dpl_99T2…`. **17 de 18** comprobaciones del script; la 18.ª es el falso positivo ya explicado (el comentario de `config.ts`).
* Alcance del comando: el mismo de D-77 (`--skip-domain` impide asignar los dominios; `vercel deploy --prod` sólo crea el deployment de destino «production» sin promoverlo).

## Deployment creado
| | |
|---|---|
| **Comando** | `vercel deploy --prod --skip-domain --yes` (desde la carpeta del stage) |
| **Identificador** | **`dpl_EMjwLjmxwh3XeXN9cc66U9YK1yS8`** |
| URL | `https://vive-bien-g8nx67ean-grupo-p-once.vercel.app` (inspector: `https://vercel.com/grupo-p-once/vive-bien/EMjwLjmxwh3XeXN9cc66U9YK1yS8`) |
| Creado / duración | 2026-10-10 11:44:35 → 11:46:16 (hora local; ≈1 min 40 s); `createdAt` 17:44:40 UTC |
| Estado | `READY`, **`readySubstate: STAGED`**, `target: production`, sin `gitSource` |
| Build | Vercel descargó **407 archivos** de despliegue (= payload) y compiló en `iad1` |

## `verificar_deployment_d80.py` (primera ejecución REAL, sólo GET)
`python verificar_deployment_d80.py dpl_EMjwLjmxwh3XeXN9cc66U9YK1yS8 --manifest-sha 4140b01a66c47e8c83e4b6b5de60a64ba6a905586d04c215edc7a858a80d14eb --payload-sha 6e64feeca5edcc9b2919a1c3708cfbfcf063e11db9b179399f19211ad5eb56da` →
**`OK: … 407 archivos fuente = 407 esperados · READY/STAGED, sin dominios propios, árbol == payload D-80.`** (código 0). Es la primera vez que el verificador corre contra un deployment verdadero; el formato real del árbol coincidió con el simulado en las pruebas.

## Verificación de que producción NO cambió (lectura)
| | Destino |
|---|---|
| `vivebienn.com` | `dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z` (sigue) |
| `www.vivebienn.com` | `dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z` (sigue) |
| `vive-bien.vercel.app` | `dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z` (sigue) |
| Destino de producción del proyecto | `dpl_99T2…` `PROMOTED` (sigue) |
| El sitio público | `https://vivebienn.com/` sirve `data-dpl-id="dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z"`; `/api/salud` HTTP 200 |
| Deployments de producción del proyecto | el nuevo aparece como `STAGED`; `dpl_99T2…` y `dpl_Cfwg…` siguen `PROMOTED` |

## Observación: un alias automático (explicado, no es un dominio propio)
La salida del comando incluyó «Aliased: `https://vive-bien-grupo-p-once.vercel.app`». Es el **alias automático del proyecto y del equipo** que Vercel mueve al deployment de producción más reciente (patrón `<proyecto>-<equipo>.vercel.app`); **no** es `vivebienn.com`, `www` ni `vive-bien.vercel.app`. Comprobado: es el **único alias** del deployment nuevo; `dpl_99T2…` conserva sólo sus tres dominios y `dpl_Cfwg…` ya no tiene ninguno (el alias automático se va mudando); una petición a esa URL responde **302 al inicio de sesión de Vercel (Deployment Protection / SSO)**, es decir, **no se sirve al público**. No se pudo comprobar a qué deployment apuntaba antes de este (la API no conserva ese histórico). Por eso `verificar_deployment_d80` lo dejó pasar (su lista de «dominios propios» es `vivebienn.com` y `vive-bien.vercel.app`): se anota como **límite** del verificador, sin modificarlo.

## Qué NO se hizo / sigue pendiente
* No se promovió (`vercel promote` **no** autorizado) ni se asignó ningún dominio.
* El deployment `STAGED` queda sin promover; no se probó su comportamiento en el navegador (está tras Deployment Protection) ni se consultaron sus registros de ejecución.
* Migraciones 36/37 sin aplicar; el correo nuevo sigue **apagado** (no existen `CORREO_*` en las variables de producción); Resend sin envíos; sin webhook ni DMARC; revisión legal pendiente; revisión independiente (Codex) bloqueada hasta 2026-11-06.
* **Qué debe decidir el propietario:** si se promueve (o se descarta) `dpl_EMjwLjmxwh3XeXN9cc66U9YK1yS8`, y cuándo; rollback de una eventual promoción: `vercel promote dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z --yes`.

---

# ANEXO 10 · Modo de pruebas del correo: todo a `jemilianoponceperez@gmail.com` — 10-oct-2026

> Alcance: sólo código y pruebas en una **copia aislada** (`C:\Users\jemil\vivebien-d80-modo-pruebas`, sin git). Sin migraciones, sin variables de producción, sin promoción, sin push, sin envíos reales ni uso de la clave de Resend. El parche está en `docs/QA/D80_integracion/modo-pruebas.patch`. **No está en ningún commit, rama, stage ni deployment**: el candidato, el stage y sus huellas siguen intactos.

## Cómo funciona
* `CORREO_MODO_PRUEBAS=1` (apagado por defecto; sólo el valor exacto `1` lo activa). El destino es la **constante** `DESTINO_PRUEBAS` en `src/lib/correo/config.ts`, no una variable: nadie puede apuntarlo a otra dirección por configuración.
* Punto central: `enviarCorreo` (`src/lib/correo/enviar.ts`) es el único código de D-80 que llama a Resend. El destinatario original se valida igual que en producción (lista, saltos de línea o inválido → `omitido`), y **después** se sustituye por el de pruebas **antes** de reservar presupuesto, registrar en `correo_envios` o enviar. El correo real del cliente no llega a la base ni al proveedor.
* Última barrera `exigirSoloDestinoDePruebas` sobre el cuerpo ya armado, justo antes de `fetch`: exige `to` = un solo elemento igual al destino, ninguna clave `cc`/`bcc`/`cco` (cualquier capitalización), `reply_to` institucional y cabeceras sin destinatarios ni saltos de línea. Si falla: no se llama al proveedor, el envío queda en `error/fuga_modo_pruebas`.
* Asunto con prefijo `[PRUEBA] ` y cabecera `X-Vive-Bien-Modo: pruebas`. Respuestas siempre a `informes@`. La tarea de recomendaciones procesa como máximo 3 personas por ejecución en este modo.
* No activa el envío: siguen mandando `CORREO_TRANSACCIONAL`, `CORREO_MARKETING`, `CORREO_SECRETO` y `RESEND_API_KEY`.

## Pruebas (proveedor y base falsos; nada sale)
`tsc` limpio; `eslint` limpio sobre `src/lib/correo` y `tests/correo-*`. Suites de correo + migraciones 36/37: **155 pasan, 2 fallan** (ver abajo). Nuevas: `correo-modo-pruebas.test.ts` (bandera, redirección transaccional y marketing, múltiples destinatarios, CC/CCO/`cco` en cualquier capitalización, inyección por cabeceras y enlace de baja, barrera directa), 4 de punta a punta en `correo-integracion.test.ts` (visitante, transaccionales, tarea con 6 suscriptoras reales, destinatarios múltiples) y 4 guardias arquitectónicas en `correo-guardias.test.ts`.
**Mutación:** sin la sustitución fallan 12 pruebas; sin la barrera final, 4; sin ambas, 13. Código restaurado idéntico.

## LO QUE NO ESTÁ GARANTIZADO (por eso la tarea NO se da por completa)
1. **Tres emisores anteriores a D-80 hablan con Resend por su cuenta y NO tienen modo de pruebas**: `src/lib/aviso-lead.ts` (aviso de lead), `src/lib/citas/enviar.ts` (citas) y `src/lib/invitacion-correo.ts` (invitaciones). Con `CORREO_MODO_PRUEBAS=1` **siguen escribiendo a destinatarios reales** si Resend está configurado. No son D-80 y no se tocaron; están contabilizados en una guardia que falla si aparece un cuarto emisor. Cubrirlos requiere autorización y su propia revisión.
2. Los enlaces de baja/confirmación de un correo de prueba llevan tokens reales de la suscripción original; quien los reciba (el destino de pruebas) podría darla de baja. Los registros de prueba en `correo_envios` quedan con el destino de pruebas, no con el real.
3. Dos pruebas **ya existentes** de la integración fallan por reloj, también en el candidato sin tocar: fijan `ahoraBase` en 16:00Z mientras la base usa `now()` real (hoy ya pasaron las 16:00Z). No es regresión del modo de pruebas; no se corrigió en este alcance.
4. Para aplicarlo hace falta commit nuevo, stage nuevo y repetir el gate (autorización aparte). La copia no sustituye al stage `dpl_EMjwLjmxwh3XeXN9cc66U9YK1yS8`.


---

# ANEXO 11 · Modo de pruebas extendido a TODOS los emisores de Resend — 10-oct-2026

> Autorizado por el propietario: extender `CORREO_MODO_PRUEBAS=1` a los tres emisores anteriores a D-80, neutralizar los enlaces con token, investigar las dos pruebas por reloj. **Sigue sin haber** commit, push, migración, cambio de variables, deployment ni correos reales. Todo en la copia aislada `C:\Users\jemil\vivebien-d80-modo-pruebas`; el repositorio principal, el stage y el candidato no se tocaron. Parche completo: `docs/QA/D80_integracion/modo-pruebas.patch` (reemplaza al del anexo 10; 12 archivos, ver abajo). **Este anexo sustituye los puntos 1 y 2 de «Lo que NO está garantizado» del anexo 10.**

## Inventario de emisores (búsqueda en `src/` de `api.resend.com`, `nodemailer`, `sendgrid`, `mailgun`, `smtp`, `postmark`, `emails.send`)
| Emisor | Qué envía | Antes | Ahora |
|---|---|---|---|
| `src/lib/correo/enviar.ts` | D-80: bienvenida, publicador, suscripción, recomendaciones | barrera propia | reconstruye el cuerpo y llama a `llamarResend` |
| `src/lib/aviso-lead.ts` | aviso al buzón interno de cada lead (con `reply_to` = el visitante) | directo a Resend | `llamarResend` |
| `src/lib/citas/enviar.ts` (`mandar`) | correos de citas (botones con token, adjunto .ics) | directo | `llamarResend` |
| `src/lib/invitacion-correo.ts` | invitación a un invitado (con `reply_to` = quien invita) | directo | `llamarResend` |

Ahora **sólo `src/lib/correo/resend.ts` contiene la URL de Resend**; una guardia estática (`tests/correo-guardias.test.ts`) falla si otro archivo la usa o si aparece un quinto emisor.

## Cómo se garantiza (por capas)
1. `llamarResend` (único `fetch` a la API): en modo de pruebas **reconstruye** el cuerpo desde una lista blanca (`from`, asunto, `html`, `text`); `to` = `[DESTINO_PRUEBAS]`, `reply_to` = institucional, cabeceras sólo las no sospechosas + `X-Vive-Bien-Modo: pruebas`. `to`/`cc`/`bcc`/`cco`/`reply_to`/`scheduled_at`/`tags`/adjuntos del emisor **no existen** para el proveedor.
2. `exigirSoloDestinoDePruebas` revisa el resultado: un solo destinatario exacto, ninguna clave fuera de la lista (adjuntos, copias, programación), `reply_to` institucional, ninguna cabecera de destinatarios ni de baja (`List-Unsubscribe*`), ningún salto de línea en cabeceras. Si falla lanza `fuga_modo_pruebas` **antes** de llamar al proveedor.
3. Enlaces: las URL de `/citas/accion`, `/correo/confirmar|baja|preferencias`, `/api/correo/*`, `/api/citas/*` y cualquier `?t=` / `#t=` se sustituyen por `https://vivebienn.com/?enlace=deshabilitado-en-pruebas` en HTML, texto y cabeceras: **el token real ni siquiera sale**, y la cabecera de baja con un clic se elimina. Los correos de pruebas no pueden confirmar, dar de baja ni aceptar/cancelar nada real.
4. Adjuntos (.ics de citas) descartados: lleva organizador/asistentes y aceptarlo enviaría una respuesta a una dirección real.
5. El emisor D-80 además sustituye el destinatario **antes** de reservar presupuesto o registrar en `correo_envios` (la base nunca ve el correo real) y limita la tarea a 3 personas por ejecución.
6. Producción sin la bandera (ausente, vacía o cualquier valor distinto de `1`): el envío real no cambia (probado emisor por emisor: destino, `reply_to`, adjuntos, enlaces e `Idempotency-Key`).

## Pruebas (proveedor y base falsos; no salió ningún correo)
* `tsc --noEmit`: sin errores. `eslint` sobre todos los archivos tocados: limpio.
* Suites de correo + migraciones 36/37 + las nuevas: **170 pasan, 0 fallan** (tras corregir las dos de reloj). Suite completa de la copia: 2357 pasan, 6 fallan en `task-observer`, `medios-optimizar` y `wafloat-oclusion`; **las mismas 6 fallan en el candidato sin tocar** (preexistentes / dependen de archivos que la copia aislada no trae) y no tienen relación con el correo. `eslint src tests` completo: 130 hallazgos, idénticos en el candidato (preexistentes).
* Nuevas: `correo-modo-pruebas-emisores.test.ts` (15: los 3 emisores en modo de pruebas y en modo real, inyección CRLF, múltiples destinatarios, tokens/ICS, cuerpo hostil con CC/CCO/BCC en todas las formas, llamada directa) y 4 guardias nuevas; `correo-modo-pruebas.test.ts` actualizado (15).
* **Mutaciones** (cada una rompe pruebas): no reconstruir el cuerpo → 8 fallan; no neutralizar enlaces → 2; permitir adjuntos → 1; conservar `List-Unsubscribe` → 4; un emisor que no use `llamarResend` → 5. Archivos restaurados idénticos.

## Las dos pruebas «por reloj»: causa demostrada y corrección (sólo de la prueba)
Fallaban `el presupuesto diario detiene al marketing…` y `si Resend falla, el envío queda en «error»…` **también en el candidato sin tocar**. Causa: la función SQL `correo_confirmar` fija `proximo_envio_en = greatest(now(), …)` con el reloj real de la base, y las pruebas pasaban a la tarea un `ahoraBase` fijo (`2026-10-10T16:00Z`). Pasadas las 16:00Z las suscriptoras recién confirmadas «aún no tocaban» (`enviadas 0`, esperado 2) — verificado: fallaban a las 18:04Z y la migración y la tarea hacen exactamente eso. Corrección: `ahoraBase = max(fecha fija, Date.now()) + 1 min` **sólo en `tests/correo-integracion.test.ts`**; el código de producción y el SQL no cambian. 19/19 pasan.

## LO QUE SIGUE SIN CUBRIR (por eso no se declara éxito absoluto)
1. **Correos de Firebase Auth, enviados desde el navegador y no por Resend**: restablecer contraseña (`components/acceso/Entrar.tsx`, `components/cuenta/CuentaYSeguridad.tsx`) y verificación de correo (`components/admin/AdminShell.tsx`). Son del proveedor de identidad, al correo que escribe/tiene la persona; una variable de servidor no puede redirigirlos. Fuera de Resend, sin cobertura. Opciones (requieren decisión): ocultar esos botones en un entorno de pruebas con una bandera pública, o usar el emulador de Firebase.
2. Registros de base de los flujos de citas: `citas_correos.destinatario_email` y `citas_tokens` se escriben con datos reales *antes* de enviar (no es un envío; el token real nunca sale del servidor en modo de pruebas).
3. El **contenido** de los avisos de lead/invitación incluye los datos de la persona (nombre, teléfono, correo) y viaja al destino de pruebas, que es el buzón del propietario; no hay destinatario real, pero sí datos reales en el cuerpo.
4. No integrado: aplicarlo exige commit nuevo, stage nuevo y repetir el gate, con autorización. La copia no sustituye al stage `dpl_EMjwLjmxwh3XeXN9cc66U9YK1yS8`.
5. **Incidente de proceso:** la copia aislada contiene un archivo `.git` (copiado del worktree) que apunta a `.git/worktrees/vivebien-integracion-d78` del repositorio principal. No se ejecutó ningún comando que escriba (`add`, `commit`…), sólo lecturas; el worktree `integracion/d80-correo` sigue en `1af90017…`. Se intentó renombrar ese archivo para neutralizarlo y el clasificador lo bloqueó; **queda pendiente que el propietario decida** (recomendado: borrar o renombrar `C:\Users\jemil\vivebien-d80-modo-pruebas\.git` antes de cualquier uso de git ahí).

---

# ANEXO 12 · Firebase Auth cubierto con el emulador — 10-oct-2026

> Autorizado: cubrir los correos de Firebase Auth con el emulador, **sin integrar ni desplegar**. Solo en la copia aislada `vivebien-d80-modo-pruebas`. Sin commit, push, migraciones, variables de producción, despliegue, envíos reales ni cambios en el repositorio principal/stage. Cierra el punto 1 de «Lo que sigue sin cubrir» del anexo 11. Parche actualizado: `docs/QA/D80_integracion/modo-pruebas.patch` (14 archivos).

## Qué se hizo
* `src/lib/firebase.ts`: si existe `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR` **y** vale una dirección de esta máquina (`127.0.0.1`, `localhost` o `[::1]` con puerto), llama a `connectAuthEmulator`. Cualquier otro valor (otro host, con `http://`, con ruta, subdominios falsos) se **ignora**. Sin la variable —producción— no cambia nada. La variable no está en ningún archivo de entorno versionado (guardia).
* Inventario estático (prueba): sólo `Entrar.tsx` (restablecer contraseña), `CuentaYSeguridad.tsx` (restablecer contraseña) y `AdminShell.tsx` (verificar correo) llaman a los envíos de Firebase; los tres importan el `auth` de `lib/firebase.ts`, único dueño de `getAuth`. Un cuarto sitio haría fallar la prueba.
* Emulador usado: `firebase-tools` (vía `npx`, sin tocar `package.json` ni `node_modules`), `emulators:start --only auth --project demo-vivebien` en `127.0.0.1:9099` (proyecto `demo-` = sin credenciales ni contacto con el proyecto real; no necesita Java). El emulador **no envía nada**: guarda los códigos en memoria.

## Pruebas
`tests/firebase-emulador-correos.test.ts` (7): 3 estáticas, 3 de conexión sin red, y 1 contra el emulador real (se activa con `FIREBASE_AUTH_EMULATOR_PRUEBAS=127.0.0.1:9099`; sin emulador se omite y lo dice). En la corrida real: se creó un usuario en el emulador, se llamó a `sendEmailVerification` y `sendPasswordResetEmail`; **todas las peticiones fueron a `http://127.0.0.1:9099/…`** (ninguna con anfitrión de Google/Firebase/vivebienn) y el emulador registró exactamente `PASSWORD_RESET` y `VERIFY_EMAIL` para ese correo.
* Con el emulador: correo + Firebase + migraciones 36/37 = **179 pasan, 0 fallan**; sin emulador: 178 + 1 omitida. `tsc` limpio; `eslint` limpio en los archivos tocados.
* Mutaciones: aceptar cualquier host → fallan 2; no conectar nunca → falla 1. Restaurado idéntico.
* Se detuvo el emulador al terminar (puertos 9099/4400/4500 libres). Dato técnico: el SDK de Firebase para Node toma `fetch` al cargarse; el registro de URLs debe instalarse antes de importarlo (no sirve `vi.spyOn`).

## Qué NO cubre (límites, sin maquillar)
1. **No se ejercitaron los botones reales en un navegador**: la prueba usa el SDK real con el `auth` real de la app contra el emulador, y la guardia estática garantiza que los tres componentes usan ese `auth`, pero ninguna prueba hace clic en «restablecer contraseña» en la interfaz. Pendiente (E2E con Playwright contra un servidor local con la variable).
2. **Las sesiones del emulador no sirven para el servidor**: los tokens del emulador no están firmados por Google, así que `requireRole()` (valida contra las claves públicas de Google) los rechazará. El emulador cubre los *correos* de Firebase, no un inicio de sesión completo contra las rutas protegidas.
3. **La variable es pública (`NEXT_PUBLIC_`) y se incrusta al compilar**: debe ponerse sólo en un entorno de pruebas y nunca en las variables de Vercel de producción; la restricción a direcciones locales evita que apunte a otro servidor, pero no que un build local con ella se despliegue por error. Regla de proceso: no definirla en Vercel.
4. Sigue igual lo del anexo 11: no integrado (requiere commit + stage + gate con autorización); el `.git` copiado en la copia aislada apunta al worktree de integración y debe borrarlo/renombrarlo el propietario; registros de citas en BD; datos del lead en el cuerpo del aviso.
5. Cobertura de correo del sitio tras esto: Resend (4 emisores, centralizado) + Firebase Auth (emulador). No se encontraron otros emisores en `src/`; Supabase Auth no se usa para correo (`grep` sin resultados).

---

# ANEXO 13 · Cierre de D-80: integración del modo de pruebas — DETENIDO en el gate (10-oct-2026)

> **Estado: NO cerrado.** El parche del modo de pruebas está aplicado en la rama de integración (sin commit) y verificado con las comprobaciones específicas; el **gate oficial no pudo ejecutarse** (equipo en batería), así que **no se creó commit, stage ni deployment**. Nada se promovió ni se publicó.

## Identificación previa (antes de cualquier operación Git)
* Repositorio real: `C:\Users\jemil\vivebien-next` (rama `nextjs-migration`, `f4834e5`, **274 cambios intactos**, no se tocó). Worktree de integración: `C:\Users\jemil\vivebien-integracion-d78`, rama `integracion/d80-correo` en `1af90017e9d2fbdc8f82da52b6ca7ad8ccc25fbd`, limpio antes de aplicar.
* La copia `vivebien-d80-modo-pruebas` contiene un archivo `.git` que apunta a ese worktree: **no se ejecutó ninguna operación Git dentro de ella** en esta etapa (sigue pendiente que el propietario lo borre/renombre; el intento de renombrarlo fue bloqueado por el clasificador).

## Lo ejecutado
* `git apply` del parche `modo-pruebas.patch` **solo en el worktree de integración**: 10 archivos modificados + 4 nuevos (`resend.ts` y 3 pruebas). Verificado: el contenido de los 14 archivos es idéntico al de la copia aislada (salvo fin de línea CRLF/LF por `core.autocrlf=true`). **Sin commit.** Se creó un enlace `node_modules` (junction hacia el de d75, ignorado por git) para poder probar.
* En el worktree: `tsc --noEmit` **sin errores**; `eslint` sobre los archivos modificados **limpio**; vitest (correo, Firebase, migraciones 36/37): **13 archivos, 178 pasan, 1 omitida** (la prueba contra el emulador de Firebase, que no estaba levantado; esa misma prueba pasó 7/7 contra el emulador real sobre el contenido idéntico en la copia — anexo 12).
* Fallos nuevos causados por el cambio: **ninguno**. Fallos preexistentes demostrados (sin relación, idénticos en el candidato sin tocar; anexo 11): 6 pruebas en `task-observer`, `medios-optimizar` y `wafloat-oclusion` y 130 hallazgos de `eslint src tests` completo.

## Gate oficial: NO ejecutado
* `tests/performance/verificar-energia.sh` aborta: «el equipo está en BATERÍA» (43 %, `BatteryStatus=1`). Memoria libre medida: 3.98–4.19 GB (límite documentado: > 4 GB, al borde).
* `node scripts/qa/gate.cjs` en el worktree además se detuvo por falta de `.env.local` con las variables públicas (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_FIREBASE_API_KEY`); el candidato anterior las tenía.
* **No se declara gate aprobado.** Acción mínima: conectar el cargador, liberar memoria (> 4 GB libres) y autorizar a copiar al worktree un `.env.local` con **solo** las variables públicas (archivo ignorado por git). Con eso, el resto del procedimiento (gate, commit en `integracion/d80-correo`, stage nuevo, hashes, `vercel deploy --prod --skip-domain` STAGED, `verificar_deployment_d80.py`) se retoma.

## Producción
Verificado en lectura: `https://vivebienn.com/` sigue sirviendo `dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z` y `/api/salud` responde 200. El deployment de prueba anterior `dpl_EMjwLjmxwh3XeXN9cc66U9YK1yS8` **no contiene** el modo de pruebas y no se reutiliza como evidencia. Sin push, sin migraciones, sin cambios de variables/webhooks/DNS/DMARC, sin Resend ni envíos.

## Siguiente etapa (separada de D-80): corrección de errores web
Diagnóstico vigente: `docs/QA/DEFECTOS.md` (QA-001…022), `PLAN_REPARACION.md` (R-01…R-17), `QA_REPARACION_2026-10-07.md` y `CIERRE_E34_2026-10-07.md` (**prevalece**). No hay que re-auditar. Estado real en el código de la rama de integración:
* Ya corregidos en código (E-35): QA-012 (el `GET` público de Telegram ya no existe), QA-013 (`/api/usuarios/:path*` en la lista de cabeceras `private, no-store`), QA-011 (el `GET` de `/api/admin/propiedades` exige `requireAdmin`).
* **Sigue abierto, con evidencia: QA-019 (P3, resiliencia/UX)**: `src/app/portal/layout.tsx:23` hace `notFound()` si `aperturaDelPortal(await leerFlags()) === 'nadie'`; si la base de flags no se puede leer, un cliente con sesión ve «404» en vez de «no disponible ahora». Solución propuesta (R-15): distinguir «cerrado» de «no se pudo leer» (503 con mensaje). Archivos: `src/app/portal/layout.tsx`, `src/lib/config/flags-servidor.ts` (`leerFlags`), `src/app/portal/propiedades/page.tsx`. Verificación: prueba nueva junto a `tests/portal-apertura.test.ts` con lectura de flags fallando (esperado: no-404, mensaje; con flag cerrado real, sigue 404) y comprobación manual con la lectura de flags simulada caída.
* Otros abiertos de menor prioridad: QA-014 (22 rutas sin prueba), QA-016 (índices FK, requiere migración).

---

# ANEXO 14 · Cierre de D-80 (parte 2): gate, commit y stage del modo de pruebas — deployment NO creado (10-oct-2026)

> Retoma el anexo 13 una vez conectado el cargador. Resultado: **gate 10/10, commit creado y stage nuevo armado y verificado. El `vercel deploy` NO se ejecutó** (lo bloqueó el clasificador de permisos del entorno como «despliegue a producción»; no se reintentó por otra vía). Sin push, sin promoción, sin dominios, sin migraciones, sin variables, sin Resend ni correos.

## Gate oficial completo (worktree `integracion/d80-correo`, con el parche aplicado)
* 1.er intento: pasos 1–5 OK, **paso 6 (build) falló por el entorno, no por el código**: Turbopack rechaza un `node_modules` que es un enlace (junction) fuera de la raíz («Symlink [project]/node_modules is invalid, it points out of the filesystem root»). Se sustituyó el enlace por una copia real de `node_modules` (ignorada por git).
* 2.º intento: **`qa:gate: TODO OK`, 10/10** — typecheck (69 s), críticas, seguridad, secretos (0), lint sin empeorar, build (55/55 páginas), navegador (Playwright), axe, baselines visuales, smoke de API. Se añadió al worktree un `.env.local` con **solo** variables `NEXT_PUBLIC_*` copiadas del candidato (ignorado por git; sin secretos de servidor).
* Fallos nuevos causados por el cambio: ninguno. Preexistentes demostrados (anexo 11): los de la suite completa de la copia (`task-observer`, `medios-optimizar`, `wafloat-oclusion`) que no forman parte del gate.

## Commit
* Rama **`integracion/d80-correo`**, commit **`a6ebdb65395e8618f97df54cc0639728a3bda8c1`** (padre `1af90017…`), autor `Grupo P11`, **14 archivos** (+743 −39), solo los del parche; worktree limpio después. **Sin push** a ningún remoto; `origin` no se tocó; no se cambió de rama ni se modificó el repositorio principal (`nextjs-migration`, 274 cambios intactos).

## Stage nuevo (el anterior `vivebien-deploy-stage-d80-final` NO se tocó)
* Armador `armar_stage_d80_v2.py` (copia del fail-closed, con la lista cerrada ampliada en +4 modificados y +4 nuevos del modo de pruebas; trabajo = worktree de integración, solo lectura; salida a carpeta NUEVA `C:\Users\jemil\vivebien-deploy-stage-d80-modo-pruebas`; archivos de referencia `*_d80v2.json`). Validación en seco y ejecución OK; base aprobada y producción comprobadas (GET).
* **Manifiesto SHA-256 `7ea9168f54ccae00e76a63cf0c52132fbcda47b2744ccbaf19320dd5c914e318`** (773 archivos) · **Payload SHA-256 `f08c0c4159548e0b9d1dd7c938c6d4f0d550d822c56ccec833cc661e2fadb50e`** (408 archivos).
* `verificar_stage_d80_v2.cjs`: **17/18 OK** (recalcula sha256 y sha1 de cada archivo, payload == esperado, producción en `dpl_99T2…`, stage vs producción 370/382 con exactamente 12 distintos = 8 de D-80 + 4 emisores, 51 cambios idénticos al commit `a6ebdb6`, sin `.env`). La 18.ª es el **falso positivo conocido** de la heurística (el comentario de la línea 6 de `config.ts`, idéntico al del stage anterior); se informa, no se «arregla».
* Mismo `.vercel/project.json` y `.vercelignore` que el stage anterior (proyecto `vive-bien`).

## Deployment: NO creado
Comando previsto (procedimiento de D-77/D-80, anexo 9): desde la carpeta del stage, `vercel deploy --prod --skip-domain --yes`; después `verificar_deployment_d80.py <dpl> --manifest-sha 7ea9168f… --payload-sha f08c0c41…`. Lo denegó el clasificador de permisos del entorno. **Acción mínima:** que el propietario ejecute ese comando (`! cd C:\Users\jemil\vivebien-deploy-stage-d80-modo-pruebas && vercel deploy --prod --skip-domain --yes`) o añada una regla de permiso para él. Mientras tanto no hay deployment nuevo que contenga el modo de pruebas; `dpl_EMjwLjmxwh3XeXN9cc66U9YK1yS8` NO lo contiene y no sirve de evidencia.

## Producción
`vivebienn.com` sigue sirviendo `dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z` (verificado por el verificador de stage, que consulta los alias de `vivebienn.com` y `www`, y por el HTML público). Rollback (si algún día se promoviera): `vercel promote dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z --yes`.

## Pendiente
Crear el deployment STAGED + verificador de deployment (acción del propietario o permiso); borrar/renombrar el `.git` copiado en `vivebien-d80-modo-pruebas` (apunta al worktree de integración; no se usó); integrar las ramas en `nextjs-migration`; y todo lo de la activación del correo (migraciones 36/37, variables `CORREO_*`, webhook y DMARC, revisión legal, prueba controlada, Codex hasta 2026-11-06).
