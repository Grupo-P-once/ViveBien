# D-81 · Publicación (PUBLICADOR / ASOCIADO), filtros y multimedia — diagnóstico y cierre local (8-oct-2026)

> Estado: **diagnóstico completo + correcciones y pruebas LOCALES. Nada desplegado, nada aplicado en producción, sin commit.**
> Codex: **BLOQUEADO por cuota hasta 2026-11-06** (no hubo revisión independiente; no se declara PASS).
> Espacio de trabajo aislado: `C:\Users\jemil\vivebien-deploy-stage-d81` (copia de `…-d75-final`, el candidato promovido `dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z`, sin cambios de Resend).
> Los cambios de Resend viven aparte en `C:\Users\jemil\vivebien-deploy-stage-d75` (no es un repositorio git; ver §1).

## 1 · Rutas y estado de los espacios de trabajo (comprobado, no supuesto)

| Ruta | Qué es | Estado |
|---|---|---|
| `C:\Users\jemil\vivebien-next` | Repo principal, rama `nextjs-migration`, HEAD `f4834e5` | 274 archivos modificados/no versionados (residuo de V-1.1.95 y de otras sesiones). **No se editó código de aplicación aquí.** |
| `…\vivebien-deploy-stage-d75` | Copia con D-80 (Resend). **No es repositorio git** (no hay `.git`) | Contiene los cambios de correo; difiere de `-final` en `src/app/api/correo/*`, `src/app/correo`, `src/app/recomendaciones`, `registro-lead`, `usuarios/me`, etc. |
| `…\vivebien-deploy-stage-d75-final` | Snapshot limpio del candidato ya promovido | Sin tocar. |
| `…\vivebien-deploy-stage-d81` | **Copia aislada creada para esta tarea** (de `-final`, con `node_modules` enlazado al de d75 sólo para pruebas) | Cambios de publicación/filtros. |

Las dos sesiones **no comparten archivos**: D-80 toca correo, registro y formulario de recomendaciones; D-81 toca `publicacion.ts`, la pantalla de edición y pruebas. Un único archivo compartido en espíritu es `src/lib/busquedas.ts` (lo consume D-80) y **no se modificó**.

## 2 · Incidente VB-2026-00027 — causa raíz DEMOSTRADA

Evidencia (lecturas de sólo lectura en producción; ningún dato se modificó; sin datos personales):

* `propiedades` → `VB-2026-00027`: `estado_pub = borrador`, `completitud = 70`, **`fotos = 0`** (array y tabla `fotos`), `enviada_en = NULL`, `publicada_en = NULL`, título/tipo/operación/precio presentes. Creada 2026-10-08 16:33 UTC.
* `audit_logs` de esa propiedad: `propiedad.crear` (16:33) y 12 `propiedad.editar` (2026-10-09 00:02–00:04 UTC) con campos `titulo, tipo, operacion, lat/lng, metros, recamaras/banos, amenidades, precio, ubicacion`. **Ninguna fila de `propiedad.editar` con `fotos`, y ninguna de `propiedad.en_revision` / `propiedad.publicada`.**
* `audit_logs`: a las 00:02:15 UTC un admin editó al usuario (motivo «prueba 002»): `tipo_publicador = asociado`, `publicar_sin_revision = true` en las capacidades efectivas. Es decir, **los permisos estaban bien concedidos y el servidor los habría respetado**.
* `usuarios` de esa cuenta: `rol = publicador`, `tipo_publicador = asociado`, con nombre y teléfono, **sin WhatsApp**.

Lectura del código (`/api/propiedades/[id]/estado`, `lib/publicacion.ts`, pantalla `publicador/propiedades/[id]/editar`):

1. El botón «Publicar ahora» está **deshabilitado** mientras `faltantes()` no esté vacío (`disabled={!lista || …}`); con 0 fotos faltan `5 fotos como mínimo (llevas 0)`. Por eso no se envió ninguna petición de cambio de estado (coherente con la bitácora).
2. Aun con fotos, el servidor habría respondido **400** `perfilIncompleto` por falta de WhatsApp (`puedePublicar`), y la pantalla lo dice tras pulsar.
3. La propiedad nunca pasó a `en_revision`, por eso **no apareció en la cola** (la cola es `estado_pub = en_revision`). No hay propiedades «perdidas»: un borrador sin enviar no está en la cola por diseño.

