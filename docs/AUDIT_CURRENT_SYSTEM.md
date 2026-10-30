# VIVE BIEN — Auditoría del sistema actual

> **Fase 0 del Master PRD v2.0** (18-sep-2026). Sólo lectura: no se cambió código de producto para hacer esta auditoría.
> Fuentes: el repositorio `vivebien-next` (rama `nextjs-migration`), la base de producción Supabase `uztssyrheqdhtoheecgf` (consultas de sólo lectura), el sitio en producción `vivebienn.com`, y los documentos `VIVE_BIEN_Master_PRD_Ficha_Tecnica_Social_Marketing_Hub_v2_0` (.md y .docx, idénticos en contenido).
> Baseline etiquetado: `git tag baseline-v1.1.75` (commit `d15b515`, lo que hoy está en producción).
>
> Severidad: **CRITICAL** (expone datos o rompe una regla de negocio del PRD hoy o con el primer publicador externo) · **HIGH** · **MEDIUM** · **LOW**.

Documentos relacionados: [`DECISIONS.md`](DECISIONS.md) (contradicciones y decisiones), [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), [`adr/`](adr/).

---

## Resumen de hallazgos

| ID | Severidad | Hallazgo | Sección |
|---|---|---|---|
| SEC-00 | **CRITICAL** → ✅ **arreglado en V-1.1.76** | Encontrado al aplicar la decisión de Super Admin: ser de `ADMIN_EMAILS` daba acceso de admin **sin verificar el correo**, y el sitio deja crear cuentas con contraseña. 3 de los 4 correos de la lista no tenían cuenta: cualquiera podía registrarse con uno y entrar como admin (leads, usuarios, analítica). `/api/leads` además filtraba por un correo sin verificar. Ahora la lista exige correo verificado y todo pasa por el perfil. | H/Q |
| SEC-01 | **CRITICAL** | El contacto público y los leads pueden llegar al publicador: el asistente le deja poner el WhatsApp del anuncio, la ficha y las tarjetas lo usan, `/api/contacto` le manda el nombre, teléfono y correo del interesado, y el texto de consentimiento dice que los datos «se compartirán con su anunciante». **✅ Arreglado en V-1.1.77 (19-sep)** salvo el texto del consentimiento, que espera al abogado (D-03). | Q |
| SEC-02 | **CRITICAL** | Cualquiera puede leer **todas las columnas** de las propiedades publicadas con la clave pública (Supabase REST) y por `/api/catalogo` (`select('*')`): `owner_id`, `revisado_por`, `nota_moderacion`, `whatsapp`, `telefono`, `calle`, `cp`, `lat/lng` exactos. **✅ Arreglado en V-1.1.77 (19-sep).** Migración 18: REST anónimo con columna interna → 401. | Q |
| SEC-03 | HIGH | `leads` y `contactos` aceptan INSERT público directo (política RLS para `anon`), saltándose validación, límite y consentimiento. Ningún código lo usa ya. **✅ Arreglado (migración 17, 19-sep).** | F/Q |
| SEC-04 | HIGH | Avisos del asesor de Supabase sin atender: `rls_auto_enable()` (SECURITY DEFINER) ejecutable por `anon`/`authenticated`; `tocar_actualizado_en` con `search_path` mutable (migración 13 propuesta, sin aplicar). **✅ Arreglado (migración 17, 19-sep).** | Q |
| SEC-05 | HIGH | Subida de fotos a Cloudinary con **preset sin firma** expuesto en el navegador (`NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`): cualquiera puede subir archivos a la cuenta; no hay validación de tipo real ni cuarentena. Además el preset `vivebien-upload` no existe hoy (subidas rotas, pendiente 0-A). **Corrección 19-sep:** eso era en la nube vieja `dd9b29y6r`; producción usa `zwsi9aar` y ahí el preset **sí existe** (comprobado con una subida inválida que Cloudinary rechazó por el archivo, no por el preset). **La subida sin firma funcionaba y era explotable.** **✅ Cerrado en V-1.1.78** (subidas firmadas, preset borrado): verificado el 19-sep: foto real subida por el usuario con firma (07:47 UTC, nube `zwsi9aar`, carpeta `vivebien/sin-tipo/borrador-…` decidida por el servidor); con una subida inválida Cloudinary responde «Upload preset not found» para `vivebien-upload` (y otros nombres probables), «must be whitelisted for unsigned uploads» para `ml_default` (existe pero exige firma), «Upload preset must be specified» sin preset ni firma e «Invalid api_key» con firma inventada. | G/Q |
| SEC-06 | HIGH | Claves expuestas pendientes de rotar (Resend pegada en chat, token de Telegram, secreto de Cloudinary). | Q |
| OPS-01 | HIGH | El código sólo existe en este disco: la rama `nextjs-migration` va **38 commits adelante de GitHub** y la carpeta no está en OneDrive. Producción se despliega desde la carpeta local, no desde git. | N/Y |
| OPS-02 | HIGH | No hay entorno de pruebas: el servidor local usa la **base de producción**. No hay CI. | Y |
| DAT-01 | HIGH | No hay revisiones de propiedad: editar una propiedad publicada cambia la ficha pública al instante (desde V-1.1.74 el admin edita publicadas en el asistente). | S |
| DAT-02 | HIGH | Tres almacenes de leads distintos (`leads`, `contactos`, `solicitudes_contacto`) sin atribución, sin asignación ni seguimiento. | F/V |
| DAT-03 | HIGH | Los datos del negocio (NAP) están repetidos **32 veces en 19 archivos**; GA4 está escrito a mano en el layout. No existe `businessConfig`. **✅ Arreglado en V-1.1.77 (19-sep).** `src/lib/config/negocio.ts` + prueba que falla si reaparecen. | K/L |
| PERF-01 | HIGH | Móvil (medido con Playwright, 4× CPU, ~1.6 Mbps): LCP **9.0 s** en portada y **10.9 s** en el listado (~5.7 MB transferidos). Meta del PRD: LCP ≤ 2.5 s. | O |
| RBAC-01 | MEDIUM | No existe SUPER_ADMIN; `ADMIN_EMAILS` hace de raíz. Algunas rutas autorizan por `ADMIN_EMAILS` y otras por `usuarios.rol`. | H/Q |
| PUB-01 | MEDIUM | La activación de publicador es un cambio de rol hecho por un admin (o una invitación con rol): no hay solicitud, verificación, propuesta de comisión ni acuerdo. | U/V |
| CIT-01 | MEDIUM | El sistema de citas (V-1.1.75) toma como «asesor» al dueño de la propiedad y le enseña los datos del cliente. Contradice el PRD (el publicador no recibe PII). Hoy no hay efecto: no hay citas y todas las propiedades son del admin. | V |
| SEO-01 | MEDIUM | `/dashboard`, `/mi-cuenta` y `/publicador` no llevan `noindex` (sólo `robots.txt`). Dos publicadas tienen slug de relleno (`propiedad-sin-titulo-…`). **✅ `noindex` en V-1.1.77**; los slugs, pendientes (D-23). | K |
| SEC-07 | MEDIUM | Límite de peticiones en memoria de cada instancia (no funciona entre instancias serverless). CSP sólo en modo informe. | Q |
| DEBT-01 | MEDIUM | Panel viejo de cliente/publicador en `/dashboard` (1 307 líneas) y `/mi-cuenta`; componentes del admin viejo; 73 errores de ESLint en archivos antiguos; `lib/firestore.ts` sin uso. | W/X |
| AUD-01 | MEDIUM | La bitácora (`audit_logs`, 250 filas) cubre ediciones y altas, pero no todas las transiciones críticas (p. ej. cambios de estado de publicación). | Q |

