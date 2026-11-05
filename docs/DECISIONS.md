# VIVE BIEN — Decisiones y contradicciones

> Registro vivo. Cada contradicción entre documentos, instrucciones y código queda aquí con su decisión (o con la marca de quién tiene que decidir).
> Jerarquía aplicada (prompt maestro §2): 1) decisiones explícitas más recientes · 2) Master PRD v2.0 · 3) reglas de negocio · 4) manual de marca/SEO · 5) blueprints anteriores · 6) código actual · 7) buenas prácticas.
>
> Marcas: **[TECHNICAL PROPOSAL]** · **[BUSINESS DECISION REQUIRED]** · **[LEGAL REVIEW REQUIRED]** · **[DESIGN DECISION REQUIRED]**
> Estado: `DECIDIDA` (la documentación la resuelve) · `PROPUESTA` (propuesta técnica; se aplica si nadie objeta al aprobar la fase 0) · `PENDIENTE` (necesita a alguien).

Relacionados: [`AUDIT_CURRENT_SYSTEM.md`](AUDIT_CURRENT_SYSTEM.md) · [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) · [`adr/`](adr/)

---

## Índice

| ID | Tema | Estado | Marca |
|---|---|---|---|
| D-01 | Firestore/Cloud Functions/Cloud Tasks del PRD vs Supabase/Next/Vercel reales | DECIDIDA | ADR-0001–0003 |
| D-02 | Contacto público y leads: al publicador hoy, a VIVE BIEN según el PRD | DECIDIDA 18-sep | — |
| D-03 | Texto de consentimiento dice «se compartirán con su anunciante» | PENDIENTE | [LEGAL REVIEW REQUIRED] |
| D-04 | «No quiero un CRM» (16-sep) vs leads/operaciones/comisiones del PRD | DECIDIDA | — |
| D-05 | «Nada nuevo en el admin más que el calendario» vs admin completo del PRD | DECIDIDA | — |
| D-06 | Menú del cliente: especificación del portal vs navegación del PRD | DECIDIDA 18-sep | — |
| D-07 | Rojo de marca: `#A30D12` (PRD) vs `#971010` (panel) vs `#8B1A1A`/`#C8102E` (sitio) | DECIDIDA 18-sep | — |
| D-08 | Citas: el «asesor» es el dueño de la propiedad si puede atender citas (equipo o publicador con `recibir_citas`); ver los datos del cliente es un permiso aparte (`ver_datos_interesado`, apagado por defecto) | DECIDIDA 18-sep · ENMENDADA 2-oct (D-47) | ADR-0013 |
| D-09 | Activación de publicador: cambio de rol hoy vs flujo con solicitud y acuerdo | DECIDIDA 18-sep | — |
| D-10 | Estados de propiedad del PRD vs `estado_pub` + `estatus` | DECIDIDA 18-sep | — |
| D-11 | El admin publica directo vs publicar tras comisión y acuerdo | DECIDIDA 18-sep | — |
| D-12 | Editar lo publicado en el asistente (V-1.1.74) vs revisiones | DECIDIDA | ADR-0005 |
| D-13 | SUPER_ADMIN: quién es | DECIDIDA 18-sep | — |
| D-14 | Custom claims del PRD vs roles en base de datos | DECIDIDA | ADR-0004 |
| D-15 | Dinero en `numeric` / floats | DECIDIDA | ADR-0007 |
| D-16 | Documentos privados: dónde se guardan | DECIDIDA | ADR-0008 |
| D-17 | Datos NAP definitivos | RESUELTA DE HECHO 19-sep (los que ya publicaba el sitio) | — |
| D-18 | Comisión por defecto dentro de 3–4 % e impuestos | PENDIENTE | [BUSINESS DECISION REQUIRED] + revisión contable |
| D-19 | Textos jurídicos (acuerdos, términos, privacidad, no elusión, retiro, suspensión) | PENDIENTE | [LEGAL REVIEW REQUIRED] |
| D-20 | Entorno de staging | PENDIENTE (costo) | [BUSINESS DECISION REQUIRED] |
| D-21 | Proveedor de IA para el Marketing Hub | PROPUESTA | [TECHNICAL PROPOSAL] |
| D-22 | App Check del PRD sin Firebase en el backend | PROPUESTA | [TECHNICAL PROPOSAL] |
| D-23 | Slugs de relleno en dos fichas publicadas | DECIDIDA 18-sep | — |
| D-24 | «Mis consultas» sin estado de seguimiento (mockup del portal) | DECIDIDA | — |
| D-25 | Cuenta Meta (Business Manager, página, Instagram, app) | PENDIENTE | dependencia externa |
| D-26 | Bóveda de Obsidian separada (Grupo Ponce / OTLI) | DECIDIDA | — |

---

## Respuestas del usuario — 18-sep-2026

- Diagnóstico **aprobado** (gate de la fase 0).
- **D-02:** el número que termina en 8559 **es de VIVE BIEN**. Se aplica la propuesta aprobada: los CTAs públicos usan el número oficial de `configuracion` (477 811 6501); el campo del anuncio deja de publicarse.
- **D-08:** las visitas las atiende **el admin**, por ahora.
- **D-13:** Super Admin = `jemilianoponceperez@gmail.com`, `joseponcep@gp-once.com`, `joseponcer@vivebienn.com`. El cuarto correo de `ADMIN_EMAILS` (`…@live.com.mx`) queda como admin.
- **Resto:** «okay» a las propuestas de la tabla de Pendientes → D-06 (menú del portal + Valuador), D-07 (`#A30D12` en todo), D-09 (la cuenta publicador actual se registra como alta manual), D-10 (mapeo propuesto; `rechazada` = CHANGES_REQUESTED, `eliminada` = WITHDRAWN; no se agrega RESERVED), D-11 (las propias publican sin comisión ni acuerdo), D-23 (renombrar los dos slugs con 301).
- **Siguen pendientes:** D-03/D-19 (abogado), D-18 (comisión por defecto e IVA), D-20 (staging). D-17 queda resuelta de hecho: se centralizaron los datos que el sitio ya publicaba (V-1.1.77).

## Aplicación — 19-sep-2026 (V-1.1.77, fase 1)

- **D-02 aplicada:** la ficha, las tarjetas y el listado usan sólo el número oficial; el asistente ya no pide WhatsApp; `whatsapp`/`telefono` del anuncio son campos reservados (no se borraron); `/api/contacto` avisa a atención de VIVE BIEN (correo + WhatsApp interno `WHATSAPP_ATENCION`) y nunca al dueño.
- **D-08 (candado):** hasta la tarea 08.01, una visita sólo se agenda si el dueño de la propiedad puede atender citas: personal de VIVE BIEN (admin/super_admin) **o, desde el 2-oct-2026 (D-47/ADR-0013), un publicador con `recibir_citas`**. Hoy todos los dueños con cuenta son del equipo, así que nada cambia para el público.
- **D-17:** resuelta de hecho con los datos que ya publicaba el sitio (pie y «Nosotros»), ahora en `src/lib/config/negocio.ts`.
- **D-03 — riesgo documentado, sin tocar:** el consentimiento vigente (`2026-09-16`) dice que los datos «se compartirán con su anunciante». Desde V-1.1.77 ya **no** se comparten: el sistema hace menos de lo consentido, que es lo seguro. El texto nuevo y el aviso de privacidad los redacta el abogado (D-03/D-19); cambiar el texto sube `VERSION_CONSENTIMIENTO`.
- Al aplicar D-13 apareció **SEC-00** (lista de admins sin correo verificado): arreglado y desplegado en **V-1.1.76**.

## D-01 · Stack: Firestore y Cloud Functions vs Supabase y Next

- **Conflicto:** el PRD (§10, §11, §25) describe Firestore, Cloud Storage, Cloud Functions 2nd gen, Cloud Tasks, App Check, Security Rules y Emulator. El sistema real usa Supabase Postgres (desde abril 2026), Route Handlers de Next.js en Vercel, Cloudinary y funciones plpgsql; Firebase sólo para Auth.
- **Documentos:** PRD §10–11, §25, §26 vs código y la propia Corrección 06 y §28 del PRD («no reconstruir; auditar y extender la arquitectura existente»; «crear ADR de stack real antes de introducir dependencias»).
- **Impacto:** migrar a Firestore sería reescribir datos, API, seguridad y pruebas sin beneficio funcional; romper lo que funciona.
- **Decisión:** se conserva el stack real. Las «colecciones» del PRD se implementan como **tablas Postgres**, las Security Rules como **RLS + validación en servidor**, las Cloud Functions como **Route Handlers + funciones plpgsql transaccionales**, Cloud Tasks como **tabla de trabajos + `pg_cron`/`pg_net`**. Ver [ADR-0001](adr/ADR-0001-postgres-como-fuente-de-verdad.md), [ADR-0002](adr/ADR-0002-backend-route-handlers-y-postgres.md), [ADR-0003](adr/ADR-0003-trabajos-asincronos-pg-cron.md).
- **Estado:** DECIDIDA.

## D-02 · Contacto público y leads

- **Conflicto:** el PRD (Corrección 01, §7) exige que todo contacto llegue a VIVE BIEN y que el publicador nunca reciba PII ni publique su teléfono. Hoy: el asistente permite al publicador poner el **WhatsApp del anuncio**; la ficha y las tarjetas lo usan (`prop.whatsapp || WA_NUMBER`); `/api/contacto` le manda al dueño nombre, WhatsApp y correo del interesado (`notificarPublicador`).
- **Impacto hoy:** bajo (las 18 propiedades son del admin); **inmediato con el primer publicador externo**. Las 7 publicadas tienen dos números distintos: uno termina en **6501** (el oficial, 477 811 6501) y otro en **8559**.
- **Decisión técnica:** los CTAs públicos usan sólo el número de `businessConfig`; `propiedades.whatsapp/telefono` dejan de ser públicos (se conservan como dato interno, no se borran); los avisos de lead van a atención de VIVE BIEN; el publicador ve sólo agregados. Ver [ADR-0006](adr/ADR-0006-publicador-sin-pii-de-leads.md).
- **Falta decidir:** ¿el número que termina en 8559 es de VIVE BIEN (un asesor) o de un tercero? ¿Todas las fichas deben usar el oficial, o las propiedades propias pueden llevar el número del asesor de VIVE BIEN que las atiende? **[BUSINESS DECISION REQUIRED]**
- **Estado:** técnica DECIDIDA; número PENDIENTE.

## D-03 · Consentimiento vigente

- **Conflicto:** el texto aceptado hoy (versión `2026-09-16`) dice «Mis datos se usarán para atender mi solicitud y, si es sobre una propiedad, **se compartirán con su anunciante**». El PRD prohíbe compartir PII con el publicador.
- **Decisión:** no se edita la versión vigente (lo aceptado queda como prueba); se publica una **versión nueva** del texto y del aviso de privacidad cuando el abogado la apruebe. Borrador propuesto: «Mis datos los usará VIVE BIEN Grupo Inmobiliario para atender mi solicitud y darle seguimiento; no se entregan al propietario ni al anunciante.» **[LEGAL REVIEW REQUIRED]**
- **Estado:** PENDIENTE.

## D-04 · «No quiero un CRM» vs el PRD

- **Conflicto:** el 16-sep el usuario dijo «VIVE BIEN TODAVÍA NO QUIERE UN CRM POR AHORA, OSEA SÓLO LO QUE TE PIDO». El PRD v2.0 (18-sep) especifica leads con asignación y seguimiento, visitas, ofertas, operaciones, comisiones y jurídico.
- **Decisión:** el PRD es lo pedido más reciente y explícito (prioridad 1): esos módulos entran. Se mantienen dos límites que el propio PRD pone: **sin CRM para publicadores** y **el Marketing Hub no es un CRM**. Nada fuera del PRD (lead scoring, embudos de venta, segmentos…).
- **Estado:** DECIDIDA.

## D-05 · Alcance del admin

- **Conflicto:** en la especificación del portal (18-sep, mañana) el usuario pidió «no crees nada nuevo en el admin más que el calendario». El PRD (18-sep, después) define el admin completo (Centro de revisión, Atención, Operaciones, Marketing, Legal, Configuración) y el usuario lo presentó como «cambio radical para todo el panel tanto de admin, cliente y publicador».
- **Decisión:** manda el PRD. El calendario de visitas se conserva dentro de **Atención → Visitas**.
- **Estado:** DECIDIDA.

## D-06 · Menú del cliente

- **Conflicto:** la especificación del portal (con mockups) pide: Inicio, Buscar propiedades, Mis propiedades (Guardadas / Me interesan / Por revisar), Mis búsquedas, Mis alertas, Mis visitas, Mis consultas, Mi búsqueda, Mi propiedad (Vender/Rentar), Mi perfil. El PRD recomienda: Inicio · Propiedades · Favoritos · Búsquedas · Visitas · Valuador · Perfil.
- **Propuesta:** conservar el menú del portal (es explícito y tiene mockups; el del PRD dice «recomendada») y **agregar «Valuador»**. «Mi propiedad (Vender/Rentar)» se convierte en la entrada de la **solicitud de publicador** del PRD.
- **Estado:** PROPUESTA **[DESIGN DECISION REQUIRED]** (confirmar).

## D-07 · Rojo de marca

- **Conflicto:** PRD/Manual 2026: `#A30D12`, carbón `#1A1A1A`, arena `#F3F0EA`. Panel admin (V-1.1.71): `#971010` (medido sobre el logo PNG), fondo `#f5f4f2`, barra `#1c1c1f`. Sitio público: `--rojo #8B1A1A`, `--rojo-marca #C8102E`.
- **Propuesta:** adoptar los valores del manual (es la autoridad de marca; el `#971010` salió de medir un archivo rasterizado) en **un solo archivo de tokens** que usen panel, portal, sitio y plantillas. No se toca el logo.
- **Estado:** PENDIENTE **[DESIGN DECISION REQUIRED]**.

## D-08 · Quién es el «asesor» de una visita

- **Conflicto:** las citas de V-1.1.75 toman como asesor a `propiedades.owner_id` y le enseñan teléfono y correo del cliente, y le mandan los enlaces de confirmar. El PRD: la visita «se agenda en VIVE BIEN… Publicador en modo agregado/operativo **sin PII**».
- **Decisión técnica (ENMENDADA el 2-oct-2026 por D-47/ADR-0013):** ~~el asesor de una cita es personal de VIVE BIEN~~ → el asesor es el dueño de la propiedad si puede atender citas: el equipo de VIVE BIEN, o un publicador con `recibir_citas` (sus propias propiedades). Sigue sin existir una asignación distinta del dueño (08.01). El publicador ve sus visitas sólo con fecha, hora, estado y propiedad, y sin datos del interesado salvo `ver_datos_interesado`. Cambia el servicio de citas y `docs/permissions.md` antes de exponer ninguna pantalla. Ver [ADR-0006](adr/ADR-0006-publicador-sin-pii-de-leads.md).
- **Falta decidir:** ¿quién atiende las visitas (una persona, varias)? **[BUSINESS DECISION REQUIRED]**
- **Estado:** técnica DECIDIDA; personas PENDIENTE.

## D-09 · Activación de publicador

- **Conflicto:** hoy un admin cambia el rol a `publicador` o lo reserva por invitación. El PRD exige solicitud → revisión → verificación → propuesta de comisión → aceptación → acuerdo → activación por operación de backend.
- **Decisión:** tras la fase 4, `rol = publicador` sólo lo pone una operación de servidor al completar el flujo (o el alta manual del admin con `creationSource = MANUAL_ADMIN`, motivo y auditoría). Las invitaciones dejan de ofrecer el rol `publicador`.
- **Falta decidir:** la cuenta que hoy es publicador (0 propiedades): ¿se le pide el flujo completo o se registra como `MANUAL_ADMIN`? **[BUSINESS DECISION REQUIRED]**
- **Estado:** DECIDIDA / PENDIENTE.

## D-10 · Estados de propiedad

Mapeo propuesto (sin borrar columnas; `estado_pub` + `estatus` pasan a derivarse de un solo `lifecycle`):

| PRD | Hoy |
|---|---|
| DRAFT | `borrador` |
| IN_REVIEW | `en_revision` |
| CHANGES_REQUESTED | `cambios_solicitados` (y `rechazada`, ver abajo) |
| PUBLISHED | `publicada` + `disponible` |
| PAUSED | `publicada` + `pausada` |
| SOLD | `vendida` |
| RENTED | `rentada` |
| WITHDRAWN | `eliminada` (baja lógica) |

- **Falta decidir:** ¿`rechazada` es CHANGES_REQUESTED o un estado propio? ¿Existe RESERVED (apartada) — el PRD lo deja abierto (§35)? ¿«eliminada» equivale a WITHDRAWN (retiro) o a borrar? **[BUSINESS DECISION REQUIRED]**
- **Estado:** PROPUESTA.

## D-11 · Publicar directo como admin

- **Conflicto:** desde V-1.1.50 el admin publica sin revisión (a petición del usuario). El PRD pone comisión aceptada + acuerdo antes de publicar una propiedad de publicador.
- **Propuesta:** distinguir **propiedades propias de VIVE BIEN** (sin publicador externo: sin comisión ni acuerdo; el admin publica, versionado y auditado) de **propiedades de publicador** (flujo completo del PRD). **[BUSINESS DECISION REQUIRED]** (confirmar que las propias no llevan comisión/acuerdo).
- **Estado:** PENDIENTE.

