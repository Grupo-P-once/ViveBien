import { notFound } from 'next/navigation'
import { paginaSeo, grafo, migasJsonLd, jsonLdSeguro } from '@/lib/seo'
import { enlaceWhatsApp } from '@/lib/config/negocio'
import { arbolPublico, articulo as leerArticulo, articulosDeCategoria, categoriasPublicas } from '@/lib/ayuda/consultas'
import { rutaDelArticulo, slugValido } from '@/lib/ayuda/modelo'
import { descripcionDeArticulo } from '@/lib/ayuda/descripcion'
import { AvisoDelProducto, AvisoDesactualizado, Migas, NoEncontraste, TarjetaDeArticulo } from '@/components/ayuda/Piezas'
import BarraLateralAyuda from '@/components/ayuda/BarraLateral'

/**
 * `/ayuda/[categoria]/[articulo]` — el artículo.
 *
 * ─────────────────────────────────────────────────────────────
 * EL AVISO VA ANTES QUE EL CUERPO
 *
 * Si el artículo describe algo que todavía no existe, o que funciona a
 * medias, se dice **arriba**, antes de que nadie lea las instrucciones. Un
 * aviso al final llega tarde: para entonces ya se intentó hacer algo que no
 * se puede.
 *
 * La base lo exige con un CHECK y el modelo con `puedePublicarse`. Aquí sólo
 * se pinta.
 * ─────────────────────────────────────────────────────────────
 */

export const revalidate = 300

type Props = { params: Promise<{ categoria: string; articulo: string }> }

async function cargar(categoria: string, art: string) {
  if (!slugValido(categoria) || !slugValido(art)) return null
  const { datos: cats, desactualizado: catsViejas } = await categoriasPublicas()
  const c = cats.find((x) => x.slug === categoria)
  if (!c) return null
  const { articulo: a, desactualizado } = await leerArticulo(categoria, art)
  // Basta con que UNA de las dos lecturas venga de la copia: lo que se pinta
  // mezcla ambas, así que callarlo por la otra sería mentir a medias.
  return a ? { categoria: c, articulo: a, desactualizado: desactualizado || catsViejas } : null
}

export async function generateMetadata({ params }: Props) {
  const { categoria, articulo } = await params
  const d = await cargar(categoria, articulo)
  if (!d) {
    return paginaSeo({ ruta: `/ayuda/${categoria}/${articulo}`, titulo: 'Centro de Ayuda | Vive Bien', descripcion: '', noIndexar: true })
  }
  return paginaSeo({
    ruta: `/ayuda/${categoria}/${articulo}`,
    titulo: `${d.articulo.titulo} | Centro de Ayuda · Vive Bien`,
    // Un resumen de 40 caracteres aparecía así en Google: se completa con el inicio del artículo (ver `descripcion.ts`).
    descripcion: descripcionDeArticulo(d.articulo.titulo, d.articulo.resumen, d.articulo.cuerpo),
  })
}

/**
 * El cuerpo llega como texto con `**negritas**` y enlaces en Markdown. Se
 * pinta con elementos de verdad, nunca con HTML crudo: el contenido lo
 * escribe una persona en el panel, y aun así no hay razón para abrir esa
 * puerta.
 */
function Parrafo({ texto }: { texto: string }) {
  const trozos = texto.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean)
  return (
    <p className="mt-4 text-[1.02rem] leading-[1.75] text-[#2C3540]">
      {trozos.map((t, i) => {
        if (t.startsWith('**') && t.endsWith('**')) {
          return <strong key={i} className="font-semibold text-[#15181C]">{t.slice(2, -2)}</strong>
        }
        const enlace = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)
        if (enlace && enlace[2].startsWith('/')) {
          return <a key={i} href={enlace[2]} className="underline" style={{ color: 'var(--rojo-marca)' }}>{enlace[1]}</a>
        }
        return <span key={i}>{enlace ? enlace[1] : t}</span>
      })}
    </p>
  )
}

export default async function Articulo({ params }: Props) {
  const { categoria, articulo } = await params
  const d = await cargar(categoria, articulo)
  if (!d) notFound()

  const [{ datos: hermanos }, arbol] = await Promise.all([
    articulosDeCategoria(categoria),
    arbolPublico(),
  ])
  const relacionados = hermanos.filter((h) => h.slug !== d.articulo.slug).slice(0, 3)
  const parrafos = (d.articulo.cuerpo ?? '').split('\n\n').map((p) => p.trim()).filter(Boolean)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdSeguro(grafo(migasJsonLd([
            { nombre: d.categoria.nombre, ruta: `/ayuda/${d.categoria.slug}` },
            { nombre: d.articulo.titulo },
          ]))),
        }}
      />

      {/* El artículo se queda en 760 px: una columna de texto más ancha se
          lee peor. La barra ocupa su propia pista, sin robarle medida. */}
      <div className="ayuda-contenedor ayuda-contenedor--articulo ayuda-con-barra">
        <BarraLateralAyuda
          arbol={arbol.datos}
          categoriaActiva={d.categoria.slug}
          articuloActivo={d.articulo.slug}
        />

        <div className="min-w-0">
        <Migas partes={[{ nombre: d.categoria.nombre, href: `/ayuda/${d.categoria.slug}` }, { nombre: d.articulo.titulo }]} />

        {/* Va ANTES del artículo, como el aviso del producto: enterarse al
            final de que las instrucciones pueden estar viejas llega tarde,
            porque para entonces ya se han seguido. La categoría y la búsqueda
            ya lo decían; esta pantalla se lo callaba. */}
        {d.desactualizado && <AvisoDesactualizado />}

        <article className="ayuda-prosa">
          <h1 className="font-[family-name:var(--font-frase,'Playfair_Display',serif)] text-[clamp(1.9rem,4.5vw,2.6rem)] leading-tight text-[#15181C]">
            {d.articulo.titulo}
          </h1>
          {d.articulo.resumen && <p className="mt-3 text-[1.08rem] text-[#5A626B]">{d.articulo.resumen}</p>}

          <div className="mt-8">
            <AvisoDelProducto estado={d.articulo.estado_producto} aviso={d.articulo.aviso} />
            {parrafos.map((p, i) => <Parrafo key={i} texto={p} />)}
          </div>
        </article>

        {relacionados.length > 0 && (
          <section className="mt-12 border-t border-[#E7E2DA] pt-8">
            <h2 className="font-heading text-[1.1rem] font-semibold text-[#15181C]">También te puede servir</h2>
            <div className="mt-4 grid gap-3">
              {relacionados.map((r) => {
                const href = rutaDelArticulo(d.categoria.slug, r.slug)
                return href ? (
                  <TarjetaDeArticulo key={r.slug} href={href} titulo={r.titulo} resumen={r.resumen} estado={r.estado_producto} />
                ) : null
              })}
            </div>
          </section>
        )}

        <NoEncontraste whatsapp={enlaceWhatsApp(`Hola, tengo una duda sobre «${d.articulo.titulo}».`)} />
        </div>
      </div>
    </>
  )
}
