'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, ExternalLink, FilePen, House, ImageOff, MoreVertical, Pencil, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Estado } from '@/components/admin/Insignia'
import BotonNotasComision from '@/components/publicador/BotonNotasComision'
import TablaDatos, { type ColumnasPanel } from '@/components/admin/TablaDatos'
import TarjetaKpi from '@/components/admin/TarjetaKpi'
import { miniaturaCloudinary } from '@/lib/cloudinary-url'
import { nombreDe, rutaDe } from '@/lib/propiedad-publica'
import { entero, fechaCorta, precio } from '@/lib/admin/formato'
import { colorTipo } from '@/lib/admin/panel-config'
import { ETIQUETA_PUBLICACION, enPestana, type Pestana, type PropiedadPanel } from '@/lib/admin/propiedades'
import { claveDeZona } from '@/lib/zonas-buscadas'
import { destinoDePublicacion, publicaSinRevisionEfectiva } from '@/lib/publicacion'
import { accesoAPropiedad } from '@/lib/publicador/lista'
import { rutaDeEditorDe } from '@/lib/publicador/espacio'

/**
 * La lista de propiedades de Publicador y Asociado, con el MISMO diseño que la de Admin (R8.5): tabla densa con indicadores,
 * pestañas por estado, búsqueda y acciones por fila. Solo cambia lo que entrega el servidor (únicamente las propiedades de la cuenta)
 * y las acciones, que salen de las reglas de siempre: nada se decide aquí, el servidor vuelve a comprobar cada una.
 */
export type FilaPropia = PropiedadPanel & { nota_moderacion?: string | null }

const TIPO_CORTO: Record<string, string> = { casa: 'Casa', nave: 'Nave', terreno: 'Terreno', bodega: 'Bodega', local: 'Local', comercial: 'Local', oficina: 'Oficina', departamento: 'Depto.' }

function Miniatura({ p, lado = 56 }: { p: FilaPropia; lado?: number }) {
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

function Tipo({ p }: { p: FilaPropia }) {
  const clave = (p.tipo ?? '').toLowerCase() === 'comercial' ? 'local' : (p.tipo ?? '').toLowerCase()
  return (
    <div className="space-y-1">
      <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold text-foreground" style={{ background: `color-mix(in srgb, ${colorTipo(clave)} 14%, white)` }}>
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: colorTipo(clave) }} />
        {TIPO_CORTO[clave] ?? (p.tipo || 'Sin tipo')}
      </span>
      {p.operacion && <p className="text-xs text-muted-foreground capitalize">{p.operacion}</p>}
    </div>
  )
}

const ICONOS = { publicadas: House, borradores: FilePen, revision: ClipboardCheck, corregir: TriangleAlert }

type Props = {
  filas: FilaPropia[] | null
  error: string
  esAdmin: boolean
  publicaSinRevision: boolean
  permisosCargados: boolean
  editaPublicadas: boolean
  /** «En revisión» como pestaña: solo para quien depende de la revisión (el asociado publica directo). */
  conRevision: boolean
  /** Pestaña con la que se abre (`?estado=en_revision`). */
  pestanaInicial: Pestana
  onEstado: (id: string, estado: string) => void
  onReintentar: () => void
}

