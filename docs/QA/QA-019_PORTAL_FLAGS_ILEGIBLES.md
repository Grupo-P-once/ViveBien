# QA-019 · Portal: «no se pudo leer la configuración» ya no se muestra como 404 (10-oct-2026)

> **Estado: CORREGIDO EN CÓDIGO, SIN DESPLEGAR.** Worktree separado `C:\Users\jemil\vivebien-fix-qa019` con un solo commit en la rama **`fix/qa-019-portal-503`**, creada desde `integracion/d78-base` = `2af9dc1` (la base de producción **sin D-80**); el hash está en `git log` y en el informe de cierre. **Sin push, sin migraciones, sin despliegue, sin cambios en producción**. D-80 no se mezcló. El repositorio principal (`nextjs-migration`, 274 cambios) no se tocó. Parche: `docs/QA/QA-019_portal-flags-ilegibles.patch`.

## Defecto (de `DEFECTOS.md`, QA-019, P3 resiliencia/UX)
Si la base de flags no se podía leer, el portal respondía **404 «Página no encontrada»** a un cliente con sesión: fingía que la página no existía. Fuente: `docs/QA/DEFECTOS.md`, `PLAN_REPARACION.md` (R-15), `QA_REPARACION_2026-10-07.md`, `CIERRE_E34_2026-10-07.md` (QA-019 seguía ABIERTO).

## Causa
`leerFlags()` (`src/lib/config/flags-servidor.ts`) tragaba cualquier error y devolvía «todo apagado» — correcto para permisos (falla cerrado) pero indistinguible de «cerrado a propósito». `portal/layout.tsx` hacía `notFound()` en cuanto `aperturaDelPortal(...) === 'nadie'`, así que una base caída = 404. Las APIs `/api/portal/*` (`exigirPortal`) hacían lo mismo.

