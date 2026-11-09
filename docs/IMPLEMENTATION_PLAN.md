# VIVE BIEN — Plan de implementación (Master PRD v2.0)

> Fase 0 (auditoría) terminada el 18-sep-2026: ver [`AUDIT_CURRENT_SYSTEM.md`](AUDIT_CURRENT_SYSTEM.md), [`DECISIONS.md`](DECISIONS.md) y [`adr/`](adr/).
> **Gate de salida de la fase 0: «Diagnóstico aprobado» por el usuario** (PRD §29). Nada de lo que sigue se implementa antes.
>
> Orden del prompt maestro (§72) y prioridades (§92): **P0** seguridad · datos · auth · permisos · integridad · no regresión → **P1** propiedades, publicador, admin, leads, operaciones, comisiones → **P2** SEO, analytics, Marketing Hub → **P3** IA, automatizaciones, experimentos.
>
> Cada tarea se entrega en commits conceptuales (`feat(x)`, `fix(security)`, `test(e2e)`…) y cada deploy sube la versión V-1.1.x y se anota en Obsidian (bóveda GRUPO PONCE).
> **Done** (prompt §73) = UI + backend + permisos + validación + base + seguridad + errores + carga + vacío + pruebas + auditoría + documentación (+ SEO/analítica/notificaciones/migración cuando aplique).
>
> Estado: `TODO` · `IN_PROGRESS` · `DONE` · `BLOCKED (motivo)` · `PARTIAL (qué existe)`

---

## Mapa de fases

| Fase | Contenido | Prioridad | Épicas PRD | Bloqueos |
|---|---|---|---|---|
| 0 | Auditoría, baseline, ADR, riesgos | — | — | ✅ DONE |
| 1 | Arreglos P0 de seguridad y datos, `configuracion`, servicio de propiedades, CI | P0 | E01, E20 | D-02 (número), GitHub (usuario) |
| 2 | Roles + permisos + SUPER_ADMIN + pruebas de seguridad | P0 | E01 | D-13 |
| 3 | Portal del cliente (retoma el trabajo pausado) | P1 | — | 3a ✅ · 3b ✅ · **3c-1 (03.07) validada, sin desplegar** |
| 4 | Publicador: solicitud, revisión, activación | P1 | E02 | D-09, D-19 |
| 5 | Motor de propiedades: revisiones, ciclo de vida, medios, documentos | P1 | E03, E17 | D-10 |
| 6 | Centro de revisión | P1 | E02, E03 | Fases 4–5 |
| 7 | Leads unificados + atribución | P1 | E04 | D-03 |
| 8 | Visitas (citas existentes, ajustadas) | P1 | E05 | D-08 |
| 9 | Ofertas | P1 | E05 | Fase 7 |
| 10 | Operaciones + colaboración | P1 | E05, E06 | Fase 9 |
| 11 | Motor de comisiones | P1 | E06 | D-18 |
| 12 | Jurídico: versiones y aceptaciones | P1 | E07 | D-19 |
| 13 | Super Admin: configuración, flags, integridad, retención | P1 | E01 | Fase 2 |
| 14 | SEO | P2 | E08 | D-23 |
| 15 | Analytics y atribución | P2 | E16 | Fase 7 |
| 16 | Marketing Hub (base → contenido → plantillas → calendario → biblioteca → aprobaciones) | P2 | E09–E12, E14 | Fases 5, 13 |
| 17 | Meta | P2 | E15 | D-25 |
| 18 | IA | P3 | E13 | D-21 |
| 19 | Endurecimiento de seguridad | P0 continuo | E01, E20 | — |
| 20 | Performance | P2 | E19 | — |
| 21 | Testing (E2E de seguridad, visual, SEO) | continuo | E18 | — |
| 22 | Migración final (retirar legado) | — | — | Fases 3–8 |
| 23 | Producción (flags, rollout, smoke) | — | — | todas |

---

## FASE 1 · Base segura (P0)

### TASK 01.01 — Cerrar columnas internas de propiedades al público (SEC-02)
- **Dependencias:** ninguna.
- **Archivos:** `supabase/17-columnas-publicas.sql`, `src/lib/propiedad-publica.ts` (constante `COLUMNAS_PUBLICAS`), `src/app/api/catalogo/route.ts`, `src/app/api/admin/propiedades/route.ts` (modo anónimo), `src/app/sitemap.ts`, `src/lib/ficha-servidor.ts`, `src/app/propiedades/[id]/page-client.tsx`, `src/app/valuador/page-client.tsx`.
- **Base:** `revoke select on propiedades from anon, authenticated; grant select (<columnas públicas>) on propiedades to anon, authenticated;` La política de filas (`estado_pub = 'publicada'`) se queda. Fuera del público: `owner_id`, `revisado_por`, `revisado_en`, `nota_moderacion`, `enviada_en`, `completitud`, `whatsapp`, `telefono`, `calle`, `cp` (y `lat/lng` exactos según D-10/ubicación).
- **Backend:** todos los lectores anónimos piden columnas explícitas (`COLUMNAS_PUBLICAS`); se quita `select('*')`.
- **Frontend:** sin cambios visibles (verificar mapa y ficha).
- **Seguridad:** prueba con la clave anónima: `select=owner_id` → 401/permiso denegado.
- **Pruebas:** unitaria de `COLUMNAS_PUBLICAS` (no contiene columnas internas); punta a punta: catálogo, ficha, sitemap, mapa responden igual; capturas visuales del sitio público sin cambios.
- **Aceptación:** `/api/catalogo` y REST anónimo no devuelven ninguna columna interna; el sitio público se ve idéntico.
- **Estado:** ✅ HECHO en V-1.1.77. Migración 18 aplicada el 19-sep tras desplegar: ensayo en PGlite y en producción dentro de una transacción revertida; REST anónimo con `owner_id`/`whatsapp`/`*` → 401, columnas públicas → 200; ficha, listado, valuador y portada sin errores en navegador. Reversión: `supabase/18-columnas-publicas.REVERTIR.sql`.

### TASK 01.02 — Quitar INSERT público en `leads` y `contactos` (SEC-03) y privilegios sobrantes (SEC-09)
- **Dependencias:** ninguna (verificado: ningún código escribe directo).
- **Base:** `drop policy leads_insertar_publico`, `drop policy contactos_insertar_publico`; `revoke all on <tablas sólo-servidor> from anon, authenticated`.
- **Pruebas:** PGlite (anon no inserta ni lee); formularios públicos siguen funcionando por `/api/registro-lead`.
- **Aceptación:** asesor de Supabase sin tablas legibles/escribibles por anon salvo lo público.
- **Estado:** ✅ HECHO (migración 17, 19-sep).

### TASK 01.03 — Migración 13: avisos del asesor de Supabase (SEC-04)
- **Base:** `revoke execute on function rls_auto_enable() from public, anon, authenticated`; `alter function tocar_actualizado_en() set search_path = ''` (propuesta ya redactada; pendiente 23 en Obsidian).
- **Aceptación:** `get_advisors(security)` sin esos dos avisos.
- **Estado:** ✅ HECHO (migración 17, 19-sep). El asesor de Supabase sólo muestra el INFO de RLS sin políticas (intencional, ADR-0002).

### TASK 01.04 — `noindex` en páginas privadas (SEO-01)
- **Archivos:** layouts nuevos `src/app/dashboard/layout.tsx`, `src/app/mi-cuenta/layout.tsx`, `src/app/publicador/layout.tsx` con `robots: { index: false, follow: false }`.
- **Pruebas:** `seo:audit` + curl de las tres rutas con `<meta name="robots" content="noindex…">`.
- **Estado:** ✅ HECHO en V-1.1.77 (`<meta name="robots" content="noindex, nofollow">` verificado en las tres rutas).

