'use client'

import { useState } from 'react'
import { parsearDescripcion, trozosDeLinea } from '@/lib/descripcion'

/**
 * «Sobre esta propiedad»: la descripción con el formato que escribió quien publica (párrafos, saltos de línea, subtítulos, viñetas y negritas), pintada
 * con aire y jerarquía en vez de un solo bloque amontonado. Todo son elementos de React: ningún texto se interpreta como HTML. Estilos `.dr*` en `catalogo.css`.
 */
function Linea({ texto }: { texto: string }) {
  return <>{trozosDeLinea(texto).map((t, i) => (t.enlace
    ? <a key={i} className="dr-enlace" href={t.enlace} target="_blank" rel="noopener noreferrer nofollow ugc"><i className="fa fa-location-dot" aria-hidden="true" />{t.texto}<span className="sr-only"> (se abre en otra pestaña)</span></a>
        : t.negrita ? <strong key={i}>{t.texto}</strong> : <span key={i}>{t.texto}</span>))}</>
}

export default function DescripcionRica({ texto, className = '' }: { texto: string; className?: string }) {
  const bloques = parsearDescripcion(texto)
  const [abierto, setAbierto] = useState(false)
  if (bloques.length === 0) return null
  // Una descripción larga se recorta (todo el texto sigue en la página) con «Leer descripción completa»: la ficha no se vuelve un muro de texto.
  const larga = texto.length > 900
  const colapsada = larga && !abierto
  return (
    <>
    <div className={`dr ${className}`.trim()} data-descripcion data-colapsada={colapsada ? 'si' : 'no'}>
      {bloques.map((b, i) => {
        switch (b.tipo) {
          case 'titulo': return <h3 key={i} className="dr-titulo"><Linea texto={b.texto} /></h3>
          case 'parrafo': return (
            <p key={i} className="dr-p">
              {b.lineas.map((l, j) => <span key={j}>{j > 0 && <br />}<Linea texto={l} /></span>)}
            </p>
          )
          case 'lista': return <ul key={i} className="dr-lista">{b.items.map((x, j) => <li key={j}><Linea texto={x} /></li>)}</ul>
          case 'numerada': return <ol key={i} className="dr-lista dr-num">{b.items.map((x, j) => <li key={j}><Linea texto={x} /></li>)}</ol>
        }
      })}
    </div>
    {larga && <button type="button" className="dr-mas" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)} data-descripcion-mas>{abierto ? 'Mostrar menos' : 'Leer descripción completa'}<i className={`fa fa-chevron-${abierto ? 'up' : 'down'}`} aria-hidden="true" /></button>}
    </>
  )
}
