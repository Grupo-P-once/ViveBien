'use client'

import Link from 'next/link'
import { Heart, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TarjetaPropiedad from '@/components/portal/TarjetaPropiedad'
import { Estado, Esqueleto, Pantalla, Vacio, usePeticionPortal } from '@/components/portal/Pantalla'
import { useGuardadas } from '@/components/portal/guardadas'
import { fechaCorta } from '@/lib/admin/formato'
import type { GuardadaVista } from '@/lib/portal/pantallas'

/**
 * «Guardadas» — las propiedades que la persona marcó con el corazón (3b-1).
 *
 * Lo que se pausó o ya se vendió **no desaparece**: se enseña apagado y con el
 * motivo. Desaparecer sin decir nada haría pensar que se perdió el dato.
 */

export type DatosGuardadas = { guardadas: GuardadaVista[] }

export default function GuardadasPortal({ fijo }: { fijo?: DatosGuardadas }) {
  const peticion = usePeticionPortal<DatosGuardadas>('/api/portal/guardadas', fijo)
  const { esGuardada, alternar } = useGuardadas()

  return (
    <Pantalla
      titulo="Propiedades guardadas"
      descripcion="Lo que has guardado con el corazón, de lo más reciente a lo más antiguo."
      icono={Heart}
      acciones={
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/propiedades"><Search aria-hidden /> Buscar más</Link>
        </Button>
      }
    >
      <Estado
        peticion={peticion}
        esqueleto={<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3"><Esqueleto filas={3} alto="h-72" className="contents" /></div>}
        vacio={(d) => d.guardadas.length === 0 && (
          <Vacio
            titulo="Todavía no guardas ninguna propiedad"
            accion={<Button asChild className="mt-2"><Link href="/propiedades">Ver propiedades</Link></Button>}
          >
            Cuando veas una que te guste, toca el corazón y la encontrarás aquí.
          </Vacio>
        )}
      >
        {(d) => (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {d.guardadas.map((g) => (
              <li key={g.id} className="flex flex-col">
                <TarjetaPropiedad
                  p={g}
                  guardada={esGuardada(g.id)}
                  onAlternar={alternar}
                  className={g.disponible ? undefined : 'border-dashed'}
                />
                <p className="mt-1.5 px-1 text-xs text-muted-foreground">
                  Guardada el {fechaCorta(g.guardadaEn)}
                  {!g.disponible && <> · <span className="font-medium text-[var(--aviso-fuerte)]">ya no está disponible</span></>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Estado>
    </Pantalla>
  )
}