### TASK 01.05 — El contacto público es de VIVE BIEN (SEC-01, ADR-0006)
- **Archivos:** `propiedades/[id]/page-client.tsx`, `PropertyCard.tsx`, `WAFloat.tsx`, asistente (`publicador/propiedades/[id]/editar/page.tsx`: quitar campo WhatsApp del anuncio para publicadores), `lib/whatsapp.ts` + `/api/contacto` (avisar a atención de VIVE BIEN, no al dueño).
- **Base:** ninguna columna se borra.
- **Seguridad:** un publicador no puede escribir `whatsapp`/`telefono` del anuncio (a `CAMPOS_RESERVADOS` para publicador).
- **Pruebas:** la ficha nunca muestra un número distinto al de `configuracion`; `/api/contacto` no llama a `notificarPublicador`.
- **Aceptación:** con un publicador de prueba, ningún dato de interesado llega a su cuenta ni a su WhatsApp.
- **Estado:** ✅ HECHO en V-1.1.77. Además: candado D-08 en citas (sólo personal de VIVE BIEN como asesor hasta 08.01; **ampliado el 2-oct-2026 por ADR-0013: también un publicador con `recibir_citas`, sin ver datos del interesado**). Pendiente del abogado: el texto del consentimiento (D-03).

### TASK 01.06 — `configuracion` y datos del negocio en un solo lugar (DAT-03, ADR-0012)
- **Archivos:** `supabase/18-configuracion.sql`, `src/lib/config/negocio.ts` (valores por defecto + lectura con caché), sustituir las 32 apariciones en 19 archivos (Footer, contacto, JSON-LD de `seo.ts`, WAFloat, PropertyCard, ficha, términos, privacidad, not-found, valuador…), GA4 desde configuración.
- **Pruebas:** unitaria (esquema Zod de `negocio`); búsqueda en CI que falle si reaparece el teléfono literal fuera de `config/`; JSON-LD igual antes/después.
- **Aceptación:** cambiar el teléfono en `configuracion` cambia footer, ficha, JSON-LD y WhatsApp.
- **Estado:** ✅ HECHO en V-1.1.77 (parcial a propósito): datos del negocio y GA4 en `src/lib/config/negocio.ts` con prueba anti-literales; tabla `configuracion` (migración 19) con los `flags`, todos apagados; `/portal` cerrado hasta encender `portalCliente`. Que el Super Admin edite el NAP desde el panel pasa a la fase 13.

### TASK 01.07 — Subida de fotos firmada (SEC-05, ADR-0008) — arregla también las subidas rotas
- **Archivos:** `/api/medios/firma` (Route Handler), `src/lib/medios/cloudinary.ts` (firma en servidor), asistente y bot de Telegram usan la firma; se quita `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`.
- **Seguridad:** firma sólo para quien puede editar esa propiedad; carpeta, formatos y tamaño fijos en la firma; verificación posterior con la API de Cloudinary.
- **Pruebas:** firma denegada a otro usuario; archivo `.exe` renombrado a `.jpg` rechazado.
- **Estado:** ✅ HECHO en V-1.1.78 — verificado el 19-sep: foto real subida por el usuario con firma (07:47 UTC, nube `zwsi9aar`, carpeta `vivebien/sin-tipo/borrador-…` decidida por el servidor); con una subida inválida Cloudinary responde «Upload preset not found» para `vivebien-upload` (y otros nombres probables), «must be whitelisted for unsigned uploads» para `ml_default` (existe pero exige firma), «Upload preset must be specified» sin preset ni firma e «Invalid api_key» con firma inventada. Queda para después: verificación posterior del archivo (tamaño real) con la API de Cloudinary. `scripts/migrar-fotos-cloudinary.mjs` (migración única del 13-sep) usaba el preset y ya no funciona.

### TASK 01.08 — Servicio de propiedades (capa única de lectura/escritura)
- **Archivos:** `src/lib/propiedades/servicio.ts` (leer pública, leer para admin, leer para dueño, guardar borrador, transicionar), rutas que hoy consultan directo pasan a usarlo.
- **Por qué ahora:** prerrequisito de las revisiones (fase 5) sin tener que tocar dos veces cada ruta.
- **Pruebas:** las 443 actuales + unitarias del servicio.
- **Estado:** MOVIDA al inicio de la fase 5 (revisiones), que es quien la necesita: hacerla ahora tocaría dos veces cada ruta.

### TASK 01.09 — Código respaldado y CI
- **Pasos:** el usuario ejecuta `gh auth login` (pendiente C); se sube `nextjs-migration`; workflow de GitHub Actions: `npm ci`, `npx tsc --noEmit`, `npx eslint <archivos nuevos>`, `npx vitest run`, `npx next build`.
- **Estado:** ✅ HECHO (19-sep). El repo público `Grupo-P-once/ViveBien` sirve el sitio viejo por GitHub Pages; por decisión del usuario el código va a un repo **privado** nuevo, `Grupo-P-once/vivebien-next` (remoto `privado`, rama por defecto `nextjs-migration`, etiquetas `baseline-*`). Historial revisado antes de subir: sin secretos. CI (`.github/workflows/ci.yml`): `npm ci`, `tsc --noEmit`, `vitest run` en cada push; primera corrida verde (57 s). El build real sigue antes de cada despliegue (necesita las variables de Vercel).

### TASK 01.10 — Entorno de staging (OPS-02)
- **Estado:** BLOCKED (D-20: costo). Mientras tanto: PGlite + punta a punta con limpieza; nada destructivo contra producción.

### TASK 01.11 — Rotar claves expuestas (SEC-06)
- Resend, Telegram, Cloudinary: las rota el usuario en cada panel; yo actualizo Vercel sin ver los valores (`scripts/set-vercel-env.mjs`). **Estado:** BLOCKED (usuario).

---

## FASE 2 · Roles, permisos y SUPER_ADMIN (P0)

### TASK 02.01 — Catálogo de permisos y `exigir()` (ADR-0004)
- **Archivos:** `src/lib/acceso/permisos.ts`, `src/lib/acceso/exigir.ts`; migración de todas las rutas (`requireRole`/`isAdminEmail`) a `exigir`.
- **Base:** `usuarios.rol` admite `super_admin` (check), sin quitar nada.
- **Pruebas (prompt §60, 1–12 y 20):** cliente → admin (403), cliente cambia rol (denegado), cliente publica (denegado), publicador cambia `owner_id`/`publisher_id` (denegado + auditoría), publicador lee leads/contactos/documentos ajenos (denegado), publicador modifica comisión (denegado), cliente lee datos privados, `estado=publicada` desde cliente (denegado), manipulación de métricas (denegado), acceso a auditoría (denegado).
- **Aceptación:** una sola función autoriza; suite de seguridad verde.
- **Estado:** ✅ HECHO (2a en V-1.1.79, 2b en V-1.1.80, 19-sep). Catálogo con 10 permisos usados de verdad; ninguna ruta usa ya `requireRole` (queda `@deprecated`) ni compara `perfil.rol === 'admin'` (única excepción documentada: `usuarios/me`, que protege al propio rol); prueba de equivalencia: cada papel conserva exactamente el mismo acceso. Frontend: entrada al panel, publicar directo y enlaces del portal usan el catálogo; lo demás del frontend decide *qué experiencia* ver, no permisos, y el servidor vuelve a comprobar todo. Quedan fuera a propósito las máquinas de estado (transiciones de publicación → fase 5; papel en una cita → fase 8). §60: 1–5 y 20 probados; comisión, documentos, métricas y auditoría esperan a sus módulos.
### TASK 02.02 — SUPER_ADMIN (D-13)
- `ADMIN_EMAILS` sólo arranque; Super Admin cambia roles (auditado, con motivo); los admins ya no cambian roles de admin/super admin.
- **Estado:** ✅ HECHO (V-1.1.79 → cerrado en V-1.1.81, 19-sep). Enmienda del ADR-0004: el rol vive SÓLO en `usuarios.rol`; ninguna lista del entorno decide nada. Migración 21 (ensayo PGlite + producción con transacción revertida; respaldo y reversión en `21-roles-solo-en-la-base.REVERTIR.sql`): `jemilianoponceperez@gmail.com` → `super_admin` en la tabla; `joseponcep@gp-once.com` y `joseponcer@vivebienn.com` con invitación de Super Admin (se aplica al entrar con el correo verificado); trigger que impide quedarse sin Super Admin activo. Reglas: nadie se cambia a sí mismo; el último Super Admin no se degrada ni se suspende; dar o quitar admin/super admin sólo Super Admin con motivo. Arreglos: el contador «Administradores» contaba sólo `admin` (decía 0); las invitaciones se perdían si el correo se verificaba después del primer acceso.

