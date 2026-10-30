'use client'

import { useState } from 'react'
import { olvidarPerfilDeSesion } from '@/lib/acceso/perfil-de-sesion'
import Link from 'next/link'
import { Loader2, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Estado, Esqueleto, Pantalla, usePeticionPortal } from '@/components/portal/Pantalla'
import { useSesion } from '@/components/admin/sesion'
import { cn } from '@/lib/utils'
import {
  MAXIMO_TIPOS, MAXIMO_ZONAS, OPCIONES_TIPO, ZONAS_SUGERIDAS, alternar, type Operacion,
} from '@/lib/cliente/busqueda'
import { queBuscoDelPerfil, type PerfilDelPortal } from '@/lib/portal/perfil'

/**
 * «Mi búsqueda» — lo que la persona busca, en un solo modelo (3b-2).
 *
 * El mismo de 3a: una operación, varias zonas, varios tipos y un presupuesto
 * máximo. Sirve para ordenar «Para ti» en el Inicio; la pantalla lo dice, para
 * que no parezca que se van a mandar avisos que hoy no existen.
 *
 * Se guarda y se pinta **la respuesta del servidor**: si una zona se repetía o
 * un tipo se escribió distinto, se ve ya corregido (D-32).
 */

export type DatosMiBusqueda = PerfilDelPortal

const OPERACIONES: Array<{ valor: Operacion; etiqueta: string }> = [
  { valor: 'venta', etiqueta: 'Comprar' },
  { valor: 'renta', etiqueta: 'Rentar' },
  { valor: 'ambas', etiqueta: 'Las dos' },
]

