# Fase 3b-2 · Las pantallas de la cuenta — AUDIT

- **Fecha:** 22-sep-2026 · **Producción:** V-1.1.85 (3b-1 cerrada) · **Flags:** los tres **apagados**.
- **Alcance:** sólo lectura. Lo que entra en 3b-2 (aprobado): **Me interesan · Mis visitas (lista) · Valuador (enlace) · Mi perfil · Mi búsqueda · Configuración**.
- **Decisiones que ya mandan:** D-28.1 = A (sólo lo ligado a la cuenta) · D-28.3 = A (visitas sólo lectura) · D-28.4 = A (restablecer contraseña por correo de Firebase, sólo cuentas con contraseña) · D-32 (No Silent Data Loss, nada de «Próximamente», una sola verdad por dato) · D-33 (rendimiento bloquea 3c, no 3b).

## Lo que ya existe y se reutiliza

| Pieza | Estado | Dónde |
|---|---|---|
| Patrón de pantalla (esqueleto → datos \| vacío \| error) | ✅ 3b-1 | `components/portal/Pantalla.tsx` |
| Única verdad de qué pantallas existen (el menú sólo enseña esas) | ✅ 3b-1 | `lib/portal/rutas.ts` |
| Tarjeta de propiedad del portal (con IVA) | ✅ | `lib/portal/tarjeta.ts` |
| DTO de consulta del cliente | ✅ 3a | `lib/consultas.ts` |
| Citas: lectura por cliente, vista recortada, estados | ✅ | `lib/citas/servicio.ts:274` (`eq('cliente_uid', perfil.uid)`), `lib/citas/vista.ts:99` (`recortar`), `components/citas/AppointmentStatus` |
| «Qué estoy buscando», modelo único | ✅ 3a | `lib/cliente/busqueda.ts` |
| Perfil: campos, completitud, foto firmada | ✅ | `lib/perfil.ts`, `lib/medios/subir.ts` |

## Hallazgos

### J-01 · El perfil se guarda sin devolver lo guardado · **P0 (D-32)**
- **Evidencia:** `PATCH /api/usuarios/me` responde `{ ok, completitud, faltantes }` (`route.ts`, final del PATCH). No devuelve los valores.
- **Hoy:** la pantalla enseña lo que se escribió, no lo que quedó en la base. Y los valores se **normalizan** al guardar (zonas limpias y sin repetir, tipos traducidos a clave, presupuesto convertido): si algo se corrige o se descarta, nadie se entera. Es exactamente el caso del `precio_incluye_iva`.
- **Esperado:** la respuesta trae la fila guardada (el mismo DTO que lee el portal) y la pantalla pinta **eso**.
- **Dependencia:** ninguna.
- **Solución:** 3b-2 — el PATCH devuelve `perfil` ya guardado; Mi perfil y Mi búsqueda pintan la respuesta; prueba de que escribir «Casa, CASA, casa » deja `['casa']` **en pantalla**, no sólo en la base.

### J-02 · «Me interesan» no tiene de dónde salir todavía · **P1**
- **Evidencia:** no hay ruta ni consulta. Lo ligado a la cuenta: `solicitudes_contacto.cliente_uid` y `citas.cliente_uid`. `leads` no tiene `uid` (D-28.1 = A: no se usan).
- **Hoy:** la vista `?vista=me-interesan` responde 404 a propósito (3b-1).
- **Esperado:** las propiedades sobre las que **pidió informes o visita con su cuenta**, agrupadas por propiedad, con qué pidió y cuándo. Sin vistas de página, sin adivinar por correo.
- **Dependencia:** D-28.1 (decidida).
- **Solución:** 3b-2 — `GET /api/portal/me-interesan` que une consultas y citas por `propiedad_id`; la pantalla comparte rejilla con Guardadas.

### J-03 · «Mis visitas» existe como dato pero no como pantalla · **P1**
- **Evidencia:** `GET /api/citas` ya filtra por cliente y recorta (del asesor sólo el nombre); `VISITAS_TIENEN_PANTALLA = false` en `lib/citas/enlaces.ts` mantiene el enlace oculto.
- **Hoy:** en producción hay **0 citas**; el Inicio no enlaza a visitas.
- **Esperado:** lista (no calendario), sólo lectura (D-28.3), con estado y fecha; con `citasEnLinea` apagado se dice que agendar en línea todavía no está disponible **sin** ofrecer botón.
- **Dependencia:** crear pantalla y poner `VISITAS_TIENEN_PANTALLA = true` + añadirla a `rutas.ts`.
- **Solución:** 3b-2 — `/portal/visitas` con el DTO existente. Nada de acciones.

