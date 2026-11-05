import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ChevronRight, Clock, ShieldAlert } from 'lucide-react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { paginaSeo, grafo, jsonLdSeguro } from '@/lib/seo'
import { urlDe } from '@/lib/sitio'
import { categoriaDe, fechaLarga, indiceDe, minutosDeLectura, ordenarReferencias, slugValido } from '@/lib/blog/modelo'
import { articuloPorSlug, relacionados, visibles } from '@/lib/blog/articulos'
import { jsonLdArticulo, metadataArticulo } from '@/lib/blog/seo'
import { Cuerpo, TarjetaArticulo } from '@/components/blog/Piezas'
import { CierreBlog } from '@/components/blog/Listado'
import Compartir from '@/components/blog/Compartir'
import '@/components/blog/blog.css'

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return visibles().map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const a = slugValido(slug) ? articuloPorSlug(slug) : undefined
  if (!a) return paginaSeo({ ruta: `/blog/${slug}`, titulo: 'Blog | Vive Bien', descripcion: '', noIndexar: true })
  return metadataArticulo(a)
}

export default async function Pagina({ params }: Props) {
  const { slug } = await params
  const a = slugValido(slug) ? articuloPorSlug(slug) : undefined
  if (!a) notFound()
  const cat = categoriaDe(a.categoria)
  const indice = indiceDe(a)
  const otros = relacionados(a)
  const url = urlDe(`/blog/${a.slug}`)
  return (
    <>
      {/* nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- JSON-LD de datos propios; `jsonLdSeguro` escapa < > & y U+2028/9 (prueba en tests/seo.test.ts). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSeguro(grafo(...jsonLdArticulo(a))) }} />
      <Header />
      <main className="blog" id="contenido">
        <article>
          <header className="blog-art-cab">
            <div className="blog-wrap blog-art-cab-in">
              <nav className="blog-migas" aria-label="Migas de pan">
                <Link href="/">Inicio</Link><ChevronRight aria-hidden size={14} />
                <Link href="/blog">Blog</Link><ChevronRight aria-hidden size={14} />
                {cat && <><Link href={`/blog/categoria/${cat.slug}`}>{cat.nombre}</Link><ChevronRight aria-hidden size={14} /></>}
                <span aria-current="page">{a.titulo}</span>
              </nav>
              <p className="blog-categoria">{cat?.nombre}{a.muestra && <span className="blog-maqueta-inline">Maqueta</span>}</p>
              <h1>{a.titulo}</h1>
              <p className="blog-art-resumen">{a.resumen}</p>
              <p className="blog-meta">
                <span>Por {a.autor}</span><span aria-hidden>·</span>
                <time dateTime={a.publicado}>{fechaLarga(a.publicado)}</time>
                {a.actualizado && <><span aria-hidden>·</span><span>Actualizado el <time dateTime={a.actualizado}>{fechaLarga(a.actualizado)}</time></span></>}
                <span aria-hidden>·</span>
                <span className="blog-lectura"><Clock aria-hidden size={14} /> {minutosDeLectura(a)} min de lectura</span>
              </p>
            </div>
          </header>

          <div className="blog-wrap">
            <figure className="blog-portada">
              <Image src={a.portada.src} alt={a.portada.alt} width={a.portada.ancho} height={a.portada.alto} sizes="(min-width: 1200px) 1160px, 100vw" priority />
            </figure>
            {a.portada.credito && (
              <p className="blog-credito">
                Foto: {a.portada.credito.autor}, «<a href={a.portada.credito.fuenteUrl} target="_blank" rel="noopener noreferrer">{a.portada.credito.titulo}<span className="blog-solo-lectores"> (se abre en una pestaña nueva)</span></a>», {a.portada.credito.sitio}
                {a.portada.credito.licenciaUrl ? <>, <a href={a.portada.credito.licenciaUrl} target="_blank" rel="noopener noreferrer">{a.portada.credito.licencia}<span className="blog-solo-lectores"> (se abre en una pestaña nueva)</span></a></> : <>, {a.portada.credito.licencia}</>}. {a.portada.credito.adaptacion}{a.portada.credito.nota ? <> {a.portada.credito.nota}</> : null}
              </p>
            )}
          </div>

          <div className="blog-wrap blog-art-grid">
            <aside className="blog-indice" aria-label="Contenido del artículo">
              {indice.length > 1 && (
                <nav aria-label="Índice de contenido">
                  <p className="blog-indice-t">En este artículo</p>
                  <ol>{indice.map((i) => <li key={i.ancla}><a href={`#${i.ancla}`}>{i.texto}</a></li>)}</ol>
                </nav>
              )}
              <Compartir url={url} titulo={a.titulo} />
            </aside>

            <div className="blog-art-cuerpo">
              {a.orientacionGeneral && (
                <p className="blog-orientacion"><ShieldAlert aria-hidden size={18} /> Orientación general: este artículo no sustituye la asesoría de un notario, abogado o contador.</p>
              )}
              <Cuerpo bloques={a.cuerpo} />
              {a.referencias && a.referencias.length > 0 && (
                <section className="blog-fuentes" aria-labelledby="blog-fuentes-t">
                  <h2 id="blog-fuentes-t">Referencias</h2>
                  {/* Formato APA 7: Autor. (Fecha). Título en cursiva. Sitio. URL — con sangría francesa (hoja de estilo). */}
                  <ul className="blog-referencias">
                    {ordenarReferencias(a.referencias).map((r) => (
                      <li key={r.url}>
                        {r.autor}. ({r.fecha}). <em>{r.titulo}</em>. {r.sitio ? `${r.sitio}. ` : ''}
                        <a href={r.url} target="_blank" rel="noopener noreferrer">{r.url}<span className="blog-solo-lectores"> (se abre en una pestaña nueva)</span></a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <p className="blog-divulgacion">Elaborado por el equipo de Vive Bien Grupo Inmobiliario. Si encuentras un dato que deba corregirse, <Link href="/contacto">escríbenos</Link>.</p>
            </div>
          </div>
        </article>

        {otros.length > 0 && (
          <section className="blog-relacionados" aria-labelledby="blog-rel-t">
            <div className="blog-wrap">
              <p className="blog-eyebrow">Sigue leyendo</p>
              <h2 id="blog-rel-t">Artículos <em>relacionados</em></h2>
              <div className="blog-rejilla">{otros.map((o) => <TarjetaArticulo key={o.slug} a={o} />)}</div>
            </div>
          </section>
        )}
        <CierreBlog titulo="¿Hablamos de tu propiedad?" />
      </main>
      <Footer />
    </>
  )
}
