# D-77 · Candidato Vercel de D-75 + D-76 (8-oct-2026)

**Estado: CANDIDATO PREPARADO Y VERIFICADO (STAGED, sin dominios). NO promovido. Sin commit ni push. Producción sigue en E-36→E-39 (`dpl_CfwgKgpGRRAniArNXymWBSEWSVXj`).**

## Autorización y buzón
- **BUZÓN VERIFICADO:** el propietario comprobó manualmente que `informes@vivebienn.com` **existe y recibe correo**. Fecha de verificación: **8-oct-2026**. (Sin contraseñas, tokens ni secretos registrados.) Con eso quedó autorizada la preparación del candidato (no la promoción).
- **Copia personal ELIMINADA:** se quitó la copia transitoria a `joseponcer@vivebienn.com`. `src/lib/aviso-lead.ts` quedó `to: [CORREO_CONTACTO]` (= `informes@vivebienn.com`) y es **byte a byte idéntico a producción**: el nuevo destinatario llega sólo por `NEGOCIO.email`. No cambió contenido, asunto, almacenamiento de leads, WhatsApp, manejo de errores ni lógica de registro. `COPIA_INTERNA_AVISOS` ya no existe en ningún archivo (guardia en `tests/correo-institucional.test.ts`, verificada con mutación: con la copia puesta de nuevo la prueba falla).
- **`CUENTA_PROPIETARIO` se conserva** (`src/lib/config/negocio-interno.ts`): administración (siembra), respaldo de Telegram e identidad de usuario. `NEGOCIO` (que viaja en el JS público) no contiene ninguna dirección personal; `NEGOCIO.email = informes@vivebienn.com`, `NEGOCIO.remitente = Vive Bien <informes@vivebienn.com>`.

## El candidato
| | |
|---|---|
| **Deployment ID** | **`dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z`** |
| URL | `https://vive-bien-jm4goems9-grupo-p-once.vercel.app` (protegida; no es navegable sin autenticación de Vercel) |
| Estado | `READY` / **`STAGED`**, `target: production` pero **sin dominios** (`--skip-domain`): `vivebienn.com`, `www` y `vive-bien.vercel.app` siguen apuntando a `dpl_CfwgKgp…` |
| Fecha/hora | desplegado **2026-10-08 22:43 UTC** (inicio 22:43:11Z, fin 22:43:53Z) |
| Comando | `vercel deploy --prod --skip-domain --yes` desde `C:\Users\jemil\vivebien-deploy-stage-d75-final` (árbol armado por un constructor *fail-closed*: base = payload exacto de producción + sólo la lista cerrada de cambios; escaneo de secretos LIMPIO) |
| **Manifiesto SHA-256** | `0282b61ae188808172e6c2e341bbf3d5333082e87d8e4189c8b85eac7bb1dc6d` |
| **Payload SHA-256** | `fc8156d9c0aa1e945e58003ab0f0c5dda3769bd434dcadd17751ebb5aa815674` |
| Árbol real del deployment vs payload aprobado | **382 / 382 archivos, 0 sobran, 0 faltan, 0 SHA-1 distintos** (`verificar_deployment`, mismo endpoint que producción) |
| Base | manifiesto `22fa0b42…` (729) y payload `81d07122…` = árbol REAL de producción (379/379) |
| Rollback | `dpl_CfwgKgpGRRAniArNXymWBSEWSVXj` (producción actual) |

**Cambios del payload respecto de producción (13 archivos, 382 en total):**
- Modificados (10): `src/app/admin/seed/page.tsx`, `src/app/api/eventos/route.ts`, `src/app/api/favoritos/route.ts`, `src/app/api/telegram/webhook/route.ts`, `src/components/Metricas.tsx`, `src/components/MisFavoritos.tsx`, `src/components/PropertyCard.tsx`, `src/components/portal/guardadas.ts`, `src/lib/citas/enviar.ts`, `src/lib/config/negocio.ts`.
- Nuevos (3): `src/hooks/use-favoritos.ts`, `src/lib/config/negocio-interno.ts`, `src/lib/favoritos/almacen.ts`.
- Sólo en el árbol de staging (no viajan al deployment): `tests/negocio.test.ts` (mod.), `tests/correo-institucional.test.ts`, `tests/favoritos-guardados.test.ts`, `tests/favoritos-guardias.test.ts` (nuevos).
- Sin migraciones, sin variables de entorno nuevas ni cambiadas, `package.json`, `package-lock.json` y `next.config.ts` = producción.

