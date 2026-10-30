'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { alFallarImagen } from '@/lib/imagen-respaldo'
import { MAPA_GTO } from '@/lib/mapa-guanajuato'
import { NEGOCIO, HORARIO_TEXTO, enlaceTelefono, enlaceWhatsApp } from '@/lib/config/negocio'
import {
  ArrowRight, BadgeCheck, BarChart3, Building2, CalendarDays, Camera, ChevronRight, Clock, FileCheck2, Handshake, Heart, Home, Layers, Lightbulb,
  Map as MapaIcono, MapPin, Network, Phone, Scale, Search, ShieldCheck, Star, Users, Wrench, MessageCircle, type LucideIcon,
} from 'lucide-react'

/**
 * Las seis secciones de «Nosotros», según las láminas de diseño del propietario (carpeta `pg web/nosotros`), con UN solo patrón visual
 * (ver `nosotros.css`): etiqueta con filete rojo → titular Playfair con segunda línea en cursiva roja → texto → tarjetas blancas con detalle diagonal.
 *
 * Imágenes (todas en `public/nosotros/`, créditos en el informe): fotografías de Unsplash (licencia Unsplash), de Wikimedia Commons (León, Arco de la Calzada: ProtoplasmaKid,
 * CC BY-SA 4.0; Silao, Puerto Interior: Juan Carlos Fonseca Mata, CC BY-SA 4.0) y piezas del propietario. NO son inmuebles del catálogo. El mapa es vectorial (INEGI vía abcsds/GTO).
 */

/**
 * Entrada suave al desplazarse (sube y aparece, escalonada) y cifras que cuentan hasta su valor. Sólo con JS y sin «movimiento reducido»: el
 * HTML del servidor ya trae todo visible y, sin esta ayuda, la página se ve completa. Los elementos que quedan por encima al volver con el
 * scroll restaurado se muestran de inmediato.
 */
const SELECTOR_REV = '.nos-cifra, .nos-hist-texto, .nos-camino, .nos-hito, .nos-val, .nos-razon, .nos-cobertura, .nos-ciudad, .nos-contacto, .nos-empresa, .nos-garantias li, .nos-cab-centro'
export function useRevelarNosotros() {
  useEffect(() => {
    const raiz = document.querySelector('.nos')
    if (!raiz || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    const contar = (el: HTMLElement) => {
      const fin = el.textContent ?? ''
      const n = parseInt(fin, 10)
      if (!Number.isFinite(n)) return
      const sufijo = fin.replace(/^[0-9]+/, '')
      el.setAttribute('aria-label', fin)
      const t0 = performance.now()
      const paso = (t: number) => {
        const p = Math.min(1, (t - t0) / 1200)
        el.textContent = String(Math.round(n * (1 - Math.pow(1 - p, 3)))) + sufijo
        if (p < 1) requestAnimationFrame(paso); else el.textContent = fin
      }
      requestAnimationFrame(paso)
    }
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting && e.boundingClientRect.top > 0) return
      const el = e.target as HTMLElement
      el.classList.add('nos-visto')
      el.addEventListener('transitionend', () => el.removeAttribute('data-rev'), { once: true })
      if (el.classList.contains('nos-cifra')) { const v = el.querySelector('strong'); if (v) contar(v as HTMLElement) }
      io.unobserve(el)
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    raiz.querySelectorAll<HTMLElement>(SELECTOR_REV).forEach(el => {
      const hermanos = el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : 0
      el.setAttribute('data-rev', ''); el.style.setProperty('--d', `${Math.min(hermanos, 5) * 90}ms`)
      io.observe(el)
    })
    raiz.classList.add('nos-js')
    return () => { io.disconnect(); raiz.classList.remove('nos-js') }
  }, [])
}

const IMG = (n: string) => `/nosotros/${n}.webp`
const Foto = ({ n, alt = '', ancho, alto, eager = false }: { n: string; alt?: string; ancho: number; alto: number; eager?: boolean }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={IMG(n)} alt={alt} aria-hidden={alt ? undefined : true} width={ancho} height={alto} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} decoding="async"
    onError={e => alFallarImagen(e.currentTarget, '/icon.png')} />
)