---

## A · Stack actual

| Capa | Real (código y producción) | Lo que asume el PRD |
|---|---|---|
| Framework | **Next.js 16.3.4** (App Router, Turbopack), React 19.2.4, TypeScript 5 | Next.js + React + TS ✔ |
| UI | Tailwind v4 + shadcn/ui (radix-nova), Lucide, sonner, cmdk; en el sitio público, CSS propio + Font Awesome por CDN | Tailwind + shadcn ✔ |
| Formularios | react-hook-form + zod (instalados; uso parcial) | RHF + Zod ✔ |
| Datos en cliente | `fetch` + `useEffect` (sin caché) | TanStack Query ✘ |
| Tablas | @tanstack/react-table **v9** (admin nuevo) | ✔ |
| Gráficas | Recharts | ✔ |
| Calendario | FullCalendar 7.1.0 (MIT) instalado para citas (sin desplegar aún) | — |
| Autenticación | **Firebase Auth** (Google + correo/contraseña). Servidor verifica el token con `jose` contra las llaves públicas de Google. Sin `firebase-admin`, sin custom claims | Firebase Auth ✔ / custom claims ✘ |
| Base de datos | **Supabase Postgres** (desde abril 2026). Firestore **no se usa** | Firestore ✘ |
| Archivos | **Cloudinary** (fotos, subida sin firma); Supabase Storage sin buckets | Cloud Storage ✘ |
| Backend | **Route Handlers de Next.js en Vercel** + funciones plpgsql | Cloud Functions 2nd gen ✘ |
| Tareas | 1 cron diario de Vercel (plan Hobby); `pg_cron`/`pg_net` disponibles sin activar | Cloud Tasks ✘ |
| Correo | Resend por `fetch` | — |
| Mensajería | Telegram (bot de alta de propiedades y alertas), WhatsApp Cloud API (webhook) | — |
| Mapas | Google Maps (`@vis.gl/react-google-maps`) y Leaflet | — |
| Analítica | GA4 `G-7TQQEQ97S2` + tabla propia `eventos` | GA4 ✔ |
| Pruebas | Vitest (**443** pruebas, 29 archivos, todas pasan) + Playwright visual (45 capturas) + PGlite para SQL | Vitest + Playwright ✔ / Emulator ✘ |
| Despliegue | `npx vercel --prod` desde la carpeta local | CI/CD con ramas ✘ |

