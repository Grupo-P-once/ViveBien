'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle, Archive, ClipboardCheck, Copy, ExternalLink, FilePen, House, ImageOff, MoreVertical, Pencil, Plus,
  RefreshCw, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import BotonNotasComision from '@/components/publicador/BotonNotasComision'
import Confirmar from '@/components/admin/Confirmar'
import Encabezado from '@/components/admin/Encabezado'
import { Estado } from '@/components/admin/Insignia'
import PiePanel from '@/components/admin/PiePanel'
import TablaDatos, { type ColumnasPanel } from '@/components/admin/TablaDatos'
import TarjetaKpi from '@/components/admin/TarjetaKpi'
import { abrirNuevaPropiedad, rutaDeEditorDe } from '@/lib/publicador/espacio'
import { useSesion } from '@/components/admin/sesion'
import { useDebounce } from '@/lib/useDebounce'
import { miniaturaCloudinary } from '@/lib/cloudinary-url'
import { SITIO } from '@/lib/sitio'
import { nombreDe, rutaDe } from '@/lib/propiedad-publica'
import { entero, fechaCorta, precio } from '@/lib/admin/formato'
import { colorTipo, FRASES_MARCA } from '@/lib/admin/panel-config'
import {
  accionesDe, conteosPorPestana, ETIQUETA_ESTATUS, ETIQUETA_PUBLICACION, filtrarPropiedades, kpisPropiedades,
  PESTANAS, type Accion, type Pestana, type PropiedadPanel,
} from '@/lib/admin/propiedades'

const TIPO_CORTO: Record<string, string> = {
  casa: 'Casa', nave: 'Nave', terreno: 'Terreno', bodega: 'Bodega', local: 'Local', comercial: 'Local',
  oficina: 'Oficina', departamento: 'Depto.',
}

const ICONOS_KPI = { publicadas: House, borradores: FilePen, revision: ClipboardCheck, fuera: Archive }
const TITULOS_KPI = {
  publicadas: 'Publicadas en el sitio',
  borradores: 'Borradores',
  revision: 'Por revisar',
  fuera: 'Fuera del sitio',
}

/** La ruta del asistente: ahí se edita TODO (V-1.1.72). */
const editar = (id: string) => rutaDeEditorDe(id, 'admin') // el editor se abre DENTRO del panel de administración

function Tipo({ p }: { p: PropiedadPanel }) {
  const clave = (p.tipo ?? '').toLowerCase() === 'comercial' ? 'local' : (p.tipo ?? '').toLowerCase()
  return (
    <div className="space-y-1">
      <span
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold text-foreground"
        style={{ background: `color-mix(in srgb, ${colorTipo(clave)} 14%, white)` }}
      >
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: colorTipo(clave) }} />
        {TIPO_CORTO[clave] ?? (p.tipo || 'Sin tipo')}
      </span>
      {p.operacion && <p className="text-xs text-muted-foreground capitalize">{p.operacion}</p>}
    </div>
  )
}

function Miniatura({ p, lado = 56 }: { p: PropiedadPanel; lado?: number }) {
  const url = miniaturaCloudinary(p.fotos?.[0] ?? null, { lado })
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted" style={{ width: lado, height: lado }}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" width={lado} height={lado} loading="lazy" className="size-full object-cover" />
        : <ImageOff className="size-5 text-muted-foreground" aria-label="Sin foto" />}
    </span>
  )
}

/** `useSearchParams` pide Suspense: `?nueva=1` (desde la barra lateral) solo ABRE el formulario en línea de esta misma lista. */
export default function PaginaPropiedades() {
  return <Suspense fallback={null}><ListaDePropiedades /></Suspense>
}

