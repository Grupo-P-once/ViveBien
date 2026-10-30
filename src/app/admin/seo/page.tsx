'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Encabezado from '@/components/admin/Encabezado'
import PiePanel from '@/components/admin/PiePanel'
import { MEMORIA_AUDITORIA, useApi, useImportacion, ZonaImportar } from '@/components/admin/seo/datos'
import { Cargando, ErrorCaja, InsigniaGravedad, Kpi, Tarjeta, Vacio, fmt } from '@/components/admin/seo/ui'
import { accionParaMotivo, resumirGrafico } from '@/lib/seo/csv'
import type { RespuestaAuditoria } from '@/lib/seo/tipos'

/**
 * SEO · Resumen (solo Super Admin). Reúne lo que importa de un vistazo: lo que Search Console dice (exportaciones importadas en el navegador), la
 * última auditoría técnica del sitio y una lista de «qué hacer». No promete posiciones: muestra datos y qué corregir.
 */

/** Pendientes ya conocidos (22-oct-2026, con evidencia en Obsidian → SEO). Se revisan a mano: no se actualizan solos. */
const CONOCIDOS = [
  { id: 'maps-direccion', texto: 'La ficha de Google Maps no tiene calle ni número (solo código postal y colonia). La dirección oficial es la del sitio: agregarla en la ficha (la administra la cuenta Super Admin).', donde: '/admin/seo/negocio' },
  { id: 'maps-horario', texto: 'El sitio ya usa el horario oficial de Google Maps (lun–vie 9:00–17:30, sáb y dom cerrado). En la ficha, el miércoles dice «Abierto las 24 horas»: probable error que hay que corregir.', donde: '/admin/seo/negocio' },
  { id: 'sitemap-lastmod', texto: 'En el sitemap, 44 de 72 URL no traen «lastmod» (inicio, páginas fijas, ayuda y categorías del blog). Añadirlo solo si la fecha es real.', donde: '/admin/seo/robots' },
  ]

