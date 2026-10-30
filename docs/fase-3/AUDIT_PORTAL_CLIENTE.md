# Fase 3 · Portal de Cliente — AUDIT

- **Fecha:** 19-sep-2026 · **Versión en producción:** V-1.1.81 · **Flag `portalCliente`:** APAGADO (`/portal` → 404)
- **Alcance:** sólo auditoría. No se modificó código ni producción.
- **Fuentes:** código (`src/app/portal`, `src/components/portal`, `src/lib/portal`, `/dashboard`, `/mi-cuenta`, APIs de cliente), base de producción (sólo lectura, conteos), mockups `design/references/05-portal-inicio.webp` y `06-portal-mis-visitas.webp`, DECISIONS (D-06, D-09, D-19, D-20), IMPLEMENTATION_PLAN fase 3.

## 0 · Lo que ya existe (commit `d95799e` + fases 1–2)

| Pieza | Estado |
|---|---|
| `PortalShell` (sesión, Google, estados) · `BarraLateralPortal` (menú D-06) · `BarraSuperiorPortal` (buscador, perfil, `SidebarTrigger` en móvil) | hecho, sin publicar |
| Inicio `/portal` (mockup 05) con `GET /api/portal/resumen` + `lib/portal/resumen.ts` / `tarjeta.ts` | hecho, sin publicar; **sin pruebas** |
| Flag `portalCliente` (migración 19) que cierra página y API | hecho |
| **Rutas del menú:** 10 enlaces | **sólo 1 existe** (`/portal`); las otras 9 darían 404 |

## 1 · Separación CLIENTE vs PUBLICADOR
- El portal admite cualquier cuenta; al publicador se le suma «Mis anuncios» (`/publicador`) y al admin «Panel de administración», con el catálogo de permisos (V-1.1.80). ✔
- El contenido es de cliente: lo del publicador vive en `/publicador` (fase 4). ~~flag `publisherPortal`~~ **Enmienda (13-oct-2026):** `/publicador` NO depende del flag `publisherPortal`; ese flag existe pero ningún código lo lee, así que encenderlo no abre ni cierra nada (ADR-0013 y «Revisión de flags (3-oct-2026)» en DECISIONS.md). ✔
- «Mi propiedad (Vender / Rentar)» = entrada a la **solicitud de publicador** (D-06). Hoy existe `QuieroPublicar` (manda un lead por `/api/registro-lead`, no da el rol). Se reutiliza hasta la fase 4. ✔
- ⚠ `/mi-cuenta` sirve a los tres papeles (campos de cliente y de publicador en la misma pantalla; `?motivo=publicar` lo usa el asistente).

## 2 · Datos reales disponibles (producción, 19-sep)
| Tabla | Filas | Uso en el portal |
|---|---|---|
| `usuarios` | 3 | perfil, «Mi búsqueda» (`busca_*`, arrays de la migración 16) |
| `favoritos` | **0** | Guardadas |
| `busquedas_guardadas` | 1 | Mis búsquedas; columna `alertas` **sin uso** |
| `solicitudes_contacto` | **0** | Mis consultas |
| `citas` | **0** | Mis visitas |
| `propiedades` publicadas | 7 | Para ti, coincidencias |
| `eventos` | 61 | **ninguno con `uid`** (41 búsquedas, 20 vistas de ficha, anónimos) |

→ El portal abrirá casi vacío: los **estados vacíos** son tan importantes como los llenos (el Inicio ya los tiene).

## 3 · Propiedades guardadas
- API `GET/POST /api/favoritos` (alterna guardar/quitar). Componente `MisFavoritos` en `/dashboard`. ✔ reutilizable.
- ⚠ La API usa `verifyIdToken` suelto: **no revisa si la cuenta está suspendida** (no pasa por `exigir`).
- **Sub-vistas del mockup:** «Guardadas» ✔ (datos reales). «Me interesan» ⚠ no existe como dato; lo más fiel con datos reales = propiedades sobre las que pidió informes o visita. «Por revisar» ✖ **no hay dato**: las vistas de ficha no guardan quién las vio.

