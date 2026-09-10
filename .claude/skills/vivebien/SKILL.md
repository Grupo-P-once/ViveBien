---
name: vivebien
description: Reglas, arquitectura y convenciones de ViveBien (portal inmobiliario de León, Gto., de Grupo P-ONCE). Úsala siempre que se toque el repo vivebien-next, se escriba una migración de Supabase, se añada una ruta de API, se cambie el wizard de publicación, o se vaya a anotar algo en Obsidian.
---

# ViveBien — reglas del proyecto

Portal inmobiliario de **León, Guanajuato**. Parte de **Grupo P-ONCE**.
Repositorio vivo: `C:\Users\jemil\vivebien-next`, rama **`nextjs-migration`**
(no `main` — ver pendiente 18).

---

## Reglas de oro del usuario

1. **Todo lo de ViveBien se anota en Obsidian.** Vault:
   `C:\Users\jemil\OneDrive\Documentos\OBSIDIAN\GRUPO P-ONCE\Grupo Ponce\01 - EMPRESAS\VIVEBIEN\`
2. **Cada deploy sube la versión**: `V-1.1` → `V-1.1.2` → … Va en el mensaje de
   commit y en `Versiones/00 - VERSIONES.md`.
3. **No mezclar ViveBien con OTLI ni con ningún otro proyecto.** Vaults y notas
   separados, siempre.
4. **La lista de pendientes se reordena entera** cada vez que entra uno nuevo,
   de mayor a menor importancia. Nunca se apila al final.
5. **Los comandos de shell van con `rtk` delante.**

## Criterio de prioridad de los pendientes

1. Bloquea a alguien o está roto en producción
2. Exposición legal o de seguridad
3. Falta para cerrar el flujo del MVP
4. Pulido

---

## Stack real

| Capa | Qué |
|---|---|
| Framework | Next.js 16.2.1 · React 19.2.4 · TypeScript 5 |
| Base de datos | **Supabase (PostgreSQL)** desde 2026-04-01 |
| Autenticación | **Firebase Auth only** — proyecto `vivebien-84685` |
| Estilos | Tokens CSS en `globals.css` + Tailwind 4 |
| Gráficas | Recharts |
| Imágenes | Cloudinary |
| Hosting | Vercel · Registrador y DNS: Cloudflare |

**Firestore ya no se usa.** Hay un segundo proyecto Firebase muerto,
`vivebien-f4027` — si aparece en un `.env`, está mal (E-14).

---

## Seguridad — no negociable

- **El navegador nunca decide permisos.** Toda ruta que escribe pasa por
  `requireRole()` de `src/lib/auth-server.ts`, que valida el ID token de
  Firebase contra las claves públicas de Google.
- **Falla cerrado, siempre.** Sin `ADMIN_EMAILS` configurada, la administración
  responde **503**, no «adelante».
- `SUPABASE_SERVICE_ROLE_KEY` **ignora RLS por completo**. Sólo se usa después
  de validar la sesión. Nunca con prefijo `NEXT_PUBLIC_`.
- **`NEXT_PUBLIC_ADMIN_EMAILS` no protege nada**: sólo decide qué botones se
  pintan. La autoridad es `ADMIN_EMAILS` (sin prefijo).

### Dos trampas que ya costaron caro

- **Las políticas RLS son PERMISIVAS y se combinan con OR.** Una sola política
  `using (true)` anula todas las demás (E-10). Al activar RLS hay que **listar
  las políticas existentes y limpiarlas**, no sólo añadir las nuevas.
- **PostgREST devuelve 204 cuando afectó 0 filas.** Un 204 en DELETE o PATCH
  **no prueba** que estuvieras autorizado ni que se escribiera algo. Para
  verificar, vuelve a leer el registro (E-11).

---

## Cómo se publica una propiedad

```
borrador ──enviar──▶ en_revision ──aprobar──▶ publicada
   ▲                     │                        │
   │                     ├──rechazar──▶ rechazada │
   └──corregir───────────┴──cambios_solicitados   │
                         publicada ──despublicar──┘
