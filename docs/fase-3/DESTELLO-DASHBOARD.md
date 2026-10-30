# El destello del panel antiguo

**Fase 3b-3 · D-45 · 25-sep-2026 · V-1.1.92 · desplegado, QA visual pendiente**

---

## El síntoma

Al entrar, durante 200-600 ms se veía el portal de cliente antiguo —cabecera blanca redondeada,
«Portal de Cliente», «Primeros pasos»— y después la página saltaba a `/portal` o a `/admin`.

## Causa raíz

```ts
const isAdmin = rol === 'admin'        // y `rol` empieza en null
```

Ese `null` significaba **dos cosas a la vez**:

- «todavía no sé qué rol tiene» (mientras `/api/usuarios/me` viaja por la red), y
- «ya lo sé y no es admin».

Como `null !== 'admin'`, la página se metía por la puerta de «no es admin» y **montaba el portal
antiguo entero** antes de saber a dónde iba esa persona. Cuando llegaba la respuesta,
`router.replace()` navegaba.

La secuencia exacta:

| | |
|---|---|
| 1 | `onAuthStateChanged` resuelve **desde IndexedDB, sin red**: `setUser(u)` y `setAuthLoading(false)` |
| 2 | React repinta: `authLoading` false, `user` existe, **`rol` sigue `null`** → **portal antiguo** |
| 3 | *Sólo entonces* arranca `fetch('/api/usuarios/me')` — 200-600 ms |
| 4 | Responde, se decide el destino y se navega |

El destello es la ventana entre 2 y 4. **Le pasaba también a los administradores:** con `rol` en
`null` veían el portal de cliente antes de irse a `/admin`.

## Lo que NO era

- **No era el HTML del servidor.** Medido: 0 coincidencias del panel antiguo, antes y después. Todo
  está detrás de las puertas de render, y el servidor sólo ve `authLoading = true`.
- **No era caché ni lentitud.** Era una decisión tomada con información incompleta.

## Por qué no se resuelve en el servidor

La sesión de Firebase vive **entera en el navegador**: no hay cookie, y `verifyIdToken` sólo lee
`Authorization: Bearer`. Un componente de servidor en `/dashboard` no tiene forma de saber quién
eres, así que no puede redirigir. Hacerlo server-side exigiría una cookie de sesión —un segundo
mecanismo de autenticación junto al de Firebase—, que es justo lo que no se quiere.

Lo que sí se garantiza, y es lo que importa: **el panel antiguo no llega a montarse**.

## La solución

La decisión se extrae a [`src/lib/acceso/destino-dashboard.ts`](../../src/lib/acceso/destino-dashboard.ts),
pura, con estados explícitos:

```ts
type Pantalla =
  | { estado: 'resolviendo' } | { estado: 'acceso' }
  | { estado: 'redirigir'; destino: '/portal' | '/admin' } | { estado: 'clasico' }

type EstadoDelPerfil = 'cargando' | 'sin_perfil' | PerfilDeEntrada
```

**`'cargando'` («no sé») y `'sin_perfil'` («terminó y no hay») son valores distintos.** Ningún valor
puede volver a significar las dos cosas: esa ambigüedad *era* el fallo.

### Antes / después

```
ANTES                                   AHORA
authLoading   → spinner                 authLoading      → mínima «Vive Bien»
!user         → acceso                  !user            → acceso
!isAdmin      → PORTAL ANTIGUO ⚡        ?clasico=1       → clásico  (única puerta)
else          → panel admin             perfil cargando  → mínima «Vive Bien»   ← LA PUERTA NUEVA
                                        admin            → /admin
       …y luego router.replace()        portal abierto   → /portal
                                        portal cerrado   → clásico
```

El orden de la decisión:

| # | Condición | Resultado |
|---|---|---|
| 1 | sin saber si hay sesión | `resolviendo` |
| 2 | sin sesión | `acceso` |
| 3 | `?clasico=1` | `clasico` — escotilla explícita, no hace falta perfil |
| 4 | **perfil sin resolver** | **`resolviendo`** ← aquí estaba el fallo |
| 5 | administración | `/admin` |
| 6 | portal abierto | `/portal` |
| 7 | resto | `clasico` |

Y `destinoTrasEntrar` pasa a **delegar en la misma función**: la regla que decide si se navega y la
que decide qué se pinta no pueden discrepar.

### Lo que no se hizo

No se esconde con `display:none`, ni con `opacity`, ni con un spinner encima. El panel antiguo **no
se construye** mientras se resuelve. Hay pruebas que lo vigilan.