### TASK 02.03 — Auditoría de intentos denegados
- `audit_logs` registra intentos sobre campos protegidos (`owner_id`, `publisher_id`, rol, comisión aceptada, estado publicado) — separado en `security` (tipo de log).
- **Estado:** ✅ HECHO en V-1.1.79 + V-1.1.80: cada 403 con sesión → `seguridad.denegado` (permiso, ruta, método; tope 20 por cuenta cada 10 min); además, tocar una propiedad ajena (`propiedad.ajena:<id>`) o mandar campos protegidos sin poder moderar (`propiedad.campos:owner_id,…`) y los rechazos de las reglas de roles. Revisado en producción tras desplegar: sin falsas alarmas.
---

## FASE 3 · Cliente (P1)

Retoma lo pausado (commit `d95799e`, sin desplegar): carcasa `/portal`, Inicio, resumen.

> **Estado reconciliado el 29-sep-2026** contra el código, las rutas, las APIs y
> las pruebas. Cada `DONE` cita la evidencia que lo sostiene, porque una ruta
> existente no cuenta como tarea terminada — y, al revés, **que un artefacto no
> esté en el árbol de trabajo no significa que la tarea no se hiciera**: las
> capturas de 03.06 llevaban hechas desde 3b-1 y sólo los PNG estaban fuera del
> historial, por peso.
>
> **La fase 3 queda cerrada salvo 03.01** (depende de la fase 4) y **3c-3**
> (Centro de Ayuda, sin empezar).
>
> **Decisiones D-27 (19-sep).** **3a ✅ V-1.1.82** (cimientos y bloqueantes P3-01…03, 05…07, apertura escalonada, vista previa; migración 22) — `docs/fase-3/PLAN_3A.md`. **3b** (9 rutas, eliminación como solicitud) y **3c** (redirecciones, apertura interna, luego clientes): pendientes de aprobación.

| Task | Contenido | Estado |
|---|---|---|
| 03.01 | Menú del portal según D-06 (+ Valuador); «Mi propiedad» lleva a la solicitud de publicador (fase 4) | **PARTIAL** · carcasa y menú en `PortalShell`; «Mi propiedad» depende de la fase 4 |
| 03.02 | Inicio (mockup 05) con datos reales | **DONE** · `InicioPortal` + `portal-resumen.test.ts`; desplegado el 29-sep |
| 03.03 | Guardadas / Me interesan / Por revisar, Búsquedas, Alertas (en el portal; correo después), Consultas, Mi búsqueda, Perfil | **DONE** · las 8 pantallas existen y responden; 97 pruebas en 6 archivos (`portal-3b1/3b2`, `aislamiento`, `apertura`, `resumen`, `perfil-3b2`). **Falta**: `mi-busqueda` no tiene prueba que la nombre |
| 03.04 | Redirecciones `/dashboard` (cliente) → `/portal`, `/mi-cuenta` → `/portal/perfil` (privadas: sin impacto SEO) | **DONE** · salió con 03.07 (`rutaDeEntrada`) y 03.08 (`repartoDeMiCuenta`); `entradas-acceso.test.ts` + `cuenta-por-rol.test.ts` |
| 03.05 | Solicitud de eliminación de cuenta (prompt §19, PRD §9): marca `pending_deletion`, retira publicaciones, no borra lo que debe conservarse | **DONE** · `EliminarCuenta` + `lib/cuentas/baja.ts` (baja con lápida, D-35) + reintento administrativo; `cuenta-eliminar.test.ts`, `eliminar-cuenta-ux.test.ts`, `estado-de-cuenta.test.ts`. QA real en producción |
| 03.06 | Capturas Playwright del portal (escritorio, tableta, móvil) | **DONE** · ya estaba hecha desde 3a.8/3b-1/3b-2 (`c65d8ab`, `6214f5a`, `8294afc`): la evidencia vive en `docs/fase-3/capturas/informe.json`; los PNG se excluyen del historial por peso (~7 MB). **Re-verificada el 29-sep** tras 03.07, 03.08 y el rojo de marca: 63 capturas —10 pantallas × 2 estados × 3 tamaños, más 3 de `suspendido`—, todas 200, **0 desborde, 0 axe graves, 0 errores JS, 0 intentos de datos reales**, e informe **byte a byte idéntico** al comprometido. Sin regresión |
| 03.08 | **«Mi perfil» por rol: auditoría y rediseño.** Hoy `/mi-cuenta` (466 líneas) es un asistente por pasos con una sola distinción, `rol === 'publicador'`: **admin y super admin ven el asistente del cliente** («qué estoy buscando») y al terminar salen a `/dashboard`; el formato de alta no sirve para «revisar mis datos»; el diseño es de estilos sueltos, no el del panel/portal; y la pantalla vive fuera del portal, del área de publicador y del panel. Alcance: qué necesita **cada** rol (cliente: contacto, foto, búsqueda; publicador: lo que exige publicar —teléfono, inmobiliaria, zonas—; admin/super admin: cuenta y seguridad, sin campos de cliente), **una** pantalla por rol en su sitio, `/mi-cuenta` redirigido (03.04) y diseño alineado. Sin CRM, sin campos inventados. **Cuándo: 3c-2**, después de que 3b-2 haga el perfil del cliente en el portal | **DONE** · `camposEditablesPara(rol)` en el servidor, `/admin/cuenta`, reparto por rol y estado de rol no reconocido. 37 pruebas en `cuenta-por-rol.test.ts` + 12 regresiones adversariales. Commit `e85e101` |
| 03.07 | **Pantalla de acceso nueva** (mockups del 22-sep: `design/references/08-acceso-escritorio` y `08-acceso-movil`). **Escritorio:** foto a la izquierda con «Más que propiedades, *mejores historias.*»; a la derecha la tarjeta (logo, Bienvenido, Ingresar / Crear cuenta, correo y contraseña con iconos y «ver contraseña», ¿Olvidaste tu contraseña?, Iniciar sesión, Continuar con Google, «Acceso seguro a tu cuenta»). **Móvil:** la foto arriba con el logo y el titular encima; la tarjeta se monta sobre la parte baja de la foto (esquinas superiores redondeadas); «VIVEBIENN.COM» al pie. **Cuándo: 3c-1 (V-1.1.93)**, después de 3b y **antes de abrir el portal a clientes** | **DONE** · commit `164aedf`, desplegado y verificado en producción el 29-sep. 32 pruebas + verificador de navegador (`scripts/verificar-entrar.mjs`). Deuda registrada: no reutiliza `ui/button` ni `ui/input` |

- **Seguridad:** todo `/api/portal/*` con `exigir`; el cliente sólo ve lo suyo.
- **03.08 · DECISIÓN DE PRODUCTO CERRADA (28-sep-2026).** El alcance por rol ya
  está fijado; **no hay que volver a preguntarlo**:
  - **ADMIN** — cuenta · seguridad · contraseña y recuperación · sesiones si
    aplica · cierre de cuenta.
  - **SUPER_ADMIN** — el mismo alcance de cuenta y seguridad. **No se convierte
    en un perfil de cliente**: nada de «qué estoy buscando» ni campos de
    búsqueda.
  - **CLIENTE** — contacto, foto, búsqueda (3b-2).
  - **PUBLICADOR** — lo que exige publicar: teléfono, inmobiliaria, zonas; se
    afina en la fase 4.
