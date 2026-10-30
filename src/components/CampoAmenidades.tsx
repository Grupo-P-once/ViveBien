'use client'
import { useState } from 'react'
import { agregar, quitar, incluye, sugerenciasDe, MAXIMO_AMENIDADES } from '@/lib/amenidades'

/**
 * Amenidades como etiquetas, no como una línea de texto.
 *
 * Antes era un `<input>` que se recalculaba en cada tecla a partir de la lista:
 * al escribir la coma, el trozo vacío se descartaba y la coma **desaparecía**.
 * Sólo se podía guardar una amenidad, y no había forma de saber por qué.
 *
 * Tres decisiones:
 *
 *  · **Sugerencias por tipo.** Una nave no tiene alberca y una casa no tiene
 *    andén de carga. Ofrecer las mismas veinte a todos es ruido, y además así
 *    se escriben igual en todos los anuncios — que es lo que permitirá
 *    filtrarlas el día que haya cien propiedades.
 *  · **Se sigue pudiendo escribir libre.** Las sugerencias no son una jaula:
 *    siempre hay algo que no está en la lista.
 *  · **Enter o coma cierran la etiqueta**, y pegar un texto con comas las crea
 *    todas de golpe: copiar «alberca, jardín, cochera» de un correo es lo más
 *    natural que hay.
 */
export default function CampoAmenidades({
  valor,
  tipo,
  onChange,
  deshabilitado,
}: {
  valor: string[]
  tipo?: string | null
  onChange: (lista: string[]) => void
  deshabilitado?: boolean
}) {
  const [texto, setTexto] = useState('')
  const sugerencias = sugerenciasDe(tipo).filter((s) => !incluye(valor, s))
  const lleno = valor.length >= MAXIMO_AMENIDADES

  function añadir(entrada: string) {
    const limpio = entrada.trim()
    if (!limpio) return
    onChange(agregar(valor, limpio))
    setTexto('')
  }

  return (
    <div>
      {/* Lo elegido, arriba: es lo que va a ver quien busque la propiedad. */}
      {valor.length > 0 && (
        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', padding: 0, margin: '0 0 .6rem' }}>
          {valor.map((a) => (
            <li key={a}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--azul)', color: '#fff',
                padding: '5px 6px 5px 12px', borderRadius: 999,
                fontSize: '.82rem', fontWeight: 600,
              }}>
                {a}
                <button type="button" onClick={() => onChange(quitar(valor, a))}
                  disabled={deshabilitado}
                  aria-label={`Quitar ${a}`}
                  style={{
                    border: 'none', background: 'rgba(255,255,255,.22)', color: '#fff',
                    width: 20, height: 20, minWidth: 20, minHeight: 20, borderRadius: '50%',
                    cursor: 'pointer', fontSize: '.8rem', lineHeight: 1,
                    display: 'grid', placeItems: 'center', padding: 0,
                  }}>
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={texto}
          disabled={deshabilitado || lleno}
          onChange={(e) => {
            // Pegar un texto con comas crea todas las etiquetas de una vez.
            if (/[,;\n]/.test(e.target.value)) añadir(e.target.value)
            else setTexto(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              // Enter aquí NO debe enviar el formulario ni saltar de paso.
              e.preventDefault()
              añadir(texto)
            }
            // Retroceso con el campo vacío borra la última, como en un correo.
            if (e.key === 'Backspace' && !texto && valor.length) {
              onChange(valor.slice(0, -1))
            }
          }}
          onBlur={() => añadir(texto)}
          placeholder={lleno ? `Máximo ${MAXIMO_AMENIDADES}` : 'Escribe y pulsa Enter'}
          aria-label="Añadir amenidad"
          style={{
            flex: '1 1 200px', minWidth: 0, padding: '11px 13px',
            border: '1px solid var(--borde-frio)', borderRadius: 8,
            fontSize: '.95rem', fontFamily: 'inherit', background: '#fff',
          }}
        />
        <button type="button" onClick={() => añadir(texto)} disabled={!texto.trim() || deshabilitado}
          style={{
            padding: '10px 18px', borderRadius: 8, border: '1px solid var(--azul)',
            background: texto.trim() ? 'var(--azul)' : '#fff',
            color: texto.trim() ? '#fff' : '#8B95A3',
            fontWeight: 700, fontSize: '.85rem', cursor: texto.trim() ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}>
          Añadir
        </button>
      </div>

      {sugerencias.length > 0 && !lleno && (
        <>
          <p style={{ fontSize: '.78rem', color: '#8B95A3', margin: '.8rem 0 .4rem' }}>
            Las más buscadas para este tipo de inmueble — toca para añadir:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sugerencias.map((s) => (
              <button key={s} type="button" onClick={() => añadir(s)} disabled={deshabilitado}
                style={{
                  border: '1px dashed var(--borde-frio)', background: '#fff',
                  color: '#5A6472', padding: '6px 12px', borderRadius: 999,
                  fontSize: '.8rem', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                + {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