## Comparación contra el árbol limpio
`C:\Users\jemil\vivebien-deploy-stage-d75` (árbol limpio) vs `…-d75-final` (lo que viaja): **343/343 archivos de `src` idénticos byte a byte**. SHA-256 (16 primeros) de los archivos clave: `negocio.ts deb4b482…`, `negocio-interno.ts 68d2b7ea…`, `aviso-lead.ts 9c34326f…` (idéntico a producción), `use-favoritos.ts 1702070b…`, `almacen.ts c2236c4a…`, `favoritos/route.ts dd5cfa03…`, `PropertyCard.tsx ce44de06…`.

## V-1.1.95 — separación
Reverificada **dos veces** (árbol limpio y candidato): `globals.css`, `propiedades/page-client.tsx`, `propiedades/[id]/page-client.tsx`, `acceso/Entrar.tsx`, `portal/PortalShell.tsx` son **idénticos a producción**; `PropertyCard.tsx` no contiene `usaElCarrusel` ni la precarga de fotos. El candidato = **E-36→E-39 + D-75 + D-76**, sin V-1.1.95. No se usó reset, clean ni stash; el repo no se tocó para separar.

## Pruebas (antes de crear el candidato, sobre el árbol limpio, enchufado)
- Dirigidas: `correo-institucional`, `favoritos-guardias`, `favoritos-guardados`, `negocio` → 61 pruebas PASS; `guardados.e2e` (Playwright, 4 anchos) **24/24**.
- **`npm run qa:gate`: TODO OK** — 1 typecheck ✓ · 2 críticas ✓ (17 archivos, 186) · 3 seguridad ✓ (8 archivos, 107) · 4 secretos ✓ · 5 lint ✓ (63 vs 64 base) · 6 build ✓ · 7 navegador ✓ (119/119, sin reintentos) · 8 axe ✓ (24/24) · 9 visuales ✓ (48/48, sin flaky) · 10 API ✓.
- Páginas construidas (8 rutas): sólo `informes@vivebienn.com` (y placeholders `juan@ejemplo.com`/`correo@ejemplo.com`); JSON-LD `"email":"informes@vivebienn.com"`; **ninguna** `joseponcer@` ni `joseponcep@` en HTML público. En el JS del cliente `joseponcer@` está en **un solo chunk** (la pantalla de siembra del administrador); sin `service_role` ni claves de Resend (el único JWT es la clave anónima de Supabase, pública por diseño).
- **No ejecutado:** el smoke del candidato por la vía de Vercel (`smoke-deployment.ts candidato`), porque exige crear temporalmente un token de bypass en la protección del proyecto (un cambio de configuración que esta orden no autoriza). El smoke de API del gate (14 comprobaciones) y la verificación del árbol real sí pasaron. Se recomienda ejecutarlo en la ventana de promoción.
- **Codex: BLOQUEADO — cuota hasta el 6-nov-2026.** Sin PASS inventado.

## Producción — NO modificada
Comprobado por GET después del despliegue: `vivebienn.com` y `vive-bien.vercel.app` siguen sirviendo `dpl_CfwgKgpGRRAniArNXymWBSEWSVXj`; `/terminos` en producción todavía muestra `joseponcer@vivebienn.com` (cambiará sólo al promover). Sin `vercel promote`, push, commit, migraciones, SQL productivo ni cambios de usuarios, roles o propiedades.

## Pendientes (no son del candidato)
- **`NEXT_PUBLIC_ADMIN_EMAIL` (Vercel, Producción): PENDIENTE DE LIMPIEZA** — 0 lecturas en el código; es una acción separada con autorización.
- **Migración de ayuda 35 (`supabase/35-ayuda-guardados.sql` + `.REVERTIR`): PREPARADA, NO APLICADA** — se aplica DESPUÉS de promover.
- **Pendientes legales** (no inventados): razón social, RFC, representante legal, domicilio legal completo, fecha jurídica de última actualización.
- El repo conserva el residuo V-1.1.95; un commit del repo tal cual lo arrastraría.
- Flakiness visual de fuentes/terceros: no resuelta (esta corrida: 0 flaky).

## Procedimiento de promoción y rollback (NO ejecutado)
Antes: re-verificar que producción sigue en `dpl_CfwgKgp…` y que el árbol real del candidato = payload (`verificar_deployment_d75.py`). Promover: `vercel promote dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z --yes`. Después: tres dominios con `data-dpl-id` nuevo, smoke de producción, cabeceras `no-store`, `/terminos` y `/privacidad` con `informes@`, datos sin cambios. Rollback: `vercel promote dpl_CfwgKgpGRRAniArNXymWBSEWSVXj` (sin migraciones que revertir).
