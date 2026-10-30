# SEO_IMPLEMENTATION — Fase 1

**Versión:** V-1.1.63 · **Commit:** `8714b3d` · **Desplegado y verificado:** 2026-09-16
Diagnóstico previo: [SEO_AUDIT.md](./SEO_AUDIT.md)

---

## Qué se cambió, y por qué

### 1. La canónica deja de vivir en el layout

`src/app/layout.tsx` declaraba `alternates: { canonical: '/' }`. La metadata
del App Router se hereda, así que las 6 páginas públicas y las 7 fichas de
propiedad servían esa misma canónica. Se quitó de ahí.

Ahora la declara cada página, y la declara **siempre**, porque `paginaSeo()` la
construye a partir de la ruta: no hay forma de llamar a esa función y olvidarse.

```ts
// src/lib/seo.ts
export function paginaSeo({ ruta, titulo, descripcion, … }): Metadata {
  return { title, description, alternates: { canonical: ruta }, robots, openGraph, twitter }
}
```

### 2. Las páginas públicas pasan a tener una capa de servidor

Eran `'use client'`, y un componente de cliente no puede exportar `metadata`.
Ese era el motivo real de que ninguna tuviera título propio.

```
page.tsx          ← nuevo: componente de servidor, sólo metadata y JSON-LD
page-client.tsx   ← el contenido de antes, sin un cambio
```

Es el mismo patrón que las fichas de propiedad ya usaban. Afecta a `/`,
`/propiedades`, `/nosotros`, `/valuador`, `/contacto` y `/comparar`.

### 3. Sitemap: `estado_pub`, no `estatus`

`estatus` dice si la propiedad sigue disponible en el mercado; vale
`disponible` en las 15 filas. El estado de publicación es `estado_pub`.

Además se le puso `revalidate = 3600`: antes se generaba en el build, y el
sitemap desplegado listaba 3 propiedades habiendo 7 publicadas.

`lastModified` sólo se emite si hay una fecha real detrás. Poner `new Date()`
en cada generación sería afirmar que todo cambió hoy, cada hora, para siempre.

### 4. 404 de verdad — pero sólo cuando se sabe

```ts
if (seConsulto && !existe) notFound()
```

La distinción entre «no existe» y «no se pudo preguntar» es deliberada: si la
base no contesta y se devolviera 404, una caída de diez minutos borraría el
catálogo entero del índice de Google. Ante la duda se sirve la página.

> **Corrección (V-1.1.64).** Tal como quedó en V-1.1.63 esta protección **no
> funcionaba**: `supabase-js` no lanza una excepción cuando la base falla,
> devuelve `{ data: null, error }`, y ese `data: null` se trataba como «no
> existe». Una caída habría respondido 404 en todas las fichas. Se corrigió en
> `src/lib/ficha-servidor.ts`, con pruebas que simulan la caída.

### 5. Borradores: fuera del índice y del sitemap

Salen del sitemap y responden **404**. **No se borró ninguna.**

> **Corrección (V-1.1.64).** Aquí decía «siguen accesibles con el enlace
> directo». Es falso, y se comprobó en producción: un borrador responde 404.
> La ficha lee con la clave anónima y las políticas de lectura pública sólo
> dejan ver lo publicado, así que para el servidor un borrador no existe. El
> comportamiento es el correcto —un borrador no debe ser público—; lo que
> estaba mal era la descripción. La verificación de entonces miró la etiqueta
> `noindex` y no el código HTTP. Para revisar un borrador está el asistente.

### 6. Títulos y descripciones (`src/lib/seo-propiedad.ts`)

| | Antes | Ahora |
|---|---|---|
| Título | `CASA CAÑADA DE MARICHES CAÑADA DEL REFUGIO SUR – $14,900,000 MXN \| Vive Bien León` (81) | `Casa en venta en León, Gto. — Cañada de Mariches…` (≤60) |
| Descripción | La descripción completa; una de 1.942 caracteres | 158, con los datos delante del texto libre |

