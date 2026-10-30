import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { fechaCorta } from '@/lib/blog/modelo'
import type { ArticuloInicio } from '@/lib/blog/articulos'

/**
 * «Del blog»: los artículos más recientes en la portada, con la misma lógica que «Publicaciones de las redes». Cada tarjeta lleva al artículo y el
 * botón final al blog. Los artículos los elige el SERVIDOR (`app/page.tsx` → `paraInicio`): en producción solo los reales, y sin ninguno la sección
 * no se pinta (nunca una sección vacía ni maquetas). Estilos `.ini-blog*` en `inicio.css`.
 */
export default function BlogInicio({ articulos }: { articulos: readonly ArticuloInicio[] }) {
  if (articulos.length === 0) return null
  return (
    <section className="ini-blog" aria-labelledby="blog-inicio-titulo" data-seccion="blog">
      <div className="ini-blog-cab">
        <div>
          <p className="ini-eyebrow"><span aria-hidden className="ini-eyebrow-linea" />Nuestro blog</p>
          <h2 id="blog-inicio-titulo">Guías para <em>decidir mejor</em></h2>
          <p>Consejos claros para comprar, vender y rentar casas, terrenos y naves en León y el Bajío.</p>
        </div>
        <Link href="/blog" className="ini-blog-todos">Ver todos los artículos <ArrowRight aria-hidden size={18} /></Link>
      </div>
      <div className="ini-blog-rejilla">
        {articulos.map((a, i) => (
          <article key={a.slug} className="ini-blog-tarjeta">
            <Link href={`/blog/${a.slug}`} className="ini-blog-img" tabIndex={-1} aria-hidden>
              <Image src={a.portada.src} alt="" width={a.portada.ancho} height={a.portada.alto} sizes="(min-width: 1100px) 280px, (min-width: 700px) 45vw, 90vw" loading={i < 2 ? 'eager' : 'lazy'} />
              <span className="ini-blog-tag">{a.categoria}</span>
              {a.muestra && <span className="ini-blog-maqueta">Maqueta</span>}
            </Link>
            <div className="ini-blog-texto">
              <h3><Link href={`/blog/${a.slug}`}>{a.titulo}</Link></h3>
              <p>{a.resumen}</p>
              <p className="ini-blog-meta"><time dateTime={a.publicado}>{fechaCorta(a.publicado)}</time><span aria-hidden>·</span><span>{a.autor}</span></p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