function Pastilla({ activa, children, onClick, aria }: {
  activa: boolean; children: React.ReactNode; onClick: () => void; aria?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      aria-label={aria}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        activa
          ? 'border-[var(--marca)] bg-[var(--marca)] text-white'
          : 'border-input bg-background hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Lo que la persona busca, sin marco de pantalla: vive dentro de «Mis búsquedas» (una sola entrada del
 * menú) y la ruta antigua `/portal/mi-busqueda` lo sigue pintando con su título.
 */
export function PreferenciasDeBusqueda({ fijo }: { fijo?: DatosMiBusqueda }) {
  const peticion = usePeticionPortal<DatosMiBusqueda>('/api/usuarios/me', fijo)
  const { pedir } = useSesion()
  const [guardando, setGuardando] = useState(false)
  const [zonaNueva, setZonaNueva] = useState('')

  async function guardar(cambio: Record<string, unknown>) {
    setGuardando(true)
    try {
      olvidarPerfilDeSesion()
      const r = await pedir<DatosMiBusqueda>('/api/usuarios/me', { method: 'PATCH', body: JSON.stringify(cambio) })
      peticion.poner(r) // lo guardado, no lo pedido
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
    setGuardando(false)
  }

  return (
    <>
      <Estado peticion={peticion} esqueleto={<Esqueleto filas={3} alto="h-28" />}>
        {(d) => {
          const q = queBuscoDelPerfil(d)
          return (
            <div className="space-y-5">
              <section className="rounded-xl border bg-card p-5">
                <h2 className="font-heading font-semibold">¿Compras o rentas?</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {OPERACIONES.map((o) => (
                    <Pastilla
                      key={o.valor}
                      activa={q.operacion === o.valor}
                      onClick={() => guardar({ busca_operacion: q.operacion === o.valor ? null : o.valor })}
                    >
                      {o.etiqueta}
                    </Pastilla>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border bg-card p-5">
                <h2 className="font-heading font-semibold">Qué tipo de propiedad</h2>
                <p className="mt-1 text-sm text-muted-foreground">Puedes elegir varios (hasta {MAXIMO_TIPOS}).</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {OPCIONES_TIPO.map((t) => (
                    <Pastilla
                      key={t.clave}
                      activa={q.tipos.includes(t.clave)}
                      onClick={() => guardar({ busca_tipos: alternar(q.tipos, t.clave) })}
                    >
                      {t.etiqueta}
                    </Pastilla>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border bg-card p-5">
                <h2 className="font-heading font-semibold">Zonas que te interesan</h2>
                <p className="mt-1 text-sm text-muted-foreground">Hasta {MAXIMO_ZONAS}. Escribe la que quieras o elige de la lista.</p>

                {q.zonas.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {q.zonas.map((z) => (
                      <li key={z}>
                        <button
                          type="button"
                          onClick={() => guardar({ busca_zonas: q.zonas.filter((x) => x !== z) })}
                          className="flex items-center gap-1.5 rounded-full bg-[var(--marca-tinte)] px-3 py-1.5 text-sm font-medium text-[var(--marca)]"
                          aria-label={`Quitar ${z}`}
                        >
                          {z} <X className="size-3.5" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  className="mt-3 flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const z = zonaNueva.trim()
                    if (!z) return
                    setZonaNueva('')
                    guardar({ busca_zonas: [...q.zonas, z] })
                  }}
                >
                  <Input
                    value={zonaNueva}
                    onChange={(e) => setZonaNueva(e.target.value)}
                    placeholder="Otra zona o colonia"
                    aria-label="Añadir una zona"
                    maxLength={60}
                    className="h-9 w-56"
                    disabled={q.zonas.length >= MAXIMO_ZONAS}
                  />
                  <Button type="submit" size="sm" variant="outline" disabled={!zonaNueva.trim() || q.zonas.length >= MAXIMO_ZONAS}>
                    <Plus aria-hidden /> Añadir
                  </Button>
                </form>

                <div className="mt-3 flex flex-wrap gap-2">
                  {ZONAS_SUGERIDAS.filter((z) => !q.zonas.includes(z)).slice(0, 8).map((z) => (
                    <Pastilla key={z} activa={false} onClick={() => guardar({ busca_zonas: [...q.zonas, z] })}>
                      {z}
                    </Pastilla>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border bg-card p-5">
                <h2 className="font-heading font-semibold">Presupuesto máximo</h2>
                <p className="mt-1 text-sm text-muted-foreground">Opcional. Sólo se usa para ordenar lo que te mostramos.</p>
                <form
                  className="mt-3 flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const v = new FormData(e.currentTarget).get('presupuesto')
                    guardar({ presupuesto_max: typeof v === 'string' ? v : null })
                  }}
                >
                  <Input
                    name="presupuesto"
                    defaultValue={q.presupuestoMax ? String(q.presupuestoMax) : ''}
                    inputMode="numeric"
                    placeholder="Por ejemplo: 3,500,000"
                    aria-label="Presupuesto máximo en pesos"
                    className="h-9 w-56"
                  />
                  <Button type="submit" size="sm" variant="outline" disabled={guardando}>
                    {guardando && <Loader2 className="animate-spin" aria-hidden />} Guardar
                  </Button>
                  {q.presupuestoMax && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => guardar({ presupuesto_max: null })}>
                      Quitar
                    </Button>
                  )}
                </form>
              </section>

              <p className="text-sm text-muted-foreground">
                Esto ordena lo que ves en tu inicio. Para recibir avisos de propiedades nuevas, guarda una
                búsqueda desde el buscador y míralas en <Link href="/portal/alertas" className="underline">Mis alertas</Link>.
              </p>
            </div>
          )
        }}
      </Estado>
    </>
  )
}

export default function MiBusquedaPortal({ fijo }: { fijo?: DatosMiBusqueda }) {
  return (
    <Pantalla
      titulo="Mi búsqueda"
      descripcion="Lo que buscas. Con esto ordenamos las propiedades que te mostramos en tu inicio."
      icono={SlidersHorizontal}
      acciones={<Button asChild variant="outline" className="shrink-0"><Link href="/propiedades"><Search aria-hidden /> Buscar ahora</Link></Button>}
    >
      <PreferenciasDeBusqueda fijo={fijo} />
    </Pantalla>
  )
}
