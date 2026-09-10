'use client'
import Link from 'next/link'
import { TEXTO_CONSENTIMIENTO } from '@/lib/contacto'

/**
 * La casilla de consentimiento.
 *
 * Tres de los cinco formularios del sitio no la tenían **en absoluto**, y aun
 * así sus datos acababan compartidos con el anunciante de la propiedad.
 *
 * Bajo la LFPDPPP eso necesita consentimiento demostrable: no basta con tener
 * un aviso de privacidad publicado en algún sitio, hay que poder enseñar **qué
 * aceptó esta persona y cuándo**. Por eso la versión del texto viaja con cada
 * registro (`VERSION_CONSENTIMIENTO`), y por eso este componente enseña el
 * texto exacto en vez de un «acepto los términos» genérico.
 *
 * Sin marcar, no se envía. Y se dice por qué, no se limita a bloquear el botón:
 * un botón inerte sin explicación se lee como un fallo del sitio.
 */
export default function Consentimiento({
  marcado,
  onChange,
  id = 'consentimiento',
}: {
  marcado: boolean
  onChange: (v: boolean) => void
  id?: string
}) {
  return (
    <label htmlFor={id} style={{
      display: 'flex', gap: '.65rem', alignItems: 'flex-start',
      cursor: 'pointer', fontSize: '.8rem', lineHeight: 1.55,
      color: '#5A6472', margin: '.25rem 0 1rem',
    }}>
      <input
        id={id}
        type="checkbox"
        checked={marcado}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 2, width: 17, height: 17, flexShrink: 0, accentColor: 'var(--rojo-marca, #C8102E)', cursor: 'pointer' }}
      />
      <span>
        {TEXTO_CONSENTIMIENTO}{' '}
        <Link href="/privacidad" target="_blank"
          style={{ color: 'var(--azul, #1B365D)', textDecoration: 'underline' }}
          onClick={e => e.stopPropagation()}>
          Aviso de privacidad
        </Link>
      </span>
    </label>
  )
}
