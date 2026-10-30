# D-75.3 / D-76.1 · Cierre final de guardados y correo institucional (8-oct-2026)

> **ACTUALIZADO POR D-77 (8-oct-2026):** el propietario verificó que `informes@vivebienn.com` existe y recibe. La copia transitoria a `joseponcer@` (§1, §2, §4) **fue eliminada**: `aviso-lead.ts` quedó `to: [CORREO_CONTACTO]`, idéntico a producción, y `COPIA_INTERNA_AVISOS` ya no existe. Lo que sigue en §1 se conserva como historia del análisis.

**Estado: READY FOR CANDIDATE (no se creó el candidato). Sin commit, push, deploy, promote; producción sigue en E-36→E-39.** Árbol limpio: `C:\Users\jemil\vivebien-deploy-stage-d75` = producción E-36→E-39 + D-75 + D-76, sin V-1.1.95.

## 1 · `aviso-lead.ts`: análisis ANTES de seguir (diff exacto)
Diff contra producción: **una sola línea** (`to:`) y su comentario; el resto del archivo es idéntico.
| | |
|---|---|
| **A · Antes** | `to: [CORREO_CONTACTO]`, donde `CORREO_CONTACTO = NEGOCIO.email = joseponcer@vivebienn.com`. Un destinatario: la persona. |
| **B · Nuevo** | `to: [CORREO_CONTACTO, COPIA_INTERNA_AVISOS]` = `[informes@, joseponcer@]`. |
| **C · Estrictamente necesario para D-76** | **Nada del archivo.** Con sólo cambiar `NEGOCIO.email`, `to: [CORREO_CONTACTO]` ya resolvía a `informes@`. |
| **D · ¿Funcionalidad nueva de notificación?** | **No.** Es el MISMO correo, enviado por la MISMA llamada a Resend, con un destinatario más. No hay mensajes nuevos, ni canales, ni lógica. |
| **E · ¿Duplicar avisos?** | No hay un segundo envío (un único correo con dos destinatarios). Sólo si `informes@` fuera un grupo que reenvía a `joseponcer@`, esa persona vería dos copias (cosmético). |
| **F · ¿Cambia el destinatario de leads?** | Sí, a propósito: el institucional pasa a recibirlos; `joseponcer@` los sigue recibiendo igual que antes. |
| **G · Pérdida / exposición** | **Pérdida:** sin la copia, si `informes@` no existiera, los leads se perderían (no se puede comprobar, ver §4). **Exposición:** ninguna nueva — los mismos datos van a la misma persona que ya los recibía; `joseponcer@` no se publica. |
**Decisión:** la copia NO es necesaria para D-76, pero **no cambia el comportamiento que ya tenía quien la recibe** y evita el único riesgo real (leads perdidos). Se conserva, pero ahora **explícita y etiquetada como DESTINATARIO INTERNO TRANSITORIO**, no como contacto: `COPIA_INTERNA_AVISOS` en `src/lib/config/negocio-interno.ts`, con su porqué en el comentario.
- **Por qué:** `informes@` no está verificado (Resend prueba el dominio, no el buzón).
- **Cuánto tiempo:** **sin fecha**; depende de que el administrador de Google Workspace confirme el buzón.
- **Riesgo que evita:** perder leads.
- **Qué ocurrirá al confirmar:** borrar la constante `COPIA_INTERNA_AVISOS`, su `import` y el segundo elemento de `to:` en `aviso-lead.ts` (3 líneas) + la prueba que la fija. **Queda preparado, NO ejecutado** (no se puede confirmar hoy el buzón).
- Una prueba impide que se convierta en arquitectura permanente sin notarlo: sólo `aviso-lead.ts` puede leerla y su valor está fijado.