## D-12 · Editar lo publicado

- **Conflicto:** V-1.1.74 hizo que el asistente edite propiedades publicadas y el cambio se ve al instante. El PRD exige revisión: la publicada sigue visible mientras la nueva se revisa.
- **Decisión:** se conserva el asistente completo para editar; guardar sobre una publicada crea una **revisión** en borrador. El admin la aprueba en un paso (para las propias) y queda versionada. Ver [ADR-0005](adr/ADR-0005-revisiones-de-propiedad.md).
- **Estado:** DECIDIDA.

## D-13 · Super Admin

- **Decisión técnica:** rol nuevo `super_admin`; `ADMIN_EMAILS` pasa a ser sólo el arranque de super admin (recuperación). Ver [ADR-0004](adr/ADR-0004-roles-y-permisos-en-base-de-datos.md).
- **Falta decidir:** qué cuenta(s) son super admin (propuesta: `jemilianoponceperez@gmail.com`) y cuáles sólo admin. **[BUSINESS DECISION REQUIRED]**

## D-14 · Custom claims

- **Conflicto:** el PRD pide custom claims para autoridad administrativa. El servidor no usa `firebase-admin` y no puede ponerlos; la autoridad ya se comprueba en cada petición contra la base.
- **Decisión:** roles y permisos en Postgres, verificados en servidor en cada petición; no se agregan claims (evita dos fuentes de verdad y tokens con permisos viejos). Ver ADR-0004.

## D-15 · Dinero

- **Decisión:** importes en **centavos (`bigint`) + moneda**; tasas en **puntos base**; cálculo con enteros y redondeo explícito; impuestos parametrizados. Ver [ADR-0007](adr/ADR-0007-dinero-en-centavos.md). Las reglas fiscales finales requieren contador (D-18).

## D-16 · Documentos privados

- **Decisión:** Supabase Storage con bucket **privado**, URLs firmadas de vida corta emitidas por el servidor tras comprobar permisos; fotos públicas siguen en Cloudinary pero con **subida firmada por el servidor** y validación. Ver [ADR-0008](adr/ADR-0008-medios-publicos-y-documentos-privados.md).

## D-17 · NAP

- Valores observados (PRD §36.4): VIVE BIEN Grupo Inmobiliario · 477 811 6501 · joseponcer@vivebienn.com · Blvd. Campestre 2910, Local 10, Cañada del Refugio, C.P. 37358, León, Gto. · Instagram @vive_bien_mx · GA4 G-7TQQEQ97S2. **Falta:** horario de atención y confirmación final. **[BUSINESS DECISION REQUIRED]**

## D-18 · Comisiones e impuestos

- PRD: venta 3–4 % configurable; renta 1 mes. **Falta:** valor por defecto de venta (3 %, 3.5 %, 4 %), si la comisión se expresa con o sin IVA, quién factura. **[BUSINESS DECISION REQUIRED]** + revisión contable.

## D-19 · Textos jurídicos

- Acuerdo de comercialización no exclusiva, propuesta de comisión, declaración de titularidad, política de leads, no elusión, colaboración, retiro, suspensión, términos, aviso de privacidad. El sistema de versiones se construye con textos **marcados como BORRADOR**; ninguna versión pasa a `ACTIVE` sin abogado. **[LEGAL REVIEW REQUIRED]** (fuentes a revisar: LFPDPPP 2025, NOM-151-SCFI-2016, NMX-COE-001-SCFI-2018, Ley de Agentes Inmobiliarios de Guanajuato, Código de Comercio — PRD §36.5).

## D-20 · Staging

- Hoy el desarrollo usa la base de producción. Opciones: rama de Supabase (costo por hora), segundo proyecto Supabase, o seguir con PGlite + punta a punta con limpieza. **[BUSINESS DECISION REQUIRED]** (costo). Hasta decidir: PGlite para todo lo de base y nada destructivo contra producción.

## D-21 · Proveedor de IA

- El PRD no fija proveedor. **[TECHNICAL PROPOSAL]** API de Claude (Anthropic) desde el servidor, salida con esquema JSON validado con Zod, validadores de datos contra la revisión publicada. Se decide al llegar a la fase 18 (costo).

## D-22 · App Check

- App Check protege servicios de Firebase y backends que verifiquen su token. **[TECHNICAL PROPOSAL]** en la fase 19 evaluar App Check (reCAPTCHA Enterprise) o Cloudflare Turnstile para formularios públicos, más límite de peticiones persistente en Postgres.

## D-23 · Slugs de relleno

- `propiedad-sin-titulo-wljv` y `propiedad-sin-titulo-qzsl` están publicadas e indexables. Cambiarlas exige 301. **[BUSINESS DECISION REQUIRED]** (¿se renombran?).

## D-24 · «Mis consultas» sin estado

- El mockup del portal enseña «Recibida / En revisión». Con el módulo de leads del PRD (fase 7) cada consulta tendrá estado de atención de VIVE BIEN; el cliente verá un estado simplificado (Recibida / En atención / Atendida). Hasta entonces: «Enviada».

## D-25 · Meta

- Faltan Business Manager, página, cuenta de Instagram vinculada, app y permisos (PRD §35). La publicación queda detrás de un feature flag y estados `NOT_CONNECTED` hasta tenerlos.

## D-26 · Bóvedas de Obsidian

- 18-sep-2026: Grupo Ponce (VIVEBIEN, VELARE, ACCIÓN DIGITAL, ANDAx, PROIN) pasó a la bóveda **`OBSIDIAN\GRUPO PONCE`**; OTLI se quedó en `OBSIDIAN\GRUPO P-ONCE`. Respaldo zip, huellas SHA-256 y manifiesto en `OBSIDIAN\`. 74/74 archivos verificados idénticos, 0 perdidos.

## D-27 · Portal de cliente — decisiones del 19-sep-2026 (fase 3)

Aprobadas por el usuario tras la auditoría (`docs/fase-3/AUDIT_PORTAL_CLIENTE.md`):

1. **«Por revisar»: OCULTO.** No se registra qué fichas ve cada persona; no se agrega recopilación de comportamiento. **PENDIENTE:** «Recientemente vistos» sería una decisión aparte, con privacidad y retención definidas.
2. **«Me interesan» = interacción comercial REAL:** pidió informes, pidió visita u otra interacción comercial registrada. Abrir o ver una ficha **no** es interés. No se inventan registros para actividad histórica que no exista.
3. **Alertas:** dentro del portal en esta fase. **Sin correos** de nuevas propiedades por ahora; el diseño debe permitir sumarlos después con consentimiento, preferencias y baja.
4. **Eliminación de cuenta = SOLICITUD**, no borrado inmediato: registrar, revisar/procesar, retirar la presencia pública, conservar sólo lo que obliguen razones legales, contractuales, fiscales, de seguridad, auditoría o disputas, y eliminar o anonimizar lo demás. Texto jurídico definitivo: **DRAFT** hasta el abogado (D-19); no se inventa lenguaje jurídico.
5. **Apertura escalonada:** flag apagado → desarrollo → pruebas → vista previa local con datos controlados → producción **sólo para admin/super admin** → revisión visual real del usuario → correcciones → apertura a clientes. **No abrir a todos todavía.**

Además, antes de habilitar el portal: P3-01 (enlaces de correos), P3-02 (DTO sin `select('*')`), P3-03 (suspendidos no escriben), P3-04 (las 9 rutas), P3-05 (pruebas del Inicio y estados vacíos), P3-06 (`robots.txt` sin afectar lo público), P3-07 (un solo modelo de «Qué estoy buscando»).

**Separación fija del portal de CLIENTE:** Inicio · Guardadas · Me interesan · Mis búsquedas · Alertas · Mis consultas · Mis visitas · Valuador · Mi perfil · Configuración · Solicitud de eliminación. «Mi propiedad» es **sólo** la entrada a la solicitud para ser publicador: no da permisos ni publica. Sin CRM; sin funciones de publicador dentro del portal de cliente.

## D-28 · Portal de cliente, fase 3b — PENDIENTES (19-sep-2026)

Detalle ampliado de cada una (problema, opciones, recomendación, impacto técnico y de experiencia, migración y bloque) en **`docs/fase-3/DECISIONES_3B.md`**. **PENDIENTE [BUSINESS / LEGAL / TECHNICAL DECISION REQUIRED]:**

1. «Me interesan» con `leads` anónimos por correo (recomendado: no).
2. Alertas vistas por búsqueda o global (recomendado: por búsqueda).
3. «Mis visitas» sólo lectura o con acciones (recomendado: sólo lectura en 3b).
4. «Cambiar contraseña» en Configuración (recomendado: sí, cuentas con correo).
5. Eliminación: aviso al equipo, cancelación por el cliente, borrado en Firebase, plazos (plazos: abogado, D-19).
6. «Mi propiedad»: reutilizar el lead hasta la fase 4 (recomendado).
7. `@axe-core/playwright` como dependencia de desarrollo (recomendado: sí).
8. Quitar Firestore del arranque y borrar lo obsoleto (recomendado: sí; decisión del dueño).
9. ~~Acceso con Google~~ → **RESUELTO en V-1.1.83 (22-sep-2026)**: `www` y alias `*.vercel.app` → `https://vivebienn.com`, frases claras, guía en navegadores internos, bitácora `acceso.google_fallo`. Plan B por redirección: preparado y apagado (paso opcional en Google Cloud + Vercel). Ver `docs/incidentes/2026-09-acceso-google/README.md`.
10. «Para ti» en tableta: 3 columnas desde 768 px — ✅ **APROBADA (22-sep)**, entra en 3b-1.

## D-29 · Pantalla de acceso nueva (mockup del 22-sep) — PENDIENTES

Planeada como **3c-1 (V-1.1.87)**, antes de abrir el portal a clientes (tarea 03.07). **PENDIENTE [BUSINESS / TECHNICAL DECISION REQUIRED]:**

1. **Foto del lado izquierdo:** la del mockup es una composición. ¿Foto propia (una propiedad real en León) o con licencia? Se necesita el archivo con derechos de uso (WebP, ~1600 px de ancho).
2. **Logo:** hoy sólo hay un PNG pequeño con la línea «Grupo inmobiliario»; el mockup va sin ella. Recomendado: un SVG del logo sin esa línea.
3. **«¿Olvidaste tu contraseña?»:** hoy no existe. Con Firebase (`sendPasswordResetEmail`) el correo lo manda Firebase; su plantilla y remitente se ajustan en Firebase → Authentication → Templates (paso del dueño). Recomendado: sí, junto con D-28.4 («cambiar contraseña» en Configuración).
4. **Una sola pantalla de acceso para todos:** hoy hay tres (la tarjeta de `/dashboard` y dos mínimas en `/portal` y `/admin`). Recomendado: una sola (`/entrar?siguiente=…`, privada) a la que lleven las tres.
5. ~~Tableta y móvil~~ — **móvil DECIDIDO por el mockup del 22-sep:** foto arriba con logo y titular; la tarjeta montada sobre la parte baja de la foto; «VIVEBIENN.COM» al pie. **Queda la tableta (834 px):** recomendado el diseño de móvil con la tarjeta centrada (máx. ~560 px) por debajo de 1024 px, y el de escritorio desde 1024 px.

## D-30 · «Mi perfil» por rol (tarea 03.08) — PENDIENTES

Planeado como **3c-2 (V-1.1.88)**. **PENDIENTE [BUSINESS DECISION REQUIRED]:**

1. **Qué ve un admin / super admin en su perfil:** ¿sólo cuenta y seguridad (nombre, foto, correo, método de acceso, cerrar sesión) o algo más? Recomendado: sólo eso; sin campos de cliente ni de publicador.
2. **Dónde vive cada perfil:** recomendado `/portal/perfil` (cliente), `/publicador/perfil` (publicador) y dentro del panel (admin), con `/mi-cuenta` redirigiendo según el rol y conservando la consulta (`?motivo=publicar`).
3. **Quién tiene dos caras:** un publicador también es cliente (puede guardar propiedades). ¿Su perfil los junta en una pantalla con dos secciones, o se queda sólo con lo de publicador? Recomendado: una pantalla, dos secciones claras.
4. **Retirar `/mi-cuenta`:** ¿se elimina cuando existan las tres, o se deja como redirección permanente? Recomendado: redirección permanente (hay enlaces en correos y en el asistente).

## D-31 · Feature Flags con pantalla propia — APROBADA (22-sep-2026)

Nace del hallazgo H-02: hoy `configuracion` sólo se lee y abrir el portal exigiría editar SQL en Supabase.

**Aprobado:** pantalla en el panel, **sólo Super Admin** (Configuración → Feature Flags), con estado actual, quién
lo cambió, fecha y hora, **motivo obligatorio**, auditoría en `audit_logs`, **confirmación antes de activar**, el
servidor como única autoridad y ningún cliente ni admin normal puede modificarlo. Las claves
`portalClienteInterno` y `citasEnLinea` deben existir **explícitamente** en producción con valor `false`: no se
depende de «si la clave no está, es falso» (aunque `normalizarFlags` siga siendo fail-closed como red).
Entra en **3b-1**; la parte de datos va en la migración 24. Detalle: `docs/fase-3/DECISIONES_3B.md`.

## D-32 · Criterios de cierre de 3b — APROBADOS (22-sep-2026)

1. **No Silent Data Loss.** Todo formulario del portal: el servidor valida → guarda y responde **con el dato
   guardado**, o falla y **lo dice claro**. Nunca «guardado» cuando el servidor descartó un campo. Con pruebas.
   (Nace de `precio_incluye_iva`, las propiedades sin título y el panel clásico que se saltaba la lógica.)
2. **Nada de «Próximamente».** Cada entrada del menú tiene función definida o no aparece.
3. **Un solo dato, una sola verdad.** Lo que muestra la web pública y lo que muestra el portal no pueden
   contradecirse (caso IVA).
4. **`citasEnLinea = false` ⇒ ningún llamado a solicitar visita**, con prueba que lo vigile.
5. **Tres tamaños medidos:** 1440×834, 834×1194 y 390×844, comprobando desborde y número de columnas.
6. **3b no termina porque existan las nueve rutas**, sino cuando el portal se comporta de forma coherente,
   segura y usable en sus estados reales (llena, vacía, suspendida).

## D-33 · Rendimiento como requisito para abrir el portal — APROBADO (22-sep-2026)

**Antes de encender `portalClienteInterno` para personas reales** hay que volver a medir en producción y fijar
objetivos. No se abre el portal sobre un sitio que tarda seis segundos en enseñar una propiedad.

**Medición del 22-sep (con navegador real, red en reposo):** listado `/propiedades` **≈5.9 s** · ficha **≈4.8 s**.
Además, **las tarjetas no vienen en el HTML**: la lista y la ficha se pintan en el navegador, así que quien entra
ve la página vacía hasta que llega y se ejecuta el JavaScript.

**Qué medir antes de abrir (mismas condiciones, escritorio y teléfono con datos móviles):**
1. Portada, `/propiedades` y una ficha: primer contenido pintado, contenido principal e interacción.
2. Imágenes: peso total, cuántas se descargan antes de hacer scroll, si el tamaño servido corresponde al que se ve.
3. Navegación dentro del portal: cuánto tarda cada pantalla nueva y cuántas peticiones hace.
4. Cuánto de la espera es del servidor y cuánto del navegador (para no optimizar donde no duele).

**Objetivos propuestos** (a confirmar al medir, con datos móviles de 4G): contenido principal del listado y de la
ficha **por debajo de 2.5 s**, interacción por debajo de 3 s, y que la primera pantalla del listado llegue **en el
HTML** en vez de esperar al JavaScript. Si algo no se alcanza, se decide: se optimiza o se abre igual sabiendo
el número — pero **con el número delante**.

**Dónde vive el trabajo:** tarea 20.01 (rendimiento) y, si el visor de fotos resulta ser parte del problema,
tarea 05.07. **Bloquea:** la apertura de 3c, no las entregas de 3b.

## D-34 · Centro de Ayuda vivo — APROBADO el enfoque (23-sep-2026)

No es una página de preguntas frecuentes: es un Centro de Ayuda conectado con el producto, con artículos que
**declaran de qué parte del sistema salen** y que se marcan para revisión cuando esa parte cambia.

**Aprobado:** el enfoque, el reparto por fases (3b-3 arquitectura · 3c-3 = V-1.1.90 construcción · motor de
autoactualización después) y la **regla fundamental**: la IA propone, el sistema es la fuente de verdad y
**publicar lo aprueba una persona**. Cuatro ayudas separadas: pública, de publicador, administrativa y técnica.

**Pendiente de decidir al llegar a 3b-3:** dónde viven los artículos (tabla propia frente a archivos en el
repositorio), quién puede aprobar publicaciones, si la ayuda pública se indexa en buscadores (SEO) y qué se
guarda de las búsquedas de la gente (agregado y anónimo). Detalle: `docs/fase-3/CENTRO_DE_AYUDA.md`.

## D-35 · Eliminar cuenta = cierre irreversible + poder volver a registrarse (23-sep-2026)

**Sustituye a D-27.4 y a la parte de eliminación de D-28.5.** Aquéllas trataban la baja como una *solicitud* que
un administrador aprobaba, dejando la cuenta de Firebase viva y el correo reservado de hecho para siempre. Esta
decisión cambia eso.