function ListaDePropiedades() {
  const { pedir } = useSesion()
  const router = useRouter()
  const pidioNueva = useSearchParams().get('nueva') === '1'
  useEffect(() => { if (pidioNueva) abrirNuevaPropiedad() }, [pidioNueva])
  const [lista, setLista] = useState<PropiedadPanel[] | null>(null)
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)
  const [pestana, setPestana] = useState<Pestana>('todas')
  const [texto, setTexto] = useState(() => {
    // La búsqueda global manda aquí con ?q=folio: se abre ya filtrada.
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('q') ?? ''
  })
  const [pendiente, setPendiente] = useState<{ p: PropiedadPanel; a: Accion } | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const busqueda = useDebounce(texto, 200)
  const [ahora] = useState(() => new Date())

  useEffect(() => {
    let vivo = true
    pedir<PropiedadPanel[]>('/api/admin/propiedades')
      .then((r) => { if (vivo) { setLista(Array.isArray(r) ? r : []); setError('') } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron cargar las propiedades.'); setLista([]) } })
    return () => { vivo = false }
  }, [pedir, intento])

  const todas = lista ?? []
  const conteos = useMemo(() => conteosPorPestana(todas), [todas])
  const kpis = useMemo(() => kpisPropiedades(todas, ahora), [todas, ahora])
  const filtradas = useMemo(() => filtrarPropiedades(todas, pestana, busqueda), [todas, pestana, busqueda])

  async function ejecutar(p: PropiedadPanel, a: Accion) {
    setTrabajando(true)
    try {
      if (a.tipo === 'cierre') {
        // Vendida / Rentada: se cambia el estatus (si falta) y se abre el motor de comisiones con la propiedad ya elegida. No se archiva nada.
        if (a.marcar) await pedir(`/api/admin/propiedades/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: JSON.stringify({ estatus: a.operacion === 'venta' ? 'vendida' : 'rentada' }) })
        toast.success(a.marcar ? `${a.operacion === 'venta' ? 'Marcada como vendida' : 'Marcada como rentada'}: ${nombreDe(p)}. Registra la comisión.` : `Registra la comisión: ${nombreDe(p)}`)
        setPendiente(null)
        router.push(`/admin/comisiones?nueva=1&propiedad=${encodeURIComponent(p.id)}&tipo=${a.operacion}`)
        return
      }
      if (a.tipo === 'estatus') {
        await pedir(`/api/admin/propiedades/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: JSON.stringify({ estatus: a.valor }) })
      } else if (a.tipo === 'publicacion') {
        await pedir(`/api/propiedades/${encodeURIComponent(p.id)}/estado`, { method: 'POST', body: JSON.stringify({ estado: a.valor }) })
      } else {
        await pedir(`/api/admin/propiedades/${encodeURIComponent(p.id)}`, { method: 'DELETE' })
      }
      toast.success(`${a.etiqueta}: ${nombreDe(p)}`)
      setPendiente(null)
      setIntento((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo hacer el cambio.')
    } finally {
      setTrabajando(false)
    }
  }

  function pedirAccion(p: PropiedadPanel, a: Accion) {
    // Lo que cuesta deshacer se confirma; lo demás se hace al momento.
    if ('peligrosa' in a && a.peligrosa) setPendiente({ p, a })
    else ejecutar(p, a)
  }

  function MenuAcciones({ p }: { p: PropiedadPanel }) {
    const acciones = accionesDe(p)
    const publica = p.estado_pub === 'publicada' ? rutaDe(p) : null
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label={`Más acciones para ${nombreDe(p)}`}>
            <MoreVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {publica && (
            <>
              <DropdownMenuItem asChild>
                <a href={publica} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden /> Ver en el sitio</a>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  navigator.clipboard?.writeText(`${SITIO}${publica}`).then(
                    () => toast.success('Enlace copiado'),
                    () => toast.error('No se pudo copiar'),
                  )
                }}
              >
                <Copy aria-hidden /> Copiar enlace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {acciones.map((a) => (
            <DropdownMenuItem
              key={a.etiqueta}
              onSelect={() => pedirAccion(p, a)}
              className={'peligrosa' in a && a.peligrosa ? 'text-[var(--estado-mal)] focus:text-[var(--estado-mal)]' : undefined}
            >
              {a.etiqueta}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const columnas: ColumnasPanel<PropiedadPanel> = useMemo(() => [
    {
      id: 'propiedad',
      accessorFn: (p) => nombreDe(p),
      header: 'Propiedad',
      cell: ({ row }) => {
        const p = row.original
        return (
          <div className="flex min-w-[15rem] items-start gap-3">
            <Miniatura p={p} />
            <div className="min-w-0">
              <p className="font-medium leading-snug">{nombreDe(p)}</p>
              {(p.ubicacion || p.ciudad) && <p className="text-xs text-muted-foreground">{p.ubicacion || p.ciudad}</p>}
              {p.folio && <p className="font-mono text-[0.7rem] tracking-wide text-muted-foreground">{p.folio}</p>}
            </div>
          </div>
        )
      },
    },
    { id: 'tipo', accessorFn: (p) => p.tipo ?? '', header: 'Tipo', cell: ({ row }) => <Tipo p={row.original} /> },
    {
      id: 'precio',
      accessorFn: (p) => Number(p.precio) || 0,
      header: 'Precio',
      cell: ({ row }) => <span className="font-heading font-bold whitespace-nowrap text-[var(--marca)]">{precio(row.original.precio) ?? '—'}</span>,
    },
    {
      id: 'metros',
      accessorFn: (p) => Number(p.metros) || 0,
      header: 'Superficie',
      cell: ({ row }) => {
        const m = Number(row.original.metros)
        return <span className="whitespace-nowrap">{Number.isFinite(m) && m > 0 ? `${m.toLocaleString('es-MX')} m²` : '—'}</span>
      },
    },
    {
      id: 'estatus',
      accessorFn: (p) => p.estatus ?? '',
      header: 'Estatus',
      cell: ({ row }) => {
        const e = ETIQUETA_ESTATUS[row.original.estatus ?? ''] ?? { texto: row.original.estatus ?? '—', tono: 'neutro' as const }
        return <Estado texto={e.texto} tono={e.tono} />
      },
    },
    {
      id: 'publicacion',
      accessorFn: (p) => p.publicada_en ?? p.created_at ?? '',
      header: 'Publicación',
      cell: ({ row }) => {
        const p = row.original
        const e = ETIQUETA_PUBLICACION[p.estado_pub ?? ''] ?? { texto: p.estado_pub ?? '—', tono: 'neutro' as const }
        return (
          <div className="space-y-1 text-sm whitespace-nowrap">
            <Estado texto={e.texto} tono={e.tono} />
            <p className="text-xs text-muted-foreground">{fechaCorta(p.estado_pub === 'publicada' ? p.publicada_en ?? p.created_at : p.created_at)}</p>
          </div>
        )
      },
    },
    {
      id: 'acciones',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <BotonNotasComision esEquipo propiedadId={row.original.id} nombre={nombreDe(row.original)} />
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href={editar(row.original.id)}><Pencil aria-hidden /> Editar</Link>
          </Button>
          <MenuAcciones p={row.original} />
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [])

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado
        versal="Propiedades"
        titulo="Mis propiedades"
        descripcion="Administra, edita y controla todas tus propiedades en un solo lugar."
        frase={FRASES_MARCA.historias}
        acciones={
          <Button className="h-10 px-4" onClick={abrirNuevaPropiedad}>
            <Plus aria-hidden /> Nueva propiedad
          </Button>
        }
      />

      {error && (
        <p className="mt-6 flex items-center gap-2 rounded-lg bg-[var(--estado-aviso-fondo)] px-4 py-3 text-sm text-[var(--estado-aviso)]" role="alert">
          <AlertTriangle className="size-4 shrink-0" aria-hidden /> {error}
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setIntento((n) => n + 1)}>
            <RefreshCw aria-hidden /> Reintentar
          </Button>
        </p>
      )}

      {lista === null ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[132px] animate-pulse rounded-xl border bg-card" />)}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <TarjetaKpi key={k.clave} icono={ICONOS_KPI[k.clave]} titulo={TITULOS_KPI[k.clave]} valor={entero(k.valor)} variacion={null} nota={k.nota} />
            ))}
          </div>

          <section className="mt-5 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,.04)] sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar propiedades">
                {PESTANAS.map((t) => {
                  const activa = pestana === t.clave
                  return (
                    <button
                      key={t.clave}
                      type="button"
                      role="tab"
                      aria-selected={activa}
                      onClick={() => setPestana(t.clave)}
                      className={
                        activa
                          ? 'rounded-lg bg-[var(--marca)] px-3.5 py-2 text-sm font-semibold text-white'
                          : 'rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted'
                      }
                    >
                      {t.etiqueta} ({entero(conteos[t.clave])})
                    </button>
                  )
                })}
              </div>
              <div className="relative ml-auto">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Buscar por nombre, folio o zona…"
                  className="h-10 w-[min(20rem,80vw)] pl-9"
                  aria-label="Buscar propiedades"
                />
              </div>
            </div>

            <div className="mt-4">
              <TablaDatos
                columnas={columnas}
                datos={filtradas}
                idDe={(p) => p.id}
                nombrePlural="propiedades"
                ordenInicial={[{ id: 'publicacion', desc: true }]}
                vacio={
                  todas.length === 0
                    ? 'Todavía no hay propiedades. Crea la primera con «Nueva propiedad».'
                    : 'Ninguna propiedad coincide con este filtro.'
                }
                tarjetaMovil={(p) => {
                  const est = ETIQUETA_ESTATUS[p.estatus ?? ''] ?? { texto: p.estatus ?? '—', tono: 'neutro' as const }
                  const pub = ETIQUETA_PUBLICACION[p.estado_pub ?? ''] ?? { texto: p.estado_pub ?? '—', tono: 'neutro' as const }
                  return (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Miniatura p={p} lado={64} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-snug">{nombreDe(p)}</p>
                          {(p.ubicacion || p.ciudad) && <p className="text-xs text-muted-foreground">{p.ubicacion || p.ciudad}</p>}
                          {p.folio && <p className="font-mono text-[0.7rem] text-muted-foreground">{p.folio}</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Tipo p={p} />
                        <span className="ml-auto font-heading font-bold text-[var(--marca)]">{precio(p.precio) ?? '—'}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Estado texto={est.texto} tono={est.tono} />
                        <Estado texto={pub.texto} tono={pub.tono} />
                        {Number(p.metros) > 0 && <span className="text-xs text-muted-foreground">{Number(p.metros).toLocaleString('es-MX')} m²</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <BotonNotasComision esEquipo propiedadId={p.id} nombre={nombreDe(p)} tamano="lg" />
                        <Button asChild variant="outline" size="sm" className="h-9 flex-1">
                          <Link href={editar(p.id)}><Pencil aria-hidden /> Editar</Link>
                        </Button>
                        <MenuAcciones p={p} />
                      </div>
                    </div>
                  )
                }}
              />
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              «Editar» abre el asistente completo: ahí están la ubicación en el mapa, las fotos con sus pies, los planos,
              los videos y las amenidades. Lo publicado se puede editar; el cambio se ve en el sitio al guardar.
            </p>
          </section>
        </>
      )}

      <Confirmar
        abierto={pendiente !== null}
        titulo={pendiente ? `${pendiente.a.etiqueta}: ${nombreDe(pendiente.p)}` : ''}
        descripcion={
          pendiente?.a.tipo === 'borrar'
            ? <>Se borra de la base <strong>para siempre</strong>: sus fotos, su folio y su historial de visitas dejan de estar ligados a nada. No hay forma de recuperarla.</>
            : <>Deja de verse en el sitio y pasa a «Archivadas». Se puede restaurar cuando quieras.</>
        }
        confirmar={pendiente?.a.etiqueta ?? ''}
        peligrosa
        trabajando={trabajando}
        onConfirmar={() => { if (pendiente) ejecutar(pendiente.p, pendiente.a) }}
        onCerrar={() => { if (!trabajando) setPendiente(null) }}
      />

      <PiePanel />
    </main>
  )
}