## La medición

**Antes, en el DOM** — muestreo cada 100 ms, con 600 ms de retraso en `/api/usuarios/me`:

```
   0ms /dashboard · Vive Bien | Entrando…
 100ms /dashboard · Portal de Cliente | qa@ejemplo.invalid | Publicar | Mi perfil…   ⚡
 …
 600ms /dashboard · Portal de Cliente | …                                            ⚡
 700ms /dashboard · Vive Bien | Entrando…
```

**Después:** 4 roles × 3 tamaños × 16 muestras = **192 muestras, 0 con el panel antiguo.** Todos
llegan a su panel entre 900 y 1100 ms.

### El instrumento tuvo que rehacerse

El primer medidor usaba un `MutationObserver` y leía su resultado al final. **Daba verde incluso con
el fallo puesto**, porque al navegar a `/portal` la página nueva reiniciaba la variable donde
anotaba: medía el estado final, que siempre está limpio.

Se tiró y se rehizo con muestreo. Validación del instrumento:

| | Resultado |
|---|---|
| Con el fallo reintroducido | **12/12 en rojo** («el panel antiguo se vio en 300ms, 400ms, 500ms») |
| Con el arreglo | **12/12 en verde** |

Un instrumento que no detecta el fallo no es evidencia de nada.

## Las pruebas

[`tests/destino-dashboard.test.ts`](../../tests/destino-dashboard.test.ts) — **25 pruebas**:

- **La del fallo:** `authLoading=false`, `user`, `rol=null` → `resolviendo`, **jamás** `clasico`.
- `'cargando'` y `'sin_perfil'` son estados distintos.
- Los cuatro destinos, `?clasico=1` para cualquiera, sin sesión, portal cerrado por flag, suspendido
  y eliminado, los tres refrescos, ausencia de bucles, y Google y contraseña.
- **Guardas de código:** la puerta de resolución está *antes* que la del panel antiguo · no hay
  `display:none` / `opacity:0` / `visibility:hidden` · `router.replace` sólo se llama con lo que
  devuelve la decisión · no se cargan datos del panel que nadie verá · la pantalla mínima no contiene
  nada del panel antiguo.

Reintroduciendo el fallo caen 3.

## Una corrección propia

Se había añadido `rol === 'super_admin'` a la detección de administración, y rompió una prueba
existente. **La prueba tenía razón:** `/api/usuarios/me` nunca emite ese valor —`resolverPerfil` lo
traduce a `rol: 'admin'` + `superAdmin: true`—, así que aceptarlo era inferir permisos de una forma
que la API no produce. Se quitó.

## Resultados

| | |
|---|---|
| Tests | **1046 en 65 archivos, verdes** (antes 1021/64) |
| Typecheck · Build | limpios |
| Lint | 63 errores / 39 avisos — idéntico al baseline; los archivos nuevos, limpios |
| Medición DOM | 192 muestras, 0 con el panel antiguo |
| Deployment | `dpl_4FdoCRzQJmL9A9AckaPhwYd4Xrjw`, commit `bd83525`, READY |

## Riesgos

| # | Riesgo | Estado |
|---|---|---|
| R-15 | La resolución es de cliente, no de servidor | Inevitable sin cookie de sesión, que sería un segundo sistema de autenticación |
| R-16 | Con red muy lenta, la pantalla mínima dura más | Correcto: mejor una pantalla honesta que un panel equivocado |
| R-17 | Una cuenta suspendida o eliminada cae al clásico (`sin_perfil`) | Comportamiento de hoy; sus APIs la siguen cortando con 403 |
| R-18 | El medidor siembra una sesión en IndexedDB | Frágil ante cambios internos de Firebase, pero está validado y falla ruidosamente |

## QA visual en producción — **PENDIENTE**

Lo hace el dueño. Para **CLIENTE → PUBLICADOR → ADMIN → SUPER ADMIN**, primero escritorio y después
móvil:

1. Cerrar sesión · 2. volver a entrar · 3. **observar el primer instante** · 4. refrescar
`/dashboard` · 5. comprobar el destino · 6. probar `?clasico=1` · 7. probar Google y contraseña.

**No debe aparecer ni un instante:** «Portal de Cliente» · «Primeros pasos» · «¿Tienes una propiedad
que vender o rentar?» · la cabecera blanca redondeada del panel anterior.

Hasta que eso esté hecho, esta etapa **no se da por cerrada**, por muchos 192/192 que diera el script.
