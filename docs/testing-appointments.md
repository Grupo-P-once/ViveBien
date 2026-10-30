# Pruebas de citas

> Regla de siempre: **el servidor local usa la base de PRODUCCIÓN**. Las pruebas automáticas no tocan datos reales; la única excepción es la prueba de punta a punta (§5), que crea una cita marcada como prueba y la borra con su historial al terminar.

## 1 · Pruebas unitarias (Vitest)

| Archivo | Qué comprueba | Estado |
|---|---|---|
| `tests/citas.test.ts` | Hora de León (sin depender de la zona del equipo), horarios libres (horario semanal, margen, anticipación, ventana, bloqueos, visitas del cliente), reglas de estado, lo que ve cada papel | ✅ fase 1 |
| `tests/citas-db.test.ts` | La migración 15 en Postgres real (PGlite): sin empalmes, idempotencia, concurrencia, versiones, historial, revocación de enlaces, permisos de `anon`/`authenticated`, y **paridad**: las 800 combinaciones estado × acción × papel × pasada/futura dan lo mismo en `estados.ts` y en `cita_transicionar` | ✅ fase 1 |
| Tokens, correos, `.ics` | Generación y hash de enlaces, claves de idempotencia, escape de HTML, `UID`/`SEQUENCE` | fase 2 |
| KPIs del calendario admin | Conteos por estado y comparación honesta con el mes anterior | fase 5 |

## 2 · Pruebas de base de datos (restricciones reales)

Lo que sólo Postgres puede probar: exclusión sin empalmes, versión, función de transición.

Opciones (se eligió la C):

| Opción | Costo | Riesgo |
|---|---|---|
| **A · Rama de Supabase** (copia vacía con las migraciones) | Tiene costo por hora mientras existe | Ninguno para producción |
| **B · Transacción que siempre termina en `ROLLBACK`** sobre producción | Gratis | No deja filas, pero sí se ejecuta en producción. Sólo con tu permiso. |
| **C · Postgres local con PGlite** — **elegida**: incluye `btree_gist`; `tests/citas-db.test.ts` | Gratis | Ninguno |

Casos:

- Dos citas del mismo asesor que se empalman (con margen) → la segunda falla con `23P01`.
- Una cancelada no bloquea el horario.
- Dos peticiones **simultáneas** por el mismo horario → exactamente una entra.
- Transición con versión vieja → falla sin cambiar nada.
- Cada transición deja su fila en `citas_eventos` y revoca los tokens.
- `anon` y `authenticated` no pueden leer ninguna tabla de citas.

## 3 · Pruebas de la API

Con Vitest, llamando a los manejadores de ruta con el servicio simulado:

- Sin sesión → 401. Cliente sobre cita ajena → 404 (no se revela que existe).
- `Idempotency-Key` repetida → la misma cita.
- Error `23P01` → 409 "Ese horario se acaba de ocupar".
- Enlace de correo: se usa una vez; segundo uso → "ya se usó"; vencido; de otra versión.
- `/api/citas/tareas` sin el secreto → 401.
- Google y Resend simulados: si fallan, la cita se guarda igual y queda `google_sync = 'error'` / correo `error`.

## 4 · Capturas visuales (Playwright)

Mismo método que el panel admin (`tests-visual/ayudas-panel.ts`): sesión simulada, **todas** las llamadas a `/api/**` cortadas salvo las contestadas con datos fijos, hora congelada, teselas grises. Tres tamaños: escritorio 1440, tableta 768, móvil 390.

Las capturas que pide el encargo:

| Archivo | Pantalla |
|---|---|
| `admin-calendar.png` | `/admin/calendario` |
| `client-calendar.png` | `/portal/visitas` |
| `publisher-calendar.png` | Visitas del publicador |
| `appointment-detail.png` | Drawer de detalle abierto |
| `schedule-visit.png` | Formulario "Agendar visita" con horarios |
| `reschedule.png` | Diálogo "Proponer otro horario" |
| `cancel.png` | Diálogo "Cancelar visita" |
| `email-confirmation.png` | Página del enlace de confirmación (antes de pulsar) |

Además: portal Inicio y cada página nueva del portal.

- Datos de prueba en `tests-visual/datos-citas.ts`, con el comentario **"DATOS FICTICIOS — sólo para capturas"**. Pueden parecerse al mockup (Nave Industrial San Juan Bosco, etc.) pero nunca se escriben en la base.
- El sitio público debe salir idéntico (las capturas existentes siguen pasando).

## 5 · Punta a punta contra la base real

Antes de cada deploy que toque el servicio: una prueba temporal llama al servicio con la base real (sin pasar por la sesión), crea **una** cita en una propiedad publicada marcada "PRUEBA AUTOMÁTICA", la recorre (cuenta inexistente rechazada, publicador ajeno rechazado, horario no ofrecido rechazado, misma clave = misma cita, confirmar, doble clic, versión vieja, proponer, aceptar, listas por papel, cancelar) y al terminar **borra la cita y su historial**. Se comprueba después que `citas` y `citas_eventos` quedan en 0 filas de prueba. Hecha el 18-sep-2026 (fase 1): encontró un error real (repetir la misma solicitud contestaba «horario ocupado») que ya está corregido.

## 6 · Prueba manual en producción (con tu sesión)

Tras cada deploy, contigo:

1. Pedir una visita como cliente → te llega el correo, el admin la ve en el calendario.
2. Confirmar desde el correo → abrir no confirma; pulsar sí.
3. Proponer otro horario, aceptarlo, cancelarla.
4. Si Google está conectado: el evento aparece, cambia y se borra.
5. **Limpieza:** las citas de prueba se cancelan (no se borran) y se marcan en `notas_internas` como "prueba"; el panel puede filtrarlas.

## 7 · Antes de cada deploy

`npx vitest run` · `npx tsc --noEmit` · `npx eslint` · `npx next build` (no `rtk next build`, que no compila) · capturas Playwright · auditoría SEO (0 errores) · después del deploy: rutas nuevas 200, APIs de citas 401 sin sesión.
