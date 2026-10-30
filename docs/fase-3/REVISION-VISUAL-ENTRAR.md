# Revisión visual de `/entrar` — V-1.1.93, tarea 03.07

**Fecha:** 2026-09-28 · **Modo:** sólo lectura. No se corrigió nada.
**Entorno:** `http://localhost:3140` (dev, Turbopack). Producción no se tocó.
**Instrumento:** `scripts/revisar-entrar.mjs` (Playwright + axe-core).
**Capturas:** `docs/fase-3/capturas/entrar/` (16 PNG + `resultados.json`).

Firebase quedó interceptado con respuestas simuladas: **no se creó ninguna
cuenta y no se envió ningún correo**.

---

## Lo que salió bien

| Comprobación | Resultado |
|---|---|
| Desbordamiento horizontal | 0 en los 10 viewports |
| Disposición esperada | 9 de 10 (ver §3 sobre el atributo) |
| `sessionStorage` | `{"correo":"…","pestana":"crear"}` — **sin contraseña** |
| Restaurar tras recargar | correo y pestaña activa vuelven |
| Orden de tabulación | 9 controles, foco visible en todos |
| `siguiente` legítimo | `/portal/…`, `/admin/…`, `/dashboard?clasico=1` se conservan |
| `siguiente` hostil | `https://otro.com/…` y `//otro.com` se descartan |
| `/dashboard` sin sesión | → `/entrar?siguiente=%2Fdashboard` |
| `/dashboard?clasico=1` | se queda, muestra la tarjeta clásica |
| `prefers-reduced-motion` | `transition: none` |

---

## Los cuatro defectos reales

### 1 · `Entrar.tsx` implementa 2 de las 5 disposiciones

`plegables.ts` decide bien las cinco (sus pruebas unitarias pasan). El
componente sólo distingue dos:

```ts
const columnas = disposicion === 'dos-zonas' || disposicion === 'amplia'
// gridTemplateColumns: columnas ? '1fr 1fr' : '1fr'
```

`una-zona-de-dos`, `apilada` y `compacta` caen todas en la misma columna
estirada. En `09-plegable-estrecho` la disposición se calcula correctamente
como `una-zona-de-dos` —todo debería caber en un segmento— y la tarjeta ocupa
`x 90–530`, cruzando el pliegue de lado a lado.

### 2 · `dos-zonas` parte la pantalla al 50 %, no por la bisagra

Medido en 884×1104 con segmentos de 430 px y bisagra en `x 430–454`:
`gridTemplateColumns: 442px 442px`. El corte cae en 442, dentro de la bisagra.

`huecoDeLaBisagra()` se calcula, se devuelve en el hook… y **no se usa para
maquetar**. Resultado: 10 elementos sobre el pliegue en el viewport 08
(el `h1`, los dos `input`, «Iniciar sesión», «Continuar con Google»), 10 en
el 09 y la foto en el 10.

Es exactamente lo que el informe de plegables prohibía: *nunca colocar
contenido crítico atravesando una bisagra*.

### 3 · Desajuste de hidratación: `data-disposicion` se queda congelado

Consola: *«A tree hydrated but some attributes of the server rendered HTML
didn't match the client properties. This won't be patched.»*

El servidor no puede medir la pantalla, así que `medir()` devuelve
1440×900 → `amplia`. El cliente calcula otra cosa. React **no parchea**
atributos que no casan en la hidratación, y como los renders posteriores
producen el mismo valor que su árbol interno ya guarda, no hay diferencia que
aplicar: el atributo se queda en `amplia` para siempre. Comprobado — sigue en
`amplia` incluso después de un `resize`.

Hoy no se ve porque `amplia` y `dos-zonas` pintan lo mismo (§1). En cuanto se
arreglen las cinco disposiciones, este desajuste **sí** se verá.

### 4 · Una contraseña mal escrita dice «No se pudo entrar con Google»

