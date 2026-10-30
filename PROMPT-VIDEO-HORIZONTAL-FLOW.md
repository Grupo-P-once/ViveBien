# Texto para generar la versión horizontal del video (Google Flow / Gemini)

Para quien lo genere (el propietario). **No lo ejecutó Claude**: no tiene acceso a Flow ni a Gemini. Sirve para sustituir los archivos de `public/inicio/` por una toma nueva, **sin tocar código**.

## Qué se necesita
| Archivo a reemplazar | Formato |
|---|---|
| `escena-escritorio.mp4` / `.webm` | **16:9 horizontal, 1920×1080 (mínimo 1280×720)**, 8–10 s, 24 fps, **sin audio** |
| `escena-movil.mp4` / `.webm` | Recorte de la MISMA toma, ~1080×1080 o 4:5 (ver abajo) |
| `portada-escritorio.webp` / `portada-movil.webp` | Un cuadro de cada versión (el primero del bucle), WebP calidad ~78 |

Hoy el original es vertical de 720×1280: en escritorio solo se puede mostrar a la derecha del hero (≈1,2× de ampliación) porque a pantalla completa se vería borroso.

## Texto sugerido (español)
> Plano cinematográfico, lento y estable, al atardecer: una casa contemporánea de líneas limpias con una terraza de piedra y alberca infinita en primer plano, sobre una colina arbolada. Al fondo, un gran lago tranquilo con pequeños islotes con árboles y, en la otra orilla, una ciudad en ladera con varias torres altas y delgadas, y lomas suaves en el horizonte. Luz dorada cálida, cielo con nubes ligeras, agua con ondas suaves y algunas aves lejanas. Cámara casi fija con un avance muy lento (dolly in de pocos centímetros). Fotorrealista, nítido, 1080p, composición amplia 16:9.
>
> **Sin texto de ningún tipo, sin logotipos, sin marcas de agua, sin letreros, sin subtítulos, sin teléfonos ni direcciones web. Sin personas. Sin audio.**

## Notas de contexto (brief del propietario)
- La escena que se busca es una casa con alberca con vista a la presa del Parque Metropolitano (presa El Palote, León) y, al fondo, el skyline de Gran Jardín con sus torres.
- Referencias **verificadas** en internet: la presa El Palote está dentro del Parque Metropolitano de León (337 ha); existen anuncios de casas y departamentos en Gran Jardín con vista a la presa; la torre más alta de León (Torre 40 Lumière, 44 pisos) está en Gran Jardín. **No se encontró un mirador oficial** ni la «montaña icónica».
- Una toma generada es una **imagen ilustrativa**: no debe presentarse como una ubicación real. Si se quiere que sea la presa de verdad, la mejor fuente es una foto o un video real (dron) tomado en el sitio.

## Cómo preparar la versión móvil a partir de la horizontal
1. Dejar la casa y el lago dentro de un recorte ≈ cuadrado, centrado en el horizonte (no tapar torres ni casa con el texto: el titular va sobre la parte baja, que se oscurece).
2. Con FFmpeg, sin audio (`-an`), bucle sin salto (fundido de ~1 s entre el final y el inicio) y `-movflags +faststart`.
3. Verificar en el Preview: encuadre, contraste del texto y que no haya texto ni marcas en ningún cuadro.

## Licencias
Si se genera con Flow/Gemini, revisar los términos de uso comercial de la cuenta antes de publicarlo. No usar ProPainter ni sus modelos (licencia no comercial) para ningún archivo del sitio.
