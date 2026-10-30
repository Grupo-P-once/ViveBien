# Rediseño de la portada — informe (21-oct-2026)

Estado: **Preview de staging listo, NO promovido, NO desplegado a producción.** Producción sigue en R8.6 (`dpl_CLt7XsemNab3QBWGuNsSrwba6BqT`), sin cambios.

## 1. Identificadores
| Qué | Valor |
|---|---|
| Entorno aislado | `C:\Users\jemil\vivebien-qa019-sesion\lanzamiento\etapa3\diseno-inicio-r86` (copia del candidato; `node_modules` copiado, sin `.env`, sin `.next`, sin `.claude`) |
| Base | Paquete R8.6 en producción: `preview-r86-limpio`, huella `cbf8c08071e3173f261dd14fd815a390f5b0b9fe` |
| Paquete del diseño | `etapa3\preview-diseno-inicio-limpio` — **424 archivos** = 406 de la base + **18 nuevos** + **3 modificados**; huella SHA-1 `c856390fae04f202a065a5d8cee707e3af6ae277`; sin `.env`, sin pruebas, sin `.next` |
| Manifiesto | `go-no-go\manifiesto-diseno-inicio.json` (verificado 424/424 antes de subir) |
| **Preview (staging)** | `dpl_EGHag2MUzsP9pdCVqYqPBxa76jHS` · `https://vive-bien-8x6qt0udr-grupo-p-once.vercel.app` (target `preview`, variables de staging; el proyecto usa su configuración de Preview) |
| Producción | `dpl_CLt7XsemNab3QBWGuNsSrwba6BqT` (R8.6) — verificado con `vercel inspect vivebienn.com` tras subir el Preview |

## 2. Qué cambió (alcance: solo la página pública de inicio)
Archivos **modificados** (3): `src/app/page-client.tsx` (reescrito: ordena los bloques), `src/app/page.tsx` (ya no precarga la foto remota del hero), `src/components/MosaicoCategorias.tsx` (+Oficinas, rejilla de 6).
Archivos **nuevos** (18):
- `src/components/inicio/`: `HeroVideo.tsx`, `HeroInicio.tsx`, `QueEsViveBien.tsx` (incluye `SeccionProin`), `Acompanamiento.tsx`, `CarruselClientes.tsx`, `ContactoInicio.tsx`, `WhatsAppFlotante.tsx`, `inicio.css`.
- `public/inicio/`: `escena-escritorio.mp4/.webm`, `escena-movil.mp4/.webm`, `portada-escritorio.webp`, `portada-movil.webp`, `fachada-residencial.webp`, `edificio-proin.webp`, `proin-logo.png`.
- `public/categorias/oficina.webp`.
No se tocaron Admin, Publicador, Asociado ni Cliente (rutas, permisos, vocabulario, navegación), ni APIs, base de datos, migraciones, variables o flags. El formulario de contacto sigue enviando a `POST /api/registro-lead` con `origen: 'portada'`.

Qué se hizo, por sección:
1. **Hero** con la escena en video (ver §4), buscador Comprar/Rentar y controles intactos (+Departamento en el selector, que el catálogo ya conocía).
2. **«¿Qué es Vive Bien?»** (composición de la lámina: marca y texto a un lado, fachada al otro, cuatro puntos con icono) y **PROIN** (logotipo propio, «PROIN Desarrolladores es la desarrolladora de VIVE BIEN.», cuatro puntos).
3. **Se quitó «Nuestra Esencia»**; **«Nuestro propósito»** (`PropositoValores`) se conserva una sola vez.
4. **Oficinas** en el mosaico (clave `oficina`, la misma del catálogo, del selector, del contacto y del pie).
5. **«Permítenos guiarte»** rehecha: tres caminos (compras / rentas / inviertes) con enlaces a claves reales del catálogo (`op=venta|renta`, `tipo=terreno`) y dos acciones (WhatsApp, asesoría gratis). Sin promesas, plazos ni cifras nuevas.
6. **«Nuestros clientes»**: carrusel con los 6 testimonios exactos de siempre (texto, nombre y rol sin tocar).
7. **«Contáctanos»** compacto, con validación visible, consentimiento y los mismos estados; **Oficina** entre las opciones de «Me interesa».
8. **WhatsApp**: un solo botón en la portada (la portada vieja apilaba dos: el propio y el del layout); en teléfono y tableta se aparta del hero y del formulario y respeta el espacio seguro.