## B · Arquitectura

```
Navegador ── Firebase Auth (token) ──► Route Handlers /api/* (Vercel, Node)
   │                                        │  verifyIdToken (jose/JWKS)
   │  clave anónima (lectura pública)        │  requireRole / requireAdmin → usuarios.rol + ADMIN_EMAILS
   ▼                                        ▼
Supabase REST (anon: sólo propiedades     Supabase (clave de servicio, ignora RLS)
publicadas y sus fotos)                    ├─ tablas con RLS sin políticas (sólo servidor)
                                           └─ funciones plpgsql (citas)
Cloudinary (fotos) · Resend · Telegram · WhatsApp · GA4
```

- La autorización real vive en el servidor (bien). El navegador no escribe en la base salvo por dos políticas INSERT heredadas (SEC-03).
- No hay capa de repositorio/servicio para propiedades: cada ruta arma sus consultas. Sí la hay para citas (`src/lib/citas/servicio.ts`).

## C · Rutas

**Públicas (indexables):** `/`, `/propiedades`, `/propiedades/[slug]`, `/contacto`, `/nosotros`, `/valuador`, `/terminos`, `/privacidad`. `/comparar` lleva `noindex`.

**Privadas:** `/admin` (+ `actividad`, `metricas`, `propiedades`, `propiedades/pendientes`, `registros`, `usuarios`, `seed`), `/dashboard` (panel viejo; los admins van a `/admin`), `/mi-cuenta`, `/publicador`, `/publicador/propiedades/[id]/editar` (asistente), `/portal` (nuevo, **sin desplegar**), `/citas/accion` (enlaces de correo, sin desplegar).

