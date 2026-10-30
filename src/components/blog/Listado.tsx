import Link from 'next/link'
import Image from 'next/image'
import { MessageCircle } from 'lucide-react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { buscarArticulos, categoriaDe, type Articulo } from '@/lib/blog/modelo'
import { pagina } from '@/lib/blog/articulos'
import { BuscadorBlog, FiltrosCategoria, Paginacion, TarjetaArticulo } from './Piezas'
import './blog.css'

/**
 * Estructura tomada de la referencia del propietario (blog «La Polliza», 22-oct-2026) y llevada a la identidad de VIVE BIEN y a un tamaño
 * contenido: hero dividido (texto + arte) → franja «Artículos» con filtros → guía destacada (imagen | texto) → tarjetas pegadas con la categoría
 * sobre la imagen → preguntas frecuentes en azul noche → franja de llamado. Tipografía y colores: los del sitio (Playfair + Montserrat, rojo de marca).
 */

const PREGUNTAS = [
  { p: '¿Quién escribe el blog?', r: 'El equipo de Vive Bien Grupo Inmobiliario, con lo que aprendemos a diario en León y el Bajío y apoyándonos en fuentes oficiales que citamos en cada guía.' },
  { p: '¿Es asesoría legal o financiera?', r: 'No. Son guías de orientación general. Para decisiones legales, fiscales o de crédito consulta a un notario, abogado o contador de tu confianza.' },
  { p: '¿Puedo sugerir un tema?', r: 'Claro. Escríbenos desde la página de contacto y lo tomamos en cuenta para las próximas guías.' },
  { p: '¿Qué hago si encuentro un dato desactualizado?', r: 'Avísanos. Revisamos cada guía y, cuando un dato cambia, la actualizamos e indicamos la fecha de actualización.' },
] as const

/** Franja de llamado, compacta: llevar al lector de la guía a la acción (propiedades o conversación). */
export function CierreBlog({ titulo = '¿Buscas tu próximo espacio?' }: { titulo?: string }) {
  return (
    <section className="blog-cierre" aria-labelledby="blog-cierre-t">
      <div className="blog-wrap blog-cierre-in">
        <div>
          <h2 id="blog-cierre-t">{titulo}</h2>
          <p>Casas, terrenos, naves y locales en León y el Bajío. Cuéntanos qué necesitas y te acompañamos.</p>
        </div>
        <div className="blog-cierre-acciones">
          <Link href="/propiedades" className="blog-boton blog-boton-blanco">Ver propiedades</Link>
          <Link href="/contacto" className="blog-boton blog-boton-vidrio"><MessageCircle aria-hidden size={18} /> Contáctanos</Link>
        </div>
      </div>
    </section>
  )
}

function Preguntas() {
  return (
    <section className="blog-preguntas" aria-labelledby="blog-preguntas-t">
      <div className="blog-wrap">
        <h2 id="blog-preguntas-t">Preguntas <em>frecuentes</em></h2>
        <dl className="blog-preguntas-rejilla">
          {PREGUNTAS.map((x) => (
            <div key={x.p}><dt>{x.p}</dt><dd>{x.r}</dd></div>
          ))}
        </dl>
      </div>
    </section>
  )
}

/** Portada del blog y páginas de categoría. */
export default function Listado({ articulos: todos, categoria, numero, base, consulta = '' }: { articulos: readonly Articulo[]; categoria?: string; numero: number; base: string; consulta?: string }) {
  const cat = categoria ? categoriaDe(categoria) : undefined
  const articulos = consulta ? buscarArticulos(todos, consulta) : todos
  const { items, actual, total } = pagina(articulos, numero)
  const destacada = actual === 1 && !cat && !consulta ? items[0] : undefined
  const resto = destacada ? items.slice(1) : items
  const hayMaquetas = articulos.some((a) => a.muestra)
  return (
    <>
      <Header />
      <main className="blog" id="contenido">
        <header className="blog-hero">
          <div className="blog-hero-texto">
            <p className="blog-eyebrow blog-eyebrow-claro">{cat ? 'Blog · Categoría' : 'Blog'}</p>
            <h1>{cat ? <>{cat.nombre}<em>en León y el Bajío</em></> : <>Ideas y guías para <em>decidir mejor</em></>}</h1>
            <p>{cat ? cat.descripcion : 'Consejos claros sobre comprar, vender y rentar casas, terrenos, naves y locales en León, Guanajuato.'}</p>
            <div className="blog-hero-acciones">
              <a href="#articulos" className="blog-boton blog-boton-rojo">Ver artículos</a>
              <Link href="/propiedades" className="blog-boton blog-boton-vidrio">Ver propiedades</Link>
            </div>
          </div>
          <div className="blog-hero-arte" aria-hidden>
            <Image src="/blog/hero.webp" alt="" fill sizes="(min-width: 900px) 52vw, 100vw" priority />
            <span className="blog-hero-sello"><strong>León</strong><small>Gto. · México</small></span>
          </div>
        </header>

        <div className="blog-franja" id="articulos">
          <div className="blog-wrap"><p className="blog-franja-t">Artículos</p></div>
        </div>
        <div className="blog-barra">
          <div className="blog-wrap blog-barra-in">
            <FiltrosCategoria actual={categoria} />
            <BuscadorBlog accion={base} valor={consulta} />
          </div>
        </div>

        <div className="blog-sec">
          <div className="blog-wrap">
            {hayMaquetas && (
              <p className="blog-aviso-maqueta" role="note"><strong>Vista de diseño.</strong> Los artículos marcados «Maqueta» son de ejemplo y no se publican en producción; el contenido real se redacta aparte.</p>
            )}
            {consulta && (
              <p className="blog-resultados" role="status">
                {articulos.length === 1 ? '1 resultado' : `${articulos.length} resultados`} para «<strong>{consulta}</strong>» · <Link href={base}>Limpiar búsqueda</Link>
              </p>
            )}
            {articulos.length === 0 && consulta ? (
              <div className="blog-vacio">
                <h2>No encontramos guías con esa búsqueda</h2>
                <p>Prueba con otras palabras, por ejemplo «nave», «terreno» o «escrituración», o elige una categoría.</p>
                <Link href={base} className="blog-boton blog-boton-rojo">Ver todos los artículos</Link>
              </div>
            ) : articulos.length === 0 ? (
              <div className="blog-vacio">
                <h2>Estamos preparando las primeras guías</h2>
                <p>Muy pronto publicaremos artículos para ayudarte a comprar, vender y rentar con seguridad. Mientras tanto, explora nuestras propiedades.</p>
                <Link href="/propiedades" className="blog-boton blog-boton-rojo">Ver propiedades</Link>
              </div>
            ) : (
              <>
                {destacada && <TarjetaArticulo a={destacada} destacada />}
                {resto.length > 0 && (
                  <div className="blog-rejilla">
                    {resto.map((a) => <TarjetaArticulo key={a.slug} a={a} />)}
                  </div>
                )}
                <Paginacion actual={actual} total={total} base={base} consulta={consulta} />
              </>
            )}
          </div>
        </div>
        <Preguntas />
        <CierreBlog />
      </main>
      <Footer />
    </>
  )
}
