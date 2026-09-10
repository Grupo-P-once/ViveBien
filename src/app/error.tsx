'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { CORREO_CONTACTO } from '@/lib/contacto'

/**
 * Pantalla de error.
 *
 * No existía. Un fallo no controlado en cualquier página enseñaba la pantalla
 * genérica de Next —en producción, un «Application error» sobre fondo blanco,
 * sin cabecera, sin salida y sin marca—. El visitante no sabe si se rompió el
 * sitio, si perdió la sesión o si se equivocó él.
 *
 * Tres decisiones:
 *
 *  1. **No se enseña el error técnico.** El mensaje de una excepción puede
 *     llevar dentro nombres de tabla, rutas de archivo o fragmentos de una
 *     consulta. Se registra en consola, que es donde sirve.
 *  2. **Se da el `digest`.** Next lo genera para cada error de servidor; es un
 *     identificador sin datos dentro. Si alguien nos escribe con ese código,
 *     podemos encontrar su fallo exacto en los registros.
 *  3. **Siempre hay salida.** Reintentar, la portada, el catálogo y un correo.
 *     Una pantalla de error sin salida convierte un fallo en un abandono.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[error]', error)
  }, [error])

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--hueso, #F1EFEC)',
      display: 'grid', placeItems: 'center', padding: '3rem 1.5rem',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <p className="etiqueta" style={{ color: 'var(--rojo-marca, #C8102E)', marginBottom: '1rem' }}>
          Algo se rompió
        </p>

        <h1 style={{
          fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
          fontSize: 'clamp(1.4rem, 4vw, 2rem)', color: 'var(--azul, #1B365D)',
          lineHeight: 1.2, margin: '0 0 1rem',
        }}>
          No pudimos cargar esta página
        </h1>

        <p style={{ color: '#5A6472', fontSize: '1rem', lineHeight: 1.7, margin: '0 0 2rem' }}>
          Es un problema nuestro, no tuyo. Puedes intentarlo otra vez —muchas
          veces basta— o volver al catálogo mientras lo revisamos.
        </p>

        <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={reset} style={{
            background: 'var(--rojo-marca, #C8102E)', color: '#fff', border: 'none',
            padding: '.9rem 1.9rem', borderRadius: 10, fontWeight: 700,
            fontFamily: 'Montserrat, sans-serif', fontSize: '.95rem', cursor: 'pointer',
          }}>
            Intentar de nuevo
          </button>

          <Link href="/propiedades" style={{
            background: '#fff', color: 'var(--azul, #1B365D)',
            border: '1px solid rgba(11,11,12,.14)',
            padding: '.9rem 1.9rem', borderRadius: 10, fontWeight: 700,
            fontFamily: 'Montserrat, sans-serif', fontSize: '.95rem', textDecoration: 'none',
          }}>
            Ver propiedades
          </Link>
        </div>

        {/* El digest no lleva datos dentro: es la forma de encontrar este fallo
            concreto en los registros si alguien nos escribe. */}
        {error.digest && (
          <p style={{ marginTop: '2.25rem', fontSize: '.8rem', color: '#8B95A3', lineHeight: 1.6 }}>
            Si vuelve a pasar, escríbenos a{' '}
            <a href={`mailto:${CORREO_CONTACTO}`} style={{ color: 'var(--azul, #1B365D)' }}>
              {CORREO_CONTACTO}
            </a>{' '}
            con este código:
            <br />
            <code style={{
              display: 'inline-block', marginTop: '.4rem', padding: '.25rem .6rem',
              background: '#fff', border: '1px solid rgba(11,11,12,.12)',
              borderRadius: 6, fontFamily: 'ui-monospace, monospace', fontSize: '.78rem',
            }}>
              {error.digest}
            </code>
          </p>
        )}
      </div>
    </main>
  )
}
