# Migración 27 · Centro de Ayuda — evidencia de ejecución

**Ejecutada en producción el 30-sep-2026.** Proyecto Supabase `uztssyrheqdhtoheecgf`
(VIVEBIEN), PostgreSQL 17.6, `ACTIVE_HEALTHY`.

Commit del código en ese momento: `9740e42`.
**3c-3 estaba sin comprometer** cuando se ejecutó — ver «Lo que no salió bien».

---

## ANTES

| | |
|---|---|
| Tablas en `public` | **23** |
| Tablas `knowledge_*` | **0** |
| Políticas en `public` | **2** (`fotos`, `propiedades`) |
| Tablas con RLS | 23 de 23 |

Precondiciones comprobadas antes de tocar nada:

| Comprobación | Resultado |
|---|---|
| `gen_random_uuid()` disponible | sí |
| Rol `anon` | existe |
| Rol `authenticated` | existe |
| Colisiones de nombre `knowledge*` | **0** en tablas y en vistas |

## DESPUÉS

| | Antes | Después |
|---|---|---|
| Tablas en `public` | 23 | **32** (+9) |
| Tablas `knowledge_*` | 0 | **9**, todas con RLS |
| Políticas `knowledge_*` | 0 | **5** |
| **Políticas previas** | 2 | **2 — sin tocar** |
| `usuarios` | 7 | **7** |
| `propiedades` | 8 | **8** |
| `citas` | 0 | **0** |

Ningún dato existente se modificó. La migración es puramente aditiva.

## Las nueve tablas y sus políticas

| Tabla | RLS | Política |
|---|---|---|
| `knowledge_categories` | sí | SELECT · ámbito público |
| `knowledge_articles` | sí | SELECT · público **y** publicado |
| `knowledge_article_tags` | sí | SELECT · si su artículo se ve |
| `knowledge_article_relations` | sí | SELECT · íd. |
| `knowledge_feedback` | sí | **INSERT** · sólo sobre artículo público |
| `knowledge_article_versions` | sí | **ninguna** |
| `knowledge_article_sources` | sí | **ninguna** |
| `knowledge_searches` | sí | **ninguna** |
| `knowledge_change_events` | sí | **ninguna** |

Con RLS activo y sin política, `anon` no lee. Es deliberado.

## Contenido

| | Esperado | Real |
|---|---|---|
| Categorías | 9 | **9** |
| Artículos | 37 | **37** |
| Publicados | 31 | **31** |
| Borradores | 6 | **6** |
| Fuentes | — | **38** en 29 artículos, 7 tipos |

Estado del producto: **29 disponibles · 3 parciales · 5 futuros**.

Tres comprobaciones que no admiten excepción, todas en **0**:

- artículos `futuro` publicados: **0**
- publicados sin aviso cuando la función no está disponible: **0**
- publicados sin constancia de quién los aprobó: **0**

## Lo que `anon` puede leer — probado con su propia clave

No con SQL de servicio: con peticiones reales a la API pública.

| | |
|---|---|
| Categorías visibles | **8** de 9 — la de publicadores filtrada |
| Artículos visibles | **29** de 37 |
| Desglose | `publica/PUBLICADO` 29. **Fugas: 0** |
| Futuros visibles | **0** |
| `versions`, `sources`, `searches`, `change_events`, `feedback` | **0 filas cada una** |
| `POST /knowledge_articles` | **HTTP 401** |

Los 29 visibles salen de 31 publicados menos los 2 de ámbito publicador.

Los parciales visibles son 2 —alertas y «quiero vender o rentar»—, ambos con
su aviso (134 y 155 caracteres). El tercero está en ámbito publicador y en
borrador, así que no sale.

## Rutas, en el navegador

| Ruta | |
|---|---|
| `/ayuda` · `/ayuda/mi-cuenta` · artículos · `/ayuda/buscar` | **200** |
| `/ayuda/publicadores` (ámbito interno) | **404** |
| `/ayuda/…/google-calendar` (futuro en borrador) | **404** |

Escritorio y móvil: sin desbordamiento, **axe 0 graves**, 0 errores JS. El
aviso ámbar del artículo de alertas se ve en los dos tamaños.

## Pruebas

85 verdes: `ayuda-modelo` (34), `ayuda-rutas` (26), `migracion-27-ayuda` (25,
con ensayo completo en PGlite incluida la reversión).

---

## Lo que no salió bien

**1 · Las fuentes se quedaron fuera en la primera pasada.** Al partir el
contenido en lotes omití el bloque de `knowledge_article_sources`. Lo detectó
la evidencia posterior —`fuentes: 0`— y se cargó después. Sin esa tabla no
habría Knowledge Engine más adelante, así que no era un detalle.

**2 · No hubo respaldo de plataforma.** El MCP de Supabase no expone esa
operación y no hay `DATABASE_URL` local. Se ejecutó igualmente porque la
migración sólo crea tablas nuevas —verificado leyéndola y con cero
colisiones— y el `REVERTIR` está ensayado y sólo borra esas nueve. **Ningún
dato existente podía verse afectado**, y los recuentos de después lo
confirman. Aun así, es el único paso del ritual que no se pudo completar.

**3 · El árbol de trabajo no estaba limpio.** Todo 3c-3 seguía sin
comprometer cuando se ejecutó la migración. Producción tiene ahora tablas
cuya definición vive sólo en el disco local.

**4 · Dos artículos publicados no tienen fuente registrada.** De 31, hay 29
con trazabilidad. El documento ya preveía completarlas «al revisar cada
artículo».

**5 · El archivo `27-centro-de-ayuda-contenido.sql` se ejecutó por lotes**,
no de una pasada: su tabla temporal necesita una sola transacción y por lotes
no estaba garantizado. El archivo se actualizó después para que refleje lo
que de verdad entró, y el ensayo en PGlite sigue verde.
