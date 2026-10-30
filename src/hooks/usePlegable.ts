'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MEDIDA_SSR, disposicionDe, duracionMs, huecoDeLaBisagra, rejillaDe, segmentoPrincipal,
  type Disposicion, type Medida, type Postura, type Rejilla, type Segmento,
} from '@/lib/pantalla/plegables'

/**
 * Leer el dispositivo: pliegue, postura y visibilidad (V-1.1.93, tarea 03.07).
 *
 * ─────────────────────────────────────────────────────────────
 * CUATRO NIVELES, DE MEJOR A PEOR, Y NINGUNO DEJA LA PANTALLA ROTA
 *
 *   1. `window.viewport.segments`   — los segmentos de verdad (Chrome/Edge)
 *   2. `navigator.devicePosture`    — abierto o cerrado, y su evento `change`
 *   3. media queries de segmentos   — por si el objeto no está pero el CSS sí
 *   4. `resize` + `orientationchange` — lo que funciona en todas partes
 *
 * En Safari y Firefox, que hoy no saben nada de plegables, se cae al nivel 4 y
 * la pantalla se comporta como cualquier responsive. **No se mira el modelo ni
 * el user-agent en ningún nivel**: un plegable que salga mañana entra por el
 * mismo camino.
 * ─────────────────────────────────────────────────────────────
 */

type ViewportConSegmentos = { segments?: Array<DOMRect | Segmento> }
type DevicePosture = { type?: string; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void }

function leerSegmentos(): Segmento[] {
  if (typeof window === 'undefined') return []
  const v = (window as unknown as { viewport?: ViewportConSegmentos }).viewport
  const crudos = v?.segments
  if (!Array.isArray(crudos) || crudos.length < 2) return []
  return crudos.map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height }))
}

function leerPostura(): Postura {
  if (typeof navigator === 'undefined') return 'desconocida'
  const p = (navigator as unknown as { devicePosture?: DevicePosture }).devicePosture
  const t = p?.type
  if (t === 'folded' || t === 'continuous') return t
  // Nivel 3: el CSS puede saberlo aunque el objeto no exista.
  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      if (window.matchMedia('(device-posture: folded)').matches) return 'folded'
      if (window.matchMedia('(device-posture: continuous)').matches) return 'continuous'
    } catch { /* la media query no se entiende en este navegador */ }
  }
  return 'desconocida'
}

function medir(): Medida {
  if (typeof window === 'undefined') return MEDIDA_SSR
  return {
    segmentos: leerSegmentos(),
    postura: leerPostura(),
    ancho: window.innerWidth,
    alto: window.innerHeight,
  }
}

export type EstadoPlegable = {
  disposicion: Disposicion
  segmentos: Segmento[]
  postura: Postura
  /** Píxeles que ocupa la bisagra. Nada importante puede caer ahí. */
  hueco: number
  /** Cuando todo va en un segmento, cuál. */
  principal: Segmento | null
  /** Cuánto debe durar la transición AHORA MISMO, en ms. 0 = sin animar. */
  transicionMs: number
  ancho: number
  alto: number
  /** Los carriles de la rejilla, con la bisagra como carril propio. */
  rejilla: Rejilla
  /** ¿Ya se midió la pantalla de verdad, o seguimos con el valor de SSR? */
  medido: boolean
}

/**
 * El estado del dispositivo, listo para pintar.
 *
 * Distingue **por qué** cambió: abrir o cerrar el aparato se anima; girar la
 * pantalla o arrastrar el borde de la ventana, no — si no, cada píxel de
 * arrastre lanzaría una animación.
 */
