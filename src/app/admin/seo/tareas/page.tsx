'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Encabezado from '@/components/admin/Encabezado'
import PiePanel from '@/components/admin/PiePanel'
import { useSesion } from '@/components/admin/sesion'
import { Cargando, ErrorCaja, Tarjeta, Vacio } from '@/components/admin/seo/ui'
import { cn } from '@/lib/utils'

/** SEO · Qué hacer: lista de tareas con evidencia, prioridad y estado. Se guarda en la base (migración 37); solo Super Admin. */

type Tarea = { id: string; titulo: string; detalle: string | null; area: string; prioridad: 'alta' | 'media' | 'baja'; estado: 'pendiente' | 'en_curso' | 'hecha' | 'descartada'; evidencia: string | null; creada_por: string; creada_en: string; resuelta_en: string | null }

const AREAS: Record<string, string> = { tecnico: 'Técnico', contenido: 'Contenido', local: 'Local (Maps)', indexacion: 'Indexación', ia: 'IA / respuestas', otro: 'Otro' }
const ESTADOS: Array<[Tarea['estado'], string]> = [['pendiente', 'Pendiente'], ['en_curso', 'En curso'], ['hecha', 'Hecha'], ['descartada', 'Descartada']]
const COLOR_PRIORIDAD = { alta: 'bg-red-100 text-red-900', media: 'bg-amber-100 text-amber-900', baja: 'bg-slate-100 text-slate-800' } as const
const CAMPO = 'w-full rounded-md border bg-background px-3 py-2 text-sm'

export default function PaginaSeoTareas() {
  const { pedir } = useSesion()
  const [tareas, setTareas] = useState<Tarea[] | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [verCerradas, setVerCerradas] = useState(false)
  const [f, setF] = useState({ titulo: '', detalle: '', area: 'tecnico', prioridad: 'media', evidencia: '' })

  const cargar = useCallback(async () => {
    setError('')
    try { setTareas((await pedir<{ tareas: Tarea[] }>('/api/admin/seo/tareas')).tareas) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar la lista.') }
  }, [pedir])
  useEffect(() => { const t = setTimeout(() => void cargar(), 0); return () => clearTimeout(t) }, [cargar])

  async function crear(ev: React.FormEvent) {
    ev.preventDefault(); setEnviando(true); setAviso('')
    try {
      await pedir('/api/admin/seo/tareas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) })
      setF({ titulo: '', detalle: '', area: f.area, prioridad: f.prioridad, evidencia: '' }); setAviso('Tarea agregada.'); await cargar()
    } catch (e) { setAviso(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setEnviando(false) }
  }
  async function cambiar(id: string, estado: Tarea['estado']) {
    setAviso('')
    try { await pedir('/api/admin/seo/tareas', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, estado }) }); await cargar() } catch (e) { setAviso(e instanceof Error ? e.message : 'No se pudo cambiar.') }
  }

  const abiertas = (tareas ?? []).filter((t) => t.estado === 'pendiente' || t.estado === 'en_curso')
  const cerradas = (tareas ?? []).filter((t) => t.estado === 'hecha' || t.estado === 'descartada')
  const orden = { alta: 0, media: 1, baja: 2 } as const
  abiertas.sort((a, b) => orden[a.prioridad] - orden[b.prioridad])

  const fila = (t: Tarea) => (
    <li key={t.id} className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium break-words">{t.titulo}</p>
        <div className="flex gap-1.5 text-xs">
          <span className={cn('rounded-md px-2 py-0.5 font-semibold', COLOR_PRIORIDAD[t.prioridad])}>{t.prioridad}</span>
          <span className="rounded-md bg-muted px-2 py-0.5">{AREAS[t.area] ?? t.area}</span>
        </div>
      </div>
      {t.detalle && <p className="mt-1 break-words text-muted-foreground">{t.detalle}</p>}
      {t.evidencia && <p className="mt-1 text-xs break-words"><span className="font-semibold">Evidencia:</span> {t.evidencia}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs">
          Estado
          <select className="rounded-md border bg-background px-2 py-1 text-xs" value={t.estado} aria-label={`Estado de «${t.titulo}»`} onChange={(e) => void cambiar(t.id, e.target.value as Tarea['estado'])}>
            {ESTADOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </label>
        <span className="text-xs text-muted-foreground">Creada {new Date(t.creada_en).toLocaleDateString('es-MX')}</span>
      </div>
    </li>
  )

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado versal="SEO" titulo="Qué hacer" descripcion="Las tareas de SEO con su evidencia, prioridad y estado. Se guardan en la base para no depender de una nota suelta." />
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {error && <ErrorCaja mensaje={error} reintentar={() => void cargar()} />}
          {!tareas && !error && <Cargando />}
          {tareas && abiertas.length === 0 && <Vacio titulo="No hay tareas abiertas" texto="Agrega la primera con el formulario: una tarea buena dice qué cambiar y en qué evidencia se apoya." />}
          {abiertas.length > 0 && <Tarjeta titulo={`Abiertas (${abiertas.length})`}><ul className="space-y-2" aria-label="Tareas abiertas">{abiertas.map(fila)}</ul></Tarjeta>}
          {cerradas.length > 0 && (
            <Tarjeta titulo={`Cerradas (${cerradas.length})`} acciones={<Button variant="outline" size="sm" onClick={() => setVerCerradas((v) => !v)} aria-expanded={verCerradas}>{verCerradas ? 'Ocultar' : 'Mostrar'}</Button>}>
              {verCerradas && <ul className="space-y-2" aria-label="Tareas cerradas">{cerradas.map(fila)}</ul>}
            </Tarjeta>
          )}
        </div>
        <Tarjeta titulo="Agregar tarea">
          <form onSubmit={crear} className="space-y-3" aria-label="Agregar tarea de SEO">
            <label className="block text-sm">Título<input className={CAMPO} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} required minLength={3} maxLength={200} /></label>
            <label className="block text-sm">Detalle (opcional)<textarea className={CAMPO} rows={3} value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} maxLength={1000} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Área
                <select className={CAMPO} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>{Object.entries(AREAS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
              </label>
              <label className="block text-sm">Prioridad
                <select className={CAMPO} value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select>
              </label>
            </div>
            <label className="block text-sm">Evidencia (opcional)<input className={CAMPO} value={f.evidencia} onChange={(e) => setF({ ...f, evidencia: e.target.value })} maxLength={500} placeholder="Dónde se vio: informe, URL, fecha" /></label>
            <Button type="submit" disabled={enviando}><Plus aria-hidden /> Agregar</Button>
            {aviso && <p role="status" className="text-sm">{aviso}</p>}
          </form>
        </Tarjeta>
      </div>
      <PiePanel />
    </main>
  )
}
