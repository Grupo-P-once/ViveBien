'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { centavosDePesos, type EstadoAcreditacion } from '@/lib/comision-calculo'
import { fechaLocalISO } from '@/lib/contabilidad'
import { calcularDesdeEntrada, cuerpoDeAjustes, entradaInicial, type EntradaCalculadora } from '@/lib/comision-formulario'
import { nombreDe } from '@/lib/propiedad-publica'
import type { PropiedadPanel } from '@/lib/admin/propiedades'
import { pesos } from './GraficasComisiones'
import { CuentaDeLaOperacion, PanelAjustes } from './CalculadoraCierre'
import { OpinionDeLaIA } from '@/components/admin/contabilidad/AsesorIA'
import { useSesion } from '@/components/admin/sesion'

/**
 * «Registrar un cierre» — guiado (26-oct-2026): 1) elegir la propiedad, 2) los datos del cierre (precio total y fecha, ya prellenados con los de la propiedad),
 * 3) el trato real (porcentaje o meses, comisión compartida, gastos) y, a la derecha, la CUENTA de la operación en vivo: lo que entra, lo que sale y lo que queda.
 * El cálculo de la pantalla usa el mismo código que el servidor, que de todos modos lo recalcula al guardar (el navegador no manda importes, solo términos).
 *
 * Pensado a partir de cómo lo resuelven las herramientas de comisiones inmobiliarias: «marcar como vendida → precio final y fecha de cierre → el sistema
 * calcula y reparte → un segundo paso confirma el cobro».
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
type Contexto = {
  propiedad: { id: string; folio: string | null; titulo: string | null; operacion: string | null; precioCentavos: number | null; estatus: string | null; estadoPub: string | null }
  exenta: null | 'sin_dueno' | 'sin_comision'
  cuentaEncontrada: boolean
  origenTipo: string | null
  participa: boolean
  acreditacion: EstadoAcreditacion
  motorEncendido: boolean
}

const hoyISO = () => fechaLocalISO()
const nuevaClave = () => `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
const campo = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm'
const etiqueta = 'mb-1 block text-xs font-semibold'
const Numero = ({ n }: { n: number }) => <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-foreground text-xs text-background" aria-hidden>{n}</span>

const aPesosTexto = (centavos: number | null) => (centavos ? (centavos / 100).toFixed(2).replace(/\.00$/, '') : '')

export default function FormularioCierre({ pedir, propiedades, inicial, onRegistrada }: {
  pedir: Pedir
  propiedades: PropiedadPanel[]
  inicial?: { propiedad?: string; tipo?: 'venta' | 'renta' }
  onRegistrada: (id: string | null) => void
}) {
  const { perfil } = useSesion()
  const [propiedadId, setPropiedadId] = useState(inicial?.propiedad ?? '')
  const [buscar, setBuscar] = useState('')
  const [ctx, setCtx] = useState<Contexto | null>(null)
  const [cargandoCtx, setCargandoCtx] = useState(false)
  const [errorCtx, setErrorCtx] = useState('')
  const [entrada, setEntrada] = useState<EntradaCalculadora>(() => entradaInicial(inicial?.tipo ?? 'venta', '', false))
  const [fecha, setFecha] = useState(hoyISO)
  const [atribuible, setAtribuible] = useState<'' | 'si' | 'no'>('')
  const [ref, setRef] = useState('')
  const [clave] = useState(nuevaClave)
  const [enviando, setEnviando] = useState(false)

  const cambiar = (c: Partial<EntradaCalculadora>) => setEntrada((e) => ({ ...e, ...c }))
  const elegida = useMemo(() => propiedades.find((p) => p.id === propiedadId) ?? null, [propiedades, propiedadId])
  const candidatas = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return propiedades.filter((p) => p.estatus !== 'eliminada' && (!q || `${p.folio ?? ''} ${nombreDe(p)}`.toLowerCase().includes(q))).slice(0, 8)
  }, [propiedades, buscar])

  // Al elegir una propiedad se lee su contexto y se prellenan el tipo, el precio y si el origen declara un colaborador.
  useEffect(() => {
    if (!propiedadId) { setCtx(null); return }
    let vivo = true
    setCargandoCtx(true); setErrorCtx('')
    pedir<Contexto>(`/api/admin/comision/contexto?propiedad_id=${encodeURIComponent(propiedadId)}`)
      .then((c) => {
        if (!vivo) return
        setCtx(c)
        const sugerido = inicial?.tipo && inicial.propiedad === propiedadId ? inicial.tipo : c.propiedad.operacion === 'renta' ? 'renta' : 'venta'
        setEntrada(entradaInicial(sugerido, aPesosTexto(c.propiedad.precioCentavos), c.participa))
      })
      .catch((e) => { if (vivo) { setCtx(null); setErrorCtx(e instanceof Error ? e.message : 'No se pudo leer la propiedad.') } })
      .finally(() => { if (vivo) setCargandoCtx(false) })
    return () => { vivo = false }
  }, [pedir, propiedadId, inicial?.propiedad, inicial?.tipo])

  const resultado = useMemo(
    () => calcularDesdeEntrada(entrada, { participaEnOrigen: ctx?.participa ?? false, acreditacion: ctx?.acreditacion ?? 'sin_folio', atribuible: atribuible === 'si' }),
    [entrada, ctx, atribuible],
  )
  const calculo = resultado.calculo

  const bloqueo = !ctx ? null
    : ctx.exenta === 'sin_comision' ? 'La cuenta dueña está exenta de comisión (permiso «sin comisión»).'
    : !ctx.cuentaEncontrada ? 'No se encontró la cuenta dueña: sin saber si está exenta no se registra la operación.'
    : !ctx.origenTipo ? 'Falta registrar cómo se maneja la propiedad (trato directo o agente). Ábrela en «Notas/Comisión» y declara el origen.'
    : !ctx.motorEncendido ? 'El módulo de comisiones está apagado: no se puede registrar todavía.'
    : null

  const faltaRef = atribuible === 'si' && !ref.trim()
  const puedeGuardar = Boolean(ctx && !bloqueo && calculo && resultado.listo && atribuible && !faltaRef && fecha && fecha <= hoyISO())
  const baseCentavos = centavosDePesos(entrada.base)
  const diferencia = entrada.tipo === (ctx?.propiedad.operacion === 'renta' ? 'renta' : 'venta') && ctx?.propiedad.precioCentavos && baseCentavos ? Math.round(((baseCentavos - ctx.propiedad.precioCentavos) / ctx.propiedad.precioCentavos) * 1000) / 10 : null

  async function guardar() {
    if (!puedeGuardar) return
    setEnviando(true)
    try {
      const r = await pedir<{ id?: string; repetida?: boolean }>('/api/admin/comision/operaciones', {
        method: 'POST',
        body: JSON.stringify({
          propiedad_id: propiedadId, tipo: entrada.tipo, base_pesos: entrada.base, fecha_cierre: fecha, atribuible: atribuible === 'si', atribucion_ref: ref, clave_idempotencia: clave,
          ...cuerpoDeAjustes(entrada, resultado.separaDeLaRegla),
        }),
      })
      toast.success(r.repetida ? 'Ese cierre ya estaba registrado.' : 'Cierre registrado. Falta confirmar el cobro.')
      onRegistrada(r.id ?? null)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo registrar el cierre.') } finally { setEnviando(false) }
  }

  const razonFalta = !atribuible ? 'Indica si la operación es atribuible.' : faltaRef ? 'Falta la referencia de la atribución.' : resultado.incompleto ? 'Falta el precio total.' : resultado.error ? 'Corrige los datos marcados.' : !resultado.motivoValido ? 'Escribe el motivo del cambio a la regla.' : ''

  return (
    <div className="space-y-6" data-formulario-cierre>
      <section aria-labelledby="paso1" className="space-y-3">
        <h3 id="paso1" className="font-heading text-base font-semibold"><Numero n={1} />Propiedad</h3>
        {elegida ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm" data-propiedad-elegida={elegida.id}>
            <div className="min-w-0"><p className="truncate font-semibold">{nombreDe(elegida)}</p><p className="text-xs text-muted-foreground">{elegida.folio ?? 'sin folio'} · {elegida.operacion === 'renta' ? 'Renta' : 'Venta'}{elegida.precio ? ` · anunciada en ${pesos(Number(elegida.precio) * 100)}` : ''}</p></div>
            <Button type="button" variant="outline" size="sm" onClick={() => { setPropiedadId(''); setCtx(null); setBuscar('') }}>Cambiar propiedad</Button>
          </div>
        ) : (
          <div>
            <label htmlFor="cf-buscar" className={etiqueta}>Busca por folio o por título</label>
            <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><input id="cf-buscar" className={`${campo} pl-9`} value={buscar} onChange={(e) => setBuscar(e.target.value)} autoComplete="off" placeholder="VB-2026-00001 o «Casa en…»" /></div>
            <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5" aria-label="Propiedades">
              {candidatas.length === 0 && <li className="text-sm text-muted-foreground">No hay propiedades que coincidan.</li>}
              {candidatas.map((p) => (
                <li key={p.id}><button type="button" onClick={() => setPropiedadId(p.id)} data-elegir-propiedad={p.id} className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted">
                  <span className="min-w-0 truncate"><span className="font-medium">{nombreDe(p)}</span><span className="ml-2 text-xs text-muted-foreground">{p.folio}</span></span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.operacion === 'renta' ? 'Renta' : 'Venta'}{p.estatus === 'vendida' ? ' · vendida' : p.estatus === 'rentada' ? ' · rentada' : ''}</span>
                </button></li>
              ))}
            </ul>
          </div>
        )}
        {cargandoCtx && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Leyendo los datos de la propiedad…</p>}
        {errorCtx && <p role="alert" className="text-sm text-destructive">{errorCtx}</p>}
        {bloqueo && <p role="alert" data-bloqueo className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{bloqueo}</p>}
      </section>

      {ctx && !ctx.exenta && ctx.cuentaEncontrada && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <section aria-labelledby="paso2" className="space-y-3">
              <h3 id="paso2" className="font-heading text-base font-semibold"><Numero n={2} />Datos del cierre</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset className="sm:col-span-2">
                  <legend className={etiqueta}>¿Qué se cerró?</legend>
                  <div className="flex gap-4 text-sm">
                    {(['venta', 'renta'] as const).map((t) => (
                      <label key={t} className="flex items-center gap-2"><input type="radio" name="cf-tipo" checked={entrada.tipo === t} onChange={() => cambiar({ tipo: t, ...(t === ctx.propiedad.operacion || !entrada.base ? { base: aPesosTexto(ctx.propiedad.precioCentavos) } : {}) })} />{t === 'venta' ? 'Venta' : 'Renta'}</label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <label htmlFor="cf-base" className={etiqueta}>{entrada.tipo === 'venta' ? 'Precio total de la venta (MXN)' : 'Renta mensual (MXN)'}</label>
                  <input id="cf-base" className={`${campo} tabular-nums`} inputMode="decimal" value={entrada.base} onChange={(e) => cambiar({ base: e.target.value })} autoComplete="off" aria-describedby="cf-base-ayuda" />
                  <p id="cf-base-ayuda" className="mt-1 text-xs text-muted-foreground">
                    {ctx.propiedad.precioCentavos ? `Precio anunciado: ${pesos(ctx.propiedad.precioCentavos)}.` : 'La propiedad no trae precio anunciado.'}
                    {diferencia !== null && diferencia !== 0 && <> Se cerró {Math.abs(diferencia)} % {diferencia < 0 ? 'por debajo' : 'por encima'} de lo anunciado.</>}
                  </p>
                </div>
                <div>
                  <label htmlFor="cf-fecha" className={etiqueta}>Fecha de cierre</label>
                  <input id="cf-fecha" type="date" className={campo} value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} aria-describedby="cf-fecha-ayuda" />
                  <p id="cf-fecha-ayuda" className="mt-1 text-xs text-muted-foreground">{entrada.tipo === 'venta' ? 'La del contrato de compraventa firmado.' : 'La de la firma del contrato y la primera renta recibida.'}</p>
                </div>
                <fieldset className="sm:col-span-2">
                  <legend className={etiqueta}>¿La operación viene de una consulta, visita o referencia de VIVE BIEN? (atribución)</legend>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="radio" name="cf-atr" checked={atribuible === 'si'} onChange={() => setAtribuible('si')} />Sí, se puede comprobar</label>
                    <label className="flex items-center gap-2"><input type="radio" name="cf-atr" checked={atribuible === 'no'} onChange={() => setAtribuible('no')} />No</label>
                  </div>
                </fieldset>
                {atribuible === 'si' && (
                  <div className="sm:col-span-2">
                    <label htmlFor="cf-ref" className={etiqueta}>Referencia (identificador de la cita o de la consulta; sin nombres ni teléfonos)</label>
                    <input id="cf-ref" className={campo} value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" placeholder="cita:abc-123" />
                  </div>
                )}
              </div>
            </section>

            <section aria-labelledby="paso3" className="space-y-3">
              <h3 id="paso3" className="font-heading text-base font-semibold"><Numero n={3} />El trato</h3>
              <PanelAjustes valor={entrada} onCambio={cambiar} participaEnOrigen={ctx.participa} acreditacion={ctx.acreditacion} atribuible={atribuible === '' ? null : atribuible === 'si'} resultado={resultado} />
            </section>
          </div>

          <aside aria-label="Cuenta de la operación" className="space-y-3 lg:sticky lg:top-4" data-calculo>
            <CuentaDeLaOperacion resultado={resultado} valor={entrada} />
            <Button type="button" className="w-full" disabled={!puedeGuardar || enviando} onClick={() => { void guardar() }} data-registrar-cierre>
              {enviando ? <><Loader2 className="animate-spin" aria-hidden /> Registrando…</> : 'Registrar cierre'}
            </Button>
            {!puedeGuardar && !bloqueo && razonFalta && <p className="text-xs text-muted-foreground" data-falta>{razonFalta}</p>}
            {perfil.superAdmin && <OpinionDeLaIA pedir={pedir} listo={Boolean(calculo)} cuerpo={{ tipo: entrada.tipo, base_pesos: entrada.base, ...cuerpoDeAjustes(entrada, false) }} />}
          </aside>
        </div>
      )}
    </div>
  )
}