Con `INVALID_LOGIN_CREDENTIALS` en `accounts:signInWithPassword`:

- el `role="alert"` del formulario se queda **vacío**;
- aparece el aviso de Google: *«No se pudo entrar con Google. Inténtalo de
  nuevo en un momento.»*

Afecta a contraseña incorrecta, correo no registrado y alta de cuenta. El
usuario recibe un mensaje sobre un método que no ha usado.

---

## Accesibilidad

- **`color-contrast` (serio), 3–4 nodos en los 10 viewports.** Es el único
  hallazgo serio de axe; se repite en todos.
- **Nombre accesible duplicado:** «Crear cuenta» es a la vez la pestaña y el
  botón de envío. Un lector de pantalla anuncia dos controles idénticos.
- Sin violaciones de orden de foco ni de etiquetado.

## Otros

- El botón flotante «Contactar por WhatsApp» se cuela sobre la pantalla de
  acceso. No pertenece aquí.

---

## Qué NO hay que tocar

`plegables.ts` (la lógica pura acierta en los cinco casos), la validación de
`siguiente`, la ausencia de la contraseña en `sessionStorage`, la escotilla
`?clasico=1`, el respeto a `prefers-reduced-motion`, y el logo.

## Pendiente de la etapa

Assets definitivos (el usuario pidió evaluar la composición primero), logo SVG
sin «Grupo inmobiliario», verificación en un plegable real, retirada de la
tarjeta del dashboard.


---

# Corrección y verificación — 28 de septiembre de 2026

Todo lo de arriba está corregido y verificado. Sin commit, sin push, sin deploy.

## Archivos tocados (7)

| Archivo | Qué cambió |
|---|---|
| `src/lib/pantalla/plegables.ts` | `MEDIDA_SSR` y `rejillaDe()`: los carriles de las cinco disposiciones |
| `src/hooks/usePlegable.ts` | Hidratación, `rejilla`, `medido`, re-medida en `pageshow` |
| `src/components/acceso/Entrar.tsx` | Reescrito: composición del mockup y las cinco disposiciones |
| `src/lib/acceso/google.ts` | `mensajeDeContrasena`, `mensajeDeRecuperacion`, `SIN_CONEXION`, `silencioPorPrivacidad` |
| `src/components/WAFloat.tsx` | `ocultarBoton()` y `/entrar` fuera |
| `tests/entrar-disposiciones.test.ts` | Nuevo: 32 pruebas (A–O) |
| `scripts/verificar-entrar.mjs` | Nuevo: verificación en navegador, sale ≠ 0 si algo falla |

## La bisagra es un carril, no un margen

Medido en el navegador, no deducido:

| Aparato | Carriles reales | Cruzan la bisagra |
|---|---|---|
| 884×1104 · `dos-zonas` | `430px 24px 430px` | 0 |
| 620×900 · `una-zona-de-dos` | `300px 20px 300px` | 0 |
| 820×1100 · `apilada` | `540px 20px 540px` (filas) | 0 |

Con `1fr 1fr` el corte caía en 442, dentro del pliegue (430–454).

## Prueba adversarial

Cada fallo reintroducido a mano, medido, y restaurado:

| Regresión | Resultado | Qué se rompió |
|---|---|---|
| 1 · volver a `1fr 1fr` | ROJO | 6 pruebas + navegador: 11 elementos sobre la bisagra |
| 2 · quitar el carril de la bisagra | ROJO | 5 pruebas (D, F, G, H.2, K) |
| 3 · no medir tras montar | ROJO | prueba I |
| 4 · mensaje de Google para la contraseña | ROJO | navegador: «No se pudo entrar con Google» |
| 5 · devolver WhatsApp a `/entrar` | ROJO | prueba N |

Base 0 fallos antes y después de cada una.