/* 1 · Hero ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const CIFRAS: { Icono: LucideIcon; valor: string; titulo: string; texto: string; n: string }[] = [
  { Icono: CalendarDays, valor: '15+', titulo: 'Años de experiencia', texto: 'Trayectoria y resultados que respaldan cada proyecto.', n: '01' },
  { Icono: Home, valor: '100+', titulo: 'Propiedades gestionadas', texto: 'Casas, departamentos, terrenos, naves industriales, oficinas y locales.', n: '02' },
  { Icono: Users, valor: '500+', titulo: 'Clientes satisfechos', texto: 'Relaciones de largo plazo basadas en confianza.', n: '03' },
]

export function HeroNosotros() {
  return (
    <section className="nos-hero" aria-labelledby="nos-h1" data-seccion="nos-hero">
      <div className="nos-hero-foto"><Foto n="hero" ancho={1403} alto={818} eager /></div>
      <div aria-hidden className="nos-hero-linea-sup" />
      <div className="nos-wrap">
        <div className="nos-hero-texto">
          <p className="nos-eyebrow">Grupo inmobiliario<br />León, Guanajuato · México</p>
          <h1 id="nos-h1" className="nos-h1">Más de 15 años <em>construyendo confianza</em></h1>
          <p className="nos-hero-p">
            El grupo inmobiliario de referencia en León, Guanajuato. Especialistas en naves industriales, terrenos, casas, departamentos, oficinas y locales comerciales.
          </p>
          <div className="nos-botones">
            <Link href="/propiedades" className="nos-boton nos-boton-rojo" data-accion="ver-propiedades"><Search aria-hidden size={19} /> Ver propiedades <ArrowRight aria-hidden size={18} /></Link>
            <Link href="/contacto" className="nos-boton nos-boton-borde" data-accion="contactanos"><MessageCircle aria-hidden size={19} /> Contáctanos</Link>
          </div>
        </div>
        <ul className="nos-cifras" aria-label="Vive Bien en cifras">
          {CIFRAS.map(({ Icono, valor, titulo, texto, n }) => (
            <li key={n} className="nos-cifra">
              <span aria-hidden className="nos-cifra-num">{n}</span>
              <span className="nos-icono"><Icono aria-hidden size={22} /></span>
              <strong>{valor}</strong><b>{titulo}</b><span aria-hidden className="nos-linea" /><p>{texto}</p>
            </li>
          ))}
          <li className="nos-cifra nos-cifra-texto">
            <span aria-hidden className="nos-cifra-num">04</span>
            <span className="nos-icono nos-icono-azul"><BarChart3 aria-hidden size={22} /></span>
            <b>Soluciones inmobiliarias</b><span aria-hidden className="nos-linea" /><p>Para vivir, invertir y hacer crecer tu patrimonio.</p>
          </li>
        </ul>
      </div>
    </section>
  )
}

/* 2 · Nuestra historia ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const HITOS = [
  { y: '2009', t: 'Fundación en León, Gto.', d: 'Iniciamos con el segmento residencial.' },
  { y: '2013', t: 'Expansión al sector industrial', d: 'Nuevas oportunidades para nuestros clientes.' },
  { y: '2017', t: 'Apertura del segmento comercial', d: 'Más soluciones, más historias de éxito.' },
  { y: '2021', t: 'Plataforma digital propia', d: 'Un servicio más ágil y accesible.' },
  { y: '2024', t: '+500 clientes atendidos', d: 'Gracias por confiar en nuestro equipo.' },
]
const TRIO: { Icono: LucideIcon; t: string; d: string }[] = [
  { Icono: Users, t: 'Asesores certificados', d: 'Un equipo profesional y con experiencia.' },
  { Icono: ShieldCheck, t: 'Procesos legales seguros', d: 'Transacciones claras y confiables.' },
  { Icono: MapaIcono, t: 'Cobertura en todo Guanajuato', d: 'Conocimiento local y presencia en la región.' },
]

export function HistoriaNosotros() {
  return (
    <section className="nos-sec nos-claro" aria-labelledby="nos-hist-t" data-seccion="nos-historia">
      <div className="nos-wrap nos-hist-grid">
        <div className="nos-hist-texto">
          <p className="nos-eyebrow">Nuestra historia</p>
          <h2 id="nos-hist-t" className="nos-h2">Nacimos para hacer <em>el proceso más humano.</em></h2>
          <p className="nos-p">Vive Bien Grupo Inmobiliario nació en 2009 de la mano de José Ponce, con una convicción simple pero poderosa: en el mercado inmobiliario, lo más importante no son los metros cuadrados, sino las personas que los van a habitar.</p>
          <p className="nos-p">Comenzamos como una agencia pequeña en León, Guanajuato, enfocada en el segmento residencial. Con el paso de los años, y gracias a la confianza de nuestros clientes, expandimos nuestra operación a propiedades industriales, comerciales y de terrenos, convirtiéndonos en un grupo integral.</p>
          <p className="nos-p">Hoy somos un equipo de asesores certificados que han acompañado a más de 500 familias y empresas a tomar una de las decisiones más importantes de su vida. Cada operación es única, y la tratamos como tal.</p>
          <ul className="nos-trio">
            {TRIO.map(({ Icono, t, d }) => (
              <li key={t}><span className="nos-icono"><Icono aria-hidden size={22} /></span><strong>{t}</strong><span>{d}</span></li>
            ))}
          </ul>
        </div>
        <div className="nos-hist-visual">
          <span aria-hidden className="nos-banda nos-banda-1" /><span aria-hidden className="nos-banda nos-banda-2" />
          <div className="nos-camino">
            <p className="nos-eyebrow">Nuestro camino</p>
            <h3 className="nos-h2">Hitos que nos <em>impulsan</em></h3>
            <ol className="nos-hitos">
              {HITOS.map(h => (
                <li key={h.y} className="nos-hito"><time dateTime={h.y}>{h.y}</time><div><strong>{h.t}</strong><span>{h.d}</span></div></li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

/* 3 · Nuestros valores ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const VALORES: { Icono: LucideIcon; t: string; d: string; foto: string; tono: 'azul' | 'rojo'; pos: string }[] = [
  { Icono: Handshake, t: 'Integridad', d: 'Actuamos con honestidad y transparencia en cada transacción. Nuestros clientes merecen información veraz y asesoría sin conflictos de interés.', foto: 'integridad', tono: 'azul', pos: '70% 50%' },
  { Icono: Star, t: 'Excelencia', d: 'Nos exigimos los más altos estándares en cada proceso, desde la primera consulta hasta la entrega de llaves. La calidad no es negociable.', foto: 'excelencia', tono: 'rojo', pos: '50% 50%' },
  { Icono: Heart, t: 'Compromiso', d: 'Tu satisfacción es nuestra prioridad. Nos comprometemos con cada cliente como si fuera nuestra propia familia buscando un hogar.', foto: 'compromiso', tono: 'rojo', pos: '45% 50%' },
  { Icono: Lightbulb, t: 'Innovación', d: 'Adoptamos tecnología y nuevas herramientas para ofrecerte búsquedas más eficientes, valuaciones precisas y una experiencia moderna.', foto: 'innovacion', tono: 'azul', pos: '50% 50%' },
  { Icono: ShieldCheck, t: 'Confianza', d: 'Cada propiedad en nuestro catálogo ha sido verificada. Respaldamos cada operación con documentación legal en orden y procesos seguros.', foto: 'confianza', tono: 'azul', pos: '50% 50%' },
]

export function ValoresNosotros() {
  return (
    <section className="nos-sec nos-claro nos-valores" aria-labelledby="nos-val-t" data-seccion="nos-valores">
      <div className="nos-wrap">
        <div className="nos-cab-centro">
          <p className="nos-eyebrow nos-eyebrow-centro">Lo que nos define</p>
          <h2 id="nos-val-t" className="nos-h2">Nuestros <em>Valores</em></h2>
          <p className="nos-p">Cinco pilares que guían cada decisión, cada asesoría y cada relación con nuestros clientes.</p>
        </div>
        <ul className="nos-val-grid">
          {VALORES.map(({ Icono, t, d, foto, tono, pos }, i) => (
            <li key={t} className="nos-val" data-valor={t.toLowerCase()}>
              <div className="nos-val-cuerpo">
                <span aria-hidden className="nos-val-n">{String(i + 1).padStart(2, '0')}</span>
                <span className={`nos-icono ${tono === 'azul' ? 'nos-icono-azul' : 'nos-icono-rojo'}`}><Icono aria-hidden size={24} /></span>
                <h3>{t}</h3><span aria-hidden className="nos-linea" /><p>{d}</p>
              </div>
              <div className="nos-val-foto" aria-hidden>
                <img src={IMG(foto)} alt="" width={600} height={450} loading="lazy" decoding="async" style={{ objectPosition: pos }} onError={e => alFallarImagen(e.currentTarget, '/icon.png')} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* 4 · ¿Por qué nosotros? + cobertura ───────────────────────────────────────────────────────────────────────────────────────────────── */
