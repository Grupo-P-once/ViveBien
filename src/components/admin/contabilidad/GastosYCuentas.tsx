'use client'

import { useMemo, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CATEGORIAS_DE_GASTO, ETIQUETA_CATEGORIA, porCuenta, sugerirCategoria, type CuentaDeGasto, type Linea, fechaLocalISO } from '@/lib/contabilidad'
import { nombreDe } from '@/lib/propiedad-publica'
import type { PropiedadPanel } from '@/lib/admin/propiedades'
import type { Relleno } from '@/lib/contabilidad-relleno'
import type { OperacionComision } from '@/lib/comision-resumen'
import type { ColaboradorFila } from '@/lib/contabilidad-externas'
import { montoEnLetra } from '@/lib/contabilidad-constancia'
import { SubirComprobante } from './SubirComprobante'
import Link from 'next/link'
import { mxn } from './GraficasContables'

/**
 * «Gastos y cuentas» (25-oct-2026). A la izquierda, registrar un gasto (o un ingreso extra) en 30 segundos; a la derecha, los LUGARES de gasto: «Meta Ads · cuenta 33839»,
 * «Lonas El Juanito»… con cuánto se ha gastado en cada uno y la opción de desactivarlos. Un gasto mal capturado no se edita: se anula o se devuelve desde el libro diario.
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
const campo = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm'
const etiqueta = 'mb-1 block text-xs font-semibold'
const hoyISO = () => fechaLocalISO()
const nuevaClave = () => `mov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** Lo que dejó el autollenado: se usa como valor INICIAL del formulario (se remonta con `nonce`); la persona lo revisa y lo guarda con el botón de siempre. */
export type ReLlenado = { nonce: number; relleno: Relleno; resumen: string }

export default function GastosYCuentas({ lineas, cuentas, propiedades, pedir, onCambio, relleno, operaciones = [], colaboradores = [], pagoInicial = null, constancias = {} }: {
  lineas: Linea[]; cuentas: CuentaDeGasto[]; propiedades: PropiedadPanel[] | null; pedir: Pedir; onCambio: () => void; relleno?: ReLlenado | null; operaciones?: OperacionComision[]
  /** El directorio de colaboradores (para elegir a quién se le pagó). */ colaboradores?: ColaboradorFila[]
  /** Constancias ya emitidas (por movimiento): sirven para proponer la misma forma de pago que se usó la última vez con ese colaborador. */ constancias?: Record<string, { colaborador_id: string | null; metodo: string }>
  /** Una operación a la que ya se quiere registrar el pago (viene de «Registrar pago y constancia» en Comisiones). */ pagoInicial?: string | null
}) {
  const deMovimiento = relleno?.relleno.tipo === 'movimiento' ? relleno : null
  const deCuenta = relleno?.relleno.tipo === 'cuenta' ? relleno : null
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]" data-gastos-y-cuentas>
      <FormularioGasto key={`m${deMovimiento?.nonce ?? 0}`} cuentas={cuentas} propiedades={propiedades} pedir={pedir} onCambio={onCambio} inicial={deMovimiento} lineas={lineas} operaciones={operaciones} colaboradores={colaboradores} pagoInicial={pagoInicial} constancias={constancias} />
      <PanelDeCuentas key={`c${deCuenta?.nonce ?? 0}`} lineas={lineas} cuentas={cuentas} pedir={pedir} onCambio={onCambio} inicial={deCuenta} />
    </div>
  )
}

type ClaseNueva = 'gasto' | 'ingreso_extra' | 'aportacion_grupo' | 'aportacion_recibida_grupo' | 'pago_colaborador'

/** Lo que falta pagarle a un colaborador de una operación: su parte (entregada o retenida) menos los pagos vigentes ya registrados. */
export function pendienteDeColaborador(o: Pick<OperacionComision, 'id' | 'colaborador_centavos' | 'colaborador_retenido_centavos'>, lineas: Linea[]): number {
  const pagado = lineas.filter((l) => l.vigente && l.clase === 'pago_colaborador' && l.operacionId === o.id).reduce((s, l) => s + l.monto, 0)
  return Math.max(0, o.colaborador_centavos + o.colaborador_retenido_centavos - pagado)
}

