'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Encabezado from '@/components/admin/Encabezado'
import PiePanel from '@/components/admin/PiePanel'
import { MEMORIA_AUDITORIA, useApi } from '@/components/admin/seo/datos'
import { Cargando, ErrorCaja, InsigniaGravedad, Kpi, Tabla, Tarjeta, Vacio, fmt } from '@/components/admin/seo/ui'
import type { Gravedad } from '@/lib/seo/auditoria'
import type { RespuestaAuditoria } from '@/lib/seo/tipos'

/** SEO · Salud técnica: auditoría del sitio público (rastreo propio, con ritmo limitado y respetando robots.txt). Solo lectura. */

const FILTROS: Array<{ v: 'todas' | Gravedad; t: string }> = [{ v: 'todas', t: 'Todas' }, { v: 'critica', t: 'Críticas' }, { v: 'alta', t: 'Altas' }, { v: 'media', t: 'Medias' }, { v: 'baja', t: 'Bajas' }]

export default function PaginaSeoSalud() {
  const aud = useApi<RespuestaAuditoria>('/api/admin/seo/auditoria', MEMORIA_AUDITORIA)
  const [origen, setOrigen] = useState<'propio' | 'produccion'>('propio')
  const [filtro, setFiltro] = useState<'todas' | Gravedad>('todas')
  const correr = (alcance: 'rapida' | 'completa') => aud.ejecutar(`?alcance=${alcance}&origen=${origen}`)
  const hallazgos = (aud.datos?.hallazgos ?? []).filter((h) => filtro === 'todas' || h.gravedad === filtro)

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado versal="SEO" titulo="Salud técnica" descripcion="Revisa cada página pública: respuesta, título, descripción, canónica, noindex, imagen para compartir, datos estructurados y más." />
      <div className="mt-6 space-y-5">
        <Tarjeta titulo="Ejecutar auditoría" descripcion="Lee las páginas públicas del sitio elegido, a un ritmo de 2 por segundo y respetando robots.txt. No envía formularios, no crea contactos y no escribe nada.">
          <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <legend className="sr-only">Sitio a auditar</legend>
            <label className="flex items-center gap-2"><input type="radio" name="origen" checked={origen === 'propio'} onChange={() => setOrigen('propio')} /> Este despliegue</label>
            <label className="flex items-center gap-2"><input type="radio" name="origen" checked={origen === 'produccion'} onChange={() => setOrigen('produccion')} /> Producción (vivebienn.com)</label>
          </fieldset>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => correr('rapida')} disabled={aud.cargando}><Play aria-hidden /> Auditoría rápida (≈25 páginas)</Button>
            <Button size="sm" variant="outline" onClick={() => correr('completa')} disabled={aud.cargando}>Auditoría completa (hasta 80)</Button>
          </div>
          {aud.cargando && <div className="mt-3"><Cargando texto="Revisando el sitio… la completa tarda hasta un par de minutos." /></div>}
          {aud.error && <div className="mt-3"><ErrorCaja mensaje={aud.error} reintentar={() => correr('rapida')} /></div>}
        </Tarjeta>

        {!aud.datos && !aud.cargando ? (
          <Vacio titulo="Todavía no hay resultados" texto="Ejecuta la auditoría rápida para ver los hallazgos." />
        ) : aud.datos && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Kpi etiqueta="Páginas" valor={fmt(aud.datos.resumen.paginas)} nota={`${aud.datos.resumen.con200} responden 200`} />
              <Kpi etiqueta="Críticas" valor={fmt(aud.datos.resumen.porGravedad.critica)} tono={aud.datos.resumen.porGravedad.critica ? 'mal' : 'bien'} />
              <Kpi etiqueta="Altas" valor={fmt(aud.datos.resumen.porGravedad.alta)} tono={aud.datos.resumen.porGravedad.alta ? 'mal' : 'bien'} />
              <Kpi etiqueta="Medias / bajas" valor={`${fmt(aud.datos.resumen.porGravedad.media)} / ${fmt(aud.datos.resumen.porGravedad.baja)}`} />
              <Kpi etiqueta="Respuesta media" valor={aud.datos.resumen.msMedio == null ? '—' : `${fmt(aud.datos.resumen.msMedio)} ms`} nota={`Índice orientativo: ${aud.datos.resumen.indice}`} />
            </div>
            <p className="text-xs text-muted-foreground">Sitio auditado: {aud.datos.origen} ({aud.datos.alcance}) · {new Date(aud.datos.generado).toLocaleString('es-MX')} · {(aud.datos.duracionMs / 1000).toFixed(0)} s. El índice resume esta lista; no es una medida de Google.</p>

            <Tarjeta titulo="Hallazgos" acciones={
              <div role="group" aria-label="Filtrar por gravedad" className="flex flex-wrap gap-1.5">
                {FILTROS.map((f) => <Button key={f.v} size="sm" variant={filtro === f.v ? 'default' : 'outline'} aria-pressed={filtro === f.v} onClick={() => setFiltro(f.v)}>{f.t}</Button>)}
              </div>}>
              <Tabla etiqueta="Hallazgos de la auditoría" filas={hallazgos} idDe={(h, i) => `${h.id}-${h.ruta}-${i}`} vacio={aud.datos.hallazgos.length ? 'Nada con ese filtro.' : 'Sin hallazgos: las páginas revisadas cumplen las comprobaciones.'}
                columnas={[
                  { clave: 'g', titulo: 'Gravedad', celda: (h) => <InsigniaGravedad g={h.gravedad} /> },
                  { clave: 'r', titulo: 'Página', celda: (h) => <code className="text-xs break-all">{h.ruta}</code> },
                  { clave: 'm', titulo: 'Qué pasa', celda: (h) => <><span className="font-medium">{h.mensaje}</span><span className="mt-0.5 block text-xs text-muted-foreground">Evidencia: {h.evidencia}</span></>, ancho: 'min-w-[16rem]' },
                  { clave: 'c', titulo: 'Cómo corregirlo', celda: (h) => h.correccion, ancho: 'min-w-[16rem]' },
                ]} />
            </Tarjeta>

            <Tarjeta titulo="Páginas revisadas" descripcion={aud.datos.omitidas.length ? `Omitidas: ${aud.datos.omitidas.slice(0, 6).join('; ')}${aud.datos.omitidas.length > 6 ? '…' : ''}` : undefined}>
              <Tabla etiqueta="Páginas revisadas" filas={aud.datos.paginas} idDe={(p) => p.ruta} vacio="Sin páginas."
                columnas={[
                  { clave: 'r', titulo: 'Ruta', celda: (p) => <code className="text-xs break-all">{p.ruta}</code> },
                  { clave: 'e', titulo: 'HTTP', alinear: 'der', celda: (p) => (p.estado ?? '—') + (p.redireccion ? ` → ${p.redireccion}` : '') },
                  { clave: 'ms', titulo: 'ms', alinear: 'der', celda: (p) => fmt(p.ms) },
                  { clave: 's', titulo: 'En sitemap', celda: (p) => (p.enSitemap ? 'Sí' : 'No') },
                  { clave: 'n', titulo: 'noindex', celda: (p) => (p.noindex ? 'Sí' : 'No') },
                  { clave: 't', titulo: 'Título', celda: (p) => p.titulo ?? '—', ancho: 'min-w-[14rem]' },
                  { clave: 'j', titulo: 'Datos estructurados', celda: (p) => (p.jsonld.length ? p.jsonld.join(', ') : '—') },
                ]} />
            </Tarjeta>
          </>
        )}
      </div>
      <PiePanel />
    </main>
  )
}
