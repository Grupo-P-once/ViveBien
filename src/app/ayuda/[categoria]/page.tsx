import { notFound } from 'next/navigation'
import { paginaSeo } from '@/lib/seo'
import { enlaceWhatsApp } from '@/lib/config/negocio'
import { arbolPublico, articulosDeCategoria, categoriasPublicas } from '@/lib/ayuda/consultas'
import { rutaDelArticulo, slugValido } from '@/lib/ayuda/modelo'
import {
  AvisoDesactualizado, Buscador, IconoDeCategoria, Migas, NoEncontraste, TarjetaDeArticulo,
} from '@/components/ayuda/Piezas'
import BarraLateralAyuda from '@/components/ayuda/BarraLateral'

/**
 * `/ayuda/[categoria]` — los artículos de una categoría.
 *
 * La categoría se busca entre las **públicas**. Una interna —publicador,
 * administrativa, técnica— no aparece en esa lista, así que pedir su URL a
 * mano devuelve 404 y no una página vacía que confirme que existe.
 */

export const revalidate = 300

type Props = { params: Promise<{ categoria: string }> }

async function categoriaDe(slug: string) {
  if (!slugValido(slug)) return null
  const { datos } = await categoriasPublicas()
  return datos.find((c) => c.slug === slug) ?? null
}

export async function generateMetadata({ params }: Props) {
  const { categoria } = await params
  const c = await categoriaDe(categoria)
  if (!c) return paginaSeo({ ruta: `/ayuda/${categoria}`, titulo: 'Centro de Ayuda | Vive Bien', descripcion: '', noIndexar: true })
  return paginaSeo({
    ruta: `/ayuda/${c.slug}`,
    titulo: `${c.nombre} | Centro de Ayuda · Vive Bien`,
    descripcion: c.descripcion ?? `Ayuda sobre ${c.nombre.toLowerCase()} en VIVE BIEN.`,
  })
}

export default async function Categoria({ params }: Props) {
  const { categoria } = await params
  const c = await categoriaDe(categoria)
  if (!c) notFound()

  /* Las dos lecturas en paralelo: la barra lateral no debe retrasar el
     contenido, y ambas van al mismo Supabase con la misma clave. */
  const [{ datos, desactualizado }, arbol] = await Promise.all([
    articulosDeCategoria(c.slug),
    arbolPublico(),
  ])

  return (
    <div className="ayuda-contenedor ayuda-con-barra">
      <BarraLateralAyuda arbol={arbol.datos} categoriaActiva={c.slug} />

      <div className="min-w-0">
      <Migas partes={[{ nombre: c.nombre }]} />

      <header className="flex items-start gap-5">
        <IconoDeCategoria nombre={c.icono} grande />
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-frase,'Playfair_Display',serif)] text-[clamp(1.8rem,4vw,2.4rem)] leading-tight text-[#15181C]">
            {c.nombre}
          </h1>
          {c.descripcion && <p className="mt-2 text-[1rem] text-[#5A626B]">{c.descripcion}</p>}
        </div>
      </header>

      <div className="mt-8">
        <Buscador />
      </div>

      <div className="mt-10">
        {desactualizado && <AvisoDesactualizado />}

        {datos.length > 0 ? (
          <div className="grid gap-4">
            {datos.map((a) => {
              const href = rutaDelArticulo(c.slug, a.slug)
              return href ? (
                <TarjetaDeArticulo key={a.slug} href={href} titulo={a.titulo} resumen={a.resumen} estado={a.estado_producto} />
              ) : null
            })}
          </div>
        ) : (
          !desactualizado && (
            <p className="rounded-xl bg-[#F3F0EA] px-5 py-4 text-[0.95rem] text-[#5A626B]">
              Todavía no hay artículos publicados en esta categoría. Escríbenos y te ayudamos directamente.
            </p>
          )
        )}
      </div>

      <NoEncontraste whatsapp={enlaceWhatsApp(`Hola, tengo una duda sobre ${c.nombre.toLowerCase()}.`)} />
      </div>
    </div>
  )
}
