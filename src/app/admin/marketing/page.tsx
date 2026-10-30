'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '@/components/admin/sesion'
import Resultados from '@/components/admin/marketing/Resultados'

/**
 * Panel «Marketing y correos» — PRIMERA VERSIÓN, SOLO LECTURA (F1, 30-oct-2026).
 * Lo que SÍ hace: estado del cupo y de las banderas, conciliación manual con Resend (solo Super Admin), biblioteca de los correos que ya existen con vista previa
 * SINTÉTICA (escritorio, móvil y texto plano), consentimientos agregados y la matriz de eventos.
 * Lo que NO existe todavía (y por eso no hay botones): editor de plantillas, audiencias, borradores, programación, aprobación y campañas.
 */
type Cupo = { hoy: number; tope_dia: number; mes: number; tope_mes: number } | null
type Resumen = {
  banderas: { entorno: string; transaccionalEncendido: boolean; marketingAutorizado: boolean; marketingEncendido: boolean; modoPruebas: boolean }
  cupo: { total: { dia: number; mes: number }; libroProduccion: Cupo; libroPruebas: Cupo; migracionAplicada: boolean; limite: string }
  estadoDeEnvio: { bloqueado: boolean; motivo: string | null; explicacion: string }
  conciliacion: { leido_en: string; resend_dia_usado: number; resend_mes_usado: number; vence_en: string | null; vigente: boolean; periodo: string } | null
  audiencia: { nota: string; avisosDeBusqueda: number | string | null; bajaDePrecio: number | string | null; avisosLegales: number | string | null; promocionesConConsentimiento: number | string | null }
}
type Tipo = { id: string; nombre: string; categoria: string; estado: string; disparador: string }
type Evento = { grupo: string; evento: string; destinatario: string; canal: string; categoria: string; preferencia: string; frecuencia: string; plantilla: string; disparador: string; idempotencia: string; estado: string }
type Catalogo = { tipos: Tipo[]; sinVistaPrevia: Array<{ nombre: string; motivo: string }>; muestras: { nombres: string[]; maxPropiedades: number }; matriz: Evento[] }
type Vista = { asunto: string; html: string; texto: string; remitente: string; responderA: string; categoria: string; enlaces: string[]; imagenes: string[] }

const ESTADO: Record<string, string> = {
  envia_hoy: 'Se envía hoy',
  codigo_apagado: 'Código listo, apagado',
  apagado_por_texto_legal: 'Apagado: falta texto legal aprobado',
  lo_manda_firebase: 'Lo manda Firebase',
  no_existe: 'No existe todavía',
}
const val = (v: number | string | null) => (v === null ? 'sin dato' : String(v))

