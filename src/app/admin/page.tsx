'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarDays, ExternalLink, History, House, RefreshCw, Target, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSesion } from '@/components/admin/sesion'
import Encabezado from '@/components/admin/Encabezado'
import SelectorPeriodo from '@/components/admin/SelectorPeriodo'
import TarjetaKpi from '@/components/admin/TarjetaKpi'
import PiePanel from '@/components/admin/PiePanel'
import ActividadReciente from '@/components/admin/ActividadReciente'
import AvisoConfiguracion from '@/components/AvisoConfiguracion'
import Interaccion from '@/components/admin/dashboard/Interaccion'
import Tendencia from '@/components/admin/dashboard/Tendencia'
import Distribucion from '@/components/admin/dashboard/Distribucion'
import Zonas from '@/components/admin/dashboard/Zonas'
import { PERIODO_POR_DEFECTO, periodoValido, type Periodo } from '@/lib/admin/periodo'
import type { Resumen } from '@/lib/admin/resumen'
import type { ItemActividad } from '@/lib/admin/actividad'
import { entero, porcentaje } from '@/lib/admin/formato'
import { FRASES_MARCA } from '@/lib/admin/panel-config'
import { nombreCorto, saludoPara } from '@/lib/admin/saludo'

type RespuestaResumen = Resumen & { periodo: Periodo; faltan: string[]; eventosRecortados: boolean }

const CLAVE_PERIODO = 'vb-panel-periodo'

const ICONOS = { publicadas: House, leads: Users, conversion: Target, mercado: CalendarDays }
const TITULOS = {
  publicadas: 'Propiedades publicadas',
  leads: 'Leads del período',
  conversion: 'Tasa de conversión',
  mercado: 'Días en el mercado',
}

function valorKpi(k: Resumen['kpis'][number]): string {
  if (k.valor === null) return '—'
  if (k.formato === 'porcentaje') return porcentaje(k.valor)
  return entero(k.valor)
}