**API (33):** `admin/*` (11), `citas/*` (6), `alertas/resumen` (cron), `busquedas`, `catalogo`, `contacto`, `eventos`, `favoritos`, `leads`, `portal/resumen`, `propiedades/[id]/estado`, `publicador/propiedades`, `registro-lead`, `salud`, `seed`, `telegram/webhook`, `usuarios/me`, `whatsapp/webhook`.

- URL de propiedad: **`/propiedades/[slug]`** con respaldo por id (`rutaDe`). Coincide con la convención del PRD (Corrección 05): no hay que mover URLs.

## D · Componentes

- `src/components/admin/*` (panel nuevo, V-1.1.71–74): carcasa, barra lateral, búsqueda global, notificaciones, KPIs, tabla, gráficas, mapa de calor.
- `src/components/portal/*` y `src/components/citas/*` (sin desplegar).
- Sitio público: `Header`, `Footer`, `PropertyCard`, `MapaListado`, `RegisterModal`, `WAFloat`…
- **Legado todavía en uso:** `Registros.tsx`, `Usuarios.tsx`, `Metricas.tsx`, `MetricasCliente.tsx`, `MisFavoritos.tsx`, `MisBusquedas.tsx`, `QuieroPublicar.tsx`, `Bienvenida.tsx` (sirven al `/dashboard` viejo y a partes del admin nuevo).
- Animación: `framer-motion`, `gsap`, `react-countup` y varios componentes de efectos (`GlareHover`, `ShinyText`, `GradientText`, `ScrollReveal`…).

## E · Firebase

- Sólo **Authentication** (Google y correo/contraseña). Configuración pública en `NEXT_PUBLIC_FIREBASE_*`.
- **No hay** Firestore, Firebase Storage, Cloud Functions, App Check, reglas de seguridad de Firebase ni `firebase.json`. `src/lib/firestore.ts` existe pero nadie lo importa (código muerto).
- Pendiente conocido: `origin_mismatch` al entrar con Google en el dominio propio (pendiente 1 en Obsidian).
- Las cuentas con correo y contraseña **no verifican el correo** (no hay ese paso).

## F · Base de datos (en lugar de Firestore)

Supabase Postgres, 21 tablas en `public`, todas con RLS activo. Filas reales (18-sep-2026):

| Tabla | Filas | Políticas RLS | Nota |
|---|---|---|---|
| `propiedades` | 18 (7 publicadas, 11 borradores; 6 marcadas `eliminada`) | SELECT público si `estado_pub='publicada'` | **Todas las columnas** visibles (SEC-02) |
| `fotos` | 105 | SELECT público si la propiedad está publicada | |
| `usuarios` | 3 (1 admin, 1 publicador, 1 cliente) | ninguna (sólo servidor) | roles `cliente/publicador/admin` |
| `leads` | 1 | **INSERT público** | legado (SEC-03) |
| `contactos` | 0 | **INSERT público** | legado (SEC-03) |
| `solicitudes_contacto` | 0 | ninguna | consentimiento versionado, `owner_id` |
| `eventos` | 61 | ninguna | analítica propia |
| `audit_logs` | 250 | ninguna | |
| `favoritos` 0 · `busquedas_guardadas` 1 · `invitaciones` 0 · `envios` 0 | | ninguna | |
| `citas`, `citas_eventos`, `citas_tokens`, `citas_correos`, `disponibilidad_asesores`, `ajustes_citas`, `bloqueos_asesores`, `calendarios_google`, `google_oauth_estados` | 0 | ninguna, sin permisos para anon/authenticated | migración 15 (V-1.1.75) |

