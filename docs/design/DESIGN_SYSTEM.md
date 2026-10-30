# Design System VIVE BIEN

## La fuente oficial

**[`manual-identidad-2025.jpg`](manual-identidad-2025.jpg)** — Manual de
Identidad de Marca, 2025. En el repositorio desde el 29-sep-2026. **Es la
autoridad de marca.**

Cuando el manual y el código discrepan, el manual dice qué *debería* ser y el
código dice qué *es*. Se documentan por separado y **la diferencia la decide el
dueño**.

## Dónde está cada cosa

**El contenido vive en la skill**, para que Claude lo cargue cuando toca:

```
.claude/skills/vivebien-design-system/
├── SKILL.md                    la jerarquía, el flujo, lo que no es VIVE BIEN
├── brand.json                  la marca legible por herramientas, en 4 grupos
└── references/
    ├── marca.md                propósito, promesa, tono, eslogan
    ├── logo.md                 versiones reales y lo que está prohibido
    ├── color.md                tokens reales, los tres rojos, contraste medido
    ├── tipografia.md           Montserrat y Playfair: dónde y por qué
    ├── fotografia.md           inmueble real vs conceptual; qué puede la IA
    ├── responsive.md           cinco disposiciones y la regla de la bisagra
    ├── componentes.md          inventario y auditoría A–E
    ├── accesibilidad.md        contraste, foco, nombres accesibles
    └── pendientes.md           17 decisiones abiertas y deuda visual
```

Este archivo sólo dice **dónde está cada cosa** y qué estado tiene. No duplica
el contenido: dos copias se separan.

### `brand.json` — cuatro grupos que no se mezclan

| Grupo | Qué contiene |
|---|---|
| `official` | Lo que dice el manual. La autoridad |
| `manualExample` | Teléfono, correo y web **de relleno** del manual. No son los reales |
| `currentImplementation` | Lo que el código usa hoy. Puede no coincidir |
| `pendingValidation` | Las 8 decisiones abiertas |

Aparte va `derivado`: criterios de dirección de diseño inferidos, **sin la
autoridad del manual**.

## La paleta oficial

| Color | Hex | Significado |
|---|---|---|
| **Rojo Vive Bien** | **`#A30D12`** | Energía · Confianza |
| Carbón | `#1A1A1A` | Elegancia · Solidez |
| Gris | `#6B7280` | Profesionalismo · Equilibrio |
| Arena | `#F3F0EA` | Calidez · Armonía |
| Blanco | `#FFFFFF` | Claridad · Espacio |

**Tipografía corporativa: Montserrat.** El producto ya la usa como familia
principal, así que ahí no hay conflicto.

**Ninguno de los tres rojos del código es `#A30D12`.** Ver
`references/color.md`.

## Estado

| Bloque | Estado |
|---|---|
| Marca (propósito, promesa, valores, eslogan, frases) | **Oficial** · manual 2025 en el repositorio |
| Logotipo | **Oficial** (4 versiones, área 1X, 120 px / 30 mm) · **faltan 3 assets** |
| Color | **Oficial** · **6 discrepancias abiertas con el código** |
| Tipografía | **Oficial: Montserrat.** Playfair existe pero no es oficial |
| Aplicaciones físicas | **Oficial** · tarjeta, fachada, oficinas, uniformes, papelería, firma |
| Fotografía | Documentado y cerrado |
| Responsive y plegables | Documentado y verificado en producción |
| Accesibilidad | Documentado con cifras medidas |
| Componentes | **Inventariado y auditado (A–E)** |
| Fundamentos (spacing, grid, radios, sombras, motion, z-index) | **[PENDIENTE]** — se extraerán de los tokens cuando se decida el color |
| Patrones (listado, ficha, portal, publicador, leads, citas) | **[PENDIENTE]** — según avance cada fase |

## Lo que la auditoría encontró

**Hay dos mundos.** El producto nuevo (portal, panel, `/entrar`) usa Tailwind,
shadcn y tokens. El sitio legado (dashboard clásico, `/mi-cuenta`,
`/publicador`, `Header`, `PropertyCard`) usa estilos en línea — 237 sólo en el
dashboard clásico. Unificarlos es la fase 22, no esta.

Detalle y clasificación en `references/componentes.md`.

## Qué NO se hizo en esta fase

No se instalaron skills · no se descargaron repositorios · no se rediseñó
ninguna pantalla · no se cambiaron colores, tipografías ni el logotipo · no se
tocó `/entrar`, `globals.css`, E-20, ESLint ni producción.

**Auditar, definir y documentar.** Nada más.