export function usePlegable(inicial: Medida = MEDIDA_SSR): EstadoPlegable {
  // Se empieza SIEMPRE por el valor de SSR, también en el cliente. Medir aquí
  // haría que la hidratación encontrara atributos distintos a los del servidor,
  // y React no los parchea: la disposición se quedaría congelada. La medida de
  // verdad llega en el efecto de abajo, que ya es un render normal.
  const [medida, setMedida] = useState<Medida>(inicial)
  const [medido, setMedido] = useState(false)
  const [transicionMs, setTransicionMs] = useState(0)
  const anterior = useRef<Disposicion>(disposicionDe(inicial))

  const actualizar = useCallback((motivo: 'pliegue' | 'tamano') => {
    const nueva = medir()
    const antes = anterior.current
    const ahora = disposicionDe(nueva)

    const menosMovimiento = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

    setTransicionMs(duracionMs(antes, ahora, { motivo, menosMovimiento }))
    anterior.current = ahora
    setMedida(nueva)
    setMedido(true)
  }, [])

  useEffect(() => {
    // Primera medida ya en el navegador: el servidor no puede saber nada de
    // esto, así que el render inicial usa el valor por defecto y aquí se
    // corrige antes de que se vea.
    actualizar('tamano')

    const porTamano = () => actualizar('tamano')
    const porPliegue = () => actualizar('pliegue')

    window.addEventListener('resize', porTamano)
    window.addEventListener('orientationchange', porTamano)

    // Nivel 1 y 2: los eventos que avisan de verdad del pliegue.
    const postura = (navigator as unknown as { devicePosture?: DevicePosture }).devicePosture
    postura?.addEventListener?.('change', porPliegue)

    const viewport = (window as unknown as { viewport?: EventTarget }).viewport
    viewport?.addEventListener?.('change', porPliegue)

    // Volver de la caché de atrás/adelante restaura el DOM tal cual estaba; si
    // entre medias cambió el tamaño o la postura, hay que volver a medir.
    const porRegreso = (e: PageTransitionEvent) => { if (e.persisted) actualizar('tamano') }
    window.addEventListener('pageshow', porRegreso as EventListener)

    // Nivel 3: si no hay objetos, la media query de segmentos también avisa.
    let mq: MediaQueryList | null = null
    try {
      mq = window.matchMedia('(horizontal-viewport-segments: 2)')
      mq.addEventListener('change', porPliegue)
    } catch { mq = null }

    return () => {
      window.removeEventListener('resize', porTamano)
      window.removeEventListener('orientationchange', porTamano)
      postura?.removeEventListener?.('change', porPliegue)
      viewport?.removeEventListener?.('change', porPliegue)
      window.removeEventListener('pageshow', porRegreso as EventListener)
      mq?.removeEventListener('change', porPliegue)
    }
  }, [actualizar])

  const disposicion = disposicionDe(medida)
  return {
    disposicion,
    segmentos: medida.segmentos,
    postura: medida.postura,
    hueco: huecoDeLaBisagra(medida.segmentos),
    principal: segmentoPrincipal(medida.segmentos),
    transicionMs,
    ancho: medida.ancho,
    alto: medida.alto,
    rejilla: rejillaDe(medida),
    medido,
  }
}

/**
 * ¿La página está a la vista?
 *
 * Sirve para dos cosas: parar lo que no hace falta cuando se cambia de pestaña,
 * y saber cuándo hay que **revisar el estado al volver** — incluido volver
 * desde la caché de atrás/adelante (`bfcache`), donde la página se restaura
 * entera sin recargarse y `visibilitychange` no siempre basta.
 */
export function useVisibilidad(alVolver?: () => void): boolean {
  const [visible, setVisible] = useState(true)
  // La referencia se actualiza en un efecto, no durante el render: escribir un
  // ref mientras se pinta rompe las suposiciones de React.
  const cb = useRef(alVolver)
  useEffect(() => { cb.current = alVolver }, [alVolver])

  useEffect(() => {
    const cambio = () => {
      const v = document.visibilityState === 'visible'
      setVisible(v)
      if (v) cb.current?.()
    }
    const volviendo = (e: PageTransitionEvent) => {
      // `persisted` = vino de la caché de atrás/adelante, sin recargar.
      setVisible(true)
      if (e.persisted) cb.current?.()
    }

    // No se fija el valor aquí: hacerlo en el cuerpo del efecto encadena
    // renders, y además el servidor no sabe nada de esto. Se empieza en
    // «visible» y el primer `visibilitychange` corrige si hiciera falta.
    document.addEventListener('visibilitychange', cambio)
    window.addEventListener('pageshow', volviendo as EventListener)
    return () => {
      document.removeEventListener('visibilitychange', cambio)
      window.removeEventListener('pageshow', volviendo as EventListener)
    }
  }, [])

  return visible
}