**Veredicto:** *no hay un defecto del servidor ni de los permisos* que explique el incidente. La propiedad era un borrador **incompleto** (0 fotos). Lo que sí falló fue la **comunicación**: la persona creyó haber publicado.

**No demostrado (se declara como hipótesis):** por qué no hay fotos. Hechos: no existe ningún guardado de `fotos` ni en `propiedades.fotos` ni en la tabla `fotos`. Posibles: nunca se eligieron archivos, o la subida a Cloudinary falló (la pantalla muestra «N de M no se pudieron subir» sólo en pantalla, sin rastro en el servidor), o se subieron y no se guardaron por una pérdida de conexión. Los registros de ejecución de Vercel de esa hora **no están disponibles** (plan Hobby retiene 1 hora). No se concluye que se hayan «perdido archivos». *Pendiente (autorización):* repetir la subida con una cuenta de prueba en un entorno de prueba.

### Lo que sí se corrigió (local, `d81`)

* `src/lib/publicacion.ts` → `textoAnuncioCompleto(publicaDirecto)` y la pantalla del paso final: antes decía **siempre** «un administrador lo revisa y decide si se publica», incluso a un ASOCIADO o a un admin que publican directo (prometía una cola de revisión que no existe). Ahora dice lo que va a pasar («Publicar ahora… sin revisión previa»).
* Sin cambios al servidor, a la máquina de estados ni a los permisos: ya eran correctos y están cubiertos por pruebas.

## 3 · Diferencias PUBLICADOR vs ASOCIADO (código real, `lib/acceso/capacidades.ts`)

* Un solo rol de seguridad (`publicador`); la **modalidad** sólo fija valores por defecto. **Nunca** se concede por comparar el nombre de la modalidad: se usa `tieneCapacidad(perfil, '…')` sobre el perfil que el servidor recalcula en **cada** petición (probado: cambiar la modalidad se nota en la siguiente petición).
* PUBLICADOR: sólo `recibir_solicitudes`. Sus propiedades terminan en `en_revision` (necesitan aprobación).
* ASOCIADO: `publicar_sin_revision`, `editar_publicadas`, citas, `mostrar_perfil/nombre/foto`. «Publicar sin revisión» = sólo `borrador → publicada` de **lo suyo**; lo que está `en_revision`, `rechazada` o `cambios_solicitados` sigue necesitando a un administrador. Queda `sinRevision: true` + `tipoPublicador` en la bitácora.
* Las reglas de contenido mínimo (5 fotos, campos obligatorios) y de contacto (nombre, teléfono, WhatsApp) **aplican igual** a quien publica directo.

> Desajuste de documentación: la skill/guía dice «3 fotos como mínimo»; el código (`MINIMO_FOTOS`) exige **5**. No se modificó ninguna skill activa; se propone corregirla.

## 4 · Estado de multimedia y detalles

* Los **detalles** de VB-2026-00027 están guardados (título, tipo, operación, precio, ubicación, lat/lng, metros, recámaras, baños, amenidades). Lo que «no se veía» eran las **fotos**, que no existen en la base (§2).
* Flujo de fotos revisado: firma (`/api/medios/firma`, autoriza dueño o admin; en borrador permitido) → subida directa a Cloudinary → autoguardado `PATCH /api/admin/propiedades/[id]` con `fotos` → sincroniza la tabla `fotos`. Cada paso está probado en la suite existente (`tests/publicador-completo`, `publicador-seguridad`, `medios-*`).
* **Brecha de observabilidad (riesgo, sin corregir):** un fallo de subida o de guardado de fotos sólo se muestra en pantalla; no deja rastro en el servidor. Propuesta: registrar un evento sin PII al fallar la firma o el PATCH de `fotos`.

## 5 · Super Admin y cola de revisión

* `GET /api/publicador/propiedades` devuelve al admin **todo el inventario** (incluye borradores) y `GET /api/admin/propiedades/[id]` entrega propiedad + pies de un borrador (el navegador no puede leerlos por RLS). No se encontró un defecto de lectura.
* La cola de revisión (`estado_pub = en_revision`) sólo contiene lo enviado: una propiedad `completa` de un PUBLICADOR llega ahí (probado).

## 6 · Filtros — inventario REAL

