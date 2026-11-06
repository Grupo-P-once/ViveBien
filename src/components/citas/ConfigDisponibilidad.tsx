'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { llamarApi } from '@/lib/citas/cliente'
import { diaLocal, horaLocal24, instanteLocal } from '@/lib/citas/zona'
import type { AjustesCitas, BloqueHorario } from '@/lib/citas/ajustes'

/**
 * La disponibilidad REAL de un responsable de citas (D-11): horario semanal, duración, traslado, anticipación, días hacia adelante,
 * cómo se confirman y bloqueos (vacaciones, festivos, pausas). Cada responsable edita la suya; un admin elige de quién.
 * Todo en hora de León. El servidor valida y guarda en una sola transacción auditada; aquí solo se captura.
 */
type Bloqueo = { desde: string; hasta: string; motivo: string }   // desde/hasta en formato de <input type="datetime-local"> (hora de León)
type Datos = {
  uid: string; nombre: string | null; personalizado: boolean
  horario: BloqueHorario[]; ajustes: AjustesCitas
  bloqueos: Array<{ desde: string; hasta: string; motivo: string | null }>
  responsables?: Array<{ uid: string; nombre: string | null; rol: string }>
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const ORDEN = [1, 2, 3, 4, 5, 6, 0]
const CAMPO = 'h-11 rounded-lg border bg-card px-3 text-sm'

const aLocal = (iso: string) => { const d = new Date(iso); return `${diaLocal(d)}T${horaLocal24(d)}` }
const aIso = (v: string) => { const [dia, hora] = v.split('T'); return instanteLocal(dia, hora).toISOString() }

export default function ConfigDisponibilidad({ elegirResponsable }: { elegirResponsable?: boolean }) {
  const [uid, setUid] = useState<string | null>(null)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [horario, setHorario] = useState<BloqueHorario[]>([])
  const [ajustes, setAjustes] = useState<AjustesCitas | null>(null)
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [sinPermiso, setSinPermiso] = useState(false)

  const recibir = useCallback((r: Awaited<ReturnType<typeof llamarApi<Datos>>>) => {
    if (!r.ok) { setError(r.error); setSinPermiso(r.status === 403); return }
    setError(null)
    setDatos(r.data); setHorario(r.data.horario.map((b) => ({ ...b }))); setAjustes({ ...r.data.ajustes })
    setBloqueos(r.data.bloqueos.map((b) => ({ desde: aLocal(b.desde), hasta: aLocal(b.hasta), motivo: b.motivo ?? '' })))
  }, [])
  // Lectura al abrir y al cambiar de responsable. El estado solo se toca cuando llega la respuesta.
  useEffect(() => {
    let vivo = true
    void llamarApi<Datos>(`/api/citas/ajustes${uid ? `?uid=${encodeURIComponent(uid)}` : ''}`).then((r) => { if (vivo) recibir(r) })
    return () => { vivo = false }
  }, [uid, recibir])
  const cargar = useCallback(async () => {
    recibir(await llamarApi<Datos>(`/api/citas/ajustes${uid ? `?uid=${encodeURIComponent(uid)}` : ''}`))
  }, [uid, recibir])

  async function guardar() {
    if (!ajustes || !datos) return
    setGuardando(true); setError(null); setAviso(null)
    const r = await llamarApi('/api/citas/ajustes', {
      method: 'PUT',
      cuerpo: {
        uid: datos.uid, horario, ajustes,
        bloqueos: bloqueos.filter((b) => b.desde && b.hasta).map((b) => ({ desde: aIso(b.desde), hasta: aIso(b.hasta), motivo: b.motivo.trim() || null })),
      },
    })
    setGuardando(false)
    if (r.ok) { setAviso('Disponibilidad guardada. Los horarios nuevos ya se ofrecen en las fichas.'); void cargar() } else setError(r.error)
  }

  const num = (k: keyof AjustesCitas, v: string) => setAjustes((a) => (a ? { ...a, [k]: v === '' ? 0 : Number(v) } : a))
  const cambiarBloque = (i: number, c: Partial<BloqueHorario>) => setHorario((h) => h.map((b, j) => (j === i ? { ...b, ...c } : b)))

  if (sinPermiso) return <p role="alert" className="rounded-xl border bg-card p-4 text-sm">{error}</p>
  if (!datos || !ajustes) return error
    ? <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950">{error}</p>
    : <div className="h-64 animate-pulse rounded-xl bg-muted" role="status" aria-label="Cargando disponibilidad" />

  return (
    <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); void guardar() }} data-config-disponibilidad>
      {elegirResponsable && datos.responsables && (
        <label className="block text-xs font-semibold text-muted-foreground">Responsable
          <select className={`${CAMPO} mt-1 block w-full max-w-sm font-normal text-foreground`} value={datos.uid} onChange={(e) => { setDatos(null); setUid(e.target.value) }}>
            {datos.responsables.map((r) => <option key={r.uid} value={r.uid}>{r.nombre ?? 'Sin nombre'}</option>)}
          </select>
        </label>
      )}
      {!datos.personalizado && (
        <p role="status" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-950">Todavía no se guardó una disponibilidad para {datos.nombre ?? 'esta cuenta'}: se muestra el horario por defecto. Revísalo y guárdalo para que sea el real.</p>
      )}

      <fieldset className="space-y-3">
        <legend className="font-heading text-base font-semibold">Horario semanal</legend>
        <p className="text-sm text-muted-foreground">Cuándo puedes recibir visitas. Hora de León.</p>
        {ORDEN.map((dia) => {
          const filas = horario.map((b, i) => ({ b, i })).filter((x) => x.b.dia === dia)
          return (
            <div key={dia} className="flex flex-wrap items-center gap-2 border-b pb-3">
              <span className="w-24 text-sm font-semibold">{DIAS[dia]}</span>
              {filas.length === 0 && <span className="text-sm text-muted-foreground">No atiendes</span>}
              {filas.map(({ b, i }) => (
                <span key={i} className="flex items-center gap-1">
                  <input type="time" aria-label={`${DIAS[dia]}: desde`} className={CAMPO} value={b.desde} onChange={(e) => cambiarBloque(i, { desde: e.target.value })} step={1800} />
                  <span aria-hidden>–</span>
                  <input type="time" aria-label={`${DIAS[dia]}: hasta`} className={CAMPO} value={b.hasta} onChange={(e) => cambiarBloque(i, { hasta: e.target.value })} step={1800} />
                  <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Quitar este horario del ${DIAS[dia].toLowerCase()}`} onClick={() => setHorario((h) => h.filter((_, j) => j !== i))}><Trash2 aria-hidden /></Button>
                </span>
              ))}
              <Button type="button" variant="outline" className="h-11" onClick={() => setHorario((h) => [...h, { dia, desde: '09:00', hasta: '14:00' }])}><Plus aria-hidden />Agregar horario</Button>
            </div>
          )
        })}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 font-heading text-base font-semibold">Reglas</legend>
        {([
          ['duracionMin', 'Duración de la visita (min)', 15, 240],
          ['margenMin', 'Traslado entre visitas (min)', 0, 120],
          ['anticipacionHoras', 'Aviso mínimo (horas)', 0, 168],
          ['ventanaDias', 'Días hacia adelante', 1, 180],
        ] as const).map(([k, texto, min, max]) => (
          <label key={k} className="text-xs font-semibold text-muted-foreground">{texto}
            <input type="number" inputMode="numeric" min={min} max={max} className={`${CAMPO} mt-1 block w-full font-normal text-foreground`} value={ajustes[k]} onChange={(e) => num(k, e.target.value)} />
          </label>
        ))}
        <label className="text-xs font-semibold text-muted-foreground">Cómo se confirman
          <select className={`${CAMPO} mt-1 block w-full font-normal text-foreground`} value={ajustes.confirmacion} onChange={(e) => setAjustes({ ...ajustes, confirmacion: e.target.value as AjustesCitas['confirmacion'] })}>
            <option value="manual">Yo confirmo cada solicitud</option>
            <option value="automatica">Se confirman al pedirlas</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-heading text-base font-semibold">Bloqueos (vacaciones, festivos, pausas)</legend>
        {bloqueos.length === 0 && <p className="text-sm text-muted-foreground">No tienes bloqueos. Agrega uno para no recibir visitas en esas fechas.</p>}
        {bloqueos.map((b, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Desde<input type="datetime-local" className={`${CAMPO} mt-1 block font-normal text-foreground`} value={b.desde} onChange={(e) => setBloqueos((x) => x.map((y, j) => (j === i ? { ...y, desde: e.target.value } : y)))} /></label>
            <label className="text-xs font-semibold text-muted-foreground">Hasta<input type="datetime-local" className={`${CAMPO} mt-1 block font-normal text-foreground`} value={b.hasta} onChange={(e) => setBloqueos((x) => x.map((y, j) => (j === i ? { ...y, hasta: e.target.value } : y)))} /></label>
            <label className="min-w-[10rem] flex-1 text-xs font-semibold text-muted-foreground">Motivo (opcional)<input type="text" maxLength={200} className={`${CAMPO} mt-1 block w-full font-normal text-foreground`} value={b.motivo} onChange={(e) => setBloqueos((x) => x.map((y, j) => (j === i ? { ...y, motivo: e.target.value } : y)))} /></label>
            <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Quitar este bloqueo" onClick={() => setBloqueos((x) => x.filter((_, j) => j !== i))}><Trash2 aria-hidden /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" className="h-11" onClick={() => setBloqueos((x) => [...x, { desde: '', hasta: '', motivo: '' }])}><Plus aria-hidden />Agregar bloqueo</Button>
      </fieldset>

      {aviso && <p role="status" className="rounded-lg bg-green-100 p-3 text-sm text-green-950">{aviso}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-950">{error}</p>}
      <Button type="submit" className="h-12 px-6" disabled={guardando}>{guardando && <Loader2 className="animate-spin" aria-hidden />}Guardar disponibilidad</Button>
    </form>
  )
}
