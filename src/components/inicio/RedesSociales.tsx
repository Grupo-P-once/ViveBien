'use client'
import NextImage from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Bookmark, ChevronLeft, ChevronRight, EllipsisVertical, Heart, MessageCircle, Send } from 'lucide-react'
import { NEGOCIO } from '@/lib/config/negocio'
import { PERFIL, PUBLICACIONES, type Publicacion, type Red } from '@/lib/redes/publicaciones'

/**
 * «Conoce nuestras últimas publicaciones»: tarjetas con forma de publicación de Instagram, tomadas de `lib/redes/publicaciones.ts`
 * (imágenes LOCALES; ningún script ni iframe de Meta). Plan, decisiones y mantenimiento: Obsidian «Plan — Publicaciones de redes sociales…».
 *
 *  · Pestañas Instagram/Facebook (`aria-pressed`): cambian el perfil, la etiqueta y el destino; solo se listan las publicaciones de esa red.
 *  · Carrusel nativo (`scroll-snap`), botones anterior/siguiente reales, teclado ← →, SIN avance automático; movimiento reducido respetado.
 *  · Cada tarjeta es UN enlace (el texto «Ver en …»): la publicación si se conoce su `permalink`, si no el perfil. Los iconos de corazón,
 *    comentario, enviar y guardar son decorativos (no se muestran conteos: no se conocen y un número inventado engaña).
 */
const LOGO = '/logo_transparent.png'
const HERRAMIENTAS: Record<Red, { nombre: string; perfil: string; usuario: string; verTodas: string }> = {
  instagram: { nombre: 'Instagram', perfil: NEGOCIO.instagram, usuario: PERFIL.usuario, verTodas: 'Ver todas nuestras publicaciones' },
  facebook: { nombre: 'Facebook', perfil: NEGOCIO.facebook, usuario: PERFIL.paginaFacebook, verTodas: 'Ver todas nuestras publicaciones' },
}

function IconoInstagram({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.1" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconoFacebook({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.04c-5.5 0-9.96 4.46-9.96 9.96 0 4.99 3.66 9.13 8.44 9.88v-6.99H7.94V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99c4.78-.75 8.44-4.89 8.44-9.88 0-5.5-4.46-9.96-9.96-9.96z" />
    </svg>
  )
}

function Tarjeta({ p, red }: { p: Publicacion; red: Red }) {
  const h = HERRAMIENTAS[red]
  const destino = p.permalink ?? h.perfil
  const etiqueta = `Ver en ${h.nombre}: ${p.texto}`
  return (
    <article className="ini-post" data-red={red} data-publicacion={p.id}>
      <header className="ini-post-cab">
        <span className="ini-post-avatar" aria-hidden><NextImage unoptimized src={LOGO} alt="" width={475} height={316} loading="lazy" decoding="async" /></span>
        <span className="ini-post-usuario">{h.usuario}</span>
        <EllipsisVertical aria-hidden size={18} className="ini-post-menu" />
      </header>
      {/* La imagen también enlaza, pero es un duplicado del enlace de abajo: se oculta a lectores y al tabulador. */}
      <a className="ini-post-img" href={destino} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden>
        <NextImage unoptimized src={`/redes/${p.imagen}`} alt="" width={p.ancho} height={p.alto} loading="lazy" decoding="async" />
      </a>
      <p className="ini-solo-lectores">{p.alt}</p>
      <div className="ini-post-iconos" aria-hidden>
        <span><Heart size={22} fill="currentColor" className="ini-post-corazon" /><MessageCircle size={22} /><Send size={21} /></span>
        <Bookmark size={22} />
      </div>
      <p className="ini-post-texto"><strong>{h.usuario}</strong> {p.texto}</p>
      <a className="ini-post-ver" href={destino} target="_blank" rel="noopener noreferrer" aria-label={`${etiqueta} (se abre en una pestaña nueva)`}>
        Ver en {h.nombre}
      </a>
    </article>
  )
}