**Aviso metodológico:** el primer intento de esta batería dio «rojo» en los cinco
casos *incluida la base*, porque Python lanzaba otro Node sin los navegadores de
Playwright. Un rojo universal no demuestra nada, igual que un verde universal.
Se repitió desde bash con la base en 0.

## Un fallo que encontraron las pruebas nuevas

`auth/network-request-failed` en el flujo de contraseña devolvía
`MENSAJES['sin-conexion']`, que dice «No hubo conexión **con Google**». Se añadió
`SIN_CONEXION`, neutral, para contraseña, alta y recuperación.

## Accesibilidad

| | Antes | Ahora |
|---|---|---|
| críticas | 0 | 0 |
| serias | 1 (`color-contrast`, 3–4 nodos) × 10 | **0** |
| moderadas | — | 0 |
| menores | — | 1 × 10 |

Los grises subieron a `#5A626B`. Las pestañas son `tablist`/`tab` de verdad, lo
que deshace el nombre accesible duplicado de «Crear cuenta».

## Batería

- 1130 pruebas en 68 archivos · verde
- typecheck · limpio
- build · «Compiled successfully», `/entrar` dinámica
- lint · 65 errores / 39 avisos sin contar `.claude/` (referencia 63/39). Los
  avisos cuadran. Ningún hallazgo cae en una línea escrita para 03.07; los 6
  errores nuevos con `.claude/` incluido son de
  `.claude/skills/design-system/scripts/*.cjs`, skills instalados ajenos a la
  tarea. Quedan +2 errores sin atribuir a ningún archivo tocado aquí.

## Lo que sigue pendiente

- Logo SVG sin «Grupo inmobiliario» (del dueño) y fotografía definitiva: siguen
  siendo los placeholders, a propósito.
- Verificación en un plegable físico.
- Retirar la tarjeta antigua del dashboard.


---

# El fallo que explicaba «se ve espantoso» — 28-sep, tarde

La corrección anterior dejaba la pantalla funcionalmente correcta y visualmente
mal. La causa no estaba en `/entrar`.