**La política:** eliminar una cuenta la **cierra para siempre**; el correo **no queda reservado**: esa persona
puede registrarse otra vez cuando quiera, y lo que obtiene es una **cuenta nueva que no hereda nada**.

**Lo que decide la identidad:** el **UID de Firebase** es la cuenta. El correo es **credencial y medio de
contacto**, nunca identidad histórica. De ahí salen las reglas duras:
- Nunca se busca una cuenta anterior por correo, ni se reutiliza un UID, ni se reengancha una identidad nueva
  a una cuenta cerrada.
- Un alta con el mismo correo **crea una cuenta nueva** que empieza como **CLIENTE**: sin rol, sin favoritos,
  sin búsquedas, sin perfil, sin historial.
- Sin bloqueos artificiales de 14 o 30 días. Sin recuperación por correo. Sin `upsert` de usuarios por correo.

**Cómo se cierra, en orden** (el orden importa: el servidor cierra primero, porque un token ya emitido sigue
siendo válido hasta una hora después):
1. La persona lo pide desde su cuenta, se **reautentica** (obligatorio con Google) y confirma escribiendo ELIMINAR.
2. El **servidor** comprueba que esa reautenticación es reciente (≤ 5 min, con el `auth_time` del token) y deja
   la fila como **lápida**: `estado = 'eliminada'`, rol a cliente, **`email = NULL`** y el resto de la PII de la
   identidad retirada. Desde la petición siguiente, la cuenta está cerrada y el correo ya está libre.
3. El **servidor** borra la **identidad de Firebase**. Sin este paso, un alta posterior reutilizaría el UID anterior.
4. El resto de los datos se procesan según la matriz, y el proceso se marca completado.

**El proceso es reintentable.** Vive en su propia tabla (`bajas_de_cuenta`, una fila por cuenta) con estados
explícitos —`baja_en_proceso → bloqueada → firebase_eliminada → datos_procesados → completada`, más `error`— y
lleva la cuenta de los intentos. Desde `bloqueada` **sólo avanza**: si Firebase o Supabase fallan, se reintenta
desde donde quedó, nunca se revierte. Una baja en `error` es una cuenta **cerrada** con trabajo pendiente.

**El correo se pone a `NULL`, no a un valor artificial.** El índice único de `usuarios` admite muchos NULL
(comprobado en producción), así que no hay que tocarlo; y un `CHECK` impide que a una cuenta viva le falte el
correo. Un correo inventado habría paseado el `uid` por paneles, exportaciones y buscador diciendo algo falso.

**Qué pasa con los datos** — tres cosas distintas, y se nombran distinto (**«anonimización» a secas queda
prohibida** como término):
- **Supresión** — desaparece: favoritos, búsquedas guardadas, preferencias, agenda y credenciales de calendario.
- **Disociación** — la fila se queda pero ya no lleva a la persona: correo, nombre, teléfono, WhatsApp y foto de
  la lápida; los datos de contacto dentro de citas y consultas.
- **Bloqueo** — se conserva sin usarse, para cumplir una obligación: bitácora (incluida la propia baja),
  consentimiento con su versión y fecha, e historial de invitaciones.
La fila histórica **nunca se borra**: siete claves foráneas dependen de ella. `DELETE` de `usuarios` está prohibido.

**Publicador:** darse de baja **no borra ni despublica** propiedades, acuerdos, citas ni operaciones. Se pierde el
**acceso**, no el historial. Reasignar una propiedad es una decisión comercial aparte, de un administrador. Una
cuenta nueva con el mismo correo **no recupera** el rol de publicador ni sus propiedades.

**Super admin:** el último super admin activo **no puede darse de baja** — la misma regla que ya impide quitarse
el rol a sí mismo.

**Invitaciones:** como se aplican **por correo**, al dar de baja se **revocan las pendientes** de ese correo; si no,
una cuenta nueva nacería con rol. Una invitación **posterior** a la baja sí vale: es un acto nuevo de un
administrador, no herencia.

**Se comprueba con ocho pruebas (A–H)**, detalladas en `docs/fase-3/PLAN_3B3.md`: no poder autenticarse tras la
baja · poder registrarse con el mismo correo · que sean cuentas distintas · que la nueva no herede nada ·
lo mismo con Google · que la baja de un publicador deje el historial intacto · que la cuenta nueva no recupere
propiedades · y que el último super admin no pueda darse de baja.

**P-1 · Publicador — DECIDIDO (opción A).** Darse de baja **no despublica nada**: la propiedad conserva su
`estatus` comercial y su `owner_id` sigue apuntando a la lápida. Lo que cambia es una marca interna nueva,
`propiedades.gestion = 'requiere_gestion'`, para que VIVE BIEN decida después: pausar, continuar o reasignar.
La cuenta se cierra **de inmediato**; no queda rehén de un asunto comercial. Una cuenta nueva con el mismo correo
**no hereda la propiedad**. Acuerdos y operaciones todavía no existen como tablas: cuando existan, la regla tendrá
que estar escrita en el contrato con el publicador.

**P-2 · Contacto dentro de leads y citas — DECIDIDO: bloqueo inmediato, supresión posterior.** Al cerrar la
cuenta, los datos de contacto quedan **fuera de todo uso operativo**: ninguna función de contacto, notificación,
consulta o lead puede usarlos. Permanecen sólo mientras sea necesario conservarlos, y la supresión o disociación
definitiva llega con la política legal aprobada. Para que eso sea algo más que una promesa, el bloqueo se hace
efectivo en **vistas** (`citas_operativas`, `solicitudes_contacto_operativas`) que devuelven nulo en nombre,
teléfono, correo y texto libre cuando la fila está bloqueada; la aplicación lee esas vistas y una prueba de guarda
falla si algún archivo del servidor se salta el camino. `consentimiento_en` y `consentimiento_version` se
conservan como **DRAFT de conservación**; queda sin decidir si hace falta una referencia seudónima para acreditar
al titular.

**No se promete el correo antes de tiempo.** Mientras la identidad de Firebase de la cuenta anterior exista,
entrar con Google devuelve **el UID anterior**, no uno nuevo: «volver a registrarse» reanimaría a U1 en vez de
crear U2. Por eso hay dos barreras y ninguna sustituye a la otra: una **guarda de lápida** en el alta (un `uid`
con `estado='eliminada'` nunca se revive, no recibe invitaciones y no cambia de rol) y la **promesa** de que el
correo está disponible, que sólo se da cuando la baja está `completada`.

**APROBADA la base técnica el 23-sep-2026:** `email` nullable con `NULL` en la cuenta cerrada y el índice único
intacto · el `CHECK` que impide una cuenta viva sin correo · `usuarios.estado` sólo representa **acceso** y
`bajas_de_cuenta` el **procedimiento** · **Firebase Admin SDK** en el camino de la baja · la identidad de
Firebase se borra **desde el servidor y después** de bloquear · el estado en Supabase es la barrera frente a
tokens viejos · proceso **idempotente y reintentable** · nuevo UID y fila nueva al volver · nunca reactivar por
coincidencia de correo · nunca heredar nada · invitaciones pendientes revocadas · protección del último super
admin.

**Dos separaciones que manda esta decisión:**
1. **Cerrar la cuenta ≠ cancelar los datos.** El cierre es inmediato y automático: es un derecho, no se aprueba.
   La cancelación de datos sigue su ciclo (bloqueo → supresión) con sus plazos y sus excepciones documentadas.
   Que exista una consulta histórica **no** impide cerrar la cuenta ni la mantiene activa.
2. **La baja no vive detrás del interruptor del portal.** El punto de entrada es `POST /api/cuenta/eliminar`,
   fuera de `exigirPortal`: cerrar tu cuenta no es una función que se encienda y se apague con un flag.

**Lo que el producto NO dirá:** «tu cuenta se borrará totalmente en 20 días» (no es lo que hace el sistema) ·
«un administrador decidirá si te permitimos eliminarla» (no hay veto: la administración tramita y documenta
excepciones, no autoriza) · «se eliminan todos tus datos» (falso mientras haya bitácora y consentimiento
bloqueados).

**Estado:** diseño completo entregado para aprobación en **`docs/fase-3/DISENO_BAJA_DE_CUENTA.md`** — esquema,
estados, flujo, matriz de las 18 referencias, estrategia de Firebase, re-registro, reintentos, e impacto del
índice único y del `NOT NULL`. **No se ha implementado nada, no se ha migrado nada.**
**Estado (23-sep):** diseño cerrado y **migración 25 escrita, sin ejecutar** — `supabase/25-baja-de-cuenta.sql`
y su `REVERTIR`. Antes de aplicarla: respaldo, ensayo en PGlite, ensayo en producción dentro de una transacción
revertida y evidencia antes/después. El Admin SDK está aprobado y necesita configuración manual del dueño.
Siguen abiertos, sin bloquear la migración: **P-3** (citas futuras de un asesor que se va) y **P-4** (plazos y
excepciones de conservación, del abogado), que sí bloquean la publicación de los textos legales.

## D-44 · Las operaciones de Firebase de la baja van por Identity Toolkit REST (25-sep-2026)

**Aprobada y desplegada (B + D).** `firebase-admin/auth` **no se puede cargar en el runtime de Vercel**: su
`exports` resuelve a un envoltorio ESM sobre el CJS del propio SDK, que hace `require('jwks-rsa')` →
`require('jose')`, y `jose` 6 es sólo ESM. Con `serverExternalPackages`, Turbopack lo carga con
`externalImport`, que envuelve cualquier fallo en un `Error` pelado sin `code`. Lo descubrió una **baja real
que se quedó a medias**, con un `ultimo_error = 'Error'` que no decía nada.

El `import()` dinámico que se puso semanas antes **nunca lo arregló**: el `require` problemático está tres
niveles más abajo, dentro del SDK. El smoke test lo dio por bueno porque la ruta pasó de 500 a 401 — y el 401
se decide antes de tocar Firebase.

**Decisión:** las dos operaciones que necesita la baja (`revokeRefreshTokens`, `deleteUser`) pasan a Identity
Toolkit REST (`accounts:update` con `validSince`, `accounts:delete`), con el token OAuth que ya obtenía
`firebase-admin/app`. Del SDK se queda **sólo `/app`**. **Cero dependencias nuevas**; `firebase-admin` sigue en
14.5.0. `engines.node` fijado a `24.x` y CI a 24.

**Descartadas:** dejar de externalizar (riesgo de arrastrar los 4 advisories) y bajar `jose` a v5 (iría contra
el rango que declara `jwks-rsa`).

**Medido:** el lambda de la baja pasó de **515 archivos a 320**, con `jwks-rsa`, `jose` y `jsonwebtoken` en
**cero**. La ruta frágil no está arreglada: ha desaparecido del despliegue.

**La sonda.** El diagnóstico de Firebase decía «OK» mientras el camino real estaba roto, porque sólo validaba
la credencial y nunca cargaba `/auth`. `GET /api/diagnostico/firebase?sonda=1` (Super Admin) ejecuta ahora las
**dos operaciones de verdad** contra un identificador inexistente de 28 caracteres generado en el servidor,
probando primero el que no destruye. En producción: `token OAuth: OK` · `accounts:update: USER_NOT_FOUND` ·
`accounts:delete: USER_NOT_FOUND`.

**Validación de D-35, de extremo a extremo en producción (25-sep):** baja → fallo real de Firebase → arreglo →
reintento administrativo (`completada`, `intentos 2`, `usuarios.actualizado_en` intacto desde la baja original)
→ mismo correo registrado de nuevo con **UID distinto** y **cero herencia**. Evidencia:
`docs/fase-3/QA_BAJA_DE_CUENTA.md` y `docs/fase-3/D-44-FIREBASE-REST.md`.

## D-45 · El destino del panel se decide con estados explícitos (25-sep-2026)

**Desplegada; QA visual en producción pendiente.** Al entrar se veía el portal de cliente antiguo
durante 200-600 ms antes de saltar a `/portal` o `/admin`. Causa: `const isAdmin = rol === 'admin'`
con `rol` inicializado a `null`, y ese `null` significaba **dos cosas a la vez** — «todavía no sé» y
«ya lo sé y no es admin». Como `null !== 'admin'`, la página montaba el portal antiguo entero antes
de saber a dónde iba esa persona. Les pasaba también a los administradores.

**Decisión:** la elección de pantalla vive en `acceso/destino-dashboard.ts`, pura, con un tipo
discriminado (`resolviendo | acceso | redirigir | clasico`) y un perfil de tres valores
(`'cargando'` = no sé · `'sin_perfil'` = terminó y no hay · el perfil). **Ningún valor puede
significar dos cosas.** Una puerta nueva antes de la del panel antiguo: mientras el destino no esté
resuelto sólo se monta una pantalla mínima. No se esconde con CSS ni se pinta y luego se navega: no
se construye. `?clasico=1` sigue siendo la entrada explícita al panel clásico, que se queda entero.

`destinoTrasEntrar` pasa a delegar en la misma función: la regla que decide si se navega y la que
decide qué se pinta no pueden discrepar.

**Descartado:** resolverlo en el servidor —imposible sin una cookie de sesión, que sería un segundo
mecanismo de autenticación junto al de Firebase— y esconder el panel con CSS, que no arregla nada.

**Seguridad:** el redirect no sustituye a la autorización. `/portal` conserva su guarda de flag en
el servidor y `/admin` los suyos. Durante la implementación se añadió por error `rol ===
'super_admin'` a la detección de administración; una prueba existente lo rechazó con razón, porque
`/api/usuarios/me` nunca emite ese valor. Se quitó.

**Medido:** en el DOM, cada 100 ms con 600 ms de retraso en `/api/usuarios/me`. Antes, «Portal de
Cliente» visible de 100 a 600 ms; después, **192 muestras (4 roles × 3 tamaños × 16) y cero
apariciones**. El primer medidor daba un falso verde —observaba mutaciones y leía el resultado
después de navegar, cuando la variable ya se había reiniciado— y hubo que rehacerlo con muestreo y
validarlo contra el fallo: 12/12 en rojo con el fallo, 12/12 en verde con el arreglo.

Detalle: `docs/fase-3/DESTELLO-DASHBOARD.md`.

## D-29 y D-30 · Fase 3c — decisiones cerradas (28-sep-2026)

Cuatro puntos que estaban PENDIENTES quedan resueltos, todos por la opción recomendada:

- **D-29.4 · Una sola pantalla de acceso.** Hoy hay tres (la tarjeta de `/dashboard` y dos mínimas
  en `/portal` y `/admin`). Pasan a ser **una sola**, `/entrar?siguiente=…`, privada, a la que
  lleven las tres. Un sitio que mantener, un diseño, un flujo de Google.
- **D-29.3 · «¿Olvidaste tu contraseña?»: sí**, con `sendPasswordResetEmail` de Firebase. El correo
  lo manda Firebase; la plantilla y el remitente los ajusta el dueño en Firebase → Authentication →
  Templates. Se añade también en Configuración del portal (D-28.4).
- **D-30.1 · El perfil de admin y super admin es sólo cuenta y seguridad**: nombre, foto, correo,
  método de acceso y cerrar sesión. Sin campos de cliente («qué estoy buscando») ni de publicador.
- **D-30.3 y D-30.4** se aplican por su recomendación: el publicador ve **una pantalla con dos
  secciones** (es también cliente y puede guardar propiedades), y `/mi-cuenta` queda como
  **redirección permanente** por rol, conservando la consulta — hay enlaces en correos y en el
  asistente.

**Sigue bloqueado por falta de material, no de decisión:** la pantalla de acceso necesita la foto
del lateral con derechos de uso (WebP, ~1600 px) y el logo en SVG sin la línea «Grupo inmobiliario».

## D-46 · El alta de propiedad se construye en la Fase 5, no en la 4 (28-sep-2026)

La tarea 04.05 (panel del publicador) incluía «Nueva propiedad». Construirla en la Fase 4
significaría escribir el asistente de alta **sobre la fila viva**, y la tarea 05.04 de la Fase 5
—«el asistente edita revisiones»— obligaría a rehacerla entera.

**Decisión:** la Fase 4 se hace completa **menos el alta**: solicitud → revisión → activación, y el
panel del publicador con todo lo que no sea crear una propiedad. El alta se construye ya en la
Fase 5, directamente sobre revisiones.

El orden de fases no cambia (4 → 5 → 6 → 7); lo que cambia es dónde vive una tarea. Motivo:
el criterio de «riesgo de rehacer código» de la auditoría del 28-sep.

## D-47 · PUBLICADOR / ASOCIADO — una modalidad dentro del rol, no un rol nuevo (2-oct-2026)

El rol de seguridad sigue siendo `publicador`. Dentro de él hay una **modalidad**: `publicador` (con comisión) o
`asociado` (sin comisión, premium). La modalidad sólo pone los valores por defecto; los **permisos efectivos** son
defaults + overrides por usuario, que sólo un admin o super admin cambia, con motivo y bitácora. «Publicar sin revisión»
autoriza únicamente `borrador → publicada` sobre lo propio; el resto de la seguridad (dueño, campos protegidos, folio,
slug, estados, auditoría) se valida igual. El folio conserva `VB-AAAA-NNNNN`. Detalle, defaults y consecuencias en
[ADR-0013](adr/ADR-0013-publicador-asociado-modalidad-y-permisos-por-usuario.md).