- **03.08 · por qué en 3c-2:** 3b-2 construye el perfil del **cliente** dentro del portal; hacer ahí también el del publicador y el del admin mezclaría fases. En 3c ya se tocan las redirecciones (`/mi-cuenta`, 03.04), así que es cuando se retira la pantalla vieja sin rehacer el trabajo dos veces. Los campos **propios del publicador** se afinan en la fase 4; aquí se garantiza que existen, funcionan y viven en su sitio, porque de ellos depende poder publicar (`puedePublicar`).
- **03.07 · por qué en 3c-1:** 3c reordena la entrada (`/dashboard` → `/portal`, 03.04), así que la pantalla se rehace **una sola vez** y queda lista antes de que lleguen los clientes. No entra en 3b (las 9 pantallas del portal) ni cambia la lógica de acceso: reutiliza el flujo de V-1.1.83 (`useEntrarConGoogle`, `AvisoEntrada`; los 9 casos de `scripts/verificar-acceso-google.mjs` deben seguir pasando). Tipografía ya cargada (Playfair Display + Open Sans); ruta privada (`noindex`, `robots`); capturas 1440/834/390. La foto lleva dos recortes (horizontal para escritorio, vertical para móvil) servidos por `next/image` con `sizes`, y en móvil es lo primero que se ve: WebP ligero y `priority`.
- **Aceptación:** mockups 05/06 con datos reales, sin datos inventados, en los tres tamaños.

---

### 03.07 · CERRADA Y CONGELADA — 28-sep-2026

**Estado oficial: VALIDADA TÉCNICAMENTE. Sin commit. Sin deploy.**

| Comprobación | Resultado |
|---|---|
| Pruebas | 1130 verdes en 68 archivos (32 nuevas, A–O) |
| Typecheck | limpio |
| Build | `Compiled successfully`; `/entrar` dinámica |
| Lint | 63 errores / 39 avisos = baseline. **0 hallazgos introducidos por 03.07** |
| Adversarial | las 5 regresiones ponen en rojo su prueba; base 0 antes y después |
| Navegador | 10 viewports, `TODO CORRECTO` |
| Plegables | carriles `430│24│430`, `300│20│300`, `540│20│540`; **0 elementos sobre la bisagra** |
| Hidratación | SSR `amplia` → cliente real, verificado en el DOM |
| Resize / orientationchange | los tres saltos y el giro, verificados en el DOM |
| axe | **0 críticas, 0 serias** (antes: 1 seria de contraste en los 10), 1 menor |
| Logotipo | PNG oficial **completo**, sin recortar |
| Fotografía | la del dueño, reconstruida y aprobada |

Informe: [`fase-3/REVISION-VISUAL-ENTRAR.md`](fase-3/REVISION-VISUAL-ENTRAR.md) ·
capturas en `fase-3/capturas/entrar/`.

**Congelada:** no se toca 03.07 para arreglar nada de lo que sigue. Cada punto
abierto es tarea propia.

| Pendiente | Dónde vive |
|---|---|
| Commit y deploy | autorización posterior del dueño |
| Cascade global de CSS | **E-20**, tarea independiente (abajo) |
| Rojo, gris, arena y tipografía | auditoría del Design System |
| SVG maestro del logotipo | tarea separada |
| Prueba en plegable físico | QA adicional |
| Retirar la tarjeta antigua del dashboard | fase 22 |

---

## FASE 4 · Publicador (P1) — no es CRM

| Task | Contenido |
|---|---|
| 04.01 | `solicitudes_publicador` (datos, requisitos, estado `SUBMITTED → IN_REVIEW → APPROVED/REJECTED`, `creationSource`, auditoría); `submitPublisherApplication()` idempotente |
| 04.02 | Revisión admin de solicitudes (en el Centro de revisión, fase 6) con motivo |
| 04.03 | Activación sólo por operación de servidor tras aprobación + acuerdo aceptado (fase 12); alta manual `MANUAL_ADMIN` con motivo y evidencia |
| 04.04 | Invitaciones dejan de ofrecer el rol `publicador` |
| 04.05 | Panel del publicador (PRD §13): Inicio · Mis propiedades · Nueva · Visitas (sin PII) · Rendimiento (agregado) · Mis acuerdos · Perfil |

- **Seguridad:** cliente crea su propia solicitud; no la aprueba; no cambia su rol (pruebas).
- **Bloqueos:** D-09 (publicador existente), D-19 (textos).

---

## FASE 5 · Motor de propiedades (P1)

| Task | Contenido |
|---|---|
| 05.01 | Migración `propiedad_revisiones` + `publisher_id` + `lifecycle` (ADR-0005), revisión 1 por cada propiedad existente, **dry run en PGlite** con el esquema real |
| 05.02 | `propiedad_publicar_revision()` (una sola publicada; la anterior `SUPERSEDED`) y `huella` de campos críticos |
| 05.03 | Lectura pública desde la revisión publicada (catálogo, ficha, sitemap, JSON-LD, mapa) — sin cambiar URLs |
| 05.04 | Asistente edita revisiones (la publicada sigue visible); para propiedades propias el admin aprueba en un paso (D-11/D-12) |
| 05.05 | Estados del PRD (D-10) con transiciones en servidor y auditoría |
| 05.06 | Documentos privados (Supabase Storage privado, URLs firmadas) y verificación de titularidad (admin) |
| 05.07 | Retiro de propiedad (`WITHDRAWN`): sale del sitio, se conserva el historial |
| 05.08 | Bot de Telegram y alta admin pasan por el mismo servicio |

- **Pruebas:** paridad TS/SQL de transiciones (patrón de citas), «publicada sigue visible mientras la nueva se revisa», huella cambia con precio/superficie/ubicación/fotos principales.
- **Aceptación:** ninguna ruta pública lee la fila viva; URLs indexadas intactas; SEO audit limpio.

---

## FASE 6 · Centro de revisión (P1)

Bandeja única (prompt §50): solicitudes de publicador, revisiones de propiedad, documentos, propuestas de comisión, verificación de acuerdos, operaciones, casos. Prioridad, fecha, responsable, estado, entidad, acción. Reemplaza «Por revisar». Tabla con TanStack Table (ya en el admin).

---

## FASE 7 · Leads (P1)

| Task | Contenido |
|---|---|
| 07.01 | Modelo único de lead (ADR-0001) con consentimiento versionado, snapshot, `propiedad_id`, dedupe por contacto/ventana, `request_id` |
| 07.02 | Migración de `leads` (1), `contactos` (0) y `solicitudes_contacto` (0) al modelo nuevo sin borrar las tablas viejas |
| 07.03 | Atribución `firstTouch`/`lastTouch` + UTM (captura en el primer toque, cookie propia de primera parte, sin PII en URL) |
| 07.04 | Asignación y seguimiento (eventos del lead) en **Atención** del admin |
| 07.05 | Aviso inmediato a atención de VIVE BIEN (correo/Telegram); al publicador, a lo sumo un aviso sin PII |
| 07.06 | Nuevo consentimiento (D-03) cuando el abogado lo apruebe |

- **Seguridad:** publicador nunca lee leads (prueba); límite persistente por IP y contacto.

---

## FASE 8 · Visitas (P1) — reutiliza lo construido

Ya existe (V-1.1.75 y commits sin desplegar): tablas, restricción sin empalmes, máquina de estados con paridad SQL/TS, API, correos con enlaces seguros e `.ics`, carcasa del portal. Documentación en `docs/appointments-architecture.md` y hermanos.

