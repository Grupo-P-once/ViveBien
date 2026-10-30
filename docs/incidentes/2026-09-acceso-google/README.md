# Incidente · «No puedo iniciar sesión con Google» (10 → 22 sep 2026)

- **Estado:** CERRADO en **V-1.1.83** (22-sep-2026, despliegue `dpl_4Bzoj2S4TQ5pw43FDrbrbxgHp6LU`, commits `f1af493` · `398f6ab` · `0ad1c50` · `840e1f8`).
- **Plan B por redirección:** programado y probado, **apagado** hasta un paso opcional en Google Cloud + Vercel (abajo). Hoy no hace falta: la ventana de Google funciona.
- **Configuración de Firebase:** la maneja el dueño en la consola. **No tocarla mientras producción funcione.**

## Resumen en una línea
La pantalla mostraba `auth/unauthorized-domain Firebase: Error (auth/unauthorized-domain).`: Firebase rechazaba la dirección de la página porque no estaba en su lista de **dominios autorizados**. La lista se corrigió en la consola de Firebase; V-1.1.83 deja **un solo dominio** (`https://vivebienn.com`), traduce todos los errores a frases claras y deja una bitácora técnica.

## Cronología
| Fecha (UTC) | Hecho |
|---|---|
| 10-sep | Primer aviso. `Error 400: origin_mismatch` en la ventana de Google (historia en Obsidian, Pendientes #1). |
| 19-sep | Revisión (V-1.1.82, anexo de `docs/fase-3/AUDIT_3B.md`): el `origin_mismatch` ya no aparece; la ventana llega a la pantalla normal de Google en `vivebienn.com` y `www`. Se encuentran tres debilidades: `www` sin redirección, sin plan B si la ventana se bloquea, y códigos crudos en pantalla. Lista de dominios autorizados ese día: **6** entradas. |
| 19 → 22-sep | La lista de dominios autorizados se **editó en la consola de Firebase**: quedó en **2** entradas (`www.vivebienn.com`, `vivebienn.com`). |
| 22-sep | Captura del dueño en `/dashboard`: `auth/unauthorized-domain`. |
| 22-sep 17:03 y 17:24 | Inicios de sesión reales: `GET /api/usuarios/me` → **200** (despliegue anterior `dpl_vzVfRA…`), seguidos del panel `/admin/propiedades`. El dueño confirma: «ya funcionó» y comparte la captura del selector de cuentas de Google abierto desde `vivebienn.com/dashboard`. |
| 22-sep ~17:52 | **V-1.1.83** en producción. Verificaciones abajo. |
| 22-sep 18:05–18:09 | **Prueba real del dueño sobre V-1.1.83**, empezando en `www.vivebienn.com/dashboard`: la redirección lleva al dominio principal, entra con Google y `GET /api/usuarios/me` → **200** (×3, 18:09:24–26), seguido de `/admin`, `/publicador` y `/mi-cuenta`. La bitácora registró además dos cancelaciones (`auth/popup-closed-by-user`, `anfitrion: vivebienn.com`) antes del acceso bueno: la ventana se cerró sin terminar y la persona vio el aviso, no un código. **Incidente cerrado.** |

## Causa
**Confirmada (por la captura y el código del SDK):** `auth/unauthorized-domain` lo lanza el propio SDK de Firebase **antes de hablar con Google** (`_validateOrigin` en `@firebase/auth`): pide a Identity Toolkit la lista `authorizedDomains` del proyecto y la compara con el dominio de la página (`location.hostname`; un dominio autoriza también a sus subdominios). Si ninguno coincide, falla con ese código.

**Probable (no reproducible después):** en el momento de la captura, la dirección que se usaba no estaba en la lista (la lista se estaba corrigiendo entre el 19 y el 22 de septiembre). No hay registro de qué dirección era; la bitácora nueva (`acceso.google_fallo`, con el `anfitrion`) lo dirá si vuelve a pasar.

**Factores que lo agravaban (corregidos en V-1.1.83):**
1. `www.vivebienn.com` respondía **200** con el mismo sitio: la sesión de Firebase se guarda **por dominio** (entrar en uno y abrir el otro = «sin sesión») y Google veía contenido duplicado.
2. Los alias `*.vercel.app` del despliegue de producción (el que imprime `vercel --prod`, p. ej. `vive-bien-oeo2kc057-…`) **no están** en la lista → ahí «Continuar con Google» siempre daba `auth/unauthorized-domain`.
3. Si el navegador bloqueaba la ventana, o si se abría dentro de Instagram/Facebook/WhatsApp, no había salida.
4. El sitio pintaba el código crudo de Firebase: la persona no sabía qué hacer.

**Descartado:** el cliente OAuth de Google (acepta el `redirect_uri` de Firebase y lleva a la pantalla normal de acceso), el servidor (0 errores 5xx; `/api/usuarios/me` 200 a sesiones reales) y los tiempos agotados durante las pruebas (eran la conexión lenta de la máquina de pruebas hacia Google, no del sitio: se repitieron con reintentos y pasaron al primer intento).

## Evidencia
**Dominios autorizados** (`GET identitytoolkit.googleapis.com/v1/projects?key=…`, la clave web es pública):
- 19-sep: `localhost`, `vivebien-84685.firebaseapp.com`, `vivebien-84685.web.app`, `vive-bien.vercel.app`, `vive-bien-grupo-p-once.vercel.app`, `vivebienn.com`.
- 22-sep (y el navegador recibe lo mismo): `www.vivebienn.com`, `vivebienn.com`.

**Cliente OAuth** `804873345978-hj52…apps.googleusercontent.com` (sondeo sin credenciales):
- `redirect_uri=https://vivebien-84685.firebaseapp.com/__/auth/handler` → pantalla normal de acceso de Google ✔ (lo que usa hoy la ventana).
- `redirect_uri=https://vivebienn.com/__/auth/handler` → **`Error 400: redirect_uri_mismatch`** → por eso el plan B por redirección necesita un paso en Google Cloud (abajo).

**Producción tras V-1.1.83:**
| Petición | Respuesta |
|---|---|
| `https://vivebienn.com/`, `/propiedades?op=venta`, `/dashboard` | 200 · `canonical` y `og:url` = `https://vivebienn.com/…` · `robots.txt` → sitemap en `vivebienn.com` · sitemap sin URLs `www` |
| `https://www.vivebienn.com/propiedades?op=venta&tipo=nave` | **308** → `https://vivebienn.com/propiedades?op=venta&tipo=nave` |
| `https://www.vivebienn.com/propiedades/sanjuan?utm_source=whatsapp` | **308** → misma ruta y consulta en `vivebienn.com` |
| `http://www.vivebienn.com/contacto?x=1` | 308 (HTTPS, Vercel) → 308 → `https://vivebienn.com/contacto?x=1` · 200 |
| `https://vive-bien.vercel.app/dashboard?prueba=1` | **308** → `https://vivebienn.com/dashboard?prueba=1` |
| `https://vive-bien.vercel.app/api/alertas/resumen` | 401 de la ruta (no se redirige `/api`: el cron sigue igual) |

**Navegador real contra producción** (`scripts/verificar-dominios-google.mjs`, hasta 3 intentos): `vivebienn.com/dashboard` y `www.vivebienn.com/dashboard?prueba=1` (→ `vivebienn.com/dashboard?prueba=1`) abren la ventana y llegan a `accounts.google.com/v3/signin/identifier`, **al primer intento**, sin códigos en pantalla. Ventana bloqueada en `/dashboard` y `/admin` → frase clara; navegador de Instagram → guía para abrir fuera.

**Build local contra Firebase real** (`scripts/verificar-acceso-google.mjs`; el build se sirve como `vivebienn.com` dentro del navegador de prueba):
| Caso | La persona ve | Bitácora |
|---|---|---|
| Dirección no autorizada (`127.0.0.1`, `localhost`, `/admin`) | «Desde esta dirección no se puede entrar con Google…» + **Ir a vivebienn.com** (misma página) | `auth/unauthorized-domain` |
| Escritorio: ventana → Google → la cierra | «Se cerró la ventana de Google antes de terminar…» (aviso, no error) | `auth/popup-closed-by-user` |
| Ventana bloqueada (`/dashboard`, `/admin`) | «Tu navegador bloqueó la ventana de Google…» | `auth/popup-blocked` |
| iPhone: ventana → Google → la cierra | igual que arriba | ✔ |
| Instagram (iPhone) · Facebook (Android) | cómo abrirlo en el navegador + **Copiar enlace** (+ **Abrir en Chrome** en Android) | `vivebien/navegador-incrustado` |

Capturas: `1-dominio-no-autorizado-escritorio.png`, `2-ventana-bloqueada-escritorio.png`, `3-instagram-iphone.png` (en esta carpeta).

**Bitácora en producción:** un envío de prueba etiquetado (`vivebien/prueba-despliegue`, `donde: prueba-despliegue`) → `audit_logs.id = 256`, `actor_uid = 'anonimo'`, sólo campos acotados; los campos `mensaje` y `correo` que se mandaron a propósito **no se guardaron**. Se deja la fila (es la bitácora; está etiquetada).

**Después de entrar:** `Google → Firebase → token → GET /api/usuarios/me (200) → rol → destino` — probado con el manejador real para cliente, publicador, admin y super_admin (`tests/acceso-google.test.ts`); en producción, los 200 de las 17:03 y 17:24 (V-1.1.82) y los de las **18:09 sobre V-1.1.83**, entrando desde `www` (cuenta super admin → `/admin`).

## Cambios (V-1.1.83)
| Archivo | Qué |
|---|---|
| `next.config.ts` | `www` → 308 a `https://vivebienn.com` (ruta y consulta); en producción, alias `*.vercel.app` → 308 salvo `/api/*`; proxy `/__/auth/*` preparado (inerte) |
| `src/lib/acceso/google.ts` (nuevo) | Reglas sin Firebase: frases, cancelación, motivos, navegadores incrustados, cuándo es fiable la redirección, bitácora acotada, `destinoTrasEntrar` |
| `src/lib/acceso/entrar-google.ts` (nuevo) | El flujo único: ventana → plan B (sólo con proxy) → frase; regreso de la redirección; envío a la bitácora |
| `src/components/acceso/EntrarConGoogle.tsx` (nuevo) | `useEntrarConGoogle` + `AvisoEntrada` (Ir a vivebienn.com, Copiar enlace, Abrir en Chrome) |
| `src/app/api/acceso/registro/route.ts` (nuevo) | Bitácora anónima → `audit_logs` (`acceso.google_fallo`), 204 siempre, con tope |
| `src/lib/limites.ts` | Tope `acceso` (20 / 10 min por origen) |
| `src/app/dashboard/page.tsx`, `src/components/admin/AdminShell.tsx`, `src/components/portal/PortalShell.tsx`, `src/app/admin/seed/page.tsx` | Usan el flujo único; sin códigos crudos (también al crear cuenta con correo) |
| `tests/acceso-google.test.ts` (nuevo) | 72 pruebas (casos A–M) |
| `scripts/verificar-acceso-google.mjs`, `scripts/verificar-dominios-google.mjs` (nuevos) | Verificación con navegador real (local y producción) |
| `vitest.config.mts` | 60 s por prueba (el ensayo PGlite llegó a 22 s con la suite completa) |

## Configuración
- **Hecha por el dueño (consola de Firebase):** dominios autorizados = `vivebienn.com`, `www.vivebienn.com`. **No volver a modificarla mientras producción funcione.** (`www` ya redirige; su entrada no estorba.)
- **Requerida para cerrar el incidente:** ninguna.
- **Desarrollo local:** `localhost` ya **no** está autorizado, a propósito. En `localhost`, «Continuar con Google» enseña la frase de dirección no autorizada; **el acceso con correo y contraseña sí funciona** (no depende de esa lista). Si algún día hace falta Google en local, el dueño debe añadir `localhost` **explícitamente** en Firebase → Authentication → Settings → Authorized domains.
- **Opcional, después (plan B por redirección y que Google diga «Ir a vivebienn.com» en vez de `vivebien-84685.firebaseapp.com`):**
  1. Google Cloud Console → proyecto de Firebase `vivebien-84685` → APIs y servicios → Credenciales → cliente OAuth web `804873345978-hj52…` → **URI de redireccionamiento autorizados** → añadir `https://vivebienn.com/__/auth/handler` (sin borrar el de `firebaseapp.com`).
  2. Vercel → proyecto `vive-bien` → Settings → Environment Variables → `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` (Production) = `vivebienn.com` → nuevo despliegue.
  3. Verificar: la ventana de Google dice «Ir a vivebienn.com»; con ventanas bloqueadas, la página se va a Google y vuelve con sesión. Para deshacer: devolver la variable a `vivebien-84685.firebaseapp.com` y desplegar.

## Pruebas
- `tests/acceso-google.test.ts`: **72** pruebas. Suite completa: **692/692**. CI en `840e1f8`: tipos ✔, pruebas ✔ (46 archivos).
- Lint: **0 errores nuevos**; `src/app/dashboard/page.tsx` 17 → 16. Mismo alcance que la línea base de V-1.1.82: 65 → 64 (errores previos, sin relación).
- Build de producción (`npx next build`): compila, 42/42 páginas; el de Vercel, igual.

## Riesgos pendientes
1. **Ventana bloqueada** (Safari estricto, bloqueadores): sin plan B automático hasta el paso opcional; la frase explica qué hacer (permitir ventanas o entrar con correo).
2. **Navegadores dentro de apps:** Google no deja entrar ahí (`disallowed_useragent`), ni con plan B. La guía lleva al navegador; en iPhone no hay forma de abrir Safari desde la página: la persona usa el menú de la app.
3. **La lista de dominios autorizados se edita a mano.** Si se quita `vivebienn.com`, nadie entra con Google. Vigilar `audit_logs` (`acceso.google_fallo`, campo `anfitrion`).
4. Sesiones abiertas antes en `www`: quedan huérfanas; esas personas entran una vez más en `vivebienn.com`.
5. Fila de prueba `audit_logs.id = 256` (etiquetada) y un despliegue duplicado idéntico (`vive-bien-6v0qhg1dp`, sin efecto).