Existentes (una sola regla compartida, `lib/busquedas.ts › coincide`, usada por el catálogo, las búsquedas guardadas, las alertas y las recomendaciones):

| Filtro | Parámetro URL | Regla |
|---|---|---|
| Operación | `op=venta|renta` | igualdad |
| Tipo | `tipo` (`[a-z_]{2,30}`) | igualdad; `depto` ≡ `departamento` |
| Zona | `zona` (≥2, ≤60 caracteres) | contiene, sin acentos/mayúsculas, sobre `ubicacion + colonia + ciudad` |
| Precio mín./máx. | `pmin`, `pmax` | inclusivos; mín > máx se intercambian; sin precio = fuera |

**Ausentes (documentados, no inventados):** superficie mínima/máxima, recámaras/baños, características/amenidades, orden en la URL, paginación (el catálogo trae hasta 500 y filtra en el navegador; el orden por m² existe sólo como ordenación, no como filtro).

Consistencia verificada con pruebas (`tests/filtros-consistencia.test.ts`, 19): cada filtro, combinaciones (AND), valores inválidos/ausentes, límites inclusivos, URL ida y vuelta, parámetros desconocidos ignorados, limpieza, borradores/pendientes/pausadas fuera del catálogo, contadores = listado, y que el tipo `Filtros` no tiene superficie.

### Hallazgos sobre los datos (riesgo real, no corregido)

* En la base, **100 % de las 9 propiedades tienen `ciudad` y `colonia` NULL**; la zona sólo puede coincidir con el texto de `ubicacion` (p. ej. «cañada del refugio norte » **no contiene «León»**: un filtro «León» la excluiría aunque esté en León). Es un problema de captura de datos, no del filtro. Recomendación: que el asistente guarde ciudad/colonia (o geocodifique) y rellenar las existentes con aprobación.
* Todas están en `MXN`; el filtro de precio **no** distingue monedas. Si algún día entra `USD`, hay que convertir o filtrar por moneda.
* El orden «m² mayor/menor» suma `metros` + `m2` (el mismo dato duplicado): el orden resultante es correcto, pero el cálculo es redundante.

## 7 · Resend / recomendaciones (D-80 v2–v4) — estado, en `vivebien-deploy-stage-d75`

Implementado y **probado localmente** (115 pruebas de correo en verde; ver §8). **Nada enviado en producción, nada desplegado, migraciones 36 y 37 sin aplicar.**

* **Flujo del visitante (v2):** el primer correo ya trae sus propiedades reales (`correo_envios` registra `propiedades`); el botón «Sí, quiero seguir recibiéndolas» firma un token real (HMAC) y activa la secuencia; el siguiente envío es 3 días después del primero (`correo_confirmar`); el primer correo cuenta para no repetir; sin coincidencias se dice con honestidad; baja con un clic (cabecera `List-Unsubscribe` también en el primero).
* **Formulario:** sin casilla; el botón «Enviarme propiedades» es el acto afirmativo con el aviso (texto versionado `marketing-2026-10-v2`) debajo; el servidor exige `acepto: true`. Se guarda fecha, origen (`fuente`) y **versión** del texto (no el texto íntegro ni la IP).
* **URL precargada** (`/recomendaciones?operacion=renta&tipo=casa&zona=Centro&presupuesto=25000`): pasa por el mismo filtro que las preferencias guardadas; lo desconocido se descarta; el cuerpo del formulario sólo admite los tipos que ofrece la pantalla (nuevo en esta ronda).
* **Tokens:** los de ejemplo/vacíos/ajenos/de otro tipo se rechazan sin tocar la base (prueba nueva). Confirmar es idempotente; la baja prevalece y no se anula con otro envío del formulario (un re-registro en baja exige pulsar de nuevo).
* **Consentimiento — riesgo abierto:** quitar la casilla **no** es equivalente a consentimiento válido por sí mismo. Se apoya en: acto afirmativo (botón), aviso visible, «sí, seguir» explícito antes de cualquier campaña, baja con un clic y registro. **Requiere revisión legal (LFPDPPP / aviso de privacidad) antes de activar.** No se inventan datos legales.
* **Límites y costos:** internos 70/día y 2 000/mes (Free de Resend: 100/día, 3 000/mes; 1 000 contactos; 1 webhook), 20 reservados a transaccionales, 1 comercial por persona cada 3 días vía `proximo_envio_en`, pausa por rebotes/quejas. Todo **apagado por defecto** (`CORREO_TRANSACCIONAL`, `CORREO_MARKETING`, `CORREO_SECRETO`).
* **Diseño:** las plantillas siguen ahora las maquetas del dueño (campaña, bienvenida y bienvenida del portal), con mejoras (sin género gramatical, sin glifos que Outlook no dibuja, cifras reales o nada, sin `tel:`). Pruebas de correo enviadas **sólo** a `jemilianoponceperez@gmail.com` (3 IDs de Resend registrados en §8).

