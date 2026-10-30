'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import PanoramaComisiones from '@/components/admin/comisiones/PanoramaComisiones'
import ComisionExterna from '@/components/admin/comisiones/ComisionExterna'
import DirectorioDeColaboradores from '@/components/admin/comisiones/DirectorioDeColaboradores'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Encabezado from '@/components/admin/Encabezado'
import { useSesion } from '@/components/admin/sesion'
import { Kpi, Tarjeta } from '@/components/admin/seo/ui'
import { BarraReparto, BarrasMensuales, DonaTipo, EstadoDeCobro, FlujoDelDinero, TopPropiedades, pesos } from '@/components/admin/comisiones/GraficasComisiones'
import FormularioCierre from '@/components/admin/comisiones/FormularioCierre'
import CalculadoraLibre from '@/components/admin/comisiones/CalculadoraLibre'
import { fechaCorta } from '@/lib/admin/formato'
import { fechaDeOperacion, gastosDe, historialDePropiedad, resumenComisiones, type OperacionComision } from '@/lib/comision-resumen'
import type { PropiedadPanel } from '@/lib/admin/propiedades'

/**
 * Comisiones — tablero, seguimiento de cobro y registro de cierres (Etapa C, migraciones 43 y 46). Solo el equipo. NO mueve dinero: calcula con la regla
 * versionada, registra, confirma el cobro o anula y libera (o no) la parte del agente colaborador según su acreditación. El servidor decide todo.
 *
 *  · Resumen: cuánto se ha cobrado, cuánto falta, cómo va cada mes (venta y renta), cómo se reparte y qué propiedades dejan más.
 *  · Operaciones: la lista con su seguimiento y el historial de UNA propiedad (`?historial=<id>`).
 *  · Registrar un cierre: guiado; llega con la propiedad ya elegida desde «Vendida» / «Rentada» (`?nueva=1&propiedad=<id>&tipo=venta|renta`).
 */

type Operacion = OperacionComision & {
  regla_version: string; retencion: string | null; atribuible: boolean; atribucion_ref: string | null
  creado_por: string; estado_por: string | null; estado_en: string | null; estado_motivo: string | null
}
type Pestana = 'resumen' | 'panorama' | 'operaciones' | 'registrar' | 'externas' | 'colaboradores' | 'calculadora'

const ETIQ_REPARTO: Record<Operacion['reparto_estado'], string> = { no_aplica: 'Sin agente colaborador', retenido: 'Parte del agente retenida', liberable: 'Parte del agente liberable' }
const ETIQ_RETENCION: Record<string, string> = {
  sin_colaborador: 'No hay agente colaborador', acreditacion_no_verificada: 'Acreditación sin verificar o vencida', operacion_no_atribuible: 'Operación no atribuible a VIVE BIEN',
}
const ETIQ_ESTADO: Record<Operacion['estado'], string> = { registrada: 'Por cobrar', confirmada: 'Cobrada', anulada: 'Anulada' }
/** Cada operación se reconoce de un vistazo: borde y etiqueta por estado (ámbar = falta cobrar, verde = cobrada, gris = anulada). Los colores pasan 4.5:1. */
const BORDE_DE_ESTADO: Record<Operacion['estado'], string> = { registrada: 'border-l-amber-500', confirmada: 'border-l-emerald-600', anulada: 'border-l-zinc-400 opacity-80' }
const INSIGNIA_DE_ESTADO: Record<Operacion['estado'], string> = { registrada: 'bg-amber-100 text-amber-950', confirmada: 'bg-emerald-100 text-emerald-950', anulada: 'bg-zinc-200 text-zinc-800' }
/** Lo pactado en una operación: las anteriores a la migración 47 no lo guardaron y valían la regla. */
const pactadaDe = (o: OperacionComision) => o.tipo === 'venta'
  ? (o.comision_bp != null ? `${o.comision_bp / 100} % del precio` : 'según la regla (3.5 %)')
  : (o.renta_meses_cent != null ? `${o.renta_meses_cent / 100} ${o.renta_meses_cent === 100 ? 'mes' : 'meses'} de renta` : 'según la regla (1 mes)')
