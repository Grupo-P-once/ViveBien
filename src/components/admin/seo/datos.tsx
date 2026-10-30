'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { interpretarExportacion, type FilaGrafico, type FilaProblema, type FilaRendimiento } from '@/lib/seo/csv'
import { useSesion } from '@/components/admin/sesion'

/**
 * Datos del apartado SEO en el navegador. Las exportaciones de Search Console se leen AQUÍ (no se suben a ningún servidor) y se guardan solo en la
 * pestaña (`sessionStorage`); la última auditoría igual. Si el almacenamiento no está disponible, todo funciona sin recordar.
 */

export type Importado = {
  grafico?: FilaGrafico[]
  problemas?: FilaProblema[]
  consultas?: FilaRendimiento[]
  paginas?: FilaRendimiento[]
  fechas?: FilaRendimiento[]
  archivos: Array<{ nombre: string; tipo: string; filas: number }>
}
const VACIO: Importado = { archivos: [] }
const CLAVE_IMPORT = 'vb.seo.importacion.v1'
const CLAVE_AUDIT = 'vb.seo.auditoria.v1'

function leer<T>(clave: string): T | null {
  try { const t = window.sessionStorage.getItem(clave); return t ? (JSON.parse(t) as T) : null } catch { return null }
}
function guardar(clave: string, valor: unknown) {
  try { if (valor == null) window.sessionStorage.removeItem(clave); else window.sessionStorage.setItem(clave, JSON.stringify(valor)) } catch { /* sin almacenamiento: no se recuerda */ }
}

export function useImportacion() {
  const [datos, setDatos] = useState<Importado>(VACIO)
  const [avisos, setAvisos] = useState<string[]>([])
  // Se lee después de montar (el almacenamiento no existe en el servidor); aplazado un instante para no encadenar renders.
  useEffect(() => { const t = setTimeout(() => { const g = leer<Importado>(CLAVE_IMPORT); if (g) setDatos(g) }, 0); return () => clearTimeout(t) }, [])

  const importar = useCallback(async (archivos: FileList | File[]) => {
    const nuevos: string[] = []
    const acumulado: Importado = { ...datos, archivos: [...datos.archivos] }
    for (const f of Array.from(archivos)) {
      if (!/\.csv$/i.test(f.name)) { nuevos.push(`«${f.name}» no es un CSV. Si es un ZIP de Search Console, descomprímelo y elige los CSV de dentro.`); continue }
      const e = interpretarExportacion(await f.text())
      if (e.tipo === 'desconocido') { nuevos.push(`«${f.name}»: ${e.motivo}`); continue }
      // Los problemas críticos y no críticos se suman; el resto reemplaza lo anterior del mismo tipo.
      if (e.tipo === 'problemas') acumulado.problemas = [...(acumulado.problemas ?? []).filter((p) => !e.filas.some((n) => n.motivo === p.motivo)), ...e.filas]
      else acumulado[e.tipo] = e.filas as never
      acumulado.archivos = [...acumulado.archivos.filter((a) => a.nombre !== f.name), { nombre: f.name, tipo: e.tipo, filas: e.filas.length }]
    }
    setDatos(acumulado); guardar(CLAVE_IMPORT, acumulado); setAvisos(nuevos)
  }, [datos])

  const limpiar = useCallback(() => { setDatos(VACIO); setAvisos([]); guardar(CLAVE_IMPORT, null) }, [])
  return { datos, avisos, importar, limpiar, hay: datos.archivos.length > 0 }
}

export function ZonaImportar({ importar, limpiar, hay, archivos, avisos }: { importar: (a: FileList) => void; limpiar: () => void; hay: boolean; archivos: Importado['archivos']; avisos: string[] }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted focus-within:ring-2 focus-within:ring-[var(--marca)]">
          <FileUp className="size-4" aria-hidden />
          Importar CSV de Search Console
          <input type="file" accept=".csv,text/csv" multiple className="sr-only" aria-label="Importar archivos CSV de Search Console" onChange={(e) => { if (e.target.files?.length) importar(e.target.files); e.target.value = '' }} />
        </label>
        {hay && <Button variant="outline" size="sm" onClick={limpiar}><Trash2 aria-hidden /> Quitar lo importado</Button>}
        <p className="text-xs text-muted-foreground">Los archivos se leen en tu navegador: no se suben a ningún servidor.</p>
      </div>
      {archivos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="Archivos importados">
          {archivos.map((a) => <li key={a.nombre} className="rounded-md bg-muted px-2 py-1">{a.nombre} · {a.tipo} · {a.filas} filas</li>)}
        </ul>
      )}
      {avisos.length > 0 && <ul role="status" className="mt-3 space-y-1 text-sm text-amber-900">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
    </div>
  )
}

/** Pedir al servidor la auditoría o la lectura de robots y recordar la última en la pestaña. */
export function useApi<T>(ruta: string, claveMemoria?: string) {
  const { pedir } = useSesion()
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  useEffect(() => {
    if (!claveMemoria) return
    const t = setTimeout(() => { const g = leer<T>(claveMemoria); if (g) setDatos(g) }, 0)
    return () => clearTimeout(t)
  }, [claveMemoria])
  const ejecutar = useCallback(async (consulta = '') => {
    setCargando(true); setError('')
    try {
      const r = await pedir<T>(`${ruta}${consulta}`)
      setDatos(r); if (claveMemoria) guardar(claveMemoria, r)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la consulta.') }
    finally { setCargando(false) }
  }, [pedir, ruta, claveMemoria])
  return { datos, error, cargando, ejecutar }
}
export const MEMORIA_AUDITORIA = CLAVE_AUDIT
