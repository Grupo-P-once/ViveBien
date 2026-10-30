'use client'

import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Encabezado from '@/components/admin/Encabezado'
import PiePanel from '@/components/admin/PiePanel'
import { useApi } from '@/components/admin/seo/datos'
import { Cargando, ErrorCaja, Tabla, Tarjeta, fmt } from '@/components/admin/seo/ui'
import { cn } from '@/lib/utils'
import type { RespuestaRobots } from '@/lib/seo/tipos'

/** SEO · Robots y sitemap: qué reglas publica el sitio, qué rastreadores (clásicos y de IA) pueden entrar y qué cubre el sitemap. Solo lectura. */

const ESTADO = { permitido: 'bg-emerald-100 text-emerald-900', parcial: 'bg-amber-100 text-amber-900', bloqueado: 'bg-red-100 text-red-900' } as const
const TEXTO = { permitido: 'Permitido', parcial: 'Parcial', bloqueado: 'Bloqueado' } as const

export default function PaginaSeoRobots() {
  const api = useApi<RespuestaRobots>('/api/admin/seo/robots')
  useEffect(() => { void api.ejecutar('?origen=propio') }, [api.ejecutar]) // eslint-disable-line react-hooks/exhaustive-deps
  const d = api.datos

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado versal="SEO" titulo="Robots y sitemap" descripcion="Las reglas que el sitio le da a los buscadores y a los rastreadores de IA, y la lista de páginas que ofrece en su sitemap."
        acciones={<Button variant="outline" size="sm" onClick={() => api.ejecutar('?origen=propio')} disabled={api.cargando}><RefreshCw aria-hidden /> Volver a leer</Button>} />
      <div className="mt-6 space-y-5">
        {api.cargando && <Cargando />}
        {api.error && <ErrorCaja mensaje={api.error} reintentar={() => api.ejecutar('?origen=propio')} />}
        {d && (
          <>
            <Tarjeta titulo="robots.txt" descripcion={`Leído de ${d.origen}/robots.txt`}>
              {!d.robots ? <p className="text-sm text-amber-900">No se pudo leer robots.txt: sin él, los rastreadores asumen que pueden entrar a todo.</p> : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {d.robots.grupos.map((g) => (
                    <div key={g.agentes.join(',')} className="rounded-lg border p-3 text-sm">
                      <p className="font-semibold">Agentes: {g.agentes.join(', ')}</p>
                      <p className="mt-2 text-xs font-semibold text-muted-foreground uppercase">Permite</p>
                      <p className="break-all">{g.permite.length ? g.permite.join('  ·  ') : '—'}</p>
                      <p className="mt-2 text-xs font-semibold text-muted-foreground uppercase">Bloquea</p>
                      <p className="break-all">{g.niega.length ? g.niega.join('  ·  ') : '—'}</p>
                    </div>
                  ))}
                  <div className="rounded-lg border p-3 text-sm"><p className="font-semibold">Sitemaps declarados</p><ul className="mt-1 list-disc pl-5 break-all">{d.robots.sitemaps.length ? d.robots.sitemaps.map((s) => <li key={s}>{s}</li>) : <li>Ninguno: conviene declarar el sitemap en robots.txt.</li>}</ul></div>
                </div>
              )}
            </Tarjeta>

            <Tarjeta titulo="Rastreadores" descripcion="Si pueden entrar a las páginas públicas principales (inicio, propiedades, blog). Es información, no una recomendación de bloquear o permitir. Google indica que no usa llms.txt y que los «trucos de GEO» no ayudan.">
              <Tabla etiqueta="Rastreadores" filas={d.rastreadores} idDe={(r) => r.agente} vacio="Sin robots.txt que evaluar."
                columnas={[
                  { clave: 'a', titulo: 'Rastreador', celda: (r) => <code className="text-xs">{r.agente}</code> },
                  { clave: 't', titulo: 'Para qué', celda: (r) => r.tipo },
                  { clave: 'e', titulo: 'Estado', celda: (r) => <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', ESTADO[r.estado])}>{TEXTO[r.estado]}</span> },
                ]} />
            </Tarjeta>

            <Tarjeta titulo="Sitemap" descripcion="Google usa «lastmod» si es real y consistente; ignora «priority» y «changefreq».">
              <Tabla etiqueta="Sitemaps" filas={d.sitemaps} idDe={(s) => s.url} vacio="No se encontró ningún sitemap."
                columnas={[
                  { clave: 'u', titulo: 'Archivo', celda: (s) => <code className="text-xs break-all">{s.url}</code> },
                  { clave: 'e', titulo: 'HTTP', alinear: 'der', celda: (s) => s.estado ?? '—' },
                  { clave: 'n', titulo: 'URL', alinear: 'der', celda: (s) => fmt(s.urls) },
                  { clave: 'l', titulo: 'Con «lastmod»', alinear: 'der', celda: (s) => `${fmt(s.conLastmod)} (${s.urls ? Math.round((s.conLastmod / s.urls) * 100) : 0} %)` },
                  { clave: 'x', titulo: 'Observación', celda: (s) => (s.urls > 0 && s.conLastmod < s.urls ? `${s.urls - s.conLastmod} URL sin «lastmod». Añádelo solo si la fecha es real.` : s.estado === 200 ? 'Sin observaciones.' : 'No respondió 200.') },
                ]} />
            </Tarjeta>
          </>
        )}
      </div>
      <PiePanel />
    </main>
  )
}
