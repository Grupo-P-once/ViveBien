# Fuentes alojadas en el sitio

Montserrat, Open Sans y Playfair Display se sirven desde `/fuentes/*.woff2` (antes se pedían a fonts.googleapis.com / fonts.gstatic.com). Las tres familias se distribuyen bajo la
**SIL Open Font License, Version 1.1** (https://openfontlicense.org), que permite usarlas, copiarlas y redistribuirlas, incluso con fines comerciales, siempre que se conserve el aviso
de derechos y la licencia, y que la fuente no se venda por sí sola. El texto de cada licencia está en este directorio.

| Familia | Derechos (según su OFL.txt) | Texto de la licencia | Repositorio |
|---|---|---|---|
| Montserrat | The Montserrat.Git Project Authors | `OFL-Montserrat.txt` | https://github.com/JulietaUla/Montserrat |
| Open Sans | The Open Sans Project Authors | `OFL-Open-Sans.txt` | https://github.com/googlefonts/opensans |
| Playfair Display | The Playfair Project Authors | `OFL-Playfair-Display.txt` | https://github.com/clauseggers/Playfair |

Origen de los archivos: el CSS que Google Fonts servía a un navegador moderno el 3-nov-2026 (los woff2 de fonts.gstatic.com, sin modificar). `manifiesto.json` guarda el tamaño, el inicio del
sha256 y la URL de origen de cada archivo; una prueba (`tests/fuentes-alojadas.test.ts`) compara los archivos con ese manifiesto. Las reglas `@font-face` están en `src/app/fuentes.css`.
