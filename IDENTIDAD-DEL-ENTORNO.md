# Entorno aislado · rediseño de la página de inicio

- **Creado:** 21-oct-2026, a partir de `etapa3\candidato` ya corregido para R8.6 (paquete `etapa3\preview-r86-limpio`, 406 archivos, huella `9f977bccdbef83a632b0af5474cb2013ce8c148b`, manifiesto en `verificacion-…\go-no-go\manifiesto-r86.json`).
- **No contiene:** `.env.local`, `.next`, `test-results`, `.claude`. `node_modules` es un enlace (junction) al del candidato: aquí NO se instala nada.
- **Qué se puede tocar:** solo la página pública de inicio (`src/app/page.tsx` y lo que importe), su contacto, su video y sus pruebas. Nada de Admin, Publicador, Asociado ni Cliente (rutas, permisos, vocabulario, navegación), ni bases de datos, migraciones, variables o APIs.
- **El candidato R8.6 y su paquete NO se editan.** Todo cambio vive solo en esta carpeta.
- Sin `commit`, `push`, `promote` ni despliegue a producción.
