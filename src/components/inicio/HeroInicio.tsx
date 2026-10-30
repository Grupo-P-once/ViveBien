'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import HeroVideo from './HeroVideo'
import UbicacionClima from './UbicacionClima'

/**
 * El hero de la portada. Los CONTROLES son los de siempre —titular, Comprar/Rentar, buscador, catálogo y asesoría—; lo que cambia es la
 * escena (video, ver `HeroVideo`) y la composición:
 *
 *  · Escritorio (≥ 900 px): texto a la izquierda sobre fondo oscuro; la escena ocupa la derecha, sin ampliarla más de ~1,2× (el original es
 *    vertical y de 720 px de ancho: forzarlo a pantalla completa lo habría vuelto borroso) y se funde con el fondo por el borde izquierdo.
 *  · Teléfono y tableta (< 900 px): la escena arriba, ENTERA a lo ancho (se ven la casa, la ciudad y el lago), el titular encima de su parte
 *    baja y el buscador debajo. El hero no ocupa toda la pantalla.
 *
 * El maquetado va en `inicio.css` (un estilo en línea le gana a cualquier media query: ver el precedente de `PropositoValores`).
 */

function useMovimientoReducido() {
  const [reducido, setReducido] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    const f = () => setReducido(m.matches)
    f(); m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return reducido
}

/** La línea que cambia de palabra. Con movimiento reducido se queda quieta (sin máquina de escribir ni cursor parpadeante). */
function PalabraCiclica({ words }: { words: string[] }) {
  const reducido = useMovimientoReducido()
  const [idx, setIdx] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (reducido) return
    const current = words[idx]
    if (paused) {
      const t = setTimeout(() => { setPaused(false); setDeleting(true) }, 2200)
      return () => clearTimeout(t)
    }
    if (!deleting) {
      if (displayed.length < current.length) {
        const t = setTimeout(() => setDisplayed(current.slice(0, displayed.length + 1)), 55)
        return () => clearTimeout(t)
      } else { const t = setTimeout(() => setPaused(true), 0); return () => clearTimeout(t) }
    } else if (displayed.length > 0) {
      const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 30)
      return () => clearTimeout(t)
    } else { const t = setTimeout(() => { setDeleting(false); setIdx(i => (i + 1) % words.length) }, 0); return () => clearTimeout(t) }
  }, [displayed, deleting, paused, idx, words, reducido])
  if (reducido) return <span>{words.join(' · ')}</span>
  return (
    <span>
      {displayed}
      <span aria-hidden style={{ display: 'inline-block', width: '2px', height: '1em', background: 'var(--rojo-marca)', marginLeft: '2px', verticalAlign: 'middle', animation: 'cursorBlink .8s steps(1) infinite' }} />
    </span>
  )
}

const CAMPO: React.CSSProperties = {
  minHeight: 48, padding: '.72rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,.22)',
  background: 'rgba(255,255,255,.1)', color: '#fff', fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: '.9rem',
}

export type FormBusqueda = { op: string; tipo: string; zona: string }