const RAZONES: { Icono: LucideIcon; t: string; d: string }[] = [
  { Icono: MapaIcono, t: 'Conocimiento local profundo', d: 'Conocemos cada colonia, cada parque industrial y cada tendencia de precio en León y Guanajuato.' },
  { Icono: Scale, t: 'Asesoría legal incluida', d: 'Contamos con aliados legales especializados en bienes raíces para garantizar operaciones 100% seguras.' },
  { Icono: Camera, t: 'Marketing profesional', d: 'Fotografía profesional, tours virtuales y difusión en las principales plataformas digitales para cada propiedad.' },
  { Icono: Clock, t: 'Respuesta inmediata', d: 'Nuestro equipo responde en menos de 2 horas, todos los días de la semana, incluso fines de semana.' },
]

/** Pin del mapa (declarado fuera de `MapaGuanajuato`: un componente creado al pintar se vuelve a crear en cada render). */
function Pin({ x, y, color, nombre, lado }: { x: number; y: number; color: string; nombre: string; lado: 'izq' | 'der' }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 -30a11 11 0 0 1 11 11c0 8-11 19-11 19s-11-11-11-19a11 11 0 0 1 11-11Z" fill="#fff" stroke={color} strokeWidth="2" />
      <circle cx="0" cy="-19" r="4.2" fill={color} />
      <text x={lado === 'izq' ? -16 : 16} y="-14" textAnchor={lado === 'izq' ? 'end' : 'start'} fontSize="14" fontWeight="800" fill="#fff"
        style={{ paintOrder: 'stroke', stroke: color, strokeWidth: 4, strokeLinejoin: 'round' }}>{nombre}</text>
    </g>
  )
}