| Task | Contenido | Estado |
|---|---|---|
| 08.01 | **Asignación de asesor distinta del dueño** (ADR-0006, D-08): que `citas.asesor_uid` lo asigne VIVE BIEN en vez de copiarse de `propiedades.owner_id`. **Pendiente.** Lo que ya está hecho (2-oct-2026, ADR-0013): un publicador con `recibir_citas` puede ser asesor de sus propias propiedades; `papelEn`/`recortar`/correos/enlaces le dan fecha, hora, estado y propiedad **sin PII** salvo `ver_datos_interesado`; pantalla `/publicador/citas` | PARCIAL (asignación: TODO) |
| 08.02 | Cita ligada a un lead (fase 7) | TODO |
| 08.05 | Administración de modalidad y permisos del publicador (D-48, `/admin/usuarios/[uid]`, función SQL `usuario_cambiar_permisos`) | HECHO en código (sin desplegar; migraciones 28–30 sin aplicar) |
| 08.03 | «Mis visitas» del cliente (mockup 06) con FullCalendar | PARTIAL |
| 08.04 | Calendario en **Atención → Visitas** del admin (mockup 07) | TODO |
| 08.05 | Visitas del publicador (sin PII) | TODO |
| 08.06 | Recordatorios 24 h / 2 h y vencidas por trabajos (ADR-0003) | TODO |
| 08.07 | Google Calendar (cliente OAuth del usuario) | BLOCKED (usuario) |

---

## FASES 9–13 (P1)

### 09 · Ofertas
Entidad propia ligada a lead y propiedad; estados; sólo admin (PRD §7). Montos en centavos (ADR-0007).

### 10 · Operaciones y colaboración
`operaciones` (SALE/RENT; NEGOTIATION, OFFER_RECEIVED, CONTRACT_IN_PROCESS, CLOSED, CANCELLED, LOST), participantes, colaboración con split que **debe sumar 100 %** (restricción en base), precio final, documentos, auditoría. El publicador sólo reporta; el admin confirma (PRD §7). Casos de posible elusión (prompt §20) como `casos` revisados por admin.

### 11 · Comisiones
`comision_reglas` (porcentaje, fijo, meses de renta, escalonado, personalizado; versionadas), `comision_propuestas` (versionadas; **aceptada = congelada**, trigger), `comision_movimientos` (acordada, calculada, facturada, cobrada, distribuida, cancelada, en disputa), `comision_pagos` (parciales, reversos, conciliación). Pruebas: doble aceptación, doble pago, edición de aceptada desde cliente (denegado). Bloqueo: D-18.

### 12 · Jurídico
ADR-0009: versiones inmutables, aceptaciones con evidencia, casos. Ninguna versión `ACTIVE` sin revisión jurídica (D-19).

### 13 · Super Admin
Configuración (`negocio`, `analitica`, `flags`), roles, reglas de comisión, tipos de propiedad, campos dinámicos, notificaciones, retención, integraciones, auditoría, **checks de integridad** (prompt §52) como trabajo diario con reporte: propiedad sin owner/publisher válido, acuerdo sin aceptación, comisión sin propuesta, operación sin propiedad, split ≠ 100 %, revisión inconsistente, contenido sin fuente o con huella vieja publicado, documentos huérfanos.

---

## FASES 14–18 (P2/P3)

| Fase | Tareas principales |
|---|---|
| 14 · SEO | Slugs de relleno con 301 (D-23), `RealEstateListing`/`Offer`/`BreadcrumbList` desde la revisión publicada, enlazado interno propiedad → zona/categoría/similares, auditoría SEO en CI, comprobar canonical en HTML servido |
| 15 · Analytics | Eventos del PRD (§21) con nombres fijos, snapshots diarios (`analitica_diaria`, por propiedad y por publicador), fuentes separadas (interna/GA4/Meta), «Sin datos suficientes» cuando no haya |
| 16 · Marketing Hub | 16.01 modelo de contenido y estados (ADR-0010) · 16.02 plantillas versionadas (20 del manual) · 16.03 carrusel de propiedad con fotos reales · 16.04 calendario editorial (FullCalendar, arrastrar) · 16.05 biblioteca de assets · 16.06 aprobaciones · 16.07 campañas y cadencias (Día 0–14) · 16.08 UTM · 16.09 `STALE_REVIEW_REQUIRED` por huella · 16.10 bloqueo al vender/rentar/retirar |
| 17 · Meta | ADR-0011; feature flag apagado hasta D-25; staging primero |
| 18 · IA | D-21; esquema JSON + Zod + validadores de datos contra la revisión; nunca inventa precio, superficie, ubicación, disponibilidad, amenidades, ROI, plusvalía ni testimonios |

---

## FASES 19–23

| Fase | Contenido |
|---|---|
| 19 · Seguridad | Límite de peticiones persistente, CSP en modo bloqueo, App Check/Turnstile (D-22), revisión de dependencias, logs separados (aplicación, auditoría, seguridad, marketing, integraciones) |
| 20 · Performance | Miniaturas en listado y paginación por cursor (PERF-01), imagen LCP con prioridad, Font Awesome → iconos Lucide o subset, fuentes con `next/font`, `next/dynamic` para mapas/gráficas/editores, medir con Lighthouse cuando haya cuota/CI (pendiente de esta auditoría) |
| 21 · Testing | Suite E2E de seguridad (prompt §60, los 20 casos), marketing (§61), visual (portal, admin, plantillas), SEO en CI |
| 22 · Migración final | Retirar `/dashboard` viejo, `lib/firestore.ts`, componentes legados, columnas viejas de `propiedades` cuando nada las lea; siempre con respaldo, dry run y reversibilidad |
| 23 · Producción | Rollout por feature flags, smoke tests, comparación con el baseline (`baseline-v1.1.75`): URLs, SEO, analítica, performance |

---

## Primera fase propuesta al aprobar el diagnóstico

**Fase 1, en este orden:** 01.02 → 01.03 → 01.01 → 01.04 → 01.08 → 01.06 → 01.07 → 01.05 (cuando D-02 esté decidida).
Todo es reversible, no cambia URLs ni lo que ve el público, y cierra los dos hallazgos CRITICAL en cuanto se decida el número público (D-02).

## Reportado por el dueño el 22-sep — CORREGIDO el 30-sep (V-1.1.95, sin desplegar)

Las dos cosas, más la oclusión del flotante, en una versión de mantenimiento
adelantada por decisión del dueño. **Commit pendiente de autorización.**

### FASE 20 · Performance — TASK 20.01: el sitio carga lento, y el listado peor — ✅ HECHO
- **Síntoma (dueño):** «la carga de página va lenta, las propiedades se cargan demasiado lentas».

**La sospecha del plan era falsa.** No eran las filas: `/api/catalogo` ya topa
en 500, la base tiene **8 propiedades** y el **TTFB medido es de 65-70 ms**. El
servidor y la consulta van bien. Eran los **bytes de las imágenes**.

**Medición del 30-sep-2026 en producción (`/propiedades`, navegador real):**

| | Antes | Después (390 px, dpr 2) | |
|---|---|---|---|
| Peso de imágenes | **5 128 KB** | **545 KB** | **−89 %** |
| Peso total de página | 6 633 KB | ~1 050 KB | −84 % |
| Imágenes con `srcset` | 2 de 9 | 9 de 9 | |
| Imágenes en diferido | 0 | 6 de 7 | |
| Foto más pesada | 1 476 KB a 1966×1108 en una tarjeta de **394×230** | 57 KB | −96 % |
| Precargas sin pedirlas | 13 (~740 KB) | **0** | |

Siete de las nueve imágenes eran `<img>` crudas, sin `srcset` y sin `loading`.
**Y lo peor: sin `srcset`, el teléfono bajaba exactamente los mismos 5,1 MB
que el escritorio.** A ~1,5 Mbps reales eso son unos 35 segundos.