export default function TablaMisPropiedades({
  filas, error, esAdmin, publicaSinRevision, permisosCargados, editaPublicadas, conRevision, pestanaInicial, onEstado, onReintentar,
}: Props) {
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial)
  const [texto, setTexto] = useState('')

  const todas = useMemo(() => filas ?? [], [filas])
  const pestanas: { clave: Pestana; etiqueta: string }[] = [
    { clave: 'todas', etiqueta: 'Todas' },
    { clave: 'publicadas', etiqueta: 'Publicadas' },
    { clave: 'borradores', etiqueta: 'Borradores' },
    ...(conRevision ? [{ clave: 'revision' as const, etiqueta: 'En revisión' }] : []),
  ]
  const cuenta = (c: Pestana) => todas.filter((p) => enPestana(p, c)).length
  const aCorregir = todas.filter((p) => p.estado_pub === 'cambios_solicitados' || p.estado_pub === 'rechazada').length
  const clave = claveDeZona(texto)
  const visibles = useMemo(() => todas.filter((p) => {
    if (!enPestana(p, pestana)) return false
    if (!clave) return true
    return claveDeZona([p.titulo, p.folio, p.ubicacion, p.colonia, p.ciudad, p.tipo].filter(Boolean).join(' ')).includes(clave)
  }), [todas, pestana, clave])

  /** Las acciones de una fila, con las reglas de siempre (el servidor las vuelve a comprobar). */
  function acciones(p: FilaPropia) {
    const est = p.estado_pub || 'publicada'
    const completa = (p.completitud ?? 0) >= 80
    const publicaAqui = permisosCargados && destinoDePublicacion(est, esAdmin, publicaSinRevisionEfectiva(publicaSinRevision, p as never)) === 'publicada'
    const lista: { etiqueta: string; ejecutar: () => void; peligrosa?: boolean; desactivada?: boolean }[] = []
    if (est === 'borrador' || est === 'cambios_solicitados') {
      lista.push({ etiqueta: publicaAqui ? 'Publicar ahora' : 'Enviar a revisión', ejecutar: () => onEstado(p.id, publicaAqui ? 'publicada' : 'en_revision'), desactivada: !completa })
    }
    if (est === 'en_revision') lista.push({ etiqueta: 'Retirar el envío', ejecutar: () => onEstado(p.id, 'borrador') })
    if (est === 'rechazada') lista.push({ etiqueta: 'Volver a borrador', ejecutar: () => onEstado(p.id, 'borrador') })
    return lista
  }

  function Menu({ p }: { p: FilaPropia }) {
    const lista = acciones(p)
    const publica = p.estado_pub === 'publicada' ? rutaDe(p as never) : null
    if (!lista.length && !publica) return null
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label={`Más acciones para ${nombreDe(p as never)}`}><MoreVertical aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {publica && (
            <>
              <DropdownMenuItem asChild><Link href={publica}><ExternalLink aria-hidden /> Ver publicada</Link></DropdownMenuItem>
              {lista.length > 0 && <DropdownMenuSeparator />}
            </>
          )}
          {lista.map((a) => (
            <DropdownMenuItem key={a.etiqueta} disabled={a.desactivada} onSelect={a.ejecutar}
              className={a.peligrosa ? 'text-[var(--estado-mal)] focus:text-[var(--estado-mal)]' : undefined}>
              {a.etiqueta}{a.desactivada ? ' (completa al 80 %)' : ''}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  function Principal({ p }: { p: FilaPropia }) {
    const est = p.estado_pub || 'publicada'
    const completa = (p.completitud ?? 0) >= 80
    const acc = accesoAPropiedad({ estadoPub: est, esAdmin, editaPublicadas, completa })
    const texto = !permisosCargados && est === 'publicada' ? 'Abrir ficha' : acc.texto
    return (
      <Button asChild variant="outline" size="sm" className="h-8">
        <Link href={rutaDeEditorDe(p.id, 'publicador')} data-acceso={acc.editable ? 'editar' : 'ver'}><Pencil aria-hidden /> {texto}</Link>
      </Button>
    )
  }

  const columnas: ColumnasPanel<FilaPropia> = useMemo(() => [
    {
      id: 'propiedad',
      accessorFn: (p) => nombreDe(p as never),
      header: 'Propiedad',
      cell: ({ row }) => {
        const p = row.original
        return (
          <div className="flex min-w-[15rem] items-start gap-3">
            <Miniatura p={p} />
            <div className="min-w-0">
              <p className="font-medium leading-snug">{nombreDe(p as never)}</p>
              {(p.ubicacion || p.ciudad) && <p className="text-xs text-muted-foreground">{p.ubicacion || p.ciudad}</p>}
              {p.folio && <p className="font-mono text-[0.7rem] tracking-wide text-muted-foreground">{p.folio}</p>}
              {p.nota_moderacion && <p className="mt-1 max-w-[22rem] rounded border-l-2 border-[var(--estado-aviso)] bg-[var(--estado-aviso-fondo)] px-2 py-1 text-xs"><strong>Nota del revisor:</strong> {p.nota_moderacion}</p>}
            </div>
          </div>
        )
      },
    },
    { id: 'tipo', accessorFn: (p) => p.tipo ?? '', header: 'Tipo', cell: ({ row }) => <Tipo p={row.original} /> },
    { id: 'precio', accessorFn: (p) => Number(p.precio) || 0, header: 'Precio', cell: ({ row }) => <span className="font-heading font-bold whitespace-nowrap text-[var(--marca)]">{precio(row.original.precio) ?? '—'}</span> },
    {
      id: 'avance',
      accessorFn: (p) => p.completitud ?? 0,
      header: 'Avance',
      cell: ({ row }) => {
        const c = row.original.completitud ?? 0
        return (
          <div className="w-28" title={c >= 80 ? 'Lista para enviarse' : 'Necesita 80 % para enviarse'}>
            <div className="h-1.5 overflow-hidden rounded bg-muted"><div className="h-full" style={{ width: `${c}%`, background: c >= 80 ? 'var(--estado-bien)' : 'var(--estado-aviso)' }} /></div>
            <span className="text-xs text-muted-foreground">{c} % completo</span>
          </div>
        )
      },
    },
    {
      id: 'publicacion',
      accessorFn: (p) => p.publicada_en ?? p.created_at ?? '',
      header: 'Estado',
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
      cell: ({ row }) => <div className="flex items-center justify-end gap-2"><BotonNotasComision propiedadId={row.original.id} nombre={nombreDe(row.original as never)} /><Principal p={row.original} /><Menu p={row.original} /></div>,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [esAdmin, publicaSinRevision, permisosCargados, editaPublicadas])

  return (
    <>
      {error && (
        <p className="mt-6 flex items-center gap-2 rounded-lg bg-[var(--estado-aviso-fondo)] px-4 py-3 text-sm text-[var(--estado-aviso)]" role="alert">
          <TriangleAlert className="size-4 shrink-0" aria-hidden /> {error}
          <Button variant="outline" size="sm" className="ml-auto" onClick={onReintentar}><RefreshCw aria-hidden /> Reintentar</Button>
        </p>
      )}

      {filas === null ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[132px] animate-pulse rounded-xl border bg-card" />)}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <TarjetaKpi icono={ICONOS.publicadas} titulo="Publicadas en el sitio" valor={entero(cuenta('publicadas'))} variacion={null} nota="ya se ven al público" />
            <TarjetaKpi icono={ICONOS.borradores} titulo="Borradores" valor={entero(cuenta('borradores'))} variacion={null} nota={cuenta('borradores') === 0 ? 'nada a medias' : 'a medias o devueltas'} />
            {conRevision && <TarjetaKpi icono={ICONOS.revision} titulo="En revisión" valor={entero(cuenta('revision'))} variacion={null} nota={cuenta('revision') === 0 ? 'nada esperando' : 'esperan al revisor'} />}
            <TarjetaKpi icono={ICONOS.corregir} titulo="Por corregir" valor={entero(aCorregir)} variacion={null} nota={aCorregir === 0 ? 'todo en orden' : 'con cambios pedidos o rechazadas'} />
          </div>

          <section className="mt-5 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,.04)] sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar propiedades">
                {pestanas.map((t) => {
                  const activa = pestana === t.clave
                  return (
                    <button key={t.clave} type="button" role="tab" aria-selected={activa} onClick={() => setPestana(t.clave)}
                      className={activa ? 'rounded-lg bg-[var(--marca)] px-3.5 py-2 text-sm font-semibold text-white' : 'rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted'}>
                      {t.etiqueta} ({entero(cuenta(t.clave))})
                    </button>
                  )
                })}
              </div>
              <div className="relative ml-auto">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, folio o zona…" className="h-10 w-[min(20rem,80vw)] pl-9" aria-label="Buscar propiedades" />
              </div>
            </div>

            <div className="mt-4">
              <TablaDatos
                columnas={columnas}
                datos={visibles}
                idDe={(p) => p.id}
                nombrePlural="propiedades"
                ordenInicial={[{ id: 'publicacion', desc: true }]}
                vacio={todas.length === 0 ? 'Todavía no tienes propiedades. Crea la primera con «Nueva propiedad».' : 'Ninguna propiedad coincide con este filtro.'}
                tarjetaMovil={(p) => {
                  const pub = ETIQUETA_PUBLICACION[p.estado_pub ?? ''] ?? { texto: p.estado_pub ?? '—', tono: 'neutro' as const }
                  return (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Miniatura p={p} lado={64} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-snug">{nombreDe(p as never)}</p>
                          {(p.ubicacion || p.ciudad) && <p className="text-xs text-muted-foreground">{p.ubicacion || p.ciudad}</p>}
                          {p.folio && <p className="font-mono text-[0.7rem] text-muted-foreground">{p.folio}</p>}
                          {p.nota_moderacion && <p className="mt-1 text-xs"><strong>Nota del revisor:</strong> {p.nota_moderacion}</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Tipo p={p} />
                        <span className="ml-auto font-heading font-bold text-[var(--marca)]">{precio(p.precio) ?? '—'}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Estado texto={pub.texto} tono={pub.tono} />
                        <span className="text-xs text-muted-foreground">{p.completitud ?? 0} % completo</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2"><BotonNotasComision propiedadId={p.id} nombre={nombreDe(p as never)} tamano="lg" /><Principal p={p} /><Menu p={p} /></div>
                    </div>
                  )
                }}
              />
            </div>
          </section>
        </>
      )}
    </>
  )
}
