'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * La escena de fondo del hero: video DECORATIVO, silencioso y en bucle (portada de la nueva etapa de diseño).
 *
 * Reglas que cumple, y por qué:
 *  · Sin audio: el archivo se preparó sin pista de audio (`ffprobe` lo comprueba) y el elemento va `muted`.
 *  · `autoPlay` + `muted` + `playsInline` + `loop`: lo único con lo que iOS y Android lo reproducen en línea sin gestos.
 *  · La IMAGEN DE PORTADA es el elemento real del LCP y la alternativa estática: se pinta siempre, también sin JavaScript.
 *  · Movimiento reducido (`prefers-reduced-motion`), ahorro de datos (`saveData`) o reproducción bloqueada → se queda la portada.
 *    En esos casos ni siquiera se descarga el video.
 *  · Dos encuadres de la MISMA toma (no se estira nada): uno para escritorio y uno para teléfono/tableta, a su resolución real.
 *  · Se pausa fuera de pantalla y con la pestaña oculta (batería y datos).
 *  · El texto de la página sigue siendo HTML: aquí no hay ningún texto, logotipo ni dato de contacto (el recorte del original no
 *    los contiene; se comprobó en 12 momentos del clip).
 *
 * El nombre accesible describe SOLO lo que se ve; no afirma que sea un lugar concreto.
 */
const DESCRIPCION = 'Terraza de una casa con alberca frente a un lago, con la ciudad y las lomas al fondo, al atardecer'

export default function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const [reproducir, setReproducir] = useState(false)
  const [encuadre, setEncuadre] = useState<'escritorio' | 'movil'>('movil')

  useEffect(() => {
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)')
    const ancho = window.matchMedia('(min-width: 900px)')
    const decidir = () => {
      const ahorro = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
      setReproducir(!reducido.matches && !ahorro)
      setEncuadre(ancho.matches ? 'escritorio' : 'movil')
    }
    decidir()
    reducido.addEventListener('change', decidir)
    ancho.addEventListener('change', decidir)
    return () => { reducido.removeEventListener('change', decidir); ancho.removeEventListener('change', decidir) }
  }, [])

  useEffect(() => {
    const v = ref.current
    if (!v || !reproducir) return
    v.muted = true // React no siempre refleja `muted` en el DOM: sin esto algunos navegadores bloquean el autoplay
    const intentar = () => { void v.play().catch(() => { /* bloqueado: se queda la portada */ }) }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !document.hidden) intentar(); else v.pause() }, { threshold: 0.05 })
    io.observe(v)
    const visibilidad = () => { if (document.hidden) v.pause(); else intentar() }
    document.addEventListener('visibilitychange', visibilidad)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', visibilidad) }
  }, [reproducir, encuadre])

  const portada = encuadre === 'escritorio' ? '/inicio/portada-escritorio.webp' : '/inicio/portada-movil.webp'
  return (
    <div className="ini-hero-media" role="img" aria-label={DESCRIPCION} data-hero-media>
      {/* La portada: LCP y alternativa estática. `picture` para que cada pantalla pida solo la suya. */}
      <picture>
        <source media="(min-width: 900px)" srcSet="/inicio/portada-escritorio.webp" />
        <img src="/inicio/portada-movil.webp" alt="" width={540} height={558} fetchPriority="high" decoding="async" data-hero-portada />
      </picture>
      {reproducir && (
        <video
          key={encuadre}
          ref={ref}
          data-hero-video={encuadre}
          autoPlay muted loop playsInline
          preload="metadata"
          poster={portada}
          aria-hidden="true"
          tabIndex={-1}
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noremoteplayback"
        >
          <source src={`/inicio/escena-${encuadre}.webm`} type="video/webm" />
          <source src={`/inicio/escena-${encuadre}.mp4`} type="video/mp4" />
        </video>
      )}
      <div className="ini-hero-velo" aria-hidden="true" />
    </div>
  )
}
