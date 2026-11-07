import { NextResponse } from 'next/server'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { buscar } from '@/lib/ayuda/consultas'
import { consultaBuscable, normalizarConsulta } from '@/lib/ayuda/modelo'

/**
 * GET /api/ayuda/buscar?q= — buscar en el Centro público.
 *
 * La consulta se normaliza y se acota ANTES de llegar a la base: sin tildes,
 * en minúsculas y con un tope de 200 caracteres. Lo que llega de fuera se
 * acota siempre.
 *
 * Una consulta de una letra no busca: devuelve vacío sin molestar a la base.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Sin sesión y cada consulta distinta llega a la base: tope por origen (auditoría 7-nov-2026, H-8).
  const frenado = await frenarAsync(`ayuda-buscar:${origenDe(req)}`, TOPES.ayudaBuscar)
  if (frenado) return frenado
  const q = normalizarConsulta(new URL(req.url).searchParams.get('q') ?? '')
  if (!consultaBuscable(q)) {
    return NextResponse.json({ consulta: q, resultados: [], desactualizado: false })
  }
  const { datos, desactualizado } = await buscar(q)
  return NextResponse.json({ consulta: q, resultados: datos, desactualizado })
}
