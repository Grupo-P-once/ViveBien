import { supabaseAdmin } from '../auth-server'
import type { DbCorreo } from './enviar'

/**
 * La base donde vive el LIBRO DE CUPO (`correo_envios`, migración 62). Un solo punto de acceso para el emisor único: las pruebas lo
 * sustituyen por una base en memoria que carga la migración REAL (`tests/dobles/libro-cupo.ts`), de modo que ningún correo de prueba
 * dependa de un doble que acepte todo.
 */
export const dbDelLibro = (): DbCorreo => supabaseAdmin() as unknown as DbCorreo
