import { NextResponse } from 'next/server'
import { categoriasPublicas } from '@/lib/ayuda/consultas'

/**
 * GET /api/ayuda/categorias — las categorías del Centro público.
 *
 * Sin sesión y sin permiso: es ayuda pública. Lo que puede salir lo decide el
 * RLS de la migración 27, no este archivo.
 */
export const revalidate = 300

export async function GET() {
  const { datos, desactualizado } = await categoriasPublicas()
  return NextResponse.json({ categorias: datos, desactualizado })
}
