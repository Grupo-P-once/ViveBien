'use client'

import { useState } from 'react'
import { ArrowUp, History, Loader2, Sparkles } from 'lucide-react'
import { fechaLocalISO } from '@/lib/contabilidad'
import type { Relleno } from '@/lib/contabilidad-relleno'

/**
 * Cajita de autollenado (26-oct-2026): se escribe una instrucción («gasté 1,500 en lonas ayer, cuenta Meta Ads») y la IA SOLO llena el formulario de «Gastos y cuentas». No responde
 * ni guarda nada: la persona revisa los campos y registra con el botón de siempre. El historial son las últimas instrucciones de ESTA sesión del navegador (sessionStorage; solo el
 * texto que la persona escribió, nunca respuestas ni cifras); un toque en una la vuelve a lanzar.
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
type Respuesta = { relleno: Relleno; resumen: string }
const LLAVE = 'vb-autollenado-historial'
const MAX = 6

function leer(): string[] {
  try {
    const j = JSON.parse(sessionStorage.getItem(LLAVE) ?? '[]') as unknown
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string').slice(0, MAX) : []
  } catch { return [] }
}
function guardar(lista: string[]) { try { sessionStorage.setItem(LLAVE, JSON.stringify(lista)) } catch { /* sin almacenamiento: el historial vive solo en pantalla */ } }

export default function AutollenadoIA({ pedir, onRelleno }: { pedir: Pedir; onRelleno: (r: Relleno, resumen: string) => void }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [historial, setHistorial] = useState<string[]>(leer)
  const [verHistorial, setVerHistorial] = useState(false)

  async function llenar(instruccion: string) {
    const t = instruccion.trim()
    if (t.length < 3 || enviando) return
    setEnviando(true); setAviso(null)
    try {
      const r = await pedir<Respuesta>('/api/admin/contabilidad/asesor', { method: 'POST', body: JSON.stringify({ modo: 'rellenar', pregunta: t, hoy: fechaLocalISO() }) })
      const nuevo = [t, ...historial.filter((h) => h !== t)].slice(0, MAX)
      setHistorial(nuevo); guardar(nuevo)
      setTexto('')
      setAviso({ tipo: 'ok', texto: `${r.resumen}. Revísalo y registra.` })
      onRelleno(r.relleno, r.resumen)
    } catch (e) { setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo llenar.' }) } finally { setEnviando(false) }
  }

  return (
    <section aria-label="Autollenado con IA" className="rounded-2xl border bg-card p-2.5 shadow-sm sm:p-3" data-autollenado>
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void llenar(texto) }}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#8B1A1A] text-white" aria-hidden><Sparkles className="size-4" /></span>
        <label htmlFor="autollenado-texto" className="sr-only">Dile a la IA qué capturar y llenará el formulario</label>
        <input
          id="autollenado-texto" className="h-9 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-sm" value={texto} maxLength={300} autoComplete="off" data-autollenado-entrada
          placeholder="Llena por mí: «gasté 1,500 en lonas ayer, Meta Ads»" onChange={(e) => setTexto(e.target.value)}
        />
        {historial.length > 0 && (
          <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full border text-[#4b5563] hover:bg-muted" aria-label="Historial de instrucciones" aria-expanded={verHistorial} onClick={() => setVerHistorial((v) => !v)} data-autollenado-historial-boton><History className="size-4" aria-hidden /></button>
        )}
        <button type="submit" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#8B1A1A] text-white disabled:opacity-40" disabled={texto.trim().length < 3 || enviando} aria-label="Llenar el formulario" data-autollenado-enviar>
          {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowUp className="size-4" strokeWidth={2.6} aria-hidden />}
        </button>
      </form>
      {aviso && <p role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`mt-2 px-1 text-xs ${aviso.tipo === 'error' ? 'text-red-800' : 'text-[#4b5563]'}`} data-autollenado-aviso-texto>{aviso.texto}</p>}
      {verHistorial && historial.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Instrucciones recientes" data-autollenado-historial>
          {historial.map((h) => (
            <li key={h}><button type="button" className="max-w-[18rem] truncate rounded-full border px-3 py-1 text-xs hover:bg-muted" disabled={enviando} onClick={() => { void llenar(h) }} title={h}>{h}</button></li>
          ))}
        </ul>
      )}
    </section>
  )
}