## 2 · Los correos personales ya no viajan en el JavaScript público
**Hallazgo de seguridad al revisar:** `NEGOCIO` lo importa casi todo el sitio; cualquier dirección dentro acaba en el JS de los navegadores. En **producción hoy** `joseponcer@vivebienn.com` está en un chunk público (verificado con GET). En D-76 (primera versión) seguía dentro de `NEGOCIO` (`cuentaPropietario`).
**Corrección (D-76.1):** `src/lib/config/negocio-interno.ts` (nuevo) con `CUENTA_PROPIETARIO` y `COPIA_INTERNA_AVISOS`; **fuera de `NEGOCIO`**. Sólo lo importan `admin/seed/page.tsx`, `api/telegram/webhook/route.ts` y `lib/aviso-lead.ts` (guardia con lista exacta).
**Resultado medido** en el build del árbol limpio: `joseponcer@` aparece en **un solo chunk** (la pantalla de siembra del administrador); ya no está en el JS común ni en ningún HTML público (8 rutas revisadas: sólo `informes@` y placeholders `juan@ejemplo.com`/`correo@ejemplo.com`). `gp-once.com` en el JS es el enlace al sitio de la empresa (`https://gp-once.com`), no un correo; `joseponcep@` no está en el código.
**ERROR / CONTEXTO / CAUSA / SOLUCIÓN / PREVENCIÓN:** ERROR: direcciones personales en el JS público. CONTEXTO: `NEGOCIO` es una constante compartida. CAUSA: se añadieron los campos internos al mismo objeto. SOLUCIÓN: módulo aparte. PREVENCIÓN: `tests/correo-institucional.test.ts` verifica que `JSON.stringify(NEGOCIO)` no contenga direcciones personales y fija los únicos importadores.

## 3 · Resend (sólo configuración; no se envió nada)
- `RESEND_API_KEY`: **existe** en Vercel (Producción). Valor no consultado ni documentado.
- `RESEND_FROM`: **no existe** en Vercel (ni Producción, Preview ni Development: sólo se listaron nombres).
- Fuente del remitente: `process.env.RESEND_FROM || NEGOCIO.remitente` → **`Vive Bien <informes@vivebienn.com>`** (así lo calcula el código; no se hizo ningún envío de prueba, así que **no se afirma** que un envío haya sido exitoso).
- (A) **Dominio verificado en Resend:** SÍ (`vivebienn.com`, envío habilitado, región us-east-1; recepción en Resend deshabilitada).
- (B) **Remitente autorizado:** Resend autoriza cualquier dirección del dominio verificado; **no hay configuración por remitente**.

## 4 · Buzón `informes@vivebienn.com` (A/B ≠ C/D)
- (C) **¿Existe el buzón?** y (D) **¿recibe correo?**: ~~PENDIENTE~~ **VERIFICADO manualmente por el propietario el 8-oct-2026** (sin contraseñas ni secretos).
- Intentado (no destructivo): MX = `smtp.google.com` (Google Workspace). Una consulta SMTP `RCPT TO` al MX **no se pudo hacer** (el puerto 25 saliente está bloqueado: timeout). No hay herramienta autorizada de Workspace.
- **Qué debe comprobar el administrador de Google Workspace:** (1) que `informes@vivebienn.com` exista como usuario, alias o grupo; (2) que reciba correo EXTERNO (desde una cuenta ajena al dominio, p. ej. Gmail); (3) quién lo lee; (4) si es un grupo/alias que reenvía a `joseponcer@` (duplicaría la copia); (5) que no tenga reglas que lo manden a spam. Sin contraseñas ni secretos.
- **Es condición para promover.**

## 5 · Citas (`citas/enviar.ts`)
Diff: **una línea** (`reply_to: NEGOCIO.email`) + comentario. `to: [opts.para]`, `subject`, `html`, `text`, adjunto `.ics` y `Idempotency-Key` **no cambian**: el destinatario sigue siendo la persona de la cita, el contenido es el mismo, no expone datos (la dirección institucional es pública). La respuesta de quien reciba el correo llega a `informes@` en vez de a un remitente que no lee nadie. Prueba: `correo-institucional.test.ts` (reply_to presente y `to`/`subject`/`html` intactos). **Limitación:** es una prueba estática del código; no hay un envío real de prueba (no se hizo ninguno).