**Cierra:** la parte de D-09 sobre «qué es un publicador» (no el flujo de activación, que sigue pendiente).
**Enmienda:** ADR-0006 punto 3 — un publicador con `recibir_citas` (p. ej. un asociado) puede ser asesor de las citas de sus propiedades, sin ver los datos del interesado salvo `ver_datos_interesado`.

**Confirmado el 2-oct-2026:** `editar_publicadas` por defecto para el asociado; el publicador normal no edita lo publicado y
no se implementa «cambio pendiente de aprobación» por ahora. **Implementado el mismo día:** la agenda del publicador
(citas recibidas) con permisos independientes y protección de datos del interesado; ADR-0006 punto 3 enmendado (ver ADR-0013).

**PENDIENTE [BUSINESS / LEGAL / TECHNICAL DECISION REQUIRED]:**
1. **Aplicar la migración 28** (modalidad y overrides) y después la **29** (artículos de ayuda). Orden: 28 → despliegue → 29.
2. **Texto legal.** El artículo público «¿Quién puede ver mi información?» y el consentimiento de las citas dicen que el publicador no recibe tus datos; sigue siendo cierto por defecto, pero un admin PUEDE encender `ver_datos_interesado`. Decidir con el abogado (D-19) cómo se anuncia si algún día se enciende.
3. **Dónde se leen los artículos de ámbito `publicador`:** hoy el Centro sólo sirve `publica`; no hay pantalla con sesión de publicador.
4. **Horario propio del publicador:** pantalla para editarlo (hoy usa el estándar).
5. **Encender `citasEnLinea`** (verificado apagado en producción el 2-oct-2026: sin él no se crea ninguna cita, aunque todo esté desplegado). El portal de clientes **ya está abierto** (`portalCliente = true`); el flag `publisherPortal` está apagado pero ningún código lo lee.
6. **Aviso al publicador «hay un nuevo interesado»** (`recibir_solicitudes`): el permiso existe, ninguna función lo usa todavía.
7. **UI de administración** para modalidad y permisos (bloque ADMIN; hoy sólo API).
8. **Enlaces de correo (bearer):** quien tenga el enlace puede usarlo sin sesión (diseño previo, `permissions.md`); si se exige vincularlo a una sesión, es una decisión aparte.

## D-48 · Administración de modalidad y permisos del publicador (2-oct-2026)

Se construye la pantalla de administración sobre el modelo de D-47 sin cambiar la arquitectura: `/admin/usuarios/[uid]`, con los permisos en tres capas
(defecto de la modalidad · ajuste individual · efectivo) y confirmación con motivo ≥ 10 caracteres. La autorización real sigue siendo
`tieneCapacidad`; la UI nunca compara la modalidad. Se guardan sólo los ajustes que se apartan del defecto. No se inventan capacidades: «contacto
público» no existe como permiso; lo real es identidad (perfil, nombre, foto) y contacto (teléfono, WhatsApp, correo), administrados por separado.

El cambio y su bitácora son una sola transacción SQL (`usuario_cambiar_permisos`, migración 28) con control de concurrencia: sin huella completa
no hay cambio. Detalle en [ADR-0013](adr/ADR-0013-publicador-asociado-modalidad-y-permisos-por-usuario.md).

**Estado (verificado el 2-oct-2026):** **implementado en código, NO desplegado** (en producción `/admin/usuarios/[uid]` y su API dan 404); **migración 28 (columnas + función) APLICADA en producción el 3-oct-2026; 29 y 30 (ayuda) preparadas y sin aplicar** (sin visor no aportan nada); `citasEnLinea` apagado (citas: backend implementado ≠ citas activadas). Validación visual local hecha en 390/768/1024/1440 px; falta la de producción, que sólo puede hacerse tras desplegar.

**PENDIENTE [BUSINESS / TECHNICAL DECISION REQUIRED]:**
1. Aplicar 28 → 29 → desplegar → 30 (orden en la cabecera de cada migración), con autorización explícita.
2. Dónde se leen los artículos de ámbito `administrativa` (como los de `publicador`: hoy el Centro sólo sirve `publica`).
3. SUPER_ADMIN (fase siguiente): flags y roles de admin siguen sin pantalla de revisión integrada.
4. Pantalla de consulta de la bitácora de cambios de permisos (hoy se lee en `audit_logs`).
5. Notificar al publicador cuando se le cambian los permisos (no existe).

## D-49 · SUPER_ADMIN — cambios sensibles atómicos y auditados (3-oct-2026)

**Diferencia real con ADMIN (arquitectura existente, sin inventar):** `usuarios.roles_admin` (dar/quitar admin y super_admin) y `configuracion.flags` (encender/apagar módulos) son los únicos permisos exclusivos de `super_admin` (`PERMISOS`). El hueco real no era un permiso nuevo, sino que esas dos mutaciones leían, escribían y *después* intentaban registrar en la bitácora sin garantía, y el flag reescribía todo el JSON (dos Super Admin a la vez se pisaban).

**Decisión:** migración 31 con dos funciones `security invoker`, `search_path=''`, sólo `service_role` (patrón de la 28, E-27): `configuracion_cambiar_flag` (cambia SÓLO esa clave, compara `p_antes`, version+1, huella con motivo ≥10) y `usuario_cambiar_rol_estado` (compara rol/estado previos, exige motivo ≥10 al dar o quitar el nivel de admin, respeta el candado del último super admin de la 21). Las rutas `/api/admin/flags` y `/api/admin/usuarios` ya no hacen `update` ni `registrar()`: 409 `conflicto`, 503 si falta la 31, sin cambio si la bitácora falla. El motivo se pide en un diálogo accesible (`DialogoMotivo`), no con `window.prompt`.

**Revisión de flags (3-oct-2026):** `portalCliente` ON; `citasEnLinea` OFF (falta decisión de negocio/legal: texto de consentimiento D-03/D-19); ~~`portalClienteInterno`, `publisherPortal`, `commissionEngine`, `legalAcceptance`, `superAdmin`, `marketingHub`, `metaPublishing`, `aiContent` sin consumidores implementados~~ → siguen OFF. No se inventó ningún flag. **Enmienda (13-oct-2026, verificada en el código del commit 33090574c6b6):** `portalClienteInterno` **sí tiene consumidor** (`src/lib/portal/apertura.ts`; decide si el portal se abre sólo a quien tiene `panel.admin`) y está probado; por eso NO pertenece a esta lista. Los que **no tienen ningún consumidor** son `publisherPortal`, `commissionEngine`, `legalAcceptance`, `superAdmin`, `marketingHub`, `metaPublishing` y `aiContent`: encenderlos hoy no cambia nada. En particular `publisherPortal` **no abre el área de publicador**: `/publicador` no depende de él (ver ADR-0013). La pantalla de Super Admin aún le muestra la etiqueta «Abre el área de publicador» (propuesta pendiente: «Hoy sin efecto»; es código, no se tocó).

**Estado:** código + tests (PGlite 17 + rutas) + Codex L2 (2 hallazgos menores corregidos: 503 si falla la lectura de la cuenta, 404 si no hay fila de flags). **Migración 31 APLICADA en producción el 3-oct-2026 (verificado: dos funciones `security invoker`, `search_path=''`, solo `service_role`; sin prueba de escritura en la base real) y código NO desplegado** (el despliegue requiere decisión del usuario: el árbol local contiene trabajo ajeno sin revisar).


## D-50 · SUPER_ADMIN — cuenta eliminada intocable y módulos en Actividad (4-oct-2026)
- **Cuenta `eliminada` = inmutable** desde el panel: rol, estado y permisos devuelven 409 (`CUENTA_ELIMINADA`). La baja es definitiva (Firebase ya borró la cuenta); cambiarle el estado a `activo` la dejaría "viva" en la tabla sin acceso real. La carrera (baja entre lectura y escritura) ya la cubre el conflicto de `usuario_cambiar_rol_estado` (compara el estado leído). Sin migración nueva; endurecer la función SQL queda como mejora opcional.
- **Actividad** muestra cambios de módulos (`configuracion.flag`) **solo a Super Admin**, sin el motivo; los cambios de rol/estado se rotulan «Cambio de rol o estado» (antes «de permisos») y `super_admin` tiene etiqueta.
- Verificado: ninguna otra ruta saca una cuenta de `eliminada` (`/api/usuarios/me` inserta con `ignoreDuplicates` y solo permite `cliente`; las bajas solo avanzan hacia `eliminada`).

