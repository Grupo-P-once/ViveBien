'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { alFallarImagen } from '@/lib/imagen-respaldo'
import { imgResponsiva } from '@/lib/medios/optimizar'

/**
 * Galería de fotos sin retraso y deslizable (22-oct-2026): la de las tarjetas del catálogo y la principal de la ficha de cada propiedad.
 *
 * POR QUÉ ANTES IBA TRABADO. La galería tenía UN solo `<img>` y, al cambiar de foto, le cambiaba el `src`: cada cambio disparaba una descarga nueva
 * (la foto aún no estaba en caché, y con `loading="lazy"`), así que se veía la foto anterior o un hueco hasta que llegaba la nueva. Tampoco había
 * deslizamiento: solo flechitas y puntos.
 *
 * AHORA:
 *  · Todas las fotos son `<img>` de una PISTA HORIZONTAL con `scroll-snap`: el desplazamiento lo hace el navegador (hilo de composición, 60/120 fps), con
 *    el dedo, la rueda/trackpad y —con el ratón— arrastrando. `overscroll-behavior-x: contain` evita que un gesto en la foto mueva el carrusel de la sección.
 *  · Las fotos VECINAS ya están descargadas antes de que las pidas: al acercarse la galería a la pantalla se cargan las 3 primeras; al tocarla o pasar el
 *    ratón, las 5 primeras; y al avanzar, siempre las 2 de adelante. Cada una se DECODIFICA al llegar (`decode()`), para que pintarla no cueste un cuadro.
 *  · Las demás esperan (`src` vacío): una propiedad con 26 fotos no baja 26 fotos si nadie las mira.
 *  · La altura está reservada (`aspect-ratio` en la tarjeta; el alto del contenedor en la ficha): sin saltos de diseño al cargar.
 */
type Props = {
  fotos: readonly string[]
  titulo: string
  /** Descripción del hueco en CSS, para que el navegador elija el tamaño del `srcset`. */
  sizes: string
  /** La primera foto va con prioridad alta (es lo que se ve al abrir la página; en la ficha es el LCP). */
  prioridad?: boolean
  /** Insignias y botones que van sobre la foto (operación, comparar, contador). */
  children?: React.ReactNode
  /** `ficha`: la galería principal de la página de la propiedad (llena su contenedor y se abre en grande al tocarla). */
  variante?: 'tarjeta' | 'ficha'
  /** Foto que se quiere ver desde fuera (miniaturas): si cambia, la galería se desliza hasta ella. */
  indice?: number
  /** Avisa de la foto visible (para el contador y el pie de foto). */
  alCambiar?: (i: number) => void
  /** Si se pasa, tocar la foto la abre en grande (arrastrar no cuenta como toque). */
  alAbrir?: (i: number) => void
}

const RESERVA = 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&auto=format&fit=crop'

