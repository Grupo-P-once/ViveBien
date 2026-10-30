import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import VistaPreviaAdmin from '@/components/admin/VistaPreviaAdmin'
import FichaDeUsuario from '@/app/admin/usuarios/[uid]/page'
import { vistaPreviaPermitida } from '@/lib/vista-previa'
import { CASOS_PERMISOS, MODOS_GUARDADO, type CasoPermisos, type ModoGuardado } from '@/lib/admin/vista-previa-permisos'

/** /vista-previa/admin/usuarios/[uid]?caso=…&guardado=… — SÓLO DESARROLLO. En producción y en Vercel: 404. */
export const metadata: Metadata = { title: 'Vista previa de una cuenta — Vive Bien', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function Pagina({ searchParams }: { searchParams: Promise<{ caso?: string; guardado?: string }> }) {
  if (!vistaPreviaPermitida()) notFound()
  const { caso, guardado } = await searchParams
  const c = (CASOS_PERMISOS as readonly string[]).includes(caso ?? '') ? (caso as CasoPermisos) : 'normal'
  const g = (MODOS_GUARDADO as readonly string[]).includes(guardado ?? '') ? (guardado as ModoGuardado) : 'ok'
  return <VistaPreviaAdmin caso={c} guardado={g}><FichaDeUsuario /></VistaPreviaAdmin>
}
