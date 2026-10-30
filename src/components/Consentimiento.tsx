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
      <TextoConEnlace />
    </label>
  )
}

/**
 * «Acepto el aviso de privacidad», con el enlace dentro de la frase.
 *
 * Se parte del propio `TEXTO_CONSENTIMIENTO` en vez de escribir otra frase aquí:
 * lo que se ve tiene que ser exactamente lo que queda registrado con la versión,
 * o el registro deja de demostrar qué se aceptó.
 */
function TextoConEnlace() {
  const frase = 'aviso de privacidad'
  const i = TEXTO_CONSENTIMIENTO.indexOf(frase)
  const enlace = (texto: string) => (
    <Link href="/privacidad" target="_blank"
      style={{ color: 'var(--azul, #1B365D)', textDecoration: 'underline', fontWeight: 600 }}
      onClick={e => e.stopPropagation()}>
      {texto}
    </Link>
  )

  if (i < 0) {
    return <span>{TEXTO_CONSENTIMIENTO} {enlace('Aviso de privacidad')}</span>
  }

  // «Acepto el » + enlace + «.» y el resto en letra menor: lo primero es lo que
  // hay que reconocer de un vistazo; lo segundo, el detalle.
  const fin = TEXTO_CONSENTIMIENTO.indexOf('.', i)
  const cabeza = TEXTO_CONSENTIMIENTO.slice(0, i)
  const cierre = fin >= 0 ? TEXTO_CONSENTIMIENTO.slice(i + frase.length, fin + 1) : ''
  const detalle = fin >= 0 ? TEXTO_CONSENTIMIENTO.slice(fin + 1).trim() : ''

  return (
    <span>
      <span style={{ color: 'var(--texto, #222831)', fontWeight: 600 }}>
        {cabeza}{enlace(frase)}{cierre}
      </span>
      {detalle && <span style={{ display: 'block', marginTop: '.15rem' }}>{detalle}</span>}
    </span>
  )
}

/**
 * La explicación bajo un botón desactivado por falta de consentimiento.
 *
 * Un botón gris sin motivo se lee como un sitio roto. Con una línea debajo se
 * lee como lo que es: falta un paso.
 */
export function PistaConsentimiento({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <p role="status" style={{ fontSize: '.76rem', color: '#6B7280', margin: '.35rem 0 0', textAlign: 'center' }}>
      Marca «Acepto el aviso de privacidad» para enviar.
    </p>
  )
}
