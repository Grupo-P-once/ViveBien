# Fase 3b · Portal de Cliente — PLAN

- **Fecha:** 22-sep-2026 · **Base:** `docs/fase-3/AUDIT_3B.md` (hallazgos H-01…H-16) · **Producción:** V-1.1.84.
- **Regla de toda la fase:** los tres flags siguen **apagados** en cada despliegue. El portal se abre en 3c, por etapas (D-27.5), y sólo después de tu revisión visual.
- **Requisito para abrir (D-33):** antes de encender `portalClienteInterno` para personas reales, volver a medir en producción listado, ficha, imágenes y navegación, y fijar objetivos. Medición del 22-sep: listado ≈5.9 s, ficha ≈4.8 s, y las tarjetas no vienen en el HTML. No bloquea 3b-2 ni 3b-3; bloquea 3c.
- **Nada de:** CRM, funciones de publicador dentro del portal de cliente, agenda/calendario, correos de alertas, Firestore. Postgres es la fuente de verdad.
- **Esperando aprobación:** D-28.1…D-28.8. Tabla ampliada de cada una en **`docs/fase-3/DECISIONES_3B.md`**.
- **Ya aprobado (22-sep):** D-28.10 (tableta), **D-31** (pantalla de flags para Super Admin) y **D-32** (criterios de cierre: *No Silent Data Loss*, nada de «Próximamente», una sola verdad por dato, sin CTA de visita con `citasEnLinea` apagado, tres tamaños medidos, y 3b no termina por tener rutas sino por comportarse bien).

## Entregas
| Entrega | Contenido | Migración |
|---|---|---|
| **V-1.1.85 · 3b-1** ✅ | Base y arreglos del Inicio · Guardadas · Mis búsquedas · Alertas · Mis consultas · encendido auditado de flags | **24** ✅ aplicada |
| **V-1.1.86 · 3b-2** ✅ | Me interesan · Mis visitas (lista) · Valuador (enlace) · Mi perfil · Mi búsqueda · Configuración | — |
| **V-1.1.87 · 3b-3** | Solicitud de eliminación (cliente + cola del admin) · «Mi propiedad» | **25** (aditiva) |

Después, fuera de 3b: **V-1.1.88** pantalla de acceso nueva (03.07) y **V-1.1.89** «Mi perfil» por rol (03.08). La apertura del portal es 3c.

## 3b-1 · Base, arreglos y las cuatro primeras pantallas (V-1.1.85)

**Arreglos que no pueden esperar** (H-03, H-04, H-09, H-10):
1. `citasEnLinea` viaja en el resumen y el Inicio **esconde** «Solicitar visita» mientras esté apagado.
2. Fuera «Por revisar» del menú (D-27.1); queda anotado como pendiente.
3. «Para ti» a 3 columnas desde 768 px (`md:grid-cols-3`) y capturas nuevas a 834.
4. `precio_incluye_iva` en `COLUMNAS_PROPIEDAD_PORTAL` y en la tarjeta del portal, para que diga lo mismo que la pública.

**Encendido auditado de flags** (H-02): pantalla mínima de Super Admin (lista de flags, interruptor, `exigir('configuracion.flags')`, escritura en `configuracion` y fila en `audit_logs`). Es lo que permite abrir el portal sin editar la base a mano. *Si prefieres dejarlo manual, dilo y lo cambio por un procedimiento documentado.*

**Patrón común** (H-14): esqueleto → datos | vacío | error con «Reintentar», y una cabecera igual en las nueve pantallas. Todas las rutas nuevas pasan por `exigirPortal`.

**Pantallas:**
- **Guardadas** (H-07): `GET /api/portal/guardadas` devuelve **tarjetas** (DTO existente) ordenadas por fecha de guardado; quitar guarda desde la tarjeta; una guardada que se pausó o se vendió se ve como «ya no disponible» en vez de desaparecer. Vacío: «Todavía no guardas ninguna» + enlace al buscador.
- **Mis búsquedas**: lista con su descripción legible (`lib/busquedas`), cuántas coinciden hoy y cuántas son nuevas (calculado en el servidor), abrir en el buscador, renombrar, borrar.
- **Alertas** (H-06): lo nuevo por búsqueda desde la última revisión; **migración 24** añade la marca (`revisadas_en`); al abrir, lo visto deja de contar. Sin correos: el texto lo dice claro.
- **Mis consultas**: las del cliente con el DTO de 3a (`aConsultaCliente`) y la tarjeta pública de la propiedad. Estado único: «Enviada» + fecha (el seguimiento es fase 7).

