'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'

/**
 * «Nuestros clientes»: los MISMOS seis testimonios de siempre (texto, nombre y rol sin tocar), ahora en un carrusel.
 *
 * Accesibilidad (patrón «carrusel» de la guía de WAI-ARIA):
 *  · región con `aria-roledescription="carrusel"` y diapositivas «n de N»; los controles son botones reales con nombre.
 *  · teclado: la región se enfoca y responde a ← → Inicio Fin; los botones, a Enter/Espacio.
 *  · el avance automático (solo si NO hay movimiento reducido) se detiene con el ratón encima, con el foco dentro, al tocar, con la
 *    pestaña oculta y fuera de pantalla (sin botón de pausa: decisión del propietario, 21-oct-2026; el ratón encima o el foco lo detienen). Con movimiento reducido no avanza solo.
 *  · el desplazamiento es el nativo del navegador (scroll-snap): un deslizamiento vertical sigue desplazando la página, no atrapa el gesto.
 *  · el anuncio a lectores de pantalla (`aria-live`) está apagado mientras avanza solo y en «cortés» cuando la persona lo maneja.
 */
export const TESTIMONIOS = [
  { initials: 'RC', nombre: 'Ricardo Castillo', rol: 'Empresario Textil', color: 'linear-gradient(45deg,var(--rojo),var(--rojo-claro))', texto: '"Excelente servicio para rentar mi nave industrial. El equipo fue muy profesional y directo. Encontramos el cliente ideal en menos de un mes."' },
  { initials: 'MG', nombre: 'Mariana G.', rol: 'Propietaria Residencial', color: 'linear-gradient(45deg,var(--azul),#2A3B5E)', texto: '"La transparencia fue clave. En todo momento estuvieron disponibles para mis dudas sobre mi primer terreno campestre."' },
  { initials: 'AL', nombre: 'Alberto Luna', rol: 'Gerente de Logística', color: 'linear-gradient(45deg,#FFD700,#DAA520)', texto: '"Recomiendo ampliamente a Vive Bien para cualquier operación industrial en el Bajío. Conocen la zona a la perfección."' },
  { initials: 'IM', nombre: 'Isabel Mora', rol: 'Consultora Independiente', color: 'linear-gradient(45deg,#2E7D32,#4CAF50)', texto: '"Atención de primer nivel, encontré mi departamento en una semana gracias a su catálogo actualizado."' },
  { initials: 'JP', nombre: 'Juan Pablo S.', rol: 'General Manager', color: 'linear-gradient(45deg,#1565C0,#1976D2)', texto: '"La mejor decisión para nuestra bodega logística. Eficiencia, rapidez y un trato humano excepcional."' },
  { initials: 'SM', nombre: 'Sofía Méndez', rol: 'Propietaria', color: 'linear-gradient(45deg,#6A1B9A,#8E24AA)', texto: '"Asesoría legal clara y honesta. Vendí mi propiedad en tiempo récord y con total seguridad jurídica."' },
] as const

const INTERVALO_MS = 7000