## 8 · Pruebas ejecutadas (resultados exactos)

`C:\Users\jemil\vivebien-deploy-stage-d81` (publicación/filtros), 2026-10-08:

* `npx tsc --noEmit` → sin errores.
* `vitest run tests/publicador tests/publicacion tests/medios tests/fotos tests/busquedas tests/filtros tests/chaos-catalogo tests/visibilidad tests/propiedad-publica tests/sanear` → **326 pasan, 2 fallan** (`tests/medios-optimizar.test.ts`: «la precarga NO salta…» y «los tres visores precargan…»). **Son previos y ajenos al cambio:** fallan igual en `vivebien-deploy-stage-d75`; en el repo principal esa suite pasa (26/26). Causa probable: los componentes de la copia de staging tienen finales de línea CRLF y la prueba lee el código con `\n`. No se tocó.
* Pruebas nuevas/ampliadas: `tests/publicador-modalidad.test.ts` (43, incluye 6 del incidente), `tests/filtros-consistencia.test.ts` (19).

`C:\Users\jemil\vivebien-deploy-stage-d75` (Resend):

* `npx tsc --noEmit` → sin errores.
* `vitest run` de 9 archivos de correo (`correo-filtros`, `correo-plantillas`, `correo-integracion`, `correo-guardias`, `correo-enviar`, `correo-seguridad`, `correo-portal-datos`, `migracion-36-correo`, `migracion-37-ayuda-correo`) → **115 pasan, 0 fallan**; después se añadió 1 prueba de enlaces de ejemplo (integración: 15/15).
* Capturas de las 5 plantillas a 700 px y 390 px: sin desbordamiento horizontal.
* **No ejecutados:** e2e de correo (`tests-visual/correo.e2e.ts`, reescrito, sin correr) y el `qa:gate` oficial (exige laptop en corriente; está en batería). **Ninguna de las dos cosas se da por pasada.**
* Correos de prueba (única dirección permitida): `01a11e21-7e02-791c-b6a8-39fdaac44199` (primeras propiedades v2), `01a11e43-bcde-771e-8059-66c29f97b724` (bienvenida v3), `01a11e4e-4760-7d5f-bbd8-5d4d732e82f7` (bienvenida portal v4). Los botones llevan tokens de ejemplo y **no funcionan** (por diseño de la prueba).

## 9 · Riesgos y limitaciones

1. Causa de las 0 fotos **no demostrada** (sin registros de ejecución; ver §2).
2. Datos de ubicación vacíos en el 100 % del inventario → filtros de zona poco fiables.
3. Consentimiento sin casilla: revisión legal pendiente.
4. `medios-optimizar` (2 pruebas) falla en las copias de staging por finales de línea.
5. Documentación desalineada (3 vs 5 fotos mínimas).
6. Sin revisión independiente (Codex bloqueado).

## 10 · Autorizaciones que se necesitan (nada hecho)

* Aplicar migraciones 36 y 37 (Resend) en producción, y publicar los 2 artículos de ayuda.
* Variables de Vercel (`CORREO_SECRETO`, `CORREO_TRANSACCIONAL`, `CORREO_MARKETING`, `NEXT_PUBLIC_CORREO_RECOMENDACIONES`), webhook de Resend + `RESEND_WEBHOOK_SECRET`, DMARC en DNS, subdominio de marketing opcional.
* Desplegar el candidato: Resend (d75) y el texto del paso final (d81) son cambios **independientes**; se pueden promover por separado.
* Repetir la prueba de subida de fotos con una cuenta de prueba y revisar la skill (3 → 5 fotos).
* Revisión legal del aviso de privacidad y del texto de consentimiento.
