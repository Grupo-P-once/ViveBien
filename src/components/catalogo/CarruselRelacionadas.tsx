'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { columnasPara, paginaActual } from '@/lib/catalogo/disposicion'
import TarjetaCompacta, { type PropiedadCatalogo } from './TarjetaCompacta'

/**
 * «Propiedades recomendadas» al pie de la ficha (22-oct-2026): UNA fila en carrusel (se desliza con el dedo, con flechas o con los puntos), con las mismas
 * tarjetas compactas del catálogo. Columnas según el ancho del contenedor: 4 · 3 · 2 · 1. Si caben todas, no hay flechas ni puntos.
 */
type Props = { propiedades: PropiedadCatalogo[]; titulo: string; subtitulo?: string }

export default function CarruselRelacionadas({ propiedades, titulo, subtitulo }: Props) {
  const zona = useRef<HTMLDivElement>(null)
  const pista = useRef<HTMLDivElement>(null)
  const [columnas, setColumnas] = useState<1 | 2 | 3 | 4>(3)
  const [pagina, setPagina] = useState(0)
  const raf = useRef(0)
  const n = propiedades.length
  const paginas = Math.max(1, Math.ceil(n / columnas))
  const hayCarrusel = n > columnas
  const hay = n > 0      // el contenedor solo existe cuando hay propiedades: el observador se engancha entonces (no en el primer pintado, cuando aún no hay nada)

  useEffect(() => {
    const el = zona.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const medir = () => { const c = columnasPara(el.clientWidth); setColumnas((a) => { if (a !== c) setPagina(0); return c }) }
    medir()
    const ro = new ResizeObserver(medir); ro.observe(el)
    return () => ro.disconnect()
  }, [hay])

  const paso = useCallback(() => {
    const p = pista.current
    if (!p) return 0
    const sep = parseFloat(getComputedStyle(p).columnGap || '0') || 0
    const t = p.firstElementChild as HTMLElement | null
    return t ? (t.offsetWidth + sep) * columnas : p.clientWidth + sep
  }, [columnas])

  const alDesplazar = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const p = pista.current
      if (!p) return
      const alFinal = p.scrollLeft + p.clientWidth >= p.scrollWidth - 4
      setPagina(alFinal ? paginas - 1 : paginaActual(p.scrollLeft, paso(), paginas))
    })
  }, [paginas, paso])
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

  const ir = (i: number) => {
    const p = pista.current
    if (!p) return
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    p.scrollTo({ left: Math.max(0, Math.min(paginas - 1, i)) * paso(), behavior: reducido ? 'auto' : 'smooth' })
  }

  if (n === 0) return null
  return (
    <section className="rel" aria-labelledby="rel-titulo" data-relacionadas>
      <div className="cat-wrap">
        <header className="rel-cab">
          <p className="cat-etiqueta"><i className="fa fa-heart" aria-hidden="true" /> Para ti</p>
          <h2 id="rel-titulo">{titulo}</h2>
          {subtitulo && <p className="cat-desc">{subtitulo}</p>}
        </header>
        <div ref={zona} className="cat-zona" data-modo={hayCarrusel ? 'carrusel' : 'rejilla'} data-columnas={columnas}>
          {hayCarrusel && (
            <>
              <button type="button" className="cat-flecha cat-prev" onClick={() => ir(pagina - 1)} disabled={pagina === 0} aria-label="Recomendadas: anteriores"><i className="fa fa-chevron-left" aria-hidden="true" /></button>
              <button type="button" className="cat-flecha cat-sig" onClick={() => ir(pagina + 1)} disabled={pagina >= paginas - 1} aria-label="Recomendadas: siguientes"><i className="fa fa-chevron-right" aria-hidden="true" /></button>
            </>
          )}
          <div
            key={`${columnas}-${hayCarrusel}`} ref={pista} className={hayCarrusel ? 'cat-pista' : 'cat-rejilla'}
            style={{ '--cols': columnas, '--filas': 1 } as React.CSSProperties} onScroll={hayCarrusel ? alDesplazar : undefined}
            {...(hayCarrusel ? { role: 'region', 'aria-roledescription': 'carrusel', 'aria-label': `${titulo}. Desliza para ver más`, tabIndex: 0 } : {})}
          >
            {propiedades.map((p) => <TarjetaCompacta key={p.id} propiedad={p} />)}
          </div>
        </div>
        {hayCarrusel && paginas > 1 && (
          <div className="cat-puntos" role="group" aria-label="Páginas de propiedades recomendadas">
            {Array.from({ length: paginas }, (_, i) => (
              <button key={i} type="button" className="cat-punto" aria-label={`Ir a la página ${i + 1} de ${paginas}`} aria-current={i === pagina ? 'true' : undefined} onClick={() => ir(i)} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
