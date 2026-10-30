# Fase 3b-3 · PLAN (V-1.1.87) — esperando aprobación

> **Rediseñado dos veces el 23-sep-2026** con la política nueva de eliminación (**D-35**) y luego con tus reglas
> definitivas (correo nullable, estados explícitos, Firebase Admin, proceso reintentable). El diseño completo que
> hay que aprobar está en **`docs/fase-3/DISENO_BAJA_DE_CUENTA.md`**.
>
> `Migración 25 ❌ todavía no · Implementación ❌ todavía no.`

- **Base:** `docs/fase-3/AUDIT_3B3.md` (K-01…K-25) · **Producción:** V-1.1.86 · **Flags:** siguen **apagados** en cada despliegue.
- **Nada de esto está implementado.** Un commit por bloque; las migraciones, con el ciclo completo (respaldo → ensayo en PGlite → ensayo en producción dentro de transacción revertida → aplicar → verificar → evidencia → `REVERTIR`).
- **Reglas que se aplican a todo lo nuevo:** No Silent Data Loss (D-32) · nada de «Próximamente» · una sola verdad por dato · ninguna entrada de menú sin pantalla · la IA no es fuente de verdad (D-34).

## Bloque 1 · Migración 25 — esquema, estados y procedimiento

**Todo el detalle vive en `docs/fase-3/DISENO_BAJA_DE_CUENTA.md`** (23-sep, segunda revisión), que es lo que hay
que aprobar antes de ejecutar nada. En resumen:

- **`usuarios.email` pasa a nullable**; una cuenta cerrada lleva `email = NULL`, y un `CHECK` impide que a una
  cuenta viva le falte el correo. **El índice único no se toca**: está verificado que admite muchos NULL.
- **`usuarios.estado`** gana `'eliminada'` (terminal), y `resolverPerfil` deja de normalizar lo desconocido a
  `'activo'` en el mismo commit.
- **`bajas_de_cuenta`** (una fila por cuenta, clave primaria `uid`) guarda el avance del proceso —
  `baja_en_proceso → bloqueada → firebase_eliminada → datos_procesados → completada`, más `error` — con
  intentos, último error y las marcas de tiempo de cada paso. Es lo que hace el proceso **idempotente y
  reanudable**.
- **`invitaciones`** gana `revocada_por_baja`, para que una cuenta nueva no herede rol por correo.
- **No se crea `solicitudes_eliminacion`:** la baja no es una petición que alguien aprueba.
- **La matriz de las 18 referencias** (suprimir · disociar · bloquear · conservar) está completa en el §5 del
  diseño, con **cuatro decisiones de negocio abiertas** que no decido yo (§9).

## Bloque 2 · Firebase y reintentos

- **Autenticación reciente comprobada en el servidor** con el `auth_time` del token (≤ 5 min). Entra sí o sí:
  no necesita dependencias nuevas.
- **Firebase Admin SDK** para borrar la identidad desde el servidor, en lugar de depender de que el navegador
  siga abierto. Recomendado, sólo en el camino de la baja; necesita una **cuenta de servicio** que configuras tú
  (pasos exactos en el §6.4 del diseño). Plan B documentado por si la respuesta es no.
- **Reintento:** cada paso es idempotente; reintenta la propia llamada, la siguiente sesión de esa cuenta o una
  pantalla de administración. Desde `bloqueada`, el proceso sólo avanza; `error` nunca revierte.

## Bloque 3 · Eliminación de cuenta — lo que ve el cliente
- `POST /api/portal/eliminacion` (ejecuta el paso 1) y `GET` (si la sesión corresponde a una cuenta cerrada, para ofrecer terminar la baja). **No hay cancelar**: no hay nada pendiente que cancelar.
- Pantalla `/portal/configuracion` gana la sección, con **textos DRAFT** (D-19) que digan la verdad: qué se cierra, qué se conserva y por qué, que **no se puede recuperar**, y que **sí puede volver a registrarse con el mismo correo** — empezando de cero.
- En `crearAutorizador`, `eliminada` se corta **antes** que `suspendido`, con mensaje propio (K-19). Una baja no se apela.
- Aviso al equipo por el canal interno al ejecutarse (D-28.5, ya no es una solicitud sino un hecho).

## Bloque 4 · Publicador y super admin
- **Publicador: decisión abierta P-1** (§9 del diseño). Qué pasa con propiedades, acuerdos y operaciones **no se
  decide automáticamente**: es negocio, y lo decides tú. Mientras tanto, la baja de una cuenta **con propiedades**
  se detiene y lo explica — es la única salida que no decide por su cuenta.
- **Citas futuras de un asesor que se va: decisión abierta P-3.**
- **Super admin:** el **último activo no puede darse de baja** — la misma regla que ya impide quitarse el rol.
  Hoy hay **uno solo** en producción, así que la guarda es real, no teórica.
- Sea cual sea P-1, una cuenta nueva con el mismo correo **no recupera** rol ni propiedades. Eso no está en duda.

