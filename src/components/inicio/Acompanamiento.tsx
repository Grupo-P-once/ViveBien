'use client'
import Link from 'next/link'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { enlaceWhatsApp } from '@/lib/config/negocio'

/**
 * «Permítenos guiarte»: cómo acompaña VIVE BIEN según lo que busca la persona. Sustituye la rejilla de tres tarjetas genéricas.
 *
 * Todo lo que dice ya lo dice el sitio en otro sitio (el acompañamiento «desde la primera búsqueda hasta la firma» y la orientación sobre
 * zonas con retorno estaban en la sección anterior; el catálogo y sus filtros existen). No promete plazos, resultados, porcentajes ni
 * garantías, y no repite el propósito ni los valores (que viven en «Nuestro propósito»).
 *
 * Los enlaces usan las claves que el catálogo ya entiende: `op=venta|renta` y `tipo=terreno|nave|…`.
 */
const CAMINOS = [
  {
    n: '01',
    titulo: 'Si compras',
    texto: 'Explora casas, departamentos, terrenos, locales, oficinas y naves en venta y resuelve tus dudas con un asesor antes de dar el siguiente paso.',
    enlace: { href: '/propiedades?op=venta', etiqueta: 'Ver propiedades en venta' },
  },
  {
    n: '02',
    titulo: 'Si rentas',
    texto: 'Encuentra espacios para vivir o para operar —casas, departamentos, oficinas, locales y naves— con atención directa de nuestro equipo.',
    enlace: { href: '/propiedades?op=renta', etiqueta: 'Ver propiedades en renta' },
  },
  {
    n: '03',
    titulo: 'Si buscas invertir',
    texto: 'Terrenos, naves y locales en León y el Bajío: te orientamos sobre las zonas con mayor retorno de inversión.',
    enlace: { href: '/propiedades?tipo=terreno', etiqueta: 'Ver terrenos' },
  },
] as const

export default function Acompanamiento({ onAsesoria }: { onAsesoria: () => void }) {
  return (
    <section className="ini-guia" aria-labelledby="guia-titulo" data-seccion="acompanamiento">
      <div className="ini-guia-grid">
        <div className="ini-guia-intro">
          <p className="ini-eyebrow"><span aria-hidden className="ini-eyebrow-linea" />Cómo te acompañamos</p>
          <h2 id="guia-titulo" className="ini-guia-titulo">Permítenos guiarte, <em>sea cual sea tu siguiente paso.</em></h2>
          <p className="ini-parrafo">
            Un asesor de VIVE BIEN te acompaña desde la primera búsqueda hasta la firma, sin intermediarios innecesarios y con la información clara en cada etapa.
          </p>
          <div className="ini-guia-acciones">
            <a className="ini-boton ini-boton-primario" href={enlaceWhatsApp('Hola, me gustaría hablar con un asesor de Vive Bien')} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden size={18} /> Hablar con un asesor
            </a>
            <button type="button" className="ini-boton ini-boton-secundario" onClick={onAsesoria}>Pedir asesoría gratis</button>
          </div>
        </div>

        <ol className="ini-caminos">
          {CAMINOS.map(c => (
            <li key={c.n}>
              <span className="ini-camino-n" aria-hidden>{c.n}</span>
              <div>
                <h3>{c.titulo}</h3>
                <p>{c.texto}</p>
                <Link href={c.enlace.href} className="ini-camino-enlace">{c.enlace.etiqueta} <ArrowRight aria-hidden size={16} /></Link>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
