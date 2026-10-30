'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, BellOff, Check, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import TarjetaPropiedad from '@/components/portal/TarjetaPropiedad'
import { Estado, Esqueleto, Pantalla, Vacio, usePeticionPortal } from '@/components/portal/Pantalla'
import { useGuardadas } from '@/components/portal/guardadas'
import { useSesion } from '@/components/admin/sesion'
import { fechaCorta } from '@/lib/admin/formato'
import type { AlertaVista } from '@/lib/portal/pantallas'
import BandejaDeAvisos from '@/components/portal/BandejaDeAvisos'
import PreferenciasDeAvisos from '@/components/portal/PreferenciasDeAvisos'

/**
 * «Mis alertas» — lo nuevo de cada búsqueda guardada (3b-1, D-27.3 y D-28.2).
 *
 * Dos cosas honestas:
 *  · **No se manda ningún correo** y la pantalla lo dice. El aviso por correo
 *    necesita consentimiento, preferencia y baja: es de otra fase.
 *  · **«Ya las vi» es por búsqueda**: marcar una no apaga las demás, y el
 *    contador baja de verdad (antes contaba desde que se guardó, para siempre).
 */

export type DatosAlertas = { alertas: AlertaVista[] }

export default function AlertasPortal({ fijo }: { fijo?: DatosAlertas }) {
  const peticion = usePeticionPortal<DatosAlertas>('/api/portal/alertas', fijo)
  const { esGuardada, alternar } = useGuardadas()
  const { pedir } = useSesion()
  const [marcando, setMarcando] = useState<number | 'todas' | null>(null)

  async function marcarVistas(busquedaId?: number) {
    setMarcando(busquedaId ?? 'todas')
    try {
      const r = await pedir<DatosAlertas>('/api/portal/alertas', {
        method: 'POST', body: JSON.stringify(busquedaId ? { busquedaId } : {}),
      })
      // Lo que quedó guardado, no lo que se pidió (D-32).
      peticion.poner(r)
      toast.success(busquedaId ? 'Marcadas como vistas' : 'Todas marcadas como vistas')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo marcar como visto.')
    }
    setMarcando(null)
  }

  const sinVer = (d: DatosAlertas) => d.alertas.reduce((n, a) => n + a.nuevas.length, 0)

  return (
    <Pantalla
      titulo="Mis alertas"
      descripcion="Tus avisos y lo que se publicó después de la última vez que miraste cada búsqueda. Si quieres, también te lo mandamos por correo."
      icono={Bell}
      acciones={
        peticion.datos && sinVer(peticion.datos) > 0 ? (
          <Button variant="outline" className="shrink-0" onClick={() => marcarVistas()} disabled={marcando !== null}>
            <Check aria-hidden /> Marcar todas como vistas
          </Button>
        ) : undefined
      }
    >
      {!fijo && (
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <BandejaDeAvisos />
          <PreferenciasDeAvisos />
        </div>
      )}
      <h2 className="mb-3 font-heading text-[1.02rem] font-semibold">Por búsqueda</h2>
      <Estado
        peticion={peticion}
        esqueleto={<Esqueleto filas={2} alto="h-64" />}
        vacio={(d) => d.alertas.length === 0 && (
          <Vacio
            titulo="Todavía no tienes búsquedas guardadas"
            accion={<Button asChild className="mt-2"><Link href="/propiedades">Buscar propiedades</Link></Button>}
          >
            Guarda una búsqueda y aquí aparecerá lo que se publique después.
          </Vacio>
        )}
      >
        {(d) => (
          <div className="space-y-6">
            {sinVer(d) === 0 && (
              <p className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                <BellOff className="size-4 shrink-0" aria-hidden />
                Estás al día: no hay nada nuevo desde la última vez que miraste.
              </p>
            )}
            {d.alertas.map((a) => (
              <section key={a.busquedaId} className="rounded-xl border bg-card p-5">
                <header className="mb-3 flex flex-wrap items-center gap-3">
                  <h2 className="min-w-0 flex-1 font-heading text-[1.02rem] font-semibold">
                    {a.nombre}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {a.nuevas.length > 0
                        ? `${a.nuevas.length} ${a.nuevas.length === 1 ? 'nueva' : 'nuevas'}`
                        : 'sin novedades'}
                    </span>
                  </h2>
                  {a.revisadasEn && (
                    <span className="text-xs text-muted-foreground">Vistas el {fechaCorta(a.revisadasEn)}</span>
                  )}
                  <Button asChild size="sm" variant="outline"><Link href={a.href}><Search aria-hidden /> Ver la búsqueda</Link></Button>
                  {a.nuevas.length > 0 && (
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => marcarVistas(a.busquedaId)}
                      disabled={marcando !== null}
                    >
                      <Check aria-hidden /> Marcar como vistas
                    </Button>
                  )}
                </header>
                {a.nuevas.length === 0 ? (
                  <p className="rounded-lg bg-[var(--panel-fondo)] px-4 py-5 text-center text-sm text-muted-foreground">
                    Nada nuevo por aquí. Cuando se publique algo que encaje, aparecerá en esta lista.
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                    {a.nuevas.map((p) => (
                      <li key={p.id}>
                        <TarjetaPropiedad p={p} guardada={esGuardada(p.id)} onAlternar={alternar} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </Estado>
    </Pantalla>
  )
}