## 6 · Documentación de email
`docs/email-flow.md` actualizado: sección «0 · Correo institucional y Resend» (correo oficial, remitente, reply-to, destinatarios internos, cuentas personales, dominio verificado, qué depende de ENV, qué falta verificar), nota de cabecera, y la copia opcional del admin ahora apunta al institucional. Sin secretos.

## 7 · `NEXT_PUBLIC_ADMIN_EMAIL`
- **Código:** **0 lecturas** (`src`, `scripts`, `tests`, `next.config.ts`, `vercel.json`). Sólo aparece en un **comentario** de `src/lib/contacto.ts` (historia: antes alimentaba el correo del aviso de privacidad) y vacía en `.env.example`.
- **Vercel:** existe en **Producción** (creada hace ~185 días). Como ningún código la referencia, ni siquiera se incrusta en el JS.
- **Función real:** ninguna. Es **legado** (el comentario dice que apuntaba a un Gmail personal). Se sustituyó hace tiempo por la constante.
- **No se borró.** **PENDIENTE DE LIMPIEZA DE ENV** (requiere acceso a Vercel y autorización explícita). No confundir con `NEXT_PUBLIC_ADMIN_EMAILS` / `ADMIN_EMAILS` (plural), que sí existen y se usan.

## 8 · Términos, privacidad, cookies, ayuda
- **Términos y Condiciones:** `informes@vivebienn.com` (confirmado en el HTML construido de `/terminos`: «Para dudas sobre estos términos: informes@…» y la solicitud de eliminación de datos).
- **Aviso de Privacidad:** `informes@vivebienn.com` (ARCO, finalidades secundarias, consultas; confirmado en `/privacidad`).
- **Cookies:** **no existe una página independiente**; la sección de cookies vive dentro del Aviso de Privacidad y no cita ninguna dirección. No se inventó otra página.
- **PENDIENTES LEGALES (no inventados):** razón social completa, RFC, representante legal, domicilio legal completo, fecha jurídica de última actualización. Hoy la privacidad dice «Vive Bien Inmobiliaria / Grupo P-ONCE con domicilio en León, Guanajuato».
- **Centro de Ayuda: PASS — no requiere cambio.** Ningún artículo (migraciones 27–35) contiene un correo (guardia en el test). `supabase/35-ayuda-guardados.sql` (+ `.REVERTIR`) sigue **PREPARADA, NO APLICADA**; su prueba pasa.

## 9 · Guardados: prueba real en navegador
`tests-visual/guardados.e2e.ts` (6 pruebas × 4 anchos = 24; equipo enchufado; Playwright real):
- **Catálogo → Mis guardadas → quitar → catálogo:** A inicia sesión; guarda desde `/propiedades`; entra a `/portal/propiedades`: **aparece** (título real de la fixtura) con el corazón lleno; la **quita desde Mis guardadas** (`aria-pressed` cambia); vuelve al catálogo por navegación del cliente: **sin guardar**; **recarga**: sigue sin guardar; Mis guardadas queda vacía; no hay `vb_*favor*` en `localStorage`.
- **A → logout → B → A:** A guarda y la ve; sale por el menú; B entra: **Mis guardadas vacía y catálogo sin corazones llenos**; B guarda otra; **A vuelve y ve sólo la suya** (no la de B); en el «servidor» simulado cada uid conserva sólo lo suyo.
- + las 4 anteriores (sin sesión → `/entrar`, guardar/refresh/quitar/refresh, doble clic, A/B/A desde la barra pública).
- **Resultado:** **24/24 pasan** en la corrida dirigida y de nuevo dentro del gate (**119/119** en el paso 7 = 95 + 24), sin reintentos ni flaky.
- **Límite honesto:** el portal y `/api/favoritos` se simulan (la autenticación real de Firebase no es posible sin cuentas reales); el «servidor» simulado es compartido por catálogo y portal. Prueba que la UI y el almacén compartido son consistentes; la persistencia real en la tabla la prueban las pruebas de Vitest con la ruta real (`favoritos-guardados`).
- **Accesibilidad:** el corazón del catálogo ahora tiene `aria-label` («Guardar X» / «Quitar X de guardadas») + `aria-pressed`, igual que la tarjeta del portal (que ya lo tenía). axe: **24/24 pasan sin empeorar** (paso 8 del gate). No se rediseñó nada.

