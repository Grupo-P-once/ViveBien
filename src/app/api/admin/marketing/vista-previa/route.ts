import { NextResponse } from 'next/server'
import { exigir } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { BIBLIOTECA, MATRIZ_DE_EVENTOS, SIN_VISTA_PREVIA, vistaPrevia } from '@/lib/correo/biblioteca'

/**
 * Biblioteca de correos y vista previa SINTÉTICA (F1). Sin `tipo`: el catálogo (metadatos y la matriz de eventos). Con `tipo`: asunto, HTML y texto plano
 * de ese correo con datos de ejemplo. No lee la base, no dispara ningún evento y no envía nada.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await exigir(req, 'correo.ver')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`marketing-lectura:${auth.perfil.uid}`, TOPES.marketingPanel)
  if (frenado) return frenado

  const tipo = new URL(req.url).searchParams.get('tipo')
  if (!tipo) {
    return NextResponse.json(
      {
        tipos: BIBLIOTECA.map(({ id, nombre, categoria, estado, disparador }) => ({ id, nombre, categoria, estado, disparador })),
        sinVistaPrevia: SIN_VISTA_PREVIA,
        matriz: MATRIZ_DE_EVENTOS,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  const v = vistaPrevia(tipo)
  if (!v) return NextResponse.json({ error: 'Tipo de correo desconocido.' }, { status: 404 })
  return NextResponse.json({ ...v, sintetico: true }, { headers: { 'Cache-Control': 'private, no-store' } })
}
