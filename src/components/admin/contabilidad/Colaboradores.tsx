'use client'

import { useMemo, useState } from 'react'
import { Loader2, Plus, Search, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { Linea } from '@/lib/contabilidad'
import { ETIQUETA_TIPO_DE_COLABORADOR, TIPOS_DE_COLABORADOR, type ColaboradorFila, type TipoDeColaborador } from '@/lib/contabilidad-externas'
import { mxn } from './GraficasContables'

/**
 * Directorio de colaboradores (26-oct-2026): los asesores e inmobiliarias con los que VIVE BIEN colabora. Solo Super Admin. La ACREDITACIÓN ES OPCIONAL: el folio es un dato
 * más (informativo); no se necesita para trabajar con alguien, para registrarle una comisión ni para pagarle. El teléfono y el correo son datos personales: viven solo aquí
 * (nunca en el libro, la bitácora ni el asesor de IA). Se desactivan, no se borran: el historial de pagos y constancias debe seguir leyéndose.
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
export type ConstanciasPorMovimiento = Record<string, { folio: string; colaborador_id: string | null; colaborador_nombre: string; metodo: string; comprobante: string | null }>
const campo = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm'
const etiqueta = 'mb-1 block text-xs font-semibold'

/** Cuánto se le ha pagado a cada colaborador, de las constancias de pagos vigentes (un pago anulado no cuenta). */
export function pagadoPorColaborador(lineas: Linea[], constancias: ConstanciasPorMovimiento): Map<string, { total: number; pagos: number }> {
  const mapa = new Map<string, { total: number; pagos: number }>()
  for (const l of lineas) {
    if (!l.vigente || l.clase !== 'pago_colaborador') continue
    const c = constancias[l.id.replace(/^mov:/, '')]
    if (!c?.colaborador_id) continue
    const f = mapa.get(c.colaborador_id) ?? { total: 0, pagos: 0 }
    f.total += l.monto; f.pagos += 1
    mapa.set(c.colaborador_id, f)
  }
  return mapa
}

/** Los pagos que se le han hecho a un colaborador (con su constancia y el recibo de la operación), del más reciente al más antiguo. Un pago anulado se lista tachado y no suma. */
export function historialDeColaborador(id: string, lineas: Linea[], constancias: ConstanciasPorMovimiento): Array<{ id: string; fecha: string; monto: number; vigente: boolean; concepto: string; operacionId: string | null; folio: string; metodo: string }> {
  const filas: Array<{ id: string; fecha: string; monto: number; vigente: boolean; concepto: string; operacionId: string | null; folio: string; metodo: string }> = []
  for (const l of lineas) {
    if (l.clase !== 'pago_colaborador') continue
    const c = constancias[l.id.replace(/^mov:/, '')]
    if (c?.colaborador_id !== id) continue
    filas.push({ id: l.id, fecha: l.fecha, monto: l.monto, vigente: l.vigente, concepto: l.concepto, operacionId: l.operacionId, folio: c.folio, metodo: c.metodo })
  }
  return filas.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

function Formulario({ inicial, pedir, onGuardado, onCancelar }: { inicial?: ColaboradorFila; pedir: Pedir; onGuardado: () => void; onCancelar: () => void }) {
  const [tipo, setTipo] = useState<TipoDeColaborador>(inicial?.tipo ?? 'agente')
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [empresa, setEmpresa] = useState(inicial?.empresa ?? '')
  const [telefono, setTelefono] = useState(inicial?.telefono ?? '')
  const [correo, setCorreo] = useState(inicial?.correo ?? '')
  const [municipio, setMunicipio] = useState(inicial?.municipio ?? '')
  const [folio, setFolio] = useState(inicial?.folio_acreditacion ?? '')
  const [notas, setNotas] = useState(inicial?.notas ?? '')
  const [enviando, setEnviando] = useState(false)
  const id = inicial?.id ?? 'nuevo'

  async function guardar() {
    setEnviando(true)
    try {
      const cuerpo: Record<string, unknown> = { tipo, nombre, empresa, telefono, correo, municipio, folio_acreditacion: folio, notas }
      if (inicial) {
        const cambios: Record<string, unknown> = {}
        const antes: Record<string, string | null> = { tipo: inicial.tipo, nombre: inicial.nombre, empresa: inicial.empresa, telefono: inicial.telefono, correo: inicial.correo, municipio: inicial.municipio, folio_acreditacion: inicial.folio_acreditacion, notas: inicial.notas }
        for (const [k, v] of Object.entries(cuerpo)) if ((antes[k] ?? '') !== String(v ?? '').trim()) cambios[k] = v
        if (!Object.keys(cambios).length) { onCancelar(); return }
        await pedir(`/api/admin/contabilidad/colaboradores/${inicial.id}`, { method: 'PATCH', body: JSON.stringify(cambios) })
        toast.success('Colaborador actualizado.')
      } else {
        const r = await pedir<{ ya_existe?: boolean }>('/api/admin/contabilidad/colaboradores', { method: 'POST', body: JSON.stringify(cuerpo) })
        toast.success(r.ya_existe ? 'Ya estaba en el directorio.' : 'Colaborador guardado.')
      }
      onGuardado()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setEnviando(false) }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4" data-formulario-colaborador>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor={`c-tipo-${id}`} className={etiqueta}>Es</label>
          <select id={`c-tipo-${id}`} className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeColaborador)}>{TIPOS_DE_COLABORADOR.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_DE_COLABORADOR[t]}</option>)}</select></div>
        <div><label htmlFor={`c-nombre-${id}`} className={etiqueta}>Nombre</label><input id={`c-nombre-${id}`} className={campo} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} autoComplete="off" placeholder="Nombre y apellido" /></div>
        <div><label htmlFor={`c-emp-${id}`} className={etiqueta}>Inmobiliaria o empresa <span className="font-normal text-muted-foreground">(opcional)</span></label><input id={`c-emp-${id}`} className={campo} value={empresa} maxLength={120} onChange={(e) => setEmpresa(e.target.value)} autoComplete="off" /></div>
        <div><label htmlFor={`c-mun-${id}`} className={etiqueta}>Municipio <span className="font-normal text-muted-foreground">(opcional)</span></label><input id={`c-mun-${id}`} className={campo} value={municipio} maxLength={120} onChange={(e) => setMunicipio(e.target.value)} autoComplete="off" /></div>
        <div><label htmlFor={`c-tel-${id}`} className={etiqueta}>Teléfono <span className="font-normal text-muted-foreground">(opcional)</span></label><input id={`c-tel-${id}`} className={campo} value={telefono} maxLength={40} inputMode="tel" onChange={(e) => setTelefono(e.target.value)} autoComplete="off" /></div>
        <div><label htmlFor={`c-cor-${id}`} className={etiqueta}>Correo <span className="font-normal text-muted-foreground">(opcional)</span></label><input id={`c-cor-${id}`} className={campo} value={correo} maxLength={200} inputMode="email" onChange={(e) => setCorreo(e.target.value)} autoComplete="off" /></div>
        <div className="sm:col-span-2"><label htmlFor={`c-fol-${id}`} className={etiqueta}>Folio de acreditación <span className="font-normal text-muted-foreground">(opcional: no se necesita para trabajar con esta persona ni para pagarle)</span></label><input id={`c-fol-${id}`} className={campo} value={folio} maxLength={40} onChange={(e) => setFolio(e.target.value)} autoComplete="off" /></div>
        <div className="sm:col-span-2"><label htmlFor={`c-not-${id}`} className={etiqueta}>Notas <span className="font-normal text-muted-foreground">(opcional)</span></label><input id={`c-not-${id}`} className={campo} value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} autoComplete="off" /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={nombre.trim().length < 2 || enviando} onClick={() => { void guardar() }} data-guardar-colaborador>{enviando ? <><Loader2 className="animate-spin" aria-hidden /> Guardando…</> : inicial ? 'Guardar cambios' : 'Guardar colaborador'}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancelar} disabled={enviando}>Cancelar</Button>
      </div>
    </div>
  )
}

