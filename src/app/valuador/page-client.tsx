'use client'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ValuadorFlujo from '@/components/valuador/ValuadorFlujo'
import '@/components/valuador/valuador.css'

/**
 * Valuador de VIVE BIEN (rehecho el 21-oct-2026). Estimación ORIENTATIVA de mercado por comparables del propio catálogo, en pasos, sin pedir
 * datos de contacto para ver el resultado. La lógica vive en `lib/valuador/*` y la ruta `/api/valuador`; aquí solo la página.
 */
/** `enPortal`: el mismo valuador dentro del portal del cliente (`/portal/valuador`), sin la cabecera ni el pie del sitio. */
export default function ValuadorPage({ enPortal = false }: { enPortal?: boolean }) {
  return (
    <>
      {!enPortal && <Header />}
      <main className={enPortal ? 'val val-en-portal' : 'val'} id="contenido">
        <section className="val-hero" aria-labelledby="val-h1" data-seccion="val-hero">
          <div aria-hidden className="val-hero-foto"><img src="/portadas/valuador.webp" alt="" width={1023} height={817} fetchPriority="high" decoding="async" /></div>
          <div className="val-wrap">
            <p className="val-eyebrow">Herramienta gratuita · León, Gto.</p>
            <h1 id="val-h1" className="val-h1">Valuador <em>de propiedades</em></h1>
            <p className="val-hero-p">Una estimación orientativa de mercado en tres pasos, con los comparables que la explican. Sin dejar tus datos y sin letra chica: te decimos cuánta confianza merece.</p>
          </div>
        </section>

        <div className="val-cuerpo">
          <div className="val-wrap"><ValuadorFlujo /></div>
        </div>

        <section className="val-info" aria-labelledby="val-info-t" data-seccion="val-info">
          <div className="val-wrap">
            <p className="val-eyebrow">Transparencia</p>
            <h2 id="val-info-t" className="val-h2">Cómo <em>funciona</em></h2>
            <div className="val-info-grid">
              <article className="val-tarjeta">
                <h3>Comparables, no adivinanzas</h3>
                <p>Buscamos anuncios publicados en VIVE BIEN de la misma operación y tipo de inmueble, damos más peso a los de tu colonia y a los de tamaño parecido, y calculamos un rango. Puedes ver cada comparable en el resultado.</p>
              </article>
              <article className="val-tarjeta">
                <h3>Lo que no es</h3>
                <ul>
                  <li>No es un avalúo oficial, hipotecario ni certificado.</li>
                  <li>Usa precios de oferta, no de cierre: la venta real suele quedar por debajo.</li>
                  <li>No ve el estado, los acabados ni la vista de tu inmueble.</li>
                </ul>
              </article>
              <article className="val-tarjeta">
                <h3>Cuando faltan datos, lo decimos</h3>
                <p>Si no hay comparables suficientes para un tipo de inmueble o una colonia, no mostramos una cifra: preferimos que un asesor revise tu caso antes que darte una precisión que no existe.</p>
              </article>
              <article className="val-tarjeta">
                <h3>Tus datos</h3>
                <p>Para ver la estimación no pedimos teléfono ni correo, y no guardamos tu consulta. Si después quieres que un asesor te contacte, es opcional y con tu consentimiento.</p>
              </article>
            </div>
          </div>
        </section>
      </main>
      {!enPortal && <Footer />}
    </>
  )
}
