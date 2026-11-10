'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * Página de acción de los enlaces de correo (confirmar suscripción / darse de baja). El token viaja DESPUÉS del `#`: no llega
 * al servidor, a los registros ni al encabezado Referer, y los escáneres de correo que abren enlaces solos no ejecutan nada
 * (hace falta pulsar el botón, que es un POST).
 */
type Modo = 'confirmar' | 'baja'
const TEXTO = {
  confirmar: {
    titulo: 'Seguir recibiendo propiedades',
    intro: 'Pulsa el botón y te seguiremos mandando propiedades nuevas que se ajusten a lo que pediste, como máximo una cada siete días. Puedes dejar de recibirlas cuando quieras.',
    boton: 'Sí, quiero seguir recibiéndolas',
    ok: 'Listo: seguirás recibiendo propiedades. Te escribiremos sólo cuando haya propiedades que se ajusten a lo que pediste.',
    ruta: '/api/correo/confirmar',
  },
  baja: {
    titulo: 'Darte de baja',
    intro: 'Pulsa el botón para dejar de recibir recomendaciones de propiedades por correo.',
    boton: 'Darme de baja',
    ok: 'Listo: quedaste dado de baja. No te enviaremos más recomendaciones.',
    ruta: '/api/correo/baja',
  },
} as const

export default function AccionConEnlace({ modo }: { modo: Modo }) {
  const t = TEXTO[modo]
  const [token, setToken] = useState<string | null>(null)
  const [estado, setEstado] = useState<'libre' | 'enviando' | 'listo' | 'error'>('libre')
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    const leer = () => new URLSearchParams(window.location.hash.replace(/^#/, '')).get('t') ?? ''
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el fragmento (#) sólo existe en el navegador: se lee tras montar
    setToken(leer())
    // Si el fragmento cambia con la página ya abierta (se pega otro enlace del correo en la misma pestaña, o se navega
    // atrás/adelante), se vuelve a leer. Sólo cambia QUÉ token se usaría: nada se confirma ni se da de baja hasta que la
    // persona pulse el botón, y se descarta cualquier resultado o error del enlace anterior.
    const alCambiar = () => { setToken(leer()); setEstado('libre'); setMensaje('') }
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])

  async function ejecutar() {
    setEstado('enviando')
    try {
      const res = await fetch(t.ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.ok) { setEstado('listo'); return }
      setMensaje(j.error || 'No pudimos completar la acción.')
      setEstado('error')
    } catch {
      setMensaje('Se perdió la conexión. Inténtalo otra vez.')
      setEstado('error')
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: '1.6rem', margin: '0 0 .8rem' }}>{t.titulo}</h1>
      {estado === 'listo' ? (
        <p role="status" style={{ color: '#1F2937', lineHeight: 1.7 }}>{t.ok}</p>
      ) : token === null ? (
        <p style={{ color: '#6B7280' }}>Cargando…</p>
      ) : !token ? (
        <p role="alert" style={{ color: '#9B1C1C' }}>El enlace está incompleto. Ábrelo otra vez desde tu correo.</p>
      ) : (
        <>
          <p style={{ color: '#4B5563', lineHeight: 1.7 }}>{t.intro}</p>
          {estado === 'error' && <p role="alert" style={{ color: '#9B1C1C', background: '#FEF2F2', padding: '.7rem .9rem', borderRadius: 8 }}>{mensaje}</p>}
          <button type="button" onClick={ejecutar} disabled={estado === 'enviando'} style={{ marginTop: '.8rem', background: '#A30D12', color: '#fff', border: 'none', borderRadius: 10, padding: '.95rem 1.6rem', fontSize: '1rem', fontWeight: 800, fontFamily: 'Montserrat, sans-serif', cursor: 'pointer' }}>
            {estado === 'enviando' ? 'Un momento…' : t.boton}
          </button>
        </>
      )}
      <p style={{ marginTop: '2rem' }}><Link href="/propiedades" style={{ color: '#A30D12', fontWeight: 700 }}>Ver propiedades</Link></p>
    </div>
  )
}