## 10 · qa:gate (árbol limpio, enchufado)
**Corrida final: `qa:gate: TODO OK`.**
| Paso | Resultado |
|---|---|
| 1 typecheck | ✓ |
| 2 pruebas críticas | ✓ 17 archivos, **186** pruebas |
| 3 seguridad | ✓ 8 archivos, **107** |
| 4 secretos | ✓ |
| 5 lint | ✓ 63 errores (base 64), sin empeorar |
| 6 build | ✓ |
| 7 navegador | ✓ **119/119** (95 + 24 de guardados), sin reintentos |
| 8 axe | ✓ **24/24** sin empeorar |
| 9 visuales | ✓ **48/48**, sin flaky esta vez |
| 10 API | ✓ |
Hubo una corrida previa (también `TODO OK`) antes del refactor de §2; se repitió completa después de él. La corrida de la mañana falló por causas ya documentadas (no del producto).
**Visual específico del correo** (las 48 capturas no cubren el pie ni los legales): se renderizó el árbol construido y se revisó a mano pie, contacto, términos, privacidad y portada en escritorio (1440) y móvil (390). El texto `informes@vivebienn.com` cabe sin desborde ni cortes; mismo diseño. «Mis guardadas» del portal se revisó indirectamente por el e2e (sin línea base visual propia).

## 11 · Seguridad
Sin secretos en el cliente: escáner de secretos ✓; el único JWT en el JS es la **clave anónima de Supabase** (rol `anon`, pública por diseño, y apuntando a la réplica local en este build de prueba); no hay `service_role`, ni claves de Resend (en producción tampoco). Sin cambios de auth, RLS, roles ni permisos. Sin correos personales en páginas (guardia) y sólo uno en el JS (pantalla de siembra).

## 12 · Separación V-1.1.95 (reverificada)
`vivebien-deploy-stage-d75/src` difiere de producción **sólo** en: `PropertyCard.tsx` (hunks D-75 + `aria-label`), `api/favoritos`, `api/eventos`, `Metricas`, `MisFavoritos`, `portal/guardadas`, `hooks/use-favoritos` (nuevo), `lib/favoritos/*` (nuevo), y D-76: `lib/config/negocio.ts`, `lib/config/negocio-interno.ts` (nuevo), `lib/aviso-lead.ts`, `lib/citas/enviar.ts`, `app/admin/seed/page.tsx`, `app/api/telegram/webhook/route.ts`. Los 5 archivos del residuo (`globals.css`, 2× `page-client`, `Entrar.tsx`, `PortalShell.tsx`) son **idénticos a producción**; `PropertyCard.tsx` no contiene `usaElCarrusel` ni la precarga de fotos; `package.json`, `package-lock.json` y `next.config.ts` = producción. El repo no se tocó para separar.

## 13 · Pendientes y riesgos
1. ~~Verificar el buzón `informes@`~~ **HECHO (8-oct-2026, D-77).** Copia interna eliminada.
2. Datos legales de privacidad/términos.
3. `NEXT_PUBLIC_ADMIN_EMAIL`: limpieza de ENV con autorización.
4. Migración de ayuda 35: aplicarla DESPUÉS del despliegue.
5. Ningún envío real se probó (sólo configuración y código).
6. El repo sigue con el residuo V-1.1.95; un commit del repo tal cual lo arrastraría.
7. Flakiness visual de fuentes/terceros: no resuelta (esta corrida: 0 flaky, sin garantía).
8. **Codex: BLOCKED — cuota hasta el 6-nov-2026.** Sin PASS inventado.
