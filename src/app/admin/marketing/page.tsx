'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '@/components/admin/sesion'
import Resultados from '@/components/admin/marketing/Resultados'
import BibliotecaCorreos, { type CatalogoBiblioteca } from '@/components/admin/marketing/BibliotecaCorreos'
import MatrizDeEventos from '@/components/admin/marketing/MatrizDeEventos'

/**
 * Panel «Marketing y correos» — PRIMERA VERSIÓN, SOLO LECTURA (F1, 30-oct-2026).
 * Lo que SÍ hace: estado del cupo y de las banderas, conciliación manual con Resend (solo Super Admin), biblioteca de los correos que ya existen con vista previa
 * SINTÉTICA (escritorio, móvil y texto plano), consentimientos agregados y la matriz de eventos.
 * Lo que NO existe todavía (y por eso no hay botones): editor de plantillas, audiencias, borradores, programación, aprobación y campañas.
 */
type Cupo = { hoy: number; tope_dia: number; mes: number; tope_mes: number } | null
type Resumen = {
  banderas: { entorno: string; envioEncendido?: boolean; transaccionalEncendido: boolean; marketingAutorizado: boolean; marketingEncendido: boolean; modoPruebas: boolean }
  cupo: { total: { dia: number; mes: number }; libroProduccion: Cupo; libroPruebas: Cupo; migracionAplicada: boolean; limite: string }
  estadoDeEnvio: { bloqueado: boolean; motivo: string | null; explicacion: string }
  conciliacion: { leido_en: string; resend_dia_usado: number; resend_mes_usado: number; vence_en: string | null; vigente: boolean; periodo: string } | null
  audiencia: { nota: string; avisosDeBusqueda: number | string | null; bajaDePrecio: number | string | null; avisosLegales: number | string | null; promocionesConConsentimiento: number | string | null }
}
type Tipo = { id: string; nombre: string; categoria: string; estado: string; disparador: string }
type Evento = { grupo: string; evento: string; destinatario: string; canal: string; categoria: string; preferencia: string; frecuencia: string; plantilla: string; disparador: string; idempotencia: string; estado: string }
type Catalogo = CatalogoBiblioteca & { tipos: Tipo[]; matriz: Evento[] }

const val = (v: number | string | null) => (v === null ? 'sin dato' : String(v))

