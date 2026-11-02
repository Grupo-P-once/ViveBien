'use client'
import NextImage from 'next/image'
import { alFallarImagen } from '@/lib/imagen-respaldo'
import { ArrowUpRight, HardHat, MapPin, ShieldCheck, TrendingUp, Users, FileText, Handshake, Shield, type LucideIcon } from 'lucide-react'

/**
 * «¿Qué es Vive Bien?» y la sección de PROIN, siguiendo la composición de la lámina `vivebien proin.jpeg` (guía visual, NO una imagen
 * incrustada): fondo luminoso, marca y texto a un lado, fotografía arquitectónica al otro con borde que se funde, y cuatro puntos con icono.
 *
 * Recursos (todos en `public/inicio/`, ver el informe):
 *  · `vivebien-casa.webp`: imagen «Modern Home Overlooking the City» entregada por el propietario (carpeta `pg web`), recortada a su marco
 *    (1420×840); ya trae el triángulo rojo de la marca. Imagen de ambiente, no un inmueble del catálogo.
 *  · `proin-edificio.webp`: imagen del proyecto «edificio corporativo» de PROIN, tomada de su propio sitio (proindesarrolladores.com/assets/proyectos/),
 *    1400×1050, con nitidez y contraste mejorados. Es un render, no una obra terminada.
 *  · `proin-logo.png`: el logotipo REAL de PROIN (edificio en perspectiva con su reflejo y «PRO IN»), tomado de la captura de pantalla de su sitio
 *    que entregó el propietario (404×312) y pasado a fondo transparente. El primer intento (un recorte de la lámina) era un redibujo incorrecto y se
 *    descartó. Pendiente: sustituirlo por el original vectorial de PROIN (el sitio `proindesarrolladores.com` publica `assets/logo-proin.png`, 263×272).
 *  · El logotipo de VIVE BIEN es el oficial de siempre (`/logo_transparent.png`, versión principal sobre fondo claro): no se recorta de la lámina.
 */

type Punto = { Icono: LucideIcon; titulo: string; texto: string }

const PUNTOS_VIVE_BIEN: Punto[] = [
  { Icono: ShieldCheck, titulo: 'Confianza', texto: 'Operaciones seguras y claras.' },
  { Icono: Users, titulo: 'Atención personalizada', texto: 'Te acompañamos en cada paso.' },
  { Icono: FileText, titulo: 'Transparencia', texto: 'Información real y sin sorpresas.' },
  { Icono: MapPin, titulo: 'Conocimiento local', texto: 'Experiencia en León y la región.' },
]

const PUNTOS_PROIN: Punto[] = [
  { Icono: Shield, titulo: 'Calidad', texto: 'Proyectos sólidos y bien planeados.' },
  { Icono: TrendingUp, titulo: 'Crecimiento', texto: 'Espacios que generan valor.' },
  { Icono: HardHat, titulo: 'Confianza', texto: 'Desarrollo con altos estándares.' },
  { Icono: Handshake, titulo: 'Compromiso', texto: 'Con las personas y la región.' },
]

function Puntos({ puntos, etiqueta, ancho = false }: { puntos: Punto[]; etiqueta: string; ancho?: boolean }) {
  return (
    <ul className={ancho ? 'ini-puntos ini-puntos-ancho' : 'ini-puntos'} aria-label={etiqueta}>
      {puntos.map(({ Icono, titulo, texto }) => (
        <li key={titulo}>
          <Icono aria-hidden strokeWidth={1.5} size={30} />
          <strong>{titulo}</strong>
          <span>{texto}</span>
        </li>
      ))}
    </ul>
  )
}

