'use client'

/**
 * Propósito y valores, la banda clara de la lámina de esencia.
 *
 * Es el contrapunto del mosaico: después de cinco bloques en negro, una banda
 * en blanco cálido con mucho aire y reglas verticales finísimas. La lámina
 * separa «Nuestro propósito» de «Nuestros valores» con una línea de un píxel,
 * no con una tarjeta ni una sombra — el aire es el que hace el trabajo.
 *
 * Los textos son los de la lámina, palabra por palabra. No es contenido que se
 * pueda reescribir aquí: es la definición de marca.
 */

const TRAZO = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const Escudo = () => (
  <svg viewBox="0 0 32 32" width="30" height="30" {...TRAZO}>
    <path d="M16 4 6 8v8c0 6.2 4.3 10.6 10 12 5.7-1.4 10-5.8 10-12V8L16 4Z" />
    <path d="m12 16 3 3 5.5-5.5" />
  </svg>
)

const Personas = () => (
  <svg viewBox="0 0 32 32" width="30" height="30" {...TRAZO}>
    <circle cx="12" cy="12" r="4" />
    <circle cx="22" cy="13.5" r="3.2" />
    <path d="M5 24c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    <path d="M20.5 18.6c3 .3 5.5 2.5 5.5 5.4" />
  </svg>
)

const Resultados = () => (
  <svg viewBox="0 0 32 32" width="30" height="30" {...TRAZO}>
    <path d="M5 26h22" />
    <path d="M9 26v-6M15 26v-11M21 26v-8" />
    <path d="m18 10 7-3-1.5 5" />
    <path d="M25 7 15 13" />
  </svg>
)

const Balanza = () => (
  <svg viewBox="0 0 32 32" width="30" height="30" {...TRAZO}>
    <path d="M16 6v20M9 26h14" />
    <path d="M6 11h20" />
    <path d="M6 11 3 19h6l-3-8ZM26 11l-3 8h6l-3-8Z" />
  </svg>
)

const Diamante = () => (
  <svg viewBox="0 0 32 32" width="30" height="30" {...TRAZO}>
    <path d="M9 6h14l5 7-12 14L4 13l5-7Z" />
    <path d="M4 13h24M12 6l-3 7 7 14M20 6l3 7-7 14" />
  </svg>
)

const VALORES = [
  { nombre: 'Confianza', Icono: Escudo },
  { nombre: 'Cercanía', Icono: Personas },
  { nombre: 'Resultados', Icono: Resultados },
  { nombre: 'Transparencia', Icono: Balanza },
  { nombre: 'Profesionalismo', Icono: Diamante },
]

export default function PropositoValores() {
  return (
    <section style={{ background: 'var(--hueso)', padding: '5rem 2rem' }}>
      <div style={{
        maxWidth: 1240, margin: '0 auto',
        display: 'grid', gap: '3rem',
        gridTemplateColumns: 'minmax(260px, 1fr) minmax(320px, 1.35fr)',
        alignItems: 'start',
      }} className="proposito-grid">

        {/* ── Propósito ── */}
        <div style={{
          display: 'grid', gap: '1.5rem',
          gridTemplateColumns: 'minmax(110px, auto) 1fr',
          alignItems: 'start',
        }} className="proposito-texto">
          <h2 className="etiqueta" style={{ color: 'var(--negro)', margin: 0, lineHeight: 1.7 }}>
            Nuestro<br />
            <strong style={{ fontWeight: 800, fontSize: '1.02rem', letterSpacing: '.06em' }}>
              Propósito
            </strong>
            <span aria-hidden style={{
              display: 'block', width: 40, height: 2,
              background: 'var(--rojo-marca)', marginTop: '.7rem',
            }} />
          </h2>

          <p style={{
            margin: 0, color: '#3A3A3E', fontSize: '.95rem', lineHeight: 1.75,
            borderLeft: '1px solid rgba(11,11,12,.14)', paddingLeft: '1.5rem',
          }}>
            Conectar personas con el espacio perfecto, brindando soluciones
            inmobiliarias confiables que generen bienestar, patrimonio y
            oportunidades.
          </p>
        </div>

        {/* ── Valores ── */}
        <div style={{
          display: 'grid', gap: '1.75rem',
          gridTemplateColumns: 'minmax(100px, auto) 1fr',
          alignItems: 'center',
        }} className="valores-bloque">
          <h2 className="etiqueta" style={{ color: 'var(--negro)', margin: 0, lineHeight: 1.7 }}>
            Nuestros<br />
            <strong style={{ fontWeight: 800, fontSize: '1.02rem', letterSpacing: '.06em' }}>
              Valores
            </strong>
            <span aria-hidden style={{
              display: 'block', width: 40, height: 2,
              background: 'var(--rojo-marca)', marginTop: '.7rem',
            }} />
          </h2>

          <ul style={{
            listStyle: 'none', margin: 0, padding: '0 0 0 1.75rem',
            borderLeft: '1px solid rgba(11,11,12,.14)',
            display: 'grid', gap: '1.5rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
          }}>
            {VALORES.map(({ nombre, Icono }) => (
              <li key={nombre} style={{ display: 'grid', justifyItems: 'center', gap: '.7rem', textAlign: 'center' }}>
                <span style={{ color: 'var(--negro)' }}><Icono /></span>
                <span className="etiqueta" style={{ color: '#4A4A4F', fontSize: '.63rem' }}>
                  {nombre}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Pie de la lámina: la firma y el lema, separados por una regla larga. */}
      <div style={{
        maxWidth: 1240, margin: '3.5rem auto 0',
        display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap',
      }}>
        <span className="titular" style={{ fontSize: '.95rem', color: 'var(--negro)', letterSpacing: '.06em' }}>
          Vive Bien
        </span>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'rgba(11,11,12,.16)', minWidth: 40 }} />
        <span className="etiqueta" style={{ color: '#4A4A4F', fontSize: '.66rem' }}>
          Tu espacio. Nuestro compromiso.
        </span>
      </div>
    </section>
  )
}