- **Privilegios de tabla:** `anon` y `authenticated` conservan SELECT/INSERT a nivel de tabla en casi todas (el RLS sin política los frena). Las tablas de citas sí los tienen revocados. Defensa en profundidad: LOW.
- Migraciones en `supabase/` numeradas 02–16 (la 13 reservada y sin aplicar).

## G · Storage

- **Fotos:** Cloudinary (URLs públicas `res.cloudinary.com/…`), subida **desde el navegador con preset sin firma** (panel viejo, asistente) y desde el bot de Telegram. Sin validación de tipo real (magic bytes), sin tamaño máximo en servidor, sin cuarentena. El preset `vivebien-upload` no existe hoy → subidas rotas (pendiente 0-A).
- **Documentos privados:** no existen (no hay documentación de propiedad, escrituras ni identificaciones). Los `planos` son URLs públicas.
- Supabase Storage: 0 buckets.

## H · Auth y roles

- `verifyIdToken` (JWKS de Google) → `getPerfil` (fila en `usuarios` + `ADMIN_EMAILS`) → `requireRole`. Falla cerrado. ✔
- Un usuario sólo puede elegirse `cliente` (`ROLES_ELEGIBLES = ['cliente']`). ✔
- `publicador` lo da un admin en `/admin/usuarios` o una invitación con rol. ✘ PRD (PUB-01).
- `admin` requiere estar en `ADMIN_EMAILS` (si la lista falta, nadie es admin). No existe SUPER_ADMIN (RBAC-01).
- Rutas que autorizan por `isAdminEmail` y no por rol: `GET /api/leads`, `GET /api/eventos`, `GET /api/contacto`. Inconsistente.

## I · Cloud Functions

No hay. La lógica de servidor está en Route Handlers (Vercel) y, para invariantes transaccionales, en funciones plpgsql (`cita_crear`, `cita_transicionar`). Ver [ADR-0002](adr/ADR-0002-backend-route-handlers-y-postgres.md).

## J · Reglas de seguridad

No hay reglas de Firebase. El equivalente son **políticas RLS** de Postgres:
- 4 políticas: SELECT público de `propiedades` y `fotos` publicadas; INSERT público en `leads` y `contactos`.
- El resto: RLS activo sin políticas → sólo la clave de servicio (servidor) accede.

## K · SEO

Verificado en producción:
- Canonical autorreferenciada y `index, follow` en `/`, `/propiedades`, `/contacto` y fichas. El problema histórico de «canonical: Nada» está resuelto en el HTML servido (la canónica ya no se hereda del layout).
- `/portal` y `/admin` con `noindex`. **`/dashboard`, `/mi-cuenta`, `/publicador` sin `noindex`** (sólo `Disallow` en `robots.txt`, que no impide indexar la URL si alguien la enlaza) → SEO-01.
- `sitemap.xml`: 6 páginas + 7 propiedades publicadas; se genera en cada petición con `estado_pub`. Dos fichas con slug de relleno (`propiedad-sin-titulo-wljv`, `-qzsl`): cambiarlos exige 301.
- JSON-LD (Organization/RealEstateAgent, ficha, migas) con `jsonLdSeguro` (escapado).
- Auditoría SEO propia: `npm run seo:audit` (última: 0 errores, 8 avisos de `h1`).

## L · Analytics

- GA4 `G-7TQQEQ97S2` escrito a mano en `src/app/layout.tsx`.
- Tabla `eventos` (61 filas): `property_view`, `search_performed`, etc., vía `POST /api/eventos` con límite de peticiones.
- Panel admin con métricas por período y comparación honesta (sin inventar porcentajes).
- **No hay** UTM, atribución (`firstTouch/lastTouch`), snapshots diarios ni Measurement Protocol.

## M · Integraciones

