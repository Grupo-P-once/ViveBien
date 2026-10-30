'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { capacidad, columnasPara, filasPara, necesitaCarrusel, paginaActual, paginasDe } from '@/lib/catalogo/disposicion'
import TarjetaCompacta, { type PropiedadCatalogo } from './TarjetaCompacta'

/**
 * Una sección del catálogo por TIPO de propiedad (naves, casas, departamentos…), con la lógica que pidió el propietario (22-oct-2026):
 *
 *   · Máximo 2 filas y 3–4 columnas visibles (4 en escritorio, 3 en portátil, 2 en tableta, 1 en teléfono).
 *   · Si hay más de las que caben en esas 2 filas → CARRUSEL (se desliza con el dedo o con las flechas, de a una pantalla de columnas) y, debajo,
 *     «Mostrar todas (N)». Al pulsarlo el carrusel DESAPARECE y se ven todas en varias filas; «Mostrar menos» lo vuelve a plegar.
 *   · Si caben, no hay carrusel ni botón: es una rejilla de una o dos filas.
 *
 * El número de columnas sale del ancho del propio contenedor (ResizeObserver), no de la ventana, para que no dependa de ningún layout externo.
 */
type Props = {
  tipo: string
  titulo: string
  /** La palabra final del título se pinta en cursiva roja, como en la lámina: «Casas en *Venta*». */
  tituloEnfasis?: string
  icono: string
  descripcion: string
  propiedades: PropiedadCatalogo[]
  seleccionId: string | null
  onVerEnMapa: (id: string) => void
  onVerSoloEstos: () => void
  /** Primera sección de la página: sus primeras fotos se piden con prioridad. */
  prioridad?: boolean
}

export default function SeccionCarrusel({ tipo, titulo, tituloEnfasis, icono, descripcion, propiedades, seleccionId, onVerEnMapa, onVerSoloEstos, prioridad = false }: Props) {
  const zona = useRef<HTMLDivElement>(null)
  const pista = useRef<HTMLDivElement>(null)
  const [columnas, setColumnas] = useState<1 | 2 | 3 | 4>(3)
  const [expandida, setExpandida] = useState(false)
  const [pagina, setPagina] = useState(0)
  const raf = useRef(0)
  const n = propiedades.length

  useEffect(() => {
    const el = zona.current
    if (!el) return
    // Al cambiar de columnas, la «página 3» de antes ya no existe: se vuelve al principio (el carrusel se vuelve a montar por su `key`).
    const medir = () => { const c = columnasPara(el.clientWidth); setColumnas((a) => { if (a !== c) setPagina(0); return c }) }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir); ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const carrusel = necesitaCarrusel(n, columnas) && !expandida
  const filas = filasPara(n, columnas)
  const paginas = paginasDe(n, columnas)

  const paso = useCallback(() => {
    const p = pista.current
    if (!p) return 0
    // Una «pantalla» = las columnas visibles: el ancho de una tarjeta más la separación, por las columnas que caben.
    const sep = parseFloat(getComputedStyle(p).columnGap || '0') || 0
    const tarjeta = p.firstElementChild as HTMLElement | null
    return tarjeta ? (tarjeta.offsetWidth + sep) * columnas : p.clientWidth + sep
  }, [columnas])

  const alDesplazar = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const p = pista.current
      if (!p) return
      // Al final del recorrido, la última pantalla puede estar incompleta: el desplazamiento máximo es menor que (páginas−1) pasos.
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

  const tarjetas = propiedades.map((p, i) => (
    <TarjetaCompacta key={p.id} propiedad={p} seleccionada={seleccionId === p.id} onVerEnMapa={onVerEnMapa} prioridad={prioridad && i < columnas} />
  ))
  const idTitulo = `cat-${tipo}-titulo`

  return (
    <section id={tipo} className="cat-sec" aria-labelledby={idTitulo} data-tipo-seccion={tipo}>
      <div className="cat-wrap">
        <header className="cat-cab">
          <div>
            <p className="cat-etiqueta"><i className={`fa ${icono}`} aria-hidden="true" /> {tipo}</p>
            <h2 id={idTitulo}>{titulo}{tituloEnfasis ? <> <em>{tituloEnfasis}</em></> : null}</h2>
            <p className="cat-desc">{descripcion}</p>
          </div>
          <div className="cat-cab-acciones">
            <span className="cat-contador" data-contador>{n} disponible{n !== 1 ? 's' : ''}</span>
            <button type="button" className="cat-solo" onClick={onVerSoloEstos}>Ver solo estos</button>
          </div>
        </header>

        <div ref={zona} className="cat-zona" data-modo={carrusel ? 'carrusel' : expandida ? 'todas' : 'rejilla'} data-columnas={columnas}>
          {carrusel && (
            <>
              <button type="button" className="cat-flecha cat-prev" onClick={() => ir(pagina - 1)} disabled={pagina === 0} aria-label={`${titulo}: anteriores`}>
                <i className="fa fa-chevron-left" aria-hidden="true" />
              </button>
              <button type="button" className="cat-flecha cat-sig" onClick={() => ir(pagina + 1)} disabled={pagina >= paginas - 1} aria-label={`${titulo}: siguientes`}>
                <i className="fa fa-chevron-right" aria-hidden="true" />
              </button>
            </>
          )}
          <div
            key={`${columnas}-${carrusel ? 'c' : 'r'}`} ref={pista} className={carrusel ? 'cat-pista' : 'cat-rejilla'}
            style={carrusel ? ({ '--cols': columnas, '--filas': filas } as React.CSSProperties) : ({ '--cols': columnas } as React.CSSProperties)}
            onScroll={carrusel ? alDesplazar : undefined}
            {...(carrusel ? { role: 'region', 'aria-roledescription': 'carrusel', 'aria-label': `${titulo}. Desliza para ver más`, tabIndex: 0 } : {})}
          >
            {tarjetas}
          </div>
        </div>

        {carrusel && paginas > 1 && (
          <div className="cat-puntos" role="group" aria-label={`Páginas de ${titulo}`}>
            {Array.from({ length: paginas }, (_, i) => (
              <button key={i} type="button" className="cat-punto" aria-label={`Ir a la página ${i + 1} de ${paginas}`} aria-current={i === pagina ? 'true' : undefined} onClick={() => ir(i)} />
            ))}
          </div>
        )}

        {n > capacidad(columnas) && (
          <div className="cat-mas">
            <button type="button" className="cat-mostrar" aria-expanded={expandida} onClick={() => { setExpandida((v) => !v); setPagina(0) }}>
              {expandida ? 'Mostrar menos' : `Mostrar todas (${n})`} <i className={`fa ${expandida ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