## 4 · Búsquedas guardadas
- API `GET/POST/DELETE /api/busquedas` + `lib/busquedas.ts` (`coincide`, `describir`, `aHref`, 23 pruebas) + `MisBusquedas`. ✔
- ⚠ Misma falta de chequeo de suspensión que favoritos.

## 5 · Alertas
- **No hay alertas para clientes.** `/api/alertas/resumen` es el parte diario interno del equipo (cron + secreto), no del cliente.
- Lo único real: «nuevas coincidencias» calculadas en el Inicio (`nuevasCoincidencias`: publicadas después de guardar la búsqueda).
- No se manda nada por correo. El mockup dice «Te avisaremos cuando haya nuevas propiedades…»: **no se puede prometer** (el Inicio ya lo omite).

## 6 · Solicitudes / contacto
- `solicitudes_contacto` (con cuenta, vía `/api/contacto`, V-1.1.77 → avisa a VIVE BIEN) y `leads` (formularios anónimos). Resumen del portal lee sólo `id, propiedad_id, propiedad_titulo, tipo, creado_en`. ✔
- ⚠ **`GET /api/contacto` devuelve `select('*')` al cliente:** incluye `owner_id` (atribución interna, ADR-0006) y `whatsapp_estado/_id/_error` (operación interna). No es PII de un tercero, pero es dato interno expuesto.
- Estados de seguimiento («Recibida», «En revisión» del mockup): **no existen** → sólo «Enviada» + fecha (el seguimiento es de la fase 7, Leads).

## 7 · Valuador
- Página pública `/valuador`; registra un lead. Rangos por m² **escritos en el código** (pendiente 19 «precios en base»; su fuente no está documentada). En el portal: enlace (D-06). No se toca el cálculo en esta fase.

## 8 · Perfil
- `/mi-cuenta` + `PATCH /api/usuarios/me` (`CAMPOS_EDITABLES`, completitud, foto con **subida firmada** V-1.1.78). ✔ reutilizable.
- ⚠ Duplicidad: `/mi-cuenta` usa `busca_zona`/`busca_tipo` (una) y el portal `busca_zonas`/`busca_tipos` (varias). Unificar en el portal.

## 9 · Configuración
- **No existe.** No hay preferencias de notificación; la contraseña vive en Firebase (se cambia desde su flujo). `busquedas_guardadas.alertas` sin uso.
- Mínimo honesto: correo (sólo lectura), método de acceso, cerrar sesión, y la solicitud de eliminación (punto 10).

## 10 · Solicitud de eliminación de cuenta
- **No existe nada** (sólo el texto ARCO del aviso de privacidad).
- PRD §9 / prompt §19: marcar la solicitud, retirar publicaciones, no borrar lo que debe conservarse. **Textos y plazos: abogado (D-19).**
- Implementable sin inventar reglas: registrar la **solicitud** (fecha, motivo opcional), avisar a VIVE BIEN y mostrar «recibida»; la baja efectiva la ejecuta una persona tras revisión. Requiere una migración (tabla o estado nuevo).

## 11 · Redirecciones `/dashboard` y `/mi-cuenta`
- `/dashboard` hace **tres trabajos**: (a) **página de entrada y registro con correo** (el `Header` y el propio portal enlazan ahí), (b) casa de cliente/publicador, (c) panel clásico `?clasico=1` del admin. → **No se puede redirigir entero**: sólo la parte (b) cuando hay sesión.
- `/mi-cuenta` la usan los tres papeles y el asistente con `?motivo=publicar` → la redirección debe **conservar la consulta**.
- ⚠ **Enlaces rotos latentes:** los correos y la página de acción de citas (`lib/citas/enviar.ts`, `servicio.ts`, `AccionCita.tsx`) mandan a `/portal/visitas`, que no existe y además está tras el flag. Hoy 0 citas y ninguna pantalla agenda, así que nadie lo ha sufrido.
- Enlaces a `/dashboard` en 9 archivos; a `/mi-cuenta` en 6. Son rutas privadas: sin impacto SEO.