export default function HeroInicio({ form, setForm, onBuscar, onAsesoria }: {
  form: FormBusqueda
  setForm: React.Dispatch<React.SetStateAction<FormBusqueda>>
  onBuscar: (e: React.FormEvent) => void
  onAsesoria: () => void
}) {
  return (
    <section className="ini-hero" aria-labelledby="hero-titulo" data-inicio-hero>
      <HeroVideo />

      <motion.div
        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, var(--rojo-marca) 0%, var(--lavanda) 100%)', transformOrigin: 'left', zIndex: 10 }}
      />

      <div className="ini-hero-contenido">
        <div className="ini-hero-texto">
          <motion.div
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1.4rem' }}
          >
            <div aria-hidden style={{ width: '28px', height: '1.5px', background: 'var(--rojo-marca)', flexShrink: 0 }} />
            <UbicacionClima />
          </motion.div>

          <h1 id="hero-titulo" className="ini-hero-h1">
            <motion.span initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: 'block', fontWeight: 400, color: '#fff' }}>Encuentra tu</motion.span>
            <motion.span initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.33, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: 'block', fontWeight: 700, fontStyle: 'italic', color: 'var(--rojo-marca)' }}>espacio</motion.span>
            <motion.span initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.46, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: 'block', fontWeight: 900, WebkitTextStroke: '2px rgba(255,255,255,.85)', color: 'transparent' }}>ideal</motion.span>
          </h1>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85 }}
            style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1.6rem', color: 'rgba(255,255,255,.82)', fontFamily: 'var(--font-montserrat)', fontSize: 'clamp(.85rem,1.6vw,1rem)', fontWeight: 500, letterSpacing: '.5px', minHeight: '1.8rem' }}
          >
            <i className="fa fa-location-dot" aria-hidden style={{ color: 'var(--rojo-marca)', fontSize: '.8rem', flexShrink: 0 }} />
            <PalabraCiclica words={['Naves Industriales en León', 'Casas Residenciales', 'Terrenos en Venta', 'Locales Comerciales', 'Oficinas']} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            {/* Pestañas Comprar / Rentar: botones de conmutación (aria-pressed), no pestañas ARIA: no controlan paneles. */}
            <div role="group" aria-label="Operación" className="ini-tabs">
              {[{ label: 'Comprar', val: 'venta' }, { label: 'Rentar', val: 'renta' }].map(tab => (
                <button key={tab.val} type="button" aria-pressed={form.op === tab.val}
                  onClick={() => setForm(f => ({ ...f, op: tab.val }))}
                  className="ini-tab" data-activa={form.op === tab.val}>
                  {tab.label}
                </button>
              ))}
            </div>
            <form onSubmit={onBuscar} className="ini-buscador" aria-label="Buscar propiedades">
              {/* `aria-label`: el texto de ejemplo NO es una etiqueta: desaparece al escribir y un lector de pantalla no lo anuncia. */}
              <select aria-label="Tipo de propiedad" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={{ ...CAMPO, fontWeight: 600 }}>
                <option value="" style={{ background: 'var(--azul-profundo)' }}>Tipo de propiedad</option>
                <option value="casa" style={{ background: 'var(--azul-profundo)' }}>Casa Residencial</option>
                <option value="departamento" style={{ background: 'var(--azul-profundo)' }}>Departamento</option>
                <option value="nave" style={{ background: 'var(--azul-profundo)' }}>Nave / Bodega</option>
                <option value="terreno" style={{ background: 'var(--azul-profundo)' }}>Terreno</option>
                <option value="comercial" style={{ background: 'var(--azul-profundo)' }}>Local Comercial</option>
                <option value="oficina" style={{ background: 'var(--azul-profundo)' }}>Oficina</option>
              </select>
              <input type="text" aria-label="Zona o colonia" placeholder="Zona o colonia..." autoComplete="off" value={form.zona}
                onChange={e => setForm(f => ({ ...f, zona: e.target.value }))} style={CAMPO} />
              <button type="submit" className="ini-buscar">
                <i className="fa fa-search" aria-hidden style={{ fontSize: '.78rem' }} />Buscar
              </button>
            </form>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.35 }}
            style={{ marginTop: '1.3rem', display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap' }}>
            {/* Rojo de la marca. Sobre el fondo oscuro da 3,3:1: pasa AA solo como texto GRANDE (≥ 18,66 px en negrita), por eso este enlace es más grande. */}
            <Link href="/propiedades" className="ini-enlace-hero ini-enlace-catalogo" style={{ color: 'var(--rojo-marca)' }}>
              Ver catálogo completo <i className="fa fa-arrow-right" aria-hidden style={{ fontSize: '.72rem' }} />
            </Link>
            <span aria-hidden className="ini-sep" style={{ color: 'rgba(255,255,255,.25)', fontSize: '1.2rem' }}>|</span>
            {/* La ayuda que se PIDE se completa mucho más que la que se interrumpe: aquí el formulario lo abre la persona. */}
            <button type="button" onClick={onAsesoria} className="ini-enlace-hero" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'rgba(255,255,255,.86)' }}>
              Asesoría gratis
            </button>
          </motion.div>
        </div>

        {/* Las tres cifras del hero (100+ propiedades, 15 años, 500+ clientes) se quitaron por decisión del propietario (21-oct-2026): «se ve muy amontonado». */}
      </div>
    </section>
  )
}
