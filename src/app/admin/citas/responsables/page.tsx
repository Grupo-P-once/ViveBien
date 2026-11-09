'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import Encabezado from '@/components/admin/Encabezado'
import PiePanel from '@/components/admin/PiePanel'
import DialogoMotivo from '@/components/admin/usuarios/DialogoMotivo'
import { Button } from '@/components/ui/button'
import { llamarApi } from '@/lib/citas/cliente'

/**
 * «Responsables de citas» (Admin y Super Admin; decisión del dueño, 9-nov-2026, ADR-0014 §3): quién atiende las visitas de cada propiedad y quién es el responsable del equipo.
 * Orden de quien atiende: el responsable asignado aquí → el dueño, si atiende citas → el responsable del equipo. Si nadie sirve, la propiedad no puede recibir citas («sin asesor»).
 * Solo pueden ser responsables las cuentas que atienden citas (el equipo y los asociados con «recibir citas»); lo comprueba el servidor. Cada cambio pide un motivo y queda en la bitácora.
 */
type Candidato = { uid: string; nombre: string | null; rol: string }
type Propiedad = {
  id: string; titulo: string | null; publicada: boolean; responsableUid: string | null; duenoUid: string | null; duenoNombre: string | null
  efectivo: { uid: string; nombre: string | null; origen: 'asignado' | 'dueno' | 'equipo' } | null
}
type Datos = { equipo: { uid: string; nombre: string | null; atiende: boolean } | null; candidatos: Candidato[]; propiedades: Propiedad[] }
type Pendiente = { ambito: 'propiedad' | 'equipo'; propiedadId?: string; etiqueta: string; antes: string | null; a: string | null; origen: HTMLElement | null }

const ORIGEN: Record<string, string> = { asignado: 'responsable asignado', dueno: 'el dueño', equipo: 'responsable del equipo' }
const campo = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
const nombreDe = (n: string | null, uid: string) => n?.trim() || `Cuenta ${uid.slice(0, 6)}…`

