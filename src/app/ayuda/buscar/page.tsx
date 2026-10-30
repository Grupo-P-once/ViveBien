import Link from 'next/link'
import { paginaSeo } from '@/lib/seo'
import { enlaceWhatsApp } from '@/lib/config/negocio'
import { arbolPublico, buscar, conCategoria } from '@/lib/ayuda/consultas'
import { consultaBuscable, normalizarConsulta, rutaDelArticulo } from '@/lib/ayuda/modelo'
import { AvisoDesactualizado, Buscador, Migas, NoEncontraste, TarjetaDeArticulo } from '@/components/ayuda/Piezas'
import BarraLateralAyuda from '@/components/ayuda/BarraLateral'

/**
 * `/ayuda/buscar?q=` — los resultados.
 *
 * **No se indexa.** Una página de resultados por cada cosa que alguien
 * teclee sería basura en un buscador, y además dejaría rastro público de lo
 * que la gente pregunta.
 *
 * Que no haya resultados no es un callejón sin salida: se ofrecen las
 * categorías y el contacto. Alguien que busca ayuda porque algo no le
 * funciona es la peor persona a la que enseñarle una página vacía.
 */

export const dynamic = 'force-dynamic'

export const metadata = paginaSeo({
  ruta: '/ayuda/buscar',
  titulo: 'Buscar en el Centro de Ayuda | Vive Bien',
  descripcion: 'Busca respuestas en el Centro de Ayuda de VIVE BIEN.',
  noIndexar: true,
})

type Props = { searchParams: Promise<{ q?: string }> }

export default async function Buscar({ searchParams }: Props) {
  const { q } = await searchParams
  const consulta = normalizarConsulta(q ?? '')
  const buscable = consultaBuscable(consulta)
  const [{ datos, desactualizado }, arbol] = await Promise.all([
    buscable ? buscar(consulta) : Promise.resolve({ datos: [], desactualizado: false }),
    arbolPublico(),
  ])

  return (
    <div className="ayuda-contenedor ayuda-con-barra">
      {/* Aquí la barra gana el doble: quien no encontró nada buscando tiene
          delante, sin volver atrás, todo lo que sí existe. */}
      <BarraLateralAyuda arbol={arbol.datos} />

      <div className="min-w-0">
      <Migas partes={[{ nombre: 'Buscar' }]} />

      <h1 className="font-[family-name:var(--font-frase,'Playfair_Display',serif)] text-[clamp(1.8rem,4vw,2.3rem)] leading-tight text-[#15181C]">
        {buscable ? <>Resultados para «{consulta}»</> : 'Buscar en el Centro de Ayuda'}
      </h1>

      <div className="mt-6">
        <Buscador inicial={consulta} autoFoco={!buscable} />
      </div>

      <div className="mt-10">
        {desactualizado && <AvisoDesactualizado />}

        {!buscable && (
          <p className="text-[0.98rem] text-[#5A626B]">
            Escribe al menos dos letras. También puedes{' '}
            <Link href="/ayuda" className="underline" style={{ color: 'var(--rojo-marca)' }}>
              explorar por categoría
            </Link>.
          </p>
        )}

        {buscable && datos.length > 0 && (
          <>
            <p className="mb-5 text-[0.9rem] text-[#5A626B]">
              {datos.length === 1 ? '1 artículo' : `${datos.length} artículos`}
            </p>
            <div className="grid gap-4">
              {datos.map(conCategoria).map((a) => {
                const href = a.categoria_slug ? rutaDelArticulo(a.categoria_slug, a.slug) : null
                return href ? (
                  <TarjetaDeArticulo key={`${a.categoria_slug}/${a.slug}`} href={href} titulo={a.titulo} resumen={a.resumen} estado={a.estado_producto} />
                ) : null
              })}
            </div>
          </>
        )}

        {buscable && datos.length === 0 && !desactualizado && (
          <div className="rounded-2xl bg-[#F3F0EA] px-6 py-7">
            <p className="font-heading text-[1.1rem] font-semibold text-[#15181C]">
              No encontramos nada para «{consulta}»
            </p>
            <p className="mt-2 text-[0.95rem] text-[#5A626B]">
              Prueba con otras palabras,{' '}
              <Link href="/ayuda" className="underline" style={{ color: 'var(--rojo-marca)' }}>
                explora por categoría
              </Link>{' '}
              o escríbenos: si nadie ha escrito todavía esa respuesta, preferimos que nos lo digas.
            </p>
          </div>
        )}
      </div>

      <NoEncontraste whatsapp={enlaceWhatsApp(consulta ? `Hola, busqué «${consulta}» en la ayuda y no encontré lo que necesitaba.` : 'Hola, tengo una duda sobre VIVE BIEN.')} />
      </div>
    </div>
  )
}
