# SEO_AUDIT — ViveBien

**Fecha:** 2026-09-16 · **Auditado:** producción (`vivebienn.com`) + repositorio en V-1.1.62
**Método:** inspección del repositorio + `curl` contra producción + consulta directa a la base.
Nada se modificó para producir este documento.

---

## Resumen en una frase

El sitio no tiene un problema de SEO repartido en cien detalles: tiene **un solo
fallo que anula casi todo lo demás**, y varias consecuencias suyas.

> **Todas las páginas del sitio declaran `<link rel="canonical" href="https://vivebienn.com">`.**

Comprobado en producción, una por una:

| URL | Canonical que declara | |
|---|---|---|
| `/` | `https://vivebienn.com` | correcto |
| `/propiedades` | `https://vivebienn.com` | **mal** |
| `/nosotros` | `https://vivebienn.com` | **mal** |
| `/valuador` | `https://vivebienn.com` | **mal** |
| `/contacto` | `https://vivebienn.com` | **mal** |
| `/propiedades/sanjuan` | `https://vivebienn.com` | **mal** |

Una canónica es una declaración: *«esta página es un duplicado de aquella;
indexa aquella»*. El sitio le está diciendo a Google, en cada una de sus
páginas, que la única página real es la portada.

**Esto explica exactamente lo que se ve en Search Console**: portada indexada,
el resto «descubierta / rastreada, actualmente sin indexar». Google no está
tardando; está obedeciendo.

### Por qué ocurre

`src/app/layout.tsx` declara `alternates: { canonical: '/' }`. En el App Router
la metadata **se hereda**: toda página que no la sobrescriba recibe la del
layout. Y ninguna la sobrescribe, porque —segundo hallazgo— **las seis páginas
públicas son componentes de cliente**, y un componente de cliente no puede
exportar `metadata` ni `generateMetadata`.

```
layout.tsx  →  canonical: '/'
      │
      └── heredado por TODAS las páginas
             │
             └── que no pueden sobrescribirlo porque son 'use client'
```

No fue un descuido aislado. El comentario del propio código dice que la canónica
se puso para unificar `vivebienn.com`, `www` y las URLs de `vercel.app`. La
intención era correcta; el alcance no: se aplicó al layout en vez de a la portada.

---

## Hallazgos por gravedad

### P0 — Impiden la indexación

| # | Hallazgo | Evidencia | Efecto |
|---|---|---|---|
| 1 | Canónica de la portada heredada por todo el sitio | `layout.tsx` + 6 URLs comprobadas en producción | Ninguna página salvo la portada puede indexarse |
| 2 | Las 6 páginas públicas son `'use client'` | portada, propiedades, nosotros, valuador, contacto, comparar | No pueden declarar title, description ni canónica propios |
| 3 | 5 páginas comparten un único `<title>` | portada, `/propiedades`, `/nosotros`, `/valuador`, `/contacto` | Títulos duplicados; Google no distingue la intención de cada una |
| 4 | El sitemap publica **borradores** | `sitemap.ts` filtra `estatus='disponible'`, pero el estado real de publicación es `estado_pub` | `estatus` vale `disponible` en las 15 propiedades, incluidas las 8 en borrador |
| 5 | Una propiedad inexistente responde **200** | `/propiedades/no-existe-xyz` → `200 OK` con «Propiedad no encontrada» | Soft 404: Google indexa páginas de error como contenido |
| 6 | Los borradores son públicos y responden 200 | `/propiedades/propiedad-sin-titulo-d1s7` → `200` | Seis páginas «Propiedad sin título», sin datos, indexables |

**Sobre el punto 4, con números reales de la base (15 propiedades):**

```
estado_pub = publicada  →   7   ← las únicas que deberían ir al sitemap
estado_pub = borrador   →   8   ← 6 vacías + 2 pruebas del bot de Telegram
estatus    = disponible →  15   ← el campo por el que filtra el sitemap hoy
```

El sitemap desplegado lista 10 URLs: no coincide ni con lo uno ni con lo otro.
Se genera en el build y **no se ha regenerado** desde entonces, así que además
está desactualizado — faltan 4 propiedades ya publicadas.

### P1 — Pérdida de señal

| # | Hallazgo | Evidencia |
|---|---|---|
| 7 | `www.vivebienn.com` responde **200**, no redirige | `curl` → `200`. `http://` sí redirige bien (308) |
| 8 | `manifest.json` → **404** | Referenciado y ausente |
| 9 | Las fichas no declaran canónica propia | `generateMetadata` define title/description/OG, pero no `alternates` |
| 10 | `ciudad` y `colonia` están **vacías en las 15 propiedades** | La dirección vive sólo en `ubicacion`, texto libre |
| 11 | Sin `BreadcrumbList` ni datos estructurados de empresa completos | JSON-LD sólo en layout y ficha |
| 12 | Sin páginas de categoría (`/propiedades/casas`, `naves-industriales`…) | No existen esas rutas |

