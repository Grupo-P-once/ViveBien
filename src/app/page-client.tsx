'use client'
import '@/components/inicio/inicio.css'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { folioCompleto } from '@/lib/folio'
import { MotionConfig } from 'framer-motion'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RegisterModal from '@/components/RegisterModal'
import MosaicoCategorias from '@/components/MosaicoCategorias'
import PropositoValores from '@/components/PropositoValores'
import HeroInicio, { type FormBusqueda } from '@/components/inicio/HeroInicio'
import { QueEsViveBien, SeccionProin } from '@/components/inicio/QueEsViveBien'
import Acompanamiento from '@/components/inicio/Acompanamiento'
import CarruselClientes from '@/components/inicio/CarruselClientes'
import ContactoInicio from '@/components/inicio/ContactoInicio'
import RedesSociales from '@/components/inicio/RedesSociales'
import BlogInicio from '@/components/inicio/BlogInicio'
import type { ArticuloInicio } from '@/lib/blog/articulos'
import WhatsAppFlotante from '@/components/inicio/WhatsAppFlotante'

/*
 * La portada. Rediseño de la página de inicio (etapa de diseño posterior a R8.6): hero con video, «¿Qué es Vive Bien?» y PROIN, categorías con
 * Oficinas, «Permítenos guiarte», carrusel de clientes y contacto compacto. Cada bloque vive en `components/inicio/`; aquí solo se ordena.
 *
 * Se quitó «Nuestra Esencia» (Misión, Visión y Valores): repetía lo de «Nuestro propósito» (`PropositoValores`), que se conserva.
 *
 * `MotionConfig reducedMotion="user"`: con `prefers-reduced-motion` framer-motion deja de animar transformaciones en toda la página.
 * El formulario de registro NO salta solo (tapaba el sitio entero antes de ver una propiedad): se ofrece al segundo anuncio que abre
 * (`lib/momento-registro.ts`) o cuando la persona pide «Asesoría gratis».
 */
