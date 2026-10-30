'use client'

import { useEffect, useState } from 'react'
import { entrarConGoogle, recogerRegresoDeGoogle } from '@/lib/acceso/entrar-google'
import { MENSAJE_CANCELADO } from '@/lib/acceso/google'
import { urlDe } from '@/lib/sitio'

/**
 * Lo que las pantallas de entrada comparten (V-1.1.83): el botón llama a
 * `entrar`, y `AvisoEntrada` enseña lo que haya que decir. Nunca un código.
 */

export type AvisoDeEntrada = { mensaje: string; app?: string; tono?: 'info' | 'error'; irA?: string }

/** La misma página en el dominio principal (para quien llegó por otra dirección). */
function enElDominio(): string {
  return typeof location === 'undefined' ? urlDe('/') : urlDe(`${location.pathname}${location.search}`)
}

function avisoDeError(r: { motivo: string; mensaje: string }): AvisoDeEntrada {
  return r.motivo === 'dominio-no-autorizado' ? { mensaje: r.mensaje, irA: enElDominio() } : { mensaje: r.mensaje }
}

export function useEntrarConGoogle(donde: string) {
  const [entrando, setEntrando] = useState(false)
  const [aviso, setAviso] = useState<AvisoDeEntrada | null>(null)

  useEffect(() => {
    let vivo = true
    recogerRegresoDeGoogle(donde).then((r) => {
      if (vivo && r?.estado === 'error') setAviso(avisoDeError(r))
    }).catch(() => {})
    return () => { vivo = false }
  }, [donde])

  function entrar() {
    setAviso(null)
    setEntrando(true)
    // Sin `await` antes: la ventana tiene que abrirse dentro del clic.
    entrarConGoogle(donde).then((r) => {
      if (r.estado === 'redirigiendo') return // la página se va a Google
      setEntrando(false)
      if (r.estado === 'error') setAviso(avisoDeError(r))
      else if (r.estado === 'navegador-incrustado') setAviso({ mensaje: r.mensaje, app: r.app })
      else if (r.estado === 'cancelado') setAviso({ mensaje: MENSAJE_CANCELADO, tono: 'info' })
    }).catch(() => {
      setEntrando(false)
      setAviso({ mensaje: 'No se pudo entrar con Google. Inténtalo de nuevo en un momento.' })
    })
  }

  return { entrar, entrando, aviso, limpiarAviso: () => setAviso(null) }
}

/** En Android, «abrir en Chrome» sí existe como enlace; en iPhone no hay uno fiable. */
function enlaceChrome(href: string): string | null {
  if (typeof navigator === 'undefined' || !/Android/i.test(navigator.userAgent)) return null
  try {
    const u = new URL(href)
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`
  } catch {
    return null
  }
}

export function AvisoEntrada({ aviso }: { aviso: AvisoDeEntrada | null }) {
  const [copiado, setCopiado] = useState(false)
  if (!aviso) return null
  const href = typeof location === 'undefined' ? 'https://vivebienn.com' : location.href
  const chrome = aviso.app ? enlaceChrome(href) : null

  async function copiar() {
    try {
      await navigator.clipboard.writeText(href)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div role={aviso.tono === 'info' ? 'status' : 'alert'} data-aviso-entrada={aviso.tono ?? 'error'} style={{
      marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: '.85rem', lineHeight: 1.45, textAlign: 'left',
      ...(aviso.tono === 'info'
        ? { color: '#344054', background: '#f2f4f7', border: '1px solid #d0d5dd' }
        : { color: 'var(--estado-mal, #b42318)', background: 'var(--estado-mal-fondo, #fef3f2)', border: '1px solid currentColor' }),
    }}>
      <p style={{ margin: 0 }}>{aviso.mensaje}</p>
      {aviso.irA && (
        <a href={aviso.irA} style={{ display: 'inline-block', marginTop: 8, fontWeight: 700, color: 'inherit', textDecoration: 'underline' }}>
          Ir a vivebienn.com
        </a>
      )}
      {aviso.app && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {chrome && (
            <a href={chrome} style={{ fontWeight: 700, color: 'inherit', textDecoration: 'underline' }}>Abrir en Chrome</a>
          )}
          <button type="button" onClick={copiar} style={{
            font: 'inherit', fontWeight: 700, color: 'inherit', background: 'transparent',
            border: '1px solid currentColor', borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
          }}>
            {copiado ? 'Enlace copiado' : 'Copiar enlace'}
          </button>
          <span style={{ userSelect: 'all', wordBreak: 'break-all', opacity: .85 }}>{href}</span>
        </div>
      )}
    </div>
  )
}