### J-04 · El Valuador sigue fuera del menú · **P1 (H-08)**
- **Evidencia:** `BarraLateralPortal.tsx` no lo menciona; `/valuador` es pública y `pantallaExiste()` ya deja pasar lo que está fuera de `/portal`.
- **Esperado:** una entrada que lleve a la página pública. No se toca el cálculo (sus precios por m² siguen en código, pendiente 19).
- **Solución:** 3b-2 — una línea en el menú.

### J-05 · `/mi-cuenta` mezcla cliente y publicador, y es un asistente por pasos · **P1**
- **Evidencia:** `src/app/mi-cuenta/page.tsx` (466 líneas) distingue sólo `rol === 'publicador'`; `CAMPOS_EDITABLES` incluye campos de publicador (`inmobiliaria`, `zonas`, `biografia`).
- **Hoy:** es la única pantalla de perfil para los tres papeles.
- **Esperado en 3b-2:** `/portal/perfil` **nuevo**, con lo del cliente (nombre, teléfono, WhatsApp, foto) y **sin** campos de publicador ni asistente por pasos. `/mi-cuenta` **no se toca** (es la tarea 03.08, V-1.1.89).
- **Riesgo a vigilar:** que el servidor siga aceptando los campos de publicador de quien los tenga (no se quitan de `CAMPOS_EDITABLES`), pero que el portal del cliente **no los enseñe ni los mande**.

### J-06 · Configuración no existe, y lo que puede ofrecer es poco (a propósito) · **P1**
- **Evidencia:** no hay pantalla. Lo real disponible: correo (de la sesión), método de acceso (`user.providerData` en el navegador), cerrar sesión, aviso de privacidad. `busquedas_guardadas.alertas` sigue sin uso.
- **Esperado:** eso y nada más; **sin interruptores de notificación falsos**. «Cambiar contraseña» sólo para cuentas con contraseña (D-28.4), enviando el correo de restablecimiento de Firebase. La entrada a «solicitud de eliminación» llega en 3b-3: hasta entonces **no aparece**.
- **Dependencia:** el correo lo manda Firebase con su plantilla; personalizarla es un paso manual del dueño (no bloquea).

### J-07 · El menú crecerá cuatro entradas de golpe · **P2**
- **Evidencia:** `rutas.ts` tiene 5 pantallas; 3b-2 añade `/portal/propiedades?vista=me-interesan` (misma ruta), `/portal/visitas`, `/portal/perfil`, `/portal/mi-busqueda`, `/portal/configuracion`.
- **Esperado:** cada una entra a `PANTALLAS_DEL_PORTAL` **cuando existe**, y la prueba que compara la lista con los `page.tsx` lo vigila sola.

### J-08 · Rendimiento (D-33) · **P2 en 3b, P0 para 3c**
- Cada pantalla nueva pide su propia lista de propiedades (hasta 1000 filas) para armar tarjetas. Con 7 propiedades no se nota; **antes de abrir** hay que medirlo (D-33) y, si hace falta, pedir sólo lo que se pinta.

## Lo que NO entra en 3b-2
Solicitud de eliminación y «Mi propiedad» (3b-3) · `/mi-cuenta` (03.08) · acciones sobre citas (fase 8) · correos de alertas · cualquier función de publicador dentro del portal de cliente.

## Estado de los hallazgos tras 3b-2 (V-1.1.86, commit `8294afc`)
✅ **Resueltos:** J-01 (el perfil devuelve lo guardado y avisa de lo ignorado), J-02 (Me interesan, sólo lo ligado
a la cuenta), J-03 (Mis visitas en lista, sólo lectura), J-04 (Valuador en el menú, como enlace), J-05
(`/portal/perfil` propio, sin campos de publicador ni asistente; `/mi-cuenta` sin tocar), J-06 (Configuración
honesta, con «cambiar contraseña» sólo para cuentas con contraseña), J-07 (las nueve rutas declaradas y con
página; la prueba lo vigila).
⏳ **Pendientes:** J-08 (rendimiento — bloquea 3c por D-33, no 3b) y lo de 3b-3 (solicitud de eliminación y «Mi
propiedad»).
**Extra encontrado por axe:** el atenuado por opacidad bajaba el contraste del texto en las tarjetas no
disponibles, y el campo de archivo de la foto no tenía nombre accesible. Los dos, corregidos.