export default function HomePage({ articulosBlog = [] }: { articulosBlog?: ArticuloInicio[] }) {
  const router = useRouter()
  const [form, setForm] = useState<FormBusqueda>({ op: 'venta', tipo: '', zona: '' })
  const [regOpen, setRegOpen] = useState(false)

  // La portada trae su propio botón de WhatsApp (que se aparta del buscador y del formulario en el teléfono). El del layout (`WAFloat`) quedaba
  // ENCIMA del que ya tenía la portada vieja —dos botones apilados—: aquí se oculta SOLO mientras esta pantalla está montada; en el resto del sitio no cambia.
  useEffect(() => {
    document.body.classList.add('inicio-vb')
    return () => document.body.classList.remove('inicio-vb')
  }, [])

  function buscar(e: React.FormEvent) {
    e.preventDefault()
    const folio = folioCompleto(form.zona)
    if (folio) { router.push(`/propiedades/${folio}`); return }   // un folio completo lleva a su ficha (A12)
    const params = new URLSearchParams()
    if (form.op) params.set('op', form.op)
    if (form.tipo) params.set('tipo', form.tipo)
    if (form.zona) params.set('zona', form.zona)
    router.push(`/propiedades?${params.toString()}`)
  }

  function handleRegClose() {
    localStorage.setItem('vb_registered', '1')
    setRegOpen(false)
  }

  return (
    <MotionConfig reducedMotion="user">
      <Header />
      {/* E-37 / axe `region`: todo el contenido de la portada vive dentro de un landmark principal. */}
      <main>
      <RegisterModal isOpen={regOpen} onClose={handleRegClose} />

      <HeroInicio form={form} setForm={setForm} onBuscar={buscar} onAsesoria={() => setRegOpen(true)} />

      {/* ===== MOSAICO DE CATEGORIAS (lámina de marca) · pegado al hero, sin aire entre medias ===== */}
      <MosaicoCategorias />

      {/* ===== MARQUESINA ===== */}
      <div style={{ background: 'var(--negro)', overflow: 'hidden', padding: '.9rem 0', borderBottom: '1px solid rgba(255,255,255,.06)' }} aria-hidden="true">
        <div className="ini-marquesina" style={{ display: 'flex', width: 'max-content', animation: 'marquee 120s linear infinite' }}
          onMouseEnter={e => (e.currentTarget.style.animationPlayState = 'paused')}
          onMouseLeave={e => (e.currentTarget.style.animationPlayState = 'running')}>
          {[...Array(2)].map((_, rep) => (
            <div key={rep} style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
              {[
                { text: 'Naves Industriales', icon: 'fa-industry' },
                { text: 'León, Guanajuato', icon: 'fa-map-marker-alt' },
                { text: 'Casas Residenciales', icon: 'fa-home' },
                { text: '15+ Años de Experiencia', icon: 'fa-star' },
                { text: 'Terrenos en Venta', icon: 'fa-map' },
                { text: 'Oficinas', icon: 'fa-briefcase' },
                { text: 'Atención Personalizada', icon: 'fa-user-tie' },
                { text: 'Locales Comerciales', icon: 'fa-store' },
                { text: '+500 Clientes Satisfechos', icon: 'fa-thumbs-up' },
              ].map((item) => (
                <span key={item.text} style={{ display: 'inline-flex', alignItems: 'center', gap: '.6rem', padding: '0 2.2rem', color: 'rgba(255,255,255,.78)', fontFamily: 'var(--font-montserrat)', fontWeight: 700, fontSize: '.78rem', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                  <i className={`fa ${item.icon}`} style={{ color: 'var(--rojo-claro)', fontSize: '.8rem' }} />
                  {item.text}
                  <span style={{ color: 'rgba(255,255,255,.2)', marginLeft: '.4rem' }}>·</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ===== NUESTRO PROPÓSITO (y valores) ===== */}
      <PropositoValores />

      {/* ===== ¿QUÉ ES VIVE BIEN? Y PROIN ===== */}
      <QueEsViveBien />
      <SeccionProin />

      {/* ===== PERMÍTENOS GUIARTE ===== */}
      <Acompanamiento onAsesoria={() => setRegOpen(true)} />

      {/* ===== CTA PROPIEDADES ===== */}
      <section className="ini-cta">
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 className="ini-cta-t">Explora nuestras <em>propiedades</em></h2>
          <p style={{ opacity: .9, marginBottom: '2rem', fontSize: '1.05rem' }}>Naves industriales, casas, terrenos, locales y oficinas en León, Guanajuato</p>
          <Link href="/propiedades" style={{ display: 'inline-block', background: 'var(--rojo-marca)', color: '#fff', padding: '1rem 2.5rem', borderRadius: '10px', fontWeight: 700, fontFamily: 'var(--font-montserrat)', fontSize: '1rem' }}>
            Ver todas las propiedades <i className="fa fa-arrow-right" aria-hidden style={{ marginLeft: '.5rem' }} />
          </Link>
        </div>
      </section>

      {/* ===== NUESTROS CLIENTES (carrusel) ===== */}
      <section className="ini-clientes" aria-labelledby="clientes-titulo" data-seccion="clientes">
        <div className="ini-clientes-cab">
          <p className="ini-eyebrow"><span aria-hidden className="ini-eyebrow-linea" />Lo que dicen de nosotros</p>
          <h2 id="clientes-titulo">Nuestros <em>Clientes</em></h2>
          <p>La confianza de nuestros clientes es nuestro mayor activo</p>
        </div>
        <CarruselClientes />
      </section>

      {/* ===== PUBLICACIONES DE LAS REDES (entre las reseñas y «Contáctanos») ===== */}
      <RedesSociales />

      {/* ===== BLOG (artículos recientes; sin artículos reales no se pinta nada) ===== */}
      <BlogInicio articulos={articulosBlog} />

      {/* ===== CONTACTO ===== */}
      <ContactoInicio />

      <WhatsAppFlotante />

      <style>{`
        @keyframes pulseGreen {
          0%   { transform: scale(1); box-shadow: 0 0 0 0 rgba(37,211,102,.7); }
          70%  { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(37,211,102,0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37,211,102,0); }
        }
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        select option { background: var(--azul-profundo); color: #fff; }
        .ini-campo select option { background: #fff; color: var(--texto); }
        @media (prefers-reduced-motion: reduce) { .ini-marquesina { animation: none !important; } }
      `}</style>

      </main>
      <Footer />
    </MotionConfig>
  )
}
