import Image from 'next/image'
import Link from 'next/link'
import { paginaSeo, grafo, migasJsonLd, jsonLdSeguro } from '@/lib/seo'
import { enlaceWhatsApp } from '@/lib/config/negocio'
import { articulosDestacados, categoriasPublicas, conCategoria } from '@/lib/ayuda/consultas'
import { rutaDeCategoria, rutaDelArticulo } from '@/lib/ayuda/modelo'
import {
  AvisoDesactualizado, Buscador, NoEncontraste, TarjetaDeArticulo, TarjetaDeCategoria,
} from '@/components/ayuda/Piezas'

/**
 * `/ayuda` — la portada del Centro (V-1.1.94, fase 3c-3).
 *
 * Componente de servidor: el contenido llega ya pintado, así que un buscador
 * lo indexa y alguien con la conexión justa lo lee igual. El buscador de
 * arriba es un `form` de verdad y funciona sin JavaScript.
 */

const FOTO = '/acceso/portada.webp'

export const revalidate = 300

export const metadata = paginaSeo({
  ruta: '/ayuda',
  imagen: '/og/ayuda.jpg',
  titulo: 'Centro de Ayuda | Vive Bien',
  descripcion:
    'Respuestas sobre propiedades, tu cuenta y los servicios de VIVE BIEN Grupo Inmobiliario en León, Guanajuato.',
})

const SUGERENCIAS = [
  { texto: '¿Cómo guardar una propiedad?', q: 'guardar propiedad' },
  { texto: '¿Cómo agendar una visita?', q: 'agendar visita' },
  { texto: '¿Cómo publicar mi propiedad?', q: 'publicar propiedad' },
]

export default async function CentroDeAyuda() {
  const [cats, destacados] = await Promise.all([categoriasPublicas(), articulosDestacados(4)])
  const desactualizado = cats.desactualizado || destacados.desactualizado

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSeguro(grafo(migasJsonLd([{ nombre: 'Centro de Ayuda' }]))) }}
      />

      {/* ── Portada ───────────────────────────────────────────────── */}
      <section className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="bg-[#F3F0EA] px-6 py-14 sm:px-10 lg:py-20 lg:pl-[8%]">
          <p className="text-[0.68rem] font-semibold tracking-[0.26em] text-[#2C3540]">CENTRO DE AYUDA</p>
          <h1 className="mt-4 font-[family-name:var(--font-frase,'Playfair_Display',serif)] text-[clamp(2.1rem,5vw,3.4rem)] leading-[1.06] tracking-[-0.015em] text-[#15181C]">
            ¿Cómo podemos <span style={{ color: 'var(--rojo-marca)' }}>ayudarte?</span>
          </h1>
          <p className="mt-3 max-w-xl text-[1.02rem] text-[#5A626B]">
            Encuentra respuestas sobre propiedades, tu cuenta y los servicios de VIVE BIEN.
          </p>

          <div className="mt-8 max-w-2xl">
            <Buscador />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <span className="text-[0.85rem] font-medium text-[#5A626B]">Sugerencias:</span>
            {SUGERENCIAS.map((s) => (
              <Link
                key={s.q}
                href={`/ayuda/buscar?q=${encodeURIComponent(s.q)}`}
                className="rounded-full border border-[#E3DED6] bg-white px-4 py-1.5 text-[0.85rem] text-[#15181C] transition-colors hover:border-[color-mix(in_srgb,var(--rojo-marca)_35%,transparent)]"
              >
                {s.texto}
              </Link>
            ))}
          </div>
        </div>

        <div className="relative isolate hidden min-h-[340px] overflow-hidden lg:block">
          <Image src={FOTO} alt="" fill sizes="45vw" className="object-cover" priority />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#F3F0EA] via-[#F3F0EA]/25 to-transparent" />
          <p className="absolute top-1/2 right-[10%] -translate-y-1/2 text-right text-[0.72rem] leading-[2.2] font-semibold tracking-[0.24em] text-[#2C3540]">
            MÁS QUE<br />PROPIEDADES,<br />MEJORES<br />HISTORIAS.
          </p>
        </div>
      </section>

      <div className="ayuda-contenedor">
        {desactualizado && <AvisoDesactualizado />}

        {/* ── Categorías ──────────────────────────────────────────── */}
        <section>
          <h2 className="font-[family-name:var(--font-frase,'Playfair_Display',serif)] text-[1.75rem] text-[#15181C]">
            Explora por categoría
          </h2>
          <p className="mt-1 text-[0.95rem] text-[#5A626B]">
            Encuentra la información que necesitas de forma rápida y sencilla.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cats.datos.map((c) => {
              const href = rutaDeCategoria(c.slug)
              return href ? (
                <TarjetaDeCategoria key={c.slug} href={href} icono={c.icono} nombre={c.nombre} descripcion={c.descripcion} />
              ) : null
            })}
          </div>

          {cats.datos.length === 0 && !desactualizado && (
            <p className="mt-6 rounded-xl bg-[#F3F0EA] px-5 py-4 text-[0.95rem] text-[#5A626B]">
              Todavía no hay categorías publicadas. Escríbenos y te ayudamos directamente.
            </p>
          )}
        </section>

        {/* ── Temas populares ─────────────────────────────────────── */}
        {destacados.datos.length > 0 && (
          <section className="mt-14">
            <h2 className="font-[family-name:var(--font-frase,'Playfair_Display',serif)] text-[1.75rem] text-[#15181C]">
              Temas populares
            </h2>
            <p className="mt-1 text-[0.95rem] text-[#5A626B]">Las preguntas más comunes de quienes nos visitan.</p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {destacados.datos.map(conCategoria).map((a) => {
                const href = a.categoria_slug ? rutaDelArticulo(a.categoria_slug, a.slug) : null
                return href ? (
                  <TarjetaDeArticulo key={a.slug} href={href} titulo={a.titulo} resumen={a.resumen} estado={a.estado_producto} />
                ) : null
              })}
            </div>
          </section>
        )}

        <NoEncontraste whatsapp={enlaceWhatsApp('Hola, tengo una duda sobre VIVE BIEN.')} />
      </div>
    </>
  )
}