export default function PaginaSeoResumen() {
  const imp = useImportacion()
  const aud = useApi<RespuestaAuditoria>('/api/admin/seo/auditoria', MEMORIA_AUDITORIA)
  const g = useMemo(() => (imp.datos.grafico ? resumirGrafico(imp.datos.grafico) : null), [imp.datos.grafico])
  const problemas = useMemo(() => (imp.datos.problemas ?? []).map((p) => ({ ...p, ...accionParaMotivo(p.motivo) })), [imp.datos.problemas])
  const sinIndexarReales = problemas.filter((p) => p.esProblema).reduce((s, p) => s + p.paginas, 0)
  const tareas = [
    ...problemas.filter((p) => p.esProblema && p.paginas > 0).map((p) => ({ id: `gsc-${p.motivo}`, texto: `Search Console: «${p.motivo}» (${p.paginas} página${p.paginas === 1 ? '' : 's'}). ${p.accion}`, donde: '/admin/seo/indexacion' })),
    ...(aud.datos?.hallazgos ?? []).filter((h) => h.gravedad === 'critica' || h.gravedad === 'alta').slice(0, 8).map((h) => ({ id: `${h.id}-${h.ruta}`, texto: `${h.ruta}: ${h.mensaje} ${h.correccion}`, donde: '/admin/seo/salud' })),
    ...CONOCIDOS,
  ]

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado versal="SEO" titulo="Resumen de SEO" descripcion="Qué sabe Google de vivebienn.com, cómo está el sitio por dentro y qué conviene corregir. Solo lectura." />

      <div className="mt-6 space-y-5">
        <Tarjeta titulo="Search Console" descripcion="Exporta desde Search Console (Indexación → Páginas, y Rendimiento) y elige aquí los CSV. Los datos de Google llegan con 2–3 días de retraso.">
          <ZonaImportar importar={imp.importar} limpiar={imp.limpiar} hay={imp.hay} archivos={imp.datos.archivos} avisos={imp.avisos} />
          {g ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi etiqueta="Páginas indexadas" valor={fmt(g.indexadas)} nota={g.variacionIndexadas == null ? undefined : `${g.variacionIndexadas >= 0 ? '+' : ''}${g.variacionIndexadas} en 28 días`} tono="bien" />
              <Kpi etiqueta="Sin indexar" valor={fmt(g.sinIndexar)} nota={problemas.length ? `${fmt(sinIndexarReales)} por corregir; el resto es normal (redirecciones, noindex)` : undefined} />
              <Kpi etiqueta="Impresiones por día" valor={fmt(g.impresionesPorDia, 1)} nota={`${fmt(g.impresionesTotal)} del ${g.desde} al ${g.hasta}`} />
              <Kpi etiqueta="Periodo" valor={`${g.desde?.slice(5) ?? '—'} → ${g.hasta?.slice(5) ?? '—'}`} nota="Fechas del archivo importado" />
            </div>
          ) : (
            <div className="mt-4"><Vacio titulo="Aún no hay datos de Search Console" texto="Importa el CSV «Gráfico» y «Problemas críticos» de Cobertura (o los de Rendimiento) para ver aquí el resumen. También puedes seguir sin ellos: la auditoría técnica no los necesita." /></div>
          )}
          {imp.hay && <p className="mt-3 text-sm"><Link className="underline" href="/admin/seo/indexacion">Ver indexación</Link> · <Link className="underline" href="/admin/seo/rendimiento">Ver rendimiento</Link></p>}
        </Tarjeta>

        <Tarjeta titulo="Salud técnica" descripcion="Rastrea el propio sitio (con ritmo limitado y respetando robots.txt) y busca lo que impide o estorba la indexación."
          acciones={<Button size="sm" onClick={() => aud.ejecutar('?alcance=rapida')} disabled={aud.cargando}><Play aria-hidden /> Auditoría rápida</Button>}>
          {aud.cargando && <Cargando texto="Revisando el sitio… tarda cerca de un minuto." />}
          {aud.error && <ErrorCaja mensaje={aud.error} reintentar={() => aud.ejecutar('?alcance=rapida')} />}
          {aud.datos && !aud.cargando && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Kpi etiqueta="Páginas revisadas" valor={fmt(aud.datos.resumen.paginas)} nota={`${aud.datos.resumen.con200} responden 200`} />
                <Kpi etiqueta="Críticas" valor={fmt(aud.datos.resumen.porGravedad.critica)} tono={aud.datos.resumen.porGravedad.critica ? 'mal' : 'bien'} />
                <Kpi etiqueta="Altas" valor={fmt(aud.datos.resumen.porGravedad.alta)} tono={aud.datos.resumen.porGravedad.alta ? 'mal' : 'bien'} />
                <Kpi etiqueta="Medias y bajas" valor={fmt(aud.datos.resumen.porGravedad.media + aud.datos.resumen.porGravedad.baja)} />
                <Kpi etiqueta="Índice orientativo" valor={fmt(aud.datos.resumen.indice)} nota="Resumen de esta lista, no una medida de Google" />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Auditoría {aud.datos.alcance} de {aud.datos.origen} · {new Date(aud.datos.generado).toLocaleString('es-MX')} · <Link className="underline" href="/admin/seo/salud">Ver todos los hallazgos</Link></p>
            </>
          )}
          {!aud.datos && !aud.cargando && !aud.error && <Vacio titulo="Todavía no se ha ejecutado" texto="Pulsa «Auditoría rápida». No envía formularios ni crea contactos: solo lee las páginas públicas." />}
        </Tarjeta>

        <Tarjeta titulo="Qué hacer ahora" descripcion="Lo más importante primero. Lo de Search Console y la auditoría sale de los datos de arriba; lo demás son pendientes ya conocidos (revisar a mano).">
          <ol className="space-y-3">
            {tareas.map((t, i) => (
              <li key={t.id} className="flex gap-3 text-sm">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">{t.texto} <Link href={t.donde} className="whitespace-nowrap underline">Abrir</Link></span>
              </li>
            ))}
          </ol>
          {aud.datos && aud.datos.hallazgos.slice(0, 3).length > 0 && (
            <ul className="mt-4 space-y-1 border-t pt-3 text-sm" aria-label="Hallazgos principales de la última auditoría">
              {aud.datos.hallazgos.slice(0, 3).map((h) => <li key={h.id + h.ruta} className="flex flex-wrap items-center gap-2"><InsigniaGravedad g={h.gravedad} /> <code className="text-xs">{h.ruta}</code> {h.mensaje}</li>)}
            </ul>
          )}
        </Tarjeta>
      </div>
      <PiePanel />
    </main>
  )
}