**Migración 24** (aditiva): marca de revisión de alertas. Con respaldo, ensayo en PGlite, ensayo en producción dentro de transacción revertida, evidencia antes/después y archivo `REVERTIR`.

**Depende de:** D-28.2 (alertas por búsqueda o global), D-28.7 (axe), D-28.10 (tableta) y la decisión sobre H-02.

## 3b-2 · Las pantallas de la cuenta (V-1.1.86) — PLAN DETALLADO

Base: `docs/fase-3/AUDIT_3B2.md` (hallazgos J-01…J-08). Orden de trabajo, un commit por bloque:

**1. Que nada se guarde en silencio (J-01, D-32).** `PATCH /api/usuarios/me` devuelve el **perfil ya guardado**
(el mismo DTO que lee el portal), no sólo `{ok}`. Las dos pantallas que escriben pintan esa respuesta. Prueba:
mandar `«Casa», «CASA», « casa »` y ver `['casa']` **en pantalla**; mandar un campo inexistente y que se diga.

**2. Mi perfil** (`/portal/perfil`). Nombre, teléfono, WhatsApp y foto (subida firmada). **Sin** campos de
publicador y **sin** asistente por pasos. Completitud como ayuda, no como regaño. `/mi-cuenta` no se toca.

**3. Mi búsqueda** (`/portal/mi-busqueda`). El modelo único de 3a: operación, varias zonas, varios tipos y
presupuesto máximo. Guarda y enseña lo guardado (misma regla del punto 1).

**4. Me interesan** (J-02, `?vista=me-interesan`). `GET /api/portal/me-interesan`: une
`solicitudes_contacto` + `citas` del cliente por `propiedad_id`; por cada propiedad, qué pidió y cuándo. Nada de
`leads` (D-28.1 = A). Misma rejilla que Guardadas; vacío honesto.

**5. Mis visitas** (J-03, `/portal/visitas`). Lista, **sólo lectura** (D-28.3 = A), con el DTO recortado que ya
existe (del asesor sólo el nombre). Con `citasEnLinea` apagado: se explica que agendar en línea aún no está
disponible, **sin botón**. Al existir, `VISITAS_TIENEN_PANTALLA = true` y el Inicio vuelve a enlazar.

**6. Configuración** (J-06, `/portal/configuracion`). Correo (sólo lectura), método de acceso, cerrar sesión,
aviso de privacidad y —sólo para cuentas con contraseña— «cambiar contraseña» por correo de Firebase
(D-28.4 = A). Sin interruptores falsos. La entrada a eliminación llega en 3b-3.

**7. Menú y cierre.** Valuador como enlace a `/valuador` (J-04); «Me interesan» vuelve al grupo **Propiedades**;
las rutas nuevas entran en `lib/portal/rutas.ts` (la prueba comprueba que cada una tiene su página).

**Sin migraciones.** Todo sale de tablas y columnas que ya existen.

**Comprobaciones:** suite + typecheck + lint sin errores nuevos + build + CI antes de desplegar; aislamiento A/B
extendido a las rutas nuevas; capturas medidas de las 5 pantallas × 3 casos × 3 tamaños con axe; en producción,
con los flags apagados, todo en 404.

### Contenido (resumen)