## D-51 · SESSION-SWITCH BUG (P1) — el destino por rol sale de la sesión actual (4-oct-2026)
- **Fallo (producción):** cerrar sesión de un cliente en `/portal`, entrar como admin y quedar en el portal del cliente (con el nombre y rol de admin arriba). Inverso: ADMIN→CLIENTE terminaba en `/admin` («sin permiso»).
- **Causa exacta:** `rutaTrasAutenticar(siguiente)` devolvía `siguiente` tal cual. Al cerrar sesión en `/portal` el enlace «Entrar» lleva `?siguiente=/portal`; `/entrar` lo obedecía sin mirar QUIÉN acababa de entrar. No era caché, ni localStorage, ni contexto React: la decisión salía de la URL previa. `/api/usuarios/me` devolvía bien el rol (verificado en BD: la cuenta nunca cambió).
- **Corrección:** (1) `/portal*` y `/admin*` viajan a `/dashboard?siguiente=…`, que decide por el rol del servidor y solo conserva `siguiente` dentro del área de ese rol (`conSubruta`; rechaza `//`, `\`, `.`/`..`, `%25 %2e %2f %5c`). (2) `PortalShell`: si `/me` dice administración → `/admin`, sin pintar el portal. (3) Guard `vigente()` (`auth.currentUser.uid === u.uid`) tras cada await en PortalShell, AdminShell y `/dashboard`: una respuesta tardía de la sesión anterior no decide nada. (4) `/entrar` borra `sessionStorage['vivebien:entrar']` (el correo escrito) al entrar.
- **Consecuencia aceptada:** un admin ya no puede abrir `/portal` (la «etapa interna» del portal para admins queda sin uso desde el navegador; sus APIs no cambian).
- **Regresión:** `tests-visual/sesion.e2e.ts` + `playwright.sesion.config.ts` (390/768/1024/1440) y `tests/cambio-de-sesion.test.ts`.

## D-52 · PUBLICADOR + PROPERTY CORE — cierre (4-oct-2026)
Inventario: ya existían folio `VB-AAAA-NNNNN` (trigger + índice único + `conservar_folio`), slug al publicar (índice único), máquina de estados, capacidades de publicador/asociado con `tieneCapacidad`, protección de propiedad ajena y lecturas por rol (`paraPublicador`). Gaps cerrados:
- **Revisión:** rechazar / pedir cambios exige nota ≥ 10 EN EL SERVIDOR (`notaDeRevisionValida`); antes solo la pantalla.
- **Concurrencia:** transición y edición escriben con `.eq('estado_pub', <leído>)` y 409 si 0 filas (`codigo: 'conflicto'`); lo decidido con la pantalla vieja ya no pisa un retiro/aprobación ajena. La cola de revisión se refresca conservando el aviso.
- **Situación comercial** (`estatus`: disponible | pausada | vendida | rentada | eliminada («archivada»)): conjunto cerrado validado en servidor; el cambio deja antes/después en `audit_logs`.
- **Identidad:** id técnico = UUID (`crypto.randomUUID()`), separado del folio (público, permanente) y del slug (dirección); `idPresentable` lo trata como no-presentable.
- **Pendiente (no se hizo):** (1) auditoría de transiciones aún NO es atómica con el cambio (necesita migración tipo 31: `propiedad_cambiar_estado`); (2) el webhook de Telegram (admin, allowlist de chats) publica sin pasar por la máquina de estados; (3) la firma de Cloudinary vale 1 h aunque cambie dueño/estado.
- Sin migraciones, sin deploy. Solicitudes/citas: ya cuelgan de `propiedad_id`/dueño y respetan `estatus`; no se activó `citasEnLinea`.

## D-53 · Property Core — cierre de gaps restantes: slug, caminos a `publicada`, atomicidad de la bitácora (4-oct-2026)
**Slug.** Unicidad REAL en la base: `propiedades_slug_unico` (índice único parcial, verificado en producción: 5 slugs, 0 duplicados) y el cliente no escribe `slug` (`CAMPOS_RESERVADOS`). Gap cerrado: una colisión dejaba la propiedad con su id como URL para siempre (cada reintento recalculaba el MISMO candidato). Ahora `asignarSlugAlPublicar` reintenta hasta 4 veces con un sufijo más largo y distinto (`slugUnico(p, id, intento)`), tanto ante choque previo como ante `23505`; el intento 0 es el de siempre (los slugs publicados no cambian). Si todo choca, se publica con el id y nunca falla la publicación.
**Caminos a `publicada`** (inventario completo de escritores de `estado_pub`): (1) `POST /api/propiedades/[id]/estado` (la máquina de estados); (2) `POST /api/admin/propiedades` (alta heredada, solo admin); (3) webhook de Telegram. Los dos últimos NO respetaban la regla: el alta heredada insertaba el cuerpo tal cual y `estado_pub` tiene `DEFAULT 'publicada'` (así quedaron `sanjuan` y `tzula-castillos` publicadas, sin `publicada_en` y sin una fila de bitácora); Telegram publicaba con UNA foto, sin mirar quién era el dueño y sin bitácora. Ahora ambos usan `decidirPublicacionAutomatica` (misma regla: `faltantes` + `puedeTransicionar` + capacidades; sin cuenta o con un publicador sin `publicar_sin_revision` → `en_revision`, nunca `publicada`; cuenta inactiva → nada), escriben condicionado al estado leído y dejan bitácora. **Cambios de comportamiento a tener presentes:** el bot de Telegram ya no publica un anuncio con 1 foto ni sin descripción (exige lo mismo que la web: campos + 5 fotos) y, según la cuenta dueña, publica o envía a revisión; el panel clásico crea BORRADOR salvo que pida `publicada` explícito y completo. Una prueba guardia lista los únicos escritores de `estado_pub`.
**Atomicidad de la bitácora.** Sí hay una ventana real: `/estado` hace `update` y DESPUÉS `registrar()` (llamada aparte, errores tragados; la función serverless puede morir entre ambas) → la propiedad cambia sin huella. No se puede cerrar sin SQL (dos llamadas HTTP no son una transacción), así que SÍ requiere migración. Propuesta mínima, NO aplicada y fuera de `supabase/`: `docs/propuestas/33-propiedad-cambiar-estado.PROPUESTA.sql` (función `propiedad_cambiar_estado`: bloquea la fila, compara el estado leído → `conflicto`, máquina de estados y lista blanca de columnas/valores en la base, huella completa con nota ≥ 10 al rechazar, `service_role`). Probada en PGlite, incluida la equivalencia de las 25 combinaciones con `puedeTransicionar`. Código asociado al adoptarla: `/estado`, Telegram y alta heredada llaman a la función en vez de `update` + `registrar`.
**Pendiente:** (1) aprobar y aplicar la 33 (después del código); (2) idempotencia del bot ante reintentos de Telegram (`update_id`); (3) firma de Cloudinary de 1 h.

## D-54 · Migración 33 APLICADA y adoptada en los tres escritores de `estado_pub` (4-oct-2026)
- **Migración 33** (`supabase/33-propiedad-cambiar-estado.sql`, reversa `…REVERTIR.sql`): función `public.propiedad_cambiar_estado(p_id, p_antes_estado, p_estado, p_cambios, p_audit)`, `security invoker`, `search_path=''`, sólo `service_role`. ADITIVA: una función; no toca datos. **Aplicada en producción el 4-oct-2026** (antes del código que la usa). Verificada: existe, invoker, `search_path=""`, `anon` y `authenticated` NO pueden ejecutarla, `service_role` sí; sondas de solo lectura → `no_existe` / `conflicto` sin escribir; `audit_logs` 286 y las 8 propiedades sin cambios.
- **Qué hace:** bloquea la fila, compara el estado leído (`conflicto`), valida la máquina de estados (unión de roles de `lib/publicacion.ts`; una prueba la compara con `puedeTransicionar` en las 25 combinaciones), lista blanca de columnas Y de valores, nota ≥ 10 al rechazar / pedir cambios, huella completa, y escribe cambio + `audit_logs` en una sola transacción. Quién puede pedir cada transición (rol, capacidad, dueño, completitud, contacto) sigue decidiéndolo el SERVIDOR antes de llamarla: las reglas y capacidades no cambiaron.
- **Adopción** (helper único `src/lib/cambiar-estado-propiedad.ts`): `/api/propiedades/[id]/estado`, webhook de Telegram y alta heredada `/api/admin/propiedades` (ahora INSERT como borrador + transición atómica a `publicada`; si la transición falla queda BORRADOR y se dice: falla cerrado). Desaparece el patrón `update` + `registrar()` separado en esas transiciones. Función ausente → 503 sin cambiar nada. Conflicto → 409.
- **Orden de despliegue:** la base ya la tiene; el código viejo la ignora y el nuevo la exige (503 si falta). Revertir la migración con el código nuevo desplegado bloquea los cambios de estado: la reversa va acompañada del rollback del código.
- **Se mantiene:** el alta (INSERT) se registra aparte (`propiedad.crear`); el PATCH de contenido y `propiedad.editar` siguen con `registrar()` (no son transiciones de estado). Telegram responde 200 aunque falle el cierre (a propósito: un 500 haría reintentar a Telegram y duplicar; idempotencia por `update_id`, pendiente).
- **Codex L2:** SQL y adopción sin hallazgos de integridad; 2 P2 de diseño (200 de Telegram; alta heredada parcial pero fail-closed), documentados.
- **Pendiente:** idempotencia de Telegram; firma de Cloudinary de 1 h; deploy del código.

## D-55 · Despliegue de Property Core (E-32) (4-oct-2026)
`dpl_ERgpAiAXb4wwKv81WuVvZjmop8Ko` promovido el 4-oct-2026 06:19 UTC (migración 33 ya aplicada). Payload 366 archivos: 10 modificados + 1 nuevo (`cambiar-estado-propiedad.ts`) respecto a E-31, 0 inesperados, sin trabajo V-1.1.95. Gates: tsc, 92 archivos / 1823 tests en staging, build, Playwright 32/32 (cambio de cuenta + revisión, 390/768/1024/1440), Codex L2 sin P1/P2. Verificado en vivebienn.com: smoke 18 rutas, 23 comprobaciones de Property Core (fichas, catálogo sin columnas internas, escrituras sin sesión → 401, Telegram sin secreto → 401), 0 errores de runtime, datos idénticos (hash de propiedades, usuarios, invitaciones y flags; `audit_logs` 286). Rollback: `dpl_9vUfs9fDedpdeR7YxGPUcychwhAA` (E-31); la 33 no se revierte.

## D-56 · PUBLICADOR sobre el Property Core — el servidor valida el contenido (4-oct-2026, SIN desplegar)
Inventario: ya existían el ciclo normal (crear → borrador → revisión → cambios/rechazo → publicada), la publicación directa del asociado (`publicar_sin_revision`), la corrección de lo publicado (`editar_publicadas`), bloqueo en revisión, propiedad ajena (403), lecturas sin datos internos, nota del revisor visible y citas por capacidad. Gaps reales cerrados:
- **Contenido validado en el SERVIDOR** (`lib/sanear-propiedad.ts`): la validación (zod) vivía sólo en el navegador y el servidor protegía con lista NEGRA (falla abierta). Ahora LISTA BLANCA de las 28 columnas de contenido (+ `estatus`/`gestion` sólo para quien modera) y valor validado por campo (enumerados, rangos, longitudes, `extras` ≤ 20 KB). Los campos de dueño, estado, folio, slug, contadores y contacto (`owner_id`, `created_by`, `publicador_id`, `mostrar_publicador`, `contacto_publico`, `whatsapp`…) nunca se escriben desde el cuerpo y el intento queda registrado.
- **Medios:** las fotos/planos de un publicador sólo pueden ser de NUESTRA cuenta de Cloudinary (`https://res.cloudinary.com/<nube>/(image|raw|video)/upload/…`, sin credenciales ni puerto, nunca `/fetch/`), los videos sólo YouTube canónico, o lo que la propiedad ya tenía (datos anteriores). Antes, 5 cadenas cualquiera contaban como «5 fotos» y un asociado podía PUBLICAR directo un anuncio con fotos inventadas. Un administrador conserva su libertad de origen (https), no la de escribir basura. Los valores ya guardados no se rechazan si no se tocan.
- **Límites que existían y no se aplicaban:** `TOPES.edicion` (240 escrituras / 10 min) ahora se aplica por cuenta en crear, editar y cambiar de estado (429 + `Retry-After`); tope de 30 borradores abiertos por cuenta que no modera.
- **Se mantiene:** reglas y capacidades; la validación del navegador sigue siendo comodidad.
- **Codex L2:** sin IDOR/escalamiento. Corregido P3 (URL de Cloudinary más estricta). Documentados: P2 tope de borradores no atómico (anti-abuso, no frontera de seguridad; un conteo + insert); P2 el tope de escrituras comparte contador entre autoguardado y transiciones (por cuenta; no bloquea a otras); P2 «campos del esquema del asistente» verificado: el editor sólo escribe columnas de la lista blanca (prueba que escanea el editor).
- **Pruebas:** `tests/publicador-completo.test.ts` (57) · suite 95/1916 · tsc · Playwright `publicador.e2e.ts` 32/32 (390/768/1024/1440) con API y Google simulados.
- **Pendiente:** prueba autenticada REAL (publicador normal, asociado, admin revisando) con cuentas de prueba tras desplegar; deploy; ayuda: mencionar el tope de 30 borradores (opcional).

## D-57 · CIERRE DEL MÓDULO PUBLICADOR — checkpoint previo al deploy (4-oct-2026, SIN desplegar)
Revisión acotada (sin tocar ADMIN, SUPER_ADMIN, invitaciones, sesión ni Property Core). Hallazgos y correcciones:
- **P1 (mío, detectado por Codex L2 ronda 1):** la auditoría `antes/después` que añadí a la edición de lo publicado volcaba hasta 120 caracteres de texto libre (una descripción puede traer teléfonos o correos). Ahora el texto libre se registra sólo como longitud (`{ n }`), las coordenadas como `[coordenadas]` (pueden ser exactas aunque el anuncio muestre una zona aproximada), las listas por cantidad y los objetos como `[objeto]`.
- **P2:** el tope de 30 borradores no era robusto ante peticiones paralelas → tras insertar se vuelve a contar y, si se pasó, se revierte el alta (sólo la fila recién creada, de esa cuenta, en borrador); si la reversa falla se responde 503 y se registra. Un tope atómico "de verdad" exigiría una función SQL (migración): se deja como mejora opcional, no es frontera de seguridad.
- **P2 aceptado:** `TOPES.edicion` es un contador en memoria por instancia (documentado en `lib/limites.ts`): freno oportunista contra abuso razonable, NO una frontera de seguridad. La frontera real son la lista blanca de contenido, las capacidades en el servidor y la transición atómica (migración 33).
- **Validación de `pies` de foto:** llegaba a la base sin mirar su forma → `sanearPies` (objeto plano, claves https, textos ≤ 400).
- **Mensajes de error:** el publicador leía `precio: …`; ahora «Precio: número fuera de rango».
- **Accesibilidad (axe):** `color-contrast` serio en el panel (`Bienvenida`, `#6b7280` sobre `#f4f6f8` = 4.46:1), en el editor (`#8B95A3` sobre blanco = 3.03:1, 13 usos) y en el título provisional del panel. Corregidos a `#4b5563` / `#5A6472`. Pendiente fuera del módulo: la TARJETA PÚBLICA de la vista previa (`PropertyCard`, ubicación en `#8B95A3`) tiene el mismo contraste; es diseño del sitio (V-1.1.95 trabaja ese archivo) y se excluye de la prueba con `data-vista-previa`.
- **Falsos positivos de Codex:** `whatsapp`/`telefono` fuera de la lista blanca (son contacto reservado, a propósito); libertad de origen de medios del administrador (intencional); ESLint `react-hooks/set-state-in-effect` del editor y 16 errores del dashboard clásico existen ya en producción (no introducidos).
- **Verificado sin cambios:** sólo 5 escritores de `propiedades` (alta del publicador, alta y edición/borrado de admin, Telegram, slug) y la transición atómica; ningún Server Action; `PUT`/`DELETE` del publicador no existen (DELETE de propiedad = sólo la casa); la lista blanca coincide con las 28 columnas de contenido de la tabla y con las claves que escribe el editor (una prueba lo escanea); en `/api/usuarios/me` un publicador no cambia `rol`, `tipo_publicador` ni `permisos_override` (pruebas existentes).
- **Decisión consciente:** con `editar_publicadas`, el asociado puede corregir CUALQUIER campo de contenido de lo ya publicado sin revisión (diseño de ADR-0013); ahora cada edición deja qué cambió (antes → después, sin texto libre).
- **Riesgo residual (P3):** entre leer una propiedad y escribir, una edición concurrente propia puede cambiar el contenido que se comprobó para enviar a revisión/publicar (TOCTOU de contenido, no de estado); sólo se da con dos peticiones simultáneas de la MISMA cuenta y un admin sigue revisando lo enviado.
- **Pruebas:** Vitest 95 archivos / 1931 · `tsc` · Playwright `publicador.e2e.ts` 52/52 (13 × 390/768/1024/1440) con axe sin violaciones serias · Semgrep (p/typescript + p/owasp-top-ten) 79 reglas, 0 hallazgos · Codex L2 2 rondas.
- **BLOQUEADO — prueba autenticada real:** sólo existen 1 publicador normal (cuenta personal), 0 asociados y ningún admin aparte del super admin; sin credenciales de QA no se hizo (no se inventan ni se crean cuentas). Sin esa prueba el módulo NO se despliega.


## D-58 · QA AUTENTICADO REAL del PUBLICADOR (E-33) — resultado (4-oct-2026, SIN desplegar)
**Entorno:** servidor LOCAL con el código nuevo contra Firebase/Supabase reales, SIN variables de Telegram ni correo (no pudo salir ningún aviso real; el log lo confirma: «alertas sin configurar»). 3 cuentas QA (`+qa-pub`, `+qa-asoc`, `+qa-admin`) creadas por la persona con sus contraseñas en Chromium (nunca vistas). Roles fijados por la función atómica `usuario_cambiar_rol_estado` / `usuario_cambiar_permisos` con actor honesto `qa-e33-claude` (el Google del super admin no entraba en localhost: `auth/unauthorized-domain`); el motivo pedido «QA E-33» se alargó a «QA E-33 · prueba de PUBLICADOR autorizada…» porque la función exige ≥ 10 caracteres para el nivel admin.
**Resultado: 114/121 comprobaciones en vivo; los 7 fallos eran del script o del producto ya corregido** (3 de selector/regex del script, 4 de la cola del admin → corregida y repetida 8/8). A (normal) 20/20 · B (admin) · C (asociado) 17/18 · D (seguridad cruzada) · citas · barrido 390/768/1024/1440 + axe.
- **Verificado en real:** crear/guardar/editar (UI + autoguardado), candado del perfil (sin teléfono/WhatsApp no se envía), enviar a revisión, observaciones del revisor, «cambios solicitados» exige nota (UI y servidor), reenvío, aprobación del admin; publicada → el normal no la puede modificar (409), despublicar (403) ni subir fotos (409); el asociado publica directo por la UI («Publicar ahora»), corrige lo publicado (`editar_publicadas`), no modera, no entra a la administración y no escala por `/me`; el ADMIN no se escala ni se suspende a sí mismo (400), no da el rol admin (403) y no entra a flags (403); IDOR cruzado y lectura de una propiedad real → 403 en todo; medios inválidos (`javascript:`, `data:`, `file:`, `http`, otra nube, `/fetch/`, credenciales, puerto, URL interna) → 400; listado del publicador sin datos internos; auditoría correcta (una huella por transición con actor y antes/después; ediciones de lo publicado con antes→después sin texto libre).
- **Hallazgo de producto:** `pausada` NO oculta una propiedad del sitio: el catálogo, el sitemap y la lectura pública de la base solo miran `estado_pub = 'publicada'`. Cualquier propiedad que llegue a `publicada` es pública en segundos (verificado) y sigue en la caché del catálogo hasta ~5 min. Decisión de producto pendiente (¿excluir `pausada` del catálogo público?). Ventanas de la prueba: 6 s y 17 s (la 2.ª se alargó ~6 min porque MI consulta al catálogo llenó la caché: no consultar el catálogo público mientras algo QA esté publicado). Revertir por la ruta de producción purga la caché; un servidor local no.
- **Corregido (cola de revisión del admin):** texto `#888` sobre `#f5f4f2` (3,22:1, serio) y `<main>` anidado en el `<main>` del panel → `#5A6472` y `<div>`.
- **Límites aceptados por el alcance:** el botón de subida firmada de Cloudinary no se ejercitó (las claves son «sensibles» en Vercel y no se pueden descargar; no se pidieron): se referenciaron 5 imágenes ya existentes de la nube propia, con el mismo formato que devuelve el uploader; datos del interesado (PII) solo por pruebas automatizadas (no se generó ningún lead); citas solo por capacidades, `/me` y pantalla (`citasEnLinea` OFF); el contador 429 no se probó en vivo.
- **Limpieza y verificación:** 3 propiedades QA borradas por la ruta de admin (`fotos` en cascada: 105 = línea base); 3 cuentas QA suspendidas (2 por la ruta de admin, `+qa-admin` por SQL atómico); `audit_logs` 286 → 334 (48 filas de la prueba, no se borra ninguna). Usuarios reales, flags (v12), invitaciones #3/#4, las 8 propiedades reales (hash sin contadores `vistas`), fotos, leads y solicitudes: IDÉNTICOS a la línea base.
- **Codex L2:** ronda 1 sin poder leer los artefactos (el sandbox no lee la carpeta temporal) → falso positivo de alcance (comparó con HEAD, no con producción); ronda 2 con todo el material en el prompt: P0 = 0, P1 = 0, ningún P2 bloqueante. P3 asumidos: la consulta al catálogo alargó la exposición; falso positivo de regex en citas; la prueba D8 era débil → reforzada con `publicador.e2e.ts` («Tu cuenta no tiene acceso al panel», sin tabla ni selector de rol).
- **Pruebas finales:** Vitest 95/1931 · tsc · Playwright `revision` + `publicador` 76/76 (4 anchos) · axe sin serias/críticas.

## D-59 · Visibilidad pública: `pausada` y `eliminada` no se muestran (6-oct-2026, SIN desplegar)
**Origen:** hallazgo de D-58 (`pausada` seguía en catálogo, ficha y sitemap). **Regla única** (`src/lib/visibilidad-publica.ts`, `esVisibleAlPublico`): visible = `estado_pub` publicada (ausente = publicada, como antes) Y `estatus` no sea `pausada` ni `eliminada`. `disponible`, `vendida`, `rentada` y `estatus` nulo siguen visibles (política existente, no se inventa otra). `estado_pub` y `estatus` son ejes distintos.
**Aplicada en:** `api/catalogo`, `sitemap.ts`, `lib/ficha-servidor.ts` (`resolverCon` → `no-existe` → 404), `propiedades/[id]/page-client.tsx` y la rama anónima de `GET /api/admin/propiedades` (la de admin devuelve todo). Filtro en JS, no `not in` SQL (excluiría los NULL). Sin migraciones, sin tocar roles/citas/flags; portal/alertas/citas/búsquedas conservan su lógica propia.
**Residual (decisión pendiente):** la política RLS `propiedades_lectura_publica` sólo mira `estado_pub`; un cliente que consulte PostgREST directo con la clave anónima aún puede leer filas pausadas. Cierre real = migración (propuesta, NO aplicada): `USING (estado_pub='publicada' AND coalesce(estatus,'disponible') NOT IN ('pausada','eliminada'))`.
**Efecto en producción al desplegar:** `sanjuan` (publicada + pausada) deja de verse; caché del catálogo ≤ ~5 min.
**Pruebas:** `tests/visibilidad-publica.test.ts` (20); Vitest 96/1951; tsc y eslint limpios. **Codex L1:** P0=0; P1 (estado_pub nulo visible) = comportamiento previo intencional (la RLS ya exige `publicada`, por lo que un NULL no llega a anon); P2 (estatus NULL visible) = intencional y documentado; P3 = el residual RLS.

**Actualización (6-oct-2026) · la base de datos y la aplicación ya comparten la misma regla.** Migración **34** (`supabase/34-rls-lectura-publica-estatus.sql` + `.REVERTIR.sql`), **preparada y probada, NO aplicada en producción**: un solo `ALTER POLICY "propiedades_lectura_publica" ON public.propiedades USING (estado_pub = 'publicada' AND coalesce(estatus,'disponible') NOT IN ('pausada','eliminada'))`. Conserva nombre, comando SELECT, roles (anon, authenticated) y tipo permisivo; no deja un instante sin política; falla cerrada si la política no existe. Estado leído en producción antes de escribirla: una sola política, `USING (estado_pub = 'publicada')`, 9 filas, 0 con `estatus` NULL. Panel, publicador, portal, citas, búsquedas y rutas internas leen con `service_role` (ignora RLS): sin efecto. Efecto colateral: `fotos_lectura_publica` consulta `propiedades` como quien lee, así que las fotos de una pausada también dejan de ser públicas. Aplicar DESPUÉS de desplegar el código de D-59. Pruebas: `tests/migracion-34-rls-lectura-publica.test.ts` (15, PGlite con `set role`); Vitest 97/1966; tsc y eslint limpios; Codex L1 (solo SQL/RLS): sin P0/P1/P2/P3.

**Aplicada (6-oct-2026):** la migración 34 se aplicó en producción (`apply_migration` `34_rls_lectura_publica_estatus`) tras confirmar que la política seguía idéntica a la leída antes. Verificado en solo lectura: `USING ((estado_pub = 'publicada') AND (COALESCE(estatus,'disponible') <> ALL (ARRAY['pausada','eliminada'])))`, mismos roles/cmd/tipo; `anon` y `authenticated` leen 7 de 9 (0 pausadas/eliminadas/no publicadas), `service_role` ve las 9; fotos visibles 112 de 118 (las 6 de propiedades ocultas ya no son públicas); las demás políticas (7 en total, igual que antes), propiedades, usuarios, invitaciones, configuración, fotos y `audit_logs` quedaron idénticos a su línea base. **La capa de aplicación y la RLS comparten la misma regla.**
**E-33 preparado, NO promovido:** staging `vivebien-deploy-stage-e33` = E-32 verificado (payload == árbol real de producción 366/366) + 13 archivos modificados + 2 nuevos (PUBLICADOR, cola de revisión, D-59; `page-client.tsx` de la ficha SANEADO: producción + solo la regla D-59, sin el visor de fotos de V-1.1.95). Manifiesto `d18dab97…a0f0`, payload `695347e5…9589`. tsc, Vitest 95/1930, build, Playwright revision+publicador 76/76, smoke local contra la base real y escaneo de secretos: OK. Codex L1: sin P0/P1; P2 conocido (tope de 30 borradores no atómico), asumido. Rollback: `PROMOCION_Y_ROLLBACK_E33`.

**Candidato E-33 creado (6/7-oct-2026, NO promovido):** `dpl_F1tkBFb56q6cuxieQpriz8MazLHt` · `vive-bien-olr1svna6-grupo-p-once.vercel.app` · READY/STAGED · target production sin dominios propios (solo el alias automático `vive-bien-grupo-p-once.vercel.app`) · árbol real == payload aprobado (368/368; 13 modificados + 2 nuevos vs E-32; 0 sobran/faltan/sha1 distinto) · manifiesto `d18dab97…a0f0`, payload `695347e5…9589`. Smoke solo lectura: candidato 26/26 (APIs; las páginas de *.vercel.app redirigen 308 a vivebienn.com por diseño, `next.config.ts`) y el MISMO build servido en local 26/26 (fichas, sitemap, 404). RLS verificada con la clave anónima: 0 filas de pausada/eliminada/no publicada y 0 fotos de ocultas. Playwright revision+publicador 76/76 y visual 390/768/1024/1440 sin desborde ni errores. Codex L1 sobre el staging: sin P0/P1/P2/P3 nuevos. Rollback de código = `dpl_ERgpAiAXb4wwKv81WuVvZjmop8Ko` (E-32); la migración 34 NO se revierte con él (el código viejo sigue coherente con la RLS nueva).

## D-60 · Meta-skill `vivebien-task-observer` (7-oct-2026)
Adaptación mínima de task-observer (rebelytics/one-skill-to-rule-them-all, CC-BY-4.0): se tomó la metodología (observación por archivo, escaneo solo de frontmatter, prueba de generalización, «segunda falla = barrera estructural», staging con aprobación) y NO la infraestructura (plugins, validadores, migraciones, revisión semanal larga). **Reglas de VIVE BIEN prevalecen** (producción como verdad visual, deploy/migración solo con autorización, Codex solo revisión, ahorro de tokens).
**Garantías estructurales:** (1) nunca modifica skills activas: solo escribe en `~/.claude/projects/<proyecto>/skill-observations/` (fuera del repo y de cualquier carpeta de skills; la ruta se rechaza si es relativa o está dentro de `skills`) y propone/stagea en `skill-updates/`; (2) activación no semántica: bloque en `CLAUDE.md` + hook `SessionStart` en `.claude/settings.json`; (3) `tests/task-observer.test.ts` (12) prueba carga, registro, recuperación, archivo y que el árbol de skills queda idéntico. No viaja en ningún payload de deploy. Guía: `.claude/skills/vivebien-task-observer/README.md`.
**Primer uso real:** 3 observaciones (una cerrada con test: un wrapper `$(…)` ocultaba el código de salida y habría escrito en `/observation-log`).

## D-61 · Barrera de QA de despliegues y token de bypass (7-oct-2026, observaciones 0001/0002 del Task Observer)
**Problema 1:** `vercel curl` sobre el candidato protegido creó un token de bypass (`automation-bypass`) del proyecto sin pedirlo. **Resuelto:** era el único (creado 2026-10-07T04:44:17Z), sin referencias en el repo ni en variables del proyecto y sin copia local (0 coincidencias en 15 290 archivos); se REVOCÓ con guardas, sin imprimirlo; ahora 0 secretos y la protección SSO del proyecto no cambió. Ningún deployment ni dato se tocó.
**Problema 2:** las páginas de `*.vercel.app` redirigen 308 a vivebienn.com (`next.config.ts`), así que el candidato no es navegable. **Barrera:** `scripts/qa/smoke-deployment.ts` con tres modos que no se mezclan: `candidato` (solo `/api/*`; de las páginas solo verifica la redirección; exige `--permitir-bypass` y revoca el token que cree, solo ese), `staging` (el mismo build en local; rechaza cualquier base no local), `produccion` (solo post-promoción: se niega mientras vivebienn.com no sirva el `dpl_` esperado). La spec se valida entera ANTES de tocar red o Vercel. No se cambió `next.config.ts`. Pruebas: `tests/smoke-deployment-barrera.test.ts` (23) + comprobación en vivo. Puntero en la skill `vivebien`: STAGED (`skill-updates/2026-10-07/vivebien`), pendiente de aprobación.

**E-33 PROMOVIDO (7-oct-2026):** `dpl_F1tkBFb56q6cuxieQpriz8MazLHt` es producción (vivebienn.com, www y el alias automático; READY/PROMOTED). Smoke post-promoción 23/23 (`scripts/qa/smoke-deployment.ts produccion --esperado …`, spec `scripts/qa/specs/e33-produccion.json`), visual 390/768/1024/1440 sin desborde ni errores, RLS anónima 0 filas ocultas, datos idénticos antes/después (propiedades, usuarios, invitaciones, configuración, fotos 118, audit_logs 382), sin logs de error/warning, migración 34 vigente. Rollback de código: `dpl_ERgpAiAXb4wwKv81WuVvZjmop8Ko` (E-32), sin revertir la 34.

## D-62 · Campaña QA integral: pruebas, límites, rendimiento, seguridad y plan de reparación (7-oct-2026, SIN desplegar)
**Alcance:** descubrir, medir, documentar y priorizar; sin features, sin despliegue, sin migraciones, sin citas, sin datos reales. Producción = E-33 (`dpl_F1tk…`). Informe: `docs/QA/QA_INTEGRAL_2026-10-07.md` · matriz `docs/QA/MATRIZ_MAESTRA.csv` (137 filas: PASS 31, PASS CON OBS 78, BLOCKED 25, N/A 3, FAIL 0) · `docs/QA/DEFECTOS.md` (**P0 0, P1 1, P2 7, P3 10 abiertos + 1 cerrado, P4 2**) · `docs/QA/PLAN_REPARACION.md` (plan, roadmap, capacidad, puntuación).
**Método (decisión):** la carga y el caos se aplican a una **copia aislada** del código de producción con un **Supabase de réplica** (`tests/performance/mock-supabase.mjs`) que solo reenvía lecturas públicas `/rest/v1/` una vez y **descarta toda escritura**, porque no existe BD de pruebas (Supabase único = producción). Producción solo recibe smoke de 5 VU y lecturas. k6 2.2.0 instalado (`winget`), escenarios en `tests/performance/k6/`.
**Hallazgo principal (QA-001, P1):** cada petición dinámica del servidor retiene ~30–80 KB (`createClient` por petición con auto-refresco de sesión de `supabase-js`, que en servidor arranca un `setInterval`). Pruebas: heap tras GC forzado, diff de snapshots, código de la librería y A/B en copia aislada (memoria −70 %, p95 a 300 req/s 212→105 ms, 0 % errores a 450 req/s). Corrección propuesta (R-01, 9 sitios, sin migración) **no aplicada**: espera autorización.
**Capacidad medida (1 proceso, máquina de pruebas):** segura ~200 req/s (p95 39 ms), degradada 300 req/s, breakpoint ~390 req/s; Supabase bajo carga y producción bajo carga **no medidos** (regla). **Cierre:** `tests/chaos-catalogo.test.ts` (QA-015). Codex L1 (1 revisión): sin P0; el P1 pidió presentar el mecanismo como hipótesis y justificar el inventario → se añadió la evidencia de código y el inventario; 2 P2 corregidos (prueba de 8 s más estricta; la réplica solo reenvía `/rest/v1/`).
**Lecciones al Task Observer:** observaciones 0004–0007 (fuga vs GC perezoso; suite de sesión necesita flags; trampas de shell en Windows, 3.ª recurrencia → barrera propuesta; baselines visuales obsoletos).

## D-63 · Campaña de reparación post-QA D-62 (R-01…R-17), SIN desplegar ni migrar (7-oct-2026)
**Qué:** se repararon en código los defectos de D-62 sin tocar producción, sin migraciones y sin activar flags. Detalle y evidencia: `docs/QA/QA_REPARACION_2026-10-07.md`.
**Decisiones de diseño:**
- **Un solo cliente de Supabase de servidor** (`lib/supabase-servidor.ts`): sin auto-refresco ni sesión persistida (causa de QA-001) y con tiempo límite real **solo en lecturas** (GET/HEAD). Las escrituras nunca se abortan: su resultado quedaría desconocido y no son idempotentes. Barrera: prueba que falla si aparece otro `createClient` de servidor.
- **Límite de peticiones tras una interfaz** (`RateLimitStore`): memoria por defecto, Upstash REST solo si existen sus dos variables, con caída a memoria. 18 rutas pasan a `frenarAsync`. No se contrató ningún servicio.
- **`/api/salud` pública = `{ok:true}`**; el diagnóstico va a `/api/admin/salud` (admin o `SALUD_SECRETO`).
- **CSP sin `unsafe-eval`**, con `CSP_MODO` (informe por defecto). No se pasa a bloquear sin validar un inicio de sesión real en staging.
- **Ficha**: `unstable_cache` con etiqueta `ficha` (se invalida con `refrescarCatalogo`), presupuesto de tiempo y datos iniciales entregados por el servidor (adiós cascada JS→consulta). Imágenes responsivas y héroe precargado.
- **`/entrar`**: primera pintada según el dispositivo (pistas de cliente), CLS < 0,1.
- **Barrera de QA en producción** (`guardia-produccion.cjs`): las pruebas con navegador abortan telemetría/escrituras antes de salir (QA-021 fue el síntoma).
- **Baselines visuales con manifiesto y hash** (`scripts/qa/baselines.cjs` + prueba): ninguna captura cambia sin registrarse; las vigentes salen de fixtura congelada (`tests-visual/fixtura/publico.json`) o de los datos fijos del panel. La ficha pública se captura como «pausada» (404 por D-59).
**Candidato:** composición E-34 (`componer_src_e34.py`: E-33 + solo archivos R-xx, con 4 componentes «saneados» para no arrastrar V-1.1.95). **No** desplegado.
**Pendiente / necesita al usuario:** limpieza QA-021 (25 filas, SQL listo, no ejecutado); rama de Supabase para staging (de pago); autorizar el candidato E-34 en Vercel; credenciales Upstash; `CSP_MODO=bloquear` tras staging; revisión independiente de Codex (límite de uso hasta 2026-11-01: hueco que **bloquea cualquier promoción**); actualización de dependencias señaladas por Trivy (next 16.3.6 y otras; `next/og` no se usa).


## D-64 · E-34 promovido a producción (7-oct-2026, autorizado por el usuario)
`dpl_DsEZS1fK4kZnZvmo6FrtiZ29uEi4` (manifiesto `66d2958a…`, payload `0656bb50…`, 375/375) promovido sobre E-33 (`dpl_F1tkBFb56q6cuxieQpriz8MazLHt`, rollback disponible) a las 23:27 UTC. Sin migraciones, flags, roles ni datos tocados; smoke de producción 21/21; Codex L2 PASS (3 P3 preexistentes). QA-021 sigue pendiente de autorización. Detalle: `docs/QA/CIERRE_E34_2026-10-07.md`.


## D-65 · E-35 Seguridad y fronteras — candidato listo, NO promovido (7-oct-2026)
Candidato `dpl_CkuYRXsKNsZfNUedWgT5yfRtHPaB` (manifiesto `1cd158ec…`, payload `22419b49…`, 376/376) sobre E-34. Decisiones: `/api/admin/propiedades` pasa a una sola audiencia (admin; 401/403/200) y la lectura pública es `/api/catalogo`; el diagnóstico de Telegram sale del webhook a `/api/admin/telegram/diagnostico`; cabecera central `private, no-store` + `Vary` para identidad/citas/publicador/admin; `feedback` con cuerpo acotado, id acotado y tope por origen+artículo (no es protección distribuida sin Upstash); CSP sigue en informe. QA-021: SQL, rollback y evidencia listos, NO ejecutados. Codex L2 PASS (P3). Detalle: `docs/QA/E35_SEGURIDAD_Y_FRONTERAS.md`. Pendiente de decisión: reconciliar el repo con producción (obs. 0013).

**D-65 · actualización final:** el P3 de Codex (429 de feedback sin `no-store`) se corrigió solo en la ruta (`sinCache()`), sin tocar el helper compartido. Candidato FINAL `dpl_89Hy6zcGpMLKpvQz73WGywze2Y3U` (manifiesto `329cc480…`, payload `59d4a204…`, 376/376; difiere del candidato anterior solo en `feedback/route.ts`). Codex L1 PASS (0/0/0/0). Reconciliación del repo: para los 17 archivos de E-35 el repo era igual a producción; se aplicó solo el hunk E-35 (sin commit/push); V-1.1.95 intacto. Ver `docs/QA/E35_RECONCILIACION.md`.

**D-65 · E-35 PROMOVIDO Y CERRADO (8-oct-2026 01:18:58 UTC, autorizado por el usuario):** `dpl_89Hy6zcGpMLKpvQz73WGywze2Y3U` sobre E-34 (`dpl_DsEZS1fK4kZnZvmo6FrtiZ29uEi4`, rollback preparado, no ejecutado). Pre-checks exactos (manifiesto `329cc480…`, payload `59d4a204…`, 376/376). Smoke de producción 24/24; dominios y `data-dpl-id` correctos; cabeceras `private, no-store` + `Vary` confirmadas en Vercel real; CSP sigue en informe y sin `unsafe-eval`; bypass 0; sin cambios en usuarios, roles, flags, propiedades, fotos, leads, citas, invitaciones ni audit_logs; **QA-021 intacto** (25 filas, contador 27). Logs: sin 5xx en la ventana observada (~1 min), sin afirmar ausencia absoluta de errores. Detalle: `docs/QA/E35_SEGURIDAD_Y_FRONTERAS.md`.

## D-66 · QA-021 limpiado en producción (8-oct-2026 ~01:28 UTC, autorización explícita del usuario)
Se eliminaron EXCLUSIVAMENTE las 25 filas `property_view` ids 188–212 de VB-2026-00026 (`5243dab0-…`), generadas por pruebas de navegador de D-62. Una sola sentencia atómica con precheck y postcheck dentro (condiciones combinadas + huella md5 `c598d968…` idéntica a `QA-021-filas.csv` + totales 122/74→97/49). Resultado: ids 188–212 restantes 0; `property_view` de VB-26 = 2 (ids 179, 180); sin cambios en audit_logs, usuarios, propiedades, fotos, leads, citas, invitaciones ni flags. Migraciones 0, despliegue 0. **Alcance estrecho a propósito:** no se tocó `propiedades.vistas` (sigue en 27) ni `audit_logs`; corregir el contador queda pendiente de una autorización aparte. Rollback verificado y NO ejecutado: `QA-021-rollback-solo-eventos.sql` (el original `QA-021-rollback.sql` aborta a salvo porque `vistas` sigue en 27). Codex L1 PASS (2 P3). Detalle: `docs/QA/E35_SEGURIDAD_Y_FRONTERAS.md`.

## D-67 · E-35.2 contador QA-021 corregido (8-oct-2026 ~01:49 UTC, autorización explícita del usuario)
`propiedades.vistas` de VB-2026-00026 `27 → 2` (1 fila, 1 columna), una sentencia atómica con precheck y postcheck dentro y condición `id + vistas = 27`. Antes/después idénticos en eventos (97), `audit_logs` (382), usuarios, fotos, leads, citas, invitaciones, flags y `vistas` de las otras 8 propiedades. Sin fila de auditoría (alcance estricto), 0 migraciones, 0 despliegues. Rollback preparado y no ejecutado (`QA-021-contador-rollback.sql`). **Codex L1 BLOCKED por cuota** (disponible el 6-nov-2026); no se sustituyó con auto-revisión. QA-021 queda cerrado: 25 eventos eliminados (D-66) y contador sincronizado. Detalle: `docs/QA/E35_SEGURIDAD_Y_FRONTERAS.md`.

## D-68 · E-36 Dependencias y CVEs (8-oct-2026) — preparado, NO desplegado
`next` 16.3.4→16.3.8 (único cambio de `package.json`) + 14 actualizaciones de lockfile. `npm audit` 23→14 (crítico 2→0, alto 16→12); Trivy HIGH/CRITICAL 10→2. Sin majors ni `--force`; se rechazaron los «arreglos» de npm que bajaban `shadcn`→1.0.0, `eslint-config-next`→14.2.35 y `firebase`→9.14.0, y `npm audit fix` (+70 paquetes Firebase, bajaba `gaxios`). Las 14 restantes son clase C (Firestore no se importa; `uuid` sin `buf`) o D (CLI/lint sin versión corregida). Verificado `next/og` y `use cache`: no se usan. Pruebas: tsc, Vitest, build, Playwright 45+95 y axe sin regresiones. Codex BLOCKED por cuota. Detalle: `docs/QA/E36_DEPENDENCIAS.md`.

## D-69 · E-37 Accesibilidad y baseline de la ficha (8-oct-2026) — preparado, NO desplegado
axe (24 mediciones): serious 108→56, moderate 204→76, critical 8→8, 0 regresiones. 4 archivos (contacto, 404, consentimiento, portada): solo colores de texto con contraste WCAG AA y un `<main>`; marca y logo intactos; pruebas `e37-accesibilidad` rojas contra producción, verdes ahora. Lo que queda serious/critical es el catálogo (2 `select` sin nombre + 14 contrastes por ancho) en `PropertyCard.tsx` y `propiedades/page-client.tsx` → **NO tocados por la regla V-1.1.95; necesita tu decisión**. Nueva baseline reproducible de la ficha pública (propiedad real, fixtura congelada, replay 0 reenviadas, manifiesto `E-37`). Imágenes/timeouts/CLS: revisados, sin cambios (ya cubiertos por E-34). Codex BLOCKED por cuota. Detalle: `docs/QA/E37_CALIDAD_UX.md`.

## D-70 · E-38 Observabilidad (8-oct-2026) — preparado, NO desplegado
Registro seguro (una línea JSON con id de petición, despliegue, método y ruta SIN consulta; error truncado y limpio; JWT/Bearer/token de bot/correo/teléfono/`?token=` sustituidos; claves sensibles redactadas; nunca pila ni cabeceras), `conMetricas` (2xx/4xx/5xx + p50/p95/p99 + línea por 5xx/excepción) en catálogo, salud, feedback y `usuarios/me`, y umbrales iniciales (5xx > 1 %, p95 API 500 ms / SSR 1000 ms, RSS 900 MB, heap 400 MB) evaluados a petición en `/api/admin/salud`. `/api/salud` sigue siendo `{"ok":true}`. **Sentry evaluado y NO instalado** (cuenta, DSN y peso de bundle requieren tu autorización); alertas automáticas y `SALUD_SECRETO` pendientes de autorización. 21 pruebas nuevas. Codex BLOCKED por cuota. Detalle: `docs/QA/E38_OBSERVABILIDAD.md`.

## D-71 · E-39 Escalabilidad, webhooks y guardias; `qa:gate` (8-oct-2026) — preparado, NO desplegado
Webhooks de Telegram y WhatsApp endurecidos (secreto/token en tiempo constante, tope de cuerpo 64/256 KB, idempotencia por `update_id` en Telegram, registros sin texto de usuario ni errores crudos; **lógica de publicación y contratos externos sin cambios**; 7 pruebas nacieron rojas). Guardias estáticas (caracteres de control —encontró una regex de JWT muerta en una prueba—, secretos fuera del navegador, **11 carpetas de API autenticadas que faltaban en las respuestas `private, no-store`: añadidas**, rutas públicas que escriben deben llevar límite, webhooks, registros sin secretos). `npm run qa:gate` (10 pasos, entorno explícito, réplica aislada, sin empeorar en lint y axe, se niega en batería), `qa:security`, `qa:performance` (k6 100/200/300/450 contra la base E-34; detecta regresiones, no garantiza capacidad). Límite distribuido evaluado (Upstash recomendado; hoy ningún límite es distribuido): **no se instaló nada, necesita tu autorización**. Concurrencia real 6/6. QA-022 (P3) registrado. Codex BLOCKED por cuota. Detalle: `docs/QA/E39_ESCALABILIDAD.md`.

**D-71 · candidato consolidado E-36→E-39:** `dpl_CfwgKgpGRRAniArNXymWBSEWSVXj` (STAGED, 379/379, manifiesto `22fa0b42…`, payload `81d07122…`, smoke 18/18) sobre producción E-35. **NO promovido.** Rollback: `dpl_89Hy6zcGpMLKpvQz73WGywze2Y3U`. Detalle y riesgos: `docs/QA/E39_ESCALABILIDAD.md`.

## D-72 · Cierre del paso 9 del `qa:gate` y pre-checks del candidato E-36→E-39 (8-oct-2026) — NO promovido
**Paso 9 repetido con el equipo enchufado.** Corrida #1: 43 OK + 4 flaky + 1 fallo (texto desplazado en toda la página de catálogo/portada/panel; la diferencia cambió entre reintentos, 0,42 → 0,04). Corrida #2 (build limpio): **`qa:gate: TODO OK`** — navegador 95, axe sin empeorar, visuales 46 OK + 2 flaky que pasan al reintentar (0 fallos), API 14/14. El 47/48 anterior fue la batería.
**Conclusión correcta:** no se observó una regresión visual reproducible en la segunda corrida limpia; **permanece flakiness asociada a carga de fuentes/terceros, NO resuelta.** Sin cambios de código ni de interfaz para taparla sin más evidencia; las líneas base visuales no cambian. Codex sigue BLOCKED por cuota (hasta 6-nov-2026): no hay revisión independiente.
**Pre-checks (solo lectura):** candidato `dpl_CfwgKgpGRRAniArNXymWBSEWSVXj` READY/STAGED, 379/379, 0 sobran, 0 faltan, 0 SHA-1 distintos (manifiesto `22fa0b42…`, payload `81d07122…`); producción sigue en E-35 `dpl_89Hy6zcGpMLKpvQz73WGywze2Y3U`; rollback = ese mismo deployment; sin migraciones ni cambios de datos; sin variables nuevas (los webhooks usan las ya existentes). **Pendiente: autorización explícita del dueño para promover.**
**`shadcn` → devDependencies: NO se mueve.** `src/app/globals.css:5` hace `@import "shadcn/tailwind.css"` en tiempo de build; sacarlo de `dependencies` arriesga la build si el entorno omite devDependencies, y mover `package.json` cambiaría el payload aprobado (nuevo candidato). Beneficio ínfimo. Se deja como P3 para un candidato futuro, con verificación de build remota.

## D-73 · Promoción de E-36→E-39 a producción (8-oct-2026)
Autorizada explícitamente por el dueño; `vercel promote dpl_CfwgKgpGRRAniArNXymWBSEWSVXj` ejecutado tras re-verificar el árbol (379/379). Producción: **E-36→E-39**; rollback `dpl_89Hy6zcGpMLKpvQz73WGywze2Y3U`. Smoke 24/24, 18 carpetas privadas con `no-store`, 3 dominios con el `data-dpl-id` nuevo, 0 × 5xx, datos sin cambios. Salió **sin revisión de Codex** (cuota). Detalle: `docs/QA/PROMOCION_E36_E39_2026-10-08.md`. Sin commit/push: el repo sigue por detrás de producción.

## D-74 · Diagnóstico de integridad del dominio del usuario (8-oct-2026) — solo diagnóstico
Causa del «Like → Guardados» roto: el corazón del catálogo escribe solo en `localStorage` (`vb_favorites`; confirmado en el bundle de producción) mientras «Mis guardadas» lee la tabla `favoritos` (0 filas); «Me interesan» no cuenta likes por D-27.2. Causas comunes: persistencia por superficie, estado de navegador no ligado al usuario, escrituras sin restricción de base, contador no atómico. 17 hallazgos (1×P1, 4×P2, resto P3/PASS). **Sin cambios de código, datos ni producción.** Corregir exige autorizar el toque a archivos V-1.1.95. Detalle y matrices: `docs/QA/DIAGNOSTICO_INTEGRIDAD_USUARIO_2026-10-08.md`.

## D-75 · «Guardar» es de la cuenta: corrección LOCAL de D-74 (8-oct-2026) — preparado, NO desplegado
El corazón del catálogo ya no escribe en `localStorage`: usa el almacén único `useFavoritos` (mismo que el portal) → `POST /api/favoritos` con **estado deseado** e idempotente (upsert, valida propiedad publicada) → tabla `favoritos`. Sin sesión el corazón manda a entrar; al cambiar de cuenta el almacén se descarta; se borran `vb_favorites`/`vb_historial` (sin migrarlos: nunca estuvieron en la base). Métricas = opción B (la tabla `favoritos` es la fuente; no se emite `property_favorite`). D-27.2 intacto. 31 pruebas nuevas + e2e en 4 anchos; lint sin empeorar; sin migraciones. **Detalle: `docs/QA/D75_GUARDADOS_CUENTA.md`.** Salir a producción exige decidir qué hacer con el residuo V-1.1.95 de `PropertyCard.tsx`.

## D-75.1 · Cierre controlado de D-75 y candidato local limpio (8-oct-2026) — LISTO PARA REVISIÓN, no desplegado
D-75 se separó limpiamente del residuo V-1.1.95 (los hunks de PropertyCard.tsx no se solapan): C:\Users\jemil\vivebien-deploy-stage-d75 = producción E-36→E-39 + sólo D-75. qa:gate completo = TODO OK (navegador 111/111, axe sin empeorar, visuales 46 OK + 2 flaky sin fallos, API OK). Lo único que cambió tras D-75 fue mi prueba e2e (defectos del test, no del producto). Migración de ayuda 35 preparada y probada, NO aplicada. Codex bloqueado hasta 6-nov. Hueco: sin prueba de navegador portal↔catálogo. Detalle: docs/QA/D75_1_CIERRE_Y_CANDIDATO.md.

## D-76 · Correo institucional de VIVE BIEN (8-oct-2026) — preparado y probado en local, NO desplegado
CORREO OFICIAL: informes@vivebienn.com (fuente única NEGOCIO.email en src/lib/config/negocio.ts; pie, contacto, términos, privacidad, error y JSON-LD lo leen). CORREOS PERSONALES CONSERVADOS: joseponcer@vivebienn.com y joseponcep@gp-once.com; no se usan como contacto institucional público y no se cambió ninguna cuenta de usuario. Para no confundir contacto con identidad se creó CUENTA_PROPIETARIO (siembra admin y respaldo de Telegram siguen reconociendo a la cuenta, no al contacto). Remitente de correos automáticos: Vive Bien <informes@vivebienn.com> (dominio verificado en Resend; RESEND_FROM no está definida); las citas añaden reply_to institucional; los avisos de interesados van a informes@ [SUPERADO por D-77: la copia temporal a la cuenta del propietario ya no existe; van sólo a informes@]. Guardia: tests/correo-institucional.test.ts (no prohíbe joseponcer@ en todo el código). PENDIENTES: confirmar que el buzón informes@ existe y recibe (MX = Google Workspace; NO VERIFICADO), datos legales faltantes en privacidad (razón social, RFC, domicilio, fecha), NEXT_PUBLIC_ADMIN_EMAIL huérfana. Detalle: docs/QA/D76_CORREO_INSTITUCIONAL.md.

## D-75.2 · Cierre funcional de guardados + correo institucional (8-oct-2026) — en curso, NO desplegado
- Nueva prueba e2e catálogo ↔ Mis guardadas (guardar, aparece, quitar allí, catálogo sin guardar, recarga) y A→logout→B→A en tests-visual/guardados.e2e.ts (20 pruebas en 4 anchos). Verificada con tsc; ejecución en navegador pendiente de que el equipo esté enchufado.
- Accesibilidad del corazón del catálogo: aria-label que dice la acción con el título ("Guardar X" / "Quitar X de guardadas") + aria-pressed, igual que la tarjeta del portal. Guardia en favoritos-guardias.
- Correo institucional: ver D-76.

## D-75.3 / D-76.1 · Cierre final de guardados y correo institucional (8-oct-2026) — READY FOR CANDIDATE, no desplegado
Guardados: e2e real en navegador (24/24, 4 anchos) del flujo catálogo -> Mis guardadas -> quitar allí -> catálogo -> recarga y de A -> logout -> B -> A; corazón del catálogo con aria-label + aria-pressed. Correo: aviso-lead.ts se analizó (cambio mínimo: un destinatario más, no una funcionalidad nueva); la copia a joseponcer@ se conservó como DESTINATARIO INTERNO TRANSITORIO hasta verificar el buzón [SUPERADO por D-77: buzón verificado y copia eliminada]. Las direcciones personales salieron del objeto NEGOCIO (que viaja en el JS público) a negocio-interno.ts: ahora sólo un chunk (la siembra admin) las contiene; en producción hoy están en JS público. Resend: dominio verificado, RESEND_FROM no definida, remitente por defecto Vive Bien <informes@vivebienn.com>; buzón informes@ PENDIENTE DE VERIFICACIÓN MANUAL (puerto 25 bloqueado). NEXT_PUBLIC_ADMIN_EMAIL: huérfana (0 lecturas), pendiente de limpieza de ENV (no se borró). Cookies: sin página propia. Pendientes legales: razón social, RFC, domicilio, fecha. qa:gate TODO OK en el árbol limpio (119 e2e, axe 24, visuales 48, API OK). Codex bloqueado hasta 6-nov. Detalle: docs/QA/D75_3_D76_1_CIERRE.md.

## D-77 · Candidato Vercel de D-75 + D-76 preparado (8-oct-2026) — STAGED, NO promovido
El propietario verificó manualmente (8-oct-2026) que informes@vivebienn.com existe y recibe correo. Se eliminó la copia transitoria a joseponcer@ de los avisos de interesados (aviso-lead.ts = to: [CORREO_CONTACTO], idéntico a producción; CUENTA_PROPIETARIO se conserva). Candidato: dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z (22:43 UTC, READY/STAGED, sin dominios), 382/382 archivos = payload aprobado (0 sobran/faltan/SHA distinto), manifiesto 0282b61a…, payload fc8156d9…; base = producción dpl_CfwgKgpGRRAniArNXymWBSEWSVXj (rollback). Sin V-1.1.95. qa:gate TODO OK antes de crearlo. No se ejecutó el smoke de candidato por Vercel (exige bypass temporal). Producción NO modificada. Pendientes: limpieza de NEXT_PUBLIC_ADMIN_EMAIL, migración de ayuda 35 (después de promover), datos legales, autorización para promover. Detalle: docs/QA/D77_CANDIDATO.md.

## D-78 · Promoción de D-75 + D-76 a producción (8-oct-2026)
Autorizada explícitamente por el propietario. vercel promote dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z tras re-verificar el árbol real (382/382). Producción: E-36→E-39 + D-75 (guardados de la cuenta) + D-76 (informes@vivebienn.com). Rollback: dpl_CfwgKgpGRRAniArNXymWBSEWSVXj. Smoke 24/24, 3 dominios con el data-dpl-id nuevo, correo institucional confirmado en 8 páginas y JSON-LD, 16 rutas privadas no-store, 0 x 5xx, datos idénticos antes y después. Salió sin revisión de Codex (cuota). Sin commit/push. Pendientes: migración de ayuda 35, NEXT_PUBLIC_ADMIN_EMAIL, observar primeros usos reales, datos legales. Detalle: docs/QA/PROMOCION_D75_D76_2026-10-08.md.

## D-79 · Migración 35 (Centro de Ayuda: «¿Cómo guardo una propiedad?») aplicada (8-oct-2026)
Autorizada por el propietario. Un UPDATE sobre una sola fila de knowledge_articles (cuerpo y actualizado_en), aplicado una vez a las 23:02:39 UTC. Antes se comprobó el alcance (1 fila, sin triggers, sin tocar estado ni firma de publicación) y que el texto de reversión coincide byte a byte con el actual (md5 0ca67f57…). Después: el artículo explica Guardados de la cuenta (tarjeta, sesión, Mis guardadas, no depende del navegador); el resto de artículos, categorías, fuentes y tablas de negocio, idénticos; el sitio público ya sirve el texto. Reversión preparada, no ejecutada. Detalle: docs/QA/MIGRACION_35_AYUDA_GUARDADOS_APLICADA.md.

## D-80 · Correo con Resend: flujo del visitante, consentimiento, límites y diseño (8-oct-2026) — LOCAL, NO desplegado
Datos en tablas propias de Supabase (no en Contacts/Broadcasts de Resend), funciones SQL atómicas para consentimiento/baja/supresión/presupuesto/idempotencia (migraciones 36 y 37, **sin aplicar**), enlaces firmados con HMAC (`CORREO_SECRETO`), todo **apagado por defecto** tras banderas. Flujo del visitante rediseñado tras la objeción del propietario («parece intento de hacker»): el primer correo ya entrega propiedades reales y trae el botón «Sí, quiero seguir recibiéndolas»; sin ese clic no se manda nada más; el siguiente envío es 3 días después del primero; el formulario no tiene casilla (el botón «Enviarme propiedades» es el acto afirmativo con aviso visible; texto versionado `marketing-2026-10-v2`). Límites internos 70/día y 2 000/mes (plan Free de Resend: 100/día, 3 000/mes), 20 reservados a transaccionales, pausa por rebotes/quejas. Plantillas basadas en las maquetas del propietario (campaña, bienvenida, bienvenida del portal) con mejoras. **Pendiente:** revisión legal del consentimiento sin casilla (LFPDPPP), e2e y `qa:gate` oficial (batería), activación (migraciones, variables, webhook, DMARC). Codex bloqueado hasta 2026-11-06. Detalle: `docs/QA/D80_CORREO_RESEND.md`, `docs/QA/D81_PUBLICACION_FILTROS_MULTIMEDIA.md` §7.

## D-81 · Publicación PUBLICADOR/ASOCIADO, filtros y multimedia: VB-2026-00027 (8-oct-2026) — LOCAL, NO desplegado
Diagnóstico con evidencia de sólo lectura: no hay defecto de servidor ni de permisos; la propiedad era un borrador incompleto (0 fotos, completitud 70 %), el botón final estaba deshabilitado, no hubo petición de cambio de estado ni fila de bitácora, y por eso no estaba en la cola de revisión. Se corrigió el texto del paso final (prometía revisión a quien publica directo) y se fijaron con pruebas las ramas del incidente y los filtros. Sin decisión de arquitectura nueva. Causa de las 0 fotos **no demostrada** (sin logs de ejecución). Riesgos: ciudad/colonia NULL en el 100 % del inventario, filtro de precio sin moneda, documentación (3 vs 5 fotos). Detalle: `docs/QA/D81_PUBLICACION_FILTROS_MULTIMEDIA.md`.

## D-80 · Modo de pruebas del correo (`CORREO_MODO_PRUEBAS`) (10-oct-2026) — copia aislada, NO integrado
Con el modo activo, todo correo de D-80 va a `jemilianoponceperez@gmail.com` (constante en código), sin CC/CCO, con barrera final en `enviarCorreo`. Cubre únicamente `lib/correo/*`; **tres emisores anteriores (aviso de lead, citas, invitaciones) no están cubiertos**. Detalle en `docs/QA/D80_PAQUETE_ACTIVACION.md` anexo 10. Pendiente de decisión del propietario: extender a los tres emisores, e integrar (commit + stage + gate).

**Actualización (10-oct-2026, mismo día):** el modo de pruebas se extendió a los cuatro emisores de Resend (D-80, aviso de lead, citas, invitaciones) mediante un único punto, `src/lib/correo/resend.ts` (`llamarResend`): reconstruye el cuerpo desde una lista blanca, fija destino y respuesta, elimina CC/CCO, adjuntos, cabeceras de baja y neutraliza enlaces con token. Sigue sin cubrir lo que NO pasa por Resend: correos de Firebase Auth (restablecer contraseña, verificar correo) enviados desde el navegador. Dos pruebas de reloj corregidas (sólo la prueba). Sigue sin integrar. Ver anexo 11.

**Actualización (10-oct-2026, tarde):** Firebase Auth (restablecer contraseña, verificar correo) cubierto con su emulador local: `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR` sólo se acepta si apunta a esta máquina; nunca definirla en Vercel de producción. Probado contra el emulador real (todas las peticiones locales; códigos `PASSWORD_RESET` y `VERIFY_EMAIL` en el emulador). Falta el E2E de navegador y sigue sin integrar. Ver anexo 12.

**Cierre D-80 (10-oct-2026, noche): DETENIDO en el gate.** Parche del modo de pruebas aplicado en el worktree `integracion/d80-correo` (sin commit), tsc/eslint/vitest específicos en verde; el gate oficial no se ejecutó (equipo en batería, falta `.env.local` público). Sin commit/stage/deployment. Producción en `dpl_99T2…` intacta. Siguiente etapa (separada): QA-019 (portal 404 con flags ilegibles). Ver anexo 13.

**Cierre D-80 parte 2 (10-oct-2026):** gate oficial 10/10 OK; commit `a6ebdb6` en `integracion/d80-correo` (sin push); stage nuevo `vivebien-deploy-stage-d80-modo-pruebas` (manifiesto `7ea9168f…`, payload `f08c0c41…`, verificador 17/18 con el falso positivo conocido). Deployment STAGED NO creado (bloqueado por el clasificador de permisos; comando documentado en el anexo 14). Producción intacta en `dpl_99T2…`.

## (sin número asignado) · Rediseño de la portada pública — Preview de staging (21-oct-2026)
**Estado:** hecho en el entorno aislado `etapa3\diseno-inicio-r86` y subido SOLO como Preview de staging (`dpl_EGHag2MUzsP9pdCVqYqPBxa76jHS`); NO promovido. Base: R8.6 en producción (`dpl_CLt7XsemNab3QBWGuNsSrwba6BqT`). Informe: `etapa3\diseno-inicio-r86\INFORME-DISENO-INICIO.md`.
**Decisiones (reversibles, visuales):**
1. Hero: la escena del video del propietario sustituye la foto genérica, **recortada** a la franja libre de texto (720×744) y a su resolución real: en escritorio ocupa la derecha (≤ 1,24×) y en teléfono va entera arriba. Sin audio; con portada estática; sin descarga con movimiento reducido o ahorro de datos. No se identifica la escena con un lugar (es una composición de IA); el brief del propietario (casa con alberca, presa del Parque Metropolitano, skyline de Gran Jardín) queda registrado como brief, no como hecho.
2. «Nuestra Esencia» se quita (repetía «Nuestro propósito»); «Nuestro propósito» se conserva una vez.
3. Oficinas se añade al mosaico con la clave `oficina` (la del catálogo, selector, contacto y pie); no hay clave nueva.
4. Un solo botón de WhatsApp en la portada (se oculta el del layout solo allí); en teléfono y tableta se aparta del hero y del formulario.
5. Formulario de contacto: mismo endpoint y cuerpo; validación visible en el navegador; «Oficina» entre las opciones.
**Pendiente de decisión del propietario:** versión 16:9 1080p del video (prompt listo en `PROMPT-VIDEO-HORIZONTAL-FLOW.md`); originales de PROIN y de las fotos; si se muestra leyenda «imagen ilustrativa»; promover o no este Preview.
**Trampas registradas:** `--font-montserrat` solo existe dentro de `.panel-vb`; `a:not([data-pantalla] a)` (color: inherit) pisa clases sueltas de color en enlaces (usar `html body a.clase`).

**Decisión (21-oct-2026, número por asignar) · Nosotros y Contacto con un solo patrón visual; imágenes y destinos.** Se rehacen «Nosotros» y «Contacto» según las láminas del propietario (`pg web/nosotros`, `pg web/contactanos`) con un patrón común (etiqueta con filete rojo → titular Playfair con cursiva roja → tarjetas blancas con diagonal roja), que la portada adopta. INTEN sale de «Nosotros». Destinos de las empresas como en gp-once.com; ANDAX → WhatsApp (477 811 6501). Imágenes: del propietario, de su sitio PROIN, Unsplash y Wikimedia (CC BY-SA 4.0 con crédito visible). Los testimonios se muestran con formato de reseña (sin logotipo de terceros) **sin fechas ni calificación agregada**, para no inventar datos. Dirección y horario salen de `NEGOCIO` (fuente única), no de la lámina. Solo Preview; sin promoción.

**Decisión (21-oct-2026, número por asignar) · Portadas por página y acceso.** Las portadas de Propiedades, Nosotros, Contacto y Valuador salen de las láminas del propietario (solo la fotografía; el texto es HTML) y se remasterizan (ver informe); el catálogo ya no usa la foto remota de Unsplash (precarga local). `/entrar`: el logotipo y un enlace sutil «Volver al inicio» llevan al sitio. Header: «Ayuda» y «Ingresar» sin candado. Inicio sin las tres cifras del hero. Solo Preview.

## D-80 · Compuerta común de envío `CORREO_ENVIO` (MKT-60, 2-nov-2026) — rama aislada `f0-correo-compuerta`, NO desplegada
**Causa.** `enviarPorEmisorUnico` (aviso de contacto, invitaciones, citas, avisos de búsqueda/baja de precio/legales) no tenía bandera de entorno; solo lo frenaba la falta de una lectura de cupo de Resend. Al guardar esa lectura en Producción (2-nov) el panel pasó a «permitido» y esos canales quedaron habilitados sin que nadie lo pidiera. `enviarCorreo` sí exigía `CORREO_TRANSACCIONAL`/`CORREO_MARKETING`.
**Decisión.** Una compuerta única, `CORREO_ENVIO`: solo el valor exacto `1` enciende; ausente, vacía o cualquier otra cosa = apagada (cierre seguro). Se lee SIEMPRE de la variable de entorno real (`envioHabilitado()`), antes de reservar cupo o llamar a Resend, en `enviarPorEmisorUnico`, en `enviarCorreo` y en la tarea diaria de avisos (que sigue creando los avisos del portal pero no manda correos). Ningún parámetro ni entorno inyectado puede encenderla. Encendida NO sustituye nada: cada correo conserva consentimiento, preferencias, cupo, estado del proveedor y, para lo de D-80, su bandera propia; marketing sigue exigiendo `MARKETING_AUTORIZADO` (constante de código) y `CORREO_MARKETING`. La lectura de cupo de Resend ya no enciende nada por sí sola. El panel de Marketing muestra la compuerta y el motivo `envio_apagado`.
**Pruebas.** `tests/correo-compuerta-envio.test.ts` (ausente, vacía, `0`, `true`, ` 1 `, `1`; ambos emisores; sin bypass; barrera estática), caso nuevo en `avisos-job-y-rutas` y `marketing-panel`.
**Estado productivo propuesto.** `CORREO_ENVIO` AUSENTE (todo bloqueado) hasta que el dueño decida encender; no se cambia ninguna variable de Producción con este commit.

**Adenda (2-nov-2026, revisión de calidad).** Dos registros de «sin RESEND_API_KEY» (`aviso-lead.ts`, `invitacion-correo.ts`) imprimían nombre/teléfono de un contacto y el correo de una persona invitada; ahora no llevan datos personales (prueba `correo-logs-sin-pii`). La línea base de lint (`docs/QA/lint-baseline.json`, 64) estaba desactualizada: en el commit Base `6fe6ca7` los mismos 7 archivos ya tenían los mismos errores (70 en total, comprobado archivo por archivo contra HEAD); se reescribió a 70/49 sin cambiar código de esas pantallas. Los 17 hallazgos de Semgrep se clasificaron uno a uno (falsos positivos con justificación, ver Obsidian); ninguno cae en archivos de MKT-60.

## D-82 · Lectura del consumo de Resend tras cada envío; la tarea diaria se retiró (5-nov-2026)
**Causa.** La compuerta del correo exige una lectura vigente (≤ 8 días) del consumo de Resend, registrada a mano por el Super Admin (`correo_conciliar`, migración 62). Un olvido cierra el correo opcional solo. El dueño pidió que fuera automática.
**Investigación.** La API de uso de Resend (`GET /usage`, beta privada) exige una llave de ACCESO COMPLETO (documentación oficial, 5-nov-2026); la llave de la aplicación es de SOLO ENVÍO (comprobado en el panel de Resend). Guardar en el servidor una llave que puede borrar dominios y llaves solo para leer el consumo aumenta el riesgo sin necesidad. Resend sí documenta las cabeceras `x-resend-daily-quota` (día UTC, solo plan gratuito) y `x-resend-monthly-quota` en las respuestas de la API. La documentación no dice en qué respuestas aparecen ni si cuentan la petición actual.
**Decisión.** (1) `leerCuotaDeResend` (en `correo/resend.ts`, único módulo que habla con Resend) hace un `POST /emails` de cuerpo VACÍO —Resend lo rechaza por validación antes de enviar nada— y lee las dos cabeceras; fuera de producción no toca la red. (2) `conciliarCuotaDeResend` la guarda por la misma función SQL que el panel, con actor `automatico:cuota-resend` y nota que lo dice. (3) Una tarea programada diaria nueva, `/api/alertas/cuota-resend` (06:00 UTC, protegida con `CRON_SECRET` y comparación en tiempo constante), es la ÚNICA tarea añadida para el correo; sustituye la decisión del 29-oct («sin otro cron») porque la lectura debe poder probarse y fallar sin tumbar el parte diario. (4) Falla cerrado: sin cabeceras, con un valor que no sea un entero limpio, sin base o sin red, NO guarda nada, avisa al grupo de alertas (sin llave ni datos personales) y deja la última lectura, que vence sola. La lectura manual del Super Admin sigue disponible.
**Camino por envío y revisión de Codex (5-nov-2026).** Como la documentación y otros proyectos solo confirman las cabeceras en envíos EXITOSOS, cada envío real exitoso (`enviarCorreo` y el emisor único) también registra la cuota de su respuesta (`registrarCuotaVista`, actor `automatico:cuota-en-envio`, como mucho una vez cada 10 min por instancia). Codex (`codex review --uncommitted`) halló dos problemas, ya corregidos: (P1) un envío reservado pero aún no entregado a Resend quedaba sin contar al refrescar la lectura, porque la compuerta solo suma los envíos con `creado_en >= leido_en`; ahora se SUMAN a la lectura los envíos de producción en estado `pendiente` de los últimos 10 minutos (conservador: puede contar de más, nunca de menos) y si no se pueden contar no se guarda; (P2) guardar la lectura se esperaba sin tope de tiempo en la ruta de un envío ya exitoso; ahora tiene tope de 2.5 s y nunca lanza.
**Riesgo abierto (RESUELTO por la prueba, ver «Resultado»).** Que Resend no devuelva las cabeceras en una respuesta de validación o a una llave de solo envío. Se comprobará en Producción con `vercel crons run`; si no aparecen, queda la lectura manual y la alternativa (decisión del dueño) de una llave de acceso completo guardada solo para esto. Pruebas: `tests/correo-cuota-resend.test.ts`, `tests/correo-guardias.test.ts`.

**Resultado en Producción (5-nov-2026, `dpl_JAynZvFPgnHFC8e1ocVTmwZe7gRs`, `vercel crons run`, una sola vez).** La sonda diaria (`POST /emails` vacío) **NO funciona**: Resend no devolvió la cabecera `x-resend-daily-quota` (registro: `sin_cabecera_diaria`) y `correo_conciliacion` no recibió ninguna fila (siguen solo las manuales id 1 y 2). Falló cerrado como se diseñó; no se inventó ningún dato. **Corrección de lo anterior:** la «Decisión» (1) y (2) quedaron superadas y NO están en el código; la «Investigación» sobre las cabeceras solo se confirmó para envíos exitosos.
**Decisión final.** Se RETIRA la tarea diaria (cron, ruta `/api/alertas/cuota-resend`, `leerCuotaDeResend` y `conciliarCuotaDeResend`) para no generar un aviso repetido cada día. SE CONSERVA el registro tras un envío real exitoso (`registrarCuotaVista`, actor `automatico:cuota-en-envio`; **aún sin demostrar en Producción**: requiere un correo real) y el formulario manual del Super Admin, que sigue siendo **necesario** cuando no hay envíos (la lectura vence a los 8 días y sin ella la compuerta SQL cierra el correo).
**Alternativa oficial investigada (5-nov-2026).** Resend ofrece solo dos permisos de llave: `full_access` (crear, borrar, leer y actualizar cualquier recurso) y `sending_access` (solo enviar, opcionalmente limitado a un dominio). No existe un permiso de solo lectura ni de solo uso. Leer el consumo por API exige `full_access`; esa llave podría crear, modificar y borrar dominios, llaves, webhooks, contactos y plantillas. NO se creó ni se guardó. Eliminar por completo la lectura manual exige una decisión del dueño: (a) aceptar guardar una llave de acceso completo en Vercel solo para esto, con ese riesgo; (b) aceptar la renovación manual semanal; o (c) pasar a un plan o a un modelo donde el consumo se calcule solo con el libro propio (`correo_envios`) y no dependa de Resend. Fuentes: documentación de Resend «Create API Key» y changelog «New API Key Permissions».

## D-83 · Lectura diaria del consumo con `GET /usage` y una llave aparte (5-nov-2026)
**Causa.** D-82 demostró que las cabeceras de cuota no llegan a una petición vacía; la lectura manual cada 8 días seguía siendo un riesgo de olvido. El dueño pidió automatizarla.
**Decisión (autorizada por el dueño, aceptando el riesgo por escrito).** `GET https://api.resend.com/usage` (esquema en el OpenAPI público de Resend: `emails.daily.used`, `emails.monthly.used`) con una llave de ACCESO COMPLETO, porque Resend solo ofrece `full_access` y `sending_access` y no hay permiso de solo lectura. Esa llave podría crear, modificar y borrar recursos de Resend (dominios, llaves, webhooks, contactos, plantillas).
**Aislamiento (con barrera en pruebas, `tests/correo-uso-resend.test.ts`).** (1) Variable propia `RESEND_USAGE_KEY`, distinta de `RESEND_API_KEY`; solo se nombra en `correo/config.ts` y no forma parte de `EntornoCorreo` (lo que ven los emisores). (2) Solo la pide `correo/cuota-resend.ts` y solo la usa `leerUsoDeResend` (en `resend.ts`, el único módulo que habla con Resend). (3) Solo servidor: nunca `NEXT_PUBLIC`, nunca en el emisor, el libro ni el navegador. (4) El resultado, los logs y los avisos no llevan la llave ni el cuerpo de la respuesta; sin redirecciones; 8 s de tope. (5) Ruta `/api/alertas/uso-resend` protegida con `CRON_SECRET`, cron diario 06:00 UTC; actor `automatico:uso-resend`; misma función SQL que el panel; suma los envíos de los últimos 10 min en cualquier estado (revisión de Codex: uno terminado entre la foto de Resend y el guardado no quedaba contado; sobra, nunca falta). (6) Sin la variable no hace nada (200, sin aviso); fuera de producción no toca la red. Se conservan el registro tras un envío exitoso y el formulario manual como respaldo.
**Estado.** Código y pruebas listos; la llave NO existe todavía. Crearla y guardarla en Vercel (Production) la hace el dueño, porque un asistente no debe manejar credenciales en claro.
**Reversa.** Borrar la variable `RESEND_USAGE_KEY` (y revocar la llave en Resend) deja la lectura desactivada sin romper nada.
