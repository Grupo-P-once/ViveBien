'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, Bookmark, Check, Pencil, Search, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Confirmar from '@/components/admin/Confirmar'
import { Estado, Esqueleto, Pantalla, Vacio, usePeticionPortal } from '@/components/portal/Pantalla'
import { useSesion } from '@/components/admin/sesion'
import { PreferenciasDeBusqueda, type DatosMiBusqueda } from '@/components/portal/MiBusquedaPortal'
import { entero, fechaCorta } from '@/lib/admin/formato'
import type { BusquedaVista } from '@/lib/portal/pantallas'

/**
 * «Mis búsquedas» — lo que guardó para no volver a teclearlo (3b-1).
 *
 * De cada una: qué busca, cuántas hay hoy y cuántas son nuevas desde la última
 * vez que miró sus alertas. Los totales los calcula el servidor: el navegador
 * no lee la tabla de propiedades.
 */

export type DatosBusquedas = { busquedas: BusquedaVista[] }

export default function BusquedasPortal({ fijo, fijoPerfil }: { fijo?: DatosBusquedas; fijoPerfil?: DatosMiBusqueda }) {
  const peticion = usePeticionPortal<DatosBusquedas>('/api/portal/busquedas', fijo)
  const { pedir } = useSesion()
  const [editando, setEditando] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [borrando, setBorrando] = useState<BusquedaVista | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  async function renombrar(b: BusquedaVista) {
    setTrabajando(true)
    try {
      // Se guarda lo que responde el servidor, no lo que se escribió (D-32).
      const r = await pedir<{ id: number; nombre: string | null }>('/api/portal/busquedas', {
        method: 'PATCH', body: JSON.stringify({ id: b.id, nombre }),
      })
      peticion.poner({
        busquedas: (peticion.datos?.busquedas ?? []).map((x) =>
          x.id === r.id ? { ...x, nombre: (r.nombre ?? '').trim() || x.descripcion } : x),
      })
      setEditando(null)
      toast.success('Nombre guardado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el nombre.')
    }
    setTrabajando(false)
  }

  /** Enciende/apaga el aviso de una búsqueda o cambia su frecuencia. Se muestra lo que respondió el servidor. */
  async function cambiarAviso(b: BusquedaVista, cambio: { alertas?: boolean; frecuencia?: 'diaria' | 'semanal' }) {
    setTrabajando(true)
    try {
      const r = await pedir<{ id: number; alertas: boolean; frecuencia?: 'diaria' | 'semanal' }>('/api/portal/busquedas', { method: 'PATCH', body: JSON.stringify({ id: b.id, ...cambio }) })
      peticion.poner({ busquedas: (peticion.datos?.busquedas ?? []).map((x) => (x.id === r.id ? { ...x, alertas: r.alertas, frecuencia: r.frecuencia ?? x.frecuencia } : x)) })
      toast.success(cambio.alertas === true ? 'Te avisaremos de lo nuevo en esta búsqueda' : cambio.alertas === false ? 'Ya no te avisaremos de esta búsqueda' : 'Frecuencia guardada')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el aviso.') }
    setTrabajando(false)
  }

  async function borrar() {
    if (!borrando) return
    setTrabajando(true)
    try {
      await pedir(`/api/busquedas?id=${borrando.id}`, { method: 'DELETE' })
      peticion.poner({ busquedas: (peticion.datos?.busquedas ?? []).filter((x) => x.id !== borrando.id) })
      setBorrando(null)
      toast.success('Búsqueda borrada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar.')
    }
    setTrabajando(false)
  }

  return (
    <Pantalla
      titulo="Mis búsquedas"
      descripcion="Lo que guardaste para no volver a teclearlo, con cuántas propiedades hay hoy."
      icono={Bookmark}
      acciones={
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/propiedades"><Search aria-hidden /> Buscar</Link>
        </Button>
      }
    >
      <Estado
        peticion={peticion}
        esqueleto={<Esqueleto filas={3} alto="h-24" />}
        vacio={(d) => d.busquedas.length === 0 && (
          <Vacio
            titulo="Todavía no guardas ninguna búsqueda"
            accion={<Button asChild className="mt-2"><Link href="/propiedades">Buscar propiedades</Link></Button>}
          >
            Busca lo que te interesa y pulsa «Guardar búsqueda»: aquí verás cuántas hay y cuántas son nuevas.
          </Vacio>
        )}
      >
        {(d) => (
          <ul className="space-y-3">
            {d.busquedas.map((b) => (
              <li key={b.id} className="rounded-xl border bg-card p-4">
                {editando === b.id ? (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(e) => { e.preventDefault(); renombrar(b) }}
                  >
                    <label className="sr-only" htmlFor={`nombre-${b.id}`}>Nombre de la búsqueda</label>
                    <Input
                      id={`nombre-${b.id}`}
                      autoFocus
                      value={nombre}
                      maxLength={60}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder={b.descripcion}
                      className="h-9 min-w-0 flex-1"
                    />
                    <Button type="submit" size="sm" disabled={trabajando}><Check aria-hidden /> Guardar</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(null)} disabled={trabajando}>
                      <X aria-hidden /> Cancelar
                    </Button>
                  </form>
                ) : (
                  <>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-heading font-semibold">{b.nombre}</p>
                      <p className="text-sm text-muted-foreground">
                        {b.descripcion} · guardada el {fechaCorta(b.creadoEn)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[var(--panel-fondo)] px-2.5 py-1 text-xs font-semibold">
                        {entero(b.total)} {b.total === 1 ? 'propiedad' : 'propiedades'}
                      </span>
                      {b.nuevas > 0 && (
                        <span className="rounded-md bg-[var(--marca-tinte)] px-2.5 py-1 text-xs font-semibold text-[var(--marca)]">
                          {entero(b.nuevas)} {b.nuevas === 1 ? 'nueva' : 'nuevas'}
                        </span>
                      )}
                      <Button asChild size="sm" variant="outline"><Link href={b.href}>Ver</Link></Button>
                      <Button
                        size="sm" variant="ghost" aria-label={`Cambiar el nombre de ${b.nombre}`}
                        onClick={() => { setEditando(b.id); setNombre(b.nombre === b.descripcion ? '' : b.nombre) }}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Borrar ${b.nombre}`} onClick={() => setBorrando(b)}>
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3 text-sm" data-aviso-busqueda={b.id}>
                    <label className="flex cursor-pointer items-center gap-2 font-medium">
                      <input type="checkbox" checked={b.alertas} disabled={trabajando} onChange={(e) => { void cambiarAviso(b, { alertas: e.target.checked }) }} className="size-4 accent-[#8B1A1A]" />
                      <Bell className="size-4" aria-hidden />Avisarme de propiedades nuevas
                    </label>
                    {b.alertas && (
                      <label className="flex items-center gap-2 text-muted-foreground">
                        Revisar cada
                        <select value={b.frecuencia} disabled={trabajando} onChange={(e) => { void cambiarAviso(b, { frecuencia: e.target.value as 'diaria' | 'semanal' }) }} className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" aria-label={`Cada cuánto revisar ${b.nombre}`}>
                          <option value="diaria">día</option>
                          <option value="semanal">semana</option>
                        </select>
                      </label>
                    )}
                  </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Estado>

      {/* Antes era otra entrada del menú («Mi búsqueda»): es lo mismo, qué busca la persona. */}
      <section id="lo-que-busco" aria-labelledby="lo-que-busco-titulo" className="mt-10 scroll-mt-20">
        <h2 id="lo-que-busco-titulo" className="font-heading text-lg font-semibold">Lo que busco</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Con esto ordenamos las propiedades que te mostramos en tu inicio.
        </p>
        <PreferenciasDeBusqueda fijo={fijoPerfil} />
      </section>

      <Confirmar
        abierto={!!borrando}
        titulo="Borrar esta búsqueda"
        descripcion={<>Se borra «{borrando?.nombre}». Las propiedades no se tocan: sólo dejas de tenerla guardada.</>}
        confirmar="Borrar"
        peligrosa
        trabajando={trabajando}
        onConfirmar={borrar}
        onCerrar={() => setBorrando(null)}
      />
    </Pantalla>
  )
}