## 3. Fotografías y logotipos usados
| Recurso | Origen | Observación |
|---|---|---|
| Logotipo VIVE BIEN | `/logo_transparent.png` oficial | Sin recortar ni recolorear |
| Logotipo PROIN | **Recorte** del logotipo de `vivebien proin.jpeg` (250×214 px), con fondo transparente (alfa por luminosidad, comprobado sobre blanco y arena) | **No se encontró un archivo independiente de PROIN.** Pendiente: sustituirlo por el original vectorial |
| `fachada-residencial.webp` (400×470) | Recorte de la zona sin texto de la lámina (arriba a la derecha) | Imagen de arquitectura de la lámina, no un inmueble del catálogo |
| `edificio-proin.webp` (590×350) y `categorias/oficina.webp` (330×300) | Recortes de la zona sin texto del edificio de la lámina (abajo a la izquierda) | Ídem; la foto de «Oficinas» es conceptual, no una oficina del catálogo |
| Lámina completa | **No se usa** (una prueba lo exige) | |
Limitación: son recortes de una lámina de 1024 px; a pantalla de alta densidad se ven suaves. Sustituir por los originales cuando existan.

## 4. Video del hero
- **Fuente** (intacta, no se copió al sitio): `gemini_generated_video_7e107518.mp4` — H.264, **720×1280 vertical**, 10 s, 24 fps, con **pista de audio AAC** (se eliminó).
- **Texto grabado en los cuadros** (confirmado): logotipo, titular «Más que una inmobiliaria.», subtítulo y, abajo, un teléfono y la web escrita **«viveblenn.com»** (errata). No hay versión limpia ni capa externa. No se usó SAM 2 ni ProPainter ni se generó nada en Google Flow.
- **Solución: recorte, sin parches ni manchas.** La franja libre de texto es 720×744 px (de y=404 a y=1148): queda por debajo del subtítulo y por encima de la barra de teléfono/web y conserva casa, lago, ciudad en ladera y alberca. Se comprobó en **12 momentos** del clip y en las capturas del Preview: sin texto, sin halos, sin manchas. La cámara es casi estática: lo que se mueve es el agua y unas aves.
- **Bucle sin salto**: el final se funde 1 s con el inicio (9 s en total).
- **Archivos** (`public/inicio/`): escritorio 720×744 (MP4 1,1 MB · WebM 0,98 MB); móvil 540×558 (MP4 0,57 MB · WebM 0,6 MB); portadas WebP de 32 y 20 KB. Sin audio (una prueba busca el manejador de sonido en los MP4). Orden de fuentes: WebM, luego MP4.
- **Escritorio**: la escena ocupa la parte derecha del hero (hasta 62 % del ancho, máx. 900 px): **ampliación de hasta ≈1,24×**, y se funde con el fondo. A pantalla completa se habría ampliado 2× y se vería borroso. **Móvil/tableta (<900 px)**: la escena ENTERA arriba (a lo ancho, sin recortar los lados) y el titular encima de su parte baja, que se oscurece.
- **Reproducción**: `autoplay muted loop playsInline`, sin controles; se pausa fuera de pantalla y con la pestaña oculta; con **movimiento reducido** o **ahorro de datos** no se descarga el video y queda la portada (probado). La portada estática es el LCP y la alternativa accesible; el nombre accesible describe solo lo que se ve («terraza… frente a un lago… al atardecer») y **no nombra un lugar**.
- **Medido en Chrome (Preview)**: el WebM se descarga con estado 206 (977 KB), el MP4 no; 0 bytes de audio decodificados; la página pesa 2,24 MB en total; ningún recurso con estado ≥ 400.

