# Fase 3b · Decisiones para aprobar, una por una

- **Fecha:** 22-sep-2026 · **Base:** `docs/fase-3/AUDIT_3B.md` · **Estado:** nada implementado.
- El texto corto de cada una vive en `docs/DECISIONS.md` (D-28) y en la tabla final de `PLAN_3B.md`. Aquí está **ampliado** con lo que hace falta para decidir: problema, opciones, recomendación, impacto técnico, impacto en la experiencia, si necesita migración y a qué bloque afecta.
- Lo que ya está aprobado (22-sep) va al final, en «Aprobado en esta ronda».

---

## D-28.1 · «Me interesan»: ¿se cuentan los leads anónimos que coinciden por correo?

- **Problema.** La pantalla debe listar propiedades con **interacción comercial real** (D-27.2). Lo que está ligado a la cuenta son `solicitudes_contacto.cliente_uid` y `citas.cliente_uid`. Los `leads` de los formularios públicos guardan `email` pero **no** `uid` ni `cliente_uid` (comprobado en la base).
- **Opciones.** (a) Sólo lo ligado a la cuenta. (b) Además, los `leads` cuyo `email` coincida con el de la cuenta. (c) Preguntar al cliente si quiere vincular esos contactos.
- **Recomendación: (a).** Un correo escrito en un formulario público no prueba identidad: cualquiera puede teclear el correo de otra persona, y con (b) esa persona vería en su portal actividad que no es suya.
- **Impacto técnico.** (a) Ninguna migración: una consulta que une dos tablas por `propiedad_id`. (b) Exigiría correo verificado, índice por `email` y abre una vía de fuga. (c) Tabla de vinculación + pantalla de confirmación.
- **Impacto UX.** (a) Quien sólo usó formularios públicos empieza con la lista vacía; el texto explica qué cuenta como interés. (b) Lista más llena, con riesgo de mostrar lo ajeno.
- **¿Migración?** (a) No · (b) No, pero sí cambio de seguridad · (c) Sí.
- **Bloque:** 3b-2.

## D-28.2 · Alertas: ¿«ya las vi» por búsqueda o global?

- **Problema.** Hoy «nuevas coincidencias» se calcula desde la fecha en que se guardó la búsqueda, así que **nunca baja**: lo que fue nuevo lo será siempre. La columna `busquedas_guardadas.alertas` existe y no la usa nadie.
- **Opciones.** (a) Marca por búsqueda (`revisadas_en` en `busquedas_guardadas`). (b) Marca global por usuario. (c) Marca por propiedad vista.
- **Recomendación: (a).** Abrir una búsqueda no debería apagar el contador de las demás.
- **Impacto técnico.** (a) Migración aditiva de una columna `timestamptz`; el contador compara `publicada_en > revisadas_en`. (b) Igual de simple pero pierde el detalle. (c) Tabla nueva y muchas más escrituras.
- **Impacto UX.** (a) «3 nuevas desde tu última revisión» por búsqueda; al abrirla, el contador se pone a cero.
- **¿Migración?** Sí — **24** (aditiva).
- **Bloque:** 3b-1.

## D-28.3 · «Mis visitas»: ¿sólo lectura o con acciones?

- **Problema.** Las citas tienen máquina de estados y acciones (confirmar, cancelar, proponer horario). Con `citasEnLinea` apagado no se puede crear ninguna, y hoy hay **0**.
- **Opciones.** (a) Sólo lectura en 3b. (b) Lectura + cancelar. (c) Lectura + cancelar + proponer otro horario.
- **Recomendación: (a)**, y decidir las acciones cuando se encienda `citasEnLinea` (fase 8).
- **Impacto técnico.** (a) Reutiliza `listAppointments` y `recortar` (del asesor sólo el nombre). (b)/(c) usan la API de acciones que ya existe, pero arrastran correos al equipo y al cliente, y reglas de aviso.
- **Impacto UX.** (a) Lista honesta con estados y sin botones que no hacen nada. (b)/(c) más control, pero prometen un sistema de citas que aún no está abierto.
- **¿Migración?** No.
- **Bloque:** 3b-2.

## D-28.4 · «Cambiar contraseña» en Configuración

- **Problema.** Quien entró con correo y contraseña no puede cambiarla desde el portal. Quien entró con Google **no tiene** contraseña que cambiar.
- **Opciones.** (a) Enlace que envía el correo de restablecimiento de Firebase, visible **sólo** si la cuenta tiene proveedor `password`. (b) Formulario dentro de la página con reautenticación. (c) Nada en 3b.
- **Recomendación: (a).** Lo hace Firebase, no inventamos nada, y respeta el método de acceso de cada quien.
- **Impacto técnico.** `sendPasswordResetEmail`; el proveedor se lee de `user.providerData`. El correo lo manda **Firebase** con su plantilla: personalizarla (remitente y textos) es un paso manual tuyo en la consola. No usa Resend.
- **Impacto UX.** A quien entra con Google se le dice «entras con Google» en vez de ofrecerle algo imposible. Encaja con el «¿Olvidaste tu contraseña?» del mockup de acceso (D-29.3).
- **¿Migración?** No.
- **Bloque:** 3b-2.

