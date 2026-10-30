/**
 * Direcciones INTERNAS de VIVE BIEN (D-76.1). Son correos de PERSONAS, no de contacto público.
 *
 * Viven aparte de `NEGOCIO` a propósito: `NEGOCIO` lo importa casi todo el sitio (pie, contacto, fichas…) y por tanto viaja en
 * el JavaScript público; cualquier dirección que esté dentro acaba en los navegadores de todo el mundo. Aquí sólo deben importar
 * el servidor (Telegram) y la pantalla de siembra del administrador. Una prueba fija quién puede importarlo.
 */

/**
 * Correo de la CUENTA del propietario (es un usuario del sistema, no un contacto): sirve para reconocerlo al iniciar sesión
 * (siembra) y como respaldo para atribuirle lo que llega por Telegram. NUNCA se publica ni se usa como contacto institucional.
 */
export const CUENTA_PROPIETARIO = 'joseponcer@vivebienn.com'
