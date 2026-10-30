import { gruposVisibles, type PropiedadConCaracteristicas } from '@/lib/caracteristicas'

/**
 * Las características opcionales de una propiedad en la ficha pública, agrupadas y SIN campos vacíos.
 * No pinta nada si el anuncio no declaró ninguna (una ficha antigua queda igual que antes). Los datos los declara quien publica.
 * La lógica (qué aplica a qué tipo/operación, cómo se escribe cada valor) vive en lib/caracteristicas.ts; aquí sólo se pinta.
 */
export default function CaracteristicasFicha({ propiedad, omitir = [] }: { propiedad: PropiedadConCaracteristicas; /** Claves que la ficha ya enseña en otro lado (el terreno va en «Datos de la propiedad»): no se repiten. */ omitir?: readonly string[] }) {
  const grupos = gruposVisibles(propiedad)
    .map((g) => ({ ...g, items: g.items.filter((i) => !omitir.includes(i.clave)) }))
    .filter((g) => g.items.length > 0 || g.listas.length > 0)
  if (grupos.length === 0) return null
  return (
    <section data-caracteristicas-ficha aria-labelledby="titulo-caracteristicas" className="fx-card">
      <h3 id="titulo-caracteristicas" className="fx-t">
        <i className="fa fa-list-check" aria-hidden="true" />Características
      </h3>
      <div style={{ display: 'grid', gap: '1.4rem' }}>
        {grupos.map((g) => (
          <div key={g.id} data-grupo={g.id}>
            <h4 className="fx-sub">{g.titulo}</h4>
            {g.items.length > 0 && (
              <dl className="fx-datos">
                {g.items.map((i) => (
                  <div key={i.clave} className="fx-dato">
                    <dt>{i.etiqueta}</dt>
                    <dd>{i.valor}</dd>
                  </div>
                ))}
              </dl>
            )}
            {g.listas.map((l) => (
              <div key={l.clave} style={{ marginTop: g.items.length ? '.8rem' : 0 }}>
                <p style={{ margin: '0 0 .4rem', fontSize: '.82rem', color: '#4b5563' }}>{l.etiqueta}</p>
                <ul className="fx-chips">
                  {l.valores.map((v) => (
                    <li key={v}>
                      <i className="fa fa-check-circle" aria-hidden="true" style={{ color: 'var(--exito)', flexShrink: 0 }} />
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="fx-nota">Datos declarados por quien publica el anuncio; confírmalos en la visita.</p>
    </section>
  )
}
