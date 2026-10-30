# Centro de Ayuda — plan (registrado el 23-sep-2026)

- **Estado:** planeado. **Nada implementado.** La referencia visual (captura del 23-sep) encaja con el lenguaje del sitio: editorial, limpio, rojo VIVE BIEN, serif + sans, buscador grande, categorías y artículos populares.
- **Idea rectora:** no es una página de preguntas frecuentes, es un **Centro de Ayuda vivo** conectado con el producto, que se mantiene casi solo y siempre tiene a VIVE BIEN como fuente de verdad.

## Regla fundamental
**La IA no es la fuente de verdad.** Puede redactar, resumir, detectar cambios y proponer artículos. Los datos oficiales salen del **código, la configuración, la base, la documentación aprobada, los textos legales y los procesos reales**. Y **publicar siempre lo aprueba una persona**: el sistema propone, nunca publica solo. Es la misma regla que ya rige el resto: *una sola verdad por dato* (D-32).

## Dónde entra en las fases
| Fase | Qué se hace |
|---|---|
| **3b-2** (V-1.1.86) | Registrar la necesidad y **dónde irá la ayuda contextual** de cada pantalla. Sin implementar. |
| **3b-3** (V-1.1.87) | Arquitectura: modelo de categorías y artículos, búsqueda, etiquetas, estados, relación artículo ↔ funcionalidad y ↔ rol, SEO básico, analítica, permisos y la estructura de `/ayuda` y `/ayuda/[slug]`. **Sin montar el sistema editorial completo.** |
| **3c-1** (V-1.1.88) | El acceso enlaza a los artículos que le corresponden. |
| **3c-2** (V-1.1.89) | Ayuda específica por rol, junto con los perfiles. |
| **3c-3** (V-1.1.90) | **Construcción del Centro de Ayuda público**: `/ayuda`, `/ayuda/buscar`, `/ayuda/[categoria]`, `/ayuda/[categoria]/[articulo]`. |
| Posteriores | Knowledge Engine (detección de cambios), IA editorial, analítica de preguntas y oportunidades de contenido. |

## Categorías previstas
Buscar propiedades · Mi cuenta · Propiedades guardadas · Búsquedas y alertas · Consultas y visitas · Vender o rentar · Publicadores · Valuador · Privacidad y seguridad.

## Modelo de datos propuesto
`knowledge_categories` · `knowledge_articles` · `knowledge_article_versions` · `knowledge_article_sources` · `knowledge_article_relations` · `knowledge_article_tags` · `knowledge_feedback` · `knowledge_searches` · `knowledge_change_events`.

La pieza clave es **`knowledge_article_sources`**: de dónde salió cada artículo y contra qué se verifica.

```
Artículo:  ¿Cómo guardar una propiedad?
source_type: product        source_key: portal.guardadas      source_version: V-1.1.85
source_type: documentation  source_key: D-28.2
source_type: legal          source_key: terminos-v3
rutas: /portal/propiedades?vista=guardadas · /api/portal/guardadas
componentes: GuardadasPortal · TarjetaPropiedad
última revisión: 22-09-2026
```

## Estados del contenido
```
BORRADOR → EN REVISIÓN → APROBADO → PUBLICADO → DESACTUALIZADO → ARCHIVADO
                                        ↑              │
                                        └── CAMBIO DETECTADO ──┘
```
Un cambio en el producto **no publica nada**: mueve el artículo a «revisión necesaria» y crea una propuesta.

## Cómo se autoalimenta (fases posteriores)
1. **Cambia una funcionalidad** (por ejemplo, «Mi búsqueda» gana la opción «Ambas»).
2. El motor la relaciona con los artículos que declaran esa fuente (`portal.mi-busqueda`).
3. Marca los afectados como **revisión necesaria**, con el motivo y el cambio detectado.
4. La IA **propone** una nueva versión; una persona la revisa y decide.
5. **Preguntas reales:** las búsquedas y consultas repetidas (anonimizadas y agregadas) señalan huecos de contenido — el Centro crece con lo que la gente pregunta, no con lo que suponemos.

## Salud del contenido (en el panel)
```
Centro de Ayuda → Salud del contenido
  ✓ Vigentes   ⚠ Revisión recomendada   🔴 Desactualizados   📝 Borradores
  Artículos afectados por cambios recientes, por versión
```

## Ayuda contextual (lo que se registra ya, en 3b-2)
El Centro no vive aparte: cada pantalla del portal enseña la ayuda de lo que la persona está haciendo.

| Pantalla | Artículos que le tocan |
|---|---|
| `/portal` | Cómo funciona tu portal · Cómo guardar una propiedad |
| `/portal/propiedades` (Guardadas / Me interesan) | Cómo guardar una propiedad · Qué significa «me interesan» |
| `/portal/busquedas` | Cómo crear una búsqueda · Cómo modificarla |
| `/portal/alertas` | Cómo funcionan las alertas · Por qué no llegan correos todavía |
| `/portal/consultas` | Qué pasa después de una consulta |
| `/portal/visitas` | Cómo solicitar una visita · Cómo se confirma · Qué pasa después |
| `/portal/perfil` · `/portal/mi-busqueda` | Cómo cambiar mis datos · Cómo funciona «mi búsqueda» |
| `/portal/configuracion` | Cómo cambio mi contraseña · Cómo entro con Google |

## Cuatro ayudas separadas, nunca mezcladas
**Pública** (lo que puede saber cualquiera) · **de publicador** (procesos de publicación) · **administrativa** (procedimientos internos) · **técnica** (desarrollo).