export default function PaginaResponsablesDeCitas() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [equipoSel, setEquipoSel] = useState('')
  const [elegidos, setElegidos] = useState<Record<string, string>>({})
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)

  // Recarga a petición (tras guardar, con «Reintentar»): se llama desde manejadores de eventos.
  const cargar = useCallback(async () => {
    const r = await llamarApi<Datos>('/api/admin/citas/responsables')
    if (!r.ok) { setError(r.error); return }
    setError(null)
    setDatos(r.data)
    setEquipoSel(r.data.equipo?.uid ?? '')
    setElegidos(Object.fromEntries(r.data.propiedades.map((p) => [p.id, p.responsableUid ?? ''])))
  }, [])
  // Carga inicial: el estado solo se toca cuando llega la respuesta (dentro del `.then`), nunca de forma síncrona en el efecto (regla de React 19).
  useEffect(() => {
    let vivo = true
    void llamarApi<Datos>('/api/admin/citas/responsables').then((r) => {
      if (!vivo) return
      if (!r.ok) { setError(r.error); return }
      setError(null)
      setDatos(r.data)
      setEquipoSel(r.data.equipo?.uid ?? '')
      setElegidos(Object.fromEntries(r.data.propiedades.map((p) => [p.id, p.responsableUid ?? ''])))
    })
    return () => { vivo = false }
  }, [])

  async function guardar(motivo: string) {
    const p = pendiente
    if (!p) return
    setPendiente(null)
    const r = await llamarApi('/api/admin/citas/responsables', { method: 'PUT', cuerpo: { ambito: p.ambito, propiedadId: p.propiedadId, antes: p.antes, a: p.a, motivo } })
    if (r.ok) setAviso({ tipo: 'ok', texto: `Guardado: ${p.etiqueta}.` })
    else setAviso({ tipo: 'error', texto: r.error ?? 'No se pudo guardar.' })
    await cargar() // se vuelve a leer: se muestra lo que QUEDÓ guardado, no lo que se pidió (también tras un conflicto)
  }

  const nombreCandidato = (uid: string | null) => (uid ? nombreDe(datos?.candidatos.find((c) => c.uid === uid)?.nombre ?? null, uid) : 'sin asignar')

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado
        versal="Citas"
        titulo="Responsables de citas"
        descripcion="Quién atiende las visitas de cada propiedad. Solo pueden serlo el equipo y los asociados con el permiso de recibir citas."
        acciones={<Link href="/admin/citas" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--rojo)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Volver al calendario</Link>}
      />

      {aviso && (
        <p role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`mt-5 rounded-md border px-3 py-2 text-sm ${aviso.tipo === 'error' ? 'border-red-300 bg-red-50 text-red-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>{aviso.texto}</p>
      )}

      {error ? (
        <div className="mt-6 rounded-md border p-4 text-sm" role="alert">
          <p>{error}</p>
          <Button className="mt-3" variant="outline" onClick={() => void cargar()}>Reintentar</Button>
        </div>
      ) : datos === null ? (
        <p className="mt-6 text-sm text-muted-foreground" role="status">Cargando responsables…</p>
      ) : (
        <>
          <section aria-labelledby="t-equipo" className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
            <h2 id="t-equipo" className="font-heading text-base font-semibold">Responsable del equipo</h2>
            <p className="mt-1 text-sm text-muted-foreground">Atiende las propiedades cuyo dueño no atiende citas (por ejemplo, las de un publicador). Sin responsable del equipo, esas propiedades no pueden recibir citas.</p>
            {datos.equipo && !datos.equipo.atiende && <p className="mt-2 text-sm text-amber-800" role="note">El responsable configurado ya no atiende citas: se está saltando.</p>}
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="responsable-equipo" className="mb-1 block text-sm font-medium">Responsable actual</label>
                <select id="responsable-equipo" className={campo} value={equipoSel} onChange={(e) => setEquipoSel(e.target.value)}>
                  <option value="">Sin configurar</option>
                  {datos.candidatos.map((c) => <option key={c.uid} value={c.uid}>{nombreDe(c.nombre, c.uid)}</option>)}
                </select>
              </div>
              <Button disabled={equipoSel === (datos.equipo?.uid ?? '')}
                onClick={(e) => setPendiente({ ambito: 'equipo', etiqueta: `responsable del equipo: ${equipoSel ? nombreCandidato(equipoSel) : 'sin configurar'}`, antes: datos.equipo?.uid ?? null, a: equipoSel || null, origen: e.currentTarget })}>
                Guardar
              </Button>
            </div>
          </section>

          <section aria-labelledby="t-props" className="mt-6">
            <h2 id="t-props" className="font-heading text-base font-semibold">Propiedades</h2>
            {datos.propiedades.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Todavía no hay propiedades.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {datos.propiedades.map((p) => {
                  const sel = elegidos[p.id] ?? ''
                  const cambia = sel !== (p.responsableUid ?? '')
                  return (
                    <li key={p.id} className="rounded-xl border bg-card p-4">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                        <p className="font-medium">{p.titulo?.trim() || 'Propiedad sin título'}{!p.publicada && <span className="ml-2 text-xs font-normal text-muted-foreground">(no publicada)</span>}</p>
                        <p className="text-sm text-muted-foreground">Dueño: {p.duenoUid ? nombreDe(p.duenoNombre, p.duenoUid) : 'sin dueño'}</p>
                      </div>
                      <p className={`mt-1 text-sm ${p.efectivo ? 'text-muted-foreground' : 'text-amber-800'}`} role={p.efectivo ? undefined : 'note'}>
                        {p.efectivo ? `Atiende: ${nombreDe(p.efectivo.nombre, p.efectivo.uid)} (${ORIGEN[p.efectivo.origen]})` : 'Nadie atiende todavía: esta propiedad no puede recibir citas ("sin asesor").'}
                      </p>
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1">
                          <label htmlFor={`resp-${p.id}`} className="mb-1 block text-sm font-medium">Responsable asignado</label>
                          <select id={`resp-${p.id}`} className={campo} value={sel} onChange={(e) => setElegidos((m) => ({ ...m, [p.id]: e.target.value }))}>
                            <option value="">Sin asignar</option>
                            {datos.candidatos.map((c) => <option key={c.uid} value={c.uid}>{nombreDe(c.nombre, c.uid)}</option>)}
                          </select>
                        </div>
                        <Button disabled={!cambia} aria-label={`Guardar el responsable de ${p.titulo?.trim() || 'la propiedad'}`}
                          onClick={(e) => setPendiente({ ambito: 'propiedad', propiedadId: p.id, etiqueta: `${p.titulo?.trim() || 'propiedad'}: ${sel ? nombreCandidato(sel) : 'sin asignar'}`, antes: p.responsableUid, a: sel || null, origen: e.currentTarget })}>
                          Guardar
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {pendiente && (
        <DialogoMotivo
          titulo="Cambiar al responsable de citas"
          descripcion={`${pendiente.etiqueta}. Queda registrado con tu nombre y este motivo.`}
          confirmar="Guardar cambio"
          devolverFoco={pendiente.origen}
          alCerrar={() => setPendiente(null)}
          alConfirmar={guardar}
        />
      )}
      <PiePanel />
    </main>
  )
}
