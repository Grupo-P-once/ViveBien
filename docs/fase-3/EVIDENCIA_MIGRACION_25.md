# Migración 25 — evidencia de ejecución (24-sep-2026)

**Aplicada en producción** (`uztssyrheqdhtoheecgf`, PostgreSQL 17.6). Ciclo completo, en el orden pedido:
`respaldo → ensayo en PGlite → ensayo en producción dentro de transacción revertida → verificación → aplicación → verificación final → evidencia`.

**Sólo esquema.** No se dio de baja ninguna cuenta, no se tocó ninguna fila, no se implementó el procedimiento.

---

## 1 · Respaldo
`scripts/respaldo-migracion-25-2026-09-24.json` — tomado a las `2026-09-24T04:05:29Z`. Contiene `usuarios` (4), `invitaciones` (2), lo relevante de `propiedades` (8), `citas` (0), `solicitudes_contacto` (0) y el estado del esquema anterior. **Lleva PII: queda fuera del repositorio** (`.gitignore`).

## 2 · Ensayo en PGlite
`tests/migracion-25-baja.test.ts` — **20 pruebas, todas en verde**. Lee el archivo real de la migración (no una copia), lo aplica **dos veces** para comprobar que es idempotente, y verifica:

- `usuarios.email` y `citas.creada_por` pasan a admitir nulos.
- Una cuenta **viva** no puede quedarse sin correo → `usuarios_email_solo_falta_si_eliminada`.
- Una cuenta **eliminada** sí puede.
- **Caben varias lápidas con el correo nulo** (NULLS DISTINCT: el índice no se tocó).
- **El criterio de aceptación:** tras la lápida, el mismo correo vuelve a estar libre y una cuenta nueva lo toma; `U1 ≠ U2` y U1 sigue `eliminada`.
- Dos cuentas **vivas** siguen sin poder compartir correo.
- `bajas_de_cuenta`: una baja por cuenta (la segunda falla), nace en `solicitada`, admite los seis estados y rechaza cualquier otro, y exige `solicitada_por` y `auth_time`.
- **P-1:** `gestion` acepta `requiere_gestion` y rechaza lo demás; `estatus` y `owner_id` **no cambian**.
- **P-2:** la vista devuelve el contacto cuando la fila no está bloqueada y **vacío** cuando lo está —incluido el texto libre—, conservando tipo, origen, propiedad y consentimiento.
- Las **23 referencias**: son 23, sin repetidos, con trato válido, todas existen, y **ninguna columna que apunte a una persona se queda sin tratamiento**.
- El **REVERTIR** deshace el esquema sobre una base sin lápidas.

> **Corrección que salió de aquí:** la prueba falló al primer intento porque yo declaraba 22 y son **23** columnas. El 22 venía de contar filas de la tabla del diseño, y una juntaba las dos de `invitaciones`. Es exactamente para lo que existe esa prueba.

## 3 · Ensayo en producción, dentro de transacción revertida
Primero una sonda (`begin; create table …; rollback;`) para confirmar que el control de transacción funciona por este canal: la tabla **no** sobrevivió.

**Ensayo 1 — esquema.** Dentro de la transacción: `email_nullable = YES`, `creada_por_nullable = YES`, `bajas_de_cuenta` creada, `gestion` presente, los tres `CHECK` con su definición nueva, y `usuarios = 4 · propiedades = 8 · invitaciones = 2` intactas, **0 cuentas con estado distinto de `activo`**.
**Tras el `rollback`:** `email_nullable = NO`, `bajas_de_cuenta = null`, `gestion = 0`, `usuarios_estado_check` con los tres valores de antes, `citas.bloqueado_en = 0`. **Sin rastro.**

**Ensayo 2 — las vistas, con enmascarado real.** Dos solicitudes de prueba sobre el esquema de producción:

| | `nombre` | `telefono` | `email` | `mensaje` |
|---|---|---|---|---|
| Sin bloquear | `Ana` | `4770000000` | `ana@correo.com` | `Llámenme al 477` |
| **Bloqueada** | `null` | `null` | `null` | `null` |

Y la fila bloqueada **conserva el hecho**: `tipo=informacion`, `origen=ficha`, `propiedad=sanjuan`, `consentimiento=true`.
**Tras el `rollback`:** vistas inexistentes, `bloqueado_en` ausente, `solicitudes_contacto = 0 filas`. **Sin rastro.**

## 4 · Aplicación
Se aplicó el contenido exacto del archivo que validó PGlite (`supabase/25-baja-de-cuenta.sql`, 193 líneas, sha256 `314ec16a…`), en una sola transacción. Sin errores.

## 5 · Verificación final en producción

**Esquema**
| Comprobación | Resultado |
|---|---|
| `usuarios.email` admite nulos | `YES` |
| `citas.creada_por` admite nulos | `YES` |
| `usuarios_estado_check` | `activo, suspendido, pendiente, eliminada` |
| `usuarios_email_solo_falta_si_eliminada` | `email IS NOT NULL OR estado = 'eliminada'` |
| `invitaciones_estado_check` | `pendiente, aceptada, cancelada, revocada_por_baja` |
| `propiedades_gestion_check` | `gestion IS NULL OR gestion = 'requiere_gestion'` |
| `bajas_de_cuenta` | creada, **RLS activo sin políticas** (deny-by-default) |
| Vistas `citas_operativas` y `solicitudes_contacto_operativas` | creadas, las dos con `security_invoker = true` |
| `usuarios_email_idx` | **sin tocar** — `indnullsnotdistinct = false` |

**Datos — nada se movió**
`usuarios = 4` (4 activos, **0 sin correo**) · `propiedades = 8` (8 disponibles, **0 en gestión**) · `invitaciones pendientes = 2` · `bajas_de_cuenta = 0` · `citas bloqueadas = 0` · `solicitudes bloqueadas = 0`.

**Las 23 referencias, contra el catálogo de producción**
`declaradas = 23` · `en el catálogo = 23` · `sin tratamiento = []` · `declaradas que ya no existen = []`. **Coincidencia exacta.**

**Suite completa:** 808 pruebas en 53 archivos, todas en verde (antes: 788 en 52).
**Avisos de seguridad de Supabase:** sólo el `INFO` de siempre, «RLS activo sin políticas», en las 21 tablas — que es el diseño deny-by-default; `bajas_de_cuenta` se suma a esa lista. **Ningún aviso nuevo**, y en particular ninguno de *security definer view*: el `security_invoker` tomó efecto.

---

## Lo que esto **no** hace
La migración es **sólo esquema**. No existe todavía `POST /api/cuenta/eliminar`, ni la guarda de lápida en el alta, ni el borrado en Firebase, ni la revocación de invitaciones, ni el procesamiento de datos. Las columnas y las vistas están listas y **vacías de uso**: hoy ninguna aplicación lee las vistas todavía.

## Si hubiera que revertir
`supabase/25-baja-de-cuenta.REVERTIR.sql`. Sólo es seguro **mientras no haya ninguna lápida**: el archivo trae las consultas de comprobación al principio y el `set not null` final falla a propósito si alguna cuenta ya se dio de baja.

## Siguiente paso
La implementación del procedimiento (bloque 2 y 3 del plan), que necesita antes la configuración manual del **Firebase Admin SDK**. Siguen abiertos, sin bloquear: **P-3** (citas futuras de un asesor que se va) y **P-4** (plazos y excepciones de conservación, del abogado). Los textos legales siguen en DRAFT.