export default function RedesSociales() {
  const [red, setRed] = useState<Red>('instagram')
  const [reducido, setReducido] = useState(false)
  const [inicio, setInicio] = useState(true)
  const [fin, setFin] = useState(false)
  const pista = useRef<HTMLDivElement>(null)
  const lista = PUBLICACIONES.filter((p) => p.redes.includes(red))
  const h = HERRAMIENTAS[red]

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    const f = () => setReducido(m.matches)
    f(); m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])

  const medir = useCallback(() => {
    const p = pista.current
    if (!p) return
    setInicio(p.scrollLeft <= 4)
    setFin(p.scrollLeft + p.clientWidth >= p.scrollWidth - 4)
  }, [])
  useEffect(() => {
    const p = pista.current
    if (!p) return
    medir()
    p.addEventListener('scroll', medir, { passive: true })
    const ro = new ResizeObserver(medir); ro.observe(p)
    return () => { p.removeEventListener('scroll', medir); ro.disconnect() }
  }, [medir, red])

  const mover = (dir: 1 | -1) => {
    const p = pista.current
    if (!p) return
    const tarjeta = p.querySelector<HTMLElement>('.ini-post')
    const paso = tarjeta ? tarjeta.offsetWidth + 20 : p.clientWidth * 0.8
    p.scrollBy({ left: dir * paso, behavior: reducido ? 'auto' : 'smooth' })
  }
  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); mover(1) } else if (e.key === 'ArrowLeft') { e.preventDefault(); mover(-1) }
  }
  const cambiar = (r: Red) => { setRed(r); requestAnimationFrame(() => pista.current?.scrollTo({ left: 0 })) }

  return (
    <section className="ini-redes" aria-labelledby="redes-titulo" data-seccion="redes">
      <div className="ini-redes-cab">
        <div className="ini-redes-titulo">
          <p className="ini-eyebrow"><span aria-hidden className="ini-eyebrow-linea" />Nuestras redes</p>
          <h2 id="redes-titulo">Conoce nuestras <em>últimas publicaciones</em></h2>
          <p>Propiedades, oportunidades, consejos y más. Síguenos en Instagram y Facebook y mantente al día.</p>
        </div>
        <div className="ini-redes-controles">
          <div className="ini-redes-tabs" role="group" aria-label="Red social">
            {(['instagram', 'facebook'] as const).map((r) => (
              <button key={r} type="button" className="ini-redes-tab" aria-pressed={red === r} data-red={r} onClick={() => cambiar(r)}>
                {r === 'instagram' ? <IconoInstagram /> : <IconoFacebook />}{HERRAMIENTAS[r].nombre}
              </button>
            ))}
          </div>
          <div className="ini-redes-flechas">
            <button type="button" className="ini-redes-flecha" onClick={() => mover(-1)} disabled={inicio} aria-label="Publicaciones anteriores"><ChevronLeft aria-hidden size={22} /></button>
            <button type="button" className="ini-redes-flecha" onClick={() => mover(1)} disabled={fin} aria-label="Publicaciones siguientes"><ChevronRight aria-hidden size={22} /></button>
          </div>
        </div>
      </div>

      {lista.length ? (
        <div ref={pista} className="ini-redes-pista" tabIndex={0} role="region" aria-roledescription="carrusel" aria-label={`Publicaciones de ${h.nombre}. Usa las flechas izquierda y derecha para desplazarte`} onKeyDown={alTeclear}>
          {lista.map((p) => <Tarjeta key={`${red}-${p.id}`} p={p} red={red} />)}
        </div>
      ) : (
        <p className="ini-redes-vacio">Aún no hay publicaciones para mostrar aquí. Visítanos en {h.nombre}.</p>
      )}

      <p className="ini-redes-pie">
        <a className="ini-redes-todas" href={h.perfil} target="_blank" rel="noopener noreferrer">
          {h.verTodas} <ArrowRight aria-hidden size={18} /><span className="ini-solo-lectores"> en {h.nombre} (se abre en una pestaña nueva)</span>
        </a>
      </p>
    </section>
  )
}
