'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Bell, CheckCheck, FileText, Home, Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useSesion } from '@/components/admin/sesion'
import { fechaCorta } from '@/lib/admin/formato'

/**
 * La bandeja de avisos del cliente (28-oct-2026): propiedades nuevas para sus búsquedas, cambios de Términos/Privacidad y avisos del sistema. Lo no leído se distingue de un
 * vistazo (punto y letra más fuerte, además del texto «Nuevo» para no depender del color). Cada aviso lleva al lugar correcto y se marca leído al abrirlo.
 */
type Aviso = { id: number; tipo: 'busqueda_nueva' | 'baja_de_precio' | 'legal' | 'sistema'; titulo: string; cuerpo: string | null; enlace: string | null; creada_en: string; leida_en: string | null }
type Datos = { notificaciones: Aviso[]; sinLeer: number }
const ICONO = { busqueda_nueva: Home, baja_de_precio: Home, legal: FileText, sistema: Info } as const

export default function BandejaDeAvisos() {
  const { pedir } = useSesion()
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [marcando, setMarcando] = useState(false)

  useEffect(() => {
    let vivo = true
    pedir<Datos>('/api/portal/notificaciones').then((r) => { if (vivo) setD(r) }).catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron cargar tus avisos.') })
    return () => { vivo = false }
  }, [pedir])

  async function marcar(ids?: number[]) {
    setMarcando(true)
    try {
      await pedir('/api/portal/notificaciones', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) })
      const ahora = new Date().toISOString()
      setD((a) => (a ? { sinLeer: ids ? Math.max(0, a.sinLeer - ids.length) : 0, notificaciones: a.notificaciones.map((n) => (!n.leida_en && (!ids || ids.includes(n.id)) ? { ...n, leida_en: ahora } : n)) } : a))
      if (!ids) toast.success('Todos tus avisos quedaron como leídos.')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo marcar como leído.') }
    setMarcando(false)
  }

  return (
    <section aria-labelledby="bandeja-avisos" className="rounded-xl border bg-card p-5" data-bandeja-avisos>
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <h2 id="bandeja-avisos" className="flex min-w-0 flex-1 items-center gap-2 font-heading text-[1.02rem] font-semibold">
          <Bell className="size-4" aria-hidden />Mis avisos
          {d && d.sinLeer > 0 && <span className="rounded-full bg-[#8B1A1A] px-2 py-0.5 text-xs font-semibold text-white" data-sin-leer>{d.sinLeer} {d.sinLeer === 1 ? 'nuevo' : 'nuevos'}</span>}
        </h2>
        {d && d.sinLeer > 0 && <Button variant="outline" size="sm" onClick={() => { void marcar() }} disabled={marcando}><CheckCheck aria-hidden /> Marcar todos como leídos</Button>}
      </header>
      {error && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}
      {!d && !error && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Cargando…</p>}
      {d && d.notificaciones.length === 0 && (
        <p className="rounded-lg bg-[var(--panel-fondo)] px-4 py-6 text-center text-sm text-muted-foreground" data-avisos-vacio>
          Todavía no tienes avisos. Cuando publiquemos algo que encaje con una búsqueda donde pulsaste «Avisarme», o cambien nuestros Términos, aparecerá aquí.
        </p>
      )}
      {d && d.notificaciones.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {d.notificaciones.map((n) => {
            const Icono = ICONO[n.tipo] ?? Info
            const nuevo = !n.leida_en
            const contenido = (
              <>
                <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${nuevo ? 'bg-[#8B1A1A]/10 text-[#8B1A1A]' : 'bg-muted text-muted-foreground'}`}><Icono className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${nuevo ? 'font-semibold' : 'font-medium'}`}>{nuevo && <span className="mr-2 rounded bg-[#8B1A1A] px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-white">Nuevo</span>}{n.titulo}</span>
                  {n.cuerpo && <span className="mt-0.5 block text-sm text-muted-foreground">{n.cuerpo}</span>}
                  <span className="mt-1 block text-xs text-muted-foreground">{fechaCorta(n.creada_en)}</span>
                </span>
              </>
            )
            return (
              <li key={n.id} data-aviso={n.id} data-leido={nuevo ? 'no' : 'si'} className={nuevo ? 'bg-[#8B1A1A]/[0.03]' : ''}>
                {n.enlace
                  ? <Link href={n.enlace} onClick={() => { if (nuevo) void marcar([n.id]) }} className="flex gap-3 p-4 hover:bg-muted/40">{contenido}</Link>
                  : <div className="flex gap-3 p-4">{contenido}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