### La escena y la ubicación (límite que se mantiene)
- **Brief del propietario:** casa con alberca y vista a la presa del Parque Metropolitano, con el skyline de Gran Jardín al fondo.
- **Verificado en internet:** la presa El Palote está dentro del Parque Metropolitano de León (337 ha; presa en operación desde 1955); hay anuncios de casas y departamentos en Gran Jardín con terraza o vista a la presa; la Torre 40 Lumière (44 pisos, ~162 m) está en Gran Jardín; una foto real de 2009 de Wikimedia Commons (categoría «Presa El Palote») muestra el lago con la ladera de la ciudad y un grupo de torres al otro lado.
- **No verificado:** que el cuadro del video sea una vista real (es una composición de IA; una residencia privada no puede estar dentro de ese parque protegido), un mirador oficial con esa vista, y la «montaña icónica». Por eso la página lo presenta como imagen ilustrativa, sin nombrar lugares.
- **Calidad:** para escritorio a pantalla completa hace falta una toma 16:9 de 1080p. Texto listo para pedirla en Flow/Gemini en `PROMPT-VIDEO-HORIZONTAL-FLOW.md` (sustituir los archivos no requiere tocar código).

## 5. Pruebas y resultados (todo ejecutado; nada marcado como bueno sin correr)
| Prueba | Resultado |
|---|---|
| `tsc` (entorno de diseño) | limpio |
| Vitest completo del entorno | **2673 pasan · 6 fallan · 6 omitidas** (2685). Las 6 son las PREVIAS de siempre (`medios-optimizar` ×2, `wafloat-oclusion` ×4). Además `task-observer.test.ts` no carga porque este entorno NO lleva `.claude` (excluido a propósito): es del entorno, no un fallo. |
| Pruebas nuevas | `tests/portada-rediseno.test.ts` (**16**): medios sin audio, testimonios exactos, Esencia fuera, claves de Oficinas = las del catálogo, reglas de estilo, un solo WhatsApp. `tests-visual/inicio-rediseno.e2e.ts` (**26 por ancho**) |
| Pruebas modificadas | `imagen-respaldo.test.ts` (`alFallarImagen` ahora se exige en `QueEsViveBien`) y `ficha-cache.test.ts` (el LCP de la portada es la portada local del video) |
| **e2e de la portada** (hermético, 1 trabajador, 390 · 768 · 1024 · 1440) | **104 pasan · 0 fallan** (video, movimiento reducido, ahorro de datos, buscador, Oficinas, carrusel con teclado/pausa/reloj, contacto válido/inválido/éxito/error, WhatsApp, 6 anchos sin desborde ni errores nuevos de consola, axe sin críticas ni serias, contraste del texto del hero medido sobre captura) |
- Anchos probados además en 360 y 430 px (en el e2e, y a mano en Chrome con 360/390/430).
- **Corridas intermedias con fallos** (corregidos antes de cerrar): 42, 3, 1 y 3 fallos en cuatro corridas sucesivas.

### Defectos que la revisión encontró y se corrigieron
1. A 1024 px las cifras del hero se montaban sobre el botón «Buscar» (ahora solo ≥ 1240 px).
2. Contraste del texto pequeño del hero sobre el video en teléfono (3,64:1) → velo más oscuro y sombra de texto.
3. Una regla global (`a:not([data-pantalla] a) { color: inherit }`) pisaba el color de los botones-enlace (mismo origen que el aviso de R8.6).
4. `--font-montserrat` solo existe dentro de `.panel-vb`: en la portada, un `font:` abreviado con esa variable se invalidaba entero y los titulares salían del tamaño de un párrafo.
5. Línea fina entre la escena y el fondo en móvil; separador «|» suelto; recuadro gris tras el logotipo de PROIN (ahora con alfa).
6. El botón de WhatsApp tapaba el buscador y «Asesoría gratis» en la primera pantalla del teléfono, y la página tenía DOS botones (el del layout y el propio): ahora uno, que se aparta.