El punto 10 pesa más de lo que parece: sin ciudad ni colonia en columnas propias
no se pueden construir títulos como *«Casa en venta en Cañada del Refugio,
León»* de forma fiable, ni páginas por zona, ni un `address` correcto en los
datos estructurados. Es la pieza que bloquea media Fase 2.

### P2 — Rendimiento (ya medido: Performance ≈ 32 en móvil)

| # | Hallazgo |
|---|---|
| 13 | La portada son 827 líneas de componente de cliente |
| 14 | Font Awesome completo por CDN para unos pocos iconos |
| 15 | Contadores animados que arrancan mostrando `0+` |

---

## Riesgos: lo que NO se toca sin autorización explícita

La ficha ordena detenerse y documentar antes de modificar nada que afecte a URLs
indexadas, datos de propiedades, diseño, seguridad o producción. Estos son los casos.

### R1 — Cambiar los slugs de las propiedades

Hoy: `/propiedades/propiedad-sin-titulo-d52n`
Deseable: `/propiedades/nave-industrial-en-venta-mandujano-leon`

**No se cambia ahora.** Dos de esos slugs están en el sitemap enviado a Search
Console y llevan semanas siendo rastreados. Cambiarlos sin 301 pierde la señal
acumulada; cambiarlos con 301 es correcto **pero sólo después** de saber cuáles
están indexadas — dato que hoy no tenemos, precisamente porque la canónica lo
impide.

**Orden correcto:** arreglar canónicas → esperar indexación → medir → entonces
migrar con 301. Hacerlo al revés es migrar una señal que todavía no existe.

### R2 — Borrar los 8 borradores

Seis «Propiedad sin título» y dos pruebas del bot. Tentador borrarlos. **No se
borran**: son datos de producción y la decisión no es mía. Se sacan del sitemap
y se marcan `noindex`, que resuelve el problema de SEO por completo; la limpieza
de la base la decide su dueño.

### R3 — Convertir la portada en componente de servidor

827 líneas con estado, efectos y animaciones. Partirla es correcto a medio plazo
y lo pide la ficha, pero es la página que más tráfico recibe y el riesgo de
romperla es real. **Fase aparte, con verificación visual antes y después.**

### R4 — `www` → 301

Es configuración de dominio en Vercel, no código. Hoy `www` sirve el sitio con
canónica apuntando a la versión sin `www`, así que la pérdida está contenida. Se
documenta como tarea del panel; no se tocan los dominios sin aviso.

---

## Lo que ya está bien, y no se toca

- `robots.txt` correcto: bloquea `/admin`, `/dashboard`, `/publicador`,
  `/mi-cuenta` y `/api`, y nada más. No bloquea `/_next` ni recursos.
- `http://` → `https://` con 308.
- `SITIO` como fuente única de la URL base (`src/lib/sitio.ts`).
- Las fichas ya generan title y description por propiedad, y JSON-LD.
- Las fichas ya siguen el patrón servidor + cliente (`page.tsx` + `page-client.tsx`),
  que es exactamente el que hay que replicar en las otras cinco páginas.
- Cabeceras de seguridad y CSP en `Report-Only`.

---

## Plan por fases

| Fase | Qué | Riesgo | Estado |
|---|---|---|---|
| **1** | Canónicas por página, metadata propia, sitemap por `estado_pub`, 404 real, `noindex` en borradores, manifest | Bajo — no cambia URLs, ni diseño, ni datos | ✅ V-1.1.63, verificado en producción — ver [SEO_IMPLEMENTATION.md](./SEO_IMPLEMENTATION.md) |
| **2** | Ciudad/colonia como columnas, H1 en el HTML servido | Medio — migración de datos | siguiente |
| **3** | Categorías `/propiedades/casas`, `naves-industriales`, `terrenos`… | Bajo | |
| **4** | Landings locales y contenido | Bajo | |
| **5** | Rendimiento: portada, Font Awesome, imágenes | Medio | |
| **R1** | Migración de slugs con 301 | **Alto — requiere autorización** | bloqueada a propósito |

---

## Criterio de verificación de la Fase 1

No se da por terminada porque compile. Se comprueba **en producción**:

```
curl -s https://vivebienn.com/propiedades | grep canonical        → /propiedades
curl -s https://vivebienn.com/nosotros    | grep canonical        → /nosotros
curl -s -o /dev/null -w "%{http_code}" .../propiedades/no-existe  → 404
curl -s .../sitemap.xml | grep -c "<loc>"                         → 7 estáticas + 7 publicadas
```