## D-28.5 · Eliminación de cuenta: alcance del procedimiento

- **Problema.** Está decidido que sea **solicitud**, no borrado inmediato (D-27.4). Falta decidir qué pasa alrededor. Hoy no existe nada: ni tabla, ni API, ni cola.
- **Sub-decisiones y recomendación.**
  1. **¿Se avisa al equipo al recibirla?** Recomendado **sí**, por el canal interno que ya existe (VIVE BIEN, nunca al publicador).
  2. **¿El cliente puede cancelar su solicitud?** Recomendado **sí**, mientras siga en «recibida».
  3. **¿Se borra la cuenta de Firebase Auth?** Recomendado **no en 3b**: hoy el servidor sólo **valida** tokens con claves públicas; borrar una cuenta exige una cuenta de servicio de Firebase que no existe. Queda como paso manual del administrador, documentado.
  4. **Plazos y textos legales:** del abogado (D-19). Hasta entonces, **DRAFT** y sin prometer fechas.
- **Impacto técnico.** Migración **25**: tabla propia (estado, motivo opcional, fechas, quién revisó), API del cliente, cola en el admin con bitácora. Nada se borra automáticamente.
- **Impacto UX.** Acuse honesto: «recibida, la revisa una persona». Sin plazos inventados.
- **¿Migración?** Sí — **25** (aditiva).
- **Bloque:** 3b-3.

## D-28.6 · «Mi propiedad»: ¿cómo se guarda la solicitud para ser publicador?

- **Problema.** Debe ser **sólo la solicitud**, sin otorgar permisos (D-06). Hoy `QuieroPublicar` manda un **lead anónimo** (`/api/registro-lead`, origen `registro`) que no queda ligado a la cuenta ni evita duplicados.
- **Opciones.** (a) Seguir con el lead, añadiéndole la cuenta. (b) Guardarla en `solicitudes_contacto` con un tipo nuevo. (c) Tabla propia de solicitudes de publicador ya en 3b.
- **Dato nuevo (comprobado hoy):** `solicitudes_contacto.tipo` tiene un CHECK que sólo admite `informacion` y `visita`, así que **(b) también necesita migración**; y `leads` no tiene ninguna columna libre donde meter el `uid`.
- **Recomendación: (a) con una columna `uid` aditiva en `leads`** (o (c) si prefieres dejar el terreno preparado para la fase 4). Lo importante: la solicitud queda ligada a la cuenta y no se duplica.
- **Impacto técnico.** Columna aditiva + comprobación de «ya tienes una en curso». Sigue sin dar rol: el alta la hace un administrador (fase 4).
- **Impacto UX.** «Ya tienes una solicitud en curso, te avisamos» en vez de mandar otra igual.
- **¿Migración?** Sí, pequeña (entra en la **25**).
- **Bloque:** 3b-3.

## D-28.7 · `@axe-core/playwright` como dependencia de desarrollo

- **Problema.** No hay comprobación automática de accesibilidad; hoy sólo se puede revisar a mano.
- **Opciones.** (a) Añadirla y pasarla en la vista previa de cada pantalla. (b) Revisión manual documentada. (c) Nada.
- **Recomendación: (a).** Es sólo desarrollo: no viaja a producción ni añade peso a la página.
- **Impacto técnico.** Una dependencia de desarrollo; el guion de capturas que ya existe la ejecuta y falla si hay violaciones graves.
- **Impacto UX.** Menos barreras con teclado y lector de pantalla, encontradas antes de publicar.
- **¿Migración?** No.
- **Bloque:** 3b-1 (y se aplica a todas las pantallas).

## D-28.8 · Quitar Firestore del arranque y retirar lo obsoleto

- **Problema.** `lib/firebase.ts` inicializa **Firestore y Storage** en cada página que importa la sesión, aunque el portal no los use; `lib/firestore.ts` no lo importa nadie; `/api/seed` (marcado OBSOLETO, sólo admin) todavía **escribe** en Firestore. La fuente de verdad es Postgres (ADR-0001).
- **Opciones.** (a) Quitar ambos del arranque, borrar `lib/firestore.ts` y retirar `/api/seed`. (b) Sólo quitarlos del arranque. (c) Dejarlo.
- **Recomendación: (a)**, pero es **tu** decisión porque retira una ruta que existió.
- **Impacto técnico.** Menos JavaScript en todas las páginas con sesión; una vía de escritura a otra base desaparece.
- **Impacto UX.** Carga algo más rápida; nada visible cambia.
- **¿Migración?** No.
- **Bloque:** 3b-1 (es independiente; puede ir en cualquiera).