function FormularioGasto({ cuentas, propiedades, pedir, onCambio, inicial, lineas, operaciones, colaboradores, pagoInicial, constancias }: { cuentas: CuentaDeGasto[]; propiedades: PropiedadPanel[] | null; pedir: Pedir; onCambio: () => void; inicial: ReLlenado | null; lineas: Linea[]; operaciones: OperacionComision[]; colaboradores: ColaboradorFila[]; pagoInicial: string | null; constancias: Record<string, { colaborador_id: string | null; metodo: string }> }) {
  const ini = inicial?.relleno.tipo === 'movimiento' ? inicial.relleno.campos : null
  const opInicial = pagoInicial ? operaciones.find((o) => o.id === pagoInicial && o.estado !== 'anulada' && pendienteDeColaborador(o, lineas) > 0) ?? null : null
  const [clase, setClase] = useState<ClaseNueva>(opInicial ? 'pago_colaborador' : ini?.clase ?? 'gasto')
  const [operacionId, setOperacionId] = useState(opInicial?.id ?? '')
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [colaboradorId, setColaboradorId] = useState('')
  const [colaboradorNombre, setColaboradorNombre] = useState('')
  const [comprobante, setComprobante] = useState<string | null>(null)
  const [constancia, setConstancia] = useState<{ folio: string } | { error: string; movimientoId: string } | null>(null)
  const [cuentaId, setCuentaId] = useState(ini?.cuenta_id ?? '')
  const [fecha, setFecha] = useState(ini?.fecha ?? hoyISO())
  const [monto, setMonto] = useState(ini?.monto ?? (opInicial ? (pendienteDeColaborador(opInicial, lineas) / 100).toFixed(2) : ''))
  const [concepto, setConcepto] = useState(ini?.concepto ?? (opInicial ? `Pago al colaborador · ${opInicial.propiedad_titulo || opInicial.propiedad_folio || 'operación'}`.slice(0, 200) : ''))
  const [categoria, setCategoria] = useState<string>(ini?.categoria ?? '')
  const [referencia, setReferencia] = useState(ini?.referencia ?? '')
  const [propiedadId, setPropiedadId] = useState(ini?.propiedad_id ?? '')
  const [clave, setClave] = useState(nuevaClave)
  const [enviando, setEnviando] = useState(false)

  const activas = cuentas.filter((c) => c.activa)
  const sugerida = clase === 'gasto' && !categoria ? sugerirCategoria(concepto) : null
  const conPendiente = operaciones.filter((o) => o.estado !== 'anulada' && pendienteDeColaborador(o, lineas) > 0)
  const operacion = conPendiente.find((o) => o.id === operacionId) ?? null
  const listo = monto.trim() !== '' && concepto.trim().length >= 2 && fecha && (clase !== 'gasto' || categoria) && (clase !== 'pago_colaborador' || (operacionId && colaboradorNombre.trim().length >= 2))

  function elegirOperacion(id: string) {
    setOperacionId(id)
    const o = conPendiente.find((x) => x.id === id)
    if (o) {
      setMonto((pendienteDeColaborador(o, lineas) / 100).toFixed(2))
      if (!concepto.trim()) setConcepto(`Pago al colaborador · ${o.propiedad_titulo || o.propiedad_folio || 'operación'}`.slice(0, 200))
    }
  }

  function elegirCuenta(id: string) {
    setCuentaId(id)
    const c = cuentas.find((x) => x.id === id)
    if (c) setCategoria(c.categoria)
  }

  function elegirColaborador(id: string) {
    setColaboradorId(id)
    const c = colaboradores.find((x) => x.id === id)
    if (c) setColaboradorNombre(c.nombre)
    // La misma forma de pago que se usó la última vez con esa persona (las líneas van de la más reciente a la más antigua).
    const previa = lineas.filter((l) => l.clase === 'pago_colaborador' && l.vigente).map((l) => constancias[l.id.replace(/^mov:/, '')]).find((k) => k?.colaborador_id === id)
    if (previa && (previa.metodo === 'efectivo' || previa.metodo === 'transferencia')) setMetodo(previa.metodo)
  }

  /** La constancia es de un pago ya registrado: si falla, el pago NO se pierde y se puede reintentar (una sola por pago). */
  async function crearConstancia(movimientoId: string) {
    try {
      const r = await pedir<{ folio: string }>('/api/admin/contabilidad/constancias', {
        method: 'POST',
        body: JSON.stringify({ movimiento_id: movimientoId, colaborador_nombre: colaboradorNombre, colaborador_id: colaboradorId || undefined, metodo, referencia: referencia || undefined, comprobante: comprobante || undefined, descripcion: operacion ? `${operacion.tipo === 'venta' ? 'la venta' : 'la renta'} de ${operacion.propiedad_titulo || operacion.propiedad_folio || 'una propiedad'}`.slice(0, 300) : undefined }),
      })
      setConstancia({ folio: r.folio })
    } catch (e) { setConstancia({ error: e instanceof Error ? e.message : 'No se pudo crear la constancia.', movimientoId }) }
  }

  async function guardar() {
    setEnviando(true)
    try {
      const registrado = await pedir<{ id?: string }>('/api/admin/contabilidad/movimientos', {
        method: 'POST',
        body: JSON.stringify({ clase, monto_pesos: monto, fecha, concepto, referencia, categoria: clase === 'gasto' ? categoria : undefined, cuenta_id: clase === 'gasto' ? cuentaId || undefined : undefined, propiedad_id: clase === 'gasto' || clase === 'ingreso_extra' ? propiedadId || undefined : undefined, operacion_id: clase === 'pago_colaborador' ? operacionId : undefined, clave_idempotencia: clave }),
      })
      toast.success(clase === 'gasto' ? 'Gasto registrado.' : clase === 'ingreso_extra' ? 'Ingreso registrado.' : clase === 'aportacion_grupo' ? 'Aportación registrada.' : clase === 'aportacion_recibida_grupo' ? 'Aportación del grupo registrada.' : 'Pago al colaborador registrado.')
      if (clase === 'pago_colaborador' && registrado.id) await crearConstancia(registrado.id)
      setMonto(''); setConcepto(''); setReferencia(''); setOperacionId(''); setComprobante(null); setColaboradorId(''); setColaboradorNombre(''); setClave(nuevaClave())
      onCambio()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo registrar.') } finally { setEnviando(false) }
  }

  return (
    <section aria-labelledby="g-titulo" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" data-formulario-gasto>
      <h2 id="g-titulo" className="font-heading text-lg font-semibold">Registrar un movimiento</h2>
      {inicial && <p className="flex items-start gap-2 rounded-lg border border-[#8B1A1A]/25 bg-[#8B1A1A]/5 px-3 py-2 text-xs" role="status" data-autollenado-aviso><Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden /><span><strong>Llenado con IA.</strong> Revisa los campos y registra: todavía no se guardó nada. {inicial.resumen}</span></p>}
      <fieldset>
        <legend className={etiqueta}>¿Qué es?</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="g-clase" checked={clase === 'gasto'} onChange={() => setClase('gasto')} />Un gasto (sale dinero)</label>
          <label className="flex items-center gap-2"><input type="radio" name="g-clase" checked={clase === 'ingreso_extra'} onChange={() => setClase('ingreso_extra')} />Un ingreso extra (entra dinero)</label>
          <label className="flex items-center gap-2"><input type="radio" name="g-clase" checked={clase === 'pago_colaborador'} onChange={() => setClase('pago_colaborador')} data-clase-pago />Pago al colaborador</label>
          <label className="flex items-center gap-2"><input type="radio" name="g-clase" checked={clase === 'aportacion_grupo'} onChange={() => setClase('aportacion_grupo')} data-clase-aportacion />Dinero que entrego a una empresa del grupo (no es gasto)</label>
          <label className="flex items-center gap-2"><input type="radio" name="g-clase" checked={clase === 'aportacion_recibida_grupo'} onChange={() => setClase('aportacion_recibida_grupo')} data-clase-aportacion-recibida />Dinero que me regresa o aporta una empresa del grupo (no es ingreso)</label>
        </div>
        {clase === 'aportacion_grupo' && <p className="mt-2 text-xs text-muted-foreground" data-nota-aportacion>Sale dinero de VIVE BIEN y deja de contar: no baja la utilidad y tampoco se lleva como inversión. Si otra empresa del grupo lo regresa, regístralo como «dinero que me regresa». Si fiscal o legalmente debe tratarse de otra forma (préstamo, retiro, pago de un servicio), confírmalo con tu contador.</p>}
        {clase === 'aportacion_recibida_grupo' && <p className="mt-2 text-xs text-muted-foreground" data-nota-aportacion-recibida>Entra dinero a VIVE BIEN desde otra empresa del grupo: sube el efectivo y el capital, pero NO es un ingreso y no aparece en el estado de resultados.</p>}
        {clase === 'pago_colaborador' && <p className="mt-2 text-xs text-muted-foreground" data-nota-pago>Registra lo que ya se le pagó al colaborador de una operación. No cuenta como gasto nuevo (su parte ya se descuenta de la comisión), baja lo que se le debe y el efectivo, y NO verifica su acreditación ni libera el reparto.</p>}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        {clase === 'pago_colaborador' && (
          <div className="sm:col-span-2">
            <label htmlFor="g-operacion" className={etiqueta}>Operación a la que corresponde el pago</label>
            <select id="g-operacion" className={campo} value={operacionId} onChange={(e) => elegirOperacion(e.target.value)} data-operacion-pago>
              <option value="">{conPendiente.length ? 'Elige la operación…' : 'No hay operaciones con parte de colaborador pendiente'}</option>
              {conPendiente.map((o) => <option key={o.id} value={o.id}>{(o.propiedad_titulo || o.propiedad_folio || o.propiedad_id)} · {o.tipo === 'venta' ? 'venta' : 'renta'} · falta pagar ${(pendienteDeColaborador(o, lineas) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</option>)}
            </select>
            {operacion && <p className="mt-1 text-xs text-muted-foreground" data-letra-pago>{montoEnLetra(Math.round(Number(monto.replace(/[,\s$]/g, '') || 0) * 100))}</p>}
            {operacion && operacion.reparto_estado === 'retenido' && <p role="status" className="mt-1 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950" data-aviso-retenido>La parte de este colaborador sigue <strong>retenida</strong> (acreditación sin verificar o operación no atribuible). El pago se registra porque ya ocurrió, pero queda como pagado sin acreditación verificada; pide su recibo y consúltalo con tu contador.</p>}
          </div>
        )}
        {clase === 'pago_colaborador' && (
          <>
            <fieldset className="sm:col-span-2">
              <legend className={etiqueta}>¿Cómo se pagó?</legend>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="g-metodo" checked={metodo === 'efectivo'} onChange={() => setMetodo('efectivo')} data-metodo="efectivo" />En efectivo</label>
                <label className="flex items-center gap-2"><input type="radio" name="g-metodo" checked={metodo === 'transferencia'} onChange={() => setMetodo('transferencia')} data-metodo="transferencia" />Por transferencia</label>
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <label htmlFor="g-colab-dir" className={etiqueta}>¿A quién se le pagó?</label>
              <select id="g-colab-dir" className={campo} value={colaboradorId} onChange={(e) => elegirColaborador(e.target.value)} data-colaborador-directorio>
                <option value="">{colaboradores.length ? 'Elige del directorio…' : 'Aún no hay colaboradores en el directorio (escribe el nombre abajo)'}</option>
                {colaboradores.filter((c) => c.activo).map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.empresa ? ` · ${c.empresa}` : ''}</option>)}
              </select>
              <label htmlFor="g-colab-nombre" className={`${etiqueta} mt-2`}>Nombre de quien recibe (aparece en la constancia)</label>
              <input id="g-colab-nombre" className={campo} value={colaboradorNombre} maxLength={120} onChange={(e) => setColaboradorNombre(e.target.value)} autoComplete="off" placeholder="Nombre y apellido" />
              <p className="mt-1 text-xs text-muted-foreground">Sin teléfonos ni correos aquí. Para guardar a esta persona en el directorio, usa la pestaña «Colaboradores».</p>
            </div>
            <div className="sm:col-span-2"><SubirComprobante pedir={pedir} valor={comprobante} onCambio={setComprobante} etiqueta={metodo === 'transferencia' ? 'Comprobante de la transferencia' : 'Recibo o nota firmada'} ayuda="Se guarda en un almacén privado y se anexa a la constancia. Puedes agregarlo después." /></div>
          </>
        )}
        {clase === 'gasto' && (
          <div className="sm:col-span-2">
            <label htmlFor="g-cuenta" className={etiqueta}>Cuenta o lugar de gasto</label>
            <select id="g-cuenta" className={campo} value={cuentaId} onChange={(e) => elegirCuenta(e.target.value)}>
              <option value="">Sin cuenta (gasto suelto)</option>
              {activas.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.identificador ? ` · ${c.identificador}` : ''}</option>)}
            </select>
            {activas.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Crea tus cuentas de gasto a la derecha (Meta Ads, lonas…) para ver cuánto se va en cada una.</p>}
          </div>
        )}
        <div><label htmlFor="g-fecha" className={etiqueta}>Fecha</label><input id="g-fecha" type="date" className={campo} value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} /></div>
        <div><label htmlFor="g-monto" className={etiqueta}>Monto (MXN)</label><input id="g-monto" className={`${campo} text-right tabular-nums`} inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} autoComplete="off" placeholder="1,500.00" /></div>
        <div className="sm:col-span-2">
          <label htmlFor="g-concepto" className={etiqueta}>Concepto</label>
          <input id="g-concepto" className={campo} value={concepto} maxLength={200} onChange={(e) => setConcepto(e.target.value)} autoComplete="off" placeholder="Lonas para la nave de Mandujano" />
          <p className="mt-1 text-xs text-muted-foreground">Solo qué fue: sin nombres de personas, correos ni teléfonos.</p>
          {sugerida && <button type="button" className="mt-1 inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:bg-muted" onClick={() => setCategoria(sugerida)} data-sugerencia={sugerida}><Sparkles className="size-3" aria-hidden />Parece «{ETIQUETA_CATEGORIA[sugerida]}»: usar esa categoría</button>}
        </div>
        {clase === 'gasto' && (
          <div>
            <label htmlFor="g-cat" className={etiqueta}>Categoría</label>
            <select id="g-cat" className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Elige una…</option>
              {CATEGORIAS_DE_GASTO.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}
            </select>
          </div>
        )}
        <div><label htmlFor="g-ref" className={etiqueta}>Referencia <span className="font-normal text-muted-foreground">(opcional)</span></label><input id="g-ref" className={campo} value={referencia} maxLength={120} onChange={(e) => setReferencia(e.target.value)} autoComplete="off" placeholder="Factura F-118 · campaña 33839" /></div>
        {(clase === 'gasto' || clase === 'ingreso_extra') && <div className="sm:col-span-2">
          <label htmlFor="g-prop" className={etiqueta}>Propiedad <span className="font-normal text-muted-foreground">(opcional: sirve para saber cuánto cuesta cada una)</span></label>
          <select id="g-prop" className={campo} value={propiedadId} onChange={(e) => setPropiedadId(e.target.value)} disabled={propiedades === null}>
            <option value="">{propiedades === null ? 'Cargando propiedades…' : 'Ninguna (gasto general)'}</option>
            {(propiedades ?? []).filter((p) => p.estatus !== 'eliminada').map((p) => <option key={p.id} value={p.id}>{nombreDe(p)}{p.folio ? ` · ${p.folio}` : ''}</option>)}
          </select>
        </div>}
      </div>
      <Button type="button" disabled={!listo || enviando} onClick={() => { void guardar() }} data-registrar-movimiento>{enviando ? <><Loader2 className="animate-spin" aria-hidden /> Registrando…</> : clase === 'gasto' ? 'Registrar gasto' : clase === 'ingreso_extra' ? 'Registrar ingreso' : clase === 'aportacion_grupo' ? 'Registrar aportación' : clase === 'aportacion_recibida_grupo' ? 'Registrar dinero recibido' : 'Registrar pago'}</Button>
      {constancia && ('folio' in constancia
        ? <p role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950" data-constancia-lista>Pago registrado. Constancia <strong>{constancia.folio}</strong> lista. <Link href={`/admin/contabilidad/constancia/${constancia.folio}`} className="font-semibold underline" data-ver-constancia>Ver e imprimir</Link></p>
        : <p role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-constancia-error>El pago se registró, pero la constancia no se pudo crear: {constancia.error} <button type="button" className="font-semibold underline" onClick={() => { void crearConstancia(constancia.movimientoId) }}>Reintentar</button></p>)}
    </section>
  )
}