export default function PanelMarketing() {
  const { pedir, perfil } = useSesion()
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [error, setError] = useState('')
  const [dia, setDia] = useState('')
  const [mes, setMes] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(() => {
    pedir<Resumen>('/api/admin/marketing/resumen').then(setResumen).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen.'))
  }, [pedir])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    pedir<Catalogo>('/api/admin/marketing/vista-previa').then(setCatalogo).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la biblioteca.'))
  }, [pedir])

  async function conciliar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setAviso('')
    try {
      await pedir('/api/admin/marketing/conciliacion', { method: 'POST', body: JSON.stringify({ dia: Number(dia), mes: Number(mes), nota }) })
      setAviso('Lectura guardada.')
      setDia(''); setMes(''); setNota('')
      cargar()
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo guardar.')
    }
    setGuardando(false)
  }

  const prod = resumen?.cupo.libroProduccion
  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-8 px-4 py-8">
      <header>
        <h1 className="font-heading text-2xl font-bold">Marketing · Correos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo lectura: estado del envío, resultados, vista previa de los correos que ya existen y consentimientos. El editor de plantillas, las audiencias, la programación, la aprobación y las campañas <strong>todavía no existen</strong>; no hay ningún botón para enviar.
        </p>
      </header>
      {error && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}

      <section aria-labelledby="m-estado" className="rounded-xl border bg-card p-5">
        <h2 id="m-estado" className="font-heading text-lg font-semibold">Estado y cupo de Resend</h2>
        {!resumen ? <p role="status" className="mt-2 text-sm text-muted-foreground">Cargando…</p> : (
          <div className="mt-3 space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>Entorno de este despliegue: <strong>{resumen.banderas.entorno === 'produccion' ? 'producción' : 'pruebas (no envía correo real)'}</strong>.</li>
              <li>Compuerta de envío (todos los correos): <strong>{resumen.banderas.envioEncendido ? 'encendida' : 'apagada (no sale ningún correo)'}</strong>.</li>
              <li>Correos transaccionales nuevos: <strong>{resumen.banderas.transaccionalEncendido ? 'encendidos' : 'apagados'}</strong>. Promociones: <strong>{resumen.banderas.marketingAutorizado ? 'autorizadas' : 'apagadas (falta texto legal aprobado)'}</strong>. Modo de pruebas: <strong>{resumen.banderas.modoPruebas ? 'activo (todo va a informes@)' : 'apagado'}</strong>.</li>
              <li>Tope de VIVE BIEN: {resumen.cupo.total.dia} al día y {resumen.cupo.total.mes} por ciclo (el plan gratuito permite 100 y 3,000).</li>
              <li>
                Libro de envíos de la rebanada de producción ({resumen.banderas.entorno === 'produccion' ? 'esta base es la de producción' : 'esta base es de pruebas/staging, no la de producción'}):{' '}
                {resumen.cupo.migracionAplicada && prod ? <strong>{prod.hoy} de {prod.tope_dia} hoy · {prod.mes} de {prod.tope_mes} en el ciclo</strong> : <strong>sin datos: la migración del libro de correo aún no está aplicada en esta base</strong>}.
              </li>
            </ul>
            <p role="status" data-estado-envio={resumen.estadoDeEnvio.bloqueado ? 'bloqueado' : 'permitido'} className={`rounded-lg border p-3 font-medium ${resumen.estadoDeEnvio.bloqueado ? 'border-amber-300 bg-amber-50 text-amber-950' : 'bg-background'}`}>
              Envío de correo: {resumen.estadoDeEnvio.bloqueado ? 'BLOQUEADO' : 'permitido'}. {resumen.estadoDeEnvio.explicacion}
            </p>
            <p role="note" className="rounded-lg border bg-background p-3">{resumen.cupo.limite}</p>
            <p>
              Última lectura del panel de Resend:{' '}
              {resumen.conciliacion ? <strong>{new Date(resumen.conciliacion.leido_en).toLocaleString('es-MX')} — {resumen.conciliacion.resend_dia_usado} hoy, {resumen.conciliacion.resend_mes_usado} en el ciclo ({resumen.conciliacion.periodo}). {resumen.conciliacion.vigente ? `Vigente hasta ${resumen.conciliacion.vence_en ? new Date(resumen.conciliacion.vence_en).toLocaleString('es-MX') : '—'}.` : 'CADUCADA: ya no habilita envíos.'}</strong> : <strong>ninguna (sin una lectura de los últimos 8 días no sale ningún correo en producción)</strong>}.
            </p>
            <p className="text-muted-foreground">Cada correo real que sale con éxito puede refrescar esta lectura solo (con las cabeceras de cuota que devuelve Resend), pero no hay una lectura diaria: si pasan días sin envíos, o aparece «CADUCADA», regístrala aquí a mano.</p>
            {perfil.superAdmin ? (
              <form onSubmit={conciliar} className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]" aria-label="Registrar lectura de Resend">
                <label className="text-sm">Enviados hoy (panel de Resend)<input required inputMode="numeric" className="mt-1 w-full rounded-md border px-3 py-2" value={dia} onChange={(e) => setDia(e.target.value)} /></label>
                <label className="text-sm">Enviados en el ciclo<input required inputMode="numeric" className="mt-1 w-full rounded-md border px-3 py-2" value={mes} onChange={(e) => setMes(e.target.value)} /></label>
                <label className="text-sm">Nota (opcional)<input maxLength={300} className="mt-1 w-full rounded-md border px-3 py-2" value={nota} onChange={(e) => setNota(e.target.value)} /></label>
                <button type="submit" disabled={guardando} className="self-end rounded-md bg-[var(--rojo)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Guardar lectura</button>
                {aviso && <p role="status" className="text-sm sm:col-span-4">{aviso}</p>}
              </form>
            ) : <p className="text-muted-foreground">Registrar una lectura de Resend es solo del Super Admin.</p>}
          </div>
        )}
      </section>

      <Resultados entorno={resumen?.banderas.entorno ?? null} />

      {catalogo ? <BibliotecaCorreos catalogo={catalogo} /> : <section aria-labelledby="m-biblioteca" className="rounded-xl border bg-card p-5"><h2 id="m-biblioteca" className="font-heading text-lg font-semibold">Biblioteca de correos</h2><p role="status" className="mt-2 text-sm text-muted-foreground">Cargando…</p></section>}

      <section aria-labelledby="m-audiencia" className="rounded-xl border bg-card p-5">
        <h2 id="m-audiencia" className="font-heading text-lg font-semibold">Consentimientos (solo agregados)</h2>
        {!resumen ? <p role="status" className="mt-2 text-sm text-muted-foreground">Cargando…</p> : (
          <div className="mt-2 text-sm">
            <p className="text-muted-foreground">{resumen.audiencia.nota} Los grupos de menos de 5 personas se muestran como «&lt;5».</p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div><dt className="font-medium">Avisos de búsquedas guardadas</dt><dd>{val(resumen.audiencia.avisosDeBusqueda)}</dd></div>
              <div><dt className="font-medium">Avisos de baja de precio</dt><dd>{val(resumen.audiencia.bajaDePrecio)}</dd></div>
              <div><dt className="font-medium">Avisos legales por correo</dt><dd>{val(resumen.audiencia.avisosLegales)}</dd></div>
              <div><dt className="font-medium">Promociones con consentimiento vigente</dt><dd>{val(resumen.audiencia.promocionesConConsentimiento)}</dd></div>
            </dl>
          </div>
        )}
      </section>

      <MatrizDeEventos matriz={catalogo?.matriz ?? null} />
    </main>
  )
}
