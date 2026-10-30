import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { RamaDelArbol } from '@/lib/ayuda/consultas'
import { rutaDeCategoria, rutaDelArticulo } from '@/lib/ayuda/modelo'
import { EtiquetaDelProducto, IconoDeCategoria } from './Piezas'

/**
 * La barra lateral del Centro de Ayuda: todo lo que hay, siempre a la vista.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA
 *
 * Hasta ahora, para pasar de un artículo a otro de **otra** categoría había
 * que volver a `/ayuda` por las migas y entrar de nuevo. Nueve categorías y
 * veintinueve artículos publicados no se recorren así: quien busca ayuda
 * suele no saber en qué categoría cae su duda, y obligarle a adivinar desde
 * la portada cada vez es justo lo que un centro de ayuda tiene que evitar.
 *
 * SIN JAVASCRIPT, COMO EL BUSCADOR
 *
 * Es un componente de servidor y se pliega con `<details>`, no con estado de
 * React. El resto del Centro ya funciona sin JS —el buscador es un `form` de
 * verdad— y no hay razón para que la navegación sea la única pieza que lo
 * necesite. Además así no entra ni un kilobyte de cliente en una pantalla
 * cuyo problema, medido el 30-sep, era precisamente el peso (TASK 20.01).
 *
 * EN MÓVIL VA PLEGADA
 *
 * A 390 px, treinta y siete enlaces por delante del artículo son un muro: hay
 * que bajar media pantalla para llegar a lo que se vino a leer. Plegada deja
 * una línea de 83 px («Todo el Centro de Ayuda · 8 temas · 29 artículos») y
 * el artículo empieza a 276 px, no a 900.
 *
 * Empieza **cerrada** también dentro de la categoría activa: abrirla sola
 * devolvería el muro justo a quien ya está leyendo. Al desplegarla, la
 * categoría y el artículo en curso van marcados, así que no hay que buscarse.
 *
 * `aria-current` y no sólo color: quien navega con lector de pantalla también
 * tiene que saber dónde está.
 * ─────────────────────────────────────────────────────────────
 */

type Props = {
  arbol: RamaDelArbol[]
  /** La categoría abierta, si estamos dentro de una. */
  categoriaActiva?: string
  /** El artículo que se está leyendo, si lo hay. */
  articuloActivo?: string
}

function Rama({ rama, categoriaActiva, articuloActivo }: {
  rama: RamaDelArbol
  categoriaActiva?: string
  articuloActivo?: string
}) {
  const href = rutaDeCategoria(rama.slug)
  const activa = rama.slug === categoriaActiva

  return (
    <li>
      {href ? (
        <Link
          href={href}
          aria-current={activa && !articuloActivo ? 'page' : undefined}
          className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-[0.92rem] font-semibold transition-colors ${
            activa
              ? 'bg-[color-mix(in_srgb,var(--rojo-marca)_7%,transparent)] text-[#15181C]'
              : 'text-[#15181C] hover:bg-[#F3F0EA]'
          }`}
        >
          <IconoDeCategoria nombre={rama.icono} pequeno />
          <span className="min-w-0 flex-1 leading-snug">{rama.nombre}</span>
          <span className="shrink-0 text-[0.76rem] font-normal text-[#5A626B]" aria-hidden>
            {rama.articulos.length}
          </span>
        </Link>
      ) : null}

      {rama.articulos.length > 0 && (
        <ul className="mt-0.5 mb-2 ml-[1.45rem] border-l border-[#E7E2DA] pl-3">
          {rama.articulos.map((a) => {
            const rutaArt = rutaDelArticulo(rama.slug, a.slug)
            if (!rutaArt) return null
            const leyendo = activa && a.slug === articuloActivo
            return (
              <li key={a.slug}>
                <Link
                  href={rutaArt}
                  aria-current={leyendo ? 'page' : undefined}
                  className={`block rounded-md px-2 py-[0.42rem] text-[0.86rem] leading-snug transition-colors ${
                    leyendo
                      ? 'font-semibold text-[var(--rojo-marca)]'
                      : 'text-[#5A626B] hover:bg-[#F3F0EA] hover:text-[#15181C]'
                  }`}
                >
                  {a.titulo}
                  {/* Un artículo de algo que aún no existe se marca también
                      aquí: enterarse al abrirlo es enterarse tarde. */}
                  <EtiquetaDelProducto estado={a.estado_producto} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

function Indice({ arbol, categoriaActiva, articuloActivo }: Props) {
  return (
    <ul className="space-y-0.5">
      {arbol.map((rama) => (
        <Rama
          key={rama.slug}
          rama={rama}
          categoriaActiva={categoriaActiva}
          articuloActivo={articuloActivo}
        />
      ))}
    </ul>
  )
}

export default function BarraLateralAyuda(props: Props) {
  const { arbol } = props
  if (arbol.length === 0) return null

  const totalArticulos = arbol.reduce((n, r) => n + r.articulos.length, 0)

  return (
    <>
      {/* ── Escritorio: siempre abierta, pegada al hacer scroll ── */}
      <nav
        aria-label="Todo el Centro de Ayuda"
        className="hidden lg:block"
      >
        {/* El desplazamiento arranca **por debajo de la cabecera**, que es
            `sticky top:0` con `z-index:1000` y mide `--alto-cabecera`
            (120 px en escritorio, 76 en móvil). Con `top-8` a secas la barra
            se metía debajo y se le comía el primer tema. */}
        <div
          className="sticky max-h-[calc(100dvh-var(--alto-cabecera,120px)-3rem)] overflow-y-auto pr-2"
          style={{ top: 'calc(var(--alto-cabecera, 120px) + 1.5rem)' }}
        >
          <p className="mb-3 text-[0.72rem] font-semibold tracking-[0.12em] text-[#5A626B] uppercase">
            Todo el Centro
          </p>
          <Indice {...props} />
        </div>
      </nav>

      {/* ── Móvil y tableta: plegada, y abierta en la categoría activa ── */}
      <details className="group mb-8 rounded-2xl border border-[#E7E2DA] bg-white lg:hidden">
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-[0.95rem] font-semibold text-[#15181C] [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-[#5A626B] transition-transform group-open:rotate-90"
          />
          <span className="min-w-0 flex-1">Todo el Centro de Ayuda</span>
          <span className="shrink-0 text-[0.8rem] font-normal text-[#5A626B]">
            {arbol.length} temas · {totalArticulos} artículos
          </span>
        </summary>
        <div className="border-t border-[#E7E2DA] px-3 py-3">
          <Indice {...props} />
        </div>
      </details>
    </>
  )
}
