# D-76 · Correo institucional de VIVE BIEN (8-oct-2026)

**Estado: PREPARADO Y PROBADO EN LOCAL (árbol limpio `vivebien-deploy-stage-d75` y repo). NO desplegado, sin commit/push. Producción sigue publicando `joseponcer@vivebienn.com` hasta que se promueva.**

## Decisión
- **Correo OFICIAL de VIVE BIEN: `informes@vivebienn.com`.** Es el correo que el negocio publica y al que llegan los avisos del equipo.
- **Correos personales CONSERVADOS (no se eliminan ni se cambian):** `joseponcer@vivebienn.com` y `joseponcep@gp-once.com`. Son cuentas de personas (usuarios del sistema, roles sembrados, invitaciones). **No se utilizan como contacto institucional público.**
- **No se tocó el correo de ninguna cuenta de usuario.** Lo que cambió es la dirección con la que VIVE BIEN se presenta y comunica.
- **Fuente única:** `src/lib/config/negocio.ts` (`NEGOCIO.email`). Ya existía (V-1.1.77, DAT-03) y todo el sitio lee de ahí vía `CORREO_CONTACTO`; no se creó otra constante.

## El hallazgo que importaba (ERROR evitado)
**ERROR (potencial):** cambiar `NEGOCIO.email` sin más habría roto dos cosas, porque esa constante servía para DOS significados distintos.
**CONTEXTO:** `NEGOCIO.email` era a la vez (a) el contacto público y (b) la identidad de la CUENTA del propietario: `admin/seed/page.tsx` compara contra él el correo de quien inició sesión (`ADMIN_EMAIL = CORREO_CONTACTO`), y `api/telegram/webhook/route.ts` lo usa como respaldo para encontrar al propietario (`TELEGRAM_OWNER_EMAIL || NEGOCIO.email`).
**CAUSA:** una constante con dos significados («correo del negocio» y «correo del dueño») porque hasta hoy eran la misma dirección.
**SOLUCIÓN:** nueva constante `CUENTA_PROPIETARIO = 'joseponcer@vivebienn.com'` (identidad de usuario, nunca pública); la siembra y el respaldo de Telegram usan ésa. `NEGOCIO.email` pasa a `informes@vivebienn.com`.
**PREVENCIÓN:** `tests/correo-institucional.test.ts` fija quién puede leer `CUENTA_PROPIETARIO` (sólo la siembra y Telegram), prohíbe direcciones personales en las páginas y el Footer, y prohíbe escribir `informes@`/`avisos@` a mano fuera de la fuente. **No** prohíbe `joseponcer@` en todo el código (las cuentas son legítimas en pruebas y semillas). Verificada con mutación: con el correo antiguo en `NEGOCIO.email` la guardia falla.

## Inventario clasificado (búsqueda específica, sin reemplazo global)
| Aparición | Clase | Acción |
|---|---|---|
| `NEGOCIO.email` → Footer, Contacto, Aviso de privacidad (§ARCO, finalidades secundarias, consultas), Términos (eliminación de datos y dudas), página de error, `mailtoDe()` de las tarjetas, JSON-LD `RealEstateAgent.email` | INSTITUCIONAL_PUBLICO / LEGAL | **Cambia sola a `informes@`** (todas leen la constante) |
| `NEGOCIO.remitente` (`Vive Bien <avisos@vivebienn.com>`) → avisos de interesados, correos de citas, invitaciones | TRANSACCIONAL | **Cambia a `Vive Bien <informes@vivebienn.com>`** (ver abajo) |
| `aviso-lead.ts` `to:` (aviso de nuevo interesado) | TRANSACCIONAL (destinatario del equipo) | **`[informes@]`** (desde D-77; antes `joseponcer@`) |
| `citas/enviar.ts` | TRANSACCIONAL | **Se añade `reply_to: informes@`** (antes no tenía) |
| `admin/seed/page.tsx` (`ADMIN_EMAIL`) | CUENTA_USUARIO | **No cambia de persona:** ahora lee `CUENTA_PROPIETARIO` |
| `telegram/webhook` (`duenoTelegram`) | CUENTA_USUARIO | **No cambia:** respaldo = `CUENTA_PROPIETARIO` (en Vercel además existe `TELEGRAM_OWNER_EMAIL`) |
| `supabase/21-roles-solo-en-la-base.sql` (`joseponcer@`, `joseponcep@gp-once.com`) | PERSONAL_INTERNO / CUENTA_USUARIO | **No se toca** (roles sembrados) |
| `tests/acceso.test.ts`, `invitaciones-*`, `migracion-32-*` (`joseponcer@`, `joseponcep@`) | CUENTA_USUARIO (fixtures) | **No se tocan** |
| `src/lib/citas/ics.ts` `UID:…@vivebienn.com` | técnico (identificador de evento, no buzón) | **No se toca** |
| `VistaPreviaAdmin`, `vista-previa-permisos` (`admin@vivebienn.test`) | datos de prueba | **No se tocan** |
| Correos de ejemplo en formularios (`correo@ejemplo.com`) | placeholder | No se tocan |
| `docs/*.md` (email-flow, IMPLEMENTATION_PLAN, DECISIONS, appointments-architecture) | DOCUMENTACION | Históricas; esta decisión es la vigente (`docs/email-flow.md` conserva el diseño anterior: marcado aquí como superado en cuanto al remitente/destino) |
| Centro de Ayuda (migraciones 27–35) | — | **Ningún artículo escribe una dirección**: no hay nada que corregir (guardia en el test) |
| Política de cookies | — | **No existe como página aparte**; la sección de cookies está dentro del Aviso de privacidad y no cita ninguna dirección |

