import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/catalogo — el catálogo público, con red de seguridad.
 *
 * El 2026-09-10 Supabase devolvió 504 y la página pública se quedó en «0
 * disponibles». Las propiedades seguían ahí; lo que falló fue poder
 * preguntar. Un visitante que ve un catálogo vacío concluye que la
 * inmobiliaria no tiene inventario y se va.
 *
 * Cambiar de proveedor de base de datos no arregla eso: cualquier base
 * alojada se cae. Lo que lo arregla es **no depender de que esté viva para
 * enseñar lo que ya sabíamos**.
 *
 * Dos capas:
 *
 *  1. **Caché de Next** (`revalidate`): la respuesta se sirve desde el borde
 *     y sólo se vuelve a consultar cada pocos minutos. Una caída que dure
 *     menos que eso no se nota siquiera.
 *  2. **Última copia buena en memoria**: si la consulta falla, se devuelve lo
 *     último que sí funcionó, marcado como `desactualizado` para que la
 *     interfaz pueda decirlo. Enseñar datos de hace diez minutos es
 *     infinitamente mejor que enseñar cero — **siempre que se diga**.
 *
 * La copia en memoria vive por instancia y se pierde en cada despliegue. No
 * es una base de datos de repuesto: es un amortiguador.
 */

export const revalidate = 300 // 5 minutos

type Fila = Record<string, unknown>

/** Última respuesta buena. Sobrevive entre peticiones en la misma instancia. */
let ultimaBuena: { datos: Fila[]; cuando: number } | null = null

function clienteLectura() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function GET() {
  try {
    // Un tiempo límite propio: sin esto, un Supabase que tarda 30 s deja la
    // página cargando 30 s. Mejor fallar rápido y servir la copia.
    // `limit` y no sin tope: OTLI documentó que sus consultas sin LIMIT sobre
    // el historial de conversaciones acabaron en cinco minutos de latencia con
    // tres clientes a la vez. Aquí hay dos propiedades, así que hoy da igual —
    // y por eso mismo es el momento de ponerlo, antes de que importe.
    //
    // Sigue en `select('*')` a propósito: elegir columnas a mano es la otra
    // mitad de esa lección, pero una columna que se olvide rompe la ficha
    // pública, y con la base caída no hay forma de comprobarlo. Queda anotado.
    const consulta = clienteLectura()
      .from('propiedades')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    const datos = await Promise.race([
      consulta.then(({ data, error }) => {
        if (error) throw new Error(error.message)
        return (data ?? []) as Fila[]
      }),
      new Promise<never>((_, rechaza) =>
        setTimeout(() => rechaza(new Error('tiempo agotado')), 8000),
      ),
    ])

    // Sólo lo aprobado. RLS ya lo filtra; esto es la segunda barrera.
    const visibles = datos.filter(
      (p) => !p.estado_pub || p.estado_pub === 'publicada',
    )

    ultimaBuena = { datos: visibles, cuando: Date.now() }

    return NextResponse.json({
      propiedades: visibles,
      desactualizado: false,
      consultado: new Date().toISOString(),
    })
  } catch (err) {
    const motivo = err instanceof Error ? err.message : 'error desconocido'
    console.error('[catalogo] la consulta falló:', motivo)

    if (ultimaBuena) {
      return NextResponse.json(
        {
          propiedades: ultimaBuena.datos,
          desactualizado: true,
          consultado: new Date(ultimaBuena.cuando).toISOString(),
          motivo,
        },
        // No cachear una respuesta degradada: la siguiente petición debe
        // volver a intentarlo de verdad.
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    // Sin copia previa no hay nada que servir. Se dice con un código de
    // error, no con una lista vacía y un 200: un 200 con `[]` es
    // indistinguible de «no hay propiedades», y eso es justo la mentira
    // que se está corrigiendo.
    return NextResponse.json(
      { error: 'No se pudo consultar el catálogo.', motivo },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