export default function PanelInicio() {
  const { pedir, perfil } = useSesion()
  // El período elegido se recuerda en este navegador. El panel sólo se pinta
  // en el navegador (espera a la sesión), así que leerlo al iniciar es seguro;
  // sin almacenamiento (modo privado) se usa el de por defecto.
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    try {
      return periodoValido(localStorage.getItem(CLAVE_PERIODO))
    } catch {
      return PERIODO_POR_DEFECTO
    }
  })
  const [intento, setIntento] = useState(0)
  const [datos, setDatos] = useState<RespuestaResumen | null>(null)
  const [error, setError] = useState('')
  // Qué petición contestó por última vez: si no es la que se pide ahora, se está cargando.
  const [contestada, setContestada] = useState('')
  const [actividad, setActividad] = useState<ItemActividad[] | null>(null)
  const turno = useRef(0)
  const peticion = `${periodo}:${intento}`
  const cargando = contestada !== peticion

  function cambiarPeriodo(p: Periodo) {
    setPeriodo(p)
    try { localStorage.setItem(CLAVE_PERIODO, p) } catch { /* sin almacenamiento */ }
  }

  useEffect(() => {
    const mio = ++turno.current
    pedir<RespuestaResumen>(`/api/admin/resumen?periodo=${periodo}`)
      .then((r) => { if (mio === turno.current) { setDatos(r); setError('') } })
      .catch((e) => { if (mio === turno.current) setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen.') })
      .finally(() => { if (mio === turno.current) setContestada(`${periodo}:${intento}`) })
  }, [periodo, pedir, intento])

  useEffect(() => {
    pedir<{ items: ItemActividad[] }>('/api/admin/actividad?limite=8')
      .then((r) => setActividad(r.items))
      .catch(() => setActividad([]))
  }, [pedir])

  const nombre = nombreCorto(perfil.nombre, perfil.email)

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado
        versal="Dashboard"
        titulo={<>¡{saludoPara(new Date())}, <span className="text-[var(--marca)]">{nombre}</span>!</>}
        descripcion="Aquí tienes un resumen del rendimiento de tu sitio inmobiliario."
        frase={FRASES_MARCA.espacios}
        acciones={
          <>
            <Button asChild variant="outline" className="h-10 border-[var(--marca)] px-4 text-[var(--marca)] hover:bg-[var(--marca-tinte)] hover:text-[var(--marca)]">
              <a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden /> Ver sitio web</a>
            </Button>
            <SelectorPeriodo valor={periodo} onCambiar={cambiarPeriodo} />
          </>
        }
      />

      {/* Lo que falta configurar y bloquea algo (publicar, avisar de leads).
          Sale sólo si falta; con ?diagnostico=1 enseña todo. Venía del panel
          anterior y no se podía perder. */}
      <div className="mt-6 empty:hidden"><AvisoConfiguracion /></div>

      {error && !datos && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center" role="alert">
          <AlertTriangle className="size-7 text-[var(--estado-aviso)]" aria-hidden />
          <p className="font-medium">No se pudo cargar el resumen.</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => setIntento((n) => n + 1)}><RefreshCw aria-hidden /> Reintentar</Button>
        </div>
      )}

      {!datos && !error && (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Cargando el resumen">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[132px] animate-pulse rounded-xl border bg-card" />)}
        </div>
      )}

      {datos && (
        // Al cambiar de período se conserva lo anterior, atenuado, en vez de
        // vaciar la pantalla: nada salta mientras llega lo nuevo.
        <div className={cargando ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={cargando}>
          {(datos.faltan.length > 0 || datos.eventosRecortados || error) && (
            <p className="mt-6 flex items-start gap-2 rounded-lg border border-[var(--estado-aviso)]/30 bg-[var(--estado-aviso-fondo)] px-4 py-3 text-sm text-[var(--estado-aviso)]" role="status">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {error && `No se pudo actualizar: ${error}. `}
                {datos.faltan.length > 0 && `No respondieron: ${datos.faltan.join(', ')}. Algunos números pueden estar incompletos. `}
                {datos.eventosRecortados && 'Hay más eventos de los que se pueden leer de una vez: las vistas y búsquedas están recortadas.'}
              </span>
            </p>
          )}

          <div className="mt-6 flex items-center justify-end gap-4 text-xs text-muted-foreground" aria-hidden>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[var(--marca)]" /> este período</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[var(--grafica-anterior)]" /> período anterior</span>
          </div>

          <div className="mt-2 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {datos.kpis.map((k) => (
              <TarjetaKpi
                key={k.clave}
                icono={ICONOS[k.clave]}
                titulo={TITULOS[k.clave]}
                valor={valorKpi(k)}
                variacion={k.variacion}
                nota={k.nota}
                linea={k.linea}
              />
            ))}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-12">
            <div className="lg:col-span-5 [&>section]:h-full"><Interaccion pasos={datos.interaccion} /></div>
            <div className="lg:col-span-7 [&>section]:h-full"><Tendencia datos={datos.tendencia} agrupacion={datos.agrupacion} /></div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-12">
            <div className="lg:col-span-5 [&>section]:h-full"><Distribucion porciones={datos.inventario.porciones} total={datos.inventario.total} /></div>
            <div className="@container lg:col-span-7 [&>section]:h-full">
              <Zonas zonas={datos.zonas} puntos={datos.mapa.puntos} sinCoordenadas={datos.mapa.sinCoordenadas} />
            </div>
          </div>
        </div>
      )}

      <section className="mt-5 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,.04)] sm:p-6">
        <header className="mb-2 flex items-center gap-3">
          <History className="size-6 text-[var(--marca)]" aria-hidden />
          <div className="flex-1">
            <h2 className="font-heading text-[1.02rem] font-semibold">Actividad reciente</h2>
            <p className="text-sm text-muted-foreground">Lo último que pasó en el sitio</p>
          </div>
          <Button asChild variant="ghost" className="text-[var(--marca)] hover:text-[var(--marca)]">
            <Link href="/admin/actividad">Ver todo</Link>
          </Button>
        </header>
        {actividad === null
          ? <div className="h-40 animate-pulse rounded-lg bg-muted" aria-label="Cargando la actividad" />
          : <ActividadReciente items={actividad} />}
      </section>

      <PiePanel />
    </main>
  )
}
