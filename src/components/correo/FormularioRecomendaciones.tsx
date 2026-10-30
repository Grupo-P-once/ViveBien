'use client'
import { useState } from 'react'
import { TEXTO_CONSENTIMIENTO_MARKETING } from '@/lib/correo/config'
import { TIPOS_RECOMENDACION } from '@/lib/correo/constantes'

/**
 * Formulario público para recibir propiedades por correo (D-80). Sin casilla ni «confirma tu correo»: lo que se ve es lo que
 * pasa. El botón es el acto afirmativo y el aviso de debajo dice, en claro, qué recibirá y cómo dejarlo (así lo hacen Zillow,
 * Idealista o Habitaclia). El servidor sigue exigiendo `acepto === true`, que sólo manda este botón. Lo primero que llega es
 * un correo con propiedades reales; ese mismo correo trae el «sí, quiero seguir recibiéndolas». Admite valores iniciales
 * (desde la ficha o el catálogo) para no volver a pedir lo que la persona ya eligió.
 */

const campo: React.CSSProperties = { width: '100%', padding: '.8rem .9rem', border: '1.5px solid #D9D4C9', borderRadius: 10, fontSize: '1rem', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }
const etiqueta: React.CSSProperties = { display: 'block', fontWeight: 700, fontSize: '.88rem', color: '#1A1A1A', margin: '0 0 .35rem' }

export type ValoresIniciales = { operacion?: string; tipos?: string[]; zona?: string; presupuesto?: string }

export default function FormularioRecomendaciones({ inicial = {} }: { inicial?: ValoresIniciales }) {
  const [correo, setCorreo] = useState('')
  const [nombre, setNombre] = useState('')
  const [operacion, setOperacion] = useState(inicial.operacion ?? '')
  const [tipos, setTipos] = useState<string[]>(inicial.tipos ?? [])
  const [zona, setZona] = useState(inicial.zona ?? '')
  const [presupuesto, setPresupuesto] = useState(inicial.presupuesto ?? '')
  const [estado, setEstado] = useState<'libre' | 'enviando' | 'listo'>('libre')
  const [error, setError] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setEstado('enviando')
    try {
      const res = await fetch('/api/correo/suscribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, nombre, operacion: operacion || undefined, tipos, zona, presupuesto: presupuesto || undefined, acepto: true, fuente: 'recomendaciones' }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setError(j.error || 'No pudimos registrar tu solicitud.'); setEstado('libre'); return }
      setEstado('listo')
    } catch {
      setError('Se perdió la conexión. Inténtalo otra vez.')
      setEstado('libre')
    }
  }

  if (estado === 'listo') {
    return (
      <div role="status" style={{ background: '#F3F0EA', borderRadius: 14, padding: '1.6rem 1.4rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, margin: '0 0 .6rem', fontSize: '1.2rem' }}>Listo, ya van en camino</h2>
        <p style={{ margin: 0, color: '#4B5563', lineHeight: 1.7 }}>Te enviamos al correo las primeras propiedades que se ajustan a lo que pediste. Si no las ves en unos minutos, revisa el correo no deseado. En ese mismo mensaje puedes elegir si quieres seguir recibiéndolas.</p>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} noValidate style={{ display: 'grid', gap: '1.1rem' }}>
      <div>
        <label htmlFor="rc-correo" style={etiqueta}>Correo electrónico *</label>
        <input id="rc-correo" type="email" autoComplete="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} style={campo} placeholder="tucorreo@ejemplo.com" />
      </div>
      <div>
        <label htmlFor="rc-nombre" style={etiqueta}>Nombre (opcional)</label>
        <input id="rc-nombre" type="text" autoComplete="given-name" maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} style={campo} />
      </div>
      <div>
        <label htmlFor="rc-op" style={etiqueta}>¿Compra o renta?</label>
        <select id="rc-op" value={operacion} onChange={(e) => setOperacion(e.target.value)} style={campo}>
          <option value="">Cualquiera</option>
          <option value="venta">Compra</option>
          <option value="renta">Renta</option>
        </select>
      </div>
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={etiqueta}>¿Qué tipo de propiedad? (puedes elegir varias)</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
          {TIPOS_RECOMENDACION.map(([clave, texto]) => (
            <label key={clave} style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', padding: '.5rem .8rem', border: '1.5px solid #D9D4C9', borderRadius: 999, fontSize: '.92rem', cursor: 'pointer', background: tipos.includes(clave) ? '#F3F0EA' : '#fff' }}>
              <input type="checkbox" checked={tipos.includes(clave)} onChange={() => setTipos((t) => (t.includes(clave) ? t.filter((x) => x !== clave) : [...t, clave]))} />
              {texto}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="rc-zona" style={etiqueta}>Zona o colonia (opcional)</label>
        <input id="rc-zona" type="text" maxLength={60} value={zona} onChange={(e) => setZona(e.target.value)} style={campo} placeholder="Ej. Campestre, Centro, Puerto Interior" />
      </div>
      <div>
        <label htmlFor="rc-pres" style={etiqueta}>Presupuesto máximo en pesos (opcional)</label>
        <input id="rc-pres" type="number" inputMode="numeric" min={0} value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} style={campo} placeholder="Ej. 3000000" />
      </div>
      {error && <p role="alert" style={{ margin: 0, color: '#9B1C1C', background: '#FEF2F2', padding: '.7rem .9rem', borderRadius: 8, fontSize: '.92rem' }}>{error}</p>}
      <button type="submit" aria-describedby="rc-aviso" disabled={estado === 'enviando'} style={{ background: '#A30D12', color: '#fff', border: 'none', borderRadius: 10, padding: '.95rem 1.2rem', fontSize: '1rem', fontWeight: 800, fontFamily: 'Montserrat, sans-serif', cursor: estado === 'enviando' ? 'wait' : 'pointer', opacity: estado === 'enviando' ? 0.7 : 1 }}>
        {estado === 'enviando' ? 'Enviando…' : 'Enviarme propiedades'}
      </button>
      <p id="rc-aviso" style={{ margin: 0, fontSize: '.84rem', color: '#6B7280', lineHeight: 1.6, textAlign: 'center' }}>
        {TEXTO_CONSENTIMIENTO_MARKETING} <a href="/privacidad" style={{ color: '#A30D12', textDecoration: 'underline', textUnderlineOffset: 2 }}>Aviso de privacidad</a>.
      </p>
    </form>
  )
}