## Bloque 5 · «Mi propiedad»
- **Estados en código puro** (`lib/solicitudes/estados.ts`): `puedeTransicionarSolicitud(desde, hacia, rol)` al estilo de `puedeTransicionar` de publicación (K-07). El **cliente** crea y cancela mientras esté `recibida` o `en_revision`; el **admin** pasa a `en_revision`, `aprobada` o `rechazada` (con motivo). Matriz completa probada, incluida «no se cambia a lo mismo».
- `/portal/mi-propiedad` (entra en `lib/portal/rutas.ts` y aparece sola en el menú): formulario corto —operación, tipo, zona, mensaje— ligado al `uid`, **sin** dar rol y **sin** duplicados.
- `POST/GET/cancelar` en `/api/portal/mi-propiedad`, por `exigirPortal`.
- Cola en el panel con las mismas acciones y bitácora (`publicacion.solicitada`, `publicacion.revisada`).
- Aprobarla **no** convierte a nadie en publicador: eso sigue siendo un administrador dando el rol (fase 4).

## Bloque 6 · Centro de Ayuda — arquitectura (sin construir el sitio)
- **Migración 26:** `unaccent` + `pg_trgm` (K-13) y las tablas de D-34: `knowledge_categories`, `knowledge_articles`, `knowledge_article_versions`, `knowledge_article_sources`, `knowledge_article_relations`, `knowledge_article_tags`, `knowledge_feedback`, `knowledge_searches`, `knowledge_change_events`.
- **`audiencia` obligatoria** (`publica | publicador | admin | tecnica`) y `estado` (`borrador → en_revision → aprobado → publicado → desactualizado → archivado`), con la regla de visibilidad y su prueba (K-15).
- **`source_key` desde el principio** (funcionalidad, rutas, componentes, decisión, versión, `last_verified`), aunque el motor llegue después (K-16).
- `/ayuda` reservada como **pública**: se comprueba que no choca con las rutas privadas y se decide su sitemap (K-14).
- **Sin** pantallas del Centro de Ayuda, sin editor, sin IA. Sólo el terreno, más el mapa de ayuda contextual ya escrito en `CENTRO_DE_AYUDA.md`.

## Bloque 7 · Pruebas y evidencia

### Las dieciséis de la baja de cuenta
**Lista completa en el §10 de `DISENO_BAJA_DE_CUENTA.md`**: re-alta con el mismo correo · `U1 ≠ U2` · sin herencia
privada · sin herencia de rol (admin, super admin y publicador) · sin herencia de invitación · el caso Google ·
token antiguo bloqueado · último super admin protegido · **proceso repetido que no duplica ni corrompe** ·
**Firebase falla** · **Supabase falla** · **reintento exitoso** · la matriz de las 18 referencias · la lápida sin
PII · `eliminada` que no se resuelve como `activo` · autenticación reciente.

Todas contra PGlite con el esquema real y el **procedimiento de verdad** (no una copia del SQL en el test), con el
autorizador real (`crearAutorizador`) y un doble de Firebase para poder provocar los fallos.

### El resto
- Prueba tabla por tabla de **K-23**: tras la baja, cada una de las 18 columnas quedó como dice la tabla (suprimida, disociada o intacta). Si alguien añade una columna con `uid` y no la declara, la prueba falla.
- Prueba de que la **lápida no tiene PII**: ningún campo de `usuarios` de una fila `eliminada` contiene el correo, nombre o teléfono originales.
- Datos de prueba con los estados nuevos y capturas medidas en **1440×834 / 834×1194 / 390×844**, con axe.
- Aislamiento A/B extendido en la cola de «Mi propiedad».
- Prueba de que una fila **disociada** no rompe el panel (K-08) y de que `Configuración` ahora sí ofrece la baja (K-17).
- Antes de desplegar: suite completa, typecheck, lint sin errores nuevos, build, CI verde. Después: portal y APIs en 404 con los flags apagados.

## Orden propuesto
1 → 2 → 3 → 4 → 5 → 6 → 7. Los bloques 1-4 se pueden aprobar y ejecutar sin el 6; si prefieres cerrar antes la parte legal, el 6 puede ir primero.

## Decisiones que hacen falta antes de empezar
| # | Decisión | Propuesta |
|---|---|---|
| 1 | Qué se conserva por obligación y con qué plazos (K-04) | Bitácora y consentimiento **bloqueados**; contacto **disociado**; preferencias **suprimidas** — **lo confirma el abogado** (D-19) |
| 2 | Quién atiende la cola de «Mi propiedad» (K-09) | `usuarios.gestionar`. La baja **no tiene cola**: la ejecuta la persona (D-35) |
| 3 | Qué pide «Mi propiedad» (K-06) | Operación, tipo, zona y un mensaje; nada más |
| 4 | Dónde viven los artículos (K-12) | En la base, no en archivos |
| 5 | Indexación de la ayuda (K-14) | Pública indexable con sitemap propio; publicador/admin/técnica, nunca |
| 6 | ¿El Centro de Ayuda entra en V-1.1.87 o se separa? | Cabe, pero si prefieres, los bloques 1-5 son V-1.1.87 y el 6 pasa a V-1.1.88 |