export default function PanelMarketing() {
  const { pedir, perfil } = useSesion()
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [error, setError] = useState('')
  const [tipo, setTipo] = useState('')
  const [formato, setFormato] = useState<'escritorio' | 'movil' | 'texto'>('escritorio')
  const [vistas, setVistas] = useState<Record<string, Vista>>({})
  const [nombreMuestra, setNombreMuestra] = useState('')
  const [nPropiedades, setNPropiedades] = useState(2)
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
    pedir<Catalogo>('/api/admin/marketing/vista-previa').then((c) => { setCatalogo(c); if (c.tipos[0]) setTipo(c.tipos[0].id) }).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la biblioteca.'))
  }, [pedir])
  // Las vistas ya pedidas se guardan por tipo: cambiar de correo no re-pide y no hay setState síncrono dentro del efecto.
  const llave = `${tipo}|${nombreMuestra}|${nPropiedades}`
  useEffect(() => {
    if (!tipo || vistas[llave]) return
    let vivo = true
    const p = new URLSearchParams({ tipo, propiedades: String(nPropiedades) })
    if (nombreMuestra) p.set('nombre', nombreMuestra)
    pedir<Vista>(`/api/admin/marketing/vista-previa?${p}`).then((v) => { if (vivo) setVistas((previas) => ({ ...previas, [llave]: v })) }).catch(() => undefined)
    return () => { vivo = false }
  }, [tipo, llave, nombreMuestra, nPropiedades, pedir, vistas])
  const vista = vistas[llave] ?? null

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

      <section aria-labelledby="m-biblioteca" className="rounded-xl border bg-card p-5">
        <h2 id="m-biblioteca" className="font-heading text-lg font-semibold">Biblioteca de correos (vista previa sintética)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Cada vista usa la misma plantilla y el mismo remitente que el envío real, pero con datos de ejemplo: ninguna persona, propiedad ni enlace real, y ver una vista previa no envía nada ni lee datos personales. Gmail, Outlook y Apple Mail pueden mostrar algunos estilos de forma distinta; su compatibilidad <strong>no está comprobada</strong>.</p>
        {!catalogo ? <p role="status" className="mt-2 text-sm text-muted-foreground">Cargando…</p> : (
          <div className="mt-3 space-y-3">
            <label className="block text-sm">Correo
              <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {catalogo.tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre} — {t.categoria} — {ESTADO[t.estado] ?? t.estado}</option>)}
              </select>
            </label>
            <p className="text-sm text-muted-foreground">{catalogo.tipos.find((t) => t.id === tipo)?.disparador}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">Nombre de la persona de ejemplo
                <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={nombreMuestra || catalogo.muestras.nombres[0]} onChange={(e) => setNombreMuestra(e.target.value)}>
                  {catalogo.muestras.nombres.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="block text-sm">Propiedades de ejemplo (en los correos que las llevan)
                <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={nPropiedades} onChange={(e) => setNPropiedades(Number(e.target.value))}>
                  {Array.from({ length: catalogo.muestras.maxPropiedades }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <div role="tablist" aria-label="Formato de la vista previa" className="flex gap-2">
              {(['escritorio', 'movil', 'texto'] as const).map((f) => (
                <button key={f} role="tab" type="button" aria-selected={formato === f} onClick={() => setFormato(f)} className={`rounded-md border px-3 py-1.5 text-sm ${formato === f ? 'bg-[var(--rojo)] text-white' : 'bg-background'}`}>{f === 'escritorio' ? 'Escritorio' : f === 'movil' ? 'Móvil' : 'Texto plano'}</button>
              ))}
            </div>
            {!vista ? <p role="status" className="text-sm text-muted-foreground">Cargando vista previa…</p> : (
              <div>
                <p data-etiqueta-sintetica className="mb-2 rounded-lg border border-violet-300 bg-violet-50 p-2 text-sm text-violet-950">Datos y enlaces SINTÉTICOS e INERTES: el enlace de baja, las preferencias y los botones no llevan a ninguna persona ni cuenta real.</p>
                <dl className="mb-2 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
                  <dt className="font-medium">Asunto</dt><dd>{vista.asunto}</dd>
                  <dt className="font-medium">Remitente</dt><dd className="break-all">{vista.remitente}</dd>
                  <dt className="font-medium">Responder a</dt><dd className="break-all">{vista.responderA}</dd>
                  <dt className="font-medium">Categoría</dt><dd>{vista.categoria === 'marketing' ? 'Promocional (requiere consentimiento, con baja y preferencias)' : 'Servicio o seguridad'}</dd>
                </dl>
                {formato === 'texto'
                  ? <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-4 text-sm">{vista.texto}</pre>
                  : <iframe title={`Vista previa ${formato}`} sandbox="" srcDoc={vista.html} style={{ width: formato === 'movil' ? 375 : '100%', maxWidth: '100%', height: 560 }} className="mx-auto block rounded-lg border bg-white" />}
              </div>
            )}
            {vista && (
              <details className="rounded-lg border bg-background p-3 text-sm">
                <summary className="cursor-pointer font-medium">Enlaces e imágenes de este correo ({vista.enlaces.length} enlaces, {vista.imagenes.length} imágenes)</summary>
                <ul className="mt-2 list-disc space-y-1 break-all pl-5">{vista.enlaces.map((e) => <li key={e}>{e}</li>)}</ul>
                <p className="mt-2 text-muted-foreground">{vista.imagenes.length ? `Imágenes: ${vista.imagenes.join(', ')}` : 'Las muestras no llevan fotos de propiedades; el logotipo y los estilos van dentro del HTML.'}</p>
              </details>
            )}
            <div className="rounded-lg border bg-background p-3 text-sm">
              <h3 className="font-semibold">Sin vista previa disponible</h3>
              <ul className="mt-2 space-y-2">{catalogo.sinVistaPrevia.map((s) => <li key={s.nombre}><strong>{s.nombre}.</strong> <span className="text-muted-foreground">{s.motivo}</span></li>)}</ul>
            </div>
          </div>
        )}
      </section>

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

      <section aria-labelledby="m-matriz" className="rounded-xl border bg-card p-5">
        <h2 id="m-matriz" className="font-heading text-lg font-semibold">Matriz de eventos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Catálogo tentativo: no significa que exista cada correo. Las categorías son provisionales hasta la asesoría legal; la campana y el correo son canales independientes.</p>
        {catalogo && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <caption className="sr-only">Eventos de correo y su estado</caption>
              <thead><tr className="border-b">{['Grupo', 'Evento', 'Destinatario', 'Canal', 'Categoría', 'Preferencia', 'Frecuencia', 'Estado'].map((h) => <th key={h} scope="col" className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {catalogo.matriz.map((m) => (
                  <tr key={m.grupo + m.evento} className="border-b align-top">
                    <td className="px-2 py-2">{m.grupo}</td><td className="px-2 py-2">{m.evento}</td><td className="px-2 py-2">{m.destinatario}</td><td className="px-2 py-2">{m.canal}</td>
                    <td className="px-2 py-2">{m.categoria}</td><td className="px-2 py-2">{m.preferencia}</td><td className="px-2 py-2">{m.frecuencia}</td><td className="px-2 py-2 font-medium">{ESTADO[m.estado] ?? m.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