## Qué se cambió
| Archivo | Cambio |
|---|---|
| `src/lib/config/flags-lectura.ts` (nuevo) | `leerFlagsConEstado()` → `{ flags, legibles }`. `legibles:false` ante error, excepción, tiempo agotado o un `valor` que no es un objeto; en ese caso `flags` viene **todo apagado** (nunca abre). Sin fila de flags = `legibles:true` (todos nacen apagados: sí es una respuesta). Un fallo se memoriza 5 s (antes 60): cuando la base vuelve, el portal vuelve en segundos. Sin `server-only` porque lo importa `proxy.ts`. |
| `src/lib/config/flags-servidor.ts` | `leerFlags()` y `olvidarFlags()` delegan en lo anterior (mismo contrato: ilegible = todo apagado) y reexporta `leerFlagsConEstado`. Conserva `import 'server-only'`. |
| `src/lib/portal/no-disponible.ts` (nuevo) | `estadoDelPortal()` puro: `indisponible` / `cerrado` / `abierto`; **sólo `legibles === true` (estricto) puede dar cerrado o abierto**. Mensajes y respuestas 503 (página HTML y API JSON) con `Retry-After: 30`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`. |
| `src/proxy.ts` (nuevo) | Next no permite a un layout devolver un 503 (el código se fija antes de transmitir; sólo existe `notFound()`→404). El 503 real se emite en el proxy, acotado a `/portal` y `/portal/:path*`. No lee sesión ni concede nada: un error sólo puede ser 503, nunca «abierto». |
| `src/app/portal/layout.tsx` | `cerrado` → `notFound()` (404, **sin cambio**); `indisponible` → `<PortalNoDisponible />` (carrera entre proxy y layout); sólo `abierto` llega a `PortalShell`. |
| `src/components/portal/PortalNoDisponible.tsx` (nuevo) | Aviso de último recurso. |
| `src/lib/portal/exigir-portal.ts` | Ilegible → **503 JSON** antes de leer la sesión; cerrado → 404 igual; abierto → sigue pasando por `exigir` y `portalAbiertoPara`. La carcasa del portal ya trata un no-OK como «No se pudo abrir tu portal… Recarga», sin cambios. |
| `src/app/portal/propiedades/page.tsx` | **Sin cambios**: su `notFound()` es para vistas desconocidas (`?vista=`), no para el cierre del portal. |

## Pruebas
* **Nuevas** `tests/portal-flags-ilegibles.test.ts` (**33**): lectura legible/ilegible (error, excepción, valor inválido, sin fila, y fallo al CREAR el cliente de Supabase), un error nunca abre aunque antes estuviera abierto, vigencias 60 s / 5 s, `leerFlags` sigue cerrando, `estadoDelPortal` con valores raros, proxy (503 con cabeceras y mensaje; deja pasar si está cerrado o abierto; no toca sesión), `exigirPortal` (503 / 404 / abierto), **el layout EJECUTADO** (cerrado → `notFound`; ilegible → aviso, nunca 404; abierto → carcasa con hijos; el aviso renderizado) y 2 comprobaciones estáticas residuales.
* **Mutaciones (revisión del 10-oct)**: lectura siempre «legible» (13 fallan), layout vuelto al 404 (5), proxy sobre todo el sitio (1), `exigirPortal` ignorando `legibles` (1), un error que abre (5), `estadoDelPortal` laxo (1). Archivos restaurados idénticos.
* **Ajustadas** (cambió la frontera simulada, no se relajó nada): `portal-apertura`, `portal-aislamiento` (el doble de `flags-servidor` ahora también ofrece `leerFlagsConEstado` legible), `portal-apertura` y `destino-dashboard` (las regex del layout exigen el nuevo código: `notFound()` sólo si `cerrado`), `frontera-cliente-servidor` (+`flags-lectura` prohibido para el cliente).
* **Extremo a extremo con `next start` real** (build con `NEXT_PUBLIC_SUPABASE_URL` apuntando a un Supabase FALSO local; script `qa019_e2e.cjs`): base caída → `/portal`, `/portal/propiedades` y `/api/portal/acceso` **503** con `Retry-After`, mensaje, `noindex`; portal cerrado confirmado → **404** (igual que antes); portal abierto → **200** y la API sigue pidiendo sesión (**401**); `/` no se ve afectada.
* Línea base (antes): 12 archivos / 317 pruebas relacionadas OK, `tsc` 0. Después: **13 archivos / 350 OK**, `tsc` sin errores, `eslint` limpio en lo tocado, `next build` OK con «Proxy (Middleware)» registrado.
* Suite completa: 115 archivos OK, 6 fallan (9 pruebas): `task-observer`, `medios-optimizar` (2), `migracion-29`, `migracion-30`, `migracion-35`, `wafloat-oclusion` (4). **Las mismas 9 + task-observer fallan idénticas en un checkout limpio de `integracion/d78-base`** → preexistentes, no causadas por este cambio; no se tocaron ni se ocultaron.

## Límites y avisos honestos
* **Una primera corrida de la prueba e2e** usó la URL de Supabase incrustada en la build (`.env.local`), no la del servidor falso: la app hizo lecturas de flags al Supabase real **con una clave falsa** (rechazadas, sin datos). Se corrigió recompilando con la URL falsa; las corridas válidas no salen de la máquina.
* El proxy es código nuevo en producción (hoy no existe `proxy.ts`): añade una lectura de flags por petición a `/portal` por instancia (memorizada 60 s; separada de la del layout porque proxy y render no comparten memoria). Se valida en build y en `next start` local, **no en Vercel**; antes de promover conviene el mismo smoke sobre un deployment STAGED.
* `Retry-After: 30` y el mensaje son decisiones de producto razonables, no medidas.
* Un `valor` de flags corrupto (no objeto) ahora da 503 en vez de «cerrado»: es «no sé», no «cerrado confirmado».

## Siguiente defecto prioritario del plan existente
Según `CIERRE_E34`/`QA_REPARACION`: QA-011/012/013 ya están corregidos en el código (E-35); quedan **QA-014** (22 rutas sin prueba de contrato, P3, R-12, esfuerzo L) y **QA-016** (3 llaves foráneas sin índice, P4, R-17, **requiere migración**). Recomendado: **QA-014 por tandas**, empezando por las rutas con escritura o datos personales (`admin/actividad`, `admin/contactos`, `admin/registros`, `citas/accion`), con pruebas de contrato (401/403 sin sesión + forma de la respuesta). QA-016 espera autorización de migración.
