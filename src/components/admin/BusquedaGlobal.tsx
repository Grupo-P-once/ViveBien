'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, House, Loader2, Search, UserRound, UsersRound } from 'lucide-react'
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import { useDebounce } from '@/lib/useDebounce'
import { limpiarConsulta } from '@/lib/admin/busqueda'
import { PAGINAS_PANEL } from '@/lib/admin/panel-config'
import { claveDeZona } from '@/lib/zonas-buscadas'
import { useSesion } from './sesion'

/**
 * Búsqueda global del panel: propiedades, registros, usuarios y páginas.
 *
 * Se abre con el campo de la barra superior o con Ctrl+K (⌘K en Mac). Busca en
 * el servidor al dejar de escribir, no en cada tecla, y descarta respuestas
 * que llegan tarde: si se escribe «nave» y luego «naves», la respuesta de
 * «nave» no puede pisar a la de «naves».
 */

type Resultado = { id: string; titulo: string; detalle: string | null; enlace: string }
type Respuesta = { q: string; propiedades: Resultado[]; registros: Resultado[]; usuarios: Resultado[]; error?: boolean }

export default function BusquedaGlobal() {
  const { pedir } = useSesion()
  const router = useRouter()
  const [abierta, setAbierta] = useState(false)
  const [texto, setTexto] = useState('')
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null)
  const [fallo, setFallo] = useState(false)
  // La última consulta que contestó el servidor (bien o mal).
  const [contestada, setContestada] = useState('')
  const turno = useRef(0)
  const consulta = limpiarConsulta(useDebounce(texto, 250))
  const cargando = consulta !== '' && contestada !== consulta
  const vigente = consulta && respuesta?.q === consulta ? respuesta : null

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setAbierta((a) => !a)
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [])

  useEffect(() => {
    if (!consulta) return
    const mio = ++turno.current
    pedir<Respuesta>(`/api/admin/buscar?q=${encodeURIComponent(consulta)}`)
      .then((r) => { if (mio === turno.current) { setRespuesta(r); setFallo(false) } })
      .catch(() => { if (mio === turno.current) { setRespuesta(null); setFallo(true) } })
      .finally(() => { if (mio === turno.current) setContestada(consulta) })
  }, [consulta, pedir])

  const paginas = useMemo(() => {
    const clave = claveDeZona(texto)
    if (!clave) return PAGINAS_PANEL
    return PAGINAS_PANEL.filter((p) => claveDeZona(`${p.titulo} ${p.palabras}`).includes(clave))
  }, [texto])

  function ir(enlace: string) {
    setAbierta(false)
    setTexto('')
    router.push(enlace)
  }

  const grupos: { titulo: string; icono: typeof House; filas: Resultado[] }[] = vigente
    ? [
        { titulo: 'Propiedades', icono: House, filas: vigente.propiedades },
        { titulo: 'Registros', icono: UsersRound, filas: vigente.registros },
        { titulo: 'Usuarios', icono: UserRound, filas: vigente.usuarios },
      ]
    : []
  const hayResultados = grupos.some((g) => g.filas.length > 0) || paginas.length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="flex h-10 w-full max-w-xl min-w-0 items-center gap-3 rounded-lg bg-[#f1f0ed] px-3.5 text-left text-sm text-muted-foreground transition-colors hover:bg-[#ebe9e5] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Buscar propiedades, registros y usuarios"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="truncate">Buscar propiedades, registros, usuarios…</span>
        <kbd className="ml-auto hidden rounded border bg-white px-1.5 py-0.5 font-sans text-[0.7rem] whitespace-nowrap text-muted-foreground lg:inline">Ctrl K</kbd>
      </button>

      <CommandDialog
        open={abierta}
        onOpenChange={(a) => { setAbierta(a); if (!a) setTexto('') }}
        title="Búsqueda global"
        description="Busca propiedades, registros, usuarios y páginas del panel."
        className="sm:max-w-xl"
      >
        <Command shouldFilter={false}>
          <CommandInput value={texto} onValueChange={setTexto} placeholder="Nombre, folio, correo, teléfono…" />
          <CommandList className="max-h-[60vh]">
            {cargando && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Buscando…
              </div>
            )}
            {fallo && consulta && !cargando && <p className="px-4 py-3 text-sm text-[var(--estado-mal)]" role="alert">No se pudo buscar. Inténtalo de nuevo.</p>}
            {!cargando && !hayResultados && <CommandEmpty>Sin resultados para «{texto}».</CommandEmpty>}

            {grupos.filter((g) => g.filas.length > 0).map((g) => (
              <CommandGroup key={g.titulo} heading={g.titulo}>
                {g.filas.map((f) => (
                  <CommandItem key={`${g.titulo}:${f.id}`} value={`${g.titulo}:${f.id}`} onSelect={() => ir(f.enlace)}>
                    <g.icono className="text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{f.titulo}</p>
                      {f.detalle && <p className="truncate text-xs text-muted-foreground">{f.detalle}</p>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {paginas.length > 0 && (
              <>
                {grupos.some((g) => g.filas.length > 0) && <CommandSeparator />}
                <CommandGroup heading="Páginas del panel">
                  {paginas.map((p) => (
                    <CommandItem key={p.enlace} value={`pagina:${p.enlace}`} onSelect={() => ir(p.enlace)}>
                      <FileText className="text-muted-foreground" aria-hidden />
                      <span>{p.titulo}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