```

- **Un publicador nunca escribe `publicada`.** Sólo un administrador aprueba.
  Es la diferencia del producto frente a Inmuebles24, no un trámite que quitar.
- La **completitud se calcula en servidor** (`lib/publicacion.ts`). Si la
  mandara el navegador, cualquiera escribiría un 100 a mano.
- **80 % mínimo** para enviar a revisión, con **3 fotos** como mínimo.
- El **perfil del publicador** también tiene candado (`lib/perfil.ts`): sin
  nombre, teléfono y WhatsApp no se envía nada. Un anuncio sin contacto es un
  callejón sin salida.

---

## Convenciones de código

- **Español** en nombres, comentarios y textos de interfaz. Es un producto
  mexicano y lo mantienen personas que hablan español.
- **Estilos en línea** (`style={{}}`) con **variables CSS**, nunca hex literal.
  V-1.1.7 llevó 505 literales a tokens; no se reabre eso.
  - `--rojo` (#8B1A1A) es el **color de acción** de formularios y paneles.
  - `--rojo-marca` (#C8102E) es el **de la lámina de identidad**, más vivo, para
    portada y mosaico. Son **dos rojos con dos trabajos distintos**.
- **`Metricas.tsx` queda fuera de los tokens de marca a propósito**: sus colores
  de serie están validados aparte para daltonismo y no deben seguir a la marca.
- **Los comentarios explican el porqué**, no el qué. Si algo parece raro, el
  comentario dice qué pasó cuando se hizo de la forma obvia.

### Cómo editar archivos

- **`.tsx`: usar Write o Edit.** Los heredocs de bash se atragantan con JSX
  (E-08).
- **SQL y scripts: heredoc va bien.**
- Los scripts de Python con `\\` en cadenas se corrompen en heredoc — escribir
  el script a un archivo primero.

---

## Antes de decir que algo está hecho

```bash
rtk npx tsc --noEmit
rtk npm run build
rtk npm test
```

Y después, **lo que más se olvida**:

> Una funcionalidad no está terminada cuando compila y las pruebas pasan.
> **Está terminada cuando alguien puede llegar a ella.**

Dos páginas se construyeron y quedaron sin un solo enlace (E-13). Antes de
cerrar: **¿hay un enlace visible que lleve ahí, para el rol correcto?**

---

## Git

- Rama **`nextjs-migration`**. Verificar que `.env*` está ignorado antes de cada
  commit.
- El push necesita un apaño de credenciales en esta máquina (E-12):

```bash
git -c credential.helper= -c credential.helper=wincred push origin nextjs-migration
```

---

## Obsidian — dónde va cada cosa

| Nota | Para qué |
|---|---|
| `VIVEBIEN.md` | Índice |
| `Pendientes/00 - PENDIENTES.md` | Backlog **ordenado por importancia** |
| `Versiones/00 - VERSIONES.md` | Una entrada por deploy |
| `Errores y Soluciones/00 - ERRORES Y SOLUCIONES.md` | E-01 … E-14 |
| `Seguridad/00 - SEGURIDAD.md` | Postura y el incidente de RLS |
| `Arquitectura/` | Stack, esquema, especificación del wizard, repos |
| `Herramientas y Dependencias/` | Qué se usa y por qué |

**Al escribir una entrada nueva:** frontmatter con `empresa`, `tipo`, `area`,
`proyecto`, `version`, `actualizado`, `tags`. Enlazar con `[[wikilinks]]`.

---

## Reflejos útiles

- **¿Un número en la interfaz?** Que lo calcule el servidor.
- **¿Una gráfica?** Si no cambia una decisión, es ruido con ejes. Fuera.
- **¿Un estado vacío?** Di qué aparecerá ahí y qué falta para verlo. Y si la
  petición falló, **dilo** — no enseñes «aún no hay datos».
- **¿Un tour de bienvenida?** Lista de tareas que se tachan solas mirando los
  datos reales. Los coach marks encadenados se saltan.
- **¿Un dato que el usuario ya dio?** No se lo pidas otra vez.
- **¿Vas a reportar un problema?** Comprueba primero si el código está
  desplegado. Una vez reporté como brecha activa unas rutas que estaban sin
  hacer commit (E-04).

---

## Notas de referencia

- [[Especificacion - Wizard de publicacion]] — los 4 pasos, campo por campo
- [[Registro de repositorios de referencia]] — 14 repos con veredicto
- [[Arquitectura objetivo - stack y estructura]] — stack, carpetas, esquema
- [[Investigacion - Onboarding y tours de primera vez]]
- [[Investigacion - Inmuebles24 alta y publicacion]]