## `globals.css:219` mata las utilidades de margen y relleno de TODO el proyecto

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
```

Ese `*` va **sin capa**. Tailwind v4 emite sus utilidades dentro de
`@layer utilities`, y en CSS **lo no-capado gana siempre a lo capado**, sin
importar la especificidad. Así que `p-4`, `mt-6`, `px-[9%]`, `pl-[52px]`… se
escriben en el JSX, llegan al HTML, existen en el CSS compilado —comprobado:
`.px-\[9\%\]{padding-inline:9%}` está en el bundle— y **no se aplican**.

Medido en el navegador: el contenedor con `px-[9%]` computaba
`padding-left: 0px`; el `h1` con `mt-4`, `margin-top: 0px`.

Eso explica exactamente lo que se veía: el texto pegado al borde izquierdo, el
logo encima de «Bienvenido» y los iconos montados sobre el texto de los campos
(`pl-[52px]` muerto).

**Alcance:** 49 de los 149 componentes `.tsx` usan utilidades de margen o
relleno hoy inertes. Arreglarlo de raíz —meter el reset en `@layer base`— es lo
correcto y despertaría las 49 de golpe, cambiando layouts por todo el sitio.
**Es una tarea aparte**, no de 03.07.

**Lo aplicado aquí** es acotado a la pantalla de acceso: un bloque en
`globals.css` con `margin: revert-layer; padding: revert-layer` para los
descendientes de `[data-pantalla="acceso"]`. `revert-layer` deshace esa
declaración y deja valer la de la capa anterior: la utilidad de Tailwind si la
hay, y el cero del preflight si no. Cero efecto fuera de `/entrar`.

## Dos fallos que sólo aparecieron cuando el espaciado volvió a vivir

1. En `apilada`, el `-mt-9` (pensado para que en móvil la tarjeta monte sobre la
   foto) subía la tarjeta **dentro de la bisagra**. Ahora ese solape es sólo de
   `compacta`.
2. En `apilada`, con `items-center` una tarjeta más alta que el segmento se
   desborda **por arriba** y entra en el pliegue. Se ancló con `items-start` y
   se desplaza.

Ninguno de los dos era visible antes porque el margen negativo tampoco se
aplicaba. El instrumento geométrico los cazó en cuanto el CSS empezó a funcionar.

## Assets: ahora son los del dueño

- `public/acceso/portada.webp` — la fotografía de su propio montaje
  (`10.webp`), con el cielo reconstruido donde el titular venía incrustado, para
  que el titular siga siendo texto real.
- `public/acceso/logo.png` — el logo sin la bajada «Grupo inmobiliario», como en
  el montaje. Es un recorte del PNG: **sigue faltando el SVG**.

## Lint: 03.07 no añadió nada

| Ámbito | Errores | Avisos |
|---|---|---|
| Referencia declarada | 63 | 39 |
| `eslint . --ignore-pattern ".claude/**" --ignore-pattern "*.cjs"` | **63** | **39** |
| …incluyendo `*.cjs` de la raíz | 65 | 39 |
| …incluyendo además `.claude/` | 71 | 40 |

Los «+2» son `seed-sanjuan.cjs` (dos `no-require-imports`), script suelto en la
raíz, rastreado y sin tocar desde marzo. Los «+6 y +1» son
`.claude/skills/design-system/scripts/*.cjs`.

Medido línea a línea: **0 hallazgos de lint caen en una línea escrita para
03.07**, y los seis archivos nuevos están limpios.


---

# Cierre de 03.07 — decisiones del dueño, 28-sep-2026

## Logotipo: se revierte el recorte

El montaje enseña el logo sin la bajada «Grupo inmobiliario», y durante un rato
se usó un recorte del PNG para que encajara. **Se ha deshecho.** El manual de
identidad (recibido el 28-sep) fija el logotipo principal *con* la bajada, y
entre sus usos incorrectos están deformarlo, recolorearlo y contornearlo.
Recortar la composición para que quepa en un diseño es de la misma familia.

`/entrar` usa `public/logo_transparent.png`, el oficial, sin tocar. El recorte
`public/acceso/logo.png` se ha borrado. Hasta que llegue el SVG oficial se
queda así.

## Lo demás que se decidió

- **Los 2 errores de `seed-sanjuan.cjs`** (`no-require-imports`) se quedan.
  Forman parte del baseline histórico y no se tocan desde 03.07.
- **La fotografía reconstruida se mantiene**: fue trabajo aprobado en esta fase
  y está verificada visualmente.
- **Las skills de diseño** son una fase aparte. No se instala nada ahora.
- **`eslint.config` no se toca** todavía: el aislamiento del ruido de `.claude`
  se decidirá al abrir la fase de skills.

## Diferencias detectadas contra el manual de identidad

No se han aplicado: quedan como decisión pendiente.

| Punto | Manual | `/entrar` hoy |
|---|---|---|
| Rojo corporativo | `#A30D12` | `var(--rojo)` = `#8B1A1A` |
| Gris | `#6B7280` | `#5A626B` (subido para pasar contraste AA) |
| Arena | `#F3F0EA` | `#F1EEE9` |
| Tipografía | Montserrat | Playfair Display en los titulares |

Contraste medido: el gris del manual `#6B7280` **sí pasa** AA sobre blanco
(4,83:1) y sobre la tarjeta (4,67:1); **falla sobre el arena del propio manual**
(4,25:1, y AA pide 4,5). El gris de `/entrar` `#5A626B` pasa en los tres fondos
(6,19 / 5,98 / 5,44). Los dos rojos pasan de sobra (8,00 y 9,29 sobre blanco).

O sea: el único choque real de accesibilidad es la combinación gris+arena del
manual para texto pequeño. Lo demás es decisión de marca — y la tipografía del
manual contradice al propio montaje del dueño, que usa una serif en el titular.