| Integración | Estado |
|---|---|
| Resend | ✔ dominio verificado; avisos de leads e invitaciones; correos de citas (sin desplegar) |
| Telegram | ✔ bot de alta de propiedades + resumen diario (cron); token pendiente de rotar |
| WhatsApp Cloud API | webhook existe; verificación de negocio en Meta pendiente; hoy cae a `wa.me` |
| Cloudinary | ✔ lectura; subida rota (preset) |
| Google Maps / Leaflet | ✔ |
| Meta (Instagram/Facebook) | ✘ no existe |
| Google Calendar | ✘ no existe (planeado en citas) |
| IA | ✘ no existe en el producto |

## N · Dependencias

- 30 dependencias de producción. Duplicadas en propósito: `framer-motion` + `gsap` + `react-countup` (animación); `leaflet` + Google Maps (mapas).
- Recién añadidas: `@fullcalendar/react` 7.1.0 + `temporal-polyfill` (citas), `@electric-sql/pglite` (pruebas).
- `npm audit` reporta avisos al instalar (no revisados en esta fase).
- Repositorio: `origin = github.com/Grupo-P-once/ViveBien`; rama de producción real `nextjs-migration` **38 commits sin subir**; `master` está en la migración inicial (OPS-01).

## O · Performance

Medido el 18-sep-2026 con Chromium de Playwright contra producción (bloqueando `/api/eventos` y GA4 para no ensuciar la analítica). PageSpeed no respondió (cuota agotada) y Lighthouse local no pudo lanzar Chrome: **el puntaje Lighthouse queda pendiente**.

| Página | Móvil (4× CPU, ~1.6 Mbps) | Escritorio |
|---|---|---|
| `/` | LCP **9.0 s** · FCP 4.4 s · TTFB 3.1 s · CLS 0.000 · ~1.2 MB | LCP 0.85 s · CLS 0.007 |
| `/propiedades` | LCP **10.9 s** · FCP 0.9 s · CLS 0.001 · **~5.7 MB** | LCP 1.44 s · ~5.6 MB |
| Ficha | LCP 3.3 s · CLS 0.000 · ~4.8 MB | LCP **5.2 s** · ~5.2 MB |

- El listado baja fotos de tamaño completo (no miniaturas) → PERF-01.
- Font Awesome completo por CDN y tres familias de Google Fonts con muchos pesos en todas las páginas.
- TTFB de 3 s en la primera carga de la portada (arranque en frío o revalidación): investigar.

## P · Accesibilidad

- Panel nuevo: foco visible, etiquetas `aria`, tablas con encabezados, contraste validado en gráficas.
- Sitio público: no se midió en esta fase (el puntaje Lighthouse quedó pendiente). La auditoría del PRD citaba 92.

## Q · Seguridad