Dos decisiones que no son obvias:

- **Los datos van antes que el texto libre.** Al revés, cuando la descripción
  empieza con «Hermosa oportunidad única», eso es lo único que se ve en Google.
- **Distinguir vale más que la marca.** Dos terrenos del mismo parque, ambos de
  600 m², mismo precio, misma ciudad: por datos son idénticos. Lo único que los
  separa es el `(A)` / `(B)` del título escrito al publicar. Si no cabe todo, se
  recorta `| Vive Bien` antes que el distintivo — son dos propiedades reales y
  dos páginas con el mismo título compiten entre ellas.

### 7. `lugarDe` daba ciudades equivocadas

Esto ya estaba en producción dentro del `addressLocality` del JSON-LD.

| Entrada | Daba | Da |
|---|---|---|
| `36293 Silao de la Victoria, Gto.` | `36293 Silao de la Victoria` | `Silao` |
| `…León de los Aldama, Gto.` | `León de los Aldama` | `León` |
| `…, León, Guanajuato, 37358, México` | `Guanajuato` | `León` |

El tercero era el peor: una casa de León se declaraba en otra ciudad. Ocurría
porque la búsqueda iba del final hacia atrás y el nombre del estado también es
el de una ciudad. Ahora se prefiere la ciudad que no es también un estado, y
sólo si no hay ninguna se acepta la ambigua. `Nuevo León` sigue sin ser `León`.

### 8. Un solo `RealEstateAgent` por página

Había dos: el del layout y el de la ficha. Ahora la entidad vive en
`negocioJsonLd()`, el layout la emite una vez, y las páginas la referencian por
`@id`. Se añadieron `BreadcrumbList` y `WebSite`.

Sin `geo`, sin horarios y sin `aggregateRating`: no hay dato real detrás de
ninguno de los tres, y hay una prueba que impide que se cuelen.

### 9. `npm run seo:audit`

Descarga el HTML servido y lo revisa: estado HTTP, título, descripción,
canónica, `robots`, `h1`, JSON-LD válido, duplicados entre páginas, coherencia
con el sitemap y que un 404 responda 404. Sale con código distinto de cero.

Mira **el sitio servido, no el repositorio**, porque el fallo que motivó todo
esto convivió semanas con un `next build` sin un solo error.

---

## Verificación en producción

Tras el despliegue, contra `https://vivebienn.com`:

```
npm run seo:audit
  Páginas revisadas: 14 · URLs en el sitemap: 14
  Errores: 0
  Avisos: 8   (los <h1> que sólo existen tras ejecutar el JavaScript)
```

| Comprobación | Resultado |
|---|---|
| `/propiedades` → canonical | `https://vivebienn.com/propiedades` |
| Títulos únicos en las 14 páginas | sí |
| Propiedad inexistente | `404` |
| Borrador | `404` (corregido en V-1.1.64: aquí decía «accesible por enlace») |
| URLs en el sitemap | 14 = 7 estáticas + 7 publicadas |
| Borradores en el sitemap | 0 |
| `manifest.webmanifest` | `200` |
| Pruebas | 240 en verde |

---

## Lo que esta fase deliberadamente NO hizo

Los cuatro riesgos están razonados en [SEO_AUDIT.md](./SEO_AUDIT.md): cambiar
slugs, borrar borradores, partir la portada y el 301 de `www`.

El más importante de entender es el primero. Migrar los slugs ahora sería
migrar una señal que todavía no existe: hasta este despliegue, la canónica
impedía que esas páginas se indexaran. **Primero se indexa, después se mide, y
sólo entonces se migra con 301.**

---

## Siguiente fase

1. `ciudad` y `colonia` como columnas reales — hoy vacías en las 15
   propiedades, y eso bloquea títulos por zona, páginas por colonia y un
   `address` que no dependa de analizar texto libre.
2. `<h1>` en el HTML servido de las fichas.
3. Páginas de categoría.
