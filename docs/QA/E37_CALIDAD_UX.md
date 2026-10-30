# E-37 — Accesibilidad, performance y UX (8-oct-2026) · preparado, NO desplegado

Base: producción E-35. Árbol de trabajo: `vivebien-deploy-stage-e36` (E-36 + E-37). Sin rediseño: solo colores de texto con contraste insuficiente, un landmark y la baseline de la ficha. Marca intacta (`#A30D12`, `#1A1A1A`, `#6B7280`, `#F3F0EA`, `#FFFFFF`; logo sin tocar). **V-1.1.95 intacto** (ver «Bloqueado por la regla de V-1.1.95»).

## Accesibilidad (axe, 6 rutas × 390/768/1024/1440 = 24 mediciones; E-35 = producción)
| Impacto | E-35 (antes) | E-37 (después) | Δ | Regresiones |
|---|---|---|---|---|
| critical | 8 | 8 | 0 | 0 |
| serious | 108 | **56** | −52 | 0 |
| moderate | 204 | **76** | −128 | 0 |
| minor | 4 | 4 | 0 | 0 |
Por ruta (a 390 px): portada 0 serious; ficha pausada 0 serious; contacto 0 serious; panel y `/entrar` sin serious. **Lo que queda serious/critical (56 + 8) es TODO del catálogo:** 14 `color-contrast` + 2 `select-name` por ancho, en `PropertyCard.tsx` y `propiedades/page-client.tsx` (V-1.1.95).

### Cambios (4 archivos, solo texto/landmark; ver `tests/e37-accesibilidad.test.ts`)
| Archivo | Cambio | Contraste |
|---|---|---|
| `src/app/contacto/page-client.tsx` | etiquetas `#888` → `#5F6672`; enlace de WhatsApp `#25D366` → texto `#0B6B3A`; enlace de ubicación `#D97706` → `#92400E`; los 2 botones de WhatsApp: texto blanco → `#1A1A1A` | 3,08→5,04 · 1,72→5,76 · 2,77→6,18 · 1,98→8,78 |
| `src/app/not-found.tsx` | `#888` → `#5F6672`; botón WhatsApp: texto `#1A1A1A` | 3,54→5,78 · 1,98→8,78 |
| `src/components/Consentimiento.tsx` | aviso `#8B95A3` → `#6B7280` (gris de marca) | 3,03→4,83 |
| `src/app/page-client.tsx` (portada) | botón de búsqueda: texto `#0A0E1A` → `#FFFFFF` sobre `--rojo-marca`; contenido entre `<Header/>` y `<Footer/>` dentro de un `<main>` (axe `region`: 32 nodos → 1) | 3,27→5,88 |
No cambia ninguna otra clase, token ni el logo. Los botones de WhatsApp mantienen su verde; solo el texto pasa a oscuro (blanco sobre `#25D366` es 1,98:1 y no se puede arreglar sin cambiar el verde de WhatsApp).
**Regresión (rojo → verde):** `tests/e37-accesibilidad.test.ts`, 9 pruebas (pares de color con la fórmula WCAG + archivos que los usan + `<main>`): **4 rojas contra producción (E-35), 9 verdes con E-37**. axe sigue siendo medición, no puerta.
**moderate restantes (76):** `region` (catálogo 9/ancho — V-1.1.95, contacto 2, ficha pausada 1), `heading-order` (portada 1, ficha pausada 1) y los 3 de landmarks del panel (`landmark-main-is-top-level`, `landmark-no-duplicate-main`, `landmark-unique`: estructura del shell del panel). **minor (4):** `aria-allowed-role` en `/entrar`. P3: no se tocan por riesgo/beneficio (afectan estructura de layouts compartidos).

### Bloqueado por la regla de V-1.1.95 (NO se tocó; reportado)
- `src/app/propiedades/page-client.tsx`: **2 `select` sin nombre accesible** (`select-name`, **critical**) y buena parte de los 14 contrastes del catálogo. Arreglo propuesto: `aria-label` en los dos `<select>` de filtros y gris de texto `#5F6672` en las etiquetas de filtros.
- `src/components/PropertyCard.tsx`: gris `#888`/`#777` en textos secundarios de la tarjeta (2,95–4,47:1). Arreglo propuesto: `#5F6672`.
Esos dos archivos son las versiones «saneadas» en producción y completas de V-1.1.95 en el repo: cambiarlas aquí divergiría de V-1.1.95. **Necesita tu decisión** (editarlas en la rama de V-1.1.95, o autorizar la excepción documentada).