| ID | Severidad | Detalle | Evidencia |
|---|---|---|---|
| SEC-01 | **CRITICAL** | Contacto y leads al publicador | Asistente: campo «WhatsApp» del anuncio (`editar/page.tsx:1027`). Ficha: `const wa = prop.whatsapp \|\| WA_NUMBER` (`propiedades/[id]/page-client.tsx:266`). Tarjetas: igual (`PropertyCard.tsx:87,312`). `/api/contacto` → `notificarPublicador` manda nombre, WhatsApp y correo del cliente al dueño (`lib/whatsapp.ts`). Consentimiento vigente (`2026-09-16`): «…se compartirán con su anunciante». Hoy: las 7 publicadas tienen WhatsApp propio con **2 números distintos** (terminan en 6501, el oficial, y 8559 — confirmar de quién es). Todas son del admin, así que el daño real empieza con el primer publicador externo. |
| SEC-02 | **CRITICAL** | Columnas internas y datos del dueño públicos | Política `propiedades_lectura_publica` sin restricción de columnas + `select('*')` en `/api/catalogo` y `/api/admin/propiedades` (modo anónimo). Respuesta real de `/api/catalogo`: 46 columnas, incluidas `owner_id`, `revisado_por`, `nota_moderacion`, `whatsapp`, `telefono`, `calle`, `cp`, `lat`, `lng`. |
| SEC-03 | HIGH | INSERT público en `leads`/`contactos` | `pg_policies`: `leads_insertar_publico`, `contactos_insertar_publico` para `anon`. Ningún componente escribe directo (verificado por búsqueda). |
| SEC-04 | HIGH | Avisos del asesor de Supabase | `rls_auto_enable()` ejecutable por `anon`/`authenticated`; `tocar_actualizado_en` sin `search_path`. |
| SEC-05 | HIGH | Subida sin firma a Cloudinary | `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` en el bundle; subida directa `api.cloudinary.com/.../upload` desde navegador y Telegram. |
| SEC-06 | HIGH | Claves por rotar | Pendientes en Obsidian (Resend, Telegram, Cloudinary). |
| SEC-07 | MEDIUM | Límites y CSP | `limites.ts` guarda contadores en memoria de la instancia; CSP en `Content-Security-Policy-Report-Only`. |
| SEC-08 | MEDIUM | Fuentes de autoridad mezcladas | `isAdminEmail` vs `requireAdmin` (ver H). `NEXT_PUBLIC_ADMIN_EMAILS` publica la lista de correos admin en el bundle. **✅ Arreglado en V-1.1.79:** `/dashboard` ya no la lee (el rol lo dice el servidor); comprobado que ningún JS del sitio contiene ya correos privados; una prueba falla si vuelve. `requireAdmin` y `requireRole` pasan por un solo `autorizar()`. **V-1.1.81:** las listas del entorno (`ADMIN_EMAILS`, `SUPER_ADMIN_EMAILS`) dejan de decidir permisos; el rol vive sólo en `usuarios.rol`. |
| SEC-09 | LOW | Privilegios de tabla a `anon` | Ver F. |
| SEC-10 | LOW | Herramientas de siembra en producción | `/admin/seed` y `POST /api/seed` (sólo admin). |
| OK | — | Bien resuelto hoy | Transiciones de publicación en servidor (`puedeTransicionar`); campos reservados (`owner_id`, `estado_pub`, contadores) que el publicador no puede escribir; rol elegible sólo `cliente`; tokens de correo hasheados de un solo uso (citas); cabeceras de seguridad; JSON-LD escapado; sin secretos de servidor con prefijo `NEXT_PUBLIC_`. |

## R · UX/UI

- **Admin nuevo** (V-1.1.71–74): moderno, responsive, con la marca; sustituye al viejo (el viejo sólo con `?clasico=1`).
- **Cliente:** sigue en el `/dashboard` viejo y `/mi-cuenta`. El portal nuevo (`/portal`, mockups 05–06) está a medias y **sin desplegar**.
- **Publicador:** `/publicador` con estilo viejo + el asistente de 1 108 líneas.
- **Tokens de color en conflicto:** panel `#971010` (medido del logo), sitio `--rojo #8B1A1A` y `--rojo-marca #C8102E`, PRD `#A30D12`. Ver DECISIONS D-07.

## S · Propiedades hoy

- Una sola tabla `propiedades` con dos campos de estado: `estado_pub` (`borrador`, `en_revision`, `cambios_solicitados`, `rechazada`, `publicada`) y `estatus` (`disponible`, `pausada`, `vendida`, `rentada`, `eliminada`).
- Sólo `owner_id` (no hay `publisher_id`).
- Sin revisiones: la ficha pública lee la fila viva (DAT-01).
- Tres caminos de alta: asistente web, bot de Telegram y siembra admin.
- Completitud calculada (`calcularCompletitud`, mínimo 80 para enviar a revisión); folio y slug los asigna el servidor.
- El admin puede publicar directo (desde V-1.1.50) sin revisión ni acuerdo.

## T · Admin hoy

