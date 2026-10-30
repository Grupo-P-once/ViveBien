# Skills de diseño — inventario y relación

Auditoría del 29-sep-2026. **No se instaló nada nuevo. No se borró nada.**

## Lo que ya había

La conclusión del inventario fue que **no hacían falta más herramientas
genéricas**. Siete de las nueve capacidades pedidas ya estaban cubiertas; el
hueco real era una autoridad de identidad propia.

| Skill | Peso | En git | Papel |
|---|---|---|---|
| `ui-styling` | 5,8 MB | sí | Estilado técnico, shadcn/ui, accesibilidad |
| `design-system` | 252 KB | sí | Arquitectura de tokens y specs de componentes |
| `ui-ux-pro-max` | 46 KB | sí | Exploración UX/UI: estilos, paletas, guías |
| `frontend-patterns` | 17 KB | sí | Implementación en React y Next.js |
| `nextjs-turbopack` | 5 KB | sí | Bundling incremental |
| `security-review` | 13 KB | sí | Revisión de seguridad |
| `vivebien` | 8 KB | sí | **Contexto del repositorio**, no identidad visual |
| `supabase` + `…-postgres-best-practices` | 197 KB | **no** | Ajenas a esta fase |
| **`vivebien-design-system`** | nueva | — | **Identidad y autoridad visual** |

## La fuente oficial

`docs/design/manual-identidad-2025.jpg` — Manual de Identidad de Marca, 2025.
En el repositorio desde el 29-sep-2026. **Ninguna skill, interna o externa,
puede contradecirlo.**

## La jerarquía

```
1. Reglas de marca VIVE BIEN      ← vivebien-design-system
2. Design System VIVE BIEN        ← vivebien-design-system
3. Reglas UX y de producto        ← vivebien + vivebien-design-system
4. Skills genéricas de UI/UX      ← ui-styling · design-system · ui-ux-pro-max
5. Implementación técnica         ← frontend-patterns · nextjs-turbopack
```

**En caso de conflicto de identidad, gana `vivebien-design-system`.** Una skill
externa no cambia un color, un tipo de letra ni el logotipo.

## Repositorios externos — NO instalados

`frontend-design` (anthropics) · `ui-prototyper-skill` · `designskills` ·
`jezweb/claude-skills` · `ui-mockup-skill` · `claude-design-skills` ·
`dawitlabs/ui-skills`.

**Ninguno evaluado a fondo y ninguno instalado.** Añadirlos duplicaría lo que
`ui-styling`, `design-system` y `ui-ux-pro-max` ya hacen. Queda pendiente de
tu decisión.

## Dos candidatas evaluadas — 29-sep-2026

### `nyldn/img` — Image Agency · **RECOMENDADA, pero bloqueada**

Genera y edita imágenes de marca desde Claude Code. Es la que encaja con la
necesidad real: anuncios, banners, posts, historias, portadas, campañas y
variaciones, todo con la identidad aplicada.

| | |
|---|---|
| Licencia | **MIT** ✅ |
| Modelos | OpenAI `gpt-image-2` · Google `gemini-3.1-flash-image-preview` |
| **Claves** | **`OPENAI_API_KEY` y/o `GEMINI_API_KEY`** ❌ |
| **Coste** | **Sí, de pago por uso.** Tope configurable con `maxCostPerRunUsd` |
| Instalación | `npx -y @nyldn.sh/install-img` o `npm i -g @nyldn.sh/img` |
| Toca el proyecto | Crea `~/.config/img/`, añade `img.config.json`, **«puede modificar los `.env` del proyecto»** |
| Integración | Plugin nativo de Claude Code: `/img`, `/img:edit`, `/img:openai`, `/img:gemini` |

**Lo que hace bien:** su modelo de marca es casi el nuestro —
`brand.prePrompts` (directrices que se anteponen a cada petición),
`brand.negativePrompts` (lo que nunca debe aparecer), `brand.colors` y
`brand.references` (enlaces a la documentación de diseño). Las recetas llevan
repositorio, commit, licencia y atribución: se sabe de dónde sale cada prompt.

