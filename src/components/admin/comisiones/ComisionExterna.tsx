'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fechaLocalISO, type ExternaContable } from '@/lib/contabilidad'
import { ETIQUETA_TIPO_DE_EXTERNA, TIPOS_DE_EXTERNA, type ColaboradorFila, type TipoDeExterna } from '@/lib/contabilidad-externas'
import { SubirComprobante, VerComprobante } from '@/components/admin/contabilidad/SubirComprobante'
import { mxn } from '@/components/admin/contabilidad/GraficasContables'

/**
 * «Comisión externa» (26-oct-2026), solo Super Admin. Para un trato que NO viene de una propiedad del sitio: un cliente pide algo, VIVE BIEN lo consigue con un tercero y se lleva
 * SOLO su parte. Se registra en segundos: qué fue, con quién se compartió (opcional), cuánto le tocó a VIVE BIEN y si ya se cobró. No guarda el nombre del cliente: solo una
 * descripción. Un comprobante (nota, recibo, transferencia) es opcional. La parte de la contraparte NO es dinero de VIVE BIEN: no entra a la contabilidad ni queda nada por pagar.
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
const campo = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm'
const etiqueta = 'mb-1 block text-xs font-semibold'
const nuevaClave = () => `ext-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
const ESTADO: Record<ExternaContable['estado'], { texto: string; clase: string }> = {
  por_cobrar: { texto: 'Por cobrar', clase: 'bg-amber-100 text-amber-950' },
  cobrada: { texto: 'Cobrada', clase: 'bg-emerald-100 text-emerald-950' },
  anulada: { texto: 'Anulada', clase: 'bg-muted text-muted-foreground' },
}

function FormularioDeCobro({ x, pedir, onListo, onCancelar }: { x: ExternaContable; pedir: Pedir; onListo: () => void; onCancelar: () => void }) {
  const [fecha, setFecha] = useState(fechaLocalISO)
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [referencia, setReferencia] = useState('')
  const [adjunto, setAdjunto] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  async function cobrar() {
    setEnviando(true)
    try {
      await pedir(`/api/admin/contabilidad/externas/${x.id}`, { method: 'PATCH', body: JSON.stringify({ accion: 'cobrar', antes: x.estado, cobrada_en: fecha, metodo_cobro: metodo, referencia: referencia || undefined, adjunto: adjunto || undefined }) })
      toast.success('Marcada como cobrada.'); onListo()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setEnviando(false) }
  }
  return (
    <div className="mt-2 space-y-3 rounded-lg border bg-muted/30 p-3" data-cobro-externa>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label htmlFor={`cb-f-${x.id}`} className={etiqueta}>Fecha en que te pagaron</label><input id={`cb-f-${x.id}`} type="date" className={campo} value={fecha} min={x.fecha} max={fechaLocalISO()} onChange={(e) => setFecha(e.target.value)} /></div>
        <div><label htmlFor={`cb-m-${x.id}`} className={etiqueta}>Cómo</label><select id={`cb-m-${x.id}`} className={campo} value={metodo} onChange={(e) => setMetodo(e.target.value as 'efectivo' | 'transferencia')}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></div>
        <div><label htmlFor={`cb-r-${x.id}`} className={etiqueta}>Referencia <span className="font-normal text-muted-foreground">(opcional)</span></label><input id={`cb-r-${x.id}`} className={campo} value={referencia} maxLength={120} onChange={(e) => setReferencia(e.target.value)} autoComplete="off" /></div>
      </div>
      <SubirComprobante pedir={pedir} valor={adjunto} onCambio={setAdjunto} etiqueta="Nota, recibo o transferencia" />
      <div className="flex gap-2"><Button type="button" size="sm" disabled={!fecha || enviando} onClick={() => { void cobrar() }} data-confirmar-cobro>{enviando ? <><Loader2 className="animate-spin" aria-hidden /> Guardando…</> : 'Marcar como cobrada'}</Button><Button type="button" size="sm" variant="outline" onClick={onCancelar} disabled={enviando}>Cancelar</Button></div>
    </div>
  )
}

function FormularioDeAnulacion({ x, pedir, onListo, onCancelar }: { x: ExternaContable; pedir: Pedir; onListo: () => void; onCancelar: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function anular() {
    setEnviando(true)
    try { await pedir(`/api/admin/contabilidad/externas/${x.id}`, { method: 'PATCH', body: JSON.stringify({ accion: 'anular', antes: x.estado, motivo }) }); toast.success('Anulada.'); onListo() } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo anular.') } finally { setEnviando(false) }
  }
  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-muted/30 p-3" data-anular-externa>
      <label htmlFor={`an-${x.id}`} className={etiqueta}>Motivo (mínimo 10 caracteres)</label>
      <input id={`an-${x.id}`} className={campo} value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" />
      <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={motivo.trim().length < 10 || enviando} onClick={() => { void anular() }}>Anular comisión</Button><Button type="button" size="sm" variant="outline" onClick={onCancelar} disabled={enviando}>Cancelar</Button></div>
    </div>
  )
}

export default function ComisionExterna({ pedir }: { pedir: Pedir }) {
  const [externas, setExternas] = useState<ExternaContable[] | null>(null)
  const [colaboradores, setColaboradores] = useState<ColaboradorFila[]>([])
  const [error, setError] = useState('')
  const [vuelta, setVuelta] = useState(0)
  const recargar = useCallback(() => setVuelta((n) => n + 1), [])

  const [fecha, setFecha] = useState(fechaLocalISO)
  const [descripcion, setDescripcion] = useState('')
  const [tipo, setTipo] = useState<TipoDeExterna>('renta')
  const [colaboradorId, setColaboradorId] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [parte, setParte] = useState('')
  const [total, setTotal] = useState('')
  const [porcentaje, setPorcentaje] = useState('')
  const [cobrada, setCobrada] = useState(false)
  const [cobradaEn, setCobradaEn] = useState(fechaLocalISO)
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [referencia, setReferencia] = useState('')
  const [adjunto, setAdjunto] = useState<string | null>(null)
  const [clave, setClave] = useState(nuevaClave)
  const [enviando, setEnviando] = useState(false)
  const [cobrando, setCobrando] = useState<string | null>(null)
  const [anulando, setAnulando] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    pedir<{ externas?: ExternaContable[] }>('/api/admin/contabilidad/libro')
      .then((r) => { if (vivo) { setExternas(r.externas ?? []); setError('') } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron cargar las comisiones externas.') })
    pedir<{ colaboradores: ColaboradorFila[] }>('/api/admin/contabilidad/colaboradores').then((r) => { if (vivo) setColaboradores(r.colaboradores ?? []) }).catch(() => { /* el directorio es opcional */ })
    return () => { vivo = false }
  }, [pedir, vuelta])

  const nombreDe = useMemo(() => new Map(colaboradores.map((c) => [c.id, c.nombre])), [colaboradores])
  const listo = descripcion.trim().length >= 3 && parte.trim() !== '' && fecha !== '' && (!cobrada || cobradaEn !== '')

  async function guardar() {
    setEnviando(true)
    try {
      await pedir('/api/admin/contabilidad/externas', {
        method: 'POST',
        body: JSON.stringify({ fecha, descripcion, tipo, parte_pesos: parte, total_pesos: total || undefined, porcentaje: porcentaje || undefined, colaborador_id: colaboradorId || undefined, contraparte: !colaboradorId && contraparte.trim() ? contraparte : undefined, cobrada: cobrada || undefined, cobrada_en: cobrada ? cobradaEn : undefined, metodo_cobro: cobrada ? metodo : undefined, referencia: referencia || undefined, adjunto: adjunto || undefined, clave_idempotencia: clave }),
      })
      toast.success(cobrada ? 'Comisión externa registrada y cobrada.' : 'Comisión externa registrada (por cobrar).')
      setDescripcion(''); setParte(''); setTotal(''); setPorcentaje(''); setReferencia(''); setAdjunto(null); setContraparte(''); setColaboradorId(''); setCobrada(false); setClave(nuevaClave())
      recargar()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo registrar.') } finally { setEnviando(false) }
  }

  return (
    <div className="space-y-6" data-comision-externa>
      <p className="max-w-3xl text-sm text-muted-foreground">Para un trato que <strong>no viene de una propiedad del sitio</strong>: un cliente te pidió algo, lo conseguiste con otra persona y te llevas tu parte. Escribe qué fue y cuánto te tocó; lo demás es opcional. No guardes el nombre del cliente: basta una descripción.</p>

      <section aria-labelledby="ext-titulo" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" data-formulario-externa>
        <h2 id="ext-titulo" className="font-heading text-lg font-semibold">Registrar una comisión externa</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label htmlFor="ex-desc" className={etiqueta}>¿Qué pasó?</label><input id="ex-desc" className={campo} value={descripcion} maxLength={200} onChange={(e) => setDescripcion(e.target.value)} autoComplete="off" placeholder="Cliente buscaba casa en Cañada, 3 recámaras" /><p className="mt-1 text-xs text-muted-foreground">Sin nombres de clientes, correos ni teléfonos.</p></div>
          <fieldset><legend className={etiqueta}>Fue una</legend><div className="flex gap-4 text-sm">{TIPOS_DE_EXTERNA.map((t) => <label key={t} className="flex items-center gap-2"><input type="radio" name="ex-tipo" checked={tipo === t} onChange={() => setTipo(t)} />{ETIQUETA_TIPO_DE_EXTERNA[t]}</label>)}</div></fieldset>
          <div><label htmlFor="ex-fecha" className={etiqueta}>Fecha del trato</label><input id="ex-fecha" type="date" className={campo} value={fecha} max={fechaLocalISO()} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="sm:col-span-2">
            <label htmlFor="ex-colab" className={etiqueta}>¿Con quién la compartiste? <span className="font-normal text-muted-foreground">(opcional)</span></label>
            <select id="ex-colab" className={campo} value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} data-externa-colaborador>
              <option value="">{colaboradores.length ? 'Nadie del directorio / escribir abajo' : 'Aún no hay colaboradores en el directorio'}</option>
              {colaboradores.filter((c) => c.activo).map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.empresa ? ` · ${c.empresa}` : ''}</option>)}
            </select>
            {!colaboradorId && <input aria-label="Nombre de quien compartió la comisión" className={`${campo} mt-2`} value={contraparte} maxLength={120} onChange={(e) => setContraparte(e.target.value)} autoComplete="off" placeholder="Inmobiliaria o asesor (solo el nombre)" />}
          </div>
          <div><label htmlFor="ex-parte" className={etiqueta}>Lo que le tocó a VIVE BIEN (MXN)</label><input id="ex-parte" className={`${campo} text-right tabular-nums`} inputMode="decimal" value={parte} onChange={(e) => setParte(e.target.value)} autoComplete="off" placeholder="10,000.00" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="ex-total" className={etiqueta}>Comisión total <span className="font-normal text-muted-foreground">(opc.)</span></label><input id="ex-total" className={`${campo} text-right tabular-nums`} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} autoComplete="off" placeholder="20,000.00" /></div>
            <div><label htmlFor="ex-pct" className={etiqueta}>% de VIVE BIEN <span className="font-normal text-muted-foreground">(opc.)</span></label><input id="ex-pct" className={`${campo} text-right tabular-nums`} inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} autoComplete="off" placeholder="50" /></div>
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={cobrada} onChange={(e) => setCobrada(e.target.checked)} data-ya-cobrada />Ya me la pagaron</label>
            {cobrada && (
              <div className="mt-2 grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3" data-datos-cobro>
                <div><label htmlFor="ex-cobro" className={etiqueta}>Fecha en que te pagaron</label><input id="ex-cobro" type="date" className={campo} value={cobradaEn} min={fecha} max={fechaLocalISO()} onChange={(e) => setCobradaEn(e.target.value)} /></div>
                <div><label htmlFor="ex-metodo" className={etiqueta}>Cómo</label><select id="ex-metodo" className={campo} value={metodo} onChange={(e) => setMetodo(e.target.value as 'efectivo' | 'transferencia')}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></div>
                <div><label htmlFor="ex-ref" className={etiqueta}>Referencia <span className="font-normal text-muted-foreground">(opcional)</span></label><input id="ex-ref" className={campo} value={referencia} maxLength={120} onChange={(e) => setReferencia(e.target.value)} autoComplete="off" /></div>
              </div>
            )}
          </div>
          <div className="sm:col-span-2"><SubirComprobante pedir={pedir} valor={adjunto} onCambio={setAdjunto} etiqueta="Nota, recibo o transferencia de ellos" ayuda="Por si te dan un comprobante. Se guarda en un almacén privado; puedes agregarlo después al marcarla como cobrada." /></div>
        </div>
        <Button type="button" disabled={!listo || enviando} onClick={() => { void guardar() }} data-registrar-externa>{enviando ? <><Loader2 className="animate-spin" aria-hidden /> Registrando…</> : 'Registrar comisión externa'}</Button>
      </section>

      <section aria-labelledby="ext-lista" className="space-y-3">
        <h2 id="ext-lista" className="font-heading text-lg font-semibold">Comisiones externas registradas</h2>
        {error && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-error-externas>{error}</p>}
        {externas === null && !error && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Cargando…</p>}
        {externas !== null && externas.length === 0 && <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground" data-externas-vacio>Todavía no hay comisiones externas. Aquí aparecerá cada una que registres, con lo que te tocó y si ya te la pagaron.</p>}
        <ul className="space-y-3">
          {(externas ?? []).map((x) => (
            <li key={x.id} className="rounded-xl border bg-card p-4" data-externa={x.id} data-estado={x.estado}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`font-medium leading-snug ${x.estado === 'anulada' ? 'line-through' : ''}`}>{x.descripcion}</p>
                  <p className="text-xs text-muted-foreground">{ETIQUETA_TIPO_DE_EXTERNA[x.tipo]} · {x.fecha}{x.colaborador_id ? ` · con ${nombreDe.get(x.colaborador_id) ?? 'un colaborador'}` : x.contraparte ? ` · con ${x.contraparte}` : ''}{x.porcentaje_bp ? ` · ${x.porcentaje_bp / 100} %` : ''}</p>
                </div>
                <div className="text-right"><p className="text-lg font-semibold tabular-nums" data-parte>{mxn(x.parte_centavos)}</p><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO[x.estado].clase}`}>{ESTADO[x.estado].texto}</span></div>
              </div>
              {(x.estado === 'cobrada' || x.referencia || x.adjunto) && (
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {x.estado === 'cobrada' && <span>Cobrada el {x.cobrada_en} · {x.metodo_cobro === 'transferencia' ? 'transferencia' : 'efectivo'}</span>}
                  {x.referencia && <span>Ref. {x.referencia}</span>}
                  {x.adjunto && <VerComprobante pedir={pedir} ruta={x.adjunto} />}
                </p>
              )}
              {x.estado !== 'anulada' && cobrando !== x.id && anulando !== x.id && (
                <p className="mt-2 flex gap-4 text-xs">
                  {x.estado === 'por_cobrar' && <button type="button" className="underline" onClick={() => { setCobrando(x.id); setAnulando(null) }} data-cobrar-externa>Marcar como cobrada</button>}
                  <button type="button" className="underline" onClick={() => { setAnulando(x.id); setCobrando(null) }}>Anular</button>
                </p>
              )}
              {cobrando === x.id && <FormularioDeCobro x={x} pedir={pedir} onListo={() => { setCobrando(null); recargar() }} onCancelar={() => setCobrando(null)} />}
              {anulando === x.id && <FormularioDeAnulacion x={x} pedir={pedir} onListo={() => { setAnulando(null); recargar() }} onCancelar={() => setAnulando(null)} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
