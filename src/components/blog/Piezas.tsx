import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Clock, Search } from 'lucide-react'
import { anclaDe, categoriaDe, fechaCorta, minutosDeLectura, type Articulo, type Bloque } from '@/lib/blog/modelo'

/** Texto con **negritas** y [enlaces](ruta). Solo rutas del sitio o https: nada más se vuelve enlace, y nunca hay HTML crudo. */
export function Inline({ texto }: { texto: string }) {
  const trozos = texto.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean)
  return (
    <>
      {trozos.map((t, i) => {
        const neg = t.match(/^\*\*([^*]+)\*\*$/)
        if (neg) return <strong key={i}>{neg[1]}</strong>
        const enl = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (enl) {
          const [, nombre, destino] = enl
          if (destino.startsWith('/') && !destino.startsWith('//')) return <Link key={i} href={destino}>{nombre}</Link>
          if (/^https:\/\//.test(destino)) return <a key={i} href={destino} target="_blank" rel="noopener noreferrer">{nombre}<span className="blog-solo-lectores"> (se abre en una pestaña nueva)</span></a>
          return <span key={i}>{nombre}</span>
        }
        return <span key={i}>{t}</span>
      })}
    </>
  )
}

export function Cuerpo({ bloques }: { bloques: readonly Bloque[] }) {
  return (
    <div className="blog-cuerpo">
      {bloques.map((b, i) => {
        switch (b.tipo) {
          case 'h2': return <h2 key={i} id={anclaDe(b.texto)}>{b.texto}</h2>
          case 'h3': return <h3 key={i}>{b.texto}</h3>
          case 'p': return <p key={i}><Inline texto={b.texto} /></p>
          case 'lista': return <ul key={i}>{b.items.map((x, j) => <li key={j}><Inline texto={x} /></li>)}</ul>
          case 'pasos': return <ol key={i} className="blog-pasos">{b.items.map((x, j) => <li key={j}><Inline texto={x} /></li>)}</ol>
          case 'aviso': return (
            <aside key={i} className="blog-aviso">
              {b.titulo && <strong>{b.titulo}</strong>}
              <p><Inline texto={b.texto} /></p>
            </aside>
          )
          case 'tabla': return (
            <div key={i} className="blog-tabla-caja" role="region" aria-label={b.titulo} tabIndex={0}>
              <table className="blog-tabla">
                <caption>{b.titulo}</caption>
                <thead><tr>{b.encabezados.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                <tbody>{b.filas.map((f, j) => (
                  <tr key={j}>{f.map((c, k) => (k === 0 ? <th key={k} scope="row">{c}</th> : <td key={k}><Inline texto={c} /></td>))}</tr>
                ))}</tbody>
              </table>
            </div>
          )
          case 'preguntas': return (
            <section key={i} className="blog-faq" aria-label="Preguntas frecuentes">
              {b.items.map((x, j) => (
                <details key={j}><summary>{x.p}</summary><p><Inline texto={x.r} /></p></details>
              ))}
            </section>
          )
        }
      })}
    </div>
  )
}

export function TarjetaArticulo({ a, destacada = false }: { a: Articulo; destacada?: boolean }) {
  const cat = categoriaDe(a.categoria)
  return (
    <article className={`blog-tarjeta${destacada ? ' blog-tarjeta-destacada' : ''}`}>
      <Link href={`/blog/${a.slug}`} className="blog-tarjeta-imagen" tabIndex={-1} aria-hidden>
        <Image src={a.portada.src} alt="" width={a.portada.ancho} height={a.portada.alto} sizes={destacada ? '(min-width: 900px) 50vw, 100vw' : '(min-width: 1100px) 380px, (min-width: 700px) 50vw, 100vw'} priority={destacada} />
        <span className="blog-tag">{cat?.nombre}</span>
        {a.muestra && <span className="blog-maqueta">Maqueta</span>}
      </Link>
      <div className="blog-tarjeta-texto">
        {destacada && <p className="blog-eyebrow blog-eyebrow-chico">Guía destacada</p>}
        <h3><Link href={`/blog/${a.slug}`}>{a.titulo}</Link></h3>
        <p className="blog-resumen">{a.resumen}</p>
        <p className="blog-meta">
          <time dateTime={a.publicado}>{fechaCorta(a.publicado)}</time>
          <span aria-hidden>·</span>
          <span>{a.autor}</span>
          <span aria-hidden>·</span>
          <span className="blog-lectura"><Clock aria-hidden size={12} /> {minutosDeLectura(a)} min</span>
        </p>
        {destacada && <Link href={`/blog/${a.slug}`} className="blog-boton blog-boton-azul" aria-label={`Leer completo: ${a.titulo}`}>Leer completo <ArrowRight aria-hidden size={16} /></Link>}
      </div>
    </article>
  )
}

export function FiltrosCategoria({ actual }: { actual?: string }) {
  const cats = [{ slug: '', nombre: 'Todos' }, ...[
    'comprar', 'vender', 'rentar', 'naves-y-terrenos', 'inversion-y-financiamiento', 'leon-y-el-bajio',
  ].map((s) => ({ slug: s, nombre: categoriaDe(s)!.nombre }))]
  return (
    <nav className="blog-filtros" aria-label="Categorías del blog">
      <span className="blog-filtros-t" aria-hidden>Filtrar:</span>
      {cats.map((c) => (
        <Link key={c.slug || 'todos'} href={c.slug ? `/blog/categoria/${c.slug}` : '/blog'} className="blog-filtro" aria-current={(actual ?? '') === c.slug ? 'page' : undefined}>
          {c.nombre}
        </Link>
      ))}
    </nav>
  )
}

/** Buscador del blog: un formulario GET normal (funciona sin JavaScript; las páginas con `?q=` no se indexan). */
export function BuscadorBlog({ accion, valor }: { accion: string; valor?: string }) {
  return (
    <form className="blog-buscador" role="search" action={accion} method="get">
      <label htmlFor="blog-q" className="blog-solo-lectores">Buscar en el blog</label>
      <Search aria-hidden size={16} className="blog-buscador-icono" />
      <input id="blog-q" type="search" name="q" defaultValue={valor ?? ''} maxLength={80} placeholder="Buscar guías…" autoComplete="off" enterKeyHint="search" />
      <button type="submit">Buscar</button>
    </form>
  )
}

export function Paginacion({ actual, total, base, consulta }: { actual: number; total: number; base: string; consulta?: string }) {
  if (total <= 1) return null
  const q = consulta ? `q=${encodeURIComponent(consulta)}` : ''
  const href = (n: number) => {
    const partes = [n === 1 ? '' : `pagina=${n}`, q].filter(Boolean).join('&')
    return partes ? `${base}?${partes}` : base
  }
  return (
    <nav className="blog-paginacion" aria-label="Paginación del blog">
      {actual > 1 && <Link href={href(actual - 1)} rel="prev">Anterior</Link>}
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <Link key={n} href={href(n)} aria-current={n === actual ? 'page' : undefined} aria-label={`Página ${n}`}>{n}</Link>
      ))}
      {actual < total && <Link href={href(actual + 1)} rel="next">Siguiente</Link>}
    </nav>
  )
}