export default function Colaboradores({ colaboradores, cargando, error, lineas, constancias, pedir, onCambio }: {
  colaboradores: ColaboradorFila[]; cargando: boolean; error: string; lineas: Linea[]; constancias: ConstanciasPorMovimiento; pedir: Pedir; onCambio: () => void
}) {
  const [nuevo, setNuevo] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [historial, setHistorial] = useState<string | null>(null)
  const [verInactivos, setVerInactivos] = useState(false)
  const pagado = useMemo(() => pagadoPorColaborador(lineas, constancias), [lineas, constancias])
  const q = texto.trim().toLowerCase()
  const visibles = colaboradores.filter((c) => (verInactivos || c.activo) && (!q || [c.nombre, c.empresa, c.municipio].some((x) => x?.toLowerCase().includes(q))))

  async function cambiarActivo(c: ColaboradorFila) {
    try { await pedir(`/api/admin/contabilidad/colaboradores/${c.id}`, { method: 'PATCH', body: JSON.stringify({ activo: !c.activo }) }); toast.success(c.activo ? 'Desactivado.' : 'Activado.'); onCambio() } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo cambiar.') }
  }

  return (
    <div className="space-y-4" data-colaboradores>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">Los asesores e inmobiliarias con los que colaboras. <strong>La acreditación es opcional</strong>: el folio es un dato más y no se necesita para trabajar con alguien, registrarle una comisión ni pagarle. Aquí ves cuánto se le ha pagado a cada uno.</p>
        {!nuevo && <Button type="button" onClick={() => { setNuevo(true); setEditando(null) }} data-nuevo-colaborador><Plus aria-hidden /> Nuevo colaborador</Button>}
      </div>
      {nuevo && <Formulario pedir={pedir} onGuardado={() => { setNuevo(false); onCambio() }} onCancelar={() => setNuevo(false)} />}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <label htmlFor="col-buscar" className="sr-only">Buscar colaborador</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input id="col-buscar" className={`${campo} pl-9`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, empresa o municipio" autoComplete="off" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />Ver desactivados</label>
      </div>
      {error && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-error-colaboradores>{error}</p>}
      {cargando && !colaboradores.length && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Cargando…</p>}
      {!cargando && !error && visibles.length === 0 && (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground" data-colaboradores-vacio>{colaboradores.length ? 'Ninguno coincide con la búsqueda.' : 'Todavía no hay colaboradores. Agrega al primero con «Nuevo colaborador»: solo el nombre es obligatorio.'}</p>
      )}
      <ul className="grid gap-3 lg:grid-cols-2" aria-label="Colaboradores">
        {visibles.map((c) => {
          const p = pagado.get(c.id)
          return (
            <li key={c.id} className={`rounded-xl border bg-card p-4 ${c.activo ? '' : 'opacity-70'}`} data-colaborador={c.id}>
              {editando === c.id ? (
                <Formulario inicial={c} pedir={pedir} onGuardado={() => { setEditando(null); onCambio() }} onCancelar={() => setEditando(null)} />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden><UserRound className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{c.nombre}</p>
                      <p className="text-xs text-muted-foreground">{ETIQUETA_TIPO_DE_COLABORADOR[c.tipo]}{c.empresa ? ` · ${c.empresa}` : ''}{c.municipio ? ` · ${c.municipio}` : ''}{c.activo ? '' : ' · desactivado'}</p>
                    </div>
                    <p className="shrink-0 text-right text-sm"><span className="block text-xs text-muted-foreground">Pagado</span><strong className="tabular-nums" data-pagado>{mxn(p?.total ?? 0)}</strong>{p ? <span className="block text-xs text-muted-foreground">{p.pagos} {p.pagos === 1 ? 'pago' : 'pagos'}</span> : null}</p>
                  </div>
                  <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                    <div><dt className="inline text-muted-foreground">Acreditación: </dt><dd className="inline" data-acreditacion>{c.folio_acreditacion ? `folio ${c.folio_acreditacion} (sin verificar)` : 'sin folio (opcional)'}</dd></div>
                    {c.telefono && <div><dt className="inline text-muted-foreground">Teléfono: </dt><dd className="inline">{c.telefono}</dd></div>}
                    {c.correo && <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Correo: </dt><dd className="inline break-all">{c.correo}</dd></div>}
                    {c.notas && <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Notas: </dt><dd className="inline">{c.notas}</dd></div>}
                  </dl>
                  <p className="flex gap-4 text-xs"><button type="button" className="underline" aria-expanded={historial === c.id} onClick={() => setHistorial(historial === c.id ? null : c.id)} data-ver-historial>{historial === c.id ? 'Ocultar historial' : 'Ver historial'}</button><button type="button" className="underline" onClick={() => { setEditando(c.id); setNuevo(false) }} data-editar-colaborador>Editar</button><button type="button" className="underline" onClick={() => { void cambiarActivo(c) }}>{c.activo ? 'Desactivar' : 'Activar'}</button></p>
                  {historial === c.id && (
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm" data-historial>
                      {(() => {
                        const h = historialDeColaborador(c.id, lineas, constancias)
                        if (h.length === 0) return <p className="text-muted-foreground" data-historial-vacio>Todavía no se le ha pagado nada con constancia. Cuando registres un pago a {c.nombre}, aquí aparecerá con su recibo.</p>
                        return (
                          <ul className="space-y-2">
                            {h.map((x) => (
                              <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2 last:border-b-0 last:pb-0" data-pago-historial>
                                <span className={x.vigente ? '' : 'line-through text-muted-foreground'}>{x.fecha} · <strong className="tabular-nums">{mxn(x.monto)}</strong> · {x.metodo === 'transferencia' ? 'transferencia' : 'efectivo'}{x.vigente ? '' : ' · anulado'}</span>
                                <span className="flex flex-wrap gap-x-3 text-xs">
                                  <a className="underline" href={`/admin/contabilidad/constancia/${x.folio}`}>Constancia {x.folio}</a>
                                  {x.operacionId && <a className="underline" href={`/admin/comisiones/recibo/${x.operacionId}`}>Recibo de la comisión</a>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