function MapaGuanajuato() {
  const { ancho, alto, leon, silao } = MAPA_GTO
  return (
    <div className="nos-mapa" role="img" aria-label="Mapa del estado de Guanajuato con León y Silao señalados">
      <span aria-hidden className="nos-mapa-gto">GUANAJUATO</span>
      <svg viewBox={`0 0 ${ancho} ${alto}`} aria-hidden focusable="false">
        <path d={MAPA_GTO.municipios} fill="#f4f2ee" stroke="#9aa3b2" strokeWidth="1" strokeLinejoin="round" />
        <path d={MAPA_GTO.leonPath} fill="#0f2747" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
        <path d={MAPA_GTO.silaoPath} fill="#C8102E" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
        <Pin x={leon[0]} y={leon[1]} color="#0f2747" nombre="León" lado="izq" />
        <Pin x={silao[0]} y={silao[1] + 6} color="#C8102E" nombre="Silao" lado="der" />
      </svg>
    </div>
  )
}

export function PorQueNosotros() {
  return (
    <section className="nos-sec nos-claro" aria-labelledby="nos-por-t" data-seccion="nos-por-que">
      <div className="nos-wrap nos-por-grid">
        <div>
          <p className="nos-eyebrow nos-eyebrow-gris">¿Por qué nosotros?</p>
          <h2 id="nos-por-t" className="nos-h2">La diferencia está <em>en los detalles</em></h2>
          <p className="nos-p">Más que una inmobiliaria, somos un equipo comprometido con brindarte seguridad, conocimiento y acompañamiento en cada paso.</p>
          <ul className="nos-razones">
            {RAZONES.map(({ Icono, t, d }) => (
              <li key={t} className="nos-razon"><span className="nos-icono"><Icono aria-hidden size={26} /></span><div><strong>{t}</strong><span>{d}</span></div></li>
            ))}
          </ul>
        </div>

        <div className="nos-cobertura" data-seccion="nos-cobertura">
          <div className="nos-cob-cab">
            <div>
              <p className="nos-eyebrow nos-eyebrow-gris">Nuestra área de cobertura</p>
              <h3 className="nos-h2">Donde encuentras <em>oportunidades</em></h3>
              <p className="nos-p">Con presencia estratégica en las principales zonas residenciales, industriales y comerciales de la región.</p>
            </div>
            <MapaGuanajuato />
          </div>
          <ul className="nos-ciudades">
            <li className="nos-ciudad">
              <Foto n="leon" alt="Arco de la Calzada de los Héroes, en León, Guanajuato" ancho={1200} alto={800} />
              <div className="nos-ciudad-pie"><MapPin aria-hidden size={22} /><div><strong>León, Guanajuato</strong><span>Residencial, Industrial, Comercial</span></div>
                <Link href="/propiedades" className="nos-flecha" aria-label="Ver propiedades en León"><ArrowRight aria-hidden size={18} /></Link></div>
            </li>
            <li className="nos-ciudad">
              <Foto n="silao" alt="Avenida y torres de oficinas del Puerto Interior, en Silao, Guanajuato" ancho={1200} alto={878} />
              <div className="nos-ciudad-pie"><MapPin aria-hidden size={22} /><div><strong>Silao, Guanajuato</strong><span>Parques Industriales, Logística</span></div>
                <Link href="/propiedades" className="nos-flecha nos-flecha-roja" aria-label="Ver propiedades en Silao"><ArrowRight aria-hidden size={18} /></Link></div>
            </li>
          </ul>
          <p className="nos-credito">
            Fotos: León, ProtoplasmaKid (Arco de la Calzada), <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a> (Wikimedia Commons); Silao, Juan Carlos Fonseca Mata, CC BY-SA 4.0 (Wikimedia Commons). Mapa: INEGI.
          </p>
          <div className="nos-contacto">
            <div className="nos-contacto-tel">
              <span className="nos-icono"><Phone aria-hidden size={24} /></span>
              <div><strong>{NEGOCIO.telefonoVisible}</strong><small>Atención {HORARIO_TEXTO}</small></div>
            </div>
            <a href={enlaceWhatsApp('Hola, me gustaría agendar una asesoría.')} target="_blank" rel="noopener noreferrer" className="nos-contacto-cita">
              <span className="nos-icono"><CalendarDays aria-hidden size={22} /></span>Estamos listos<br />para asesorarte
              <span aria-hidden className="nos-flecha-gris"><ArrowRight size={18} /></span><span className="nos-solo-lectores"> (se abre en una pestaña nueva)</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

/* 5 · Grupo P-ONCE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
// Destinos como en gp-once.com (sitio del grupo): cada empresa lleva a su página; ANDAX, por decisión del propietario, al WhatsApp de VIVE BIEN. INTEN ya no figura.
const EMPRESAS: { nombre: string; sector: string; desc: string; Icono: LucideIcon; logo: { src: string; w: number; h: number }; href: string; tono: '' | 'azul' | 'morado'; externo: boolean }[] = [
  { nombre: 'VIVE BIEN', sector: 'Bienes raíces', desc: 'Tu nuevo hogar comienza aquí. Compra, venta y renta de propiedades en León.', Icono: Home, logo: { src: '/logo_transparent.png', w: 475, h: 316 }, href: '/', tono: '', externo: false },
  { nombre: 'PROIN', sector: 'Desarrollo inmobiliario', desc: 'Creamos espacios con visión de futuro. Desarrollo y gestión de proyectos inmobiliarios.', Icono: Building2, logo: { src: '/nosotros/logos/proin.webp', w: 404, h: 312 }, href: 'https://proindesarrolladores.com/', tono: 'azul', externo: true },
  { nombre: 'ANDAX', sector: 'Construcción', desc: 'Seguridad y altura para tus obras. Renta de andamiaje y equipo de construcción.', Icono: Wrench, logo: { src: '/nosotros/logos/andax.webp', w: 750, h: 308 }, href: enlaceWhatsApp('Hola, me interesa información sobre ANDAX'), tono: '', externo: true },
  { nombre: 'VELARE', sector: 'Diseño de interiores', desc: 'Elegancia en cada detalle. Cortinas y persianas premium para hogar y empresa.', Icono: Layers, logo: { src: '/nosotros/logos/velare.webp', w: 454, h: 116 }, href: 'https://velare-nu.vercel.app', tono: 'azul', externo: true },
  { nombre: 'OTLI.IA', sector: 'Soluciones con IA', desc: 'Automatización, agentes inteligentes y soluciones de IA para empresas.', Icono: Network, logo: { src: '/nosotros/logos/otli.webp', w: 400, h: 400 }, href: 'https://otli-ia.com', tono: 'morado', externo: true },
]

export function FamiliaNosotros() {
  return (
    <section className="nos-sec nos-familia" aria-labelledby="nos-fam-t" data-seccion="nos-familia">
      <div aria-hidden className="nos-familia-fondo"><Foto n="integridad" ancho={1200} alto={900} /></div>
      <div className="nos-wrap">
        <p className="nos-eyebrow">Nuestra familia empresarial</p>
        <h2 id="nos-fam-t" className="nos-h2-grupo">GRUPO <em>P-ONCE</em></h2>
        <p className="nos-p">Un grupo empresarial con presencia en múltiples sectores, generando valor y desarrollo en León, Guanajuato.</p>
        <ul className="nos-empresas">
          {EMPRESAS.map(({ nombre, sector, desc, Icono, logo, href, tono, externo }) => (
            <li key={nombre} className={`nos-empresa ${tono ? `nos-empresa-${tono}` : ''}`}>
              <a className="nos-tarjeta" href={href} target={externo ? '_blank' : undefined} rel={externo ? 'noopener noreferrer' : undefined} data-empresa={nombre.toLowerCase()}>
                <span className={`nos-tarjeta-panel ${nombre === 'OTLI.IA' ? 'nos-tarjeta-panel-redondo' : ''}`}><img src={logo.src} alt="" width={logo.w} height={logo.h} loading="lazy" decoding="async" /></span>
                <span className="nos-tarjeta-icono"><Icono aria-hidden size={28} /></span>
                <h3>{nombre}</h3><small>{sector}</small><span aria-hidden className="nos-linea" /><p>{desc}</p>
                <span className="nos-tarjeta-mas"><i aria-hidden><ChevronRight size={18} /></i>Conoce más{externo && <span className="nos-solo-lectores"> (se abre en una pestaña nueva)</span>}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="nos-sello">
          <div className="nos-sello-fila">
            <a className="nos-sello-logo" href="https://gp-once.com/" target="_blank" rel="noopener noreferrer" aria-label="Grupo P-ONCE (se abre en una pestaña nueva)" data-enlace="grupo-p-once">
              {/* Logotipo NUEVO de Grupo P-ONCE (símbolo «11P»; carpeta `logop11` del propietario). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/nosotros/logos/gp-once-simbolo.png" alt="Grupo P-ONCE" width={526} height={442} style={{ width: 62, height: 52, objectFit: 'contain' }} />
            </a>
          </div>
          <span className="nos-sello-nombre">Grupo P-ONCE</span>
        </div>
      </div>
    </section>
  )
}

/* 6 · Cierre ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const GARANTIAS: { Icono: LucideIcon; t: string; d: string }[] = [
  { Icono: Handshake, t: 'Asesoría personalizada', d: 'Te acompañamos en todo el proceso.' },
  { Icono: BadgeCheck, t: 'Procesos seguros', d: 'Compra con tranquilidad.' },
  { Icono: Users, t: 'Atención directa', d: 'Nuestro equipo está para ti.' },
]

export function CierreNosotros() {
  return (
    <section className="nos-cta" aria-labelledby="nos-cta-t" data-seccion="nos-cta">
      <div aria-hidden className="nos-cta-foto"><Foto n="cta" ancho={1400} alto={788} /></div>
      <div className="nos-wrap">
        <div style={{ maxWidth: 640 }}>
          <p className="nos-eyebrow">Tu próxima propiedad</p>
          <h2 id="nos-cta-t" className="nos-h2">¿Listo para encontrar <em>tu propiedad ideal?</em></h2>
          <p className="nos-p">Nuestro equipo está listo para asesorarte sin compromiso. Cuéntanos qué buscas y te ayudamos a encontrarlo.</p>
          <div className="nos-cta-bots">
            <Link href="/propiedades" className="nos-boton nos-boton-rojo"><Search aria-hidden size={19} /> Ver catálogo <ArrowRight aria-hidden size={18} /></Link>
            <a href={enlaceWhatsApp('Hola, me gustaría recibir asesoría sobre propiedades en León.')} target="_blank" rel="noopener noreferrer" className="nos-boton nos-boton-verde"><MessageCircle aria-hidden size={19} /> WhatsApp directo <ArrowRight aria-hidden size={18} /><span className="nos-solo-lectores"> (se abre en una pestaña nueva)</span></a>
            <a href={enlaceTelefono()} className="nos-boton nos-boton-vidrio"><Phone aria-hidden size={19} /> Llamar ahora <ArrowRight aria-hidden size={18} /></a>
          </div>
          <ul className="nos-garantias">
            {GARANTIAS.map(({ Icono, t, d }) => (
              <li key={t}><span className="nos-icono"><Icono aria-hidden size={22} /></span><div><strong>{t}</strong><span>{d}</span></div></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