## D-28.10 · «Para ti» en tableta: 3 columnas desde 768 px

- **Problema.** A 834 px la barra lateral ya está plegada (`use-mobile.ts:11`, corte en 1024) pero la rejilla sigue en 2 columnas (`InicioPortal.tsx:144`): la tercera tarjeta queda sola.
- **Opciones.** (a) `md:grid-cols-3` (desde 768 px). (b) Bajar el corte de la barra lateral a 768. (c) Dejar 2 columnas y centrar.
- **Recomendación: (a).** (b) cambiaría la navegación de todo el panel, que hoy funciona.
- **Impacto técnico.** Una clase; lo vigilan las capturas a 1440/834/390.
- **Impacto UX.** Sin tarjetas huérfanas en tableta.
- **¿Migración?** No.
- **Bloque:** 3b-1. *(Aprobada el 22-sep, se mantiene aquí por trazabilidad.)*

---

## D-31 · Feature Flags con pantalla propia (nace de H-02) — **APROBADA 22-sep**

- **Problema.** `configuracion` sólo se **lee**; no hay pantalla ni API, y el permiso `configuracion.flags` (super admin) no lo usa nadie. Abrir el portal por etapas exigiría editar SQL en Supabase. Además la fila de producción **no tiene** las claves `portalClienteInterno` ni `citasEnLinea`.
- **Decisión aprobada.** Pantalla de flags dentro del panel, **sólo Super Admin**: Configuración → Feature Flags, con estado actual, **quién** lo cambió, **cuándo**, **motivo**, auditoría, **confirmación antes de activar**, el servidor como autoridad, y ningún cliente ni admin normal puede tocarlo. Las claves existen **explícitamente** en producción (`portalClienteInterno = false`, `citasEnLinea = false`): no se depende de «si no está, es falso».
- **Impacto técnico.** API con `exigir('configuracion.flags')`, escritura en `configuracion`, fila en `audit_logs` con antes/después y motivo; el motivo pasa a ser obligatorio. `normalizarFlags` sigue siendo fail-closed como red de seguridad.
- **Impacto UX.** El portal se abre y se cierra desde el panel, con rastro de quién y por qué.
- **¿Migración?** Sí, mínima: asegurar las dos claves en la fila de `configuracion` (aditiva, dentro de la **24**).
- **Bloque:** 3b-1.

## Aprobado en esta ronda (22-sep) — no son decisiones pendientes, son reglas

1. **IVA (H-10):** entra en 3b-1. Una sola fuente de verdad: si la web pública muestra el IVA, el portal también.
2. **«Solicitar visita»:** con `citasEnLinea = false` **no aparece ningún** botón ni enlace para solicitar visita en el portal; con `true`, sí. **Con prueba que lo vigile.**
3. **«Por revisar»:** fuera del menú. Ni funcionalidad falsa, ni contador vacío. Queda documentado como posible futuro.
4. **Tableta (834 px):** se arregla en 3b-1, y la comprobación visual cubre **1440×834**, **834×1194** y **390×844**, con medidas (desborde, columnas), no «se ve más o menos bien».
5. **Nada de pantallas «Próximamente».** Cada entrada del menú tiene función definida o no está. Queda por decidir, pantalla por pantalla, qué entra de verdad en 3b y qué se queda fuera (ver abajo).
6. **No Silent Data Loss.** Todo formulario del portal: el servidor valida → guarda y responde **con el dato guardado**, o falla y **lo dice claro**. Nunca «guardado» cuando el servidor descartó algo. Con pruebas que lo cubran.
7. **3b no termina porque existan las nueve rutas**, sino cuando el portal se comporta de forma coherente, segura y usable en sus estados reales (llena, vacía, suspendida) y en los tres tamaños.

## Lo que falta decidir del alcance (pantalla por pantalla)

Para cumplir la regla 5, hay que decir de cada entrada del menú si **entra con función completa en 3b** o **no aparece todavía**:

| Entrada | Propuesta |
|---|---|
| Inicio | Ya existe; se arregla en 3b-1 |
| Guardadas · Mis búsquedas · Alertas · Mis consultas | Función completa en **3b-1** |
| Me interesan · Mis visitas · Mi perfil · Mi búsqueda · Configuración | Función completa en **3b-2** |
| **Valuador** | **Enlace** a la página pública `/valuador` desde el menú. **No** se crea `/portal/valuador` |
| Mi propiedad (Vender/Rentar) | Solicitud real en **3b-3** |
| Por revisar | **Fuera** (D-27.1) |
