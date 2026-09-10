'use client'

/**
 * La tarjeta tal como la verá quien busque.
 *
 * Nuestro paso «Revisar» enseñaba una lista de campos: un resumen de lo que
 * escribiste. Inmuebles24 enseña **la tarjeta real del listado**, y esa es la
 * diferencia — el publicador no necesita comprobar que rellenó los campos
 * (para eso está la barra de completitud), necesita ver **si su anuncio se ve
 * bien al lado de los demás**.
 *
 * Es donde uno se da cuenta de que la foto de portada está oscura, de que el
 * título se corta a mitad, o de que puso el precio de renta en el campo de
 * venta. Ninguna de esas tres cosas se ve en una lista de campos.
 */

type Props = {
  titulo?: string
  descripcion?: string
  precio?: number | string
  mantenimiento?: number | string
  operacion?: string
  tipo?: string
  colonia?: string
  ciudad?: string
  ubicacion?: string
  metros?: number | string
  m_terreno?: number | string
  recamaras?: number | string
  banos?: number | string
  estacionamientos?: number | string
  fotos?: string[]
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

const pesos = (n: number) => `$${n.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

export default function VistaPreviaAnuncio(p: Props) {
  const precio = num(p.precio)
  const mant = num(p.mantenimiento)
  const metros = num(p.metros) ?? num(p.m_terreno)
  const rec = num(p.recamaras)
  const ban = num(p.banos)
  const est = num(p.estacionamientos)
  const foto = p.fotos?.[0]

  const lugar = [p.colonia, p.ciudad].filter(Boolean).join(', ') || p.ubicacion || null

  // Lo que falta se enseña como falta, no se esconde. Un hueco visible en la
  // vista previa dice más que cualquier aviso: así se va a ver de verdad.
  const Hueco = ({ children }: { children: React.ReactNode }) => (
    <span style={{
      color: '#B45309', background: 'var(--aviso-fondo-calido)',
      padding: '1px 7px', borderRadius: 5, fontSize: '.8rem', fontWeight: 600,
    }}>
      {children}
    </span>
  )

  return (
    <div>
      <p style={{ fontSize: '.85rem', color: '#5A6472', marginBottom: '.85rem', lineHeight: 1.55 }}>
        <strong>Así se verá tu anuncio</strong> en el listado, al lado de los demás.
      </p>

      <article style={{
        border: '1px solid var(--borde-frio)', borderRadius: 12, overflow: 'hidden',
        background: '#fff', maxWidth: 380,
        boxShadow: '0 4px 16px rgba(11,11,12,.07)',
      }}>
        {/* Portada */}
        <div style={{
          position: 'relative', aspectRatio: '4/3',
          background: 'var(--hueso-hundido, #E7E4DF)',
          display: 'grid', placeItems: 'center',
        }}>
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ color: '#9C948A', fontSize: '.84rem', textAlign: 'center', padding: '0 1rem', lineHeight: 1.6 }}>
              Sin foto de portada.<br />
              <span style={{ fontSize: '.78rem' }}>La primera que subas irá aquí.</span>
            </span>
          )}

          {p.operacion && (
            <span style={{
              position: 'absolute', top: 10, left: 10,
              background: 'var(--rojo-marca, #C8102E)', color: '#fff',
              padding: '3px 10px', borderRadius: 5,
              fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}>
              {p.operacion === 'renta' ? 'Renta' : p.operacion === 'temporada' ? 'Temporada' : 'Venta'}
            </span>
          )}
        </div>

        <div style={{ padding: '.95rem 1.1rem 1.2rem' }}>
          {/* Precio: lo primero que mira nadie */}
          <p style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
            fontSize: '1.25rem', color: 'var(--azul)', margin: 0, lineHeight: 1.2,
          }}>
            {precio
              ? <>{pesos(precio)}{p.operacion === 'renta' && <span style={{ fontSize: '.8rem', fontWeight: 600, color: '#5A6472' }}> / mes</span>}</>
              : <Hueco>Falta el precio</Hueco>}
          </p>
          {mant && (
            <p style={{ fontSize: '.78rem', color: '#8B95A3', margin: '2px 0 0' }}>
              + {pesos(mant)} de mantenimiento
            </p>
          )}

          {/* Título */}
          <h3 style={{
            fontSize: '.97rem', fontWeight: 700, color: '#1F2024',
            margin: '.55rem 0 .2rem', lineHeight: 1.35,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {p.titulo?.trim() || <Hueco>Falta el título</Hueco>}
          </h3>

          <p style={{ fontSize: '.82rem', color: '#8B95A3', margin: 0 }}>
            {lugar ?? <Hueco>Falta la ubicación</Hueco>}
          </p>

          {/* Ficha rápida */}
          {(metros || rec || ban || est) && (
            <p style={{
              fontSize: '.79rem', color: '#5A6472', margin: '.6rem 0 0',
              paddingTop: '.6rem', borderTop: '1px solid var(--linea-oscura, rgba(11,11,12,.12))',
            }}>
              {[
                metros ? `${metros.toLocaleString('es-MX')} m²` : null,
                rec ? `${rec} rec` : null,
                ban ? `${ban} ${ban === 1 ? 'baño' : 'baños'}` : null,
                est ? `${est} est` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}

          {p.descripcion?.trim() && (
            <p style={{
              fontSize: '.8rem', color: '#5A6472', margin: '.6rem 0 0', lineHeight: 1.55,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {p.descripcion}
            </p>
          )}
        </div>
      </article>
    </div>
  )
}
