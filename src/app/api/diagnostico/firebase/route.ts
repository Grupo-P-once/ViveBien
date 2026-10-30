import { NextResponse } from 'next/server'
import { exigir } from '@/lib/auth-server'
import { diagnosticarFirebaseAdmin, lineaDeDiagnostico, sondarIdentityToolkit } from '@/lib/firebase-admin'

/**
 * Diagnóstico de Firebase Admin (V-1.1.87, D-35, D-44). **No toca a nadie.**
 *
 * Dos partes:
 *
 * 1. **La credencial.** Pide un token de acceso, que la valida contra Google.
 * 2. **La sonda** (`?sonda=1`, D-44). Ejecuta las dos operaciones REALES de la
 *    baja —`accounts:update` y `accounts:delete`— contra un identificador
 *    inexistente de 28 caracteres que genera el servidor. Si las dos contestan
 *    `USER_NOT_FOUND`, queda probado que la baja puede hacer su trabajo.
 *
 * La parte 2 existe porque la parte 1 **nunca probó lo que se rompía**: decía
 * «OK» mientras una baja real se quedaba a medias, porque el fallo estaba en
 * cargar `firebase-admin/auth`, que el diagnóstico ni tocaba.
 *
 * ── LO QUE ESTA RUTA NO HACE ──
 *
 * · No acepta ningún identificador de fuera. El de la sonda lo genera el
 *   servidor con `randomBytes` y no se puede sustituir por query, cuerpo ni
 *   cabecera. Un UID real **no tiene forma de entrar aquí**.
 * · No llama a `baja_de_cuenta` ni escribe en ninguna tabla.
 * · No devuelve la credencial, el token, la clave privada, el correo de la
 *   cuenta de servicio, el identificador de la sonda ni el cuerpo de ninguna
 *   respuesta de Google. Sólo códigos cortos.
 *
 * Sólo Super Admin (`configuracion.flags`). No es público a propósito: aunque
 * la respuesta no lleve datos, decir por ahí si las credenciales de servidor
 * están puestas no le hace falta a nadie, y cada llamada habla con Google.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Lo que se enseña de cada paso. Nunca más que esto. */
const ETIQUETA = {
  token: 'token OAuth',
  'accounts:update': 'accounts:update',
  'accounts:delete': 'accounts:delete',
} as const

export async function GET(req: Request) {
  const { perfil, error } = await exigir(req, 'configuracion.flags')
  if (error) return error
  void perfil

  const d = await diagnosticarFirebaseAdmin()
  const cuerpo: Record<string, unknown> = {
    linea: lineaDeDiagnostico(d),
    ok: d.ok,
    // Si la credencial es de OTRO proyecto de Firebase, el borrado de
    // identidades fallaría más tarde y en silencio. Mejor saberlo aquí.
    proyectoCoincide: d.ok ? d.proyectoCoincide : null,
    nodo: process.version,
  }

  // La sonda es opt-in: hace dos llamadas de escritura a Google (contra un
  // identificador que no es de nadie), y no tiene por qué correr en cada visita.
  if (new URL(req.url).searchParams.get('sonda') === '1') {
    const r = await sondarIdentityToolkit()
    cuerpo.sonda = {
      ok: r.ok,
      // `token OAuth: OK` · `accounts:delete: USER_NOT_FOUND` · …
      lineas: r.pasos.map((p) => `${ETIQUETA[p.paso]}: ${p.codigo}`),
    }
  }

  return NextResponse.json(
    cuerpo,
    // Siempre 200: un fallo de la credencial no es un fallo de la petición, y
    // así la pantalla puede enseñar la causa en vez de un error genérico.
    { status: 200 },
  )
}