## Ficha pública: baseline reproducible (E37-02)
`/propiedades/casa-en-venta-canada-del-regugio-norte-540-m2-leon-n8tl` (VB-2026-00026, **propiedad pública real**; ninguna inventada). Se grabaron 4 lecturas anónimas de solo lectura en `tests-visual/fixtura/publico.json` (ahora 7 entradas: ficha, fotos, similares) y se generaron 3 capturas (1440/768/390). Replay: **2/2 pasa con 0 peticiones reenviadas a producción**. Manifiesto (`BASELINES.json`): 48 capturas, versión `E-37`, estado `vigente`, fixtura, viewport, ruta y sha256 (`escritorio-1440 a7c1fe7b…`, `tableta-768 72b2b84b…`, `movil-390 21d0baff…`). Límite: las fotos vienen de Cloudinary (URLs versionadas, inmutables) y se cargan de la red; sin internet la captura fallaría. Visual: **45 + 3 = 48 pasan**; ningún baseline antiguo se regeneró (los cambios de color caben en la tolerancia del 1 %).

## Imágenes (E37-03, solo lectura)
Revisión de `PropertyCard`, catálogo, ficha y portada (producción): tarjeta con `loading="lazy"`, `srcset`/`sizes` y `width/height`; héroe del catálogo y foto principal de la ficha con `fetchPriority="high"` **solo uno por página** (el LCP) y miniaturas/lightbox en `lazy`; `imgResponsiva` limita a anchos 400–1920 (`ANCHOS`); sin cambios de Cloudinary. **No se modificó nada** (cumple el criterio y está medido: ficha LCP 7948→1004 ms y listado 6,2→1,2 MB en E-34). Observación P3: la foto principal de la ficha y el héroe del catálogo no declaran `width/height` (el contenedor reserva el espacio; CLS medido 0,000–0,054), y tocarlos implica `propiedades/*page-client` (V-1.1.95).

## Timeouts (E37-04, solo lectura)
Ya cubierto por R-06/E-34: `lib/supabase-servidor.ts` aborta de verdad las **lecturas** (4 s públicas / 10 s API; escrituras nunca) y deja contador + línea de log sin la consulta; la ficha tiene presupuesto propio con copia en caché (`ficha-servidor.ts`) y el catálogo corta a 8 s y sirve la última copia (8 pruebas de caos). Manejo explícito de timeout/cancelación/error de proveedor: `AbortSignal` combinado con el del llamante, `NoCacheable` y `desactualizado:true`. Sin timeout universal nuevo (no se midió necesidad).

## CLS de `/entrar` (E37-05)
`entrar-cls.e2e.ts` (Pixel 7 = 390, iPad = 768, escritorio) **pasa 3/3** en el árbol E-37 (CLS < 0,1). Sin reabrir el arreglo.

## Verificación
`tsc` limpio · Vitest (árbol de trabajo): las suites nuevas y afectadas pasan; solo los 8+2 ajenos de siempre · build OK · Playwright visual **45/45** (antes de añadir la ficha) y **48/48** con ella · e2e **95 pasan** (9 omitidas) · axe arriba (0 regresiones) · baselines manifest verificado (48, 0 problemas). Lighthouse: no se ejecutó (solo señal; la validación son axe, CLS e2e y vitals de E-34). **Codex:** BLOCKED por cuota (hasta el 6-nov-2026).
**Archivos modificados:** `src/app/page-client.tsx`, `src/app/contacto/page-client.tsx`, `src/app/not-found.tsx`, `src/components/Consentimiento.tsx` (payload); nuevos/QA: `tests/e37-accesibilidad.test.ts`, `tests-visual/axe-cierre.e2e.ts` (ahora registra los nodos), `tests-visual/sitio-publico.visual.ts` + `fixtura/publico.json` + 3 capturas `ficha.png` + `BASELINES.json`, `scripts/qa/baselines.cjs` (ruta concreta de la ficha). Sincronizados al repo (que era idéntico a producción en los 4 archivos de código).
**Pendiente / P3:** catálogo (decisión V-1.1.95), `heading-order`/`region` residuales, `aria-allowed-role` de `/entrar`, `width/height` de la foto principal. **Rollback:** restaurar los 4 archivos de E-35.