- **Me interesan** (H-05): `solicitudes_contacto` + `citas` del cliente agrupadas por propiedad, con qué pidió y cuándo. Nunca vistas de página; nunca leads anónimos sin decisión previa (D-28.1).
- **Mis visitas**: **lista** (no calendario) con `listAppointments` y `recortar` —del asesor sólo el nombre—. Con `citasEnLinea` apagado: sólo lectura y aviso de que agendar en línea aún no está disponible (D-28.3).
- **Valuador** (H-08): enlace a `/valuador`. No se toca el cálculo.
- **Mi perfil** (H-16): datos de contacto y foto (subida firmada), reutilizando `CAMPOS_EDITABLES` y la completitud, **sin** el asistente por pasos y **sin** campos de publicador. No se toca `/mi-cuenta` (eso es 03.08).
- **Mi búsqueda**: el modelo único de 3a (operación, varias zonas, varios tipos, presupuesto máximo).
- **Configuración**: correo (sólo lectura), método de acceso, cerrar sesión, aviso de privacidad y la entrada a la solicitud de eliminación. **Sin interruptores de notificación falsos**. «Cambiar contraseña» sólo si se aprueba (D-28.4) y sólo para cuentas con correo.

**Depende de:** D-28.1, D-28.3, D-28.4.

## 3b-3 · Eliminación y «Mi propiedad» (V-1.1.87)

- **Solicitud de eliminación** (H-11): **migración 25** (tabla propia con estado y motivo opcional), API del cliente (crear, ver estado, cancelar si se aprueba), acuse honesto en pantalla, **cola de revisión en el admin** con estados y bitácora, y el procedimiento de baja escrito (qué se conserva por obligación, qué se anonimiza). Textos **DRAFT** hasta el abogado (D-19). Borrar la cuenta de Firebase Auth queda **fuera**: hoy no hay cuenta de servicio.
- **«Mi propiedad»** (H-12): sólo la solicitud para convertirse en publicador, **con la cuenta**, sin duplicados y sin otorgar permisos. Reutiliza el lead hasta la fase 4 (D-28.6).

**Depende de:** D-28.5, D-28.6, D-19.

## Criterios de cierre (D-32, aprobados)
- **No Silent Data Loss:** cada formulario guarda y devuelve el dato guardado, o falla diciéndolo. Prueba por pantalla.
- Ninguna pantalla «Próximamente»; ningún CTA de visita con `citasEnLinea` apagado (con prueba).
- El portal y la web pública nunca se contradicen sobre el mismo dato.
- Comprobación visual **medida** a 1440×834, 834×1194 y 390×844.

## Comprobaciones de cada entrega
- Suite completa, `tsc`, lint sin errores nuevos, `next build`, CI verde **antes** de desplegar.
- Migraciones con el ciclo completo (respaldo → ensayo PGlite → ensayo revertido en producción → aplicar → verificar → evidencia → `REVERTIR`).
- Vista previa local con datos de prueba: cada pantalla × 3 casos (llena, vacía, suspendida) × 3 tamaños (1440/834/390), sin intentos de tocar datos reales, sin desborde horizontal, y `axe` sin violaciones graves si se aprueba D-28.7.
- Tras desplegar, con los flags apagados: `/portal/*` y `/api/portal/*` → 404, APIs privadas → 401, suspendidos → 403, páginas públicas normales, `robots.txt` correcto.
- Aislamiento: pruebas de que una sesión no ve nada de otra (favoritos, búsquedas, consultas, visitas, eliminación).

## Decisiones pendientes (D-28)
| # | Decisión | Recomendación |
|---|---|---|
| 28.1 | «Me interesan» con leads anónimos por correo | No |
| 28.2 | Alertas vistas por búsqueda o global | Por búsqueda |
| 28.3 | «Mis visitas» sólo lectura o con acciones | Sólo lectura en 3b |
| 28.4 | «Cambiar contraseña» en Configuración | Sí, cuentas con correo |
| 28.5 | Eliminación: aviso al equipo, cancelación, Firebase, plazos | Plazos: abogado (D-19) |
| 28.6 | «Mi propiedad»: reutilizar el lead hasta la fase 4 | Sí |
| 28.7 | `@axe-core/playwright` como dependencia de desarrollo | Sí |
| 28.8 | Quitar Firestore del arranque y borrar lo obsoleto | Sí (decisión del dueño) |
| 28.9 | ~~Acceso con Google~~ | ✅ **Resuelto en V-1.1.83** |
| 28.10 | «Para ti» en tableta: 3 columnas desde 768 px | Sí |
| **nuevo** | **H-02:** ¿pantalla de flags para Super Admin en 3b-1, o encendido manual documentado? | Pantalla (queda auditado) |