function PanelDeCuentas({ lineas, cuentas, pedir, onCambio, inicial }: { lineas: Linea[]; cuentas: CuentaDeGasto[]; pedir: Pedir; onCambio: () => void; inicial: ReLlenado | null }) {
  const filas = useMemo(() => porCuenta(lineas, cuentas), [lineas, cuentas])
  const ini = inicial?.relleno.tipo === 'cuenta' ? inicial.relleno.campos : null
  const [nombre, setNombre] = useState(ini?.nombre ?? '')
  const [categoria, setCategoria] = useState<string>(ini?.categoria ?? '')
  const [identificador, setIdentificador] = useState(ini?.identificador ?? '')
  const [enviando, setEnviando] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)

  async function crear() {
    setEnviando(true)
    try {
      await pedir('/api/admin/contabilidad/cuentas', { method: 'POST', body: JSON.stringify({ nombre, categoria, identificador }) })
      toast.success('Cuenta guardada.')
      setNombre(''); setIdentificador(''); setCategoria('')
      onCambio()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar la cuenta.') } finally { setEnviando(false) }
  }
  async function cambiarActiva(c: CuentaDeGasto) {
    try {
      await pedir(`/api/admin/contabilidad/cuentas/${c.id}`, { method: 'PATCH', body: JSON.stringify({ activa: !c.activa }) })
      toast.success(c.activa ? 'Cuenta desactivada.' : 'Cuenta activada.')
      onCambio()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo cambiar.') }
  }

  return (
    <section aria-labelledby="c-titulo" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" data-cuentas>
      <h2 id="c-titulo" className="font-heading text-lg font-semibold">Cuentas de gasto</h2>
      {filas.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay cuentas. Crea la primera abajo: por ejemplo «Meta Ads» con el número de tu cuenta publicitaria.</p> : (
        <ul className="divide-y text-sm">
          {filas.map((f) => (
            <li key={f.cuentaId} className="flex items-start justify-between gap-3 py-2" data-cuenta={f.cuentaId}>
              <div className="min-w-0">
                <p className={`font-medium ${f.activa ? '' : 'text-muted-foreground line-through'}`}>{f.nombre}{f.identificador ? <span className="ml-1 text-xs font-normal text-muted-foreground">· {f.identificador}</span> : null}</p>
                <p className="text-xs text-muted-foreground">{ETIQUETA_CATEGORIA[f.categoria] ?? f.categoria} · {f.n} {f.n === 1 ? 'gasto' : 'gastos'}{f.ultimaFecha ? ` · último ${f.ultimaFecha}` : ''}</p>
                {editando === f.cuentaId ? (
                  <EditorDeCuenta cuenta={lineaCuenta(cuentas, f.cuentaId)} pedir={pedir} onListo={() => { setEditando(null); onCambio() }} onCancelar={() => setEditando(null)} />
                ) : (
                  <div className="mt-0.5 flex gap-3">
                    <button type="button" className="text-xs underline" onClick={() => setEditando(f.cuentaId)} data-editar-cuenta>Editar</button>
                    <button type="button" className="text-xs underline" onClick={() => { void cambiarActiva(lineaCuenta(cuentas, f.cuentaId)) }}>{f.activa ? 'Desactivar' : 'Activar'}</button>
                  </div>
                )}
              </div>
              <strong className="shrink-0 tabular-nums">{mxn(f.neto)}</strong>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-semibold">Nueva cuenta</h3>
        {inicial && <p className="flex items-start gap-2 rounded-lg border border-[#8B1A1A]/25 bg-[#8B1A1A]/5 px-3 py-2 text-xs" role="status" data-autollenado-aviso><Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden /><span><strong>Llenado con IA.</strong> Revisa y guarda: todavía no se creó.</span></p>}
        <div><label htmlFor="c-nombre" className={etiqueta}>Nombre</label><input id="c-nombre" className={campo} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} autoComplete="off" placeholder="Meta Ads" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="c-cat" className={etiqueta}>Tipo de gasto</label><select id="c-cat" className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="">Elige…</option>{CATEGORIAS_DE_GASTO.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}</select></div>
          <div><label htmlFor="c-id" className={etiqueta}>Identificador <span className="font-normal text-muted-foreground">(opcional)</span></label><input id="c-id" className={campo} value={identificador} maxLength={120} onChange={(e) => setIdentificador(e.target.value)} autoComplete="off" placeholder="33839" /></div>
        </div>
        <Button type="button" variant="outline" disabled={nombre.trim().length < 2 || !categoria || enviando} onClick={() => { void crear() }} data-crear-cuenta>{enviando ? <><Loader2 className="animate-spin" aria-hidden /> Guardando…</> : 'Guardar cuenta'}</Button>
      </div>
    </section>
  )
}

const lineaCuenta = (cuentas: CuentaDeGasto[], id: string) => cuentas.find((c) => c.id === id) as CuentaDeGasto

/** Edita una cuenta existente (nombre, tipo, identificador). No toca los gastos ya registrados: cada uno conserva su categoría; queda en la bitácora con el antes y el después. */
function EditorDeCuenta({ cuenta, pedir, onListo, onCancelar }: { cuenta: CuentaDeGasto; pedir: Pedir; onListo: () => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState(cuenta.nombre)
  const [categoria, setCategoria] = useState<string>(cuenta.categoria)
  const [identificador, setIdentificador] = useState(cuenta.identificador ?? '')
  const [enviando, setEnviando] = useState(false)
  const cambios: Record<string, unknown> = {}
  if (nombre.trim() !== cuenta.nombre) cambios.nombre = nombre.trim()
  if (categoria !== cuenta.categoria) cambios.categoria = categoria
  if (identificador.trim() !== (cuenta.identificador ?? '')) cambios.identificador = identificador.trim() || null
  const hayCambios = Object.keys(cambios).length > 0

  async function guardar() {
    setEnviando(true)
    try {
      await pedir(`/api/admin/contabilidad/cuentas/${cuenta.id}`, { method: 'PATCH', body: JSON.stringify(cambios) })
      toast.success('Cuenta actualizada.')
      onListo()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setEnviando(false) }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-muted/30 p-3" data-editor-cuenta>
      <div><label htmlFor={`e-nombre-${cuenta.id}`} className={etiqueta}>Nombre</label><input id={`e-nombre-${cuenta.id}`} className={campo} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} autoComplete="off" /></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label htmlFor={`e-cat-${cuenta.id}`} className={etiqueta}>Tipo de gasto</label><select id={`e-cat-${cuenta.id}`} className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)}>{CATEGORIAS_DE_GASTO.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}</select></div>
        <div><label htmlFor={`e-id-${cuenta.id}`} className={etiqueta}>Identificador</label><input id={`e-id-${cuenta.id}`} className={campo} value={identificador} maxLength={120} onChange={(e) => setIdentificador(e.target.value)} autoComplete="off" /></div>
      </div>
      <p className="text-xs text-muted-foreground">Los gastos ya registrados conservan su categoría; solo cambia cómo se llama la cuenta. Queda en la bitácora.</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!hayCambios || nombre.trim().length < 2 || enviando} onClick={() => { void guardar() }} data-guardar-cuenta>{enviando ? <><Loader2 className="animate-spin" aria-hidden /> Guardando…</> : 'Guardar cambios'}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancelar} disabled={enviando}>Cancelar</Button>
      </div>
    </div>
  )
}
