'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import Encabezado from '@/components/admin/Encabezado'
import { useSesion } from '@/components/admin/sesion'
import { Kpi, Tarjeta } from '@/components/admin/seo/ui'
import { FlujoMensual, GastoPorCategoria, GastoPorCuenta, ParaOptimizar, mxn } from '@/components/admin/contabilidad/GraficasContables'
import LibroDiario from '@/components/admin/contabilidad/LibroDiario'
import GastosYCuentas, { type ReLlenado } from '@/components/admin/contabilidad/GastosYCuentas'
import EstadosFinancieros from '@/components/admin/contabilidad/EstadosFinancieros'
import AutollenadoIA from '@/components/admin/contabilidad/AutollenadoIA'
import type { ColaboradorFila } from '@/lib/contabilidad-externas'
import type { Relleno } from '@/lib/contabilidad-relleno'
import ChatAsesor from '@/components/admin/contabilidad/ChatAsesor'
import NotasDelContador from '@/components/admin/contabilidad/NotasDelContador'
import ConexionDelAsesor from '@/components/admin/contabilidad/ConexionDelAsesor'
import {
  construirLineas, ETIQUETA_PERIODO, fechaLocalISO, gastosHormiga, porCategoria, porCuenta, porPropiedad, rangoDePeriodo, recomendaciones, serieMensual, totales,
  type CuentaDeGasto, type ExternaContable, type MovimientoContable, type Periodo,
} from '@/lib/contabilidad'
import type { OperacionComision } from '@/lib/comision-resumen'
import type { PropiedadPanel } from '@/lib/admin/propiedades'

/**
 * Contabilidad de comisiones — solo Super Admin (25-oct-2026). Una pantalla con cuatro pestañas: Resumen (lo que entra, lo que sale y lo que queda, con gráficas y qué
 * optimizar), Libro diario (todo, con filtros y CSV), Gastos y cuentas (registrar y llevar los lugares de gasto) y Asesor IA. Las líneas, los totales y el análisis se
 * calculan en `lib/contabilidad.ts`; aquí solo se muestran. Lo registrado no se edita: se corrige con devoluciones y anulaciones. No mueve dinero: lleva el registro.
 */

type Libro = { operaciones: OperacionComision[]; movimientos: MovimientoContable[]; cuentas: CuentaDeGasto[]; etiquetasDePropiedad: Record<string, string>; truncado: boolean; externas?: ExternaContable[]; constancias?: Record<string, { folio: string; colaborador_id: string | null; colaborador_nombre: string; metodo: string; comprobante: string | null }> }
type Pestana = 'resumen' | 'libro' | 'gastos' | 'estados' | 'asesor'
const TAB = 'flex-none px-3 py-2 text-[#4b5563] data-[state=active]:text-foreground'
const campo = 'h-9 rounded-lg border border-input bg-background px-3 text-sm'

/** «Registrar pago y constancia» desde Comisiones llega con ?pago=<operación>. */
function pagoDeLaDireccion(): string | null {
  try {
    const id = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('pago')
    return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null
  } catch { return null }
}

