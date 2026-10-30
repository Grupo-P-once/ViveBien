# Migración 35 · Ayuda «¿Cómo guardo una propiedad?» — APLICADA (8-oct-2026)

**Resultado: APLICADA UNA SOLA VEZ, sin incidencias.** Ejecutada el 2026-10-08 a las 23:02:39 UTC sobre el proyecto de Supabase VIVEBIEN, con autorización explícita del propietario. Sin commit, push ni despliegue; ninguna otra tabla ni funcionalidad modificada.

## Antes de ejecutar
- Se leyeron completos `supabase/35-ayuda-guardados.sql` y `35-ayuda-guardados.REVERTIR.sql`: un único `UPDATE` sobre `public.knowledge_articles`, columnas **`cuerpo`** y **`actualizado_en`**, unido a `knowledge_categories` sólo para filtrar (`categoria = 'propiedades-guardadas'` y `slug = 'como-guardar-una-propiedad'`).
- **Alcance comprobado (SELECT):** el filtro coincide con **exactamente 1 fila** (`id 7e759c43-5e15-4227-852c-04580832a004`, PUBLICADO, `disponible`, ámbito `publica`). Sin disparadores (*triggers*) en las tablas `knowledge_*`; el `CHECK` de «publicado con firma» no se ve afectado porque no se tocan `estado`, `publicado_por` ni `publicado_en`. No hay `INSERT`/`DELETE`/DDL; no toca usuarios, roles, propiedades, favoritos, citas, leads, RLS (ON, política de lectura pública sin cambios) ni configuración.
- **Estado previo** (para la reversión): `cuerpo` de 212 caracteres, `md5 0ca67f57dce73496c2dbc033d96c9a2c`, `actualizado_en 2026-09-30 14:51:35.935381+00`. **El texto que restaura el `.REVERTIR.sql` tiene exactamente el mismo md5** → la reversa devuelve el artículo byte a byte.
- Línea base de lo que NO debía cambiar: hash del resto de artículos `4f0f815c…`, hash de categorías `45b18ddb…`, 37 artículos, 9 categorías, 38 fuentes; usuarios 11, propiedades 10, favoritos 0, citas 0, leads 1, `audit_logs` 384.

## Ejecución
El contenido exacto del `.sql` (`begin; update …; commit;`) por el ejecutor SQL del proyecto, una vez. Respuesta: sin filas, sin error.

## Verificación posterior (sólo lectura)
- Artículo: estado `PUBLICADO`, `disponible`, `publica`, `publicado_por`/`publicado_en` intactos; **`actualizado_en = 2026-10-08 23:02:39.495727+00`**; `cuerpo` = el texto nuevo (3 párrafos: corazón de la **tarjeta** del catálogo → **Mis guardadas**; hace falta sesión y, si no se tiene, el corazón lleva a entrar y hay que pulsarlo otra vez; las guardadas son de la cuenta, no del navegador, y nadie más las ve).
- **Nada más cambió:** hash del resto de artículos `4f0f815c…` (igual), hash de categorías `45b18ddb…` (igual), 37 artículos / 9 categorías / 38 fuentes, usuarios 11, propiedades 10, favoritos 0, citas 0, leads 1, `audit_logs` 384 — todo idéntico.
- **Sitio público** (GET): `https://vivebienn.com/ayuda/propiedades-guardadas/como-guardar-una-propiedad` → 200 y ya sirve el texto nuevo («Pulsa el **corazón** de la tarjeta de una propiedad en el catálogo… en **Mis guardadas**»); `/ayuda` 200.
- **Corrección frente al comportamiento real:** el artículo ya no dice «en la ficha» (la ficha no tiene corazón) y coincide con D-75: guardar es de la cuenta, requiere sesión, el corazón lleva a entrar sin sesión, aparece en Mis guardadas, no depende del navegador. «¿Qué significa “me interesan”?» no se tocó (ya coincidía con D-27.2).

## Reversión (preparada, NO ejecutada)
`supabase/35-ayuda-guardados.REVERTIR.sql` (restaura el cuerpo anterior, md5 `0ca67f57…`). Sólo bajo orden expresa.

## Incidencias
Ninguna.