**Corrección:** `src/lib/medios/optimizar.ts` — una capa única que pide a
Cloudinary la foto al ancho que de verdad se pinta (`f_auto,q_auto,w_N`).
**No se usa `next/image`**: las fotos ya viven en Cloudinary, que transforma
por URL gratis en su CDN, así que no hace falta declarar `remotePatterns` ni
pagar las transformaciones de Vercel, que se facturan por imagen. Aplicado en
`PropertyCard`, el hero del catálogo (Unsplash, acotado a 1600 y `q=60` porque
va bajo un degradado al 97 %), la galería de la ficha, sus miniaturas y el
lightbox.

- **Queda fuera a propósito:** el listado sigue siendo `'use client'` y pide el
  catálogo tras hidratar (arranca a 410-1080 ms). Pasarlo a servidor es la
  siguiente mejora y es **tarea propia**, no se cuela aquí.
- **Pruebas:** 26 en `medios-optimizar.test.ts`, incluidas guardas de que las
  tres pantallas usan el helper de verdad y no vuelven a `<img src>` crudo.

### FASE 5 · Motor de propiedades (medios) — TASK 05.07: el visor de fotos se traba — ✅ HECHO
- **Síntoma (dueño):** al cambiar de imagen «desde el popup pequeño y en grande en otra página» la foto no cambia bien / se traba.

**Era literal, y había tres visores, no dos:** `PropModal` del listado (el
«popup pequeño»), la galería principal de la ficha y el lightbox (el «en
grande en otra página»). Los tres hacían `<img src={fotos[i]}>` **sin precarga
alguna**: cada flecha disparaba la descarga en frío de una foto de hasta
1,4 MB, y hasta que llegaba el `<img>` seguía enseñando la anterior. En el
modal se notaba el doble, porque el fondo desenfocado usa la misma URL y
repintaba un `blur(30px)` a pantalla completa.

**Corrección:** precarga de la foto **anterior y siguiente**, al ancho al que
se van a pintar. Medido: la foto queda lista en **150 ms** tras la flecha.
Añadido además **teclado** (`←`/`→`/`Escape`) en el modal y en el lightbox,
que tenían flechas en pantalla y no respondían al teclado.

> **La precarga está condicionada a propósito.** Al medir el «después» se vio
> que precargar desde el montaje dejaba **13 peticiones y ~740 KB** en el
> listado antes de que nadie tocara nada —seis tarjetas × dos vecinas—, lo que
> deshacía parte de 20.01 justo en datos móviles. Ahora sólo salta tras la
> primera flecha (tarjeta) o con el lightbox abierto / la galería ya movida
> (ficha): **0 bytes extra** para quien no usa el carrusel.

### El flotante de WhatsApp tapa controles a 390 px — 29-sep-2026

Encontrado en la revisión visual de 03.06. **El instrumento no lo detecta**:
mide desborde horizontal, axe y errores JS, no oclusión de un elemento fijo
sobre otro.

`src/components/WAFloat.tsx` — botón `position: fixed`, 60×60, a 28 px de la
esquina inferior derecha. **Sólo a 390 px** se monta encima de:

| Pantalla | Qué tapa |
|---|---|
| `/portal/mi-busqueda` | el botón **«Añadir»** de las zonas |
| `/portal` (inicio) | el enlace **«Visitas agendadas»** |

Medido en navegador; a 834 y 1440 no ocurre, y en perfil, búsquedas y visitas
tampoco.

**Corrección mínima:** reservar espacio inferior en las pantallas del portal
por debajo de 768 px, o encoger el flotante — `globals.css` ya tiene
`.wa-flotante` haciendo algo parecido a 280 px. **No se corrige aquí**: 03.06
es la evidencia, no el arreglo.

> **✅ CORREGIDO el 30-sep-2026** (V-1.1.95, con 20.01 y 05.07).
>
> La regla que ya existía se cortaba en **360 px** y el fallo está en **390**,
> así que nunca se aplicaba. Se reserva espacio en vez de encoger el botón:
> un botón más pequeño sigue estando encima, sólo tapa menos.
>
> `globals.css` → `@media (max-width: 767px) { [data-portal-contenido] {
> padding-bottom: 104px } }` (60 del botón + 28 de separación + 16 de aire), y
> el gancho `data-portal-contenido` en el único contenedor de `PortalShell`
> que envuelve las nueve pantallas.
>
> **Con CSS plano y no con una utilidad `pb-*` de Tailwind, a propósito:**
> por **E-20**, el reset sin capa de `globals.css:252` deja inertes las
> utilidades de relleno fuera de `[data-pantalla]`. Un `pb-26` ahí se habría
> escrito, habría llegado al HTML y **no se habría aplicado** — exactamente el
> fallo que se estaba corrigiendo. Es el primer caso en que E-20 cambia cómo
> se implementa una tarea; queda registrado como precedente.
>
> **10 pruebas** en `wafloat-oclusion.test.ts`, que vigilan que el límite siga
> cubriendo 390 px y que no se use una utilidad de Tailwind. El instrumento
> (`verificar-*.mjs`) sigue sin detectar oclusión: mide desborde, axe y
> errores JS. Por eso la garantía vive en la prueba.
>
> Una de las pruebas nació **inválida** —pasaba con el gancho borrado, porque
> el comentario que lo explica contiene el mismo nombre— y lo cazó la
> regresión adversarial. Corregida para mirar el atributo, no el archivo.

---

### 3c-3 · Centro de Ayuda — DONE, 30-sep-2026

Las cuatro rutas públicas: `/ayuda`, `/ayuda/buscar`, `/ayuda/[categoria]` y
`/ayuda/[categoria]/[articulo]`.

**Migración 27 aplicada y verificada en producción.** Evidencia completa en
[`fase-3/MIGRACION_27_EVIDENCIA.md`](fase-3/MIGRACION_27_EVIDENCIA.md).

| | |
|---|---|
| Tablas | **9**, todas con RLS · 5 políticas |
| Contenido | **37 artículos** — 31 publicados, 6 borradores · 9 categorías |
| Estado del producto | **29 disponibles · 3 parciales · 5 futuros** |
| Trazabilidad | **38 fuentes** en 29 artículos, 7 tipos |
| Datos previos | `usuarios` 7, `propiedades` 8, `citas` 0 — **intactos** |

**Lo que `anon` ve, probado con su propia clave contra la API:** 8 categorías
(la de publicadores filtrada) y 29 artículos, todos `publica/PUBLICADO`.
**Cero fugas. Cero futuros visibles.** `versions`, `sources`, `searches`,
`change_events` y `feedback`: cerradas. Escritura rechazada con 401.

**QA visual** con contenido real, 6 vistas × 3 tamaños = **18 capturas**:
cero desborde, **axe 0 graves**, 0 errores JS, migas y JSON-LD presentes.
404 para los ámbitos internos, para los futuros en borrador y para los slugs
inválidos. Los 29 artículos públicos responden 200. Instrumento:
`scripts/verificar-ayuda.mjs`, que **sale con código ≠ 0 si algo falla**.

**Integración:** «Centro de Ayuda» en `NAV_LINKS` —una sola lista que usan
escritorio y móvil— y junto a los legales del pie.

> [!warning] El respaldo de plataforma no se pudo hacer
> El MCP de Supabase no expone esa operación y no hay `DATABASE_URL` local.
> Se ejecutó igualmente porque la migración **sólo crea tablas nuevas**
> —verificado leyéndola, con cero colisiones— y el `REVERTIR` está ensayado
> en PGlite y sólo borra esas nueve. Los recuentos de después confirman que
> ningún dato existente se tocó. Es el único paso del ritual sin completar.

**Pendiente:** completar las fuentes de 2 artículos publicados de 31, y
sembrar los temas de administración, operaciones, comisiones, ofertas y
jurídico que el inventario identificó y que dependen de fases posteriores.

#### Navegación del Centro — añadida el 30-sep-2026 (V-1.1.95, sin desplegar)

