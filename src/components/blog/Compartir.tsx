'use client'
import { useState } from 'react'
import { Check, Link2, MessageCircle } from 'lucide-react'

/** Compartir sin scripts de terceros: enlaces directos a WhatsApp y Facebook y «copiar enlace». */
export default function Compartir({ url, titulo }: { url: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { /* sin permiso del portapapeles: no pasa nada */ }
  }
  return (
    <div className="blog-compartir" role="group" aria-label="Compartir este artículo">
      <span className="blog-compartir-t">Compartir</span>
      <a href={`https://wa.me/?text=${encodeURIComponent(`${titulo} ${url}`)}`} target="_blank" rel="noopener noreferrer" aria-label="Compartir por WhatsApp (se abre en una pestaña nueva)"><MessageCircle aria-hidden size={18} /> WhatsApp</a>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" aria-label="Compartir en Facebook (se abre en una pestaña nueva)">
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.04c-5.5 0-9.96 4.46-9.96 9.96 0 4.99 3.66 9.13 8.44 9.88v-6.99H7.94V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99c4.78-.75 8.44-4.89 8.44-9.88 0-5.5-4.46-9.96-9.96-9.96z" /></svg> Facebook
      </a>
      <button type="button" onClick={copiar}>{copiado ? <Check aria-hidden size={18} /> : <Link2 aria-hidden size={18} />} {copiado ? 'Enlace copiado' : 'Copiar enlace'}</button>
      <span role="status" className="blog-solo-lectores">{copiado ? 'Enlace copiado al portapapeles' : ''}</span>
    </div>
  )
}