## Correos transaccionales (qué usa el sistema y por qué)
- **Hoy:** envía con Resend por `fetch`. `from` = `process.env.RESEND_FROM || NEGOCIO.remitente`. En Vercel **`RESEND_FROM` NO está definida** (se listaron los *nombres* de las variables, sin valores), así que manda `NEGOCIO.remitente` (antes `avisos@`). El aviso de interesados iba a la dirección de contacto (antes `joseponcer@`).
- **Lo que Resend permite (verificado, sólo lectura):** el dominio `vivebienn.com` está **verificado**, con **envío habilitado** (recepción en Resend deshabilitada). Cualquier dirección de ese dominio puede ser remitente; por eso se pudo poner `informes@` como remitente por defecto, sin tocar variables.
- **Recepción:** el MX de `vivebienn.com` es Google (`smtp.google.com`, Workspace). **NO VERIFICADO:** que el buzón/alias `informes@vivebienn.com` exista y reciba. Es una verificación externa (administrador de Workspace) y es la **condición para promover**: sin ese buzón, los avisos de interesados, las respuestas de clientes a correos de citas y los mensajes de ARCO (privacidad) rebotarían.
- **Buzón verificado (D-77, 8-oct-2026):** el propietario comprobó manualmente que `informes@vivebienn.com` existe y recibe. Por eso se **eliminó** la copia transitoria a `joseponcer@`: el aviso de nuevos interesados va **sólo** a `informes@` (`to: [CORREO_CONTACTO]`; `aviso-lead.ts` queda idéntico a producción, el cambio llega por `NEGOCIO.email`). Las invitaciones conservan el `reply_to` de quien invita; el aviso de interesados responde al correo del propio interesado.
- **ENV:** no se necesita ninguna variable nueva ni cambiada. `NEXT_PUBLIC_ADMIN_EMAIL` sigue existiendo en Vercel pero **ningún código la lee** (deuda: borrarla requiere acceso a Vercel y autorización).

## Términos, privacidad, cookies, ayuda, SEO
- **Términos y Condiciones:** el correo de contacto sale de la constante → `informes@vivebienn.com` (eliminación de datos y dudas). Sin otros cambios; no se inventó ningún dato jurídico.
- **Aviso de Privacidad:** igual (derechos ARCO, finalidades secundarias, consultas). **PENDIENTE LEGAL (no se inventa):** razón social completa, RFC, domicilio legal completo del responsable, fecha de última actualización; hoy dice «Vive Bien Inmobiliaria / Grupo P-ONCE con domicilio en León, Guanajuato». Debe decidirlo el responsable/abogado.
- **Cookies:** no hay política separada; nada que cambiar.
- **Centro de Ayuda:** ningún artículo cita una dirección. La corrección de «¿Cómo guardo una propiedad?» (migración 35) sigue preparada y sin aplicar.
- **SEO / datos estructurados:** `RealEstateAgent.email` del JSON-LD = `informes@vivebienn.com` (misma fuente). No se tocó nada más de SEO.

## Archivos
- **Modificados (idénticos en repo y árbol limpio):** `src/lib/config/negocio.ts`, `src/lib/aviso-lead.ts`, `src/lib/citas/enviar.ts`, `src/app/admin/seed/page.tsx`, `src/app/api/telegram/webhook/route.ts`, `tests/negocio.test.ts`, `scripts/qa/gate.cjs` (guardias en las críticas).
- **Nuevos:** `tests/correo-institucional.test.ts`.
- **No se tocaron** los archivos V-1.1.95.

## Riesgos y pendientes
1. ~~`informes@` debe existir y recibir~~ **VERIFICADO por el propietario el 8-oct-2026.**
2. Al promover, el correo cambiará en TODAS las superficies a la vez.
3. Datos legales faltantes en privacidad/términos (arriba).
4. `docs/email-flow.md` describe el diseño anterior (remitente `avisos@`): conviene actualizarlo cuando se promueva.
5. `NEXT_PUBLIC_ADMIN_EMAIL` huérfana en Vercel.