export default function CarruselClientes() {
  const pista = useRef<HTMLDivElement>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const [activa, setActiva] = useState(0)
  const [reducido, setReducido] = useState(false)
  const [interactuando, setInteractuando] = useState(false) // ratón encima, foco dentro o dedo puesto
  const [visible, setVisible] = useState(true)
  const [oculta, setOculta] = useState(false)
  const total = TESTIMONIOS.length

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    const f = () => setReducido(m.matches)
    f(); m.addEventListener('change', f)
    const v = () => setOculta(document.hidden)
    document.addEventListener('visibilitychange', v)
    return () => { m.removeEventListener('change', f); document.removeEventListener('visibilitychange', v) }
  }, [])

  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  /** Lleva la diapositiva `i` a la vista. Con movimiento reducido, sin animación. */
  const ir = useCallback((i: number) => {
    const p = pista.current
    if (!p) return
    const n = ((i % total) + total) % total
    const hijo = p.children[n] as HTMLElement | undefined
    if (!hijo) return
    p.scrollTo({ left: hijo.offsetLeft - p.offsetLeft, behavior: reducido ? 'auto' : 'smooth' })
    setActiva(n)
  }, [reducido, total])

  // La diapositiva activa sigue al desplazamiento (también el hecho con el dedo o la rueda).
  useEffect(() => {
    const p = pista.current
    if (!p) return
    let t: ReturnType<typeof setTimeout> | undefined
    const alDesplazar = () => {
      clearTimeout(t)
      t = setTimeout(() => {
        const base = p.scrollLeft + p.offsetLeft
        let mejor = 0, dist = Infinity
        Array.from(p.children).forEach((c, i) => { const d = Math.abs((c as HTMLElement).offsetLeft - base); if (d < dist) { dist = d; mejor = i } })
        setActiva(mejor)
      }, 90)
    }
    p.addEventListener('scroll', alDesplazar, { passive: true })
    return () => { p.removeEventListener('scroll', alDesplazar); clearTimeout(t) }
  }, [])

  const avanceAutomatico = !reducido && !interactuando && visible && !oculta
  useEffect(() => {
    if (!avanceAutomatico) return
    const id = setInterval(() => ir(activa + 1), INTERVALO_MS)
    return () => clearInterval(id)
  }, [avanceAutomatico, activa, ir])

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); ir(activa + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(activa - 1) }
    else if (e.key === 'Home') { e.preventDefault(); ir(0) }
    else if (e.key === 'End') { e.preventDefault(); ir(total - 1) }
  }

  return (
    <div
      ref={raiz}
      className="ini-carrusel"
      role="region"
      aria-roledescription="carrusel"
      aria-label="Testimonios de nuestros clientes"
      data-carrusel="clientes"
      onMouseEnter={() => setInteractuando(true)}
      onMouseLeave={() => setInteractuando(false)}
      onFocusCapture={() => setInteractuando(true)}
      onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setInteractuando(false) }}
      onTouchStart={() => setInteractuando(true)}
      onTouchEnd={() => setTimeout(() => setInteractuando(false), 4000)}
    >
      <div
        ref={pista}
        className="ini-carrusel-pista"
        tabIndex={0}
        role="group"
        aria-label="Diapositivas. Usa las flechas izquierda y derecha para cambiar de testimonio"
        aria-live={avanceAutomatico ? 'off' : 'polite'}
        onKeyDown={alTeclear}
      >
        {TESTIMONIOS.map((t, i) => (
          <figure key={t.initials} className="ini-testimonio" role="group" aria-roledescription="diapositiva" aria-label={`${i + 1} de ${total}`} data-activa={i === activa}>
            {/* Presentación al estilo de una reseña de buscador de mapas (sin su logotipo ni su marca): quien opina, cinco estrellas y el comentario. */}
            <figcaption className="ini-resena-cab">
              <span className="ini-avatar" style={{ background: t.color }} aria-hidden>{t.initials}</span>
              <span className="ini-autor"><strong>{t.nombre}</strong><small>{t.rol}</small></span>
            </figcaption>
            <div className="ini-estrellas" role="img" aria-label="Calificación: 5 de 5 estrellas">
              {[0, 1, 2, 3, 4].map(n => <Star key={n} aria-hidden size={18} fill="currentColor" strokeWidth={0} />)}
            </div>
            <blockquote><p>{t.texto.replace(/^"|"$/g, '')}</p></blockquote>
          </figure>
        ))}
      </div>

      <div className="ini-carrusel-controles">
        <button type="button" className="ini-ctrl" onClick={() => ir(activa - 1)} aria-label="Testimonio anterior"><ChevronLeft aria-hidden size={22} /></button>
        <div className="ini-puntos-carrusel" role="group" aria-label="Elegir testimonio">
          {TESTIMONIOS.map((t, i) => (
            <button key={t.initials} type="button" className="ini-punto" aria-label={`Ir al testimonio ${i + 1} de ${total}`} aria-current={i === activa ? 'true' : undefined} onClick={() => ir(i)} />
          ))}
        </div>
        <button type="button" className="ini-ctrl" onClick={() => ir(activa + 1)} aria-label="Testimonio siguiente"><ChevronRight aria-hidden size={22} /></button>
      </div>
    </div>
  )
}