export default function ContabilidadPanel() {
  const { pedir, perfil } = useSesion()
  const [libro, setLibro] = useState<Libro | null>(null)
  const [error, setError] = useState('')
  const [vuelta, setVuelta] = useState(0)
  const recargar = useCallback(() => setVuelta((n) => n + 1), [])
  const [pestana, setPestana] = useState<Pestana>(() => (pagoDeLaDireccion() ? 'gastos' : 'resumen'))
  const [periodo, setPeriodo] = useState<Periodo>('tres_meses')
  const [propiedades, setPropiedades] = useState<PropiedadPanel[] | null>(null)
  const [hoy] = useState(() => fechaLocalISO())
  const [relleno, setRelleno] = useState<ReLlenado | null>(null)
  const [colaboradores, setColaboradores] = useState<ColaboradorFila[] | null>(null)
  const [pagoInicial] = useState<string | null>(pagoDeLaDireccion)
  const alRellenar = useCallback((r: Relleno, resumen: string) => { setRelleno((a) => ({ nonce: (a?.nonce ?? 0) + 1, relleno: r, resumen })); setPestana('gastos') }, [])

  useEffect(() => {
    if (!perfil.superAdmin) return
    let vivo = true
    pedir<Libro>('/api/admin/contabilidad/libro')
      .then((r) => { if (vivo) { setLibro(r); setError('') } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar la contabilidad.') })
    return () => { vivo = false }
  }, [pedir, vuelta, perfil.superAdmin])

  // El directorio solo hace falta para registrar pagos y en su propia pestaña.
  useEffect(() => {
    if (!perfil.superAdmin || pestana !== 'gastos') return
    let vivo = true
    pedir<{ colaboradores: ColaboradorFila[] }>('/api/admin/contabilidad/colaboradores')
      .then((r) => { if (vivo) { setColaboradores(r.colaboradores ?? []) } })
      .catch(() => { if (vivo) setColaboradores((a) => a ?? []) })
    return () => { vivo = false }
  }, [pedir, pestana, perfil.superAdmin])

  // La lista de propiedades solo hace falta para ligar un gasto a una propiedad.
  useEffect(() => {
    if ((pestana !== 'gastos' && !relleno) || propiedades) return
    let vivo = true
    pedir<PropiedadPanel[]>('/api/admin/propiedades').then((r) => { if (vivo) setPropiedades(Array.isArray(r) ? r : []) }).catch(() => { if (vivo) setPropiedades([]) })
    return () => { vivo = false }
  }, [pedir, pestana, propiedades, relleno])

  const lineas = useMemo(() => (libro ? construirLineas({ operaciones: libro.operaciones, movimientos: libro.movimientos, etiquetasDePropiedad: libro.etiquetasDePropiedad, externas: libro.externas }) : []), [libro])
  const cuentas = useMemo(() => libro?.cuentas ?? [], [libro])
  const rango = useMemo(() => rangoDePeriodo(periodo, hoy), [periodo, hoy])
  const t = useMemo(() => totales(lineas, rango), [lineas, rango])
  const serie = useMemo(() => serieMensual(lineas, hoy), [lineas, hoy])
  const categorias = useMemo(() => porCategoria(lineas, rango), [lineas, rango])
  const poCuenta = useMemo(() => porCuenta(lineas, cuentas, rango), [lineas, cuentas, rango])
  const hormiga = useMemo(() => gastosHormiga(lineas, hoy), [lineas, hoy])
  const props = useMemo(() => porPropiedad(lineas, rango), [lineas, rango])
  const recs = useMemo(() => recomendaciones(lineas, cuentas, hoy, rango, mxn), [lineas, cuentas, hoy, rango])

  if (!perfil.superAdmin) {
    return (
      <main className="mx-auto w-full max-w-[900px] space-y-4 px-4 py-10">
        <h1 className="font-heading text-2xl font-semibold">Contabilidad</h1>
        <p role="alert" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Esta pantalla es sólo para Super Admin.</p>
      </main>
    )
  }

  const vacio = libro !== null && lineas.length === 0
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado
        versal="Contabilidad"
        titulo="Lo que entra y lo que sale"
        descripcion="El libro de las comisiones y de los gastos del negocio: qué se cobró, qué se gastó, en qué y qué conviene mejorar. Lleva el registro; no mueve dinero."
        acciones={<Button asChild variant="outline"><Link href="/admin/comisiones">Cierres y comisiones <ArrowRight aria-hidden /></Link></Button>}
      />

      {error && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-error-contabilidad>{/disponible|503/i.test(error) ? 'La contabilidad todavía no está disponible: falta preparar la base de datos (migraciones 47 y 48).' : error}</p>}
      {!error && libro === null && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Cargando…</p>}
      {libro?.truncado && <p className="text-xs text-muted-foreground">Se muestran los 3,000 movimientos más recientes de cada tipo.</p>}

      {libro !== null && (
        <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <TabsList variant="line" aria-label="Secciones de contabilidad" className="group-data-horizontal/tabs:h-auto h-auto w-full flex-wrap justify-start gap-x-2 gap-y-1 pb-2 sm:w-auto">
              <TabsTrigger value="resumen" className={TAB}>Resumen</TabsTrigger>
              <TabsTrigger value="libro" className={TAB}>Libro diario</TabsTrigger>
              <TabsTrigger value="gastos" className={TAB}>Gastos y cuentas</TabsTrigger>
              <TabsTrigger value="estados" className={TAB} data-pestana-estados>Estados financieros</TabsTrigger>
              <TabsTrigger value="asesor" className={TAB}>Asesor IA</TabsTrigger>
            </TabsList>
            {pestana !== 'gastos' && (
              <div><label htmlFor="periodo" className="mr-2 text-xs font-semibold">Periodo</label>
                <select id="periodo" className={campo} value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} data-periodo>
                  {(Object.keys(ETIQUETA_PERIODO) as Periodo[]).map((p) => <option key={p} value={p}>{ETIQUETA_PERIODO[p]}</option>)}
                </select>
              </div>
            )}
          </div>

          {pestana !== 'asesor' && pestana !== 'estados' && <div className="pt-3 print:hidden"><AutollenadoIA pedir={pedir} onRelleno={alRellenar} /></div>}

          <TabsContent value="resumen" className="space-y-6 pt-4">
            {vacio ? (
              <Tarjeta titulo="Todavía no hay movimientos">
                <p className="text-sm text-muted-foreground">Aquí aparecerá cada comisión que registres en «Cierres y comisiones» y cada gasto que captures. Empieza creando tus cuentas de gasto (Meta Ads, lonas…) y registrando el primero.</p>
                <Button type="button" className="mt-3" onClick={() => setPestana('gastos')}>Registrar un gasto</Button>
              </Tarjeta>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Kpi etiqueta="Entró" valor={mxn(t.entra)} tono="bien" nota={`Cobrado ${mxn(t.comisionCobrada)} · por cobrar ${mxn(t.comisionPorCobrar)}${t.aportacionesDelGrupo > 0 ? ` · aportaciones del grupo ${mxn(t.aportacionesDelGrupo)} (no son ingreso)` : ''}`} />
                  <Kpi etiqueta="Salió" valor={mxn(t.sale)} nota={`Colaboradores ${mxn(t.colaboradores)}${t.pagosAColaboradores > 0 ? ` (pagado ${mxn(t.pagosAColaboradores)})` : ''} · gastos ${mxn(t.gastosDeOperacion + t.gastosExternosNetos)}${t.aportacionesAlGrupo > 0 ? ` · aportaciones al grupo ${mxn(t.aportacionesAlGrupo)}` : ''}`} />
                  <Kpi etiqueta="Queda" valor={mxn(t.neto)} tono={t.neto < 0 ? 'mal' : 'bien'} nota={t.entra > 0 ? `${Math.round((t.neto / t.entra) * 100)} % de lo que entró` : 'Sin ingresos en el periodo'} />
                </div>
                <p className="text-xs text-muted-foreground">«Salió» incluye la parte de los colaboradores desde que se compromete (cuando se les paga, el pago se anota pero no se suma otra vez) y lo que se aporta a otras empresas del grupo. Todo antes de IVA y otros impuestos.</p>
                <Tarjeta titulo="Mes a mes" descripcion="Lo que entra y lo que sale, últimos 12 meses."><FlujoMensual serie={serie} /></Tarjeta>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Tarjeta titulo="¿En qué se va el dinero?" descripcion={`Gasto por categoría, ya descontadas las devoluciones. ${ETIQUETA_PERIODO[periodo]}.`}><GastoPorCategoria filas={categorias} /></Tarjeta>
                  <Tarjeta titulo="Por cuenta de gasto" descripcion="Cuánto se ha ido en cada lugar."><GastoPorCuenta filas={poCuenta} /></Tarjeta>
                </div>
                <Tarjeta titulo="Para mejorar el negocio" descripcion="Lo que las cifras sugieren revisar. Cada alerta sale de una regla visible." acciones={<Button type="button" variant="outline" size="sm" onClick={() => setPestana('asesor')}>Preguntar al asesor IA</Button>}>
                  <ParaOptimizar recomendaciones={recs} hormiga={hormiga} propiedades={props} />
                </Tarjeta>
              </>
            )}
          </TabsContent>

          <TabsContent value="libro" className="pt-4">
            <Tarjeta titulo="Libro diario" descripcion="Todo lo que entra y lo que sale, de lo más reciente a lo más antiguo. Lo registrado no se edita: se corrige con una devolución o una anulación.">
              <LibroDiario constancias={libro.constancias} lineas={lineas} cuentas={cuentas} pedir={pedir} onCambio={recargar} periodo={rango} />
            </Tarjeta>
          </TabsContent>

          <TabsContent value="gastos" className="pt-4"><GastosYCuentas lineas={lineas} cuentas={cuentas} propiedades={propiedades} pedir={pedir} onCambio={recargar} relleno={relleno} operaciones={libro.operaciones} colaboradores={colaboradores ?? []} pagoInicial={pagoInicial} constancias={libro.constancias ?? {}} /></TabsContent>

          <TabsContent value="estados" className="pt-4"><EstadosFinancieros lineas={lineas} rango={rango} periodo={periodo} hoy={hoy} pedir={pedir} /></TabsContent>

          <TabsContent value="asesor" className="pt-4">
            <div className="space-y-6">
              <Tarjeta titulo="Conexión del asesor" descripcion="Si está conectado, con qué modelo, y cómo conectarlo: solo pegas la llave en Vercel."><ConexionDelAsesor pedir={pedir} /></Tarjeta>
              <Tarjeta titulo="Asesor IA" descripcion="Analiza tus cifras como un contador con experiencia: diagnóstico, hallazgos, acciones por impacto y pendientes de verificar. Sabe de contabilidad en México, de inmobiliarias y de VIVE BIEN al día."><ChatAsesor periodo={periodo} pedir={pedir} /></Tarjeta>
              <Tarjeta titulo="Qué sabe y qué tan al día está" descripcion="Su base de conocimiento tiene fecha de corte; lo que cambie por fuera se le agrega aquí."><NotasDelContador pedir={pedir} /></Tarjeta>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </main>
  )
}