export default function GaleriaFluida({ fotos, titulo, sizes, prioridad = false, children, variante = 'tarjeta', indice, alCambiar, alAbrir }: Props) {
  const lista = fotos.length ? fotos : [RESERVA]
  const ficha = variante === 'ficha'
  const raiz = useRef<HTMLDivElement>(null)
  const pista = useRef<HTMLDivElement>(null)
  const [actual, setActual] = useState(0)
  const [cargar, setCargar] = useState(prioridad ? 3 : 1)   // cuántas fotos (desde la primera) ya tienen `src`
  const arrastre = useRef<{ x: number; izq: number; movido: boolean } | null>(null)
  const raf = useRef(0)
  const avisada = useRef(0)
  const avisar = useRef(alCambiar)
  useEffect(() => { avisar.current = alCambiar }, [alCambiar])

  // 1) Al acercarse a la pantalla: las 3 primeras. (Margen amplio: que estén listas ANTES de que se vea.)
  useEffect(() => {
    const el = raiz.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setCargar((c) => Math.max(c, 3)); io.disconnect() } }, { rootMargin: '600px 400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // 2) Siempre las 2 de adelante de la foto actual (y las anteriores, por si regresa): se calcula al pintar, sin efecto.
  const cargadas = Math.max(cargar, Math.min(lista.length, actual + 3))

  // 3) Al tocar, pasar el ratón o enfocar: las primeras 5 ya.
  const calentar = useCallback(() => { setCargar((c) => Math.max(c, Math.min(lista.length, 5))) }, [lista.length])

  const alDesplazar = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const p = pista.current
      if (!p || p.clientWidth === 0) return
      const i = Math.round(p.scrollLeft / p.clientWidth)
      setActual((a) => (a === i ? a : i))
      if (i !== avisada.current) { avisada.current = i; avisar.current?.(i) }
    })
  }, [])
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

  const ir = useCallback((i: number) => {
    const p = pista.current
    if (!p) return
    const n = Math.max(0, Math.min(lista.length - 1, i))
    const reducido = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    p.scrollTo({ left: n * p.clientWidth, behavior: reducido ? 'auto' : 'smooth' })
  }, [lista.length])

  // Las miniaturas de la ficha piden una foto desde fuera: se desliza hasta ella.
  useEffect(() => {
    if (indice === undefined || indice === avisada.current) return
    ir(indice)
  }, [indice, ir])

  // Arrastrar con el RATÓN (con el dedo y el trackpad, el navegador ya desliza solo).
  const alPresionar = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !pista.current) return
    arrastre.current = { x: e.clientX, izq: pista.current.scrollLeft, movido: false }
    calentar()
  }
  const alMover = (e: React.PointerEvent) => {
    const a = arrastre.current, p = pista.current
    if (!a || !p) return
    const dx = e.clientX - a.x
    if (!a.movido && Math.abs(dx) < 6) return
    if (!a.movido) { a.movido = true; p.style.scrollSnapType = 'none'; p.setPointerCapture?.(e.pointerId); p.dataset.arrastrando = '1' }
    p.scrollLeft = a.izq - dx
  }
  const alSoltar = (e: React.PointerEvent) => {
    const a = arrastre.current, p = pista.current
    arrastre.current = null
    if (!a || !p || !a.movido) return
    p.releasePointerCapture?.(e.pointerId)
    delete p.dataset.arrastrando
    const destino = Math.round(p.scrollLeft / p.clientWidth)
    p.style.scrollSnapType = ''
    p.scrollTo({ left: destino * p.clientWidth, behavior: 'smooth' })
  }
  // Tras arrastrar, el «click» que el navegador manda al soltar no debe abrir nada; y un toque limpio sí abre la foto en grande.
  const alHacerClic = (e: React.MouseEvent) => {
    const p = pista.current
    if (p?.dataset.suprimir) { e.preventDefault(); e.stopPropagation(); delete p.dataset.suprimir; return }
    if (alAbrir) alAbrir(actual)
  }
  useEffect(() => {
    const p = pista.current
    if (!p) return
    const marcar = () => { if (p.dataset.arrastrando) { p.dataset.suprimir = '1'; setTimeout(() => { delete p.dataset.suprimir }, 80) } }
    p.addEventListener('pointerup', marcar, true)
    return () => p.removeEventListener('pointerup', marcar, true)
  }, [])

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); ir(actual + 1) } else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(actual - 1) }
    else if (alAbrir && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); alAbrir(actual) }
  }

  const varias = lista.length > 1
  const medida = ficha ? { width: 920, height: 480 } : { width: 380, height: 238 }
  return (
    <div ref={raiz} className={ficha ? 'gf gf-ficha' : 'gf'} onPointerEnter={calentar} onTouchStart={calentar} onFocusCapture={calentar}>
      <div
        ref={pista} className="gf-pista" data-abre={alAbrir ? 'si' : undefined} role="group" aria-roledescription="carrusel" aria-label={`Fotos de ${titulo}. Desliza o usa las flechas izquierda y derecha${alAbrir ? '; Enter la abre en grande' : ''}`}
        tabIndex={varias || alAbrir ? 0 : undefined} onScroll={alDesplazar} onKeyDown={alTeclear}
        onPointerDown={alPresionar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar} onClickCapture={alHacerClic}
      >
        {lista.map((url, i) => {
          const conSrc = i < cargadas
          const img = conSrc ? imgResponsiva(url, sizes, ficha ? 1200 : 640) : { src: undefined as string | undefined }
          return (
            <div className="gf-foto" key={`${i}-${url}`} role="group" aria-roledescription="diapositiva" aria-label={`${i + 1} de ${lista.length}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                {...img}
                alt={i === 0 ? titulo : `${titulo}, foto ${i + 1}`}
                {...medida} draggable={false}
                loading={i === 0 && !prioridad ? 'lazy' : 'eager'}
                fetchPriority={prioridad && i === 0 ? 'high' : undefined}
                decoding="async"
                onLoad={(e) => { e.currentTarget.decode?.().catch(() => {}) }}
                onError={(e) => { alFallarImagen(e.currentTarget, RESERVA) }}
              />
            </div>
          )
        })}
      </div>

      {children}

      {varias && (
        <>
          <button type="button" className="gf-flecha gf-prev" onClick={(e) => { e.stopPropagation(); ir(actual - 1) }} disabled={actual === 0} aria-label="Foto anterior" tabIndex={-1}>
            <i className="fa fa-chevron-left" aria-hidden="true" />
          </button>
          <button type="button" className="gf-flecha gf-sig" onClick={(e) => { e.stopPropagation(); ir(actual + 1) }} disabled={actual >= lista.length - 1} aria-label="Foto siguiente" tabIndex={-1}>
            <i className="fa fa-chevron-right" aria-hidden="true" />
          </button>
          {!ficha && (
            <div className="gf-puntos" aria-hidden="true">
              {lista.slice(0, 9).map((_, i) => <span key={i} data-activo={i === Math.min(actual, 8)} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
