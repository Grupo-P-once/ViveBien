'use client'

import { useMemo, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { correccionesPosibles, diarioACsv, ETIQUETA_CATEGORIA, filtrarDiario, type CuentaDeGasto, type Linea, fechaLocalISO } from '@/lib/contabilidad'
import { mxn } from './GraficasContables'

/**
 * Libro diario (25-oct-2026): todo lo que entra y lo que sale, de lo más reciente a lo más antiguo. Las líneas de comisión vienen de las operaciones;
 * las demás, de los movimientos registrados aquí. Lo registrado no se edita: un gasto se corrige con una DEVOLUCIÓN (el proveedor regresa dinero) o se
 * ANULA (no debió registrarse); los dos son asientos nuevos, vinculados al original, y el original sigue a la vista.
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
const campo = 'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm'
const ETIQ_ESTADO: Record<Linea['estado'], string> = { cobrado: 'Cobrado', por_cobrar: 'Por cobrar', comprometido: 'Comprometido', registrado: 'Registrado', anulado: 'Anulado' }
const TONO_ESTADO: Record<Linea['estado'], string> = { cobrado: 'bg-emerald-100 text-emerald-900', por_cobrar: 'bg-amber-100 text-amber-900', comprometido: 'bg-amber-100 text-amber-900', registrado: 'bg-muted text-foreground', anulado: 'bg-muted text-muted-foreground line-through' }
const hoyISO = () => fechaLocalISO()
const nuevaClave = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
const POR_PAGINA = 80

export default function LibroDiario({ lineas, cuentas, pedir, onCambio, periodo, constancias = {} }: { lineas: Linea[]; cuentas: CuentaDeGasto[]; pedir: Pedir; onCambio: () => void; periodo: { desde?: string; hasta?: string }; constancias?: Record<string, { folio: string }> }) {
  const [texto, setTexto] = useState('')
  const [sentido, setSentido] = useState<'' | 'entra' | 'sale'>('')
  const [categoria, setCategoria] = useState('')
  const [anuladas, setAnuladas] = useState(true)
  const [abierta, setAbierta] = useState<{ id: string; tipo: 'devolucion' | 'anulacion' } | null>(null)
  const [limite, setLimite] = useState(POR_PAGINA)

  const visibles = useMemo(() => filtrarDiario(lineas, { ...periodo, texto, sentido, categoria, incluirAnuladas: anuladas }), [lineas, periodo, texto, sentido, categoria, anuladas])
  const categorias = useMemo(() => [...new Set(lineas.map((l) => l.categoria))].sort((a, b) => (ETIQUETA_CATEGORIA[a] ?? a).localeCompare(ETIQUETA_CATEGORIA[b] ?? b)), [lineas])
  const sumaEntra = visibles.filter((l) => l.vigente && l.sentido === 'entra').reduce((s, l) => s + l.monto, 0)
  // Un pago al colaborador no se suma otra vez: su parte ya cuenta como salida desde que se compromete.
  const sumaSale = visibles.filter((l) => l.vigente && l.sentido === 'sale' && l.clase !== 'pago_colaborador').reduce((s, l) => s + l.monto, 0)

  function descargar() {
    const blob = new Blob(['﻿' + diarioACsv(visibles, cuentas)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `libro-diario-${hoyISO()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4" data-libro-diario>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1"><label htmlFor="ld-texto" className="mb-1 block text-xs font-semibold">Buscar</label><input id="ld-texto" className={campo} value={texto} onChange={(e) => { setTexto(e.target.value); setLimite(POR_PAGINA) }} autoComplete="off" placeholder="Concepto, propiedad o referencia" /></div>
        <div><label htmlFor="ld-sentido" className="mb-1 block text-xs font-semibold">Movimiento</label><select id="ld-sentido" className={campo} value={sentido} onChange={(e) => setSentido(e.target.value as '' | 'entra' | 'sale')}><option value="">Todos</option><option value="entra">Entra</option><option value="sale">Sale</option></select></div>
        <div><label htmlFor="ld-cat" className="mb-1 block text-xs font-semibold">Categoría</label><select id="ld-cat" className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="">Todas</option>{categorias.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c] ?? c}</option>)}</select></div>
        <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={anuladas} onChange={(e) => setAnuladas(e.target.checked)} />Mostrar anuladas</label>
        <Button type="button" variant="outline" size="sm" onClick={descargar} disabled={!visibles.length} data-descargar-csv><Download aria-hidden /> Descargar CSV</Button>
      </div>

      {visibles.length === 0 ? <p className="text-sm text-muted-foreground">{lineas.length === 0 ? 'El libro está vacío: aparecerá aquí cada comisión que se registre y cada gasto que captures.' : 'Nada coincide con los filtros.'}</p> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Libro diario: lo que entra y lo que sale</caption>
            <thead className="bg-muted/50 text-xs"><tr>
              <th scope="col" className="px-3 py-2 font-semibold">Fecha</th><th scope="col" className="px-3 py-2 font-semibold">Concepto</th><th scope="col" className="px-3 py-2 font-semibold">Categoría</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Entra</th><th scope="col" className="px-3 py-2 text-right font-semibold">Sale</th><th scope="col" className="px-3 py-2 font-semibold">Estado</th>
            </tr></thead>
            <tbody>
              {visibles.slice(0, limite).map((l) => {
                const corr = correccionesPosibles(l, lineas)
                return (
                  <FilaDeLinea key={l.id} l={l} corr={corr} folio={constancias[l.id.replace(/^mov:/, '')]?.folio ?? null} abierta={abierta?.id === l.id ? abierta.tipo : null}
                    onAbrir={(tipo) => setAbierta({ id: l.id, tipo })} onCerrar={() => setAbierta(null)} pedir={pedir} onHecho={() => { setAbierta(null); onCambio() }} />
                )
              })}
            </tbody>
            <tfoot className="bg-muted/30 text-sm font-semibold"><tr>
              <td className="px-3 py-2" colSpan={3}>Total de lo que se ve{visibles.some((l) => !l.vigente) ? ' (sin contar lo anulado)' : ''}</td>
              <td className="px-3 py-2 text-right tabular-nums" data-total-entra>{mxn(sumaEntra)}</td><td className="px-3 py-2 text-right tabular-nums" data-total-sale>{mxn(sumaSale)}</td><td className="px-3 py-2 text-xs font-normal text-muted-foreground">Queda {mxn(sumaEntra - sumaSale)}</td>
            </tr></tfoot>
          </table>
        </div>
      )}
      {visibles.length > limite && <div className="text-center"><Button type="button" variant="outline" size="sm" onClick={() => setLimite((n) => n + POR_PAGINA)}>Mostrar más ({visibles.length - limite} restantes)</Button></div>}
    </div>
  )
}

function FilaDeLinea({ l, corr, folio, abierta, onAbrir, onCerrar, pedir, onHecho }: {
  l: Linea; corr: ReturnType<typeof correccionesPosibles>; folio: string | null; abierta: 'devolucion' | 'anulacion' | null
  onAbrir: (t: 'devolucion' | 'anulacion') => void; onCerrar: () => void; pedir: Pedir; onHecho: () => void
}) {
  return (
    <>
      <tr className={`border-t align-top ${l.vigente ? '' : 'text-muted-foreground'}`} data-linea={l.id} data-vigente={l.vigente ? 'si' : 'no'}>
        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{l.fecha}</td>
        <td className="px-3 py-2">
          <p className={`font-medium ${l.vigente ? '' : 'line-through'}`}>{l.concepto}</p>
          <p className={`mt-1 text-sm font-semibold tabular-nums sm:hidden ${l.sentido === 'entra' ? 'text-emerald-800' : ''}`} data-monto-movil>{l.sentido === 'entra' ? '+' : '−'}{mxn(l.monto)}</p>
          <p className="text-xs text-muted-foreground">
            {l.propiedadEtiqueta && l.origen === 'manual' ? `${l.propiedadEtiqueta} · ` : ''}{l.referencia ? `Ref. ${l.referencia}` : ''}{l.motivo ? ` · ${l.motivo}` : ''}
            {l.clase === 'devolucion' ? ' · devolución' : ''}{l.clase === 'anulacion' ? ' · anulación (contra-asiento)' : ''}
          </p>
          {folio && <p className="mt-1 text-xs"><a className="underline" href={`/admin/contabilidad/constancia/${folio}`} data-constancia-enlace>Constancia {folio}</a></p>}
          {(corr.devolver || corr.anular) && (
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {corr.devolver && <button type="button" className="underline" onClick={() => onAbrir('devolucion')} data-accion="devolucion">Registrar devolución</button>}
              {corr.anular && <button type="button" className="underline" onClick={() => onAbrir('anulacion')} data-accion="anulacion">Anular</button>}
            </p>
          )}
        </td>
        <td className="px-3 py-2 text-xs">{ETIQUETA_CATEGORIA[l.categoria] ?? l.categoria}</td>
        <td className="px-3 py-2 text-right tabular-nums">{l.sentido === 'entra' ? mxn(l.monto) : ''}</td>
        <td className="px-3 py-2 text-right tabular-nums">{l.sentido === 'sale' ? mxn(l.monto) : ''}</td>
        <td className="px-3 py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${TONO_ESTADO[l.estado]}`}>{ETIQ_ESTADO[l.estado]}</span></td>
      </tr>
      {abierta && <tr className="border-t bg-muted/30"><td colSpan={6} className="px-3 py-3"><FormularioCorreccion l={l} tipo={abierta} restante={corr.restante} pedir={pedir} onCerrar={onCerrar} onHecho={onHecho} /></td></tr>}
    </>
  )
}

function FormularioCorreccion({ l, tipo, restante, pedir, onCerrar, onHecho }: { l: Linea; tipo: 'devolucion' | 'anulacion'; restante: number; pedir: Pedir; onCerrar: () => void; onHecho: () => void }) {
  const [monto, setMonto] = useState((restante / 100).toFixed(2).replace(/\.00$/, ''))
  const [fecha, setFecha] = useState(hoyISO)
  const [motivo, setMotivo] = useState('')
  const [clave] = useState(() => nuevaClave(tipo === 'devolucion' ? 'dev' : 'anu'))
  const [enviando, setEnviando] = useState(false)
  const esAnulacion = tipo === 'anulacion'
  const listo = motivo.trim().length >= 10 && monto.trim() !== ''

  async function enviar() {
    setEnviando(true)
    try {
      await pedir('/api/admin/contabilidad/movimientos', {
        method: 'POST',
        body: JSON.stringify({ clase: tipo, monto_pesos: monto, fecha, concepto: esAnulacion ? `Anulación: ${l.concepto}`.slice(0, 200) : `Devolución: ${l.concepto}`.slice(0, 200), reverso_de: l.id.replace(/^mov:/, ''), motivo, clave_idempotencia: clave }),
      })
      toast.success(esAnulacion ? 'Anulado. El original sigue visible, marcado.' : 'Devolución registrada.')
      onHecho()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo registrar.') } finally { setEnviando(false) }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[10rem_10rem_minmax(0,1fr)]" data-correccion={tipo}>
      <div><label htmlFor={`m-${l.id}`} className="mb-1 block text-xs font-semibold">{esAnulacion ? 'Monto que se revierte' : 'Monto devuelto (MXN)'}</label><input id={`m-${l.id}`} className={`${campo} text-right tabular-nums`} inputMode="decimal" value={monto} readOnly={esAnulacion} onChange={(e) => setMonto(e.target.value)} autoComplete="off" /></div>
      <div><label htmlFor={`f-${l.id}`} className="mb-1 block text-xs font-semibold">Fecha</label><input id={`f-${l.id}`} type="date" className={campo} value={fecha} max={hoyISO()} min={l.fecha} onChange={(e) => setFecha(e.target.value)} /></div>
      <div><label htmlFor={`t-${l.id}`} className="mb-1 block text-xs font-semibold">Motivo (10 a 300 caracteres)</label><input id={`t-${l.id}`} className={campo} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" placeholder={esAnulacion ? 'Ej.: se capturó dos veces' : 'Ej.: la lona llegó rota, el proveedor devolvió'} /></div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <Button type="button" size="sm" disabled={!listo || enviando} onClick={() => { void enviar() }} data-confirmar-correccion>{enviando ? <><Loader2 className="animate-spin" aria-hidden /> Registrando…</> : esAnulacion ? 'Anular' : 'Registrar devolución'}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCerrar}>Cancelar</Button>
        <p className="text-xs text-muted-foreground">{esAnulacion ? 'Revierte todo lo que queda de este movimiento.' : `Máximo ${mxn(restante)}.`} No se edita nada: se agrega un asiento vinculado.</p>
      </div>
    </div>
  )
}