## 12 · Seguridad y autorización en servidor
- `/api/portal/resumen`: flag + `exigir('cuenta.propia')`; cada parte filtrada por `uid`. ✔
- ⚠ `favoritos` y `busquedas`: sin `exigir` (suspendidos siguen escribiendo). A migrar.
- ⚠ Las páginas nuevas del portal necesitan cada una su API con `exigir` + filtro por `uid`; ninguna lectura directa desde el navegador.
- ⚠ **El flag se lee de la base de producción**: para probar en local no se puede encender (abriría producción). Hace falta un modo de prueba local que no toque la base.

## 13 · No exposición de leads / PII
- Propiedades en el portal: sólo columnas públicas (`COLUMNAS_PROPIEDAD_PORTAL`, sin `owner_id`). ✔
- Citas: el cliente ve sus datos y **sólo el nombre** del asesor; notas internas y Google, sólo el equipo (`recortar`). ✔
- ⚠ `GET /api/contacto` (punto 6).

## 14 · Responsive (escritorio / tableta / móvil)
- Carcasa con `Sidebar` de shadcn: en móvil es cajón con `SidebarTrigger`. 30 clases responsivas en portal. **Nunca se ha verificado visualmente** (no se desplegó).
- ⚠ Verificar requiere sesión iniciada; yo no puedo crear cuentas ni entrar con las tuyas → hace falta un **arnés de vista previa local con datos de prueba** (sólo desarrollo) y, al final, tu revisión con tu sesión real.

## 15 · SEO / noindex
- `/portal`, `/dashboard`, `/mi-cuenta`, `/admin`, `/citas/accion`: `noindex, nofollow`. ✔ Sitemap sin rutas privadas. ✔
- ⚠ `robots.txt` no incluye `/portal` ni `/citas` (el meta basta para no indexar, pero `Disallow` evita el rastreo).

## 16 · Qué se reutiliza
Carcasa y menú del portal · `resumen.ts`/`tarjeta.ts`/`TarjetaPropiedad` · `lib/busquedas` · APIs de favoritos, búsquedas, citas (`listAppointments` vista cliente, `recortar`, `AppointmentStatus`) · formulario y reglas de `/mi-cuenta` (`CAMPOS_EDITABLES`, completitud) · `subirImagen` (firmada) · `QuieroPublicar` · `Consentimiento` · flags (`flagEncendido`) · catálogo de permisos · FullCalendar (instalado, sin pantalla aún).

## Hallazgos por severidad
| # | Sev. | Hallazgo |
|---|---|---|
| P3-01 | HIGH | Correos de citas enlazan a `/portal/visitas` (inexistente y tras flag) — latente · **✅ V-1.1.82** |
| P3-02 | MEDIUM | `GET /api/contacto` devuelve `select('*')` al cliente (`owner_id`, estado interno de WhatsApp) · **✅ V-1.1.82** |
| P3-03 | MEDIUM | `favoritos` / `busquedas` sin `exigir` (cuentas suspendidas escriben) · **✅ V-1.1.82** |
| P3-04 | MEDIUM | 9 de 10 rutas del menú del portal no existen · ⏳ fase 3b |
| P3-05 | MEDIUM | Lógica del Inicio sin pruebas · **✅ V-1.1.82** |
| P3-06 | LOW | `robots.txt` sin `/portal` ni `/citas` · **✅ V-1.1.82** |
| P3-07 | LOW | Doble modelo de «lo que busca» (`/mi-cuenta` una zona; portal varias) · **✅ V-1.1.82 + migración 22** |
| P3-08 | INFO | «Por revisar» sin dato; «Me interesan» y estados de consulta sin modelo; alertas sólo dentro del portal |
| P3-09 | INFO | Verificación visual necesita arnés local (sin cuentas nuevas) y flag por etapas |

## Decisiones que hacen falta antes de implementar
1. **«Por revisar»**: ¿se oculta, o se empieza a registrar qué fichas ve cada cliente con sesión (dato nuevo → revisar aviso de privacidad)?
2. **«Me interesan»**: ¿= propiedades sobre las que pidió informes o visita?
3. **Alertas**: ¿sólo dentro del portal por ahora (el correo, más adelante con consentimiento y baja)?
4. **Eliminación de cuenta**: ¿como *solicitud* revisada por una persona, con textos en BORRADOR hasta el abogado?
5. **Apertura por etapas**: ¿primero sólo para Super Admin/admin en producción (para que lo revises con tu sesión), luego para todos?