Dos huecos de 3c-3, los dos encontrados usando el Centro de verdad.

**1 · El Centro era una isla.** Salió **sin cabecera ni pie**, y era la única
ruta pública así: `/propiedades`, `/nosotros`, `/contacto`, `/comparar`,
`/terminos` y `/privacidad` los pintan todos. El enlace *hacia* el Centro se
añadió en `NAV_LINKS`, pero una vez dentro no había forma de volver a
Propiedades, al Valuador, a Contacto ni de entrar a la cuenta salvo con el
botón «atrás» — en cuatro rutas indexables a las que la gente llega
**directamente desde un buscador**.

`Header` y `Footer` van ahora en `app/ayuda/layout.tsx`, un solo sitio para
las cuatro rutas. Los siete elementos del menú verificados en pantalla:
Inicio · Propiedades · Nosotros · Valuador · Contacto · Centro de Ayuda ·
Ingresar. El pie entra con la cabecera **a propósito**: es donde viven el
aviso de privacidad y los términos, y una página pública no debería
esconderlos.

**2 · Barra lateral con todo el Centro** (`components/ayuda/BarraLateral.tsx`).
Para pasar de un artículo a otro de **otra** categoría había que volver a
`/ayuda` y entrar de nuevo; 8 categorías y 29 artículos no se recorren así.

| | |
|---|---|
| Dónde | `/ayuda/[categoria]`, `/ayuda/[categoria]/[articulo]` y `/ayuda/buscar` |
| Dónde **no** | la portada `/ayuda` — ya es el índice completo en tarjetas; repetirlo sería decir dos veces lo mismo |
| Datos | `arbolPublico()`, **una sola lectura** de artículos (no una por categoría) con el mismo `ambito/estado` y el mismo orden que el resto |
| Escritorio | fija, 250 px, por debajo de la cabecera pegajosa; el artículo conserva su medida de lectura de 760 px |
| Móvil / tableta | plegada en `<details>`, cerrada incluso dentro de la categoría activa: abrirla sola devolvería el muro a quien ya está leyendo |
| Cliente | **0 KB de JavaScript** — componente de servidor, se pliega con `<details>` como el buscador es un `form` de verdad |

**QA en navegador, 3 tamaños (390 / 834 / 1440):** 0 desborde, `main` y pie
presentes, el conmutador fija ↔ plegada correcto, la barra arranca por debajo
de la cabecera (`--alto-cabecera` + 1,5 rem), categoría y artículo en curso
marcados con `aria-current`.

**axe: 0 graves.** Y además **se arregló un moderado previo**: el Centro no
tenía ningún `<main>` (`landmark-one-main`), y `region` baja de 7 nodos a 1.

> **Previo, no introducido:** queda un `heading-order` moderado porque el
> **pie** salta H2 → H4. Se comprobó en `/terminos`, que ya tenía el pie antes
> de este cambio: **misma violación**. Cambiar los `h4` del pie afecta a todas
> las páginas públicas, así que es **tarea propia**.
>
> **Previo, no introducido:** las rutas internas del Centro duplican el
> sufijo del título — «Entrar con Google | Centro de Ayuda · Vive Bien |
> Centro de Ayuda · Vive Bien». El `template` del layout y el título completo
> que devuelve `paginaSeo` se suman. La portada no lo sufre porque usa el
> `default`. Tarea propia, de una línea.

**Pruebas:** 29 en `ayuda-barra-lateral.test.ts` — que el árbol sea una sola
lectura, que una categoría vacía siga en la navegación, que `desactualizado`
se propague si falla cualquiera de las dos lecturas, que no entre JS al
cliente, que la cabecera y el pie estén en el layout y no copiados, y que la
barra no vuelva a `top-8`.

---

## DEUDA TÉCNICA TRANSVERSAL — registrada el 28-sep-2026

Nada de esto se arregla dentro de la fase en que se descubrió. Cada punto es
una tarea propia, con su alcance y su QA.

### E-20 · Auditoría y corrección del cascade global de CSS

**Prioridad: ALTA. Deuda técnica transversal. No implementar ahora.**

> **Segunda manifestación (30-sep).** No es sólo margen y relleno:
> `globals.css` tiene también `a { text-decoration: none }` **sin capa**, que
> le gana a `.underline` de Tailwind. En el Centro de Ayuda eso dejaba los
> enlaces distinguidos **sólo por el color** (1,29:1 contra el texto que los
> rodea, cuando hace falta 3:1); lo cazó axe. Se acotó igual, con
> `a:not([data-pantalla] a)`. **Cabe esperar más propiedades afectadas**: la
> auditoría de E-20 debe buscar todos los resets sin capa, no sólo el de `*`.
>
> **Alcance, dicho con precisión.** E-20 puede afectar la implementación y la
> revisión visual de componentes que dependan de utilidades de `margin` y
> `padding`. Debe auditarse **antes** de aplicar un cambio global del cascade.
> No es un bloqueador absoluto del resto del producto: lo que no dependa de
> esas utilidades no se ve afectado.

`src/app/globals.css:219`:

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
```

Ese `*` va **fuera de `@layer`**. Tailwind v4 emite sus utilidades dentro de
`@layer utilities`, y en CSS **lo no-capado gana siempre a lo capado**, con
independencia de la especificidad. Una clase `.px-\[9\%\]` (0,1,0) pierde
contra `*` (0,0,0) sólo por estar en una capa.

Consecuencia: `p-4`, `mt-6`, `px-[9%]`, `pl-[52px]`… se escriben, llegan al
HTML, **existen en el CSS compilado** y no se aplican. **49 de los 149
componentes `.tsx`** usan utilidades de margen o relleno hoy inertes.

Se descubrió midiendo estilos computados en `/entrar` (28-sep): `padding-left`
daba `0px` con la regla presente en el bundle. En esa pantalla se neutralizó de
forma acotada con `revert-layer` sobre `[data-pantalla="acceso"]`; el resto del
proyecto sigue igual.

> [!danger] No es trivial
> Corregirlo despierta las utilidades de 49 componentes **a la vez**. Cada uno
> puede moverse. Además, dos fallos de maquetación de `/entrar` sólo se
> hicieron visibles **después** de arreglar la cascada allí: un margen negativo
> metía la tarjeta en la bisagra y un `items-center` la desbordaba hacia
> arriba. Esperar lo mismo en los 49.

**La tarea debe incluir, en este orden:** inventario de los 49 componentes ·
capturas del estado visual **antes** · corrección del cascade (el reset a
`@layer base`) · revisión componente por componente · regresión visual ·
QA responsive · QA de accesibilidad · pruebas · documentación.

### Design System — discrepancia sin resolver

El manual de identidad (recibido el 28-sep) y `/entrar` no coinciden.
**No se decide aquí**: se resuelve en la auditoría formal del Design System.

| | Manual de identidad | `/entrar` hoy |
|---|---|---|
| Rojo | `#A30D12` | `#8B1A1A` (`var(--rojo)`) |
| Gris | `#6B7280` | `#5A626B` |
| Arena | `#F3F0EA` | `#F1EEE9` |
| Tipografía | Montserrat | Playfair Display en titulares |

Contraste medido (AA texto pequeño = 4,5:1):

| Color | sobre blanco | sobre tarjeta `#FCFBF9` | sobre arena `#F3F0EA` |
|---|---|---|---|
| Gris del manual `#6B7280` | 4,83 ✅ | 4,67 ✅ | **4,25 ❌** |
| Gris de `/entrar` `#5A626B` | 6,19 ✅ | 5,98 ✅ | 5,44 ✅ |
| Rojo del manual `#A30D12` | 8,00 ✅ | 7,74 ✅ | 7,04 ✅ |
| Rojo de `/entrar` `#8B1A1A` | 9,29 ✅ | 8,98 ✅ | 8,17 ✅ |

Dos cosas concretas que la auditoría tendrá que resolver, no esquivar:

