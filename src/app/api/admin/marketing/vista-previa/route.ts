import { NextResponse } from 'next/server'
import { exigir } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { bandejaDeEjemplo, BIBLIOTECA, catalogoCompleto, DESTINATARIO_DE_EJEMPLO, GRUPOS_DE_CATALOGO, MATRIZ_DE_EVENTOS, MAX_PROPIEDADES_DE_MUESTRA, MUESTRA_POR_OMISION, muestraPermitida, NOMBRES_DE_MUESTRA, SIN_VISTA_PREVIA, vistaPrevia } from '@/lib/correo/biblioteca'

/**
 * Biblioteca de correos y vista previa SINTÉTICA. Sin `tipo`: el catálogo completo por grupo (con su rastro en el código), la bandeja de ejemplo y la matriz de
 * eventos. Con `tipo`: asunto, remitente, preencabezado, HTML y texto plano de ese correo con datos de ejemplo. No lee la base, no dispara ningún evento y no envía nada.
 * Las imágenes de ejemplo se sirven desde este mismo despliegue (/correo-ejemplo/); el origen lo decide el servidor, nunca el navegador.
 */
export const dynamic = 'force-dynamic'

function origenDeImagenes(): string | undefined {
  const host = process.env.VERCEL_URL
  return host && /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : undefined
}

export async function GET(req: Request) {
  const auth = await exigir(req, 'correo.ver')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`marketing-lectura:${auth.perfil.uid}`, TOPES.marketingPanel)
  if (frenado) return frenado

  const q = new URL(req.url).searchParams
  const origenImagenes = origenDeImagenes()
  const tipo = q.get('tipo')
  if (!tipo) {
    return NextResponse.json(
      {
        tipos: BIBLIOTECA.map(({ id, nombre, categoria, estado, disparador }) => ({ id, nombre, categoria, estado, disparador })),
        grupos: GRUPOS_DE_CATALOGO,
        catalogo: catalogoCompleto(),
        bandeja: bandejaDeEjemplo({ ...MUESTRA_POR_OMISION, origenImagenes }),
        destinatarioDeEjemplo: DESTINATARIO_DE_EJEMPLO,
        sinVistaPrevia: SIN_VISTA_PREVIA,
        muestras: { nombres: NOMBRES_DE_MUESTRA, maxPropiedades: MAX_PROPIEDADES_DE_MUESTRA },
        matriz: MATRIZ_DE_EVENTOS,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  const v = vistaPrevia(tipo, { ...muestraPermitida(q.get('nombre'), q.get('propiedades'), q.get('imagenes')), origenImagenes })
  if (!v) return NextResponse.json({ error: 'Tipo de correo desconocido.' }, { status: 404 })
  return NextResponse.json({ ...v, destinatario: DESTINATARIO_DE_EJEMPLO, sintetico: true, inerte: true }, { headers: { 'Cache-Control': 'private, no-store' } })
}
