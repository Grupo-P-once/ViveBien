// Doble de `server-only` para las pruebas (D-42).
//
// El paquete real lanza al importarse fuera del entorno de React Server, que es
// justo lo que queremos en producción: si un componente de cliente importa un
// módulo del servidor, `next build` falla. En vitest no hay ese entorno, así
// que aquí no hace nada. La frontera se comprueba de dos formas de verdad: el
// build, y `tests/frontera-cliente-servidor.test.ts`.
export {}