## 6. Revisión visual y capturas (en `diseno-inicio-r86\evidencia\`)
- `antes-produccion\`: portada de producción (R8.6) en escritorio y 390 px.
- `chrome-preview\` (Chrome, en el Preview): hero de escritorio, 360/390/430 lado a lado, «Qué es», PROIN, carrusel, contacto.
- `playwright-local\`: hero y página completa en 360, 390, 430, 768, 1024 y 1440 px.
- Consola/red del Preview: sin recursos con error; la consola no se pudo leer retroactivamente con la herramienta del navegador (las pruebas locales no registraron errores nuevos).

## 7. Herramientas, versiones y licencias
FFmpeg 8.1 (Gyan.FFmpeg, compilación «full», GPL; salida: libx264, libvpx-vp9, libwebp) · lucide-react (ISC, ya en el proyecto) · framer-motion y react-countup (ya en el proyecto) · Playwright + axe (ya en el proyecto) · WebSearch/Commons solo para verificar referencias (la foto de Commons NO se usó en el sitio; era CC BY-SA 3.0). **No se usó**: SAM 2, ProPainter (licencia no comercial), Google Flow, Canva generate-image, ninguna paquetería nueva en el sitio ni en el candidato.

## 8. Limitaciones y pendientes (honestos)
1. **Calidad del video en escritorio** limitada por el original (720 px): por eso el diseño lo muestra a la derecha. Falta la toma 16:9 1080p (prompt listo).
2. El hero en teléfono mide ≈ 850 px en 390×844: ocupa casi toda la pantalla; se puede afinar (−50 px) en una iteración.
3. Hay bastante aire entre «¿Qué es Vive Bien?» y PROIN en escritorio (≈ 10 rem): afinable.
4. Logotipo de PROIN y fotos de «Qué es»/PROIN/Oficinas: recortes de la lámina; sustituir por originales.
5. «Imagen ilustrativa»: no se añadió leyenda visible en el hero; se puede añadir si se quiere dejar explícito que la escena es una ilustración.
6. Sin revisión independiente (Codex no debe editar y sus modelos no están disponibles).
7. No probado: envío real del formulario (se probó con ruta simulada; no se mandó nada a nadie), reproducción en iOS/Safari real, mp4 H.264 en navegador (en Chrome se sirve WebM).
8. La investigación de `/portal` en producción sigue como pendiente aparte (no se tocó).
9. Documentación: este informe, `PROMPT-VIDEO-HORIZONTAL-FLOW.md`, entradas aditivas en `docs/DECISIONS.md` y `docs/IMPLEMENTATION_PLAN.md` **del entorno aislado** (no del repo principal) y notas de Obsidian (ver §9).

## 9. Documentación (hecha y verificada)
- **Obsidian** (`C:\Users\jemil\OneDrive\Documentos\OBSIDIAN\GRUPO PONCE\01 - EMPRESAS\VIVEBIEN\`): entrada aditiva en **Errores y Soluciones** (adenda **sin número**: lo asigna el propietario) y en **Pendientes**. Respaldos previos verificados con `cmp`: `etapa3\respaldo-obsidian\pre-65-ERRORES.md` y `pre-65-PENDIENTES.md`; tras añadir, el prefijo de cada nota quedó idéntico al respaldo. Sin secretos ni datos personales.
- **Repositorio (solo del entorno aislado):** entradas aditivas en `docs/DECISIONS.md` (sin número asignado) y `docs/IMPLEMENTATION_PLAN.md`, con prefijos verificados. El repositorio principal (`C:\Users\jemil\vivebien-next`) no se tocó.
- **Task Observer:** observaciones 0027 (CSS: `var()` indefinida y color de enlaces, segunda vez → barrera propuesta) y 0028 (cambio concurrente en el árbol compartido). Son propuestas: no se modificó ninguna skill.
- **Evidencia:** `diseno-inicio-r86\evidencia\` (antes-produccion, chrome-preview, playwright-local); registros de las pruebas en `verificacion-20261016-1821\etapa5-confirmacion\go-no-go\etapa23-diseno-inicio\`.
- **Texto para la toma 16:9:** `PROMPT-VIDEO-HORIZONTAL-FLOW.md`.


---
# SEGUNDA ENTREGA (21-oct-2026, tarde) — ajustes pedidos por el propietario

**Preview vigente:** `dpl_tN57jNmbgyqZ8qmB9t43Wqyf8e3B` · `https://vive-bien-5dbkeo1c3-grupo-p-once.vercel.app` (target `preview`, staging). Paquete `etapa3\preview-diseno-inicio-limpio`: **426 archivos**, huella SHA-1 `8bb37d55beda741d0f43e49e662ea0d2c3c3a249` (base R8.6 `cbf8c080…` + 20 nuevos + 6 modificados), verificado 426/426 antes de subir; manifiesto `go-no-go\manifiesto-diseno-inicio.json`. **Superados:** `dpl_EGHag2…` (primera entrega), `dpl_9BQKH9…`, `dpl_C1ym7M…`. Producción sigue en R8.6 `dpl_CLt7XsemNab3QBWGuNsSrwba6BqT`. No se promovió.

