'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { obtenerComparar, alCambiarComparar, limpiarComparar, alternarComparar, MAXIMO_COMPARAR } from '@/lib/comparador'

/**
 * Barra flotante de comparación.
 *
 * Sólo aparece cuando hay algo que comparar. Una barra permanentemente vacía
 * ocupa el sitio donde va el botón de WhatsApp en móvil, que es el que de
 * verdad convierte.
 *
 * Con **una sola** propiedad no ofrece comparar —no se compara una cosa
 * consigo misma—: dice cuántas faltan. Un botón que lleva a una pantalla
 * inútil enseña que el sitio no piensa.
 */
export default function BarraComparar() {
  const [ids, setIds] = useState<string[]>([])
  const [montado, setMontado] = useState(false)

  useEffect(() => {
    // Se lee después de montar: en el servidor no hay localStorage, y leerlo
    // durante el render daría una interfaz distinta a la del cliente.
    setIds(obtenerComparar())
    setMontado(true)
    return alCambiarComparar(setIds)
  }, [])

  if (!montado || ids.length === 0) return null

  const listo = ids.length >= 2

  return (
    <div role="region" aria-label="Propiedades a comparar" style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      bottom: 'max(1rem, env(safe-area-inset-bottom))',
      zIndex: 2000, width: 'min(680px, calc(100vw - 2rem))',
      background: 'var(--negro, #0B0B0C)', color: '#fff',
      borderRadius: 14, padding: '.85rem 1rem',
      boxShadow: '0 10px 40px rgba(11,11,12,.35)',
      display: 'flex', alignItems: 'center', gap: '.9rem', flexWrap: 'wrap',
    }}>
      <span className="etiqueta" style={{ color: 'rgba(255,255,255,.6)', fontSize: '.64rem' }}>
        Comparar
      </span>

      <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 120 }}>
        {Array.from({ length: MAXIMO_COMPARAR }).map((_, i) => {
          const id = ids[i]
          return (
            <span key={i} title={id ?? 'vacío'} style={{
              width: 30, height: 30, borderRadius: 7, flexShrink: 0,
              display: 'grid', placeItems: 'center', fontSize: '.7rem', fontWeight: 800,
              background: id ? 'var(--rojo-marca, #C8102E)' : 'rgba(255,255,255,.08)',
              border: id ? 'none' : '1px dashed rgba(255,255,255,.22)',
              color: id ? '#fff' : 'rgba(255,255,255,.3)',
              cursor: id ? 'pointer' : 'default',
            }}
              onClick={() => id && alternarComparar(id)}>
              {id ? '×' : i + 1}
            </span>
          )
        })}
      </div>

      {!listo && (
        <span style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.62)' }}>
          Elige una más para comparar
        </span>
      )}

      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
        <button onClick={limpiarComparar} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,.55)',
          fontSize: '.8rem', cursor: 'pointer', textDecoration: 'underline', padding: 0,
        }}>
          Vaciar
        </button>

        {listo && (
          <Link href={`/comparar?ids=${ids.join(',')}`} style={{
            background: 'var(--rojo-marca, #C8102E)', color: '#fff',
            padding: '.6rem 1.2rem', borderRadius: 9, fontWeight: 700,
            fontSize: '.86rem', textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            Comparar {ids.length}
          </Link>
        )}
      </div>
    </div>
  )
}