export function QueEsViveBien() {
  return (
    <section className="ini-institucional ini-vb" aria-labelledby="que-es-titulo" data-seccion="que-es-vive-bien">
      <div className="ini-inst-grid">
        <div className="ini-inst-texto">
          <h2 id="que-es-titulo" className="ini-eyebrow"><span aria-hidden className="ini-eyebrow-linea" />¿Qué es Vive Bien?</h2>
          {/* Logotipo OFICIAL, versión principal sobre fondo claro. Sin recortar ni recolorear. */}
          <NextImage unoptimized loading="eager" src="/logo_transparent.png" alt="Vive Bien Grupo Inmobiliario" width={190} height={126} className="ini-logo-vb"
            onError={e => alFallarImagen(e.currentTarget, '/icon.png')} />
          <p className="ini-lema">Espacios para <em>vivir.</em><br />Oportunidades para <em>crecer.</em></p>
          <p className="ini-parrafo">
            En <strong>VIVE BIEN</strong> conectamos personas con propiedades que se adaptan a sus planes. Te acompañamos con atención personalizada,
            transparencia y conocimiento del mercado inmobiliario del Bajío.
          </p>
          <Puntos puntos={PUNTOS_VIVE_BIEN} etiqueta="Lo que encuentras con Vive Bien" />
        </div>
        {/* Fotografía entera (la proporción del marco es la de la foto) con acercamiento lento; imagen de ambiente, no un inmueble del catálogo. */}
        <figure className="ini-inst-foto ini-foto ini-foto-casa">
          <NextImage unoptimized src="/inicio/vivebien-casa.webp" alt="Residencia contemporánea con terraza de cristal, jardín iluminado y vista a la ciudad y las montañas al atardecer" width={1420} height={840} loading="lazy" decoding="async"
            onError={e => alFallarImagen(e.currentTarget, '/icon.png')} />
        </figure>
      </div>
    </section>
  )
}

export function SeccionProin() {
  return (
    <section className="ini-institucional ini-proin" aria-labelledby="proin-titulo" data-seccion="proin">
      <div className="ini-inst-grid ini-inst-invertida">
        <figure className="ini-inst-foto ini-foto ini-foto-edificio">
          <NextImage unoptimized src="/inicio/proin-edificio.webp" alt="Edificio corporativo de PROIN: fachada de piedra oscura, grandes ventanales y acceso con jardín" width={1400} height={1050} loading="lazy" decoding="async"
            onError={e => alFallarImagen(e.currentTarget, '/icon.png')} />
          <span aria-hidden className="ini-triangulo ini-triangulo-izquierda" />
        </figure>
        <div className="ini-inst-texto">
          <p className="ini-eyebrow"><span aria-hidden className="ini-eyebrow-linea" />Nuestro grupo desarrollador</p>
          <NextImage unoptimized loading="eager" src="/inicio/proin-logo.png" alt="PROIN Desarrolladores, proyectos inmobiliarios" width={404} height={312} className="ini-logo-proin"
            onError={e => alFallarImagen(e.currentTarget, '/inicio/proin-logo.png')} />
          <h2 id="proin-titulo" className="ini-lema ini-lema-proin">Desarrollando <em>espacios con valor.</em></h2>
          {/* La relación, dicha sin rodeos. */}
          <p className="ini-relacion"><strong>PROIN Desarrolladores es la desarrolladora de VIVE BIEN.</strong></p>
          <p className="ini-parrafo">
            En PROIN Desarrolladores impulsamos proyectos inmobiliarios que generan crecimiento, productividad y bienestar en León y la región,
            con calidad, ubicación estratégica y visión a futuro.
          </p>
          {/* Sitio propio de PROIN: se abre en pestaña nueva (sin `opener`) y el lector de pantalla lo avisa. */}
          <a className="ini-boton ini-boton-secundario ini-ver-mas" href="https://proindesarrolladores.com/" target="_blank" rel="noopener noreferrer" data-enlace="proin-sitio">
            Ver más sobre PROIN <ArrowUpRight aria-hidden size={18} /><span className="ini-solo-lectores"> (se abre en una pestaña nueva)</span>
          </a>
        </div>
        {/* Los cuatro puntos van debajo, a todo lo ancho (como en la lámina de referencia), no dentro de la columna de texto. */}
        <Puntos puntos={PUNTOS_PROIN} etiqueta="Lo que distingue a PROIN" ancho />
      </div>
    </section>
  )
}
