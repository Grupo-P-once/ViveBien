/**
 * Quién aparece en el círculo de la tarjeta del catálogo («publicado por»).
 *
 * Regla de negocio (decidida por el dueño del producto, 17-oct-2026):
 *   · Si el anuncio lo subió un ASOCIADO → su nombre y su foto de perfil.
 *   · Si lo subió un administrador, un Super Admin o un publicador (modalidad `publicador`) → el perfil de VIVE BIEN.
 * Se aplica con las CAPACIDADES `mostrar_perfil`/`mostrar_nombre`/`mostrar_foto` (ver `asesorDeCuenta`), no con el nombre de la modalidad.
 *
 * Privacidad: esto se calcula en el SERVIDOR y a la tarjeta solo llegan `nombre` y `foto`. Nunca el uid, el correo, el teléfono ni el
 * WhatsApp de la cuenta. Todo lo que no sea inequívocamente un asociado activo con un nombre presentable cae en «VIVE BIEN» (`null`):
 * ante la duda se muestra la marca, no a una persona. La FOTO solo se acepta si es una URL https de NUESTRA nube de Cloudinary (una
 * URL ajena sería un pixel de rastreo dentro de una página pública); si no, se pintan las iniciales.
 *
 * Esto NO cambia el contacto: el teléfono, el WhatsApp y el correo públicos siguen siendo los de VIVE BIEN (D-02, ADR-0006).
 */

import { capacidadesEfectivas } from './acceso/capacidades'

export type AsesorPublico = { nombre: string; foto: string | null }

export type CuentaParaAsesor = {
  uid?: unknown
  nombre?: unknown
  foto_url?: unknown
  rol?: unknown
  tipo_publicador?: unknown
  /** Ajustes por usuario de las capacidades (ADR-0013). */
  permisos_override?: unknown
  estado?: unknown
}

const MAX_NOMBRE = 60

/** Un nombre presentable: sin saltos ni caracteres de control, sin correos ni teléfonos disfrazados de nombre. */
export function nombreParaMostrar(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (limpio.length < 2 || limpio.length > MAX_NOMBRE) return null
  if (/[@<>]/.test(limpio)) return null
  if ((limpio.match(/\d/g) ?? []).length >= 5) return null
  return limpio
}

/** Solo `https://res.cloudinary.com/<nuestra-nube>/…`. Cualquier otra cosa → `null` (se pintan iniciales). */
export function fotoPublicaValida(url: unknown, nube: string | undefined): string | null {
  if (typeof url !== 'string' || !nube) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com' || u.username || u.password) return null
    if (!u.pathname.startsWith(`/${nube}/`)) return null
    return u.toString()
  } catch {
    return null
  }
}

/**
 * Una cuenta ACTIVA con las capacidades `mostrar_perfil` y `mostrar_nombre` y un nombre presentable se muestra como persona; la foto solo
 * con `mostrar_foto`. Se lee `capacidadesEfectivas` (ADR-0013) y NUNCA el nombre de la modalidad: por defecto solo el asociado las trae
 * encendidas; admin, Super Admin y cliente no tienen ninguna (→ VIVE BIEN) y el admin puede ajustarlas por usuario.
 */
export function asesorDeCuenta(c: CuentaParaAsesor | null | undefined, nube: string | undefined): AsesorPublico | null {
  if (!c || c.estado !== 'activo') return null
  const cap = capacidadesEfectivas({ rol: String(c.rol ?? ''), tipo: c.tipo_publicador, overrides: c.permisos_override })
  if (!cap.mostrar_perfil || !cap.mostrar_nombre) return null
  const nombre = nombreParaMostrar(c.nombre)
  if (!nombre) return null
  return { nombre, foto: cap.mostrar_foto ? fotoPublicaValida(c.foto_url, nube) : null }
}

/**
 * Añade `asesor` a cada anuncio visible: la persona (asociado) o `null` (= VIVE BIEN). Un anuncio sin dueño conocido es de la casa.
 * Solo se llama cuando se pudieron leer las dos tablas: si algo falló, la ruta NO añade la clave y la tarjeta no muestra nada.
 */
export function adjuntarAsesor<T extends { id: unknown }>(
  filas: T[],
  duenos: Map<string, string | null>,
  cuentas: Map<string, CuentaParaAsesor>,
  nube: string | undefined,
): Array<T & { asesor: AsesorPublico | null }> {
  return filas.map((f) => {
    const dueno = duenos.get(String(f.id)) ?? null
    return { ...f, asesor: dueno ? asesorDeCuenta(cuentas.get(dueno), nube) : null }
  })
}

/** Miniatura de Cloudinary para el círculo (recorte cuadrado centrado en el rostro): no se baja la foto grande por un círculo de 22 px. */
export function miniaturaDeFoto(url: string): string {
  return url.replace('/upload/', '/upload/c_fill,g_face,w_64,h_64,f_auto,q_auto/')
}

/** «Ana López Ruiz» → «AL». */
export function inicialesDe(nombre: string): string {
  const partes = nombre.split(' ').filter(Boolean)
  const letras = [partes[0]?.[0], partes.length > 1 ? partes[partes.length - 1]?.[0] : partes[0]?.[1]].filter(Boolean).join('')
  return letras.toUpperCase()
}
