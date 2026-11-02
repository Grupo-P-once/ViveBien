'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { RowSelectionState } from '@tanstack/react-table'
import {
  AlertTriangle, CalendarPlus, Copy, Download, ExternalLink, Inbox, ListChecks, Mail, MessageCircle, MoreVertical, Phone, RefreshCw, Search, Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Encabezado from '@/components/admin/Encabezado'
import { Estado, InsigniaTipo } from '@/components/admin/Insignia'
import PiePanel from '@/components/admin/PiePanel'
import TablaDatos, { type ColumnasPanel } from '@/components/admin/TablaDatos'
import TarjetaKpi from '@/components/admin/TarjetaKpi'
import DialogoManual from '@/components/admin/registros/DialogoManual'
import { useSesion } from '@/components/admin/sesion'
import { useDebounce } from '@/lib/useDebounce'
import { entero, fechaCorta, hora } from '@/lib/admin/formato'
import { ORDEN_TIPOS_REGISTRO, etiquetaTipoRegistro } from '@/lib/admin/panel-config'
import {
  aCsv, conteosPorTipo, filtrarRegistros, kpisRegistros, nombreArchivoCsv, type Registro,
} from '@/lib/admin/registros'
import { nombreDe, rutaDe } from '@/lib/propiedad-publica'

type Propiedad = { id: string; titulo?: string | null; tipo?: string | null; operacion?: string | null; slug?: string | null; folio?: string | null }

const ICONOS_KPI = { total: Inbox, semana: CalendarPlus, telefono: Phone, interes: Send }
const TITULOS_KPI = {
  total: 'Total de registros',
  semana: 'Nuevos esta semana',
  telefono: 'Con número de teléfono',
  interes: 'Con interés en una propiedad',
}

const FECHAS = [
  { clave: 'todas', etiqueta: 'Todas las fechas', dias: null },
  { clave: '7', etiqueta: 'Últimos 7 días', dias: 7 },
  { clave: '30', etiqueta: 'Últimos 30 días', dias: 30 },
  { clave: '90', etiqueta: 'Últimos 90 días', dias: 90 },
] as const

export default function PaginaRegistros() {
  const { pedir } = useSesion()
  const [registros, setRegistros] = useState<Registro[] | null>(null)
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [fallos, setFallos] = useState<string[]>([])
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)
  const [tipo, setTipo] = useState('todos')
  const [texto, setTexto] = useState('')
  const [fecha, setFecha] = useState<(typeof FECHAS)[number]['clave']>('todas')
  const [seleccion, setSeleccion] = useState<RowSelectionState>({})
  const busqueda = useDebounce(texto, 200)
  // Se fija al abrir la pantalla: si se recalculara en cada pintado, «últimos
  // 7 días» se movería mientras se mira la tabla.
  const [ahora] = useState(() => new Date())

  useEffect(() => {
    let vivo = true
    pedir<{ registros: Registro[]; fallos?: string[] }>('/api/admin/registros')
      .then((r) => { if (vivo) { setRegistros(r.registros ?? []); setFallos(r.fallos ?? []); setError('') } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los registros.'); setRegistros([]) } })
    pedir<Propiedad[] | { propiedades?: Propiedad[] }>('/api/admin/propiedades')
      .then((r) => { if (vivo) setPropiedades(Array.isArray(r) ? r : (r.propiedades ?? [])) })
      .catch(() => { /* sin nombres de propiedad: se enseña el folio o el id */ })
    return () => { vivo = false }
  }, [pedir, intento])

  const nombrePropiedad = useMemo(() => {
    const m = new Map<string, Propiedad>()
    for (const p of propiedades) m.set(p.id, p)
    return (id: string | null) => {
      if (!id) return null
      const p = m.get(id)
      return p ? { nombre: nombreDe(p), ruta: rutaDe(p) } : { nombre: id, ruta: null }
    }
  }, [propiedades])

  const todos = useMemo(() => registros ?? [], [registros])
  const kpis = useMemo(() => kpisRegistros(todos, ahora), [todos, ahora])
  const conteos = useMemo(() => conteosPorTipo(todos), [todos])
  const filtrados = useMemo(
    () => filtrarRegistros(todos, { tipo, texto: busqueda, dias: FECHAS.find((f) => f.clave === fecha)?.dias ?? null }, ahora),
    [todos, tipo, busqueda, fecha, ahora],
  )

  const seleccionados = filtrados.filter((r) => seleccion[r.id])
  const aExportar = seleccionados.length > 0 ? seleccionados : filtrados

  function exportar() {
    const csv = aCsv(aExportar, etiquetaTipoRegistro, fechaCorta)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nombreArchivoCsv(new Date())
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${entero(aExportar.length)} ${aExportar.length === 1 ? 'registro exportado' : 'registros exportados'}`)
  }

  const columnas: ColumnasPanel<Registro> = useMemo(() => [
    {
      id: 'elegir',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)}
          aria-label="Elegir todos los de esta página"
        />
      ),
      cell: ({ row }) => (
        <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(v === true)} aria-label={`Elegir ${row.original.nombre ?? 'el registro'}`} />
      ),
      enableSorting: false,
    },
    { accessorKey: 'tipo', header: 'Tipo', cell: ({ row }) => <InsigniaTipo tipo={row.original.tipo} />, enableSorting: false },
    {
      accessorKey: 'nombre',
      header: 'Nombre',
      cell: ({ row }) => <span className="block max-w-[9rem] font-medium">{row.original.nombre?.trim() || 'Sin nombre'}</span>,
    },
    {
      id: 'contacto',
      header: 'Contacto',
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original
        return (
          <div className="max-w-[11rem] space-y-0.5 text-sm">
            {r.email && <a href={`mailto:${r.email}`} className="block [overflow-wrap:anywhere] hover:underline">{r.email}</a>}
            {r.telefono && (
              <a
                href={`https://wa.me/52${r.telefono.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block font-medium text-[var(--estado-bien)] hover:underline"
              >
                {r.telefono}
              </a>
            )}
            {!r.email && !r.telefono && <span className="text-muted-foreground">Sin contacto</span>}
          </div>
        )
      },
    },
    {
      id: 'interes',
      header: 'Interés',
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original
        const p = nombrePropiedad(r.propiedad)
        if (!p && !r.mensaje) return <span className="text-muted-foreground">—</span>
        return (
          <div className="max-w-[12rem] space-y-0.5 text-sm">
            {p && (
              <p className="break-words">
                <span className="text-muted-foreground">Interés en: </span>
                {p.ruta ? <a href={p.ruta} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{p.nombre}</a> : <span className="font-medium">{p.nombre}</span>}
              </p>
            )}
            {r.mensaje && <p className="line-clamp-2 break-words text-muted-foreground">{r.mensaje}</p>}
          </div>
        )
      },
    },
    {
      id: 'aviso',
      header: 'Aviso',
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original
        if (r.tipo === 'cuenta' || r.tipo === 'publicador') return <span className="text-xs text-muted-foreground">n/a</span>
        return r.consentimiento
          ? <Estado texto="Aceptado" tono="bien" />
          : <Estado texto="Sin registrar" tono="aviso" />
      },
    },
    {
      accessorKey: 'creado',
      header: 'Fecha',
      cell: ({ row }) => (
        <div className="text-sm whitespace-nowrap">
          <p>{fechaCorta(row.original.creado)}</p>
          <p className="text-xs text-muted-foreground">{hora(row.original.creado)} · {row.original.fuente}</p>
        </div>
      ),
    },
    {
      id: 'acciones',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original
        const p = nombrePropiedad(r.propiedad)
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${r.nombre ?? 'el registro'}`}>
                <MoreVertical aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {r.telefono && (
                <DropdownMenuItem asChild>
                  <a href={`https://wa.me/52${r.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden /> Escribir por WhatsApp</a>
                </DropdownMenuItem>
              )}
              {r.email && (
                <DropdownMenuItem asChild>
                  <a href={`mailto:${r.email}`}><Mail aria-hidden /> Enviar correo</a>
                </DropdownMenuItem>
              )}
              {r.telefono && (
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(r.telefono ?? '').then(
                      () => toast.success('Teléfono copiado'),
                      () => toast.error('No se pudo copiar'),
                    )
                  }}
                >
                  <Copy aria-hidden /> Copiar teléfono
                </DropdownMenuItem>
              )}
              {p?.ruta && (
                <DropdownMenuItem asChild>
                  <a href={p.ruta} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden /> Ver la propiedad</a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [nombrePropiedad])

  const pestanas = ['todos', ...ORDEN_TIPOS_REGISTRO.filter((t) => conteos[t])]

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado
        versal="Formularios"
        titulo="Registros y solicitudes"
        descripcion="Consulta y administra todas las solicitudes recibidas desde el sitio web."
        acciones={
          <Button asChild variant="outline" className="h-10 border-[var(--marca)] px-4 text-[var(--marca)] hover:bg-[var(--marca-tinte)] hover:text-[var(--marca)]">
            <a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden /> Ver sitio web</a>
          </Button>
        }
      />

      {(error || fallos.length > 0) && (
        <p className="mt-6 flex items-start gap-2 rounded-lg bg-[var(--estado-aviso-fondo)] px-4 py-3 text-sm text-[var(--estado-aviso)]" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {error && <>{error} </>}
            {fallos.length > 0 && <>No respondieron: {fallos.join(', ')}. Puede haber gente que no se esté viendo.</>}
          </span>
          <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => setIntento((n) => n + 1)}>
            <RefreshCw aria-hidden /> Reintentar
          </Button>
        </p>
      )}

      {registros === null ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[132px] animate-pulse rounded-xl border bg-card" />)}
        </div>
      ) : (
        <>
          <div className="mt-6 flex items-center justify-end gap-4 text-xs text-muted-foreground" aria-hidden>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[var(--marca)]" /> últimos 30 días</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[var(--grafica-anterior)]" /> 30 días anteriores</span>
          </div>
          <div className="mt-2 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <TarjetaKpi key={k.clave} icono={ICONOS_KPI[k.clave]} titulo={TITULOS_KPI[k.clave]} valor={entero(k.valor)} variacion={k.variacion} nota={k.nota} linea={k.linea} />
            ))}
          </div>

          <section className="mt-5 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,.04)] sm:p-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <ListChecks className="mt-0.5 size-6 shrink-0 text-[var(--marca)]" aria-hidden />
                <div>
                  <h2 className="font-heading text-[1.02rem] font-semibold">Registros y solicitudes</h2>
                  <p className="text-sm text-muted-foreground">Todas las solicitudes recibidas desde formularios del sitio web.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" className="h-10 px-4" onClick={exportar} disabled={aExportar.length === 0}>
                  <Download aria-hidden /> Exportar{seleccionados.length > 0 ? ` (${seleccionados.length})` : ''}
                </Button>
                <DialogoManual alGuardar={() => setIntento((n) => n + 1)} />
              </div>
            </header>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por tipo">
                {pestanas.map((t) => {
                  const activa = tipo === t
                  return (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={activa}
                      onClick={() => { setTipo(t); setSeleccion({}) }}
                      className={
                        activa
                          ? 'rounded-lg bg-[var(--marca)] px-3.5 py-2 text-sm font-semibold text-white'
                          : 'rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted'
                      }
                    >
                      {t === 'todos' ? 'Todos' : etiquetaTipoRegistro(t)} ({entero(t === 'todos' ? todos.length : (conteos[t] ?? 0))})
                    </button>
                  )
                })}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Buscar nombre, correo, teléfono…"
                    className="h-10 w-[min(18rem,70vw)] pl-9"
                    aria-label="Buscar en los registros"
                  />
                </div>
                <Select value={fecha} onValueChange={(v) => setFecha(v as typeof fecha)}>
                  <SelectTrigger className="h-10 w-[11.5rem]" aria-label="Filtrar por fecha"><SelectValue /></SelectTrigger>
                  <SelectContent align="end">
                    {FECHAS.map((f) => <SelectItem key={f.clave} value={f.clave}>{f.etiqueta}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4">
              <TablaDatos
                columnas={columnas}
                datos={filtrados}
                idDe={(r) => r.id}
                nombrePlural="registros"
                tarjetaMovil={(r) => {
                  const p = nombrePropiedad(r.propiedad)
                  return (
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <InsigniaTipo tipo={r.tipo} />
                        <span className="text-xs whitespace-nowrap text-muted-foreground">{fechaCorta(r.creado)}</span>
                      </div>
                      <p className="font-medium">{r.nombre?.trim() || 'Sin nombre'}</p>
                      <div className="space-y-0.5 text-sm">
                        {r.email && <a href={`mailto:${r.email}`} className="block [overflow-wrap:anywhere] hover:underline">{r.email}</a>}
                        {r.telefono && (
                          <a href={`https://wa.me/52${r.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="block font-medium text-[var(--estado-bien)]">
                            {r.telefono}
                          </a>
                        )}
                      </div>
                      {p && <p className="text-sm"><span className="text-muted-foreground">Interés en: </span>{p.nombre}</p>}
                      {r.mensaje && <p className="line-clamp-2 text-sm break-words text-muted-foreground">{r.mensaje}</p>}
                      <div className="flex items-center justify-between gap-3 pt-1">
                        {r.tipo === 'cuenta' || r.tipo === 'publicador'
                          ? <span className="text-xs text-muted-foreground">Aviso: n/a</span>
                          : r.consentimiento ? <Estado texto="Aviso aceptado" tono="bien" /> : <Estado texto="Aviso sin registrar" tono="aviso" />}
                        <span className="text-xs text-muted-foreground">{r.fuente}</span>
                      </div>
                    </div>
                  )
                }}
                seleccion={seleccion}
                onSeleccion={setSeleccion}
                ordenInicial={[{ id: 'creado', desc: true }]}
                vacio={
                  todos.length === 0
                    ? 'Todavía no hay registros. Aquí saldrá todo el que deje sus datos en el sitio.'
                    : 'Ningún registro coincide con este filtro.'
                }
              />
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              La columna «Aviso» dice si quedó registrado qué aviso de privacidad aceptó la persona. Los formularios antiguos
              escribían directo desde el navegador y llegan sin esa prueba: compartir sus datos con un anunciante sin poder
              demostrarlo es exposición legal, así que se ve.{' '}
              <Link href="/privacidad" target="_blank" className="underline">Ver el aviso</Link>.
            </p>
          </section>
        </>
      )}

      <PiePanel />
    </main>
  )
}