const campo = 'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm'
/** Pestañas: el gris del tema no alcanza 4.5:1 sobre blanco; el texto inactivo usa #4b5563. */
const TAB = 'flex-none px-3 py-2 text-[#4b5563] data-[state=active]:text-foreground'

export default function ComisionesPanel() {
  const { pedir, perfil } = useSesion()
  // `useSearchParams` y no `window.location`: al llegar desde «Vendida» por navegación interna, la dirección todavía no se ha actualizado en el primer render.
  const parametros = useSearchParams()
  const [ops, setOps] = useState<Operacion[] | null>(null)
  const [error, setError] = useState('')
  const [vuelta, setVuelta] = useState(0)
  const recargar = useCallback(() => setVuelta((n) => n + 1), [])
  const [propiedades, setPropiedades] = useState<PropiedadPanel[] | null>(null)

  const [pestana, setPestana] = useState<Pestana>(() => (parametros.get('nueva') ? 'registrar' : parametros.get('historial') ? 'operaciones' : 'resumen'))
  const [inicial] = useState<{ propiedad?: string; tipo?: 'venta' | 'renta' }>(() => { const t = parametros.get('tipo'); return { propiedad: parametros.get('propiedad') ?? undefined, tipo: t === 'venta' || t === 'renta' ? t : undefined } })
  const [historial, setHistorial] = useState(() => parametros.get('historial') ?? '')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [texto, setTexto] = useState('')
  const [motivoPor, setMotivoPor] = useState<Record<string, string>>({})
  const [hoy] = useState(() => new Date().toISOString().slice(0, 10))

  useEffect(() => {
    let vivo = true
    pedir<{ operaciones: Operacion[] }>('/api/admin/comision/operaciones')
      .then((r) => { if (vivo) { setOps(r.operaciones); setError('') } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron cargar las operaciones.') })
    return () => { vivo = false }
  }, [pedir, vuelta])

  // La lista de propiedades solo hace falta para registrar un cierre.
  useEffect(() => {
    if (pestana !== 'registrar' || propiedades) return
    let vivo = true
    pedir<PropiedadPanel[]>('/api/admin/propiedades').then((r) => { if (vivo) setPropiedades(Array.isArray(r) ? r : []) }).catch(() => { if (vivo) setPropiedades([]) })
    return () => { vivo = false }
  }, [pedir, pestana, propiedades])

  const resumen = useMemo(() => resumenComisiones(ops ?? [], { hoy }), [ops, hoy])
  const hist = useMemo(() => (historial && ops ? historialDePropiedad(ops, historial) : null), [ops, historial])
  const filtradas = useMemo(() => {
    const base = hist ? hist.operaciones : (ops ?? [])
    const q = texto.trim().toLowerCase()
    return base.filter((o) => (!filtroEstado || o.estado === filtroEstado) && (!filtroTipo || o.tipo === filtroTipo)
      && (!q || `${o.propiedad_folio ?? ''} ${o.propiedad_titulo ?? ''} ${o.propiedad_id}`.toLowerCase().includes(q))) as Operacion[]
  }, [ops, hist, filtroEstado, filtroTipo, texto])

  async function accionar(id: string, accion: 'confirmar' | 'anular' | 'liberar_reparto', antes: string) {
    try {
      await pedir(`/api/admin/comision/operaciones/${id}`, { method: 'PATCH', body: JSON.stringify({ accion, antes, motivo: motivoPor[id] ?? '' }) })
      toast.success(accion === 'confirmar' ? 'Cobro confirmado.' : accion === 'anular' ? 'Operación anulada.' : 'Parte del agente liberada.')
      setMotivoPor((m) => ({ ...m, [id]: '' }))
      // Liberar la parte del colaborador lleva directo al formulario de pago, ya lleno con la operación, lo que falta pagar y el concepto (solo Super Admin: es de Contabilidad).
      if (accion === 'liberar_reparto' && perfil.superAdmin && typeof window !== 'undefined') { window.location.assign(`/admin/contabilidad?pago=${encodeURIComponent(id)}`); return }
      recargar()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo registrar el cambio.') }
  }

  function irARegistrar() {
    setPestana('registrar')
    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/admin/comisiones?nueva=1')
  }
  function alRegistrar() {
    recargar()
    setPestana('operaciones')
    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/admin/comisiones')
  }
  function verHistorial(id: string) {
    setHistorial(id)
    setPestana('operaciones')
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `/admin/comisiones?historial=${encodeURIComponent(id)}`)
  }
  function quitarHistorial() {
    setHistorial('')
    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/admin/comisiones')
  }

  const k = resumen.kpis
  const vacio = ops !== null && ops.length === 0

  // El mismo contenedor que el resto del panel (Propiedades, Usuarios…): sin él, el texto queda pegado a la barra lateral y al borde derecho.
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado
        versal="Comisiones"
        titulo="Lo que dejan tus ventas y rentas"
        descripcion="Cuánto se ha cobrado, cuánto falta y de qué propiedades viene. Este módulo no mueve dinero: lleva el registro."
        acciones={(
          <div className="flex flex-wrap gap-2">
            {perfil.superAdmin && <Button asChild variant="outline" data-ir-contabilidad><Link href="/admin/contabilidad">Contabilidad</Link></Button>}
            <Button type="button" onClick={irARegistrar} data-nuevo-cierre><Plus aria-hidden /> Registrar un cierre</Button>
          </div>
        )}
      />

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!error && ops === null && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Cargando…</p>}

      {ops !== null && (
        <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
          <TabsList variant="line" aria-label="Secciones de comisiones" className="group-data-horizontal/tabs:h-auto h-auto w-full flex-wrap justify-start gap-x-2 gap-y-1 pb-2">
            <TabsTrigger value="resumen" className={TAB}>Resumen</TabsTrigger>
            {perfil.superAdmin && <TabsTrigger value="panorama" className={TAB} data-pestana-panorama>Panorama</TabsTrigger>}
            <TabsTrigger value="operaciones" className={TAB}>Operaciones{ops.length ? ` (${ops.length})` : ''}</TabsTrigger>
            <TabsTrigger value="registrar" className={TAB}>Registrar un cierre</TabsTrigger>
            {perfil.superAdmin && <TabsTrigger value="externas" className={TAB} data-pestana-externas>Comisión externa</TabsTrigger>}
            {perfil.superAdmin && <TabsTrigger value="colaboradores" className={TAB} data-pestana-colaboradores>Colaboradores</TabsTrigger>}
            <TabsTrigger value="calculadora" className={TAB}>Calculadora</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="space-y-6 pt-4">
            {vacio ? (
              <Tarjeta titulo="Todavía no hay cierres registrados">
                <p className="text-sm text-muted-foreground">Cuando una propiedad se venda o se rente, márcala como <strong>Vendida</strong> o <strong>Rentada</strong> en «Mis propiedades» (menú ⋮ de cada una) o registra el cierre aquí. Con eso verás el dinero que entra, lo que falta por cobrar y las gráficas por mes.</p>
                <Button type="button" className="mt-3" onClick={irARegistrar}>Registrar el primer cierre</Button>
              </Tarjeta>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Kpi etiqueta="Comisión cobrada" valor={pesos(k.cobrada)} tono="bien" nota={`Neto para VIVE BIEN: ${pesos(k.netaCobrada)}`} />
                  <Kpi etiqueta="Por cobrar" valor={pesos(k.porCobrar)} nota={`Neto esperado: ${pesos(k.netaPorCobrar)}`} />
                  <Kpi etiqueta="Este mes" valor={pesos(k.mesActual)} nota={k.variacionMes === null ? 'Sin mes anterior con qué comparar' : `${k.variacionMes >= 0 ? '+' : ''}${k.variacionMes} % contra el mes anterior (${pesos(k.mesAnterior)})`} />
                  <Kpi etiqueta="Cierres" valor={String(k.operaciones)} nota={`${k.ventas} ${k.ventas === 1 ? 'venta' : 'ventas'} · ${k.rentas} ${k.rentas === 1 ? 'renta' : 'rentas'} · promedio ${pesos(k.ticketPromedio)}`} />
                </div>
                {(k.cierreVsLista !== null || k.anulada > 0) && (
                  <p className="text-sm text-muted-foreground">
                    {k.cierreVsLista !== null && <>En promedio se cierra al <strong>{k.cierreVsLista} %</strong> del precio anunciado. </>}
                    {k.anulada > 0 && <>Hay {pesos(k.anulada)} en operaciones anuladas que no cuentan en los totales.</>}
                  </p>
                )}
                <Tarjeta titulo="Flujo del dinero" descripcion="Lo que entra por comisiones, lo que sale (colaboradores y gastos) y lo que queda para VIVE BIEN." acciones={perfil.superAdmin ? <Button asChild variant="outline" size="sm"><Link href="/admin/contabilidad">Ver el libro diario y los gastos</Link></Button> : undefined}><FlujoDelDinero resumen={resumen} /></Tarjeta>
                <div className="grid gap-4 lg:grid-cols-3">
                  <Tarjeta titulo="Comisión por mes" descripcion="Venta y renta, según la fecha de cierre. Últimos 12 meses." className="lg:col-span-2"><BarrasMensuales serie={resumen.serieMensual} /></Tarjeta>
                  <Tarjeta titulo="Venta o renta" descripcion="De dónde viene el dinero."><DonaTipo porTipo={resumen.porTipo} /></Tarjeta>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <Tarjeta titulo="Seguimiento del cobro" descripcion="Lo cerrado, ¿ya se cobró?"><EstadoDeCobro porEstado={resumen.porEstado} /></Tarjeta>
                  <Tarjeta titulo="Cómo se reparte" descripcion="VIVE BIEN y los agentes colaboradores."><BarraReparto reparto={resumen.reparto} /></Tarjeta>
                  <Tarjeta titulo="Propiedades que más dejan" descripcion="Con el historial de cada una."><TopPropiedadesConEnlace filas={resumen.topPropiedades} onVer={verHistorial} /></Tarjeta>
                </div>
              </>
            )}
          </TabsContent>

          {perfil.superAdmin && (
            <TabsContent value="panorama" className="pt-4"><PanoramaComisiones pedir={pedir} /></TabsContent>
          )}

          <TabsContent value="operaciones" className="space-y-4 pt-4">
            {hist && (
              <Tarjeta titulo={`Historial de ${hist.operaciones[0]?.propiedad_titulo || hist.operaciones[0]?.propiedad_folio || 'la propiedad'}`} acciones={<Button type="button" variant="outline" size="sm" onClick={quitarHistorial}>Ver todas las operaciones</Button>}>
                <p className="text-sm" data-historial-resumen>{hist.operaciones.length} {hist.operaciones.length === 1 ? 'operación' : 'operaciones'} · cobrado <strong>{pesos(hist.cobrada)}</strong> · por cobrar <strong>{pesos(hist.porCobrar)}</strong></p>
              </Tarjeta>
            )}
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[12rem] flex-1"><label htmlFor="f-texto" className="mb-1 block text-xs font-semibold">Buscar por folio o título</label><input id="f-texto" className={campo} value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" /></div>
              <div><label htmlFor="f-estado" className="mb-1 block text-xs font-semibold">Estado</label><select id="f-estado" className={campo} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}><option value="">Todos</option><option value="registrada">Por cobrar</option><option value="confirmada">Cobradas</option><option value="anulada">Anuladas</option></select></div>
              <div><label htmlFor="f-tipo" className="mb-1 block text-xs font-semibold">Tipo</label><select id="f-tipo" className={campo} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}><option value="">Todos</option><option value="venta">Venta</option><option value="renta">Renta</option></select></div>
            </div>
            {filtradas.length === 0 && <p className="text-sm text-muted-foreground">{vacio ? 'Aún no hay operaciones. Aparecerán aquí cuando registres el primer cierre.' : 'Ninguna operación coincide con el filtro.'}</p>}
            <ul className="grid gap-3">
              {filtradas.map((o) => (
                <li key={o.id} data-operacion={o.id} className={`rounded-xl border border-l-4 bg-card p-4 shadow-sm sm:p-5 ${BORDE_DE_ESTADO[o.estado]}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold leading-snug">{o.tipo === 'venta' ? 'Venta' : 'Renta'} · {o.propiedad_titulo || o.propiedad_id}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{o.propiedad_folio ? <span className="mr-2 rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{o.propiedad_folio}</span> : null}Cierre: {fechaDeOperacion(o)}</p>
                    </div>
                    <p className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${INSIGNIA_DE_ESTADO[o.estado]}`} data-estado-operacion>{ETIQ_ESTADO[o.estado]}</p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3" data-cifras-operacion>
                    <div className="rounded-lg border bg-muted/30 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#4b5563]">Comisión total</p><p className="mt-0.5 text-xl font-semibold tabular-nums">{pesos(o.total_centavos)}</p><p className="text-xs text-muted-foreground">{o.tipo === 'venta' ? 'Precio final: ' : 'Renta base: '}{pesos(o.base_centavos)}</p></div>
                    <div className="rounded-lg border border-[#8B1A1A]/20 bg-[#8B1A1A]/5 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#8B1A1A]">VIVE BIEN</p><p className="mt-0.5 text-xl font-semibold tabular-nums text-[#8B1A1A]">{pesos(o.vivebien_centavos)}</p>{gastosDe(o) > 0 ? <p className="text-xs text-muted-foreground">quedan {pesos(o.vivebien_centavos - gastosDe(o))} tras gastos</p> : <p className="text-xs text-muted-foreground">antes de impuestos</p>}</div>
                    <div className="rounded-lg border bg-muted/30 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#4b5563]">Agente colaborador</p><p className="mt-0.5 text-xl font-semibold tabular-nums">{pesos(o.colaborador_centavos + o.colaborador_retenido_centavos)}</p><p className="text-xs text-muted-foreground">{o.colaborador_retenido_centavos > 0 ? `retenido: ${pesos(o.colaborador_retenido_centavos)}` : ETIQ_REPARTO[o.reparto_estado]}</p></div>
                  </div>

                  <dl className="mt-4 grid gap-x-6 gap-y-1.5 rounded-lg bg-muted/20 p-3 text-sm sm:grid-cols-2">
                    <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Reparto: </dt><dd className="inline font-medium">{ETIQ_REPARTO[o.reparto_estado]}{o.retencion ? ` · ${ETIQ_RETENCION[o.retencion] ?? o.retencion}` : ''}</dd></div>
                    <div><dt className="inline text-muted-foreground">Comisión pactada: </dt><dd className="inline" data-pactada>{pactadaDe(o)}</dd></div>
                    {o.colaborador_bp != null && <div><dt className="inline text-muted-foreground">Parte del colaborador: </dt><dd className="inline">{o.colaborador_bp / 100} %</dd></div>}
                    {gastosDe(o) > 0 && <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Gastos: </dt><dd className="inline" data-gastos>{pesos(gastosDe(o))} ({(o.gastos ?? []).map((g) => `${g.concepto} ${pesos(g.monto_centavos)}`).join(', ')}) · queda para VIVE BIEN {pesos(o.vivebien_centavos - gastosDe(o))}</dd></div>}
                    {o.ajuste_motivo && <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Motivo del ajuste: </dt><dd className="inline" data-motivo-ajuste>{o.ajuste_motivo}</dd></div>}
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">Registrada {fechaCorta(o.creado_en)} por {o.creado_por}{o.estado_por ? ` · ${ETIQ_ESTADO[o.estado].toLowerCase()} por ${o.estado_por}` : ''}{o.estado === 'confirmada' && o.estado_por && o.estado_por.toLowerCase() === o.creado_por.toLowerCase() ? <> · <strong data-autoaprobada>autoaprobada (Super Admin)</strong></> : null} · Regla {o.regla_version} · <button type="button" className="underline" onClick={() => verHistorial(o.propiedad_id)}>ver historial de la propiedad</button></p>
                  {o.estado !== 'anulada' && (
                    <div className="mt-3 grid gap-2">
                      <label htmlFor={`m-${o.id}`} className="text-xs font-semibold">Motivo (mínimo 10 caracteres, para confirmar o anular)</label>
                      <input id={`m-${o.id}`} className={campo} value={motivoPor[o.id] ?? ''} maxLength={500} onChange={(e) => setMotivoPor((m) => ({ ...m, [o.id]: e.target.value }))} autoComplete="off" />
                      <div className="flex flex-wrap gap-2">
                        {o.estado === 'registrada' && <Button type="button" size="sm" disabled={(motivoPor[o.id] ?? '').trim().length < 10} onClick={() => { void accionar(o.id, 'confirmar', o.estado) }}>Confirmar cobro</Button>}
                        <Button type="button" size="sm" variant="outline" disabled={(motivoPor[o.id] ?? '').trim().length < 10} onClick={() => { void accionar(o.id, 'anular', o.estado) }}>Anular</Button>
                        {o.estado === 'confirmada' && o.colaborador_centavos > 0 && <Button asChild size="sm" variant="outline"><a href={`/admin/contabilidad?pago=${o.id}`} data-registrar-pago>Registrar pago y constancia</a></Button>}
                        <Button asChild size="sm" variant="outline"><a href={`/admin/comisiones/recibo/${o.id}`} data-descargar-recibo>Descargar recibo</a></Button>
                        {o.reparto_estado === 'retenido' && <Button type="button" size="sm" variant="outline" onClick={() => { void accionar(o.id, 'liberar_reparto', o.estado) }}>Intentar liberar la parte del agente</Button>}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="registrar" className="pt-4">
            <Tarjeta titulo="Registrar un cierre" descripcion="Elige la propiedad, confirma el precio final y la fecha, y revisa el cálculo antes de guardar. Después, confirma el cobro cuando entre el dinero.">
              {propiedades === null
                ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Cargando propiedades…</p>
                : <FormularioCierre pedir={pedir} propiedades={propiedades} inicial={inicial} onRegistrada={alRegistrar} />}
            </Tarjeta>
          </TabsContent>

          {perfil.superAdmin && <TabsContent value="externas" className="pt-4"><ComisionExterna pedir={pedir} /></TabsContent>}

          {perfil.superAdmin && <TabsContent value="colaboradores" className="pt-4"><DirectorioDeColaboradores pedir={pedir} /></TabsContent>}

          <TabsContent value="calculadora" className="pt-4">
            <Tarjeta titulo="Calculadora de comisión" descripcion="Simula un trato antes de cerrarlo: cambia el porcentaje, los meses de renta, el reparto con otro agente y los gastos, y mira lo que entra, lo que sale y lo que queda. No guarda nada.">
              <CalculadoraLibre />
            </Tarjeta>
          </TabsContent>
        </Tabs>
      )}
    </main>
  )
}

/** La lista de las más productivas, con el enlace a su historial resuelto dentro de la misma pantalla. */
function TopPropiedadesConEnlace({ filas, onVer }: { filas: ReturnType<typeof resumenComisiones>['topPropiedades']; onVer: (id: string) => void }) {
  return (
    <div onClick={(e) => {
      const a = (e.target as HTMLElement).closest('a[href*="historial="]') as HTMLAnchorElement | null
      if (!a) return
      e.preventDefault()
      const id = new URL(a.href).searchParams.get('historial')
      if (id) onVer(id)
    }}>
      <TopPropiedades filas={filas} />
    </div>
  )
}