> [!danger] Dos condiciones antes de instalarla
> 1. **Requiere claves de pago.** Según las reglas del proyecto queda como
>    **«no instalada hasta autorización»**. No se inventan credenciales ni se
>    configuran por cuenta propia.
> 2. **«Puede modificar los `.env` del proyecto».** Aquí los secretos viven en
>    variables de entorno de Vercel, no en git. Habría que atarla a
>    `~/.config/img/.env.local` y comprobar que no escribe en el repositorio.
>
> **Y la condición de fondo:** una generadora de imágenes enchufada al
> proyecto es exactamente el riesgo que previene la regla de fotografía. Si se
> instala, `vivebien-design-system` debe prohibirle tocar **categoría A**
> (fotos de propiedades reales). Sirve para B, C, D y E; nunca para A.

**Veredicto:** merece la pena, pero **no se instala hasta que tú autorices el
gasto** y decidamos dónde viven las claves.

### `colater-dev/claude-code-design-skill` — **NO instalar, sí copiar la idea**

Ingiere una identidad de marca y genera posts, banners y tarjetas con vista
previa en HTML y exportación a PNG.

| | |
|---|---|
| **Licencia** | **Sin especificar** ❌ — motivo suficiente para no adoptar su código |
| Claves | Ninguna ✅ |
| Dependencias | Google Fonts + `html2canvas` desde CDN |
| Salidas | Historias de Instagram, banners de LinkedIn, tarjetas, firmas de correo |

**Lo que vale la pena:** su estructura de marca.

```
brands/[cliente]/
├── brand.json        colores, tipografía, logos, motion, valores
├── brand-voice.md    historia, tono, mensajes, estilo de escritura
└── assets/
```

`brand.json` guarda **colores en hex con nombres compatibles con Tailwind**,
familias y pesos tipográficos, **rutas a cada variante del logotipo**
(color, negro, blanco, icono), filosofía de animación y **escalas de
personalidad** (juguetón↔serio, atrevido↔sutil).

**Eso resuelve algo real que nos faltaba:** nuestra documentación es toda prosa,
y una herramienta no puede leerla. Se ha adoptado la idea —no el código— en
`.claude/skills/vivebien-design-system/brand.json`.

**Veredicto:** no instalar. Idea incorporada.

---

## `ui-styling/canvas-fonts` — 5,6 MB

**81 entradas:** archivos `.ttf` (Arsenal SC, Big Shoulders, Boldonse,
Bricolage Grotesque…) con su licencia OFL al lado.

- **Quién las usa:** un solo archivo, `references/canvas-design-system.md`.
- **¿Runtime?** No. **No las carga la aplicación**: VIVE BIEN sirve sus fuentes
  desde Google Fonts (`layout.tsx`). Son para componer imágenes tipo póster.
- **¿Duplicadas?** No entre sí. Ninguna coincide con Montserrat, Open Sans ni
  Playfair Display, así que no se solapan con el producto.
- **¿Necesarias para la skill?** Sólo para su modo canvas, que este proyecto no
  usa hoy.
- **Reducción posible:** quitarlas dejaría `ui-styling` en ~200 KB, un 96 %
  menos, y la skill seguiría sirviendo para shadcn y accesibilidad. También
  cabe dejar dos o tres familias.

**No se ha borrado nada.** Decisión tuya.

## Deuda que NO se toca aquí

`.claude/skills/design-system/scripts/*.cjs` aporta **6 errores y 1 aviso** al
lint cuando se lanza sobre todo el árbol. El baseline del proyecto
(63 errores / 39 avisos) se mide **excluyendo `.claude/**` y los `*.cjs` de la
raíz**. Ni `eslint.config` ni esos scripts se modifican en esta fase.
