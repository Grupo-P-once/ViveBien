# PANAM II · «SIALO» → «SILAO» y nombres públicos (V-1.1.84, 22-sep-2026)

Autorizado por el dueño el mismo día, antes de que Google indexara las URLs.

## Antes
| id | título | nombre público |
|---|---|---|
| `propiedad-sin-titulo-wljv` | `[TERRENO INDUSTRIAL (A) PANAM II SIALO ]` (espacio final) | ninguno → la URL era el id |
| `propiedad-sin-titulo-qzsl` | `[TERRENO INDUSTRIAL (B) PANAM II SIALO]` | ninguno → la URL era el id |

En medio (unas horas): al ponerles nombre, heredaron la errata —
`terreno-en-venta-industrial-a/b-panam-ii-sialo-silao-…`.

## Después
| id | título | nombre público |
|---|---|---|
| `propiedad-sin-titulo-wljv` | `TERRENO INDUSTRIAL (A) PANAM II SILAO` | `terreno-en-venta-industrial-a-panam-ii-silao-zc6q` |
| `propiedad-sin-titulo-qzsl` | `TERRENO INDUSTRIAL (B) PANAM II SILAO` | `terreno-en-venta-industrial-b-panam-ii-silao-v1sp` |

## Cómo
1. `update propiedades set titulo = btrim(replace(titulo,'SIALO','SILAO')), slug = null` **sólo** para esos dos ids.
2. `scripts/nombrar-publicadas.mts --aplicar` — el nombre lo pone la función oficial (`asignarSlugAlPublicar`), con sus comprobaciones de choque.
3. `next.config.ts` → `nombresRetirados`: las dos direcciones con la errata redirigen **308** a la corregida (los ids viejos ya redirigían solos, lo hace la ficha).

## Comprobado en producción
- URLs nuevas: **200**. Las cuatro anteriores (2 con errata + 2 ids): **308** a la corregida.
- `canonical` y `<title>` corregidos: «Terreno en venta en Silao, Gto. — Industrial (A) Panam II».
- **0** «SIALO» en la base (títulos y slugs), el sitemap, el listado y las dos fichas.
- 709 pruebas en verde (dos nuevas vigilan que ningún nombre retirado lleve a uno con «sialo»), lint sin errores nuevos, build OK, CI verde.
