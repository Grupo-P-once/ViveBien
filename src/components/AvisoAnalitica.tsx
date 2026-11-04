'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NEGOCIO } from '@/lib/config/negocio'
import { apagarYBorrarGa, CLAVE_ANALITICA, EVENTO_ABRIR_ANALITICA, EVENTO_CAMBIO_ANALITICA, rutaPrivada } from '@/lib/ga'

const IDS = [NEGOCIO.ga4, NEGOCIO.ga4Adicional]
type Eleccion = 'si' | 'no' | 'sin' | 'servidor'

function leer(): Eleccion {
  try { const v = localStorage.getItem(CLAVE_ANALITICA); return v === 'si' || v === 'no' ? v : 'sin' } catch { return 'sin' }
}
function suscribir(avisar: () => void) {
  window.addEventListener('storage', avisar)
  window.addEventListener(EVENTO_CAMBIO_ANALITICA, avisar)
  return () => { window.removeEventListener('storage', avisar); window.removeEventListener(EVENTO_CAMBIO_ANALITICA, avisar) }
}

/**
 * Elección sobre Google Analytics (ver `lib/ga.ts`). Sin elección guardada, GA no carga: aparece este aviso con DOS botones del mismo peso (aceptar y rechazar), sin
 * casillas marcadas de antemano. La elección se guarda en el navegador y puede cambiarse desde el pie («Preferencias de analítica»). Las áreas privadas no se miden
 * y no lo muestran. Lo que se mide y lo que no, está en el Aviso de Privacidad (sección 6).
 */
export default function AvisoAnalitica() {
  const ruta = usePathname()
  const eleccion = useSyncExternalStore<Eleccion>(suscribir, leer, () => 'servidor')
  const [reabierto, setReabierto] = useState(false)

  useEffect(() => {
    const abrir = () => setReabierto(true)
    window.addEventListener(EVENTO_ABRIR_ANALITICA, abrir)
    return () => window.removeEventListener(EVENTO_ABRIR_ANALITICA, abrir)
  }, [])

  if (eleccion === 'servidor' || rutaPrivada(ruta)) return null
  if (eleccion !== 'sin' && !reabierto) return null

  function elegir(acepta: boolean) {
    try { localStorage.setItem(CLAVE_ANALITICA, acepta ? 'si' : 'no') } catch { /* sin almacenamiento: la elección vale solo para esta visita */ }
    if (acepta) {
      (window as unknown as { vbCargarGa?: () => void }).vbCargarGa?.()
      for (const id of IDS) (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = false
    } else apagarYBorrarGa(IDS)
    setReabierto(false)
    window.dispatchEvent(new Event(EVENTO_CAMBIO_ANALITICA))
  }

  const boton = { flex: '1 1 8rem', minHeight: '44px', padding: '.6rem 1rem', borderRadius: '8px', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer' } as const

  return (
    <section
      aria-label="Preferencias de analítica"
      data-aviso-analitica
      style={{ position: 'fixed', left: '12px', right: '12px', bottom: '12px', zIndex: 9100, maxWidth: '34rem', background: 'var(--blanco)', color: 'var(--texto)', border: '1px solid #cfd6de', borderRadius: '10px', boxShadow: '0 4px 18px rgba(13,26,46,.18)', padding: '1rem 1.1rem' }}
    >
      <p style={{ fontSize: '.88rem', lineHeight: 1.55, marginBottom: '.8rem' }}>
        <strong>Medición del sitio.</strong> Con tu permiso usamos Google Analytics para saber qué páginas se visitan, qué se busca y cuántos clics hay en contacto, sin tu nombre, teléfono ni correo. Si no lo aceptas, no se activa y el sitio funciona igual. Puedes cambiar tu elección en el pie de la página. Más información en el{' '}
        <Link href="/privacidad#analitica" style={{ color: 'var(--azul)', textDecoration: 'underline' }}>Aviso de privacidad</Link>.
      </p>
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => elegir(true)} style={{ ...boton, background: 'var(--rojo)', color: 'var(--blanco)', border: '2px solid var(--rojo)' }}>Aceptar</button>
        <button type="button" onClick={() => elegir(false)} style={{ ...boton, background: 'var(--blanco)', color: 'var(--rojo)', border: '2px solid var(--rojo)' }}>Rechazar</button>
      </div>
    </section>
  )
}
