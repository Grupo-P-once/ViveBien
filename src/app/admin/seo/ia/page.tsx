'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Encabezado from '@/components/admin/Encabezado'
import PiePanel from '@/components/admin/PiePanel'
import { useSesion } from '@/components/admin/sesion'
import { Cargando, ErrorCaja, Kpi, Tabla, Tarjeta, Vacio } from '@/components/admin/seo/ui'

/**
 * SEO · IA y respuestas: registro MANUAL de preguntas de compradores hechas a un asistente de IA y de si VIVE BIEN aparece citada, con fecha.
 * No hay scraping ni «puntajes de visibilidad»: es lo que una persona observó. Se guarda en la base (migración 37); solo Super Admin.
 */

type Observacion = { id: string; prompt: string; motor: string; aparece: boolean; cita_url: string | null; nota: string | null; observado_en: string }
const MOTORES: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini', perplexity: 'Perplexity', copilot: 'Copilot', claude: 'Claude', otro: 'Otro' }
const CAMPO = 'w-full rounded-md border bg-background px-3 py-2 text-sm'
const hoy = () => new Date().toISOString().slice(0, 10)

export default function PaginaSeoIa() {
  const { pedir } = useSesion()
  const [lista, setLista] = useState<Observacion[] | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [f, setF] = useState({ prompt: '', motor: 'chatgpt', aparece: 'no', cita_url: '', nota: '', observado_en: hoy() })

  const cargar = useCallback(async () => {
    setError('')
    try { setLista((await pedir<{ prompts: Observacion[] }>('/api/admin/seo/prompts')).prompts) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el registro.') }
  }, [pedir])
  useEffect(() => { const t = setTimeout(() => void cargar(), 0); return () => clearTimeout(t) }, [cargar])

  async function crear(ev: React.FormEvent) {
    ev.preventDefault(); setEnviando(true); setAviso('')
    try {
      await pedir('/api/admin/seo/prompts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, aparece: f.aparece === 'si', cita_url: f.cita_url || undefined, nota: f.nota || undefined }) })
      setF({ ...f, prompt: '', cita_url: '', nota: '' }); setAviso('Observación registrada.'); await cargar()
    } catch (e) { setAviso(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setEnviando(false) }
  }
  async function borrar(id: string) {
    setAviso('')
    try { await pedir(`/api/admin/seo/prompts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); await cargar() } catch (e) { setAviso(e instanceof Error ? e.message : 'No se pudo borrar.') }
  }

  const resumen = useMemo(() => {
    const l = lista ?? []
    return { total: l.length, aparece: l.filter((o) => o.aparece).length }
  }, [lista])

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado versal="SEO" titulo="IA y respuestas" descripcion="Anota qué le preguntas a un asistente de IA como lo haría un comprador y si VIVE BIEN aparece citada. Sirve para ver el cambio con el tiempo; no es una medición automática." />
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {error && <ErrorCaja mensaje={error} reintentar={() => void cargar()} />}
          {!lista && !error && <Cargando />}
          {lista && lista.length === 0 && <Vacio titulo="Sin observaciones" texto="Registra la primera: escribe la pregunta tal como la haría un comprador, elige el asistente y marca si VIVE BIEN apareció." />}
          {lista && lista.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Kpi etiqueta="Observaciones" valor={resumen.total} />
                <Kpi etiqueta="Con VIVE BIEN citada" valor={`${resumen.aparece} de ${resumen.total}`} nota="Solo lo que se anotó a mano" />
              </div>
              <Tarjeta titulo="Registro">
                <Tabla etiqueta="Observaciones de IA" filas={lista} idDe={(o) => o.id} vacio=""
                  columnas={[
                    { clave: 'fecha', titulo: 'Fecha', celda: (o) => o.observado_en },
                    { clave: 'prompt', titulo: 'Pregunta', celda: (o) => <span className="break-words">{o.prompt}</span> },
                    { clave: 'motor', titulo: 'Asistente', celda: (o) => MOTORES[o.motor] ?? o.motor },
                    { clave: 'ap', titulo: 'Aparece', celda: (o) => <span className={o.aparece ? 'font-semibold text-emerald-800' : 'text-muted-foreground'}>{o.aparece ? 'Sí' : 'No'}</span> },
                    { clave: 'nota', titulo: 'Nota', celda: (o) => <span className="break-words">{[o.nota, o.cita_url].filter(Boolean).join(' · ')}</span> },
                    { clave: 'x', titulo: 'Acción', celda: (o) => <Button variant="outline" size="sm" onClick={() => void borrar(o.id)} aria-label={`Borrar observación «${o.prompt.slice(0, 40)}»`}><Trash2 aria-hidden /></Button> },
                  ]} />
              </Tarjeta>
            </>
          )}
        </div>
        <Tarjeta titulo="Registrar observación">
          <form onSubmit={crear} className="space-y-3" aria-label="Registrar observación de IA">
            <label className="block text-sm">Pregunta<textarea className={CAMPO} rows={2} value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} required minLength={5} maxLength={300} placeholder="Ej.: mejores naves industriales en venta en León" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Asistente
                <select className={CAMPO} value={f.motor} onChange={(e) => setF({ ...f, motor: e.target.value })}>{Object.entries(MOTORES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
              </label>
              <label className="block text-sm">¿Aparece VIVE BIEN?
                <select className={CAMPO} value={f.aparece} onChange={(e) => setF({ ...f, aparece: e.target.value })}><option value="no">No</option><option value="si">Sí</option></select>
              </label>
            </div>
            <label className="block text-sm">Fecha<input type="date" className={CAMPO} value={f.observado_en} max={hoy()} onChange={(e) => setF({ ...f, observado_en: e.target.value })} required /></label>
            <label className="block text-sm">Dirección citada (opcional)<input className={CAMPO} value={f.cita_url} onChange={(e) => setF({ ...f, cita_url: e.target.value })} placeholder="https://…" maxLength={300} /></label>
            <label className="block text-sm">Nota (opcional)<input className={CAMPO} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} maxLength={500} /></label>
            <Button type="submit" disabled={enviando}><Plus aria-hidden /> Registrar</Button>
            {aviso && <p role="status" className="text-sm">{aviso}</p>}
          </form>
        </Tarjeta>
      </div>
      <PiePanel />
    </main>
  )
}