Dashboard (KPIs, tendencia, mapa de calor, actividad, comparación de período), Propiedades (pestañas por estado, acciones), Por revisar, Registros (alta manual, CSV), Usuarios (último acceso, invitaciones), Métricas, Actividad, búsqueda global y notificaciones. **No existen:** Centro de revisión unificado, Leads/Atención, Visitas en UI, Ofertas, Operaciones, Comisiones, Jurídico, Marketing, Configuración, Super Admin.

## U · Cliente hoy

Favoritos (0 en uso), búsquedas guardadas con «nuevas» (1), consultas enviadas, perfil con «qué busco», valuador público, «Quiero publicar» (cambia a publicador sólo si un admin lo autoriza). **No existen:** solicitud formal para ser publicador, visitas en UI (API lista), portal nuevo en producción, eliminación de cuenta.

## V · Funcionalidades que faltan (frente al PRD)

| Área | Falta |
|---|---|
| Roles | SUPER_ADMIN, permisos desacoplados, operaciones backend de elevación |
| Publicador | `publisherApplications`, verificación, acuerdos, perfil público, rendimiento agregado |
| Propiedades | revisiones, `publisher_id`, documentos privados, verificación de titularidad, retiro |
| Leads | modelo único, atribución, asignación, seguimiento, dedupe central |
| Visitas | UI (portal y admin), y corregir el «asesor» (CIT-01) |
| Ofertas / Operaciones / Colaboración | nada |
| Comisiones | reglas, propuestas versionadas, ledger, pagos |
| Jurídico | documentos versionados, aceptaciones con evidencia, casos |
| Configuración | `businessConfig`, `systemConfigs`, feature flags |
| Integridad | checks automáticos |
| Marketing Hub | todo (contenido, plantillas, calendario, assets, UTM, campañas, Meta, IA) |
| Cuenta | eliminación/anonimización con retención |
| Notificaciones | centro unificado (hoy: campana del admin + correos sueltos) |

## W · Código duplicado

- Paneles: `/dashboard` (viejo) convive con `/admin` y con `/portal` (nuevo).
- Leads: tres tablas y tres rutas (`registro-lead`, `contacto`, `leads`).
- Formateo de precio y datos de propiedad repetido en `PropertyCard`, ficha, admin y portal.
- Número de WhatsApp de respaldo `524778116501` escrito a mano en varios componentes.

## X · Deuda técnica

- 73 errores de ESLint en archivos antiguos (`dashboard`, `privacidad`, `terminos`, componentes de efectos). El código nuevo pasa limpio.
- `lib/firestore.ts` muerto; `seed-sanjuan.*` y respaldos JSON de fotos en la raíz y en `scripts/`.
- Sin capa de servicio para propiedades; consultas repetidas en rutas.
- Sin TanStack Query (estados de carga hechos a mano en cada pantalla).
- El rol se guarda en `usuarios.rol` y también se deduce de `ADMIN_EMAILS`.

## Y · Riesgos de migración

| Riesgo | Mitigación |
|---|---|
| Base de producción usada en desarrollo | Crear entorno de staging (rama de Supabase o proyecto aparte) antes de migraciones grandes; hasta entonces, pruebas con PGlite y punta a punta con limpieza. |
| Código sin respaldo remoto | Subir `nextjs-migration` a GitHub (pendiente C, requiere `gh auth login` del usuario). |
| Revisiones de propiedad sobre datos vivos | Migración que crea la revisión 1 de cada propiedad **copiando**, sin borrar columnas; la ficha pública pasa a leer una vista; dry run en PGlite. |
| URLs indexadas | No cambiar `/propiedades/[slug]`; slugs de relleno sólo con 301. |
| Cambiar el consentimiento | Nueva versión de texto (no editar la vigente); requiere revisión jurídica. |
| Quitar el WhatsApp del publicador | Decidir qué número público usa cada propiedad (D-02) antes de tocar la ficha. |
| Correos reales | Toda prueba de correo con `RESEND_API_KEY` vacía (como en la fase 2 de citas). |
