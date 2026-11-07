/** ¿Es un enlace del propio sitio? `//host` (protocolo relativo) y barra+contrabarra apuntan a OTRO sitio y no cuentan (auditoría 7-nov-2026, H-11). */
export const esRutaInterna = (destino: string): boolean => /^\/(?![/\\])/.test(destino)