1. **El gris del manual no pasa AA sobre el arena del propio manual** (4,25:1).
   Sobre blanco y sobre la tarjeta sí pasa. O sea: la combinación gris+arena del
   manual no es usable para texto pequeño, y hay que decidir qué cede.
2. **La tipografía del manual contradice al propio montaje del dueño**, que usa
   una serif en el titular.

Los dos rojos pasan de sobra, así que ahí la decisión es puramente de marca.

`/entrar` no se cambia mientras tanto.

### Logotipo

- La **composición oficial se mantiene**: marca + «VIVE BIEN» + «Grupo
  inmobiliario». Usos incorrectos del manual: deformar, recolorear, contornear
  — y recortar la bajada para que quepa en un diseño es de la misma familia.
- `/entrar` usa hoy `public/logo_transparent.png`, el PNG oficial **completo**.
- **No volver a recortarlo ni rehacerlo** para adaptarlo a un montaje.
- **Falta el SVG maestro oficial.** Obtenerlo y prepararlo (versión negativa,
  símbolo suelto, favicon) es **tarea separada**, no de ninguna fase en curso.

### QA pendiente · plegable físico

Comprobar `/entrar` en un plegable real. **No invalida** la validación actual:
los 10 viewports y los tres plegables están verificados en navegador con
segmentos inyectados. Es una prueba **adicional**.

### Dashboard antiguo

Retirar la tarjeta de acceso del dashboard viejo **cuando corresponda**
(fase 22). Mientras siga existiendo el dashboard clásico, **la escotilla
explícita `/dashboard?clasico=1` se mantiene** y está cubierta por pruebas.
No retirarlo ahora.

### Baseline histórico de lint — no tocar

63 errores / 39 avisos. Dentro van, entre otros, los 2 `no-require-imports` de
`seed-sanjuan.cjs` (script de la raíz, sin tocar desde marzo). **No se corrigen
desde ninguna fase en curso**; son deuda previa con tarea propia.

Aparte, `.claude/skills/design-system/scripts/*.cjs` mete 6 errores y 1 aviso
cuando el lint se lanza sobre todo el árbol. **`eslint.config` no se toca
todavía**: el aislamiento del ruido de las skills se decidirá al abrir esa
iniciativa.

---

## Design System VIVE BIEN — fase 2 hecha (29-sep-2026)

**Inventario:** ya habia nueve skills instaladas, cuatro de diseño
(`ui-styling`, `design-system`, `ui-ux-pro-max`, `frontend-patterns`). No
hacian falta mas herramientas genericas: el hueco era una **autoridad de
identidad propia**.

**Creado:** `.claude/skills/vivebien-design-system/` — SKILL.md + nueve
referencias. Manda sobre las skills genericas en todo lo que sea identidad.

**Documentacion:** [`design/SKILLS.md`](design/SKILLS.md) ·
[`design/DESIGN_SYSTEM.md`](design/DESIGN_SYSTEM.md) ·
[`design/DESIGN_WORKFLOW.md`](design/DESIGN_WORKFLOW.md).

**Auditoria A–E de la interfaz actual** en `references/componentes.md`. El
hallazgo principal: hay **dos mundos** — producto nuevo con Tailwind/shadcn y
sitio legado con 237 estilos en linea solo en el dashboard clasico.

**17 decisiones abiertas** en `references/pendientes.md`.

**Repositorios externos: ninguno instalado.** Pendiente de tu decision.

---

## Centro de Ayuda — registrado el 23-sep-2026

Plan completo en `docs/fase-3/CENTRO_DE_AYUDA.md`. **Nada implementado.** Resumen de dónde entra:

| Fase | Qué |
|---|---|
| 3b-2 (V-1.1.86) | Registrada la necesidad y el mapa de ayuda contextual por pantalla |
| 3b-3 (V-1.1.87) | Arquitectura: categorías, artículos, búsqueda, etiquetas, estados, relación con funcionalidad y rol, SEO, analítica, permisos, estructura de `/ayuda` |
| 3c-1 / 3c-2 | Enlaces de ayuda en el acceso y ayuda por rol en los perfiles |
| **3c-3 · V-1.1.94** | **DONE (30-sep-2026)** · Centro de Ayuda público construido, migración aplicada y verificada en producción — ver abajo |
| Posteriores | Knowledge Engine (detección de cambios), IA editorial, analítica de preguntas |

**Regla fundamental:** la IA redacta y propone; **la fuente de verdad es el sistema** (código, configuración,
base, documentación aprobada, textos legales) y **publicar lo aprueba una persona**.

## Portada pública — rediseño (21-oct-2026) · Preview de staging, sin promover
Orden oficial del trabajo: 1) R8.6 desplegado (hecho) → 2) **ajustes de diseño web** (esta etapa: portada) → 3) solicitud de Asociado (flag apagado; aún no se construye).
Hecho en la portada: hero con video (recorte limpio, sin audio, con portada y movimiento reducido), «¿Qué es Vive Bien?» + PROIN, Oficinas, «Permítenos guiarte», carrusel de clientes, contacto compacto, WhatsApp único. Pruebas: e2e de la portada 104/104 (390·768·1024·1440), Vitest 2673 ok / 6 previas fallan. Preview `dpl_EGHag2MUzsP9pdCVqYqPBxa76jHS`; paquete 424 archivos, huella `c856390fae04f202a065a5d8cee707e3af6ae277`.
Siguiente: decidir promoción; sustituir el video por una toma 16:9 1080p; afinar alto del hero en teléfono y aire entre «Qué es» y PROIN; originales de PROIN. No tocar Admin/Publicador/Asociado/Cliente.

**Rediseño de la portada — tercera entrega (21-oct-2026):** fotos reales (PROIN reordenada; «Qué es» con imagen del propietario), mosaico revertido por decisión del propietario, «Nosotros» (6 secciones) y «Contacto» rehechas, portada con el mismo patrón, testimonios en formato de reseña, prueba de contraste nueva. Siguiente: e2e de las tres pantallas, confirmar datos de las láminas, logotipo de PROIN sin fondo, decidir promoción. No tocar Admin/Publicador/Asociado/Cliente.

**Cierre 21-oct-2026:** portadas por página + remasterizado, acceso (`/entrar`) y encabezado; Preview combinado `vive-bien-4um3ubipd`. Siguiente: e2e de v768/v1024 y de Propiedades/Entrar/Header, Lighthouse, decisiones del propietario (datos de las láminas, dirección/horario, valuador: precio de cierre), aprobar o rechazar la adenda de skills staged y, solo con orden expresa, promover.

**Citas v2 — estado de cierre (8-nov-2026, rama `citas/v2-staging`):** código y pruebas de las fases 70–75 listos; **solo staging** (migraciones 70–75 aplicadas en `obzxnxfrqpmxocgkhxro`; el dominio de staging apunta al Preview del commit validado; `citasEnLinea` encendido temporalmente en staging para revisión del propietario, a restaurar a `false`). **Producción sin cambios** (ni código, ni migraciones, ni flags). Pasos para llevarlo a Producción, en orden y con autorización explícita: aprobación legal de los textos → desplegar el código → migraciones 70–73 y 75 (72 sustituye a 71/71b/71c; la 71c es solo de staging) → crear el secreto de la tarea → decidir cómo llama el cron a un entorno protegido → encender `citasEnLinea`. Decisiones abiertas del propietario: ver ADR-0014 («Revisión de cierre»).

**Citas v2 — decisiones del dueño implementadas (9-nov-2026, rama `citas/v2-staging`):** las seis decisiones del ADR-0014 están en el código con pruebas; migración 76 (responsables de citas) aplicada **solo a staging** (`obzxnxfrqpmxocgkhxro`); Producción sin cambios. Falta: gate completo sobre el HEAD final, nuevo Preview y ayuda pública/Aviso de Privacidad alineados con la decisión 1.