## Qué se pidió y qué se hizo
| Pedido | Hecho |
|---|---|
| PROIN: «Ver más» a su sitio | Botón «Ver más sobre PROIN ↗» → `https://proindesarrolladores.com/` (pestaña nueva, `noopener noreferrer`, aviso a lectores de pantalla, 44 px) |
| Logotipo de PROIN «está mal» | El anterior era un redibujo de la lámina (INCORRECTO; copia en `evidencia\descartados\`). Ahora: el logotipo REAL (edificio con reflejo y «PRO IN») de `Captura de pantalla 2025-07-16 124022.png` (404×312, más resolución que el `assets/logo-proin.png` del sitio, 263×272), con fondo transparente |
| Fondo «difuminado negro con rojizo tinto muy tenue» | Tinte tinto = `--rojo` de la casa (139,26,26) a opacidad ≤ 0,30 en el hero, «Explora…» y «Nuestros clientes». Un solo valor ajustable (`--ini-tinte`). Interpretación mía: si se quería otra cosa en el degradado, se cambia ahí |
| Pie: círculo de Grupo P-ONCE | Símbolo «11P» NUEVO (de `logop11\logo nuevo.png`, en negro sobre transparente, 360×360, 6 KB; el viejo pesaba 470 KB en cada página) → `https://gp-once.com/` en pestaña nueva |
| «Nosotros»: logo y empresas | Mismo símbolo en el círculo; **INTEN fuera**; PROIN enlaza a su sitio; quedan VIVE BIEN, PROIN, ANDAX y VELARE (los textos de ANDAX y VELARE no se verificaron) |
| «Espacio» en morado → rojo; «Ver catálogo completo» | Ambos en `--rojo-marca` (#C8102E). «Espacio» es texto grande (3,3:1, cumple AA como texto grande); el enlace se agrandó a 1,2 rem en negrita para cumplir AA igual. El único morado que queda es el extremo de la línea fina superior del hero (decoración) |
| Mapita en «Contáctanos» | Mapa pequeño (190 px) con Leaflet + OpenStreetMap (sin claves; ya permitido por la política de seguridad), pin rojo, dirección en texto y «Cómo llegar ↗» (Google Maps). Se carga solo al acercarse; no captura la rueda ni el dedo en el teléfono |
| «¿Qué es?» y PROIN: imágenes de mala calidad, cortadas, con movimiento | Se retiraron los recortes de 400×470 y 590×350 px. Dos **ilustraciones vectoriales (SVG) hechas para la portada**: casa contemporánea y edificio de concreto/lamas/vidrio, al atardecer, enteras en su marco, nítidas a cualquier densidad (pocos KB), con movimiento: nubes que derivan, resplandor del sol, vidrio con brillo que cruza, luz de ventanas que se enciende, árboles que se mecen. Se apaga con «movimiento reducido» |

### Coordenadas de la tienda (para el mapa)
`21.1530178, -101.7283955`, de la ficha pública de Google Maps «VIVE BIEN GRUPO INMOBILIARIO» (agencia inmobiliaria, 37358 Cañada del Refugio; **mismo teléfono 477 811 6501 y vivebienn.com**), consultada en Chrome el 21-oct-2026. OpenStreetMap NO tiene el número 2910: solo el tramo del Blvd. Campestre (21.15248, -101.72498), ~300 m al este; no se usó. **Pendiente del propietario: confirmar que el pin cae donde está la tienda** (en el Preview cae junto a Prolongación/Blvd. Campestre).

### Sobre las ilustraciones
- Intenté primero generar fotografías con la herramienta de imágenes de Canva: el archivo que queda en disco es una miniatura de 161×200 px (la imagen completa solo vive en Canva y obtenerla exigiría crear diseños en tu cuenta). Por eso opté por vectores propios, que además no dependen de terceros ni de licencias.
- Son imágenes **conceptuales de marca**, no un inmueble del catálogo ni un proyecto real de PROIN (el catálogo manda). No llevan leyenda visible; se puede añadir «Imagen ilustrativa».
- Calidad: son ilustraciones planas con degradados, no fotografías. Si se prefieren fotos reales, hacen falta los originales (de PROIN o del catálogo).

## Pruebas de esta entrega
| Prueba | Resultado |
|---|---|
| `tsc` | limpio |
| Vitest `portada-rediseno.test.ts` (nuevo, ahora **27**: logotipos, enlaces, tinte ≤ 0,30, ilustraciones vectoriales sin bitmaps ni `filter` animado, mapa, coordenadas, pie, Nosotros, colores del hero) | **27 de 27** · `imagen-respaldo` + `ficha-cache` ya verdes en la entrega anterior |
| Revisión en Chrome del Preview vigente | Hero (espacio y catálogo en rojo, tinte visible), «Qué es», PROIN (ilustración, logotipo, botón), Contacto con mapa (pin, 2 teselas cargadas, sin saltos de scroll), pie (símbolo nuevo, enlace correcto), Nosotros (4 empresas, PROIN con su enlace, círculo nuevo) |
| **e2e de la portada con estos cambios** | **NO EJECUTADO.** La corrida se cortó por poca memoria del sistema y, por instrucción, no se relanza sin que se pida. Las pruebas e2e nuevas (mapa, ilustraciones, enlaces de pie y Nosotros) están escritas pero **sin correr**. La última corrida completa válida (104/104) fue anterior a estos cambios |
| Vitest completo del entorno | No se repitió tras estos cambios (última: 2673 ok · 6 previas fallan · 6 omitidas) |

## Pendientes
1. Correr el e2e de la portada (≈ 10 min, un solo trabajador) cuando se autorice y haya memoria.
2. Confirmar el pin del mapa; decidir leyenda «imagen ilustrativa»; decidir si se prefieren fotografías.
3. Archivos viejos del logotipo de P-ONCE siguen en `public/` sin usarse (≈ 1,5 MB); no se borraron.
4. Sin revisión independiente; sin Safari/iOS real; teselas del mapa de OpenStreetMap son un tercero (política de uso: tráfico bajo).


---

## TERCERA ENTREGA (21-oct-2026): fotografías, mosaico, Nosotros, Contacto y pulido de la portada

Solo Preview (variables de staging); producción intacta (`dpl_CLt7XsemNab3QBWGuNsSrwba6BqT`). Nada de commit, push ni promoción.

### Qué cambió
| Pieza | Resultado |
|---|---|
| «¿Qué es Vive Bien?» | La ilustración vectorial se sustituyó por la imagen «Modern Home Overlooking the City» entregada por el propietario (recortada a su marco, 1420×840; trae el triángulo rojo) |
| PROIN | Reordenada como la lámina «Desarrollando espacios con valor»: foto a la izquierda; logotipo, titular, frase de relación, párrafo y «Ver más» a la derecha; los 4 puntos a todo lo ancho debajo. Foto: render «edificio corporativo» de proindesarrolladores.com (1400×1050, más nítido y contraste). Logotipo pegado al borde derecho de su columna |
| Mosaico de categorías | Se probó una versión de 5 columnas con fotos libres y base difuminada; **el propietario la rechazó y se revirtió** a las 6 categorías anteriores (la foto de Oficinas se rehízo recortando la lámina «Premium Real Estate Property Showcase» porque se había sobrescrito) |
| **Nosotros** | Rehecha en 6 secciones con un solo patrón (`src/components/nosotros/`): hero con cifras (fondo: «Engineers Overlooking Sunset Construction Site», del propietario) · historia con hitos sobre degradado de marca · 5 valores con foto en diagonal · «¿Por qué nosotros?» con mapa vectorial de Guanajuato (46 municipios, INEGI vía github.com/abcsds/GTO), León y Silao · Grupo P-ONCE (5 empresas, **sin INTEN**, con los logotipos descargados de gp-once.com) · cierre con 3 botones. Destinos como en gp-once.com: PROIN → proindesarrolladores.com; VELARE → velare-nu.vercel.app; OTLI.IA → otli-ia.com; **ANDAX → WhatsApp 477 811 6501**; Vive Bien → inicio. «Contáctanos» del hero → `/contacto`. Entrada suave al desplazarse y cifras que cuentan (apagadas con «movimiento reducido»; sin JS el HTML ya es visible) |
| **Contacto** | Rehecha según `contactanos/Modern Spanish Real Estate Contact Page.png` (`src/components/contacto/`): hero oscuro, datos con iconos de color, «Visítanos» con mapa (Leaflet/OSM), 3 garantías y formulario fijo con iconos. **Misma lógica de envío** (`/api/registro-lead`, consentimiento, contexto de propiedad) |
| Portada (pulido) | Titulares en Playfair con cursiva roja (mismo patrón que Nosotros y Contacto); clientes en claro; «Explora nuestras propiedades» como cierre azul noche con esquina roja; cifras del hero también de 640 a 1239 px; **testimonios con formato de reseña de mapas sin logotipo** (autor, 5 estrellas, comentario; textos, nombres y roles EXACTOS; **sin fechas ni calificación agregada, para no inventar datos**); se quitó la foto que se había puesto tras «Cómo te acompañamos» |

### Créditos de imágenes (todas fuera de `public/` del catálogo; no son inmuebles del catálogo)
- **Del propietario:** «Modern Home Overlooking the City», «Engineers Overlooking Sunset Construction Site», «Premium Real Estate Property Showcase» (recorte de Oficinas), logotipos de gp-once.com.
- **proindesarrolladores.com:** `assets/proyectos/edificio-corporativo-render.jpg` (sitio del propio grupo).
- **Unsplash (licencia Unsplash, uso comercial sin atribución obligatoria):** Salman Saqib (villa nocturna, casa moderna), Efe Kekikciler (edificio al atardecer), Craftsman Concrete Floors (nave), Hammer Group (oficina), Bernd Dittrich (aérea), Feng Sun (grúas), Ariel Domenden (sala), Facu Montanaro (laptop), Cesar Cid (casa con alberca), Nikita (pasillo, Contacto), Sanju Pandita (jardín).
- **Wikimedia Commons (CC BY-SA 4.0, con crédito visible en la página):** ProtoplasmaKid — Arco de la Calzada, León; Juan Carlos Fonseca Mata — Puerto Interior, Silao.

### Verificación
| Comprobación | Resultado |
|---|---|
| `tsc` | limpio |
| Pruebas estáticas (portada, Nosotros, Contacto, contraste, E-37, correo institucional, imagen de respaldo) | verdes |
| **Contraste (nueva `tests/contraste-portada.test.ts`)** | texto ≥ 4,5:1 en los 12 pares; titulares grandes e iconos ≥ 3:1. Se corrigió: botón verde de WhatsApp (texto blanco → oscuro, 9,05:1), icono naranja (#b45f06, 4,58:1), icono verde (#17803d) |
| Chrome real (Preview) | escritorio y móvil a 390 px: sin desbordes horizontales; íconos centrados (medido por JS: 0 fuera de 1 px); contador de cifras llega a su valor |
| Datos que difieren de la lámina | Dirección y horario salen de `NEGOCIO` (Blvd. Campestre 2910, Local 10; Sáb–Dom 11:00–14:00), no de la lámina (2502 Int. 201; Sáb 9:00–14:00) |

### Pendientes
1. **e2e de la portada, Nosotros y Contacto:** ver el estado en la sección «e2e» al final de esta entrega.
2. Confirmar datos de las láminas (menos de 2 horas, +500 clientes, años de los hitos), el pin del mapa y la dirección/horario oficiales.
3. Logotipo de PROIN sin fondo; fotos propias de proyectos; ANDAX y OTLI.IA sin sitio propio verificado (ANDAX va a WhatsApp por decisión del propietario).
4. Sin Lighthouse/velocidad medidos; sin revisión independiente; sin Safari/iOS real.
5. Documentación de Obsidian hecha con respaldo `pre-67-*`.

### e2e (corrida limpia, 21-oct-2026)
`next build` hermético del entorno + Playwright con **un trabajador** y proyectos **v390 y v1440** sobre `tests-visual/inicio-rediseno.e2e.ts`: **66 pasaron, 0 fallaron (5,3 min)**. Incluye: portada (sin desbordes, axe sin críticas ni serias, contraste del hero sobre lo que hay realmente), pie y «Nosotros» (círculo con logotipo nuevo, sin INTEN), mapa de la tienda, **«Nosotros»** (6 secciones, sin desborde, imágenes sin romper, destinos de las empresas, iconos centrados) y **«Contacto»** (5 datos, mapa, etiquetas asociadas, envío bloqueado sin consentimiento; sin enviar). La réplica no reenvió nada (`reenviadas: 0`). **No se corrieron v768 ni v1024** en esta corrida (se limitó por memoria); fueron válidos en la entrega anterior. Logs: `verificacion-20261016-1821\etapa5-confirmacion\logs-diseno3\`.

---

## CUARTA ENTREGA (21-oct-2026, cierre del día): portadas por página, acceso y encabezado
Solo Preview. Preview combinado `vive-bien-4um3ubipd` (453 archivos, huella `b114ec3637c98a44d8bc7d8d5abbdc7f8d03d089`, verificado contra manifiesto). Nota de sesión completa en Obsidian: «Sesión 2026-10-21 — Portada, Nosotros, Contacto, Valuador y Entrar».

| Cambio | Resultado |
|---|---|
| Portadas por página (láminas del propietario, solo la fotografía; el texto es HTML) | **Propiedades** (`public/portadas/propiedades.webp`, con el tejado rojo de la marca; chips rojos; se quitó la tarjeta «15 años exp.»; precarga local en `page.tsx`), **Nosotros** («Golden Hour»), **Contacto** («Modern Real Estate Contact Lobby»), **Valuador** (panel de texto claro + foto en diagonal; sin triángulo izquierdo) |
| Remasterizado de imágenes | `hqdn3d` → Lanczos ×2 → `cas=0.6` → `unsharp` → `eq` → WebP. Nitidez objetiva del login 218 → 1 124 (con máscara solo en los bordes del marco rojo). Calificación: Propiedades 5→8, Nosotros 6→8,5, Contacto 6→8, Valuador 5→7,5, Login 4→8. Límite: no inventa detalle (el origen del valuador es de 1 023 px) |
| Inicio | Sin las tres cifras del hero; bloque de PROIN alineado a la derecha con su logo (≥ 900 px; medido: etiqueta, logo, título, frase, párrafo, botón y contenedor terminan en el mismo borde) |
| Entrar | Foto remasterizada; logotipos (tarjeta y banda) llevan a `/`; «Volver al inicio» como enlace sutil al pie, sin caja |
| Header | «Centro de Ayuda» → «Ayuda»; «Ingresar» sin candado |
| Pruebas | `tsc` limpio; estáticas verdes (portada 32, contraste 16, entrar/header 6, E-37, ayuda, acceso 154 en conjunto); actualizadas `ficha-cache` y `medios-optimizar` (la portada del catálogo ya es local). **e2e de estos últimos cambios no corrido** (solo revisión en Chrome) |
| Comprobado contra producción | Los 6 errores de ESLint de `propiedades/page-client.tsx` ya existían en el paquete limpio (13 problemas iguales) |

### Anexo (21-oct-2026, tarde): foto de `/entrar`
Se sustituyó por «Más que propiedades, mejores historias.png» del propietario (1 391×1 131): texto incrustado retirado por relleno vertical del cielo/suelo (script `limpiar-login2.cjs` de la carpeta de trabajo), ampliada a 2 000 px (412 KB), nitidez objetiva 218 → 1 399. Preview combinado `vive-bien-h4tc2k3g4` (huella `4134353050bab285ea0219b654e65d0570b5a950`). Queda una mancha muy tenue junto a la franja roja (donde estaba la coma).
