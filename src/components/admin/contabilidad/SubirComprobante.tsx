'use client'

import { useRef, useState } from 'react'
import { FileText, Loader2, Paperclip, X } from 'lucide-react'
import { TOPE_DE_ADJUNTO } from '@/lib/contabilidad-adjuntos'

/**
 * Comprobante OPCIONAL (26-oct-2026): una nota, un recibo, la captura o el PDF de una transferencia. Se sube a un almacén PRIVADO (nadie lo abre sin que el servidor firme el acceso)
 * y la pantalla guarda solo su ruta. Si el almacén no está disponible o la subida falla, se dice y se sigue sin adjuntar: nunca bloquea el registro.
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>

export function SubirComprobante({ pedir, valor, onCambio, etiqueta = 'Comprobante', ayuda }: { pedir: Pedir; valor: string | null; onCambio: (ruta: string | null) => void; etiqueta?: string; ayuda?: string }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')

  async function elegir(archivo: File | undefined) {
    if (!archivo) return
    setError('')
    if (archivo.size > TOPE_DE_ADJUNTO) { setError('El archivo pesa más de 4 MB. Comprímelo o sube una foto más ligera.'); return }
    setSubiendo(true)
    try {
      const forma = new FormData()
      forma.append('archivo', archivo)
      const r = await pedir<{ ruta: string }>('/api/admin/contabilidad/adjuntos', { method: 'POST', body: forma })
      setNombre(archivo.name); onCambio(r.ruta)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo subir el archivo.'); onCambio(null) } finally { setSubiendo(false); if (entrada.current) entrada.current.value = '' }
  }

  return (
    <div data-subir-comprobante>
      <p className="mb-1 text-xs font-semibold">{etiqueta} <span className="font-normal text-muted-foreground">(opcional)</span></p>
      {valor ? (
        <p className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm" data-comprobante-listo>
          <FileText className="size-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate">{nombre || 'Archivo adjunto'}</span>
          <button type="button" className="rounded p-1 hover:bg-muted" aria-label="Quitar el archivo" onClick={() => { onCambio(null); setNombre('') }}><X className="size-4" aria-hidden /></button>
        </p>
      ) : (
        <div>
          <input ref={entrada} id="subir-comprobante" type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { void elegir(e.target.files?.[0]) }} disabled={subiendo} />
          <label htmlFor="subir-comprobante" className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input bg-background px-3 text-sm hover:bg-muted">
            {subiendo ? <><Loader2 className="size-4 animate-spin" aria-hidden />Subiendo…</> : <><Paperclip className="size-4" aria-hidden />Adjuntar archivo (PDF, JPG, PNG o WEBP · máx. 4 MB)</>}
          </label>
        </div>
      )}
      {ayuda && <p className="mt-1 text-xs text-muted-foreground">{ayuda}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-800" data-error-comprobante>{error}</p>}
    </div>
  )
}

/** Botón «Ver comprobante»: pide la dirección firmada (dura 2 minutos) y la abre en otra pestaña. */
export function VerComprobante({ pedir, ruta, texto = 'Ver comprobante' }: { pedir: Pedir; ruta: string; texto?: string }) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  async function abrir() {
    setCargando(true); setError('')
    try {
      const r = await pedir<{ url: string }>(`/api/admin/contabilidad/adjuntos?ruta=${encodeURIComponent(ruta)}&formato=json`)
      window.open(r.url, '_blank', 'noopener,noreferrer')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir el archivo.') } finally { setCargando(false) }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="inline-flex items-center gap-1 text-xs underline" onClick={() => { void abrir() }} disabled={cargando} data-ver-comprobante>
        {cargando ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Paperclip className="size-3" aria-hidden />}{texto}
      </button>
      {error && <span role="alert" className="text-xs text-red-800">{error}</span>}
    </span>
  )
}
